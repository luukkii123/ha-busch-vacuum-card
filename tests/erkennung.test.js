'use strict';
// Plan Task 2 (CORE-01/02): verwandte Entitäten über das Gerät finden, nach Rolle
// ablegen; Fähigkeiten nur über can().
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8'));
const roh = (x) => JSON.parse(JSON.stringify(x));
function modell(name, optionen) {
  const u = neueUmgebung();
  const { VacuumModel } = u.registry.get('busch-vacuum-card').__internals;
  return new VacuumModel(hausAus(name, optionen).hass(), 'vacuum.robo');
}
/** Jede Entität genau einer Rolle: Gerät, Raum oder Kamera. */
function rollen(m) {
  const r = roh(m.related);
  return [...Object.values(r.device), ...Object.values(r.rooms).flatMap(Object.values), ...Object.values(r.maps).flat()];
}

test('voll: alle 177 Entitäten des Geräts gefunden, jede genau einer Rolle zugeordnet', () => {
  const m = modell('voll'), f = fixture('voll');
  const ids = roh(m.related.ids);
  assert.equal(ids.length, 177);
  assert.deepEqual([...ids].sort(), Object.keys(f.states).sort());
  const zugeordnet = rollen(m);
  assert.equal(zugeordnet.length, 176, 'alle außer dem Sauger selbst');
  assert.equal(new Set(zugeordnet).size, 176, 'keine doppelt');
  const domains = {};
  for (const id of ids) domains[id.split('.')[0]] = (domains[id.split('.')[0]] || 0) + 1;
  assert.deepEqual(domains, { binary_sensor: 3, button: 16, camera: 3, number: 10, select: 84, sensor: 42, switch: 18, vacuum: 1 });
});

test('voll: Rollen nach Register-Schlüssel, Räume und Karten getrennt', () => {
  const r = roh(modell('voll').related);
  assert.equal(r.device['select.suction_level'], 'select.robo_suction_level');
  assert.equal(r.device['sensor.battery_level'], 'sensor.robo_battery_level');
  assert.equal(r.device['button.clear_warning'], 'button.robo_clear_warning');
  assert.deepEqual(Object.keys(r.rooms).sort(), ['1', '3', '4', '5', '6', '7', '9']);
  for (const raum of Object.values(r.rooms)) assert.equal(Object.keys(raum).length, 11, 'zehn Selects und eine Feuchte je Raum');
  assert.equal(r.rooms['3']['select.suction_level'], 'select.robo_room_3_suction_level');
  assert.equal(r.rooms['3']['number.wetness_level'], 'number.robo_room_3_wetness_level');
  assert.deepEqual(r.maps, { map: ['camera.robo_map'], saved_map: ['camera.robo_map_1'], wifi_map: ['camera.robo_wifi_map_1'], map_data: [] });
});

test('fremde Entitäten und ein zweites Dreame-Gerät gehören nicht dazu', () => {
  const f = fixture('voll');
  const states = Object.assign({}, f.states, { 'sensor.anderer_battery_level': { entity_id: 'sensor.anderer_battery_level', state: '5', attributes: {} } });
  const entities = Object.assign({}, f.entities, { 'sensor.anderer_battery_level': Object.assign({}, f.entities['sensor.robo_battery_level'], { entity_id: 'sensor.anderer_battery_level', device_id: 'geraet_anderer' }) });
  const ids = roh(modell('voll', { states, entities }).related.ids);
  assert.equal(ids.length, 177);
  assert.ok(!ids.includes('sensor.anderer_battery_level'));
  assert.ok(!ids.some((id) => id.startsWith('sensor.fremd_')));
});

test('ohne device_id im Register: Rückfall über das Präfix der Entitäts-ID', () => {
  const r = roh(modell('voll', { entities: {} }).related);
  assert.equal(r.ids.length, 177);
  assert.equal(r.device['select.suction_level'], 'select.robo_suction_level');
  assert.equal(Object.keys(r.rooms).length, 7);
  assert.deepEqual(r.maps, { map: ['camera.robo_map'], saved_map: ['camera.robo_map_1'], wifi_map: ['camera.robo_wifi_map_1'], map_data: [] });
});

test('minimal: nur der Sauger, nichts fehlt-gemeldet, Karte ohne Fehler', () => {
  const r = roh(modell('minimal').related);
  assert.deepEqual(r, { ids: ['vacuum.robo'], device: {}, rooms: {}, maps: { map: [], saved_map: [], wifi_map: [], map_data: [] } });
  const u = neueUmgebung();
  const karte = neueKarte(u, hausAus('minimal'));
  assert.equal(karte.shadowRoot.querySelector('.error'), null);
  assert.deepEqual(u.fehler, []);
});

test('deaktivierte Entitäten: nicht im Frontend-Register, Wert aber über die Sauger-Attribute lesbar', () => {
  const f = fixture('voll');
  assert.equal(f.disabled.length, 38, "sieben Schalter seit 10.11.2026 aktiviert");
  assert.ok(f.disabled.includes('number.robo_volume'));
  const m = modell('voll');
  assert.equal(m.entity('number.volume'), null);
  assert.equal(m.attr('volume'), 1);
  assert.equal(m.attr('child_lock'), false);
  assert.equal(m.attr('gibt_es_nicht'), undefined);
});

// Erwartete Fähigkeiten je Fixture: [voll, minimal, ohne-dock, ohne-karte]
const TABELLE = {
  start: [1, 1, 1, 1],
  pause: [1, 1, 1, 1],
  stop: [1, 1, 1, 1],
  return_home: [1, 1, 1, 1],
  fan_speed: [1, 1, 1, 1],
  locate: [1, 0, 1, 1],
  clean_spot: [0, 0, 0, 0],
  map: [1, 0, 1, 0],
  dock: [1, 0, 0, 1],
  history: [1, 0, 1, 1],
  cruising: [1, 0, 1, 1],
  self_wash_base: [1, 0, 0, 1],
  auto_empty_base: [1, 0, 0, 1],
  customized_cleaning: [1, 0, 1, 1],
  multi_floor_map: [1, 0, 1, 1],
  shortcuts: [1, 0, 1, 1],
  cleangenius: [1, 0, 1, 1],
  cleaning_progress: [1, 0, 1, 1],
  'vacuum.locate': [1, 1, 1, 1],
  'dreame_vacuum.vacuum_clean_segment': [1, 0, 1, 1],
  'dreame_vacuum.vacuum_set_property': [1, 0, 1, 1],
  'dreame_vacuum.vacuum_clear_warning': [0, 0, 0, 0],
  unbekannt: [0, 0, 0, 0],
};
const NAMEN = ['voll', 'minimal', 'ohne-dock', 'ohne-karte'];
for (const [i, name] of NAMEN.entries()) {
  test(`can() für ${name}`, () => {
    const m = modell(name);
    const ist = Object.fromEntries(Object.keys(TABELLE).map((k) => [k, m.can(k) ? 1 : 0]));
    const soll = Object.fromEntries(Object.entries(TABELLE).map(([k, v]) => [k, v[i]]));
    assert.deepEqual(ist, soll);
  });
}

test('can() ist die einzige Stelle: keine capabilities-Abfrage außerhalb des Modells', () => {
  const zeilen = fs.readFileSync(path.join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8').split('\n');
  const anfang = zeilen.indexOf('class VacuumModel {');
  const ende = zeilen.indexOf('}', anfang);
  assert.ok(anfang > 0 && ende > anfang, 'VacuumModel gefunden');
  const draussen = zeilen.filter((z, i) => (i < anfang || i > ende) && /\.caps\b|capabilities|supported_features|VACUUM_FEATURES\[/.test(z) && !/^\s*(\/\/|\*|\/\*)/.test(z));
  assert.deepEqual(draussen, [], 'Fähigkeiten nur im VacuumModel abgefragt');
});
