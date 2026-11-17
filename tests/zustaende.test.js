'use strict';
// M15 (Buschcheck 17.11.2026, F4): Sonderzustände der Karte mit Hinweis in der Karte.
// Roboter nicht verfügbar/unbekannt: die Leiste bleibt sichtbar, Start ist gesperrt und
// nennt den Grund (role=alert), es geht kein Dienstaufruf hinaus.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');
const { sauger } = require('./hilfen.js');

const knoepfe = (karte) => karte.shadowRoot.querySelectorAll('.ctl');
const grundVon = (karte) => karte.shadowRoot.querySelectorAll('.message').find((m) => m.getAttribute('data-kind') === 'offline') || null;
const start = (karte) => knoepfe(karte).find((b) => b.getAttribute('data-action') === 'start');

function karteIm(zustand, sprache = 'de') {
  const u = neueUmgebung({ sprache }), haus = hausAus('voll', { sprache });
  haus.states = Object.assign({}, haus.states, sauger(haus, {}, zustand));
  return { u, haus, karte: neueKarte(u, haus) };
}

for (const zustand of ['unavailable', 'unknown']) {
  test(`M15 CORE-07/CORE-10 ${zustand} sperrt Start: Knopf gesperrt, Grund als alert verknüpft, kein Aufruf`, () => {
    const { haus, karte } = karteIm(zustand);
    const knopf = start(karte);
    assert.ok(knopf, 'Start bleibt sichtbar (gesperrte Leiste statt leerer)');
    assert.equal(knopf.disabled, true);
    assert.deepEqual(knoepfe(karte).filter((b) => !b.disabled && ['start', 'pause', 'stop', 'return', 'resume'].includes(b.getAttribute('data-action'))), [],
      'kein Fahrbefehl bedienbar');
    const grund = grundVon(karte);
    assert.ok(grund, 'Hinweis steht in der Karte');
    assert.equal(grund.getAttribute('role'), 'alert');
    assert.equal(knopf.getAttribute('aria-describedby'), grund.id);
    assert.match(grund.textContent, /nicht erreichbar/i);
    assert.match(grund.textContent, /gesperrt/);
    assert.equal(grund.querySelector('[data-action="dismiss"]'), null, 'der Sperrgrund lässt sich nicht wegklicken');
    knopf.click();
    assert.deepEqual(haus.rufe, []);
  });
}

test('M15 CORE-10 verfügbarer Roboter: kein Sperrhinweis, Start bedienbar', () => {
  const { karte } = karteIm('docked');
  assert.equal(grundVon(karte), null);
  assert.equal(start(karte).disabled, false);
});

test('M15 CORE-16 Sperrhinweis auf Englisch', () => {
  const { karte } = karteIm('unavailable', 'en');
  const grund = grundVon(karte);
  assert.match(grund.textContent, /unreachable/i);
  assert.match(grund.textContent, /locked/);
});

test('M15 Roboter wird wieder verfügbar: Hinweis weg, Start frei', () => {
  const { haus, karte } = karteIm('unavailable');
  karte.hass = haus.setze(sauger(haus, {}, 'docked'));
  assert.equal(grundVon(karte), null);
  assert.equal(start(karte).disabled, false);
  assert.equal(start(karte).getAttribute('aria-describedby'), null);
});
