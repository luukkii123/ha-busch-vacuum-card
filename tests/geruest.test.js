'use strict';
// Plan Task 1: Karte registriert sich und rendert mit `entity` einen leeren Rahmen ohne Fehler.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, neuesHaus, neueKarte } = require('./attrappe.js');

test('Karte, Editor und Picker-Eintrag sind registriert', () => {
  const u = neueUmgebung();
  assert.ok(u.registry.get('busch-vacuum-card'), 'Karte definiert');
  assert.ok(u.registry.get('busch-vacuum-card-editor'), 'Editor definiert');
  const eintrag = u.kontext.window.customCards.find((c) => c.type === 'busch-vacuum-card');
  assert.ok(eintrag, 'customCards-Eintrag');
  assert.equal(eintrag.preview, true);
  assert.match(eintrag.name, /Saugroboter/, 'Name deutsch bei deutschem Browser');
  assert.ok(eintrag.description.endsWith('.'));
  assert.equal(u.registry.get('busch-vacuum-card').__internals.version, '0.1.0');
});

test('Picker-Eintrag englisch bei englischem Browser', () => {
  const u = neueUmgebung({ sprache: 'en-US' });
  assert.match(u.kontext.window.customCards[0].name, /vacuum/i);
});

test('mit entity: leerer Rahmen in ha-card, keine Fehler', () => {
  const u = neueUmgebung();
  const karte = neueKarte(u, neuesHaus());
  const card = karte.shadowRoot.querySelector('ha-card');
  assert.ok(card, 'ha-card vorhanden');
  assert.equal(card.querySelector('.error'), null, 'kein Fehlerkasten');
  assert.deepEqual(u.fehler, [], 'keine Konsolenfehler');
});

test('ohne entity: Fehlerkasten im Wörterbuchtext statt Absturz', () => {
  const u = neueUmgebung();
  const karte = u.document.createElement('busch-vacuum-card');
  karte.setConfig({ type: 'custom:busch-vacuum-card' });
  u.body.appendChild(karte);
  karte.hass = neuesHaus().hass();
  const box = karte.shadowRoot.querySelector('.error');
  assert.ok(box, 'Fehlerkasten');
  assert.match(box.textContent, /Saugroboter/);
});

test('falsche Domain wird abgewiesen', () => {
  const u = neueUmgebung();
  const karte = neueKarte(u, neuesHaus(), { entity: 'light.decke' });
  assert.ok(karte.shadowRoot.querySelector('.error'));
});

test('Stub-Konfiguration nimmt den ersten Saugroboter', () => {
  const u = neueUmgebung();
  const Karte = u.registry.get('busch-vacuum-card');
  const stub = Karte.getStubConfig(neuesHaus().hass());
  assert.deepEqual(JSON.parse(JSON.stringify(stub)), { type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' });
});

test('Kartengröße und Raster in Vielfachen von 3', () => {
  const u = neueUmgebung();
  const karte = neueKarte(u, neuesHaus());
  assert.ok(karte.getCardSize() > 0);
  const raster = karte.getGridOptions();
  assert.equal(raster.columns % 3, 0);
  assert.equal(raster.min_columns % 3, 0);
});
