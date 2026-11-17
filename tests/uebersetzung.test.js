'use strict';
// M21 Harnessteil (Buschcheck 17.11.2026, D6/W12): Übersetzungspfad prüfbar.
// tests/fixtures/uebersetzung-de.json ist eine SYNTHETISCHE Tabelle im Schlüsselformat
// von hass.localize; die Attrappe gibt sie mit der Option `uebersetzung` an hass.
// Die deutschen Rückfallwörter ohne localize folgen in E6 (M21 Wörter).
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, uebersetzungDe } = require('./attrappe.js');
const { dialogVon } = require('./hilfen.js');

function karte(optionen = {}) {
  const u = neueUmgebung(), haus = hausAus('voll', optionen);
  return { u, haus, karte: neueKarte(u, haus) };
}
const zusammenfassung = (k) => k.karte.shadowRoot.querySelector('[data-action="clean-settings"]').querySelector('.settings-summary').textContent;

test('M21 Attrappe: localize nur mit Option, Vorgabe unverändert ohne', () => {
  const ohne = hausAus('voll').hass();
  assert.equal(ohne.localize, undefined, 'bestehende Tests sehen kein localize');
  assert.equal(ohne.loadBackendTranslation, undefined);
  const mit = hausAus('voll', { uebersetzung: uebersetzungDe() }).hass();
  assert.equal(mit.localize('component.dreame_vacuum.entity.select.suction_level.state.turbo'), 'Maximal');
  assert.equal(mit.localize('component.dreame_vacuum.entity.select.gibt_es_nicht.name'), '', 'unbekannt → leer wie HA');
  const leer = hausAus('voll', { uebersetzung: {} }).hass();
  assert.equal(leer.localize('component.dreame_vacuum.entity.select.suction_level.state.turbo'), '');
});

test('M21 Fixture: nur Schlüssel der Integration dreame_vacuum, jeder Text nicht leer', () => {
  const texte = uebersetzungDe();
  assert.ok(Object.keys(texte).length >= 20);
  for (const [id, text] of Object.entries(texte)) {
    assert.match(id, /^component\.dreame_vacuum\.entity\.(select|number|switch|sensor)\.[a-z_]+\.(name|state\.[a-z_]+)$/, id);
    assert.ok(typeof text === 'string' && text.trim(), id);
  }
});

test('M21 SET-01 Einstellungszeile mit localize: Modus, Saugstufe und Feuchte in HAs Wörtern', () => {
  const k = karte({ uebersetzung: uebersetzungDe() });
  assert.equal(zusammenfassung(k), 'Wischen nach dem Saugen · Maximal · Feuchtigkeitsstufe 26');
});

test('M21 SET-02 Reinigungseinstellungen mit localize: Optionen der Auswahlfelder übersetzt', () => {
  const k = karte({ uebersetzung: uebersetzungDe() });
  k.karte.shadowRoot.querySelector('[data-action="clean-settings"]').click();
  const blatt = dialogVon(k.u).shadowRoot;
  const feld = blatt.querySelectorAll('select').find((s) => s.childNodes.some((o) => o.value === 'Turbo'));
  assert.ok(feld, 'Saugstufe als Auswahl');
  assert.equal(feld.childNodes.find((o) => o.value === 'Turbo').textContent, 'Maximal');
  assert.ok(k.haus.uebersetzungGeladen.some(([art, integration]) => art === 'entity' && integration === 'dreame_vacuum'),
    'die Ansicht lädt die Integrationstexte nach');
});
