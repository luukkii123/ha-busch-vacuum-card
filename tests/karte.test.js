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

// ── Task 2: Geometrie ──────────────────────────────────────────────────────
const nah = (a, b, tol = 0.5, was = '') => {
  assert.ok(Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol, `${was} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
};

test('affineFrom: Kalibrierpunkte aus voll.json exakt, hin und zurück', () => {
  const { affineFrom, invertAffine, applyAffine } = intern();
  for (const cam of ['camera.robo_map', 'camera.robo_map_1', 'camera.robo_wifi_map_1']) {
    const cal = fixture('voll').states[cam].attributes.calibration_points;
    const m = affineFrom(cal), inv = invertAffine(m);
    for (const c of cal) {
      nah(applyAffine(m, c.vacuum), c.map, 0.5, cam + ' hin');
      nah(applyAffine(inv, c.map), c.vacuum, 0.5 * 1000 / 80 + 1e-9, cam + ' zurück');
    }
    const p = { x: 1234, y: -4321 };
    nah(applyAffine(inv, applyAffine(m, p)), p, 1e-6, 'beliebiger Punkt');
  }
});

test('affineFrom: keine Annahme über Achsen (Gerät 90°/180°/270° gedreht)', () => {
  const { affineFrom, applyAffine } = intern();
  // Bildpunkt eines Roboterpunkts bei gedrehter Karte, 0,08 px/mm.
  const dreh = { 0: (x, y) => [100 + 0.08 * x, 300 - 0.08 * y], 90: (x, y) => [100 + 0.08 * y, 300 + 0.08 * x],
    180: (x, y) => [100 - 0.08 * x, 300 + 0.08 * y], 270: (x, y) => [100 - 0.08 * y, 300 - 0.08 * x] };
  for (const [grad, f] of Object.entries(dreh)) {
    const cal = [[0, 0], [1000, 0], [0, 1000]].map(([x, y]) => ({ vacuum: { x, y }, map: { x: f(x, y)[0], y: f(x, y)[1] } }));
    const m = affineFrom(cal);
    const [ex, ey] = f(2500, -700);
    nah(applyAffine(m, { x: 2500, y: -700 }), { x: ex, y: ey }, 1e-6, grad + '°');
  }
  // Beliebige Roboterpunkte statt (0,0)/(1000,0)/(0,1000).
  const cal = [[10, 20], [530, -40], [-200, 900]].map(([x, y]) => ({ vacuum: { x, y }, map: { x: 3 + 0.1 * x, y: 7 - 0.1 * y } }));
  nah(applyAffine(affineFrom(cal), { x: 100, y: 100 }), { x: 13, y: -3 }, 1e-6, 'freie Punkte');
});

test('ungültige Kalibrierung → null, keine Ausnahme', () => {
  const { affineFrom, invertAffine } = intern();
  assert.equal(affineFrom(null), null);
  assert.equal(affineFrom([]), null);
  assert.equal(affineFrom('kaputt'), null);
  assert.equal(affineFrom([{ vacuum: { x: 0, y: 0 }, map: { x: 1, y: 1 } }]), null);
  const kollinear = [[0, 0], [1000, 0], [2000, 0]].map(([x, y]) => ({ vacuum: { x, y }, map: { x: x / 10, y } }));
  assert.equal(affineFrom(kollinear), null);
  assert.equal(affineFrom([{ vacuum: { x: 0, y: 0 }, map: { x: NaN, y: 0 } }, { vacuum: { x: 1, y: 0 }, map: { x: 1, y: 0 } }, { vacuum: { x: 0, y: 1 }, map: { x: 0, y: 1 } }]), null);
  assert.equal(invertAffine({ a: 0, b: 0, c: 0, d: 0, e: 1, f: 1 }), null);
  assert.equal(invertAffine(null), null);
});

test('gridAffine: Datenmodus-Bild = Gitter (1 px je Zelle, y gespiegelt, Gerätedrehung wie types.py rotated)', () => {
  const { gridAffine, applyAffine, decodeMapData } = intern();
  const karte = decodeMapData(ausFixture());
  const { left, top, grid: g, width: w, height: h } = karte;
  const m0 = gridAffine(karte);
  assert.deepEqual([m0.width, m0.height], [w, h]);
  nah(applyAffine(m0.matrix, { x: left, y: top }), { x: 0, y: h }, 1e-9, 'Ursprung unten links');
  nah(applyAffine(m0.matrix, { x: left + w * g, y: top + h * g }), { x: w, y: 0 }, 1e-9);
  // 90°: (x, y) → (y, W − x), Maße getauscht.
  const m90 = gridAffine(Object.assign({}, karte, { rotation: 90 }));
  assert.deepEqual([m90.width, m90.height], [h, w]);
  const p = { x: left + 10 * g, y: top + 20 * g };
  const q = applyAffine(m0.matrix, p);
  nah(applyAffine(m90.matrix, p), { x: q.y, y: w - q.x }, 1e-9, '90°');
  const m180 = gridAffine(Object.assign({}, karte, { rotation: 180 }));
  nah(applyAffine(m180.matrix, p), { x: w - q.x, y: h - q.y }, 1e-9, '180°');
  const m270 = gridAffine(Object.assign({}, karte, { rotation: 270 }));
  nah(applyAffine(m270.matrix, p), { x: h - q.y, y: q.x }, 1e-9, '270°');
  // Zuschnitt aus get_data (crop = [links, oben, rechts, unten] in Zellen).
  const mc = gridAffine(Object.assign({}, karte, { crop: [2, 3, 4, 5] }));
  assert.deepEqual([mc.width, mc.height], [w - 6, h - 8]);
  nah(applyAffine(mc.matrix, p), { x: q.x - 2, y: q.y - 3 }, 1e-9, 'Zuschnitt');
});

test('viewMatrix: Einpassen, Zoom/Verschieben, Anzeige-Drehung und scale, mit Inverse', () => {
  const { viewMatrix, applyAffine, invertAffine } = intern();
  const basis = { width: 400, height: 200, stageWidth: 800, stageHeight: 800 };
  const m = viewMatrix(basis);
  nah(applyAffine(m, { x: 0, y: 0 }), { x: 0, y: 200 }, 1e-9, 'eingepasst, mittig');
  nah(applyAffine(m, { x: 400, y: 200 }), { x: 800, y: 600 }, 1e-9);
  const z = viewMatrix(Object.assign({}, basis, { zoom: 2, panX: 10, panY: -20 }));
  nah(applyAffine(z, { x: 200, y: 100 }), { x: 410, y: 380 }, 1e-9, 'Zoom um die Mitte plus Verschiebung');
  nah(applyAffine(z, { x: 0, y: 0 }), { x: -390, y: -20 }, 1e-9);
  const s = viewMatrix(Object.assign({}, basis, { scale: 0.5 }));
  nah(applyAffine(s, { x: 0, y: 0 }), { x: 200, y: 300 }, 1e-9, 'scale verkleinert');
  for (const rotation of [90, 180, 270]) {
    const r = viewMatrix(Object.assign({}, basis, { rotation }));
    const ecken = [[0, 0], [400, 0], [0, 200], [400, 200]].map(([x, y]) => applyAffine(r, { x, y }));
    const xs = ecken.map((e) => e.x), ys = ecken.map((e) => e.y);
    // Gedreht passt das Bild in die Bühne und liegt mittig.
    assert.ok(Math.min(...xs) >= -1e-9 && Math.max(...xs) <= 800 + 1e-9 && Math.min(...ys) >= -1e-9 && Math.max(...ys) <= 800 + 1e-9, rotation + '° in der Bühne');
    nah(applyAffine(r, { x: 200, y: 100 }), { x: 400, y: 400 }, 1e-9, rotation + '° Mitte');
    const inv = invertAffine(r);
    nah(applyAffine(inv, applyAffine(r, { x: 37, y: 91 })), { x: 37, y: 91 }, 1e-9, rotation + '° zurück');
  }
  // 90° im Uhrzeigersinn: die obere linke Bildecke liegt danach oben rechts.
  const r90 = viewMatrix(Object.assign({}, basis, { rotation: 90 }));
  const ol = applyAffine(r90, { x: 0, y: 0 }), or = applyAffine(r90, { x: 400, y: 0 });
  assert.ok(ol.x > 400 && ol.y < 400 && or.y > ol.y, 'Uhrzeigersinn');
  // Ausschnitt in Prozent (Anzeigerahmen): nur die linke Hälfte füllt die Bühne.
  const c = viewMatrix(Object.assign({}, basis, { crop: { left: 0, right: 50, top: 0, bottom: 0 } }));
  nah(applyAffine(c, { x: 0, y: 0 }), { x: 0, y: 0 }, 1e-9, 'Ausschnitt links oben');
  nah(applyAffine(c, { x: 200, y: 200 }), { x: 800, y: 800 }, 1e-9, 'Ausschnitt rechts unten');
});

module.exports = { intern, raeume };
