'use strict';
// Modul clean-tasks (#882): Aufgabenarten Raum, Zone, Spot, Go-To.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus } = require('./attrappe.js');
const { fixture } = require('./kartendaten.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const raeume = () => fixture('voll').states['camera.robo_map'].attributes.rooms;

/** Modell aus der Fixture voll, Saugerattribute und Kamera-Attribute überschreibbar. */
function modell({ vacuum = {}, camera = {}, caps } = {}) {
  const u = neueUmgebung(), haus = hausAus('voll');
  const { VacuumModel } = u.registry.get('busch-vacuum-card').__internals;
  const v = haus.states['vacuum.robo'], c = haus.states['camera.robo_map'];
  const attrs = Object.assign({}, v.attributes, vacuum);
  if (caps) attrs.capabilities = caps(attrs.capabilities);
  haus.states = Object.assign({}, haus.states, {
    'vacuum.robo': Object.assign({}, v, { attributes: attrs }),
    'camera.robo_map': Object.assign({}, c, { attributes: Object.assign({}, c.attributes, camera) }),
  });
  return new VacuumModel(haus.hass(), 'vacuum.robo');
}
const intern = () => neueUmgebung().registry.get('busch-vacuum-card').__internals;
const leer = () => ({ rooms: [], zones: [], spots: [], goto: null });
const auswahl = (teil) => Object.assign(leer(), teil);

// ── Task 1: Payload und Vorabprüfungen ─────────────────────────────────────
test('taskPayload Raum ohne Customized Cleaning: Räume in Wahlreihenfolge, repeats als Zahl', () => {
  const { taskPayload } = intern();
  const p = taskPayload(modell({ vacuum: { customized_cleaning: false } }), 'room', auswahl({ rooms: [5, 3, 9] }), 2);
  assert.deepEqual(roh(p), { domain: 'dreame_vacuum', service: 'vacuum_clean_segment', data: { segments: [5, 3, 9], repeats: 2 } });
});

test('taskPayload Raum mit Customized Cleaning: Listen aus den Raumwerten in Wahlreihenfolge', () => {
  const { taskPayload } = intern();
  const p = taskPayload(modell({ vacuum: { customized_cleaning: true } }), 'room', auswahl({ rooms: [5, 1] }), 3);
  const r = raeume();
  assert.deepEqual(roh(p.data), {
    segments: [5, 1],
    repeats: [r['5'].cleaning_times, r['1'].cleaning_times],
    suction_level: [r['5'].suction_level, r['1'].suction_level],
    water_volume: [r['5'].water_volume, r['1'].water_volume],
  }, 'Wiederholungen-Regler gilt hier nicht');
});

test('taskPayload Zone: ganzzahlig, min/max je Achse sortiert, repeats je Zone', () => {
  const { taskPayload } = intern();
  const zones = [{ x0: 1000.4, y0: 900.6, x1: -200.2, y1: 2500 }, { x0: 0, y0: 0, x1: 800, y1: 800 }];
  const p = taskPayload(modell(), 'zone', auswahl({ zones }), 2);
  assert.deepEqual(roh(p), { domain: 'dreame_vacuum', service: 'vacuum_clean_zone', data: { zone: [[-200, 901, 1000, 2500], [0, 0, 800, 800]], repeats: [2, 2] } });
});

test('taskPayload Spot und Go-To', () => {
  const { taskPayload } = intern();
  const spot = taskPayload(modell(), 'spot', auswahl({ spots: [{ x: 10.6, y: -20.2 }, { x: 300, y: 400 }] }), 1);
  assert.deepEqual(roh(spot), { domain: 'dreame_vacuum', service: 'vacuum_clean_spot', data: { points: [[11, -20], [300, 400]], repeats: [1, 1] } });
  const ziel = taskPayload(modell(), 'goto', auswahl({ goto: { x: 1234.5, y: -99.4 } }), 3);
  assert.deepEqual(roh(ziel), { domain: 'dreame_vacuum', service: 'vacuum_goto', data: { x: 1235, y: -99 } });
  assert.deepEqual(roh(taskPayload(modell(), 'all', leer(), 1)), { domain: 'vacuum', service: 'start', data: {} });
});

/** Kartenstellvertreter: passable nach Funktion, Raster 50 mm. */
const karte = (passable = () => true, grid = 50) => ({ passable, grid });

test('taskReady: leere Auswahl je Art gesperrt mit Grund; Gesamt immer bereit', () => {
  const { taskReady } = intern();
  const m = modell();
  assert.deepEqual(roh(taskReady(m, 'all', leer(), karte())), { ok: true, reason: null });
  for (const art of ['room', 'zone', 'spot', 'goto']) {
    const r = taskReady(m, art, leer(), karte());
    assert.equal(r.ok, false, art);
    assert.ok(r.reason, art + ' mit Grund');
  }
});

test('taskReady: Ablassen und Selbstreparatur sperren alle vier Kartenarten (device.py#L4771 ff.)', () => {
  const { taskReady } = intern();
  for (const zustand of [{ draining: true }, { self_repairing: true }]) {
    const m = modell({ vacuum: zustand });
    assert.equal(taskReady(m, 'room', auswahl({ rooms: [1] }), karte()).reason, 'sperreAblassenAufgabe');
    assert.equal(taskReady(m, 'goto', auswahl({ goto: { x: 0, y: 0 } }), karte()).ok, false);
  }
});

test('taskReady Raum: ohne gespeicherte Karte gesperrt (unavailable_on_current_map)', () => {
  const { taskReady } = intern();
  assert.equal(taskReady(modell({ vacuum: { has_saved_map: false } }), 'room', auswahl({ rooms: [1] }), karte()).reason, 'raumOhneKarte');
  assert.equal(taskReady(modell(), 'room', auswahl({ rooms: [1] }), karte()).ok, true);
});

test('taskReady Zone: kleiner als 2 × grid_size gesperrt; alle neun Stichpunkte unbegehbar gesperrt', () => {
  const { taskReady } = intern();
  const m = modell();
  assert.equal(taskReady(m, 'zone', auswahl({ zones: [{ x0: 0, y0: 0, x1: 100, y1: 900 }] }), karte()).reason, 'zoneZuKlein', 'genau 2 × 50 reicht nicht (h <= 1.0)');
  assert.equal(taskReady(m, 'zone', auswahl({ zones: [{ x0: 0, y0: 0, x1: 300, y1: 300 }] }), karte(() => true, 200)).reason, 'zoneZuKlein', 'grid_size aus den Kartendaten');
  assert.equal(taskReady(m, 'zone', auswahl({ zones: [{ x0: 0, y0: 0, x1: 101, y1: 101 }] }), karte()).ok, true);
  const proben = [];
  const fast = karte((p) => { proben.push(p); return proben.length === 9; });
  assert.equal(taskReady(m, 'zone', auswahl({ zones: [{ x0: 0, y0: 0, x1: 1000, y1: 1000 }] }), fast).ok, true, 'ein begehbarer Stichpunkt reicht');
  assert.equal(proben.length, 9);
  assert.equal(taskReady(m, 'zone', auswahl({ zones: [{ x0: 0, y0: 0, x1: 1000, y1: 1000 }] }), karte(() => false)).reason, 'zoneAusserhalb');
  assert.equal(taskReady(m, 'zone', auswahl({ zones: [{ x0: 0, y0: 0, x1: 1000, y1: 1000 }] }), karte(() => null)).ok, true, 'Bildmodus: unbekannt → erlaubt');
});

test('taskReady Spot/Go-To: passable false gesperrt, null erlaubt', () => {
  const { taskReady } = intern();
  const m = modell();
  assert.equal(taskReady(m, 'spot', auswahl({ spots: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }), karte((p) => p.x === 0)).reason, 'punktAusserhalb');
  assert.equal(taskReady(m, 'spot', auswahl({ spots: [{ x: 0, y: 0 }] }), karte(() => null)).ok, true);
  assert.equal(taskReady(m, 'goto', auswahl({ goto: { x: 9000, y: 9000 } }), karte(() => false)).reason, 'punktAusserhalb');
  assert.equal(taskReady(m, 'goto', auswahl({ goto: { x: 9000, y: 9000 } }), karte(() => null)).ok, true);
});

test('taskReady Go-To am Roboter: nur simuliert (ohne cruising) gesperrt (already_at_coordinate)', () => {
  const { taskReady } = intern();
  const roboter = fixture('voll').states['camera.robo_map'].attributes.vacuum_position;
  const nah = auswahl({ goto: { x: roboter.x + 60, y: roboter.y - 90 } });
  const simuliert = modell({ caps: (c) => c.filter((x) => x !== 'cruising') });
  assert.equal(taskReady(simuliert, 'goto', nah, karte()).reason, 'gotoAmRoboter');
  assert.equal(taskReady(simuliert, 'goto', auswahl({ goto: { x: roboter.x + 400, y: roboter.y } }), karte()).ok, true);
  assert.equal(taskReady(modell(), 'goto', nah, karte()).ok, true, 'nativ (cruising): keine Sperre');
});

// ── Task 2: Start, Sperre und Ende ─────────────────────────────────────────
const { neueKarte, mikro } = require('./attrappe.js');
const { ausFixture } = require('./kartendaten.js');
const CAM = 'camera.robo_map';
const $ = (karte, sel) => karte.shadowRoot.querySelector(sel);
const $$ = (karte, sel) => karte.shadowRoot.querySelectorAll(sel);
const knopf = (karte, aktion) => $$(karte, '.ctl').find((b) => b.getAttribute('data-action') === aktion) || null;
const art = (karte, name) => $$(karte, '.task').find((b) => b.getAttribute('data-task') === name);
const gewaehlt = (karte) => $$(karte, '.task').filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.getAttribute('data-task'));
const ersetze = (haus, id, attribute, zustand) => {
  const alt = haus.states[id];
  return { [id]: Object.assign({}, alt, { state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) }) };
};
const saugerNeu = (haus, attribute, zustand) => ersetze(haus, 'vacuum.robo', attribute, zustand);

/** Karte mit Kartendaten (Datenmodus, fetch wie im Browser) und handygroßer Bühne. */
async function kartenKarte({ config = {}, fixture: name = 'voll', vacuum, zustand, extra = {}, daten = true } = {}) {
  const u = neueUmgebung();
  const erzeuge = u.document.createElement.bind(u.document);
  u.document.createElement = (tag) => {
    const n = erzeuge(tag);
    if (tag === 'img') { n.naturalWidth = 1444; n.naturalHeight = 1444; n.decode = () => Promise.resolve(); }
    return n;
  };
  const karten = ausFixture(name, { frame_id: 1180 });
  if (daten) u.kontext.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(Object.assign({}, karten, { _zellen: undefined }))) });
  const haus = hausAus(name);
  if (vacuum || zustand) haus.states = Object.assign({}, haus.states, saugerNeu(haus, vacuum || {}, zustand));
  haus.states = Object.assign({}, haus.states, extra);
  const karte = neueKarte(u, haus, config);
  if (karte._map) karte._map.stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 });
  await mikro(); await mikro();
  return { u, haus, karte, karten };
}
/** Auswahl direkt setzen (die Wege über Karte/Chips prüfen die späteren Tasks). */
const waehle = (karte, art, teil) => { karte._task = art; Object.assign(karte._selection, teil); karte._update(); };

test('Start je Art: genau ein Dienst mit entity_id; Gesamt weiter vacuum.start', async () => {
  const faelle = [
    ['room', { rooms: [3, 5] }, 'vacuum_clean_segment', { segments: [3, 5], repeats: 1 }],
    ['zone', { zones: [{ x0: -3000, y0: -3000, x1: -2000, y1: -2000 }] }, 'vacuum_clean_zone', { zone: [[-3000, -3000, -2000, -2000]], repeats: [1] }],
    ['spot', { spots: [{ x: -3461, y: -2902 }] }, 'vacuum_clean_spot', { points: [[-3461, -2902]], repeats: [1] }],
  ];
  for (const [name, teil, dienst, daten] of faelle) {
    const { haus, karte } = await kartenKarte();
    waehle(karte, name, teil);
    knopf(karte, 'start').click();
    assert.deepEqual(roh(haus.rufe), [{ domain: 'dreame_vacuum', service: dienst, data: Object.assign({ entity_id: 'vacuum.robo' }, daten) }], name);
  }
  const { haus, karte } = await kartenKarte();
  knopf(karte, 'start').click();
  assert.deepEqual(roh(haus.rufe), [{ domain: 'vacuum', service: 'start', data: { entity_id: 'vacuum.robo' } }]);
});

test('Doppeltipp auf Start = ein Aufruf (R11)', async () => {
  const { haus, karte } = await kartenKarte();
  waehle(karte, 'room', { rooms: [3] });
  const start = knopf(karte, 'start');
  start.click(); start.click();
  assert.equal(haus.rufe.length, 1);
});

test('Dienstfehler → R12-Text mit Grund, Auswahl bleibt, erneuter Start möglich', async () => {
  const { haus, karte } = await kartenKarte();
  haus.antwort = () => Promise.reject(new Error('Coordinate outside map'));
  waehle(karte, 'spot', { spots: [{ x: -3461, y: -2902 }] });
  knopf(karte, 'start').click();
  await mikro();
  const fehler = $(karte, '.task-error');
  assert.ok(fehler, 'Fehlertext sichtbar');
  assert.equal(fehler.getAttribute('role'), 'alert');
  assert.match(fehler.textContent, /Coordinate outside map/);
  assert.match(fehler.textContent, /Auswahl bleibt/);
  assert.equal(karte._selection.spots.length, 1);
  assert.deepEqual(gewaehlt(karte), ['spot']);
  assert.equal(knopf(karte, 'start').disabled, false);
});

test('Go-To: keine Aktionsknöpfe, Shortcut-/Stationsknopf bleiben (CORE-08)', async () => {
  const { karte } = await kartenKarte({ zustand: 'idle' });
  art(karte, 'goto').click();
  assert.equal(knopf(karte, 'start'), null);
  assert.equal(knopf(karte, 'return'), null);
  assert.ok($(karte, '[data-action="dock"]'), 'Station bleibt');
  art(karte, 'all').click();
  assert.ok(knopf(karte, 'start') && knopf(karte, 'return'));
});

/** Verlaufssensor mit einem Eintrag `vor` Sekunden nach dem Start. */
const verlauf = (haus, eintrag) => ersetze(haus, 'sensor.robo_cleaning_history', Object.assign({}, haus.states['sensor.robo_cleaning_history'].attributes, { 'neu': eintrag }));

test('Natürliches Ende (Verlauf completed nach Start) → Gesamt, Auswahl leer', async () => {
  const { u, haus, karte } = await kartenKarte();
  waehle(karte, 'room', { rooms: [3] });
  knopf(karte, 'start').click();
  const start = u.uhr.jetzt / 1000;
  karte.hass = haus.setze(saugerNeu(haus, { started: true, segment_cleaning: true }, 'cleaning'));
  karte.hass = haus.setze(saugerNeu(haus, { started: false, segment_cleaning: false }, 'returning'));
  assert.deepEqual(gewaehlt(karte), ['room'], 'bis der Verlauf kommt, bleibt der Typ');
  karte.hass = haus.setze(verlauf(haus, { completed: true, timestamp: start + 2 }));
  assert.deepEqual(gewaehlt(karte), ['all']);
  assert.deepEqual(roh(karte._selection), { rooms: [], zones: [], spots: [], goto: null });
});

test('Verlauf ohne completed (abgebrochen) → bleibt', async () => {
  const { u, haus, karte } = await kartenKarte();
  waehle(karte, 'room', { rooms: [3] });
  knopf(karte, 'start').click();
  karte.hass = haus.setze(saugerNeu(haus, { started: true }, 'cleaning'));
  karte.hass = haus.setze(saugerNeu(haus, { started: false }, 'docked'));
  karte.hass = haus.setze(verlauf(haus, { completed: false, timestamp: u.uhr.jetzt / 1000 + 1 }));
  assert.deepEqual(gewaehlt(karte), ['room']);
  assert.deepEqual(roh(karte._selection.rooms), [3]);
});

test('Eigenes Stopp → Typ und Auswahl bleiben, auch bei completed im Verlauf', async () => {
  const { u, haus, karte } = await kartenKarte();
  waehle(karte, 'room', { rooms: [3] });
  knopf(karte, 'start').click();
  karte.hass = haus.setze(saugerNeu(haus, { started: true }, 'cleaning'));
  knopf(karte, 'stop').click();
  karte.hass = haus.setze(saugerNeu(haus, { started: false }, 'idle'));
  karte.hass = haus.setze(verlauf(haus, { completed: true, timestamp: u.uhr.jetzt / 1000 }));
  assert.deepEqual(gewaehlt(karte), ['room']);
  assert.deepEqual(roh(karte._selection.rooms), [3]);
});

test('Laden mitten in der Aufgabe (started bleibt wahr) ist kein Ende; started beim Laden auch nicht', async () => {
  const { haus, karte } = await kartenKarte();
  waehle(karte, 'room', { rooms: [3] });
  knopf(karte, 'start').click();
  karte.hass = haus.setze(saugerNeu(haus, { started: true }, 'cleaning'));
  karte.hass = haus.setze(saugerNeu(haus, { started: true }, 'docked'));
  assert.ok(karte._run, 'Lauf noch offen');
  const geladen = await kartenKarte({ vacuum: { started: true }, zustand: 'cleaning' });
  geladen.karte._task = 'zone';
  geladen.karte.hass = geladen.haus.setze(saugerNeu(geladen.haus, { started: false }, 'docked'));
  assert.deepEqual(gewaehlt(geladen.karte), ['zone'], 'nicht selbst gestartet: kein Rücksetzen');
});

test('Ohne Verlaufssensor: Ende ohne eigenes Stopp setzt zurück', async () => {
  const { haus, karte } = await kartenKarte();
  const { 'sensor.robo_cleaning_history': _weg, ...ohne } = haus.states;
  haus.states = ohne;
  const { 'sensor.robo_cleaning_history': _e, ...entities } = haus.entities;
  haus.entities = entities;
  karte.hass = haus.hass();
  waehle(karte, 'spot', { spots: [{ x: -3461, y: -2902 }] });
  knopf(karte, 'start').click();
  karte.hass = haus.setze(saugerNeu(haus, { started: true }, 'cleaning'));
  karte.hass = haus.setze(saugerNeu(haus, { started: false }, 'docked'));
  assert.deepEqual(gewaehlt(karte), ['all']);
});

test('Laufende Aufgabe: Wahl gesperrt, Karte zeigt active_* statt Auswahl; Shortcut-Knopf bedienbar (TASK-07)', async () => {
  const aktiv = { active_areas: [{ x0: -3000, y0: -3000, x1: -2000, y1: -3000, x2: -2000, y2: -2000, x3: -3000, y3: -2000, angle: null }],
    active_points: [{ x: -3461, y: -2902 }], active_segments: [3, 5], active_cruise_points: { 1: { x: 100, y: 200, type: 0, completed: false } } };
  const { haus, karte } = await kartenKarte({
    config: { scripts: ['script.putzen'] }, vacuum: { started: true, zone_cleaning: true }, zustand: 'cleaning',
    extra: { 'script.putzen': { entity_id: 'script.putzen', state: 'off', attributes: { friendly_name: 'Putzen' } } },
  });
  karte._selection.spots.push({ x: 1, y: 1 });
  karte.hass = haus.setze(ersetze(haus, CAM, aktiv));
  for (const b of $$(karte, '.task')) assert.equal(b.disabled, true);
  const ebene = karte._map.svg.querySelector('[data-layer="tasks"]');
  assert.ok(ebene, 'Ebene tasks auch während der Aufgabe');
  const art = (k) => ebene.querySelectorAll('[data-active="' + k + '"]').length;
  assert.equal(art('area'), 1);
  assert.equal(art('point'), 1);
  assert.equal(art('segment'), 2);
  assert.equal(art('cruise'), 1);
  assert.equal(ebene.querySelectorAll('[data-select]').length, 0, 'lokale Auswahl nicht gezeigt');
  const shortcut = knopf(karte, 'shortcuts');
  assert.ok(shortcut && !shortcut.disabled, 'Shortcut-Knopf nicht gesperrt');
});

test('runningTask erkennt Go-To an task_status cruising_point', async () => {
  const { karte } = await kartenKarte({ vacuum: { started: true, task_status: 'cruising_point' }, zustand: 'cleaning' });
  assert.deepEqual(gewaehlt(karte), ['goto']);
});

// ── Task 3: Raum ───────────────────────────────────────────────────────────
const ev = (u, typ, init) => u.neuesEreignis(typ, Object.assign({ pointerType: 'mouse', pointerId: 1 }, init));
const zeiger = (u, karte, typ, x, y, id = 1) => karte._map.stage.dispatchEvent(ev(u, typ, { clientX: x, clientY: y, pointerId: id }));
const tippe = (u, karte, client) => { zeiger(u, karte, 'pointerdown', client.x, client.y); zeiger(u, karte, 'pointerup', client.x, client.y); u.uhr.vor(400); };
const bildschirm = (karte, robot) => karte._map.toScreen(karte._map.toImage(robot));
const chip = (karte, id) => $$(karte, '.room-chip').find((b) => b.getAttribute('data-room') === String(id));
const klick = (u, node, init = {}) => node.dispatchEvent(u.neuesEreignis('click', init));
const aktion = (karte, name) => karte._taskArea.querySelector('[data-action="' + name + '"]');
const notiz = (karte, name) => karte._taskArea.querySelector('[data-note="' + name + '"]');
const ebeneTasks = (karte) => karte._map.svg.querySelector('[data-layer="tasks"]');

test('Raum: Fläche und Chip schalten über dasselbe Ereignis um (R08)', async () => {
  const { u, karte } = await kartenKarte();
  art(karte, 'room').click();
  assert.equal(karte._map._mode, 'pick-room');
  const liste = [];
  karte._map.el.addEventListener('map-room-tap', (e) => liste.push(e.detail.source));
  tippe(u, karte, bildschirm(karte, raeume()['5']));
  chip(karte, 3).click();
  assert.deepEqual(liste, ['map', 'chip']);
  assert.deepEqual(roh(karte._selection.rooms), [5, 3]);
  assert.equal(chip(karte, 5).getAttribute('aria-pressed'), 'true');
  tippe(u, karte, bildschirm(karte, raeume()['5']));
  assert.deepEqual(roh(karte._selection.rooms), [3], 'zweiter Tipp wählt ab');
  assert.equal(chip(karte, 5).getAttribute('aria-pressed'), 'false');
  const marken = ebeneTasks(karte).querySelectorAll('[data-select="room"]');
  assert.deepEqual(marken.map((m) => m.getAttribute('data-room')), ['3'], 'Auswahl auf der Karte mit Form (R17)');
});

test('Raum: nur sichtbare Räume als Chip und wählbar', async () => {
  const { u, haus, karte } = await kartenKarte();
  const rooms = Object.assign({}, haus.states[CAM].attributes.rooms);
  rooms['9'] = Object.assign({}, rooms['9'], { visibility: 'Hidden' });
  karte.hass = haus.setze(ersetze(haus, CAM, { rooms }));
  art(karte, 'room').click();
  assert.equal(chip(karte, 9), undefined);
  tippe(u, karte, bildschirm(karte, raeume()['9']));
  assert.deepEqual(roh(karte._selection.rooms), []);
  aktion(karte, 'rooms-all').click();
  assert.ok(!karte._selection.rooms.includes(9), '„Alle wählen“ ohne versteckte');
});

test('Raum: Badges = gespeicherte Reinigungsreihenfolge mit Hinweis (customized_cleaning, X40)', async () => {
  const { karte } = await kartenKarte();
  art(karte, 'room').click();
  chip(karte, 1).click(); chip(karte, 3).click(); chip(karte, 5).click();
  // cleaning_sequence [3, 5, 7, 1, …] → 3:1, 5:2, 1:3
  assert.equal(chip(karte, 3).querySelector('.room-order').textContent, '1');
  assert.equal(chip(karte, 5).querySelector('.room-order').textContent, '2');
  assert.equal(chip(karte, 1).querySelector('.room-order').textContent, '3');
  assert.match(notiz(karte, 'order').textContent, /Reinigungsreihenfolge/);
});

test('Raum: Badges = Tipp-Reihenfolge auf Geräten ohne customized_cleaning', async () => {
  const { haus, karte } = await kartenKarte();
  const caps = haus.states['vacuum.robo'].attributes.capabilities.filter((c) => c !== 'customized_cleaning');
  karte.hass = haus.setze(saugerNeu(haus, { capabilities: caps }));
  art(karte, 'room').click();
  chip(karte, 1).click(); chip(karte, 3).click();
  assert.equal(chip(karte, 1).querySelector('.room-order').textContent, '1');
  assert.equal(chip(karte, 3).querySelector('.room-order').textContent, '2');
  assert.equal(notiz(karte, 'order'), null);
  knopf(karte, 'start').click();
  assert.deepEqual(roh(haus.rufe[0].data.segments), [1, 3]);
});

test('Raum: Anzahl sichtbar, „Alle wählen“, „Auswahl leeren“ mit 5 s Rückgängig (R02/R13)', async () => {
  const { u, karte } = await kartenKarte();
  art(karte, 'room').click();
  assert.equal(aktion(karte, 'rooms-clear').disabled, true);
  aktion(karte, 'rooms-all').click();
  assert.equal(karte._selection.rooms.length, 7);
  assert.match(notiz(karte, 'count').textContent, /7 Räume gewählt/);
  aktion(karte, 'rooms-clear').click();
  assert.deepEqual(roh(karte._selection.rooms), []);
  aktion(karte, 'undo').click();
  assert.equal(karte._selection.rooms.length, 7, 'Rückgängig stellt her');
  aktion(karte, 'rooms-clear').click();
  u.uhr.vor(5000);
  assert.equal(aktion(karte, 'undo'), null, 'nach 5 s weg');
});

test('Raum: Strg-Klick schaltet, Umschalt-Klick wählt den Bereich bis zum letzten Chip (R02)', async () => {
  const { u, karte } = await kartenKarte();
  art(karte, 'room').click();
  const ids = $$(karte, '.room-chip').map((b) => Number(b.getAttribute('data-room')));
  klick(u, chip(karte, ids[1]), { ctrlKey: true });
  klick(u, chip(karte, ids[4]), { shiftKey: true });
  assert.deepEqual(roh(karte._selection.rooms), ids.slice(1, 5));
});

test('Raum: gesperrte Karte — Flächentipp wirkungslos, Chips bedienbar', async () => {
  const { u, karte } = await kartenKarte();
  art(karte, 'room').click();
  karte._toggleLock();
  tippe(u, karte, bildschirm(karte, raeume()['5']));
  assert.deepEqual(roh(karte._selection.rooms), []);
  chip(karte, 5).click();
  assert.deepEqual(roh(karte._selection.rooms), [5]);
});

test('Raum: Kamera nicht verfügbar → Chips aus vacuum.rooms (R18)', async () => {
  const { haus, karte } = await kartenKarte();
  karte.hass = haus.setze(ersetze(haus, CAM, {}, 'unavailable'));
  art(karte, 'room').click();
  const chips = $$(karte, '.room-chip');
  assert.equal(chips.length, 7);
  chip(karte, 4).click();
  assert.deepEqual(roh(karte._selection.rooms), [4]);
  assert.equal(knopf(karte, 'start').disabled, false);
});

test('Kartenwechsel (map-changed) leert die Auswahl mit Hinweis', async () => {
  const { haus, karte } = await kartenKarte();
  art(karte, 'room').click();
  chip(karte, 5).click();
  karte.hass = haus.setze(ersetze(haus, CAM, { map_index: 2, map_id: 7 }));
  assert.deepEqual(roh(karte._selection.rooms), []);
  assert.match(notiz(karte, 'map-changed').textContent, /Karte gewechselt/);
});

// ── Task 4: Zone ───────────────────────────────────────────────────────────
const zonen = (karte) => roh(karte._selection.zones).map((z) => [z.x0, z.y0, z.x1, z.y1].map(Math.round));
const ziehe = (u, karte, von, nach, schritte = 3) => {
  zeiger(u, karte, 'pointerdown', von.x, von.y);
  for (let i = 1; i <= schritte; i++) zeiger(u, karte, 'pointermove', von.x + (nach.x - von.x) * i / schritte, von.y + (nach.y - von.y) * i / schritte);
  zeiger(u, karte, 'pointerup', nach.x, nach.y);
  u.uhr.vor(400);
};
const naheGleich = (a, b, tol, was) => a.forEach((z, i) => z.forEach((v, j) => assert.ok(Math.abs(v - b[i][j]) <= tol, `${was}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`)));
async function zoneKarte(opts) {
  const r = await kartenKarte(opts);
  art(r.karte, 'zone').click();
  return r;
}

test('Zone: Tipp auf freie Fläche legt 1,5 × 1,5 m um den Punkt an; Liste nennt Maße', async () => {
  const { u, karte } = await zoneKarte();
  assert.equal(karte._map._mode, 'draw-rect');
  const r = raeume()['5'];
  tippe(u, karte, bildschirm(karte, r));
  naheGleich(zonen(karte), [[r.x - 750, r.y - 750, r.x + 750, r.y + 750]], 40, 'Tipp-Zone');
  const eintrag = aktion(karte, 'zone-0');
  assert.match(eintrag.textContent, /Bereich 1 · 1,5 × 1,5 m/);
  assert.equal(ebeneTasks(karte).querySelectorAll('[data-select="zone"]').length, 1);
});

test('Zone: Ziehen zeichnet ein Rechteck (draw-rect) mit Lupe', async () => {
  const { u, karte } = await zoneKarte();
  const a = { x: -5000, y: -5000 }, b = { x: -2500, y: -3000 };
  const von = bildschirm(karte, a), nach = bildschirm(karte, b);
  zeiger(u, karte, 'pointerdown', von.x, von.y);
  zeiger(u, karte, 'pointermove', nach.x, nach.y);
  assert.equal($(karte, '.map-loupe').hidden, false);
  zeiger(u, karte, 'pointerup', nach.x, nach.y);
  naheGleich(zonen(karte), [[-5000, -5000, -2500, -3000]], 40, 'gezogen');
});

test('Zone: Knopf „Bereich hinzufügen“ legt in der Mitte der sichtbaren Karte an', async () => {
  const { karte } = await zoneKarte();
  const m = karte._map, rect = m._stageRect();
  const mitte = m.toRobot(m.fromScreen({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
  aktion(karte, 'zone-add').click();
  naheGleich(zonen(karte), [[mitte.x - 750, mitte.y - 750, mitte.x + 750, mitte.y + 750]], 2, 'Mitte');
  assert.equal(aktion(karte, 'zone-0').getAttribute('aria-pressed'), 'true', 'neue Zone gewählt');
});

test('Zone: Tipp auf Teppich übernimmt seinen Umriss', async () => {
  const { u, haus, karte } = await zoneKarte();
  const t = haus.states[CAM].attributes.carpets[0];
  tippe(u, karte, bildschirm(karte, { x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y2) / 2 }));
  assert.deepEqual(zonen(karte), [[Math.round(Math.min(t.x0, t.x1)), Math.round(Math.min(t.y0, t.y2)), Math.round(Math.max(t.x0, t.x1)), Math.round(Math.max(t.y0, t.y2))]]);
});

test('Zone: Fläche ziehen verschiebt, Eckgriff skaliert, Untergrenze hält, × entfernt', async () => {
  const { u, karte } = await zoneKarte();
  karte._selection.zones.push({ x0: -5000, y0: -5000, x1: -3000, y1: -3000 });
  karte._selectionChanged();
  ziehe(u, karte, bildschirm(karte, { x: -4000, y: -4000 }), bildschirm(karte, { x: -3500, y: -4200 }));
  naheGleich(zonen(karte), [[-4500, -5200, -2500, -3200]], 40, 'verschoben');
  const griffe = karte._zoneHandles(0);
  // Griff ≥ 44 px: 15 px neben der Ecke trifft noch den Griff.
  const ecke = griffe.corners[2];
  ziehe(u, karte, { x: ecke.x + 15, y: ecke.y }, bildschirm(karte, { x: -2000, y: -2000 }));
  const z = zonen(karte)[0];
  assert.ok(Math.abs(z[2] + 2000) <= 60 || Math.abs(z[3] + 2000) <= 60, 'Ecke gezogen: ' + JSON.stringify(z));
  const klein = karte._zoneHandles(0).corners[2];
  const gegen = karte._zoneHandles(0).corners[0];
  ziehe(u, karte, klein, gegen);
  const k = zonen(karte)[0];
  assert.ok(k[2] - k[0] > 100 && k[3] - k[1] > 100, 'Untergrenze 2 × grid_size: ' + JSON.stringify(k));
  tippe(u, karte, karte._zoneHandles(0).remove);
  assert.deepEqual(zonen(karte), []);
});

test('Zone: Knöpfe und Tastatur ergeben dasselbe wie Ziehen (R15)', async () => {
  const gezogen = await zoneKarte();
  gezogen.karte._selection.zones.push({ x0: -5000, y0: -5000, x1: -3000, y1: -3000 });
  gezogen.karte._selectionChanged();
  ziehe(gezogen.u, gezogen.karte, bildschirm(gezogen.karte, { x: -4000, y: -4000 }), bildschirm(gezogen.karte, { x: -3500, y: -4000 }));
  const { u, karte } = await zoneKarte();
  karte._selection.zones.push({ x0: -5000, y0: -5000, x1: -3000, y1: -3000 });
  karte._selectionChanged();
  aktion(karte, 'zone-0').click();
  const rechts = karte._zoneStep('right', 100);
  assert.equal(Math.abs(rechts.x) + Math.abs(rechts.y), 100, 'eine Achse, 100 mm');
  aktion(karte, 'zone-right').click();
  klick(u, aktion(karte, 'zone-right'), { shiftKey: true });
  assert.deepEqual(zonen(karte).map((z) => z.map((v) => Math.round(v / 100) * 100)), [[-4400, -5000, -2400, -3000]], '100 + 500 mm');
  const e = u.neuesEreignis('keydown', { key: 'ArrowLeft' });
  aktion(karte, 'zone-0').dispatchEvent(e);
  assert.ok(e.defaultPrevented);
  naheGleich(zonen(karte), zonen(gezogen.karte), 40, 'Tastatur = Ziehen');
});

test('Zone: Breite/Höhe ± und Alt+Pfeile skalieren, Entf entfernt, Escape hebt Wahl auf', async () => {
  const { u, karte } = await zoneKarte();
  karte._selection.zones.push({ x0: 0, y0: 0, x1: 1000, y1: 1000 });
  karte._selectionChanged();
  aktion(karte, 'zone-0').click();
  aktion(karte, 'zone-wider').click();
  aktion(karte, 'zone-taller').click();
  let [z] = zonen(karte);
  assert.equal(z[2] - z[0], 1100);
  assert.equal(z[3] - z[1], 1100);
  for (let i = 0; i < 20; i++) aktion(karte, 'zone-narrower').click();
  [z] = zonen(karte);
  assert.ok(z[2] - z[0] > 100, 'nicht unter die Untergrenze');
  const taste = (key, extra = {}) => aktion(karte, 'zone-0').dispatchEvent(u.neuesEreignis('keydown', Object.assign({ key }, extra)));
  const vorher = zonen(karte)[0];
  taste('ArrowRight', { altKey: true });
  assert.equal(zonen(karte)[0][2] - zonen(karte)[0][0], vorher[2] - vorher[0] + 100);
  taste('Escape');
  assert.equal(aktion(karte, 'zone-0').getAttribute('aria-pressed'), 'false');
  assert.equal(aktion(karte, 'zone-left'), null, 'Bearbeiten-Knöpfe nur mit gewählter Zone');
  taste('Delete');
  assert.deepEqual(zonen(karte), []);
});

test('Zone: ganz außerhalb markiert und Start gesperrt; CleanGenius-Hinweis', async () => {
  const { karte, haus } = await zoneKarte({ vacuum: { cleangenius_cleaning: true } });
  karte._selection.zones.push({ x0: 90000, y0: 90000, x1: 92000, y1: 92000 });
  karte._selectionChanged();
  assert.equal(ebeneTasks(karte).querySelector('[data-select="zone"]').getAttribute('data-invalid'), 'true');
  assert.match(aktion(karte, 'zone-0').textContent, /außerhalb/);
  assert.equal(knopf(karte, 'start').disabled, true);
  assert.match(notiz(karte, 'cleangenius').textContent, /CleanGenius/);
  knopf(karte, 'start').click();
  assert.deepEqual(haus.rufe, []);
});

test('Zone: gesperrte Karte — Gesten aus, Knopfwege an', async () => {
  const { u, karte } = await zoneKarte();
  karte._toggleLock();
  tippe(u, karte, bildschirm(karte, raeume()['5']));
  assert.deepEqual(zonen(karte), []);
  aktion(karte, 'zone-add').click();
  assert.equal(zonen(karte).length, 1);
});
