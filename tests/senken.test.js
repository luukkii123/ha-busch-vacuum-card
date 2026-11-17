'use strict';
// M27 (Buschcheck 17.11.2026, Security S3): XSS-Freiheit festschreiben. Ein
// statischer Wächter über dist/busch-vacuum-card.js für HTML-/Code-Senken und
// die feindliche Fixture (tests/fixtures/feindlich.json) in der Attrappe. Die
// Attrappe wertet kein HTML aus; den Browserteil prüft der Renderfall `feindlich`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');
const { dialogVon } = require('./hilfen.js');

const QUELLE = fs.readFileSync(path.join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');

/** Senken: Muster → Grund. Leeren mit innerHTML = '' ist erlaubt. */
const SENKEN = [
  [/\.innerHTML\s*\+?=(?!\s*''\s*;)/, 'innerHTML mit Inhalt'],
  [/\.outerHTML\s*=/, 'outerHTML'],
  [/\binsertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
  [/\bdocument\.write(?:ln)?\s*\(/, 'document.write'],
  [/(?<![\w.])eval\s*\(/, 'eval'],
  [/\bnew\s+Function\s*\(/, 'new Function'],
  [/\bDOMParser\b/, 'DOMParser'],
  [/\bcreateContextualFragment\s*\(/, 'createContextualFragment'],
  [/\bsrcdoc\b/, 'srcdoc'],
  [/\.on[a-z]+\s*=(?!=)/, 'Ereignis-Eigenschaft (on…=)'],
  [/\bsetAttribute\(\s*(?!['"])/, 'setAttribute mit berechnetem Namen'],
  [/\bsetAttributeNS\(\s*[^,]+,\s*(?!['"])/, 'setAttributeNS mit berechnetem Namen'],
  [/\bsetTimeout\s*\(\s*['"`]/, 'setTimeout mit Text'],
];
/** Einzige Stelle mit berechnetem Attributnamen: svgNode (Schlüssel ohne on…, siehe unten). */
const ERLAUBT = [/node\.setAttribute\(key, String\(value\)\)/];

/** Fundstellen (Zeilennummer, Grund, Zeile) in einem Quelltext. */
function senken(text) {
  const funde = [];
  text.split('\n').forEach((zeile, i) => {
    for (const [muster, grund] of SENKEN) {
      if (muster.test(zeile) && !ERLAUBT.some((e) => e.test(zeile))) funde.push(`${i + 1}: ${grund}: ${zeile.trim().slice(0, 120)}`);
    }
  });
  return funde;
}

test('M27 Senkenwächter: dist/busch-vacuum-card.js ohne HTML-/Code-Senken', () => {
  assert.ok(QUELLE.length > 100000, 'Quelle gelesen');
  assert.deepEqual(senken(QUELLE), []);
});

test('M27 Gegenprobe: der Wächter schlägt bei einer eingefügten Zeile x.innerHTML = name an, auch an jeder Stelle der Quelle', () => {
  assert.equal(senken('x.innerHTML = name;').length, 1);
  const zeilen = QUELLE.split('\n');
  const mitte = Math.floor(zeilen.length / 2);
  const probe = zeilen.slice(0, mitte).concat(['    x.innerHTML = name;'], zeilen.slice(mitte)).join('\n');
  assert.deepEqual(senken(probe), [`${mitte + 1}: innerHTML mit Inhalt: x.innerHTML = name;`]);
  for (const zeile of ["el.outerHTML = s;", "a.insertAdjacentHTML('beforeend', s);", 'document.write(s);', 'eval(s);', 'new Function(s);', 'new DOMParser();',
    'r.createContextualFragment(s);', "f.setAttribute('srcdoc', s);", 'img.onerror = f;', 'n.setAttribute(name, v);', "setTimeout('x()', 1);", 'x.innerHTML += s;']) {
    assert.equal(senken(zeile).length >= 1, true, zeile);
  }
  for (const zeile of ["root.innerHTML = '';", "n.setAttribute('data-x', v);", 'if (a.onerror === b) {}', 'model.evaluate(x);']) assert.deepEqual(senken(zeile), [], zeile);
});

test('M27 svgNode: Ereignis-Attribute (on…) werden nie gesetzt, andere Schlüssel schon', () => {
  const u = neueUmgebung();
  const karte = neueKarte(u, hausAus('voll'));
  const n = karte._map.svgNode('rect', { x: 1, onload: 'alert(1)', ONCLICK: 'x', 'data-room': '<b>' });
  assert.deepEqual(Object.keys(n.attributes).sort(), ['data-room', 'x']);
  assert.equal(n.getAttribute('data-room'), '<b>');
});

// ── Feindliche Fixture in der Attrappe ──────────────────────────────────────

const FEIND = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'feindlich.json'), 'utf8'));
const NAMEN = [FEIND.states['vacuum.robo'].attributes.friendly_name, ...Object.values(FEIND.states['vacuum.robo'].attributes.shortcuts).map((s) => s.name)];

/** Kein Ereignis-Attribut, kein script/iframe/object, kein javascript: in href/src. */
function fremdeKnoten(wurzel) {
  return wurzel.all().filter((n) => n.attributes && (
    Object.keys(n.attributes).some((k) => /^on/i.test(k)) || ['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(n.tagName)
    || ['href', 'src', 'xlink:href'].some((k) => /^\s*javascript:/i.test(String(n.attributes[k] || ''))))).map((n) => n.tagName);
}

test('M27 feindlich: Titel, Shortcut-Menü und Skript zeigen die Namen wörtlich als Text, ohne fremde Knoten und ohne Fehler', () => {
  const u = neueUmgebung();
  const haus = hausAus('feindlich');
  const karte = neueKarte(u, haus, { scripts: ['script.feindlich'] });
  assert.match(karte.shadowRoot.textContent, /<img src=x onerror=alert\(1\)>/, 'Titel wörtlich');
  karte.shadowRoot.querySelector('[data-action="shortcuts"]').click();
  const menue = dialogVon(u).shadowRoot;
  for (const name of NAMEN) assert.ok(menue.textContent.includes(name), 'wörtlich: ' + name.slice(0, 30));
  assert.deepEqual(fremdeKnoten(karte.shadowRoot), []);
  assert.deepEqual(fremdeKnoten(menue), []);
  assert.deepEqual(u.fehler, []);
});
