'use strict';
// Plan Task 2: keine echten Namen, keine IP/MAC/Tokens in tests/fixtures/.
// Die echten Namen stehen nur privat außerhalb des Repos; hier liegen ihre
// SHA-256-Werte (kleingeschrieben), verglichen Wort für Wort.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ORDNER = path.join(__dirname, 'fixtures');
const ERWARTET = ['integration-schluessel.json', 'minimal.json', 'ohne-dock.json', 'ohne-karte.json', 'voll.json'];
const VERBOTENE_WOERTER = new Set([
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
]);

/** Liefert die Fundstellen privater Werte in einem Text (leer = sauber). */
function privateFunde(text, woerter = VERBOTENE_WOERTER) {
  const funde = [];
  const muster = {
    IPv4: /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g,
    MAC: /\b[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}\b/gi,
    Token: /eyJ[\w-]*/g,
    Heimnetz: /192\.168\./g,
    HexToken: /\b[0-9a-f]{40,}\b/gi,
  };
  for (const [art, re] of Object.entries(muster)) for (const m of text.matchAll(re)) funde.push(`${art}: ${m[0]}`);
  for (const wort of new Set(text.toLowerCase().match(/\p{L}+/gu) || [])) {
    if (woerter.has(crypto.createHash('sha256').update(wort).digest('hex'))) funde.push('echter Name (Hash)');
  }
  return funde;
}

test('alle Fixture-Dateien liegen vor (vier Varianten und die Schlüsselliste)', () => {
  assert.deepEqual(fs.readdirSync(ORDNER).filter((f) => f.endsWith('.json')).sort(), ERWARTET);
});

for (const datei of ERWARTET) {
  test(`${datei}: keine privaten Werte`, () => {
    assert.deepEqual(privateFunde(fs.readFileSync(path.join(ORDNER, datei), 'utf8')), []);
  });
}

// Grundriss: die echten Raumrechtecke (x0,y0,x1,y1) stehen nur privat; hier
// liegen ihre scrypt-Werte — langsam, damit sich kleine Zahlen nicht durchprobieren lassen.
const ECHTE_RAEUME = new Set([
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
]);
const raumWert = (r) => crypto.scryptSync(`${r.x0},${r.y0},${r.x1},${r.y1}`, 'busch-vacuum-raeume', 32).toString('hex');

/** Räume der Kartenkameras, deren Rechteck dem echten Grundriss entspricht. */
function echteRaeume(fixture, werte = ECHTE_RAEUME) {
  const funde = [];
  for (const [id, s] of Object.entries(fixture.states || {})) {
    if (!id.startsWith('camera.')) continue;
    for (const [nr, r] of Object.entries(s.attributes.rooms || {})) if (werte.has(raumWert(r))) funde.push(`${id} Raum ${nr}`);
  }
  return funde;
}

for (const datei of ERWARTET) {
  test(`${datei}: kein echter Grundriss (Raumrechtecke)`, () => {
    assert.deepEqual(echteRaeume(JSON.parse(fs.readFileSync(path.join(ORDNER, datei), 'utf8'))), []);
  });
}

test('Gegenprobe: die Grundriss-Prüfung schlägt an', () => {
  const rechteck = { x0: -100, y0: -200, x1: 300, y1: 400 };
  assert.deepEqual(echteRaeume({ states: { 'camera.k': { attributes: { rooms: { 1: rechteck } } } } }, new Set([raumWert(rechteck)])), ['camera.k Raum 1']);
  assert.deepEqual(echteRaeume({ states: { 'camera.k': { attributes: { rooms: { 1: { ...rechteck, x0: -101 } } } } } }, new Set([raumWert(rechteck)])), []);
});

test('Gegenprobe: die Prüfung schlägt an', () => {
  assert.equal(privateFunde('ip 10.0.0.1').length, 1);
  assert.equal(privateFunde('aa:bb:cc:dd:ee:ff').length, 1);
  assert.equal(privateFunde('Bearer eyJhbGciOi').length, 1);
  assert.equal(privateFunde('http://' + ['192', '168', ''].join('.')).length, 1);
  assert.equal(privateFunde('token=' + 'ab'.repeat(32)).length, 1);
  const probe = new Set([crypto.createHash('sha256').update('probewort').digest('hex')]);
  assert.equal(privateFunde('Raum Probewort', probe).length, 1, 'Name per Hash erkannt, auch großgeschrieben');
  assert.deepEqual(privateFunde('Version 2.0.3, Raum Atelier'), [], 'Versionsnummer ist keine IP');
});

// Kartendaten (map-view): Größe, Segment-Mittelpunkte und Lauflängen je Ebene
// der echten Karte stehen nur privat; hier ihre scrypt-Werte. Geprüft werden
// alle JSON-Dateien des Repos und die synthetischen Kartendaten der Tests.
const ECHTE_KARTENDATEN = new Set([
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
  'ENTFERNT-M7',
]);
const kartenWert = (s) => crypto.scryptSync(s, 'busch-vacuum-kartendaten', 32).toString('hex');

/** Fundstellen echter Kartendaten in einem beliebigen Objekt (rekursiv). */
function echteKartendaten(objekt, werte = ECHTE_KARTENDATEN) {
  const funde = [];
  const besuche = (o, wo) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.size) && o.size.length >= 7) {
      const [l, t, , , w, h, g] = o.size;
      if (werte.has(kartenWert(`size:${l},${t},${w},${h},${g}`))) funde.push(wo + ': Kartengröße');
    }
    if (Array.isArray(o.segments)) for (const s of o.segments) if (Array.isArray(s) && werte.has(kartenWert(`seg:${s[0]},${s[1]},${s[2]}`))) funde.push(wo + ': Segment ' + s[0]);
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
      for (const [k, v] of Object.entries(o.data)) {
        if (Array.isArray(v) && werte.has(kartenWert(`lauf:${k}:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`))) funde.push(wo + ': Pixel ' + k);
      }
    }
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && k !== 'data') besuche(v, wo + '.' + k);
  };
  besuche(objekt, '');
  return funde;
}

function jsonDateien(ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) return ['.git', 'node_modules', 'graphify-out'].includes(e.name) ? [] : jsonDateien(p);
    return e.name.endsWith('.json') ? [p] : [];
  });
}

test('keine echten Kartendaten in JSON-Dateien des Repos', () => {
  const dateien = jsonDateien(path.join(__dirname, '..'));
  assert.ok(dateien.length >= 4);
  for (const datei of dateien) assert.deepEqual(echteKartendaten(JSON.parse(fs.readFileSync(datei, 'utf8'))), [], datei);
});

test('synthetische Kartendaten der Tests sind keine echten', () => {
  const { ausFixture } = require('./kartendaten.js');
  const { _zellen, ...daten } = ausFixture();
  assert.deepEqual(echteKartendaten(daten), []);
});

test('Gegenprobe: die Kartendaten-Prüfung schlägt an', () => {
  const probe = { size: [-100, -200, 0, 0, 30, 40, 50, 0], segments: [[3, 10, 20]], data: { 3: [0, 0, 5] } };
  const werte = new Set([kartenWert('size:-100,-200,30,40,50'), kartenWert('seg:3,10,20'),
    kartenWert('lauf:3:' + crypto.createHash('sha256').update(JSON.stringify([0, 0, 5])).digest('hex'))]);
  assert.deepEqual(echteKartendaten({ antwort: probe }, werte), ['.antwort: Kartengröße', '.antwort: Segment 3', '.antwort: Pixel 3']);
  assert.deepEqual(echteKartendaten({ ...probe, size: [-101, -200, 0, 0, 30, 40, 50, 0], segments: [], data: {} }, werte), []);
});
