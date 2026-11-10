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

// ── Task 2: Liste und Menüeinträge ──────────────────────────────────────────

const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const menueEintraege = (k) => {
  k.karte.shadowRoot.querySelector('.menu-button').click();
  const liste = $$d(k.u, '.menu-item').map((b) => b.getAttribute('data-entry'));
  dialogVon(k.u).remove();
  return liste;
};
/** Öffnet Menü → Eintrag (history / cruising_history). */
function oeffne(k, name = 'history') {
  k.karte.shadowRoot.querySelector('.menu-button').click();
  $$d(k.u, '.menu-item').find((b) => b.getAttribute('data-entry') === name).click();
}
const HA_TEXTE = {
  'component.dreame_vacuum.entity.sensor.status.state.room_cleaning': 'Raumreinigung',
  'component.dreame_vacuum.entity.sensor.status.state.cleaning': 'Reinigen',
  'component.dreame_vacuum.entity.sensor.startup_method.state.app': 'App',
  'component.dreame_vacuum.entity.sensor.cleanup_method.state.default': 'Standard'
};
const mitTexten = (haus) => { const h = haus.hass; haus.hass = () => Object.assign(h(), { localize: (id) => HA_TEXTE[id] || '' }); };
const taste = (el, key, extra = {}) => el.dispatchEvent({ type: 'keydown', key, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra });

test('Menü: history/cruising_history aus MODULE_VIEWS statt Platzhalter', () => {
  const k = aufbau();
  assert.equal(typeof k.I.MODULE_VIEWS.history, 'function');
  assert.equal(typeof k.I.MODULE_VIEWS.cruising_history, 'function');
  oeffne(k);
  assert.equal($d(k.u, 'h1').textContent, 'Reinigungsverlauf');
  assert.equal($d(k.u, '.placeholder'), null);
  assert.ok($$d(k.u, '[data-run]').length > 0);
});

test("can('cruising_history') = Fähigkeit cruising und Sensor; hidden_card_objects blendet aus", () => {
  assert.ok(menueEintraege(aufbau()).includes('cruising_history'));
  const ohneCap = aufbau('voll', { states: (s) => ({ 'vacuum.robo': Object.assign({}, s['vacuum.robo'], { attributes: Object.assign({}, s['vacuum.robo'].attributes, { capabilities: s['vacuum.robo'].attributes.capabilities.filter((c) => c !== 'cruising') }) }) }) });
  assert.equal(ohneCap.model().can('cruising_history'), false);
  assert.ok(!menueEintraege(ohneCap).includes('cruising_history'));
  const ohneSensor = aufbau('voll', { haus: (h) => {
    h.entities = Object.fromEntries(Object.entries(h.entities).filter(([id]) => id !== 'sensor.robo_cruising_history'));
    h.states = Object.fromEntries(Object.entries(h.states).filter(([id]) => id !== 'sensor.robo_cruising_history'));
  } });
  assert.equal(ohneSensor.model().can('cruising_history'), false);
  assert.ok(!menueEintraege(ohneSensor).includes('cruising_history'));
  const versteckt = aufbau('voll', { config: { hidden_card_objects: ['cruising_history'] } });
  const e = menueEintraege(versteckt);
  assert.ok(e.includes('history') && !e.includes('cruising_history'));
});

test('Liste: Datum nach HA, Status übersetzt (Rückfall Rohtext), Fläche, Dauer, Statuspunkt mit Symbol und Wort', () => {
  const k = aufbau('voll', { haus: mitTexten });
  oeffne(k);
  // Gruppen zu: oberste Zeile ist der Kopf der Gruppe 1794228271.
  const kopf = $d(k.u, '[data-group="1794228271"]');
  assert.ok(kopf, 'Gruppenkopf');
  assert.equal(kopf.getAttribute('aria-expanded'), 'false');
  kopf.click();
  const zeile = $d(k.u, '[data-run="1794228429"]');
  assert.ok(zeile, 'neuester Lauf nach Aufklappen');
  const text = zeile.textContent;
  assert.match(text, /09\.11\./);
  const d = new Date(1794228429 * 1000), zwei = (n) => String(n).padStart(2, '0');
  assert.ok(text.includes(zwei(d.getHours()) + ':' + zwei(d.getMinutes())), 'Uhrzeit 24 h nach HA (Zeitzone des Prozesses)');
  assert.match(text, /Reinigen/, 'HA-Übersetzung des Status');
  assert.match(text, /24 m²/);
  assert.match(text, /53 min/);
  const punkt = zeile.querySelector('.run-status');
  assert.equal(punkt.getAttribute('data-level'), 'notice');
  assert.ok(punkt.querySelector('ha-icon'), 'Symbol');
  assert.match(punkt.textContent, /Auffällig/, 'Wort, nicht nur Farbe (R17)');
  // Rohtext ohne HA-Übersetzung
  const k2 = aufbau('voll', { states: () => ({ [HIST]: sensor({ a: { timestamp: 1794228429, status: 'Mystery mode', completed: false, cleaned_area: '1 m²', cleaning_time: '2 min' } }) }) });
  oeffne(k2);
  const z2 = $d(k2.u, '[data-run="1794228429"]');
  assert.match(z2.textContent, /Mystery mode/);
  assert.equal(z2.querySelector('.run-status').getAttribute('data-level'), 'interrupted');
  assert.match(z2.querySelector('.run-status').textContent, /Unterbrochen/);
});

test('Liste: Gruppen per Shift+Plus/Minus auf- und zuklappen; Summenzeile', () => {
  const k = aufbau();
  oeffne(k);
  const summe = $d(k.u, '.history-sums');
  assert.match(summe.textContent, /30 Läufe/);
  assert.match(summe.textContent, /\d+ m²/);
  assert.match(summe.textContent, /\d+ h \d+ min/);
  let kopf = $d(k.u, '[data-group="1794228271"]');
  assert.match(kopf.textContent, /2 Läufe/);
  assert.match(kopf.textContent, /58 m²/, 'Gruppensumme 34 + 24');
  taste(kopf, '+', { shiftKey: true });
  kopf = $d(k.u, '[data-group="1794228271"]');
  assert.equal(kopf.getAttribute('aria-expanded'), 'true');
  assert.ok($d(k.u, '[data-run="1794224793"]'));
  taste(kopf, '-', { shiftKey: true });
  assert.equal($d(k.u, '[data-group="1794228271"]').getAttribute('aria-expanded'), 'false');
  assert.equal($d(k.u, '[data-run="1794224793"]'), null);
  // Einzelläufe stehen ohne Kopf in der Liste.
  assert.ok($d(k.u, '[data-run="1794047923"]'), '11-07 11:38 ohne Gruppe');
});

test('Leerzustand ohne Läufe und ohne Sensorwert (R18)', () => {
  for (const s of [sensor({}), { entity_id: HIST, state: 'unavailable', attributes: {} }]) {
    const k = aufbau('voll', { states: () => ({ [HIST]: s }) });
    oeffne(k);
    assert.equal($$d(k.u, '[data-run]').length, 0);
    assert.match($d(k.u, '.history-empty').textContent, /Kein Verlauf/);
    assert.match($d(k.u, '.history-empty').textContent, /Cloud/);
  }
});

test('Snapshot: fremde Updates zeichnen die Liste nicht neu, ein neuer Sensorwert schon', () => {
  const k = aufbau();
  oeffne(k);
  const vorher = $d(k.u, '.history-list');
  dialogVon(k.u).hass = k.haus.fremd();
  assert.equal($d(k.u, '.history-list'), vorher);
  const s = k.haus.states[HIST];
  dialogVon(k.u).hass = k.haus.setze({ [HIST]: Object.assign({}, s, { attributes: Object.assign({}, s.attributes, { '11-10 08:00': { timestamp: 1794297600, completed: true, cleaned_area: '5 m²', cleaning_time: '6 min' } }) }) });
  assert.notEqual($d(k.u, '.history-list'), vorher);
  assert.ok($d(k.u, '[data-run="1794297600"]'));
});
