'use strict';
// Plan Task 5 (CORE-05/12): Dialog wie Lightcards 0.11.0 und Hauptmenü je Fähigkeit.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const seite = (u) => u.document.documentElement.style.overflow || '';
const menueKnopf = (karte) => karte.shadowRoot.querySelector('.menu-button');
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const eintraege = (u) => dialogVon(u).shadowRoot.querySelectorAll('.menu-item').map((b) => b.getAttribute('data-entry'));
const eintrag = (u, name) => dialogVon(u).shadowRoot.querySelectorAll('.menu-item').find((b) => b.getAttribute('data-entry') === name);
const taste = (u, key, extra = {}) => u.document.dispatchEvent(u.neuesEreignis('keydown', Object.assign({ key }, extra)));

function sauger(haus, attribute = {}) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
}
function offen(name = 'voll', attribute) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (attribute) haus.states = Object.assign({}, haus.states, sauger(haus, attribute));
  const karte = neueKarte(u, haus);
  const knopf = menueKnopf(karte);
  // Fokus liegt vor dem Öffnen auf dem Menüknopf der Karte.
  knopf.focus();
  u.document.activeElement = karte;
  knopf.click();
  return { u, haus, karte, knopf };
}

// ── Hauptmenü (CORE-05) ─────────────────────────────────────────────────────
test('Menüknopf nur, wenn es Einträge gibt; mit Namen', () => {
  const u = neueUmgebung();
  assert.equal(menueKnopf(neueKarte(u, hausAus('minimal'))).hidden, true, 'ausgeblendet, kein toter Knopf (R18)');
  const knopf = menueKnopf(neueKarte(u, hausAus('voll')));
  assert.equal(knopf.hidden, false);
  assert.equal(knopf.getAttribute('aria-label'), 'Menü');
  assert.equal(knopf.getAttribute('aria-haspopup'), 'dialog');
});

test('voll: alle Einträge in der Reihenfolge der Referenz', () => {
  const { u } = offen();
  assert.deepEqual(eintraege(u), ['locate', 'history', 'cruising_history', 'consumables', 'cleaning_sequence', 'remote', 'maps', 'settings']);
  for (const b of dialogVon(u).shadowRoot.querySelectorAll('.menu-item')) assert.ok(b.textContent.trim(), 'Text, nicht nur Symbol');
  assert.deepEqual(u.fehler, []);
});

test('Einträge nur je Fähigkeit', () => {
  const caps = hausAus('voll').states['vacuum.robo'].attributes.capabilities.filter((c) => !['cleangenius', 'multi_floor_map', 'cruising'].includes(c));
  const { u } = offen('voll', { capabilities: caps });
  assert.deepEqual(eintraege(u), ['locate', 'history', 'consumables', 'remote', 'settings']);
});

test('Zubehör: Hinweis bei Verbrauch unter 30 %, mit Text', () => {
  const { u } = offen('voll', { filter_left: 20, side_brush_left: 12 });
  const badge = eintrag(u, 'consumables').querySelector('.badge');
  assert.match(badge.textContent, /2/);
  assert.match(eintrag(u, 'consumables').getAttribute('aria-label'), /2 unter 30 %/);
  assert.equal(eintrag(offen().u, 'consumables').querySelector('.badge'), null);
});

test('Orten ruft genau vacuum.locate und schließt das Menü', () => {
  const { u, haus } = offen();
  eintrag(u, 'locate').click();
  assert.deepEqual(roh(haus.rufe), [{ domain: 'vacuum', service: 'locate', data: { entity_id: 'vacuum.robo' } }]);
  u.uhr.vor(400);
  assert.equal(dialogVon(u), null);
});

test('andere Einträge öffnen eine Platzhalter-Ansicht mit Titel und Modulhinweis', () => {
  const { u, haus } = offen();
  eintrag(u, 'maps').click();
  assert.equal($d(u, 'h1').textContent, 'Kartenverwaltung');
  assert.match($d(u, '.placeholder').textContent, /map-editor/);
  assert.deepEqual(haus.rufe, []);
  assert.deepEqual(u.verlauf.aufrufe, ['push', 'push'], 'eigener Verlaufseintrag je Ansicht');
});

// ── Dialog (CORE-12) ───────────────────────────────────────────────────────
test('Dialog: Titel, role=dialog, aria-modal, Seite gesperrt, ein Verlaufseintrag', () => {
  const { u } = offen();
  const sheet = $d(u, '.sheet');
  assert.equal(sheet.getAttribute('role'), 'dialog');
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  assert.equal($d(u, 'h1').textContent, 'Menü');
  assert.equal(sheet.getAttribute('aria-labelledby'), $d(u, 'h1').id);
  assert.equal(seite(u), 'hidden');
  assert.deepEqual(u.verlauf.aufrufe, ['push']);
});

test('Schließen-Knopf oben: geht den eigenen Verlauf zurück, gibt Seite und Fokus frei', () => {
  const { u, karte, knopf } = offen();
  const zu = $d(u, '.head').querySelector('[data-action="close"]');
  assert.equal(zu.getAttribute('aria-label'), 'Schließen');
  zu.click();
  assert.deepEqual(u.verlauf.aufrufe, ['push', 'go -1']);
  u.zurueck();
  assert.equal(dialogVon(u), null);
  assert.equal(seite(u), '');
  assert.equal(karte.shadowRoot.activeElement, knopf, 'Fokus zurück auf den Menüknopf');
});

test('Absicherung: bleibt popstate aus, schließt der Dialog nach 300 ms', () => {
  const { u } = offen();
  $d(u, '.head').querySelector('[data-action="close"]').click();
  u.uhr.vor(400);
  assert.equal(dialogVon(u), null);
});

test('Escape: aus der Platzhalter-Ansicht zurück ins Menü, dann zu', () => {
  const { u } = offen();
  eintrag(u, 'history').click();
  taste(u, 'Escape');
  assert.equal(u.verlauf.aufrufe.at(-1), 'back');
  u.zurueck();
  assert.equal($d(u, 'h1').textContent, 'Menü');
  taste(u, 'Escape');
  u.zurueck();
  assert.equal(dialogVon(u), null);
});

test('Zurück-Geste schließt und gibt die Seite frei; vorheriger Wert bleibt', () => {
  const u = neueUmgebung(), karte = neueKarte(u, hausAus('voll'));
  u.document.documentElement.style.overflow = 'scroll';
  menueKnopf(karte).click();
  assert.equal(seite(u), 'hidden');
  u.zurueck();
  assert.equal(dialogVon(u), null);
  assert.equal(seite(u), 'scroll');
});

test('Außenklick schließt das flüchtige Menü, nicht aber eine Ansicht/einen Editor (R04)', () => {
  const a = offen();
  $d(a.u, '.scrim').click();
  a.u.uhr.vor(400);
  assert.equal(dialogVon(a.u), null, 'Menü zu');
  const b = offen();
  eintrag(b.u, 'settings').click();
  $d(b.u, '.scrim').click();
  b.u.uhr.vor(400);
  assert.ok(dialogVon(b.u), 'Ansicht bleibt offen');
});

test('Fokusfalle: Tab springt vom letzten zum ersten und umgekehrt', () => {
  const { u } = offen();
  const d = dialogVon(u);
  const ziele = d._focusable();
  assert.ok(ziele.length >= 3);
  ziele.at(-1).focus();
  taste(u, 'Tab');
  assert.equal(d.shadowRoot.activeElement, ziele[0]);
  taste(u, 'Tab', { shiftKey: true });
  assert.equal(d.shadowRoot.activeElement, ziele.at(-1));
});

test('Öffnen setzt den Fokus in den Dialog', () => {
  const { u } = offen();
  assert.ok(dialogVon(u)._focusable().includes(dialogVon(u).shadowRoot.activeElement));
});

test('ein zweiter Tipp öffnet keinen zweiten Dialog', () => {
  const { u, knopf } = offen();
  knopf.click();
  assert.equal(u.body.childNodes.filter((n) => n.tagName === 'BUSCH-VACUUM-DIALOG').length, 1);
});

test('fremde Updates bauen den offenen Dialog nicht neu', () => {
  const { u, haus, karte } = offen();
  const vorher = eintrag(u, 'locate');
  karte.hass = haus.fremd();
  assert.equal(eintrag(u, 'locate'), vorher);
  karte.hass = haus.setze(sauger(haus, { filter_left: 10 }));
  assert.ok(eintrag(u, 'consumables').querySelector('.badge'), 'eigene Änderung kommt an');
});

test('Geometrie wie Lightcards 0.11.0 (Messung im Browser folgt mit Task 8)', () => {
  const { DIALOG_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  assert.match(DIALOG_STYLES, /@media \(max-width: 449\.98px\), \(max-height: 499\.98px\)/);
  assert.match(DIALOG_STYLES, /env\(safe-area-inset-top\)/);
  assert.match(DIALOG_STYLES, /max-height: 100%/);
  assert.match(DIALOG_STYLES, /overscroll-behavior: contain/);
  assert.match(DIALOG_STYLES, /position: sticky;\s*top: -16px/);
  assert.match(DIALOG_STYLES, /width: min\(560px, 100%\)/);
  assert.match(DIALOG_STYLES, /prefers-reduced-motion: reduce/);
});
