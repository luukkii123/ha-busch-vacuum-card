'use strict';
// childNodes/children/querySelectorAll liefern im Browser NodeList/HTMLCollection ohne map/find …;
// die Attrappe gibt Arrays zurück und würde das verdecken (E2E-Fund 17.11.2026).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('DOM-01: keine Array-Methoden direkt auf DOM-Sammlungen', () => {
  const quelle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');
  const muster = /(?:childNodes|children|querySelectorAll\([^)]*\))\.(?:map|filter|find|findIndex|some|every|indexOf|includes|reduce|slice|at)\(/g;
  const funde = quelle.split('\n').flatMap((z, i) => (z.match(muster) ? [`${i + 1}: ${z.trim().slice(0, 100)}`] : []));
  assert.deepEqual(funde, []);
});
