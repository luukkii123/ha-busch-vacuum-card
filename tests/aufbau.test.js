'use strict';
// #1002: Panelinhalt, Kontextbereich, Aktionsleiste und Kartenwerkzeuge nach dem Designkonzept.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

function aufbau({ fixture = 'voll', attribute, zustand, config, breite } = {}) {
  const u = neueUmgebung();
  const beobachter = [];
  u.kontext.ResizeObserver = class { constructor(fn) { this.fn = fn; this.ziele = []; beobachter.push(this); } observe(el) { this.ziele.push(el); } disconnect() {} };
  const haus = hausAus(fixture);
  if (attribute || zustand) {
    const alt = haus.states['vacuum.robo'];
    haus.states = Object.assign({}, haus.states, { 'vacuum.robo': Object.assign({}, alt, { state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) }) });
  }
  const karte = neueKarte(u, haus, config);
  const setze = (w) => { for (const b of beobachter) if (b.ziele.includes(karte)) b.fn([{ target: karte, contentRect: { width: w, height: 800 } }]); };
  if (breite) setze(breite);
  return { u, haus, karte, setze, sr: karte.shadowRoot };
}
const $ = (k, sel) => k.sr.querySelector(sel);
const $$ = (k, sel) => k.sr.querySelectorAll(sel);
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const ansichtId = (u) => { const d = dialogVon(u); const s = d && d.shadowRoot.querySelector('.sheet'); return s ? s.getAttribute('data-view') : null; };
const aufgabe = (k, name) => $$(k, '.task').find((b) => b.getAttribute('data-task') === name);
const ctl = (k, name) => $$(k, '.ctl').find((b) => b.getAttribute('data-action') === name);

// ── Task 2: Panelinhalt ──────────────────────────────────────────────────
test('CORE-09 Statuskacheln in der Reihenfolge Akku, Fläche, Zeit', () => {
  const k = aufbau();
  assert.deepEqual($$(k, '.metric').map((m) => m.getAttribute('data-metric')), ['battery', 'area', 'time']);
});

test('CORE-03 Statuspunkt: Zustandszeile trägt eine Stufe (Farbe nie allein, Text bleibt)', () => {
  assert.equal($(aufbau(), '.state').getAttribute('data-level'), 'ok');
  assert.equal($(aufbau({ zustand: 'cleaning' }), '.state').getAttribute('data-level'), 'active');
  const fehler = $(aufbau({ zustand: 'error' }), '.state');
  assert.equal(fehler.getAttribute('data-level'), 'error');
  assert.ok(fehler.textContent.length > 0);
});

test('DOCK-05 Stationshinweis nur bei Warnung oder Fehler der Station; Tipp öffnet die Station', () => {
  const ok = aufbau();
  assert.equal($(ok, '.station-hint'), null, 'alles gut: kein Hinweis');
  const warn = aufbau({ attribute: { clean_water_tank_status: 'Low water' } });
  const hint = $(warn, '.station-hint');
  assert.ok(hint, 'Warnung: Hinweis da');
  assert.equal(hint.getAttribute('data-level'), 'warning');
  assert.equal(hint.getAttribute('data-action'), 'station-hint');
  assert.match(hint.textContent, /Station/);
  assert.match(hint.textContent, /Frischwasser/i);
  assert.ok($(warn, '.panel').contains ? true : true);
  hint.click();
  assert.equal(ansichtId(warn.u), 'station', 'öffnet die Stationsansicht');
  const err = aufbau({ attribute: { clean_water_tank_status: 'Not installed' } });
  assert.equal($(err, '.station-hint').getAttribute('data-level'), 'error');
  const aus = aufbau({ attribute: { clean_water_tank_status: 'Low water' }, config: { hidden_card_objects: ['dock_status_indicator'] } });
  assert.equal($(aus, '.station-hint'), null, 'mit dem Stationsanzeiger ausgeblendet');
  assert.equal($(aufbau({ fixture: 'ohne-dock', attribute: { clean_water_tank_status: 'Low water' } }), '.station-hint'), null, 'ohne Station nie');
});

test('CORE-06 Segmentsteuerung: fünf Arten als Radiogruppe, Go-To heißt auf Deutsch „Ziel“', () => {
  const k = aufbau();
  const gruppe = $(k, '.tasks');
  assert.equal(gruppe.getAttribute('role'), 'radiogroup');
  assert.deepEqual($$(k, '.task').map((b) => b.textContent), ['Gesamt', 'Raum', 'Zone', 'Spot', 'Ziel']);
  assert.equal(aufgabe(k, 'goto').getAttribute('aria-label'), 'Ziel');
});

test('SET-01 Einstellungszeile fasst Modus · Saugstufe · Feuchte zusammen und öffnet die Reinigungseinstellungen', () => {
  const k = aufbau();
  const zeile = $(k, '[data-action="clean-settings"]');
  assert.ok(zeile.classList.contains('settings-row'));
  const text = zeile.querySelector('.settings-summary').textContent;
  assert.equal(text.split(' · ').length, 3, text);
  assert.match(text, /Turbo/);
  assert.match(text, /26/);
  assert.match(zeile.getAttribute('aria-label'), /^Reinigungseinstellungen: /);
  zeile.click();
  assert.equal(ansichtId(k.u), 'clean-settings');
});
