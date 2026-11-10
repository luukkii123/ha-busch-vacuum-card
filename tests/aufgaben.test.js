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
