'use strict';

// #1011 Kartenwähler: keine Live-Vorschau, ein Satz Beschreibung, billige Vorgabe.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung } = require('./attrappe.js');

test('Kartenwähler-Eintrag: preview false, Name „Busch …“ und ein Satz Beschreibung (de und en)', () => {
  for (const sprache of ['de-DE', 'en-US']) {
    const e = neueUmgebung({ sprache }).kontext.window.customCards.find((c) => c.type === 'busch-vacuum-card');
    assert.strictEqual(e.preview, false);
    assert.match(e.name, /^Busch \S/);
    assert.match(e.description, /^[A-ZÄÖÜ].*[^.]\.$/, e.description);
    assert.ok(!/[.!?] /.test(e.description), e.description);
  }
});

test('getStubConfig: ein Durchlauf über hass.states je Wählerbesuch, gleiche Vorgabe wie bisher', () => {
  const Karte = neueUmgebung().registry.get('busch-vacuum-card');
  let durchlaeufe = 0;
  const states = { 'sensor.x': { entity_id: 'sensor.x', state: '1', attributes: {} }, 'vacuum.robi': { entity_id: 'vacuum.robi', state: 'docked', attributes: {} } };
  const netz = () => { throw new Error('Netz im Kartenwähler'); };
  const hass = { states: new Proxy(states, { ownKeys(t) { durchlaeufe++; return Reflect.ownKeys(t); } }), entities: {}, callWS: netz, callService: netz };
  for (let i = 0; i < 3; i++) assert.strictEqual(Karte.getStubConfig(hass).entity, 'vacuum.robi');
  assert.ok(durchlaeufe <= 1, `hass.states ${durchlaeufe}× durchlaufen`);
  assert.strictEqual(Karte.getStubConfig(hass, ['sensor.x']).entity, '');
  assert.strictEqual(Karte.getStubConfig({ states: {} }).entity, '');
});
