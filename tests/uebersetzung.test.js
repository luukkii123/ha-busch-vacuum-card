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

// ── M21 Wörterteil (E6): eigene DE/EN-Tabelle für Dreame-Optionen und Lauftypen vor dem Rohwert ──
const ENGLISCH = /\b(Sweeping|Mopping|Turbo mode|Quiet|Strong|Slightly dry|Moist|Wet|Intensive|Deep|Quick|Room cleaning|Zone cleaning|Spot cleaning|Default mode|Custom mode|Wetness level|Suction level|Cleaning mode|Mop pad humidity|Water volume|Cleaning route)\b/;

test('M21 SET-01 leeres localize und de: Zusammenfassung ohne englische Optionswörter', () => {
  for (const optionen of [{ uebersetzung: {} }, {}]) {
    const k = karte(optionen);
    const text = zusammenfassung(k);
    assert.equal(text, 'Wischen nach dem Saugen · Turbo · Feuchtigkeitsstufe 26');
    assert.doesNotMatch(text, ENGLISCH);
  }
});

test('M21 SET-02 leeres localize und de: Auswahlfelder der Reinigungseinstellungen deutsch, Werte roh', () => {
  const k = karte({ uebersetzung: {} });
  k.karte.shadowRoot.querySelector('[data-action="clean-settings"]').click();
  const blatt = dialogVon(k.u).shadowRoot;
  const optionen = blatt.querySelectorAll('select').flatMap((s) => s.childNodes.filter((o) => o.tagName === 'OPTION' || o.value !== undefined));
  const texte = optionen.map((o) => o.textContent).filter(Boolean);
  assert.ok(texte.includes('Wischen nach dem Saugen'), texte.join('|'));
  assert.ok(texte.includes('Leise'));
  const modus = blatt.querySelectorAll('select').find((s) => s.childNodes.some((o) => o.value === 'Mopping after sweeping'));
  assert.ok(modus, 'Wert bleibt der Rohwert der Integration');
  for (const t of texte) assert.doesNotMatch(t, ENGLISCH, t);
});

test('M21 HA-Übersetzung schlägt die eigene Tabelle', () => {
  const k = karte({ uebersetzung: uebersetzungDe() });
  assert.equal(zusammenfassung(k).split(' · ')[1], 'Maximal', 'HA sagt „Maximal“, die eigene Tabelle „Turbo“');
});

test('M21 eigene Tabelle: Englisch zeigt die Wörter der Integration, Unbekanntes bleibt roh', () => {
  const { neueUmgebung: nu } = require('./attrappe.js');
  const u = nu(), haus = hausAus('voll', { uebersetzung: {} });
  haus.sprache = 'en';
  const k = { u, haus, karte: neueKarte(u, haus) };
  assert.equal(zusammenfassung(k), 'Mopping after sweeping · Turbo · Wetness level 26');
  const I = u.registry.get('busch-vacuum-card').__internals;
  assert.equal(typeof I.optionWord, 'function');
  const de = { language: 'de', locale: { language: 'de' }, localize: () => '' };
  assert.equal(I.optionWord(de, 'Room cleaning'), 'Raumreinigung');
  assert.equal(I.optionWord(de, 'Default mode'), 'Standardmodus');
  assert.equal(I.optionWord(de, 'Mystery mode'), '', 'unbekannt → leer, der Aufrufer zeigt den Rohwert');
});

test('M21 HIS-01 Verlauf ohne localize, de: Lauftypen und Art deutsch', () => {
  const u = neueUmgebung(), haus = hausAus('voll', { uebersetzung: {} });
  const k = neueKarte(u, haus);
  k.shadowRoot.querySelector('.menu-button').click();
  const d = dialogVon(u).shadowRoot;
  d.querySelectorAll('.menu-item').find((b) => b.getAttribute('data-entry') === 'history').click();
  for (const kopf of d.querySelectorAll('[data-group]')) kopf.click();
  const zeilen = dialogVon(u).shadowRoot.querySelectorAll('[data-run]').map((z) => z.textContent);
  assert.ok(zeilen.length > 5);
  assert.ok(zeilen.some((t) => /Raumreinigung/.test(t)), zeilen.join('\n'));
  for (const t of zeilen) assert.doesNotMatch(t, ENGLISCH, t);
});
