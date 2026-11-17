'use strict';
// Buschcheck M49 (#1234): die Kartendatei bleibt eine Datei (dist ist Quelle, kein Build),
// gegliedert durch Abschnittsmarker und ein Inhaltsverzeichnis mit Startzeilen am Dateianfang.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ZEILEN = fs.readFileSync(path.join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8').split('\n');
const BALKEN = '// ' + '-'.repeat(75);
const MARKE = /^\/\/ SECTION: (\S.*)$/;
const EINTRAG = /^ \* {3}(\S.*?) \.+ (\d+)$/;

/** Marker mit Zeilennummer (1-basiert). */
const marker = () => {
  const out = [];
  ZEILEN.forEach((z, i) => { const m = MARKE.exec(z); if (m) out.push({ name: m[1], zeile: i + 1 }); });
  return out;
};
/** Das Verzeichnis: der Kommentar mit Contents (M49) bis zu seinem Ende. */
const verzeichnis = () => {
  const start = ZEILEN.findIndex((z) => z.startsWith(' * Contents (M49)'));
  assert.ok(start > 0, 'Verzeichnis vorhanden');
  const ende = ZEILEN.indexOf(' */', start);
  const out = [];
  for (let i = start + 1; i < ende; i++) { const m = EINTRAG.exec(ZEILEN[i]); if (m) out.push({ name: m[1], zeile: Number(m[2]), bei: i + 1 }); }
  return { start: start + 1, eintraege: out };
};

test('M49 Gliederung: jeder Marker steht im Verzeichnis und umgekehrt, gleiche Reihenfolge', () => {
  const m = marker(), v = verzeichnis().eintraege;
  assert.ok(m.length >= 20, 'Abschnitte: ' + m.length);
  assert.deepEqual(v.map((e) => e.name), m.map((e) => e.name));
  assert.equal(new Set(m.map((e) => e.name)).size, m.length, 'Namen eindeutig');
});

test('M49 Gliederung: die Startzeile im Verzeichnis ist die Zeile des Markers', () => {
  const m = marker(), v = verzeichnis().eintraege;
  const falsch = v.filter((e, i) => !m[i] || e.zeile !== m[i].zeile).map((e) => e.name + ' ' + e.zeile);
  assert.deepEqual(falsch, []);
});

test('M49 Gliederung: einheitliches Markerformat, Verzeichnis am Anfang direkt nach dem Shared-UI-Block', () => {
  for (const e of marker()) assert.equal(ZEILEN[e.zeile - 2], BALKEN, 'Balken vor ' + e.name);
  // Nur genau diese Form gilt als Marker (keine Varianten, die das Verzeichnis nicht kennt).
  const fast = ZEILEN.filter((z) => /^\s*\/\/\s*SECTION\b/i.test(z) && !MARKE.test(z));
  assert.deepEqual(fast, []);
  const ende = ZEILEN.indexOf('/* END BUSCH SHARED UI */');
  assert.ok(ZEILEN[0].startsWith('/* BEGIN BUSCH SHARED UI '), 'Shared UI bleibt die erste Zeile');
  const v = verzeichnis();
  assert.ok(v.start > ende + 1 && v.start <= ende + 4, 'Verzeichnis direkt nach dem Shared-UI-Block');
  assert.ok(marker()[0].zeile > v.eintraege[v.eintraege.length - 1].bei, 'Marker erst nach dem Verzeichnis');
});
