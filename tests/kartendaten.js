'use strict';
// Synthetische Kartendaten wie /api/camera_map_data_proxy (dreame_vacuum 2.0.3,
// map.py get_data): erzeugt aus den VERFREMDETEN Raumrechtecken einer Fixture,
// nie aus echten Kartendaten. Jede Zelle gehört unter den Rechtecken, die sie
// enthalten, dem Raum mit dem nächsten Mittelpunkt; so trifft jeder Mittelpunkt
// seinen Raum, und an gemeinsamen Kanten liegt eine klare Grenze.
const fs = require('node:fs');
const path = require('node:path');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8'));

/** Lauflängen wie get_data: je Pixeltyp flach [x, y, Anzahl, …], zeilenweise. */
function lauflaengen(zellen, breite, hoehe) {
  const data = {};
  for (let y = 0; y < hoehe; y++) {
    let x = 0;
    while (x < breite) {
      const v = zellen[y * breite + x];
      let n = 1;
      while (x + n < breite && zellen[y * breite + x + n] === v) n++;
      if (v) (data[v] ||= []).push(x, y, n);
      x += n;
    }
  }
  return data;
}

/**
 * Kartendaten aus `rooms` (Roboter-mm). Gitter wie das Gerät: 50 mm je Zelle;
 * `size` = [left, top, original_left, original_top, width, height, grid, rotation, crop, visible_crop].
 * Wand (255) als Rand um jede belegte Fläche, Teppich (512) unter dem ersten Raum.
 */
function kartendaten(rooms, { grid = 50, rotation = 0, frame_id = 1 } = {}) {
  const liste = Object.values(rooms).filter((r) => r.x0 !== undefined);
  const left = Math.floor(Math.min(...liste.map((r) => r.x0)) / grid) * grid - 2 * grid;
  const top = Math.floor(Math.min(...liste.map((r) => r.y0)) / grid) * grid - 2 * grid;
  const breite = Math.ceil((Math.max(...liste.map((r) => r.x1)) - left) / grid) + 2;
  const hoehe = Math.ceil((Math.max(...liste.map((r) => r.y1)) - top) / grid) + 2;
  const zellen = new Uint16Array(breite * hoehe);
  for (let gy = 0; gy < hoehe; gy++) {
    for (let gx = 0; gx < breite; gx++) {
      const x = left + (gx + 0.5) * grid, y = top + (gy + 0.5) * grid;
      let best = null, abstand = Infinity;
      for (const r of liste) {
        if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
        const d = (x - r.x) ** 2 + (y - r.y) ** 2;
        if (d < abstand) { abstand = d; best = r.room_id; }
      }
      if (best) zellen[gy * breite + gx] = best;
    }
  }
  // Wandring: leere Zellen neben belegten.
  const wand = zellen.slice();
  for (let gy = 0; gy < hoehe; gy++) for (let gx = 0; gx < breite; gx++) {
    if (zellen[gy * breite + gx]) continue;
    const nachbar = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => zellen[(gy + dy) * breite + gx + dx] > 0 && zellen[(gy + dy) * breite + gx + dx] < 200);
    if (nachbar) wand[gy * breite + gx] = 255;
  }
  const data = lauflaengen(wand, breite, hoehe);
  const erster = liste[0];
  const teppich = [];
  for (let gy = 0; gy < hoehe; gy++) for (let gx = 0; gx < breite; gx++) if (wand[gy * breite + gx] === erster.room_id && gx % 2 === 0) teppich.push(gx, gy, 1);
  data[512] = teppich;
  return {
    size: [left, top, left, top, breite, hoehe, grid, rotation, [0, 0, 0, 0], null],
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), v])),
    frame_id, map_id: 2, map_index: 1, empty_map: false, temporary_map: false,
    segments: liste.map((r) => [r.room_id, r.x, r.y]),
    _zellen: wand, _breite: breite, _hoehe: hoehe,
  };
}

/** Kartendaten der aktuellen Karte einer Fixture (Vorgabe voll). */
function ausFixture(name = 'voll', optionen) {
  return kartendaten(fixture(name).states['camera.robo_map'].attributes.rooms, optionen);
}

module.exports = { kartendaten, ausFixture, lauflaengen, fixture };
