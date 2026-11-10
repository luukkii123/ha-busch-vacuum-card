'use strict';
// Plan Task 4 (CORE-06/09/10): Aufgabenwahl, Meldungen, Fortschrittsbalken.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

const $ = (karte, sel) => karte.shadowRoot.querySelector(sel);
const $$ = (karte, sel) => karte.shadowRoot.querySelectorAll(sel);
const arten = (karte) => $$(karte, '.task').map((b) => b.getAttribute('data-task'));
const art = (karte, name) => $$(karte, '.task').find((b) => b.getAttribute('data-task') === name);
const gewaehlt = (karte) => $$(karte, '.task').filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.getAttribute('data-task'));
const knopf = (karte, aktion) => $$(karte, '.ctl').find((b) => b.getAttribute('data-action') === aktion);
const meldungen = (karte) => $$(karte, '.message').map((m) => m.getAttribute('data-kind'));
const meldung = (karte, kind) => $$(karte, '.message').find((m) => m.getAttribute('data-kind') === kind);
const roh = (x) => JSON.parse(JSON.stringify(x));

function sauger(haus, zustand, attribute = {}) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand, attributes: Object.assign({}, alt.attributes, attribute) } };
}
function karteMit(name, zustand, attribute, extra = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (zustand) haus.states = Object.assign({}, haus.states, sauger(haus, zustand, attribute), extra);
  return { u, haus, karte: neueKarte(u, haus) };
}
const fehlerSensor = (state, beschreibung) => ({ 'sensor.robo_error': { entity_id: 'sensor.robo_error', state, attributes: { description: beschreibung, friendly_name: 'Robo Fehler' } } });

// ── Aufgabenwahl (CORE-06) ─────────────────────────────────────────────────
test('voll: fünf Aufgabenarten mit Text, Gesamt vorgewählt', () => {
  const { karte, u } = karteMit('voll');
  assert.deepEqual(arten(karte), ['all', 'room', 'zone', 'spot', 'goto']);
  assert.deepEqual(gewaehlt(karte), ['all']);
  assert.equal($(karte, '.tasks').getAttribute('role'), 'radiogroup');
  for (const b of $$(karte, '.task')) assert.ok(b.textContent.trim() && b.getAttribute('aria-label'), 'Text, nicht nur Symbol');
  assert.equal(art(karte, 'all').textContent, 'Gesamt');
  assert.deepEqual(u.fehler, []);
});

test('ohne Karte oder minimal: nur Gesamt möglich, keine leere Auswahl', () => {
  assert.equal($(karteMit('ohne-karte').karte, '.tasks'), null);
  assert.equal($(karteMit('minimal').karte, '.tasks'), null);
});

test('Karten-Art ohne Auswahl: Start gesperrt mit Grund (statt „braucht die Karte“), kein Dienstaufruf', () => {
  const { karte, haus } = karteMit('voll');
  art(karte, 'room').click();
  assert.deepEqual(gewaehlt(karte), ['room']);
  assert.match($(karte, '.task-hint').textContent, /Noch kein Raum gewählt/);
  assert.doesNotMatch(karte.shadowRoot.textContent, /braucht die Karte/);
  const start = knopf(karte, 'start');
  assert.equal(start.disabled, true);
  assert.equal(start.getAttribute('aria-describedby'), 'task-hint');
  start.click();
  assert.deepEqual(haus.rufe, []);
  art(karte, 'all').click();
  assert.equal($(karte, '.task-hint'), null);
  assert.equal(knopf(karte, 'start').disabled, false);
});

test('Wahl bleibt bei fremden Updates und eigenen Zustandswechseln erhalten', () => {
  const { karte, haus } = karteMit('voll');
  art(karte, 'zone').click();
  karte.hass = haus.fremd();
  karte.hass = haus.setze(sauger(haus, 'idle'));
  assert.deepEqual(gewaehlt(karte), ['zone']);
});

test('laufende Aufgabe sperrt die Wahl und zeigt die laufende Art', () => {
  const { karte } = karteMit('voll', 'cleaning', { started: true, segment_cleaning: true });
  assert.deepEqual(gewaehlt(karte), ['room']);
  for (const b of $$(karte, '.task')) assert.equal(b.disabled, true);
  assert.equal($(karte, '.task-hint'), null, 'kein Karten-Hinweis während die Aufgabe läuft');
  assert.match($(karte, '.task-badge').textContent, /Aufgabe läuft/);
});

test('pausiert ist die Aufgabe weiter aktiv; angedockt nicht', () => {
  assert.equal(art(karteMit('voll', 'paused', { started: true }).karte, 'all').disabled, true);
  assert.equal(art(karteMit('voll', 'docked', { started: false }).karte, 'all').disabled, false);
});

test('Symbol mit Text: geplante und Shortcut-Aufgabe', () => {
  const geplant = $(karteMit('voll', 'cleaning', { started: true, scheduled_clean: true }).karte, '.task-badge');
  assert.match(geplant.textContent, /Geplante Aufgabe/);
  assert.equal(geplant.querySelector('ha-icon').getAttribute('icon'), 'mdi:calendar-clock');
  const shortcut = $(karteMit('voll', 'cleaning', { started: true, shortcut_task: true }).karte, '.task-badge');
  assert.match(shortcut.textContent, /Shortcut/);
  assert.equal($(karteMit('voll').karte, '.task-badge'), null, 'ohne Aufgabe kein Symbol');
});

// ── Meldungen (CORE-10) ─────────────────────────────────────────────────────
test('ohne Befund keine Meldungen', () => {
  assert.deepEqual(meldungen(karteMit('voll').karte), []);
  assert.deepEqual(meldungen(karteMit('minimal').karte), []);
});

test('Fehler: Text aus HAs Fehlersensor, Stufe als Wort (nicht nur Farbe)', () => {
  const { karte } = karteMit('voll', 'error', { has_error: true, error: 'Wheels blocked' }, fehlerSensor('wheels_blocked', 'Räder blockiert'));
  assert.deepEqual(meldungen(karte), ['error']);
  const m = meldung(karte, 'error');
  assert.equal(m.getAttribute('role'), 'alert');
  assert.match(m.textContent, /Fehler/);
  assert.match(m.textContent, /Räder blockiert/);
  assert.equal(m.querySelector('[data-action="clear"]'), null, 'Fehler lassen sich nicht löschen');
});

test('ohne Fehlersensor: Text aus dem Sauger-Attribut', () => {
  const u = neueUmgebung(), haus = hausAus('voll');
  const { 'sensor.robo_error': _weg, ...ohne } = haus.states;
  haus.states = Object.assign(ohne, sauger(haus, 'error', { has_error: true, error: 'Wheels blocked' }));
  assert.match(meldung(neueKarte(u, haus), 'error').textContent, /Wheels blocked/);
});

test('Warnung: über button.*_clear_warning löschbar', () => {
  const { karte, haus } = karteMit('voll', 'docked', { has_error: false, error: 'Remove mop' }, fehlerSensor('remove_mop', 'Mopp abnehmen'));
  const m = meldung(karte, 'warning');
  assert.match(m.textContent, /Warnung/);
  assert.match(m.textContent, /Mopp abnehmen/);
  m.querySelector('[data-action="clear"]').click();
  assert.deepEqual(roh(haus.rufe), [{ domain: 'button', service: 'press', data: { entity_id: 'button.robo_clear_warning' } }]);
});

function ohneLoeschknopf(services) {
  const u = neueUmgebung(), haus = hausAus('voll');
  const { 'button.robo_clear_warning': _a, ...states } = haus.states;
  const { 'button.robo_clear_warning': _b, ...entities } = haus.entities;
  haus.states = Object.assign(states, sauger(haus, 'docked', { error: 'Remove mop' }));
  haus.entities = entities;
  if (services) haus.services = services(haus.services);
  return { haus, karte: neueKarte(u, haus) };
}

test('Warnung ohne Knopf: Dienst vacuum_clear_warning nur, wenn vorhanden', () => {
  const ohne = ohneLoeschknopf();
  assert.equal(meldung(ohne.karte, 'warning').querySelector('[data-action="clear"]'), null);
  const mit = ohneLoeschknopf((s) => Object.assign({}, s, { dreame_vacuum: Object.assign({}, s.dreame_vacuum, { vacuum_clear_warning: { fields: {} } }) }));
  meldung(mit.karte, 'warning').querySelector('[data-action="clear"]').click();
  assert.deepEqual(roh(mit.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_clear_warning', data: { entity_id: 'vacuum.robo' } }]);
});

test('Wassermangel als eigene Meldung', () => {
  const { karte } = karteMit('voll', 'docked', { low_water: true, low_water_warning: 'Please fill clean water tank' });
  const m = meldung(karte, 'low_water');
  assert.match(m.textContent, /Wassermangel/);
  assert.match(m.textContent, /Please fill clean water tank/);
});

test('Info: unterbrochene Reinigung lädt und setzt fort', () => {
  const { karte } = karteMit('voll', 'docked', { cleaning_paused: 1, started: true });
  assert.match(meldung(karte, 'info').textContent, /Hinweis/);
});

test('wegwischen merkt bis zum neuen Zustand', () => {
  const { karte, haus } = karteMit('voll', 'docked', { error: 'Remove mop' });
  meldung(karte, 'warning').querySelector('[data-action="dismiss"]').click();
  assert.deepEqual(meldungen(karte), []);
  karte.hass = haus.fremd();
  karte.hass = haus.setze(sauger(haus, 'docked', { error: 'Remove mop', battery: 99 }));
  assert.deepEqual(meldungen(karte), [], 'gleiche Meldung bleibt weg');
  karte.hass = haus.setze(sauger(haus, 'docked', { error: 'Clean mop pad' }));
  assert.deepEqual(meldungen(karte), ['warning'], 'neue Meldung erscheint');
  meldung(karte, 'warning').querySelector('[data-action="dismiss"]').click();
  karte.hass = haus.setze(sauger(haus, 'docked', { error: 'No error' }));
  karte.hass = haus.setze(sauger(haus, 'docked', { error: 'Clean mop pad' }));
  assert.deepEqual(meldungen(karte), ['warning'], 'nach Ende und Wiederkehr wieder sichtbar');
});

test('Meldungsknöpfe haben Namen', () => {
  const m = meldung(karteMit('voll', 'docked', { error: 'Remove mop' }).karte, 'warning');
  for (const b of m.querySelectorAll('button')) assert.ok(b.getAttribute('aria-label'));
});

// ── Fortschritt (CORE-09) ──────────────────────────────────────────────────
const fortschritt = (wert) => ({ 'sensor.robo_cleaning_progress': { entity_id: 'sensor.robo_cleaning_progress', state: wert, attributes: { unit_of_measurement: '%' } } });

test('Fortschrittsbalken bei laufender Aufgabe mit cleaning_progress', () => {
  const { karte } = karteMit('voll', 'cleaning', { started: true, cleaning_progress: 10 }, fortschritt('42'));
  const balken = $(karte, '.progress');
  assert.equal(Number(balken.value), 42);
  assert.match(balken.getAttribute('aria-label'), /42/);
});

test('ohne Sensor: Fortschritt aus dem Attribut', () => {
  const { karte } = karteMit('voll', 'cleaning', { started: true, cleaning_progress: 10 }, fortschritt('unavailable'));
  assert.equal(Number($(karte, '.progress').value), 10);
});

test('kein Balken ohne Aufgabe oder ohne Fähigkeit', () => {
  assert.equal($(karteMit('voll').karte, '.progress'), null);
  assert.equal($(karteMit('minimal', 'cleaning', { started: true, cleaning_progress: 40 }).karte, '.progress'), null);
});

test('Fortschritt aktualisiert ohne Neubau der Knöpfe bei fremden Updates', () => {
  const { karte, haus } = karteMit('voll', 'cleaning', { started: true }, fortschritt('42'));
  const vorher = knopf(karte, 'pause');
  karte.hass = haus.fremd();
  assert.equal(knopf(karte, 'pause'), vorher);
  karte.hass = haus.setze(fortschritt('55'));
  assert.equal(Number($(karte, '.progress').value), 55, 'Fortschrittssensor wird beobachtet');
});
