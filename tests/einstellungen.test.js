'use strict';
// Modul device-settings (Plan 2026-11-10): Einstellungstabelle, Zeile, Schreibweg,
// Übersicht, Gruppen, Nicht stören, Zeitpläne, Zubehör, Geräteinfo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const SCHLUESSEL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'integration-schluessel.json'), 'utf8'));

function sauger(haus, attribute = {}, zustand) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
}

/** Karte mit Fixture; `attribute` ergänzen den Sauger. */
function aufbau(name = 'voll', { attribute, states, zustand } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (attribute || zustand) haus.states = Object.assign({}, haus.states, sauger(haus, attribute, zustand));
  if (states) haus.states = Object.assign({}, haus.states, states);
  const karte = neueKarte(u, haus);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
const zeile = (k, key) => k.I.settingRow(k.karte, k.model(), key);
/** Neuer Sauger-Zustand wie von HA (Karte und Dialog bekommen ihn). */
function neu(k, attribute) { k.karte.hass = k.haus.setze(sauger(k.haus, attribute)); }
const aufrufe = (k) => roh(k.haus.rufe);
const setze = (k, key, value) => ({ domain: 'dreame_vacuum', service: 'vacuum_set_property', data: { entity_id: 'vacuum.robo', key, value } });

// Dialog
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
function menue(k) { k.karte.shadowRoot.querySelector('.menu-button').click(); }
const eintrag = (u, name) => $$d(u, '.menu-item').find((b) => b.getAttribute('data-entry') === name);
function einstellungen(name = 'voll', optionen) {
  const k = aufbau(name, optionen);
  menue(k);
  eintrag(k.u, 'settings').click();
  return k;
}
const gruppe = (k, name) => $$d(k.u, '[data-group]').find((b) => b.getAttribute('data-group') === name);

// ── Task 1: Tabelle, Zustand, Zeile, Schreibweg, Menü-Registry ─────────────────

test('Vollständigkeit: jeder Geräteschlüssel v2.0.3 steht in SETTINGS mit seiner Plattform', () => {
  const { I } = aufbau();
  const fehlt = [], falsch = [];
  for (const [plattform, keys] of Object.entries(SCHLUESSEL.geraet)) {
    for (const key of keys) {
      if (!I.SETTINGS[key]) fehlt.push(key);
      // Je Modell zwei Plattformen: drying_time Auswahl/Zahl, wider_corner_coverage Schalter/Auswahl
      // (select.py/switch.py); die Tabelle führt eine, der Schreibweg ist derselbe.
      else if (I.SETTINGS[key].platform !== plattform && !['drying_time', 'wider_corner_coverage'].includes(key)) falsch.push(key + ':' + plattform);
    }
  }
  assert.deepEqual(fehlt, []);
  assert.deepEqual(falsch, []);
  const alle = new Set(Object.values(SCHLUESSEL.geraet).flat());
  assert.deepEqual(Object.keys(I.SETTINGS).filter((k) => !alle.has(k)), ['custom_mopping_mode'], 'nur belegte Schlüssel ohne Entität');
  assert.equal(SCHLUESSEL.raum.modul, 'clean-settings/map-editor', 'Raumschlüssel gehören zu anderen Modulen');
  for (const key of Object.keys(I.SETTINGS)) assert.ok(I.SETTING_GROUPS.some((g) => g.name === I.SETTINGS[key].group) || ['clean'].includes(I.SETTINGS[key].group), key);
});

test('settingState: Attribut, aktivierte Entität, unbekannt, fehlt', () => {
  const k = aufbau('voll', { attribute: { ai_obstacle_detection: true } });
  const m = k.model();
  const lock = k.I.settingState(k.karte, m, 'child_lock');
  assert.deepEqual([lock.present, lock.known, lock.value, lock.source], [true, true, false, 'attr']);
  const fl = k.I.settingState(k.karte, m, 'mop_extend_frequency');
  assert.deepEqual(roh(fl.options), ['Standard', 'Intelligent', 'High']);
  assert.equal(fl.value, 'High');
  // pet_picture hat kein Attribut; die aktivierte Entität ist hier unbekannt → nie geraten.
  const pet = k.I.settingState(k.karte, m, 'pet_picture');
  assert.deepEqual([pet.present, pet.known, pet.source], [true, false, 'entity']);
  const k2 = aufbau('voll', { states: { 'switch.robo_pet_picture': { entity_id: 'switch.robo_pet_picture', state: 'on', attributes: {} } }, attribute: { ai_obstacle_detection: true } });
  const pet2 = k2.I.settingState(k2.karte, k2.model(), 'pet_picture');
  assert.deepEqual([pet2.known, pet2.value, pet2.source], [true, true, 'entity']);
  const licht = k.I.settingState(k.karte, m, 'camera_light_brightness');
  assert.deepEqual([licht.present, licht.known, licht.min, licht.max], [true, false, 40, 100]);
  assert.equal(k.I.settingState(k.karte, m, 'hair_compression').present, false);
  assert.equal(zeile(k, 'hair_compression'), null, 'keine Zeile für Fehlendes (R18)');
});

test('leere Liste der Integration = Zeile gesperrt mit Grund', () => {
  const k = aufbau('voll', { attribute: { mop_extend_frequency_list: [] } });
  const s = k.I.settingState(k.karte, k.model(), 'mop_extend_frequency');
  assert.equal(s.locked, true);
  assert.match(s.reason, /gerade nicht/);
  const z = zeile(k, 'mop_extend_frequency');
  assert.equal(z.querySelector('select').disabled, true);
  assert.match(z.querySelector('.setting-status').textContent, /gerade nicht/);
});

test('Schalter: genau ein vacuum_set_property mit 1/0, Doppeltipp = ein Aufruf, role=switch', () => {
  const k = aufbau();
  const z = zeile(k, 'child_lock');
  const knopf = z.querySelector('[role="switch"]');
  assert.equal(knopf.getAttribute('aria-checked'), 'false');
  assert.match(knopf.textContent, /Aus/, 'Zustand als Wort, nicht nur Farbe (R17)');
  knopf.click();
  knopf.click();
  const nach = zeile(k, 'child_lock').querySelector('[role="switch"]');
  assert.equal(nach.getAttribute('aria-checked'), 'true', 'optimistisch');
  assert.equal(nach.getAttribute('aria-busy'), 'true');
  nach.click();
  assert.deepEqual(aufrufe(k), [setze(k, 'child_lock', 1)]);
  assert.match(zeile(k, 'child_lock').querySelector('.setting-status').textContent, /Speichert/);
});

test('Auswahl, Zahl, Zeit: je genau ein Aufruf in der Form der Integration', () => {
  const k = aufbau();
  const sel = zeile(k, 'carpet_cleaning').querySelector('select');
  assert.deepEqual(sel.childNodes.map((o) => o.value), ['Avoidance', 'Adaptation', 'Remove mop', 'Vacuum and mop', 'Ignore']);
  sel.value = 'Ignore';
  sel.dispatchEvent(k.u.neuesEreignis('change'));
  const zahl = zeile(k, 'volume').querySelector('input');
  assert.deepEqual([zahl.getAttribute('type'), zahl.getAttribute('min'), zahl.getAttribute('max')], ['number', '0', '100']);
  zahl.value = '55';
  zahl.dispatchEvent(k.u.neuesEreignis('change'));
  const zeit = zeile(k, 'off_peak_charging_start').querySelector('input');
  assert.equal(zeit.getAttribute('type'), 'time');
  assert.equal(zeit.value, '22:00');
  zeit.value = '23:30';
  zeit.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'carpet_cleaning', 'Ignore'), setze(k, 'volume', 55), setze(k, 'off_peak_charging_start', '23:30')]);
});

test('Zahl außerhalb der Grenzen: kein Aufruf, Hinweis in der Zeile (R10)', () => {
  const k = aufbau();
  const zahl = zeile(k, 'volume').querySelector('input');
  zahl.value = '120';
  zahl.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), []);
  assert.match(zeile(k, 'volume').querySelector('.setting-status').textContent, /0.*100/);
});

test('Bestätigt erst über das Attribut; sonst nach OPTIMISTIC_HOLD_MS alter Wert und Hinweis', () => {
  const k = aufbau();
  zeile(k, 'child_lock').querySelector('[role="switch"]').click();
  neu(k, { child_lock: true });
  k.u.uhr.vor(6000);
  const ok = zeile(k, 'child_lock');
  assert.equal(ok.querySelector('[role="switch"]').getAttribute('aria-checked'), 'true');
  assert.equal(ok.querySelector('.setting-status').textContent, '');
  zeile(k, 'resume_cleaning').querySelector('[role="switch"]').click();
  k.u.uhr.vor(5000);
  const alt = zeile(k, 'resume_cleaning');
  assert.equal(alt.querySelector('[role="switch"]').getAttribute('aria-checked'), 'true', 'alter Wert');
  assert.match(alt.querySelector('.setting-status').textContent, /nicht übernommen/);
  assert.equal(alt.getAttribute('data-state'), 'error');
});

test('Dienstfehler: R12-Text mit Grund, Folge und nächstem Schritt; Wert zurück', async () => {
  const k = aufbau();
  k.haus.antwort = () => Promise.reject(new Error('Gerät offline'));
  zeile(k, 'child_lock').querySelector('[role="switch"]').click();
  await mikro();
  const z = zeile(k, 'child_lock');
  assert.equal(z.querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
  const text = z.querySelector('.setting-status').textContent;
  assert.match(text, /Gerät offline/);
  assert.match(text, /bisherige Wert/);
  assert.match(text, /erneut/);
});

test('Menü: Geräteeinstellungen und Zubehör öffnen Registry-Ansichten, andere bleiben Platzhalter', () => {
  const k = aufbau();
  menue(k);
  eintrag(k.u, 'settings').click();
  assert.equal($d(k.u, 'h1').textContent, 'Geräteeinstellungen');
  assert.equal($d(k.u, '.placeholder'), null);
  assert.ok(gruppe(k, 'carpet'), 'Gruppen statt Platzhalter');
  const k2 = aufbau();
  menue(k2);
  eintrag(k2.u, 'consumables').click();
  assert.equal($d(k2.u, 'h1').textContent, 'Zubehör');
  const k3 = aufbau();
  menue(k3);
  eintrag(k3.u, 'remote').click();
  assert.match($d(k3.u, '.placeholder').textContent, /remote/);
  assert.deepEqual(k.haus.rufe, []);
});

test('dock/clean-settings nutzen dieselbe Zeile ohne Änderung (Dock-Schlüssel)', () => {
  const k = aufbau();
  const sel = zeile(k, 'washing_mode').querySelector('select');
  sel.value = sel.childNodes[0].value;
  sel.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'washing_mode', sel.childNodes[0].value)]);
});
