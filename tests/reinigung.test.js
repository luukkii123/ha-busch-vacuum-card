'use strict';
// Modul clean-settings (Plan 2026-11-10): Reinigungseinstellungen global, CleanGenius,
// Customized Cleaning je Raum, Mop-Typ, Reinigungsreihenfolge.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');
const { roh, dialogVon, sauger } = require('./hilfen.js');

const SCHLUESSEL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'integration-schluessel.json'), 'utf8'));
const CAM = 'camera.robo_map';

/** Karte aus einer Fixture; `attribute` ergänzen den Sauger, `raeume` ersetzen Räume der Kamera (je id gemischt). */
function aufbau(name = 'voll', { attribute, zustand, config, caps, raeume, services } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (attribute || zustand || caps) {
    const s = sauger(haus, attribute, zustand);
    if (caps) s['vacuum.robo'].attributes.capabilities = caps(s['vacuum.robo'].attributes.capabilities);
    haus.states = Object.assign({}, haus.states, s);
  }
  if (raeume) {
    const c = haus.states[CAM], r = roh(c.attributes.rooms);
    for (const [id, werte] of Object.entries(raeume)) r[id] = Object.assign({}, r[id], werte);
    haus.states = Object.assign({}, haus.states, { [CAM]: Object.assign({}, c, { attributes: Object.assign({}, c.attributes, { rooms: r }) }) });
  }
  if (services) haus.services = services(haus.services);
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
const aufrufe = (k) => roh(k.haus.rufe);
const setze = (key, value) => ({ domain: 'dreame_vacuum', service: 'vacuum_set_property', data: { entity_id: 'vacuum.robo', key, value } });
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const knopf = (k) => k.karte.shadowRoot.querySelector('[data-action="clean-settings"]');
function einstellungen(name, optionen) {
  const k = aufbau(name, optionen);
  knopf(k).click();
  return k;
}
const abschnitte = (k) => $$d(k.u, '[data-section]').map((s) => s.getAttribute('data-section'));
const zeileD = (k, key) => $d(k.u, '[data-setting="' + key + '"]');
const grund = (k, key) => {
  const z = k.I.settingRow(k.karte, k.model(), key);
  return z && z.getAttribute('data-state') === 'locked' ? z.querySelector('.setting-status').textContent : '';
};

// ── Task 1: globale Schlüssel, Knopf, Wiederholungen ────────────────────────

const GLOBAL = ['cleaning_mode', 'suction_level', 'mop_pad_humidity', 'wetness_level', 'water_volume', 'cleaning_route', 'mop_pressure',
  'customized_cleaning', 'cleangenius', 'cleangenius_mode'];

test('ALL-01 SETTINGS: ALL-01-Anteil in Gruppe clean; Raumschlüssel vollständig clean-settings oder map-editor', () => {
  const { I } = aufbau();
  for (const key of GLOBAL) assert.equal(I.SETTINGS[key] && I.SETTINGS[key].group, 'clean', key);
  const raum = [...SCHLUESSEL.raum.select, ...SCHLUESSEL.raum.number];
  const abgedeckt = [...I.ROOM_KEYS['clean-settings'], ...I.ROOM_KEYS['map-editor']];
  assert.deepEqual(raum.filter((k) => !abgedeckt.includes(k)), [], 'kein Raumschlüssel ohne Modul');
  assert.deepEqual(I.ROOM_KEYS['map-editor'].sort(), ['floor_material', 'floor_material_direction', 'name', 'visibility']);
});

test('SET-01 Knopf „Einstellungen“ je Zustand (SET-01): Ruhe/Aufgabe ja; geplant, Shortcut, CleanGenius-Aufgabe nein', () => {
  const sichtbar = (opt) => !!knopf(aufbau('voll', opt));
  assert.equal(sichtbar(), true, 'Ruhe');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true } }), true, 'normale Aufgabe');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true, scheduled_clean: true } }), false, 'geplant');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true, shortcut_task: true } }), false, 'Shortcut');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true, cleangenius_cleaning: true } }), false, 'CleanGenius-Aufgabe');
  assert.equal(sichtbar({ attribute: { cleangenius_cleaning: true } }), true, 'Ruhe mit CleanGenius: sonst nicht abschaltbar');
  assert.equal(sichtbar({ config: { hidden_card_objects: ['task_type'] } }), false, 'task_type ausgeblendet');
  assert.equal(sichtbar({ services: (s) => ({ vacuum: s.vacuum, dreame_vacuum: {} }) }), false, 'ohne vacuum_set_property');
  assert.equal(knopf(aufbau()).textContent.includes('Einstellungen'), true, 'Text, nicht nur Symbol');
});

test('SET-02 Dialog „Reinigungseinstellungen“: kind editor, Abschnitte in Reihenfolge, leere entfallen', () => {
  const k = einstellungen();
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'editor');
  assert.equal($d(k.u, 'h1').textContent, 'Reinigungseinstellungen');
  assert.deepEqual(abschnitte(k).slice(0, 3), ['cleangenius', 'basic', 'customized']);
  assert.equal(abschnitte(k).at(-1), 'more');
  const ohne = einstellungen('voll', { caps: (c) => c.filter((x) => !['cleangenius', 'customized_cleaning'].includes(x)), attribute: { cleangenius: undefined, cleangenius_list: undefined, customized_cleaning: undefined } });
  assert.deepEqual(abschnitte(ohne).filter((s) => ['cleangenius', 'customized'].includes(s)), [], 'ohne Fähigkeit/Wert kein Abschnitt');
});

test('ALL-01/DEV-04/SET-02 Grundeinstellungen: Wert aus voll.json, genau ein vacuum_set_property je Änderung', () => {
  const soll = { cleaning_mode: ['Mopping after sweeping', 'Sweeping'], suction_level: ['Turbo', 'Quiet'], mop_pad_humidity: ['Moist', 'Wet'], cleaning_route: ['Deep', 'Quick'] };
  for (const [key, [ist, neu]] of Object.entries(soll)) {
    const k = einstellungen();
    const feld = zeileD(k, key).querySelector('select');
    assert.equal(feld.value, ist, key);
    feld.value = neu;
    feld.dispatchEvent(k.u.neuesEreignis('change'));
    assert.deepEqual(aufrufe(k), [setze(key, neu)], key);
  }
  const k = einstellungen();
  const nass = zeileD(k, 'wetness_level').querySelector('input');
  assert.equal(nass.value, '26');
  assert.deepEqual([nass.getAttribute('min'), nass.getAttribute('max')], ['1', '32']);
  nass.value = '12';
  nass.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze('wetness_level', 12)]);
  const sw = aufbau('voll', { caps: (c) => c.concat('mop_clean_frequency') });
  assert.equal(sw.I.settingState(sw.karte, sw.model(), 'wetness_level').max, 15, 'mit mop_clean_frequency 1–15 (number.py#L166)');
  // X40 hat weder water_volume noch mop_pressure: keine Zeile; synthetisch mit _list ja.
  assert.equal(zeileD(k, 'water_volume'), null);
  assert.equal(zeileD(k, 'mop_pressure'), null);
  const syn = einstellungen('voll', { attribute: { water_volume: 'Medium', water_volume_list: ['Low', 'Medium', 'High'], mop_pressure: 'Light', mop_pressure_list: ['Light', 'Normal'] } });
  for (const [key, neu] of [['water_volume', 'High'], ['mop_pressure', 'Normal']]) {
    const feld = zeileD(syn, key).querySelector('select');
    feld.value = neu;
    feld.dispatchEvent(syn.u.neuesEreignis('change'));
  }
  assert.deepEqual(aufrufe(syn), [setze('water_volume', 'High'), setze('mop_pressure', 'Normal')]);
});

test('SET-02 Sperren mit Grund: leere _list, CleanGenius, Customized Cleaning, laufende Aufgabe', () => {
  assert.match(grund(aufbau('voll', { attribute: { cleaning_route_list: [] } }), 'cleaning_route'), /erlaubt die Änderung gerade nicht/);
  assert.match(grund(aufbau('voll', { attribute: { cleangenius_cleaning: true } }), 'suction_level'), /CleanGenius/);
  assert.match(grund(aufbau('voll', { attribute: { customized_cleaning: true } }), 'suction_level'), /je Raum/);
  assert.match(grund(aufbau('voll', { attribute: { customized_cleaning: true } }), 'cleaning_mode'), /je Raum/, 'custom_cleaning_mode');
  assert.equal(grund(aufbau('voll', { attribute: { customized_cleaning: true }, caps: (c) => c.filter((x) => x !== 'custom_cleaning_mode') }), 'cleaning_mode'), '');
  assert.match(grund(aufbau('voll', { zustand: 'cleaning', attribute: { started: true } }), 'cleaning_route'), /Während einer Aufgabe/);
  assert.match(grund(aufbau('voll', { zustand: 'cleaning', attribute: { started: true } }), 'customized_cleaning'), /Während einer Aufgabe/);
  assert.match(grund(aufbau('voll', { attribute: { has_saved_map: false } }), 'customized_cleaning'), /gespeicherter Karte/);
  assert.equal(grund(aufbau(), 'suction_level'), '');
});

test('SET-02/TASK-06 Wiederholungen (repeatsRow): 1–3 im Speicher der Karte, geteilt mit der Aufgabenwahl', () => {
  const k = einstellungen();
  const zeile = () => $d(k.u, '.task-repeats');
  assert.match(zeile().textContent, /1×/);
  assert.match(zeile().textContent, /Raum ohne Customized Cleaning, Zone und Spot/);
  assert.equal(zeile().querySelector('[data-action="repeats-minus"]').disabled, true);
  zeile().querySelector('[data-action="repeats-plus"]').click();
  zeile().querySelector('[data-action="repeats-plus"]').click();
  assert.equal(zeile().querySelector('[data-action="repeats-plus"]').disabled, true);
  assert.equal(k.karte._repeats, 3);
  assert.deepEqual(aufrufe(k), [], 'kein Geräteschlüssel');
  const panel = k.karte.shadowRoot.querySelector('.task-repeats');
  if (panel) assert.match(panel.textContent, /3×/, 'Aufgabenwahl zeigt denselben Wert');
});

test('„Weitere Reinigungseinstellungen“ springt in device-settings, Gruppe Reinigung', () => {
  const k = einstellungen();
  $d(k.u, '[data-action="more-cleaning"]').click();
  assert.equal($d(k.u, 'h1').textContent, 'Reinigung');
  assert.ok(zeileD(k, 'max_suction_power'), 'Zeilen der Gruppe cleaning');
});

// ── Task 2: CleanGenius ─────────────────────────────────────────────────────

test('ALL-01/SET-03 CleanGenius: Auswahl schreibt über vacuum_set_property; Modus nur bei CleanGenius an', () => {
  const k = einstellungen();
  const feld = zeileD(k, 'cleangenius').querySelector('select');
  assert.equal(feld.value, 'Off');
  assert.equal(zeileD(k, 'cleangenius_mode'), null, 'CleanGenius aus: Modus ausgeblendet');
  feld.value = 'Deep cleaning';
  feld.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze('cleangenius', 'Deep cleaning')]);
  const an = einstellungen('voll', { attribute: { cleangenius: 'Routine cleaning', cleangenius_cleaning: true, cleangenius_mode_list: ['Vacuum and mop', 'Mop after vacuum'] } });
  const modus = zeileD(an, 'cleangenius_mode').querySelector('select');
  assert.equal(modus.value, 'Mop after vacuum');
  modus.value = 'Vacuum and mop';
  modus.dispatchEvent(an.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(an), [setze('cleangenius_mode', 'Vacuum and mop')]);
});

test('SET-03 CleanGenius an: Customized Cleaning ausgeblendet mit Satz, Grundwerte gesperrt mit Grund', () => {
  const k = einstellungen('voll', { attribute: { cleangenius: 'Routine cleaning', cleangenius_cleaning: true } });
  assert.equal(zeileD(k, 'customized_cleaning'), null);
  assert.match($d(k.u, '[data-section="customized"]').textContent, /CleanGenius wählt die Einstellungen je Raum selbst/);
  for (const key of ['cleaning_mode', 'suction_level', 'wetness_level', 'cleaning_route']) {
    assert.equal(zeileD(k, key).getAttribute('data-state'), 'locked', key);
    assert.match(zeileD(k, key).textContent, /CleanGenius/, key);
  }
});

test('SET-03 CleanGenius selbst gesperrt (leere Liste: Aufgabe, Zone/Spot, Mop fehlt) mit Grund', () => {
  assert.match(grund(aufbau('voll', { attribute: { cleangenius_list: [] } }), 'cleangenius'), /Zone\/Spot|Mop/);
  assert.match(grund(aufbau('voll', { zustand: 'cleaning', attribute: { started: true } }), 'cleangenius'), /Während einer Aufgabe/);
});

// ── Task 3: Customized Cleaning je Raum ─────────────────────────────────────

const custom = (data) => ({ domain: 'dreame_vacuum', service: 'vacuum_set_custom_cleaning', data: Object.assign({ entity_id: 'vacuum.robo' }, data) });
const SYNTH = (c) => c.filter((x) => !['wetness_level', 'cleaning_route', 'custom_cleaning_mode'].includes(x)).concat('mop_pressure', 'mop_temperature');

test('SET-04 roomPayload X40: Raum mit allen Werten als Codes, nur Felder mit Fähigkeit', () => {
  const k = aufbau();
  const raum = k.haus.states[CAM].attributes.rooms['3'];
  assert.deepEqual(roh(k.I.roomPayload(k.model(), raum, { suction_level: 0 })),
    { segment_id: [3], suction_level: [0], repeats: [2], wetness_level: [16], cleaning_mode: [2], cleaning_route: [2] });
  assert.deepEqual(roh(k.I.roomPayload(k.model(), raum, { cleaning_times: 3 })).repeats, [3]);
});

test('roomPayload synthetisch: water_volume, custom_mopping_route, mop_pressure/-temperature (Namen → Codes)', () => {
  const k = aufbau('voll', { caps: SYNTH, raeume: { 3: { custom_mopping_route: 1, mop_pressure: 'Normal', mop_temperature: 'Warm' } } });
  const raum = k.haus.states[CAM].attributes.rooms['3'];
  assert.deepEqual(roh(k.I.roomPayload(k.model(), raum, { mop_pressure: 'Light' })),
    { segment_id: [3], suction_level: [3], repeats: [2], water_volume: [2], custom_mopping_route: [1], mop_pressure: [0], mop_temperature: [1] });
});

test('roomPayload Grenzen: ungültig oder unbekannt → null (nie raten)', () => {
  const k = aufbau();
  const raum = k.haus.states[CAM].attributes.rooms['3'];
  const p = (change, model = k.model(), r = raum) => k.I.roomPayload(model, r, change);
  assert.equal(p({ suction_level: 4 }), null);
  assert.equal(p({ cleaning_times: 0 }), null);
  assert.equal(p({ wetness_level: 33 }), null);
  assert.equal(p({ cleaning_mode: 3 }), null, '0–2 je Raum');
  assert.equal(p({ cleaning_route: 4 }), null, 'mit segment_slow_clean_route 1–3');
  const ohneSlow = aufbau('voll', { caps: (c) => c.filter((x) => x !== 'segment_slow_clean_route') });
  assert.ok(p({ cleaning_route: 4 }, ohneSlow.model()), 'sonst 1–4');
  const { cleaning_times: _weg, ...ohneDurchgaenge } = raum;
  assert.equal(p({ suction_level: 1 }, k.model(), ohneDurchgaenge), null);
});

/** Einstellungen → Räume einstellen → Raum. */
function raumSeite(id, optionen) {
  const k = einstellungen('voll', optionen);
  $d(k.u, '[data-action="rooms"]').click();
  if (id !== undefined) $$d(k.u, '[data-room]').find((b) => b.getAttribute('data-room') === String(id)).click();
  return k;
}
const raumFeld = (k, key) => $d(k.u, '[data-setting="room-' + key + '"]');
function neueRaeume(k, werte) {
  const c = k.haus.states[CAM], r = roh(c.attributes.rooms);
  for (const [id, w] of Object.entries(werte)) Object.assign(r[id], w);
  k.karte.hass = k.haus.setze({ [CAM]: Object.assign({}, c, { attributes: Object.assign({}, c.attributes, { rooms: r }) }) });
}

test('SET-04 Räume einstellen: Liste in Reihenfolge mit Kurzwerten; Schalter Customized Cleaning schreibt', () => {
  const k = einstellungen();
  const schalter = zeileD(k, 'customized_cleaning').querySelector('[role="switch"]');
  schalter.click();
  assert.deepEqual(aufrufe(k), [setze('customized_cleaning', 1)]);
  $d(k.u, '[data-action="rooms"]').click();
  const liste = $$d(k.u, '[data-room]');
  const folge = k.haus.states['vacuum.robo'].attributes.cleaning_sequence.map(String);
  assert.deepEqual(liste.map((b) => b.getAttribute('data-room')), folge);
  assert.match(liste[0].textContent, /Salon.*Saugstufe Turbo · Wasser 16 · 2 Durchgänge/, 'M13: Werte mit Label');
});

test('SET-04 Raumseite: Wert ändern sendet den Raum mit allen Werten; optimistisch bis Kamera bestätigt', async () => {
  const k = raumSeite(3);
  assert.equal($d(k.u, 'h1').textContent, 'Salon');
  const feld = () => raumFeld(k, 'suction_level').querySelector('select');
  assert.equal(feld().value, '3', 'Wert = Code');
  assert.equal(feld().childNodes.find((o) => o.value === '3').textContent, 'Turbo', 'Text aus der Code-Tabelle');
  feld().value = '0';
  feld().dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [custom({ segment_id: [3], suction_level: [0], repeats: [2], wetness_level: [16], cleaning_mode: [2], cleaning_route: [2] })]);
  assert.equal(feld().value, '0', 'optimistisch');
  assert.equal(raumFeld(k, 'suction_level').getAttribute('data-state'), 'busy');
  neueRaeume(k, { 3: { suction_level: 0 } });
  assert.equal(raumFeld(k, 'suction_level').getAttribute('data-state'), 'ok', 'Kamera bestätigt');
  const { mikro } = require('./attrappe.js');
  k.haus.antwort = () => Promise.resolve(); // M3: das Fenster läuft ab der Dienstantwort
  const n = raumFeld(k, 'wetness_level').querySelector('input');
  n.value = '20';
  n.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k)[1].data.wetness_level, [20]);
  assert.deepEqual(aufrufe(k)[1].data.suction_level, [0], 'bestätigter neuer Wert mitgesendet');
  await mikro();
  k.u.uhr.vor(5000);
  assert.equal(raumFeld(k, 'wetness_level').querySelector('input').value, '16', 'ohne Bestätigung zurück');
  assert.match(raumFeld(k, 'wetness_level').textContent, /noch nicht bestätigt/);
});

test('Raumseite gesperrt mit Grund: Aufgabe läuft, temporäre Karte', () => {
  for (const [opt, text] of [[{ zustand: 'cleaning', attribute: { started: true } }, /Während einer Aufgabe/], [{ attribute: { has_temporary_map: true } }, /temporären/]]) {
    const k = raumSeite(3, opt);
    assert.match($d(k.u, '.body').textContent, text);
    assert.equal(raumFeld(k, 'suction_level').querySelector('select').disabled, true);
    assert.equal($d(k.u, '[data-action="apply-all"]').disabled, true);
  }
});

test('SET-04 Auf alle Räume übertragen: Bestätigung mit Raumliste, nacheinander, Abbruch beim ersten Fehler', async () => {
  const { mikro } = require('./attrappe.js');
  const k = raumSeite(3);
  $d(k.u, '[data-action="apply-all"]').click();
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'confirm');
  assert.match($d(k.u, '.body').textContent, /Werte von Salon ersetzen .*Räume: Bibliothek, Wintergarten, Atelier, Werkstatt, Sauna, Galerie\./, 'nur die anderen Räume, in Reihenfolge');
  assert.deepEqual(aufrufe(k), []);
  let n = 0;
  k.haus.antwort = () => (++n === 3 ? Promise.reject(new Error('unavailable_while_running')) : Promise.resolve());
  $d(k.u, '[data-action="confirm"]').click();
  assert.equal(aufrufe(k).length, 1, 'nacheinander, nicht parallel');
  for (let i = 0; i < 10; i++) await mikro();
  const r = aufrufe(k);
  assert.equal(r.length, 3, 'Abbruch nach dem Fehler');
  assert.deepEqual(r.map((c) => c.data.segment_id[0]), [5, 7, 1]);
  assert.deepEqual(r[0].data, { entity_id: 'vacuum.robo', segment_id: [5], suction_level: [3], repeats: [2], wetness_level: [16], cleaning_mode: [2], cleaning_route: [2] });
  assert.match($d(k.u, '.body').textContent, /unavailable_while_running/);
  assert.match($d(k.u, '.body').textContent, /Bibliothek/, 'geänderte Räume genannt');
});

test('M23 Alle übertragen: Doppeltipp sendet einmal (R11); Zurück erst nach dem Lauf', async () => {
  const { mikro } = require('./attrappe.js');
  const k = raumSeite(3);
  $d(k.u, '[data-action="apply-all"]').click();
  k.haus.antwort = () => Promise.resolve();
  const go = $d(k.u, '[data-action="confirm"]');
  go.click();
  go.click();
  assert.equal(aufrufe(k).length, 1, 'ein Lauf, nicht zwei');
  assert.equal($d(k.u, '[data-action="cancel"]').disabled, true, 'Zurück gesperrt, solange der Lauf läuft');
  for (let i = 0; i < 20; i++) await mikro();
  assert.deepEqual(aufrufe(k).map((c) => c.data.segment_id[0]), [5, 7, 1, 6, 9, 4], 'jeder andere Raum genau einmal, in Reihenfolge');
  assert.match($d(k.u, '.body').textContent, /6 von 6 Räumen übertragen/, 'Fortschritt am Ende');
  assert.equal($d(k.u, '[data-action="cancel"]').disabled, false);
});

test('M23 ein Ablauf: Auf alle übertragen und Raumeinstellungen wiederherstellen schreiben nur über runSeries', () => {
  const quelle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');
  const rumpf = (kopf) => { const a = quelle.indexOf(kopf); assert.ok(a >= 0, kopf); return quelle.slice(a, quelle.indexOf('\n}\n', a)); };
  assert.equal((quelle.match(/\n(?:async )?function runSeries\(/g) || []).length, 1, 'genau eine Funktion');
  for (const kopf of ['function applyAllView(', 'function roomRestoreView(']) {
    const r = rumpf(kopf);
    assert.ok(r.includes('runSeries('), kopf + ' nutzt runSeries');
    assert.ok(!r.includes('callDevice('), kopf + ' ruft den Dienst nicht selbst');
  }
});

// ── Task 4: Mop-Typ ─────────────────────────────────────────────────────────

test('SET-06 Mop-Typ: X40 ohne Zeile; mit auto_change_mop genau vacuum_set_mop_type ohne map_id', () => {
  assert.equal(raumFeld(raumSeite(3), 'mop_type'), null, 'X40 kann es nicht');
  const k = raumSeite(3, { caps: (c) => c.concat('auto_change_mop'), raeume: { 3: { mop_type: 'A' } } });
  const feld = raumFeld(k, 'mop_type').querySelector('select');
  assert.equal(feld.value, 'A');
  assert.deepEqual(feld.childNodes.map((o) => o.value), ['A', 'B', 'C']);
  feld.value = 'B';
  feld.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [{ domain: 'dreame_vacuum', service: 'vacuum_set_mop_type', data: { entity_id: 'vacuum.robo', mop_type: { 3: 'B' } } }]);
  assert.equal(raumFeld(k, 'mop_type').getAttribute('data-state'), 'busy');
  neueRaeume(k, { 3: { mop_type: 'B' } });
  assert.equal(raumFeld(k, 'mop_type').getAttribute('data-state'), 'ok');
  const gesperrt = raumSeite(3, { caps: (c) => c.concat('auto_change_mop'), raeume: { 3: { mop_type: 'A' } }, attribute: { has_temporary_map: true } });
  assert.equal(raumFeld(gesperrt, 'mop_type').querySelector('select').disabled, true);
});

// ── Task 5: Reinigungsreihenfolge ───────────────────────────────────────────

const FOLGE = ['3', '5', '7', '1', '6', '9', '4'];
const NICHT_STRIKT = (c) => c.filter((x) => x !== 'cleaning_sequence_v2');
const folgeAufruf = (liste) => ({ domain: 'dreame_vacuum', service: 'vacuum_set_cleaning_sequence', data: { entity_id: 'vacuum.robo', cleaning_sequence: liste } });

test('SET-05 sequenceModel: strikt volle Liste; nicht strikt mit „ohne Reihenfolge“; unbekannte IDs nie', () => {
  const k = aufbau('voll', { attribute: { cleaning_sequence: [3, 99, 5] } });
  const raeume = k.haus.states[CAM].attributes.rooms;
  const s = roh(k.I.sequenceModel(k.model(), raeume));
  assert.equal(s.strict, true);
  assert.deepEqual(s.ordered.slice(0, 2), ['3', '5']);
  assert.deepEqual(s.ordered.slice().sort(), Object.keys(raeume).sort(), 'jeder Raum hat einen Platz');
  assert.deepEqual(s.unordered, []);
  const n = aufbau('voll', { caps: NICHT_STRIKT, attribute: { cleaning_sequence: [3, 99, 5] } });
  const t = roh(n.I.sequenceModel(n.model(), raeume));
  assert.deepEqual([t.strict, t.ordered], [false, ['3', '5']]);
  assert.deepEqual(t.unordered.sort(), ['1', '4', '6', '7', '9']);
  const leer = aufbau('voll', { caps: NICHT_STRIKT, attribute: { cleaning_sequence: null }, raeume: Object.fromEntries(Object.keys(raeume).map((id) => [id, { order: 0 }])) });
  assert.deepEqual(roh(leer.I.sequenceModel(leer.model(), leer.haus.states[CAM].attributes.rooms)).ordered, [], 'leere Liste möglich');
  assert.deepEqual(roh(k.I.moveRoom(['a', 'b', 'c'], 'c', 0)), ['c', 'a', 'b']);
  assert.deepEqual(roh(k.I.moveRoom(['a', 'b', 'c'], 'a', 9)), ['b', 'c', 'a']);
});

/** Reihenfolge über das Menü öffnen. */
function folge(optionen) {
  const k = aufbau('voll', optionen);
  k.karte.shadowRoot.querySelector('.menu-button').click();
  $$d(k.u, '.menu-item').find((b) => b.getAttribute('data-entry') === 'cleaning_sequence').click();
  return k;
}
const zeilen = (k) => $$d(k.u, '[role="option"]').map((z) => z.getAttribute('data-room'));
const zeileR = (k, id) => $$d(k.u, '[role="option"]').find((z) => z.getAttribute('data-room') === id);
const taste = (k, el, key) => el.dispatchEvent(k.u.neuesEreignis('keydown', { key }));

test('Menü und Einstellungen öffnen dieselbe Ansicht (kind editor, listbox/option)', () => {
  const k = folge();
  assert.equal($d(k.u, 'h1').textContent, 'Reinigungsreihenfolge');
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'editor');
  assert.ok($d(k.u, '[role="listbox"]'));
  assert.deepEqual(zeilen(k), FOLGE);
  const e = einstellungen();
  $d(e.u, '[data-action="sequence"]').click();
  assert.equal($d(e.u, 'h1').textContent, 'Reinigungsreihenfolge');
  assert.deepEqual(zeilen(e), FOLGE);
});

test('SET-05 Knöpfe, Tastatur, Ziehen und Antipp-Modus ergeben dieselbe Liste', () => {
  const soll = ['1', '3', '5', '7', '6', '9', '4'];
  const knoepfe = folge();
  zeileR(knoepfe, '1').querySelector('[data-action="top"]').click();
  assert.deepEqual(zeilen(knoepfe), soll, 'An den Anfang');
  const hochRunter = folge();
  for (let i = 0; i < 3; i++) zeileR(hochRunter, '1').querySelector('[data-action="up"]').click();
  zeileR(hochRunter, '1').querySelector('[data-action="down"]').click();
  zeileR(hochRunter, '1').querySelector('[data-action="up"]').click();
  assert.deepEqual(zeilen(hochRunter), soll, '↑/↓');

  const tasten = folge();
  taste(tasten, zeileR(tasten, '1'), ' ');
  assert.match($d(tasten.u, '[aria-live]').textContent, /Atelier/, 'Greifen angesagt');
  for (let i = 0; i < 3; i++) taste(tasten, zeileR(tasten, '1'), 'ArrowUp');
  taste(tasten, zeileR(tasten, '1'), ' ');
  assert.deepEqual(zeilen(tasten), soll, 'Tastatur');
  const abbruch = folge();
  taste(abbruch, zeileR(abbruch, '1'), ' ');
  taste(abbruch, zeileR(abbruch, '1'), 'ArrowUp');
  taste(abbruch, zeileR(abbruch, '1'), 'Escape');
  assert.deepEqual(zeilen(abbruch), FOLGE, 'Escape bricht ab');
  assert.ok(dialogVon(abbruch.u), 'Escape schließt nicht den Dialog');

  const ziehen = folge();
  $$d(ziehen.u, '[role="option"]').forEach((z, i) => { z.getBoundingClientRect = () => ({ left: 0, right: 300, top: i * 50, bottom: i * 50 + 50, width: 300, height: 50 }); });
  const griff = zeileR(ziehen, '1').querySelector('.seq-handle');
  const zeiger = (typ, y) => griff.dispatchEvent(ziehen.u.neuesEreignis(typ, { clientX: 20, clientY: y, pointerType: 'mouse', pointerId: 1, button: 0 }));
  zeiger('pointerdown', 175);
  zeiger('pointermove', 60);
  zeiger('pointermove', 10);
  zeiger('pointerup', 10);
  assert.deepEqual(zeilen(ziehen), soll, 'Ziehen');

  const tippen = folge();
  $d(tippen.u, '[data-action="tap-mode"]').click();
  $$d(tippen.u, '[data-tap]').find((b) => b.getAttribute('data-tap') === '1').click();
  assert.match($$d(tippen.u, '[data-tap]').find((b) => b.getAttribute('data-tap') === '1').textContent, /1/, 'Badge zählt');
  $d(tippen.u, '[data-action="tap-done"]').click();
  assert.deepEqual(zeilen(tippen), soll, 'Antipp-Modus');
  for (const k of [knoepfe, tasten, ziehen, tippen]) assert.deepEqual(aufrufe(k), [], 'nur Entwurf, nichts gesendet');
});

test('Ziehen per Touch erst nach 300 ms Halten', () => {
  const k = folge();
  $$d(k.u, '[role="option"]').forEach((z, i) => { z.getBoundingClientRect = () => ({ left: 0, right: 300, top: i * 50, bottom: i * 50 + 50, width: 300, height: 50 }); });
  const griff = () => zeileR(k, '1').querySelector('.seq-handle');
  const zeiger = (typ, y) => griff().dispatchEvent(k.u.neuesEreignis(typ, { clientX: 20, clientY: y, pointerType: 'touch', pointerId: 2 }));
  zeiger('pointerdown', 175);
  zeiger('pointermove', 10);
  zeiger('pointerup', 10);
  assert.deepEqual(zeilen(k), FOLGE, 'sofortiges Wischen scrollt nur');
  zeiger('pointerdown', 175);
  k.u.uhr.vor(300);
  zeiger('pointermove', 10);
  zeiger('pointerup', 10);
  assert.deepEqual(zeilen(k)[0], '1');
});

test('SET-05 Speichern: genau ein vacuum_set_cleaning_sequence; Entwurf bleibt bis das Gerät ihn meldet, auch beim Verlassen', () => {
  const k = folge();
  zeileR(k, '1').querySelector('[data-action="top"]').click();
  assert.match($d(k.u, '.body').textContent, /nicht gespeichert/);
  $d(k.u, '[data-action="close"]').click();
  k.u.uhr.vor(300);
  assert.equal(dialogVon(k.u), null, 'Dialog zu');
  k.karte.shadowRoot.querySelector('.menu-button').click();
  $$d(k.u, '.menu-item').find((b) => b.getAttribute('data-entry') === 'cleaning_sequence').click();
  assert.deepEqual(zeilen(k)[0], '1', 'Entwurf erhalten (R10)');
  $d(k.u, '[data-action="save"]').click();
  $d(k.u, '[data-action="save"]').click();
  assert.deepEqual(aufrufe(k), [folgeAufruf([1, 3, 5, 7, 6, 9, 4])], 'einmal, als Zahlen');
  k.karte.hass = k.haus.setze(sauger(k.haus, { cleaning_sequence: [1, 3, 5, 7, 6, 9, 4] }));
  assert.doesNotMatch($d(k.u, '.body').textContent, /nicht gespeichert/);
});

test('Speichern-Fehler (R12): Hinweis, Entwurf bleibt', async () => {
  const { mikro } = require('./attrappe.js');
  const k = folge();
  k.haus.antwort = () => Promise.reject(new Error('unavailable_while_running'));
  zeileR(k, '1').querySelector('[data-action="top"]').click();
  $d(k.u, '[data-action="save"]').click();
  await mikro();
  assert.match($d(k.u, '.body').textContent, /unavailable_while_running/);
  assert.deepEqual(zeilen(k)[0], '1');
});

test('SET-05 Strikt ohne „Reihenfolge aus“; nicht strikt: aus mit Rückgängig, leere Liste gesendet', () => {
  assert.equal($d(folge().u, '[data-action="sequence-off"]'), null);
  const k = folge({ caps: NICHT_STRIKT, attribute: { cleaning_sequence: [3, 5] } });
  assert.deepEqual(zeilen(k), ['3', '5']);
  assert.match($d(k.u, '[data-section="unordered"]').textContent, /Atelier/);
  $d(k.u, '[data-action="sequence-off"]').click();
  assert.deepEqual(zeilen(k), []);
  assert.match($d(k.u, '.body').textContent, /Salon, Bibliothek/, 'betroffene Räume genannt (R13)');
  $d(k.u, '[data-action="undo"]').click();
  assert.deepEqual(zeilen(k), ['3', '5']);
  $d(k.u, '[data-action="sequence-off"]').click();
  $d(k.u, '[data-action="save"]').click();
  assert.deepEqual(aufrufe(k), [folgeAufruf([])]);
  const add = folge({ caps: NICHT_STRIKT, attribute: { cleaning_sequence: [3, 5] } });
  $$d(add.u, '[data-action="add"]').find((b) => b.getAttribute('data-room') === '1').click();
  assert.deepEqual(zeilen(add), ['3', '5', '1'], 'einreihen hängt hinten an');
});

test('Sperrgründe: Aufgabe läuft, temporäre Karte → Speichern aus', () => {
  for (const [opt, text] of [[{ zustand: 'cleaning', attribute: { started: true } }, /Während einer Aufgabe/], [{ attribute: { has_temporary_map: true } }, /temporären/]]) {
    const k = folge(opt);
    assert.match($d(k.u, '.body').textContent, text);
    assert.equal($d(k.u, '[data-action="save"]').disabled, true);
  }
});

test('Fremde Updates bauen die Reihenfolge nicht neu (R20)', () => {
  const k = folge();
  const vorher = zeileR(k, '3');
  k.karte.hass = k.haus.fremd();
  assert.equal(zeileR(k, '3'), vorher);
});

// ── M13 (Buschcheck 17.11.2026, W4): „Räume einstellen“ mit beschrifteten Werten ──
test('M13 SET-04 Räume einstellen: Name fett, darunter jede Zahl mit Label, Chevron, Name komplett im aria-label', () => {
  const k = einstellungen();
  $d(k.u, '[data-action="rooms"]').click();
  const liste = $$d(k.u, '[data-room]');
  assert.ok(liste.length > 3);
  for (const z of liste) {
    const name = z.querySelector('.room-name'), werte = z.querySelector('.room-values');
    assert.ok(name && name.textContent, 'Raumname eigene Zeile');
    for (const teil of werte.textContent.split(' · ')) {
      assert.match(teil, /[A-Za-zÄÖÜäöüß]{3,}/, 'keine Zahl ohne Label: „' + teil + '“');
    }
    const chevron = z.querySelectorAll('ha-icon').find((i) => i.getAttribute('icon') === 'mdi:chevron-right');
    assert.ok(chevron, 'Chevron sichtbar');
    assert.equal(chevron.getAttribute('aria-hidden'), 'true');
    assert.equal(z.getAttribute('aria-label'), name.textContent + ': ' + werte.textContent);
  }
  const salon = liste[0];
  assert.equal(salon.querySelector('.room-name').textContent, 'Salon');
  assert.equal(salon.querySelector('.room-values').textContent, 'Saugstufe Turbo · Wasser 16 · 2 Durchgänge');
});

test('M13 CSS: Raumname fett, Werte sekundär, Chevron am Ende, gedrückter Zustand', () => {
  const { DIALOG_STYLES } = aufbau().I;
  const regel = (sel) => { const i = DIALOG_STYLES.indexOf('\n' + sel + ' {'); return i < 0 ? null : DIALOG_STYLES.slice(i, DIALOG_STYLES.indexOf('}', i)); };
  assert.match(regel('.room-name'), /font-weight: var\(--ha-font-weight-medium, 500\);/);
  assert.match(regel('.room-values'), /color: var\(--secondary-text-color/);
  assert.match(regel('.menu-item[data-room] .room-chevron'), /margin-inline-start: auto;/);
  assert.match(regel('.menu-item[data-room]:active'), /background: var\(--secondary-background-color/);
});
