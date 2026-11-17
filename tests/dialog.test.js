'use strict';
// Plan Task 5 (CORE-05/12): Dialog wie Lightcards 0.11.0 und Hauptmenü je Fähigkeit.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');
const { roh, dialogVon, sauger } = require('./hilfen.js');

const seite = (u) => u.document.documentElement.style.overflow || '';
const menueKnopf = (karte) => karte.shadowRoot.querySelector('.menu-button');
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const eintraege = (u) => dialogVon(u).shadowRoot.querySelectorAll('.menu-item').map((b) => b.getAttribute('data-entry'));
const eintrag = (u, name) => dialogVon(u).shadowRoot.querySelectorAll('.menu-item').find((b) => b.getAttribute('data-entry') === name);
const taste = (u, key, extra = {}) => u.document.dispatchEvent(u.neuesEreignis('keydown', Object.assign({ key }, extra)));

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
test('CORE-05 Menüknopf nur, wenn es Einträge gibt; mit Namen', () => {
  const u = neueUmgebung();
  assert.equal(menueKnopf(neueKarte(u, hausAus('minimal'))).hidden, true, 'ausgeblendet, kein toter Knopf (R18)');
  const knopf = menueKnopf(neueKarte(u, hausAus('voll')));
  assert.equal(knopf.hidden, false);
  assert.equal(knopf.getAttribute('aria-label'), 'Menü');
  assert.equal(knopf.getAttribute('aria-haspopup'), 'dialog');
});

test('CORE-05 voll: alle Einträge in der Reihenfolge der Referenz', () => {
  const { u } = offen();
  assert.deepEqual(eintraege(u), ['locate', 'history', 'cruising_history', 'consumables', 'cleaning_sequence', 'remote', 'maps', 'settings']);
  for (const b of dialogVon(u).shadowRoot.querySelectorAll('.menu-item')) assert.ok(b.textContent.trim(), 'Text, nicht nur Symbol');
  assert.deepEqual(u.fehler, []);
});

test('CORE-05 Einträge nur je Fähigkeit', () => {
  const caps = hausAus('voll').states['vacuum.robo'].attributes.capabilities.filter((c) => !['cleangenius', 'multi_floor_map', 'cruising'].includes(c));
  const { u } = offen('voll', { capabilities: caps });
  assert.deepEqual(eintraege(u), ['locate', 'history', 'consumables', 'remote', 'settings']);
});

test('CORE-05/DEV-09 Zubehör: Hinweis bei Verbrauch unter 30 %, mit Text', () => {
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

test('CORE-05 Kartenverwaltung öffnet ihre Registry-Ansicht; jeder Menüeintrag außer Orten hat seine Modulansicht (kein Platzhalter)', () => {
  const { u, haus, karte } = offen();
  eintrag(u, 'maps').click();
  assert.equal($d(u, 'h1').textContent, 'Kartenverwaltung');
  assert.equal($d(u, '.placeholder'), null, 'map-editor füllt den Eintrag');
  assert.deepEqual(haus.rufe, []);
  assert.deepEqual(u.verlauf.aufrufe, ['push', 'push'], 'eigener Verlaufseintrag je Ansicht');
  const I = u.registry.get('busch-vacuum-card').__internals;
  const quelle = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');
  const menue = Array.from(quelle.slice(quelle.indexOf('const MENU = ['), quelle.indexOf('];', quelle.indexOf('const MENU = ['))).matchAll(/name: '([a-z_]+)'/g), (m) => m[1]);
  assert.ok(menue.length >= 8);
  for (const name of menue.filter((n) => n !== 'locate')) assert.equal(typeof I.MODULE_VIEWS[name], 'function', name);
  assert.equal(karte._placeholderView, undefined, 'kein Platzhalter im Release');
});

test('CORE-12 Ansichts-IDs (Release Task 2): jede Dialogansicht im Quelltext trägt eine id aus VIEW_IDS, VIEW_IDS ohne Überschuss; der Dialog setzt data-view', () => {
  const quelle = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');
  const zeilen = quelle.split('\n');
  const gefunden = [];
  zeilen.forEach((z, i) => {
    if (!/\bkind: '(menu|editor|confirm)'/.test(z) || /push\(/.test(z)) return;
    const m = /\bid: '([a-z-]+)'/.exec(z) || /^\s*id: '([a-z-]+)',$/.exec(zeilen[i - 1]);
    assert.ok(m, 'Ansicht ohne id in Zeile ' + (i + 1) + ': ' + z.trim());
    gefunden.push(m[1]);
  });
  const { u } = offen();
  const I = u.registry.get('busch-vacuum-card').__internals;
  assert.deepEqual([...new Set(gefunden)].sort(), [...I.VIEW_IDS].sort(), 'VIEW_IDS = die ids im Quelltext');
  assert.equal(new Set(I.VIEW_IDS).size, I.VIEW_IDS.length, 'keine doppelte id');
  assert.equal(dialogVon(u).shadowRoot.querySelector('.sheet').getAttribute('data-view'), 'menu');
});

// ── Dialog (CORE-12) ───────────────────────────────────────────────────────
test('CORE-12 Dialog: Titel, role=dialog, aria-modal, Seite gesperrt, ein Verlaufseintrag', () => {
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

test('CORE-12 Escape: aus der Platzhalter-Ansicht zurück ins Menü, dann zu', () => {
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

test('CORE-12 Zurück-Geste schließt und gibt die Seite frei; vorheriger Wert bleibt', () => {
  const u = neueUmgebung(), karte = neueKarte(u, hausAus('voll'));
  u.document.documentElement.style.overflow = 'scroll';
  menueKnopf(karte).click();
  assert.equal(seite(u), 'hidden');
  u.zurueck();
  assert.equal(dialogVon(u), null);
  assert.equal(seite(u), 'scroll');
});

test('CORE-12 Außenklick schließt das flüchtige Menü, nicht aber eine Ansicht/einen Editor (R04)', () => {
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

test('CORE-12 Geometrie wie Lightcards 0.11.0 (Messung im Browser folgt mit Task 8)', () => {
  const { DIALOG_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  assert.match(DIALOG_STYLES, /@media \(max-width: 449\.98px\), \(max-height: 499\.98px\)/);
  assert.match(DIALOG_STYLES, /env\(safe-area-inset-top\)/);
  assert.match(DIALOG_STYLES, /max-height: 100%/);
  assert.match(DIALOG_STYLES, /overscroll-behavior: contain/);
  assert.match(DIALOG_STYLES, /position: sticky;\s*top: -16px/);
  assert.match(DIALOG_STYLES, /width: min\(560px, 100%\)/);
  assert.match(DIALOG_STYLES, /prefers-reduced-motion: reduce/);
});
