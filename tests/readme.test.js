'use strict';
// Release Task 3: das README nennt jede Option des Editor-Schemas, alle Werte von
// hidden_card_objects/hidden_objects, keine Baustellen-Hinweise, nur vorhandene Bilder.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung } = require('./attrappe.js');

const WURZEL = path.join(__dirname, '..');
const README = fs.readFileSync(path.join(WURZEL, 'README.md'), 'utf8');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'dist', 'busch-vacuum-card.js'), 'utf8');

/** Alle Feldnamen des Editor-Schemas (verschachtelt), ohne Abschnitte und den Unterschlüssel `dark` von override_colors. */
function schemaNamen(schema, namen = new Set()) {
  for (const feld of schema) {
    if (feld.name && !/_section$/.test(feld.name) && feld.name !== 'dark') namen.add(feld.name);
    if (Array.isArray(feld.schema) && feld.name !== 'override_colors') schemaNamen(feld.schema, namen);
  }
  return namen;
}
const liste = (name) => Array.from(QUELLE.slice(QUELLE.indexOf('const ' + name + ' = ['), QUELLE.indexOf('];', QUELLE.indexOf('const ' + name + ' = ['))).matchAll(/'([a-z_]+)'/g), (m) => m[1]);

test('CORE-18 README: jede Option des Editor-Schemas steht als Zeile in einer Optionstabelle', () => {
  const I = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  const namen = schemaNamen(I.SCHEMA);
  assert.ok(namen.size >= 15, 'Schema gelesen: ' + [...namen].join(','));
  const fehlt = [...namen].filter((n) => !README.includes('| `' + n + '` |'));
  assert.deepEqual(fehlt, [], 'im README fehlen');
  // Die Farbschlüssel von override_colors stehen in dessen Beschreibung.
  const farben = I.SCHEMA.flatMap(function alle(f) { return f.name === 'override_colors' ? [f] : (f.schema || []).flatMap(alle); })[0];
  const schluessel = [];
  (function sammle(liste) { for (const f of liste || []) { if (f.name && f.name !== 'dark') schluessel.push(f.name); sammle(f.schema); } })(farben && farben.schema);
  assert.ok(schluessel.length >= 5, 'Farbschlüssel gelesen');
  assert.deepEqual(schluessel.filter((n) => !README.includes('`' + n + '`')), []);
});

test('CORE-18/MAP-03 README: alle Werte von hidden_card_objects und hidden_objects genannt', () => {
  const karte = liste('HIDDEN_OBJECTS'), objekte = liste('MAP_OBJECTS');
  assert.ok(karte.length >= 15 && objekte.length >= 20);
  assert.deepEqual(karte.concat(objekte).filter((n) => !README.includes('`' + n + '`')), []);
});

test('README: kein Baustellen-Hinweis, Bilder vorhanden, Version = CARD_VERSION, Grenzen und Live-Punkte genannt', () => {
  assert.doesNotMatch(README, /work in progress|scaffold|not released/i);
  const bilder = Array.from(README.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g), (m) => m[1]);
  assert.ok(bilder.length >= 2, 'HACS verlangt ein echtes Bild');
  for (const b of bilder) assert.ok(fs.existsSync(path.join(WURZEL, b)), 'Bild fehlt: ' + b);
  const version = /const CARD_VERSION = '([^']+)'/.exec(QUELLE)[1];
  assert.match(README, new RegExp('Version ' + version.replace(/\./g, '\\.') + ' '));
  assert.match(README, /## Known limits/);
  assert.match(README, /Not confirmed on a real robot yet/);
  assert.match(README, /Checked on a Dreame X40/, 'Fernsteuerung live bestätigt (#1001)');
});
