'use strict';
// Modul history (Plan 2026-11-10): Reinigungs- und Cruising-Verlauf, Detail je Lauf,
// Karte des Laufs, Hindernisse, „Nochmal reinigen“. Verlaufsdaten nur synthetisch.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const HIST = 'sensor.robo_cleaning_history';

function aufbau(name = 'voll', { states, config, services, haus: mitHaus } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (states) haus.states = Object.assign({}, haus.states, states(haus.states));
  if (services) haus.services = services(haus.services);
  if (mitHaus) mitHaus(haus);
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
/** Ein Verlaufssensor mit genau diesen Läufen (Schlüssel → Eintrag). */
const sensor = (laeufe, id = HIST) => ({ entity_id: id, state: '2026-11-09T12:47:09+00:00', attributes: Object.assign({ friendly_name: 'Verlauf' }, laeufe) });

// ── Task 1: Läufe, Stufen, Gruppen, Summen ──────────────────────────────────

test('historyRuns: Fixture voll — 30 Läufe nach timestamp absteigend', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(haus.states[HIST]);
  assert.equal(runs.length, 30);
  const ts = runs.map((r) => r.timestamp);
  assert.deepEqual(ts, ts.slice().sort((a, b) => b - a));
  assert.equal(runs[0].key, '11-09 13:47');
  assert.equal(runs.at(-1).key, '10-20 15:06');
});

test('historyRuns: Sortierung nach timestamp, nicht nach dem Schlüsseltext (Jahreswechsel)', () => {
  const { I } = aufbau();
  const runs = I.historyRuns(sensor({
    '12-31 23:50': { timestamp: 1798761000, cleaning_time: '5 min', cleaned_area: '3 m²', completed: true },
    '2027-01-01 00:20': { timestamp: 1798762800, cleaning_time: '7 min', cleaned_area: '4 m²', completed: true },
    '01-02 08:00': { timestamp: 1798876800, cleaning_time: '9 min', cleaned_area: '5 m²', completed: true },
    friendly_name: 'kein Lauf', icon: 'mdi:x'
  }));
  assert.deepEqual(runs.map((r) => r.key), ['01-02 08:00', '2027-01-01 00:20', '12-31 23:50']);
});

test('historyRuns: Stufen unterbrochen / auffällig / fertig', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(haus.states[HIST]);
  const stufe = (key) => runs.find((r) => r.key === key).level;
  assert.equal(stufe('10-22 07:52'), 'interrupted', 'completed false schlägt blockierte Räume');
  assert.equal(stufe('11-03 07:46'), 'interrupted');
  assert.equal(stufe('11-09 13:47'), 'notice', 'blockierte Räume');
  assert.equal(stufe('11-04 08:36'), 'done', 'leeres blocked_rooms ist kein Befund');
  assert.equal(stufe('10-29 10:03'), 'done');
  const syn = I.historyRuns(sensor({ a: { timestamp: 5, completed: true, interrupt_reason: 'Robot lifted' } }));
  assert.equal(syn[0].level, 'notice', 'Unterbrechungsgrund bei fertigem Lauf');
});

test('historyRuns: Gruppen über gleiches multiple_cleaning_time (nur ab zwei Läufen)', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(haus.states[HIST]);
  const g = (key) => runs.find((r) => r.key === key).group;
  assert.equal(g('11-09 13:47'), '1794228271');
  assert.equal(g('11-09 12:46'), '1794228271');
  assert.equal(g('10-29 10:03'), null, 'eigenes multiple_cleaning_time ohne Partner');
  assert.equal(g('11-07 11:38'), null, 'ohne multiple_cleaning_time');
});

test('historySums: Fläche, Zeit, Anzahl aus den Texten; ft² mit HA-Einheiten', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(sensor({
    a: { timestamp: 3, cleaning_time: '50 min', cleaned_area: '10 m²' },
    b: { timestamp: 2, cleaning_time: '25 min', cleaned_area: '24 m²' },
    c: { timestamp: 1, cleaning_time: 'kaputt', cleaned_area: '' }
  }));
  const hass = haus.hass();
  const s = I.historySums(runs, hass);
  assert.equal(s.count, 3);
  assert.equal(s.area, 34);
  assert.equal(s.minutes, 75);
  assert.equal(s.areaText, '34 m²');
  assert.equal(s.timeText, '1 h 15 min');
  const us = Object.assign({}, hass, { config: { unit_system: { length: 'mi' } } });
  const f = I.historySums(runs, us);
  assert.equal(f.areaText, '366 ft²', '34 m² × 10,7639');
  assert.equal(I.historySums(I.historyRuns(haus.states[HIST]), hass).count, 30);
});
