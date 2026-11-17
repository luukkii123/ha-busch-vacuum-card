'use strict';
// M14 (Buschcheck 17.11.2026, F3/W11): echte Symbole im Renderharness und
// „Symbolknopf ohne Namen“. Der Harness (docs/render/render.py) zeichnet ha-icon aus
// docs/render/mdi-pfade.json (erzeugt mit docs/render/mdi-pfade.py aus @mdi/js, ohne Netz).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');
const { dialogVon, sauger } = require('./hilfen.js');

const WURZEL = path.join(__dirname, '..');
const TABELLE = JSON.parse(fs.readFileSync(path.join(WURZEL, 'docs', 'render', 'mdi-pfade.json'), 'utf8'));
const QUELLE = fs.readFileSync(path.join(WURZEL, 'dist', 'busch-vacuum-card.js'), 'utf8');

test('M14 Symboltabelle: jedes mdi:-Symbol der Karte und der Fixtures hat eine Glyphe', () => {
  const namen = new Set(QUELLE.match(/mdi:[a-z0-9-]+/g).filter((n) => !n.endsWith('-')));
  for (const datei of fs.readdirSync(path.join(__dirname, 'fixtures')).filter((d) => d.endsWith('.json'))) {
    for (const n of fs.readFileSync(path.join(__dirname, 'fixtures', datei), 'utf8').match(/mdi:[a-z0-9-]+/g) || []) namen.add(n);
  }
  // Akkusymbole werden zusammengesetzt (batteryInfo): mdi:battery-<10..90>, mdi:battery-charging-<10..100>.
  for (let t = 10; t <= 100; t += 10) { if (t < 100) namen.add('mdi:battery-' + t); namen.add('mdi:battery-charging-' + t); }
  const fehlen = [...namen].filter((n) => !TABELLE.pfade[n]);
  assert.deepEqual(fehlen, [], 'docs/render/mdi-pfade.py neu laufen lassen');
  for (const [n, d] of Object.entries(TABELLE.pfade)) assert.match(d, /^M[\d., MLHVCSQTAZmlhvcsqtaz-]+$/, n);
  assert.match(TABELLE.quelle, /@mdi\/js \d+\.\d+\.\d+/);
});

/** Alle Knöpfe eines Schattenbaums ohne sichtbaren Text und ohne Namen. */
const ohneNamen = (wurzel) => wurzel.querySelectorAll('button').filter((b) => !b.textContent.trim()
  && !String(b.getAttribute('aria-label') || '').trim() && !b.getAttribute('aria-labelledby') && !String(b.title || '').trim());
const kennung = (b) => b.getAttribute('data-action') || b.getAttribute('data-entry') || b.className || b.tagName;

function karteMit(fixture, zustand) {
  const u = neueUmgebung(), haus = hausAus(fixture);
  if (zustand) haus.states = Object.assign({}, haus.states, sauger(haus, {}, zustand));
  return { u, haus, karte: neueKarte(u, haus) };
}

const FAELLE = [['voll', 'docked'], ['voll', 'cleaning'], ['voll', 'error'], ['voll', 'unavailable'],
  ['minimal'], ['ohne-dock'], ['ohne-karte']];
for (const [fixture, zustand] of FAELLE) {
  test(`M14 CORE-08/CORE-12 Symbolknopf ohne Namen: 0 in Karte und Menüansichten (${fixture}${zustand ? ' ' + zustand : ''})`, () => {
    const k = karteMit(fixture, zustand);
    let geprueft = k.karte.shadowRoot.querySelectorAll('button').length;
    const funde = ohneNamen(k.karte.shadowRoot).map((b) => 'karte:' + kennung(b));
    const menue = k.karte.shadowRoot.querySelector('.menu-button');
    if (menue && !menue.hidden) {
      menue.click();
      const eintraege = dialogVon(k.u).shadowRoot.querySelectorAll('.menu-item').map((b) => b.getAttribute('data-entry'));
      funde.push(...ohneNamen(dialogVon(k.u).shadowRoot).map((b) => 'menu:' + kennung(b)));
      dialogVon(k.u).remove();
      for (const eintrag of eintraege.filter((e) => e !== 'locate')) {
        menue.click();
        dialogVon(k.u).shadowRoot.querySelectorAll('.menu-item').find((b) => b.getAttribute('data-entry') === eintrag).click();
        const blatt = dialogVon(k.u).shadowRoot;
        geprueft += blatt.querySelectorAll('button').length;
        funde.push(...ohneNamen(blatt).map((b) => eintrag + ':' + kennung(b)));
        dialogVon(k.u).remove();
      }
    }
    assert.deepEqual(funde, []);
    assert.ok(geprueft >= 1, 'geprüft: ' + geprueft + ' Knöpfe');
    assert.deepEqual(k.haus.rufe, [], 'Öffnen ruft nichts auf');
  });
}
