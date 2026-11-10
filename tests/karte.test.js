'use strict';
// Modul map-view (#882): Kartendaten, Geometrie, Kartenbereich, Vertrag.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung } = require('./attrappe.js');
const { ausFixture, kartendaten, lauflaengen, fixture } = require('./kartendaten.js');

const intern = () => neueUmgebung().registry.get('busch-vacuum-card').__internals;
const raeume = (name = 'voll') => fixture(name).states['camera.robo_map'].attributes.rooms;

// ── Task 1: Spike Raum-Treffertest ─────────────────────────────────────────
test('Lauflängen-Dekodierung: Gitter, Größe und Teppich wie get_data', () => {
  const { decodeMapData } = intern();
  const daten = ausFixture();
  const karte = decodeMapData(daten);
  assert.equal(karte.width, daten._breite);
  assert.equal(karte.height, daten._hoehe);
  assert.equal(karte.grid, 50);
  assert.equal(karte.left, daten.size[0]);
  assert.equal(karte.top, daten.size[1]);
  for (let i = 0; i < daten._zellen.length; i++) assert.equal(karte.cells[i], daten._zellen[i], 'Zelle ' + i);
  assert.ok(karte.carpet.some(Boolean), 'Teppichebene 512 getrennt');
  assert.equal(decodeMapData({ empty_map: true, size: [0, 0, 0, 0, 1, 1, 0, 0, [0, 0, 0, 0]] }), null, 'leere Karte');
  assert.equal(decodeMapData(null), null);
  assert.equal(decodeMapData({ size: 'kaputt', data: {} }), null, 'Unsinn wirft nicht');
});

test('roomAt (Datenmodus) trifft jeden Mittelpunkt und an gemeinsamen Kanten nie den Nachbarn', () => {
  const { decodeMapData, roomAtGrid } = intern();
  const daten = ausFixture();
  const karte = decodeMapData(daten);
  for (const r of Object.values(raeume())) assert.equal(roomAtGrid(karte, { x: r.x, y: r.y }), r.room_id, 'Mittelpunkt ' + r.name);
  let kanten = 0;
  const { _zellen: z, _breite: b, _hoehe: h } = daten;
  const [left, top, , , , , g] = daten.size;
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx + 1 < b; gx++) {
    const a = z[gy * b + gx], c = z[gy * b + gx + 1];
    if (a === c || a === 0 || c === 0 || a > 200 || c > 200) continue;
    kanten++;
    const kante = left + (gx + 1) * g, y = top + (gy + 0.5) * g;
    assert.equal(roomAtGrid(karte, { x: kante - 1, y }), a, 'links der Kante');
    assert.equal(roomAtGrid(karte, { x: kante, y }), c, 'rechts der Kante');
  }
  assert.ok(kanten > 10, 'Fixture hat gemeinsame Kanten: ' + kanten);
  assert.equal(roomAtGrid(karte, { x: left - 500, y: top - 500 }), null, 'außerhalb');
});

test('Rückfall Rechteck+Mittelpunkt: Überlappung → nächster Mittelpunkt', () => {
  const { roomAtRects } = intern();
  const rooms = {
    1: { room_id: 1, x: 100, y: 100, x0: 0, y0: 0, x1: 1000, y1: 1000 },
    2: { room_id: 2, x: 1200, y: 800, x0: 600, y0: 0, x1: 1400, y1: 1000 },
  };
  assert.equal(roomAtRects(rooms, { x: 300, y: 300 }), 1, 'nur in Raum 1');
  assert.equal(roomAtRects(rooms, { x: 800, y: 500 }), 2, 'Überlappung, näher an 2');
  assert.equal(roomAtRects(rooms, { x: 650, y: 100 }), 1, 'Überlappung, näher an 1');
  assert.equal(roomAtRects(rooms, { x: 2000, y: 0 }), null);
  for (const r of Object.values(raeume())) assert.equal(roomAtRects(raeume(), { x: r.x, y: r.y }), r.room_id, 'Fixture-Mittelpunkt ' + r.name);
});

test('passable: Boden und Raum ja, Wand/außen nein, ohne Daten null', () => {
  const { decodeMapData, passableGrid } = intern();
  const daten = ausFixture();
  const karte = decodeMapData(daten);
  const r = Object.values(raeume())[0];
  assert.equal(passableGrid(karte, { x: r.x, y: r.y }), true);
  const [left, top, , , , , g] = daten.size;
  assert.equal(passableGrid(karte, { x: left + 1, y: top + 1 }), false, 'außen');
  const wand = daten._zellen.indexOf(255);
  assert.equal(passableGrid(karte, { x: left + (wand % daten._breite + 0.5) * g, y: top + (Math.floor(wand / daten._breite) + 0.5) * g }), false, 'Wand');
  assert.equal(passableGrid(null, { x: 0, y: 0 }), null);
});

test('Dekodierzeit 1000×1000-Gitter (Handy-Grenze aus der Spec)', () => {
  const { decodeMapData } = intern();
  const b = 1000, h = 1000, zellen = new Uint16Array(b * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) zellen[y * b + x] = ((x >> 6) + (y >> 6)) % 30 + 1;
  const daten = { size: [0, 0, 0, 0, b, h, 50, 0, [0, 0, 0, 0], null], data: lauflaengen(zellen, b, h) };
  const start = process.hrtime.bigint();
  const karte = decodeMapData(daten);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(karte.cells[999 * b + 999], zellen[999 * b + 999]);
  console.log('# Dekodierung 1000x1000: ' + ms.toFixed(1) + ' ms');
  assert.ok(ms < 250, ms + ' ms');
});

module.exports = { intern, raeume };
