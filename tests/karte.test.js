'use strict';
// Modul map-view (#882): Kartendaten, Geometrie, Kartenbereich, Vertrag.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');
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

// ── Task 3: Kartenbereich, Bild, Zustände ──────────────────────────────────
const CAM = 'camera.robo_map';
/** Umgebung, in der Bilder Maße haben (wie nach decode() im Browser). */
function bildUmgebung({ breite = 1444, hoehe = 1444, fehler = false } = {}) {
  const u = neueUmgebung();
  const erzeuge = u.document.createElement.bind(u.document);
  u.bilder = [];
  u.document.createElement = (tag) => {
    const n = erzeuge(tag);
    if (tag === 'img') { n.naturalWidth = breite; n.naturalHeight = hoehe; n.decode = () => (fehler ? Promise.reject(new Error('404')) : Promise.resolve()); u.bilder.push(n); }
    return n;
  };
  return u;
}
const kamera = (haus, attribute, zustand) => {
  const alt = haus.states[CAM];
  return { [CAM]: { entity_id: CAM, state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
};
const sauger = (haus, attribute, zustand) => {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
};
const ansicht = (karte) => karte.shadowRoot.querySelector('.map-view');
const hinweise = (karte) => karte.shadowRoot.querySelectorAll('.map-note').map((n) => n.getAttribute('data-kind'));
async function kartenKarte(fixture = 'voll', config = {}, opts = {}) {
  const u = bildUmgebung(opts), haus = hausAus(fixture);
  const karte = neueKarte(u, haus, config);
  await mikro();
  return { u, haus, karte };
}

test('Kartenbereich nur bei can(map), zwischen Kopf und Meldungen', async () => {
  const { karte } = await kartenKarte();
  const slot = karte.shadowRoot.querySelector('.map-slot');
  assert.ok(slot && !slot.hidden, 'Platz da');
  const kinder = karte.shadowRoot.querySelector('ha-card').childNodes.map((n) => n.className);
  assert.ok(kinder.indexOf('map-slot') === kinder.indexOf('top') + 1 && kinder.indexOf('messages') === kinder.indexOf('map-slot') + 1, kinder.join(','));
  assert.ok(ansicht(karte));
  for (const f of ['minimal', 'ohne-karte']) {
    const { u, karte: k } = await kartenKarte(f);
    assert.equal(k.shadowRoot.querySelector('.map-slot').hidden, true, f + ': kein Kartenbereich');
    assert.equal(ansicht(k), null);
    assert.deepEqual(u.fehler, []);
  }
});

test('Bild aus entity_picture, decode() vor dem Tausch, mit Alternativtext', async () => {
  const u = bildUmgebung(), haus = hausAus('voll');
  const karte = neueKarte(u, haus);
  assert.deepEqual(hinweise(karte), ['loading'], 'lädt (R11)');
  assert.equal(karte.shadowRoot.querySelector('.map-base'), null, 'vor decode() kein Bild im Baum');
  await mikro();
  const bild = karte.shadowRoot.querySelector('.map-base');
  assert.equal(bild.getAttribute('src'), haus.states[CAM].attributes.entity_picture);
  assert.match(bild.getAttribute('alt'), /Karte 1/);
  assert.deepEqual(hinweise(karte), []);
  assert.equal(karte._map.stats.images, 1);
});

test('kein neues Bild bei fremden Updates und gleichem entity_picture; neues bei neuem v', async () => {
  const { u, haus, karte } = await kartenKarte();
  const vorher = karte._map.stats.renders;
  karte.hass = haus.fremd();
  karte.hass = haus.fremd();
  assert.equal(karte._map.stats.images, 1, 'fremd: 0 Abrufe');
  assert.equal(karte._map.stats.renders, vorher, 'fremd: kein Neuaufbau');
  karte.hass = haus.setze(kamera(haus, { updated_at: 'neu' }));
  assert.equal(karte._map.stats.images, 1, 'gleiches Bild');
  karte.hass = haus.setze(kamera(haus, { entity_picture: '/api/camera_proxy/camera.robo_map?token=testtoken&v=2' }));
  await mikro();
  assert.equal(karte._map.stats.images, 2, 'neues v');
  assert.match(karte.shadowRoot.querySelector('.map-base').getAttribute('src'), /v=2$/);
  assert.equal(u.bilder.length, 2);
});

test('Snapshot beobachtet die aktive Kartenkamera', async () => {
  const { haus, karte } = await kartenKarte();
  assert.ok(karte._seen.ids.includes(CAM));
  assert.ok(!karte._seen.ids.includes('camera.robo_map_1'), 'gespeicherte Karten nur im Dialog');
});

test('Zustand: keine gespeicherte Karte → Hinweis statt Fläche', async () => {
  const u = bildUmgebung(), haus = hausAus('voll');
  haus.states = Object.assign({}, haus.states, sauger(haus, { has_saved_map: false }), kamera(haus, { is_empty: true }));
  const karte = neueKarte(u, haus);
  await mikro();
  assert.deepEqual(hinweise(karte), ['empty']);
  assert.equal(karte.shadowRoot.querySelector('.map-stage').hidden, true);
  assert.equal(karte._map.stats.images, 0, 'kein Abruf ohne Karte');
});

test('Zustand: Kamera nicht verfügbar → was, Folge, nächster Schritt (R12)', async () => {
  const u = bildUmgebung(), haus = hausAus('voll');
  haus.states = Object.assign({}, haus.states, kamera(haus, {}, 'unavailable'));
  const karte = neueKarte(u, haus);
  await mikro();
  assert.deepEqual(hinweise(karte), ['unavailable']);
  const text = karte.shadowRoot.querySelector('.map-note').textContent;
  assert.match(text, /nicht verfügbar/);
  assert.match(text, /Steuerung/);
  assert.match(text, /Integration/);
  assert.equal(karte._map.stats.images, 0);
});

test('Zustand: Bild lädt nicht → Fehler mit erneut laden', async () => {
  const { haus, karte, u } = await kartenKarte('voll', {}, { fehler: true });
  assert.deepEqual(hinweise(karte), ['error']);
  const knopf = karte.shadowRoot.querySelector('[data-action="map-retry"]');
  knopf.click();
  await mikro();
  assert.equal(karte._map.stats.images, 2, 'zweiter Versuch');
});

test('Zustand: temporäre Karte und Kartierung als Hinweis über der Karte', async () => {
  const u = bildUmgebung(), haus = hausAus('voll');
  haus.states = Object.assign({}, haus.states, sauger(haus, { has_temporary_map: true, mapping: true }));
  const karte = neueKarte(u, haus);
  await mikro();
  assert.deepEqual(hinweise(karte), ['temporary', 'mapping']);
  assert.ok(karte.shadowRoot.querySelector('.map-base'), 'Karte bleibt sichtbar');
});

test('Zustand: Bild ohne Kalibrierung → Hinweis, keine Overlays', async () => {
  const u = bildUmgebung(), haus = hausAus('voll');
  haus.states = Object.assign({}, haus.states, kamera(haus, { calibration_points: null }));
  const karte = neueKarte(u, haus);
  await mikro();
  assert.deepEqual(hinweise(karte), ['uncalibrated']);
  assert.equal(karte._map.current().calibration, null);
  assert.equal(karte._map.toImage({ x: 0, y: 0 }), null);
});

test('current(): Kamera, Karte, Kalibrierung, Räume, Frame', async () => {
  const { haus, karte } = await kartenKarte();
  const c = karte._map.current();
  const a = haus.states[CAM].attributes;
  assert.equal(c.camera, CAM);
  assert.equal(c.mapId, a.map_id);
  assert.equal(c.index, 1);
  assert.equal(c.name, 'Karte 1');
  assert.equal(c.frameId, a.frame_id);
  assert.equal(c.updatedAt, a.updated_at);
  assert.equal(c.mode, 'image');
  assert.deepEqual(Object.keys(c.rooms), Object.keys(a.rooms));
  const p = karte._map.toImage(a.calibration_points[1].vacuum);
  assert.deepEqual([Math.round(p.x), Math.round(p.y)], [a.calibration_points[1].map.x, a.calibration_points[1].map.y]);
  const r = karte._map.toRobot(a.calibration_points[2].map);
  assert.deepEqual([Math.round(r.x), Math.round(r.y)], [0, 1000]);
});

// ── Task 4: Zoom, Verschieben, Sperre, Lupe ────────────────────────────────
const ev = (u, typ, init) => u.neuesEreignis(typ, Object.assign({ pointerType: 'mouse', pointerId: 1 }, init));
const zeiger = (u, karte, typ, x, y, id = 1) => karte._map.stage.dispatchEvent(ev(u, typ, { clientX: x, clientY: y, pointerId: id }));
const werkzeug = (karte, name) => karte.shadowRoot.querySelector('[data-action="map-' + name + '"]');
const taste = (u, karte, key) => { const e = ev(u, 'keydown', { key }); karte._map.region.dispatchEvent(e); return e; };
const ansichtZustand = (karte) => ({ zoom: karte._map._zoom, x: Math.round(karte._map._panX), y: Math.round(karte._map._panY) });

test('sichtbare Knöpfe Vergrößern/Verkleinern/Einpassen mit Namen (R22)', async () => {
  const { karte } = await kartenKarte();
  for (const [name, label] of [['zoom-in', 'Vergrößern'], ['zoom-out', 'Verkleinern'], ['fit', 'Einpassen']]) {
    const knopf = werkzeug(karte, name);
    assert.ok(knopf, name);
    assert.equal(knopf.getAttribute('aria-label'), label);
    assert.ok(knopf.classList.contains('busch-ui-action'), '44-px-Grundstil');
  }
  assert.equal(werkzeug(karte, 'zoom-out').disabled, true, 'bei 1× nicht kleiner');
  werkzeug(karte, 'zoom-in').click();
  assert.equal(karte._map._zoom, 2);
  werkzeug(karte, 'zoom-in').click(); werkzeug(karte, 'zoom-in').click(); werkzeug(karte, 'zoom-in').click();
  assert.equal(karte._map._zoom, 8, 'Grenze 8×');
  assert.equal(werkzeug(karte, 'zoom-in').disabled, true);
  werkzeug(karte, 'zoom-out').click();
  assert.equal(karte._map._zoom, 4);
  werkzeug(karte, 'fit').click();
  assert.deepEqual(ansichtZustand(karte), { zoom: 1, x: 0, y: 0 });
});

test('Ziehen verschiebt, transform ändert sich', async () => {
  const { u, karte } = await kartenKarte();
  werkzeug(karte, 'zoom-in').click();
  const vorher = karte._map.pan.style.transform;
  zeiger(u, karte, 'pointerdown', 100, 50);
  zeiger(u, karte, 'pointermove', 120, 60);
  assert.ok(karte._map.el.hasAttribute('data-gesture'), 'während der Geste ohne Übergang');
  zeiger(u, karte, 'pointermove', 130, 70);
  zeiger(u, karte, 'pointerup', 130, 70);
  assert.deepEqual(ansichtZustand(karte), { zoom: 2, x: 30, y: 20 });
  assert.notEqual(karte._map.pan.style.transform, vorher);
  assert.ok(!karte._map.el.hasAttribute('data-gesture'));
});

test('Zwei Finger zoomen um ihre Mitte', async () => {
  const { u, karte } = await kartenKarte();
  const unter = karte._map.fromScreen({ x: 100, y: 50 });
  zeiger(u, karte, 'pointerdown', 90, 50, 1);
  zeiger(u, karte, 'pointerdown', 110, 50, 2);
  zeiger(u, karte, 'pointermove', 80, 50, 1);
  zeiger(u, karte, 'pointermove', 120, 50, 2);
  assert.equal(karte._map._zoom, 2);
  const nachher = karte._map.fromScreen({ x: 100, y: 50 });
  assert.ok(Math.abs(nachher.x - unter.x) < 1e-6 && Math.abs(nachher.y - unter.y) < 1e-6, 'Mitte bleibt');
  zeiger(u, karte, 'pointerup', 80, 50, 1);
  zeiger(u, karte, 'pointerup', 120, 50, 2);
});

test('Doppeltipp vergrößert um den Punkt, Mausrad um den Zeiger', async () => {
  const { u, karte } = await kartenKarte();
  const unter = karte._map.fromScreen({ x: 150, y: 30 });
  for (let i = 0; i < 2; i++) { zeiger(u, karte, 'pointerdown', 150, 30); zeiger(u, karte, 'pointerup', 150, 30); u.uhr.vor(100); }
  assert.equal(karte._map._zoom, 2);
  const nach = karte._map.fromScreen({ x: 150, y: 30 });
  assert.ok(Math.abs(nach.x - unter.x) < 1e-6 && Math.abs(nach.y - unter.y) < 1e-6);
  const rad = ev(u, 'wheel', { clientX: 40, clientY: 80, deltaY: -200 });
  const vorRad = karte._map.fromScreen({ x: 40, y: 80 });
  karte._map.stage.dispatchEvent(rad);
  assert.ok(karte._map._zoom > 2 && karte._map._zoom <= 8);
  assert.ok(rad.defaultPrevented, 'Seite scrollt nicht mit');
  const nachRad = karte._map.fromScreen({ x: 40, y: 80 });
  assert.ok(Math.abs(nachRad.x - vorRad.x) < 1e-6 && Math.abs(nachRad.y - vorRad.y) < 1e-6, 'um den Zeiger');
  for (let i = 0; i < 30; i++) karte._map.stage.dispatchEvent(ev(u, 'wheel', { clientX: 40, clientY: 80, deltaY: 500 }));
  assert.equal(karte._map._zoom, 1, 'Grenze 1×');
});

test('Tastatur bei fokussierter Karte: + - 0 und Pfeile', async () => {
  const { u, karte } = await kartenKarte();
  assert.equal(karte._map.region.tabIndex, 0, 'fokussierbar (R03)');
  assert.ok(taste(u, karte, '+').defaultPrevented);
  assert.equal(karte._map._zoom, 2);
  taste(u, karte, 'ArrowRight');
  assert.ok(karte._map._panX < 0, 'Pfeil rechts zeigt mehr rechts');
  taste(u, karte, 'ArrowUp');
  assert.ok(karte._map._panY > 0);
  taste(u, karte, '-');
  assert.equal(karte._map._zoom, 1);
  taste(u, karte, '+'); taste(u, karte, '0');
  assert.deepEqual(ansichtZustand(karte), { zoom: 1, x: 0, y: 0 });
  assert.equal(taste(u, karte, 'a').defaultPrevented, false, 'andere Tasten bleiben frei');
});

test('gesperrt: keine Geste wirkt, Knöpfe mit Grund deaktiviert, Seite scrollt (pan-y)', async () => {
  const { u, karte } = await kartenKarte('voll', { locked: 'always' });
  assert.equal(karte.getAttribute('data-locked'), 'true');
  zeiger(u, karte, 'pointerdown', 100, 50); zeiger(u, karte, 'pointermove', 150, 90); zeiger(u, karte, 'pointerup', 150, 90);
  const rad = ev(u, 'wheel', { clientX: 40, clientY: 80, deltaY: -200 });
  karte._map.stage.dispatchEvent(rad);
  assert.equal(rad.defaultPrevented, false, 'Rad scrollt die Seite');
  taste(u, karte, '+');
  assert.deepEqual(ansichtZustand(karte), { zoom: 1, x: 0, y: 0 });
  for (const name of ['zoom-in', 'zoom-out', 'fit']) {
    const knopf = werkzeug(karte, name);
    assert.equal(knopf.disabled, true, name);
    assert.equal(knopf.getAttribute('aria-describedby'), 'map-lock-reason');
  }
  assert.match(karte.shadowRoot.querySelector('#map-lock-reason').textContent, /gesperrt/);
  const css = karte.shadowRoot.querySelector('style').textContent;
  assert.match(css, /:host\(\[data-locked=true\]\) \.map-stage \{\s*touch-action: pan-y;/);
  // Entsperren (core) gibt die Gesten frei, ohne Neuaufbau der Karte.
  const schloss = karte.shadowRoot.querySelector('.lock');
  schloss.dispatchEvent(u.neuesEreignis('pointerdown')); u.uhr.vor(400);
  assert.equal(karte.getAttribute('data-locked'), 'false');
  assert.equal(werkzeug(karte, 'zoom-in').disabled, false);
  taste(u, karte, '+');
  assert.equal(karte._map._zoom, 2);
});

test('animiert über transform; sofort bei reduzierter Bewegung und animations ausgeblendet', async () => {
  const { karte } = await kartenKarte();
  const css = karte.shadowRoot.querySelector('style').textContent;
  assert.match(css, /\.map-pan \{[^}]*transition: transform/);
  assert.match(css, /prefers-reduced-motion: reduce\)[^@]*\.map-pan[^}]*transition: none/);
  assert.match(css, /\.map-view\[data-still\] \.map-pan/);
  assert.equal(karte._map.el.hasAttribute('data-still'), false);
  const { karte: still } = await kartenKarte('voll', { hidden_card_objects: ['animations'] });
  assert.equal(still._map.el.hasAttribute('data-still'), true);
});

test('toScreen/fromScreen mit Zoom und Verschiebung, Karte startet eingepasst (R21)', async () => {
  const { u, karte } = await kartenKarte();
  const m = karte._map;
  const p = { x: 700, y: 300 };
  let s = m.toScreen(p);
  assert.ok(Math.abs(m.fromScreen(s).x - p.x) < 1e-6);
  werkzeug(karte, 'zoom-in').click();
  zeiger(u, karte, 'pointerdown', 10, 10); zeiger(u, karte, 'pointermove', 40, 30); zeiger(u, karte, 'pointerup', 40, 30);
  s = m.toScreen(p);
  const r = m.fromScreen(s);
  assert.ok(Math.abs(r.x - p.x) < 1e-6 && Math.abs(r.y - p.y) < 1e-6);
  // Neuer Aufbau (neue Konfiguration): wieder eingepasst, nichts gemerkt.
  karte.setConfig({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo', title: 'neu' });
  await mikro();
  assert.deepEqual(ansichtZustand(karte), { zoom: 1, x: 0, y: 0 });
});

test('showLoupe/hideLoupe zeigt den Ausschnitt unter dem Zeiger', async () => {
  const { karte } = await kartenKarte();
  const m = karte._map;
  const lupe = karte.shadowRoot.querySelector('.map-loupe');
  assert.equal(lupe.hidden, true);
  m.showLoupe({ x: 120, y: 40 });
  assert.equal(lupe.hidden, false);
  const q = m.fromScreen({ x: 120, y: 40 });
  assert.equal(lupe.getAttribute('data-image-x'), String(Math.round(q.x)));
  assert.equal(lupe.getAttribute('data-image-y'), String(Math.round(q.y)));
  assert.ok(lupe.querySelector('.map-loupe-content').childNodes.length > 0, 'Kartenbild in der Lupe');
  m.hideLoupe();
  assert.equal(lupe.hidden, true);
});

// ── Task 5: Ebenen-API und Overlays ────────────────────────────────────────
const ebene = (karte, name) => karte._map.svg.querySelector('[data-layer="' + name + '"]');
const ebenenReihe = (karte) => karte._map.svg.childNodes.filter((n) => n.getAttribute('data-layer')).map((n) => n.getAttribute('data-layer'));
const symbolGroesse = (karte) => Number(karte._map.svg.style['--bvc-map-symbol']);

test('addLayer/removeLayer/refresh mit z-Reihenfolge', async () => {
  const { karte } = await kartenKarte();
  const m = karte._map;
  const aufrufe = [];
  m.addLayer('modul-oben', { z: 1000, render: (g, ctx) => { aufrufe.push(['oben', ctx.camera]); g.appendChild(m.svgNode('circle', { r: 3 })); } });
  m.addLayer('modul-unten', { z: 0, render: () => aufrufe.push(['unten']) });
  const reihe = ebenenReihe(karte);
  assert.equal(reihe[0], 'modul-unten', 'z 0 zuunterst');
  assert.equal(reihe.at(-1), 'modul-oben', 'z 1000 zuoberst');
  assert.ok(reihe.indexOf('robot') < reihe.indexOf('modul-oben') && reihe.indexOf('rooms') > 0);
  assert.deepEqual(aufrufe, [['oben', CAM], ['unten']]);
  m.refresh('modul-oben');
  assert.equal(aufrufe.length, 3);
  assert.equal(ebene(karte, 'modul-oben').childNodes.length, 1, 'refresh zeichnet neu statt anzuhängen');
  m.removeLayer('modul-oben');
  assert.equal(ebene(karte, 'modul-oben'), null);
  m.refresh();
  assert.equal(aufrufe.length, 4, 'refresh() ohne id: alle fremden Ebenen');
});

test('je Objektart eine Ebene aus den Kamera-Attributen', async () => {
  const { haus, karte } = await kartenKarte();
  const a = haus.states[CAM].attributes;
  const zahl = (name, sel = '[data-object]') => ebene(karte, name).querySelectorAll(sel).length;
  assert.equal(zahl('rooms'), Object.keys(a.rooms).length);
  assert.equal(zahl('carpets'), a.carpets.length);
  assert.equal(zahl('detected_carpets'), a.detected_carpets.length);
  assert.equal(zahl('deleted_carpets'), a.deleted_carpets.length);
  assert.equal(zahl('virtual_walls'), a.virtual_walls.length);
  assert.equal(zahl('passable_thresholds'), a.passable_thresholds.length);
  assert.equal(zahl('obstacles'), Object.keys(a.obstacles).length);
  for (const name of ['robot', 'charger', 'router']) assert.equal(zahl(name), 1, name);
  for (const name of ['no_go_areas', 'no_mopping_areas', 'impassable_thresholds', 'ramps', 'curtains']) assert.equal(zahl(name), 0, name + ' leer in voll');
  for (const name of ['path', 'furnitures', 'predefined_points', 'stains', 'pets', 'blocked_rooms', 'cleaning_settings', 'station_status']) assert.ok(ebene(karte, name), name + ' als Ebene da');
  const namen = Object.values(a.rooms).map((r) => r.name).sort();
  assert.deepEqual(ebene(karte, 'rooms').querySelectorAll('text').filter((n) => n.getAttribute('data-role') === 'name').map((n) => n.textContent).sort(), namen);
  // Reihenfolge-Badge aus rooms[].order.
  const atelier = ebene(karte, 'rooms').querySelectorAll('[data-object]').find((n) => n.getAttribute('data-object') === '1');
  assert.equal(atelier.querySelectorAll('text').find((n) => n.getAttribute('data-role') === 'order').textContent, '4');
});

test('Roboter-Update ändert nur ein transform', async () => {
  const { haus, karte } = await kartenKarte();
  const m = karte._map;
  const roboter = ebene(karte, 'robot').querySelector('[data-object]');
  const vorher = roboter.style.transform;
  const zaehler = () => Array.from(m._layers.values()).map((l) => l.renders);
  const z = zaehler();
  karte.hass = haus.setze(kamera(haus, { vacuum_position: { x: 0, y: 0, a: 90 } }));
  assert.equal(ebene(karte, 'robot').querySelector('[data-object]'), roboter, 'derselbe Knoten');
  assert.notEqual(roboter.style.transform, vorher);
  assert.deepEqual(zaehler(), z, 'keine Ebene neu gezeichnet');
  const p = m.toImage({ x: 0, y: 0 });
  assert.match(roboter.style.transform, new RegExp('translate\\(' + p.x + 'px, ?' + p.y + 'px\\)'));
});

test('Symbole skalieren mit object_scale, nicht mit dem Zoom; font_size, object_opacity', async () => {
  const { karte } = await kartenKarte('voll', { map_config: { map_1: { object_scale: 2, font_size: 16, object_opacity: 0.5 } } });
  const m = karte._map;
  const k = Math.hypot(m._view.a, m._view.b);
  assert.ok(Math.abs(symbolGroesse(karte) - 2 / k) < 1e-9, 'Symbol in Bildschirm-px mal object_scale');
  karte.shadowRoot.querySelector('[data-action="map-zoom-in"]').click();
  assert.ok(Math.abs(symbolGroesse(karte) - 1 / k) < 1e-9, 'Zoom 2: halbe Bild-px, gleiche Bildschirmgröße');
  assert.match(ebene(karte, 'robot').querySelector('[data-object]').style.transform, /scale\(var\(--bvc-map-symbol\)\)/);
  assert.equal(ebene(karte, 'rooms').querySelector('text').getAttribute('font-size'), '16');
  assert.equal(m.svg.style.opacity, '0.5');
  const { karte: normal } = await kartenKarte();
  assert.equal(normal._map.svg.style.opacity, '1');
  assert.equal(normal._map.config(1).font_size, 12, 'Vorgabe');
});

test('hidden_objects global und je Karte blendet genau die genannte Ebene aus', async () => {
  const { karte } = await kartenKarte('voll', { hidden_objects: ['carpets'], map_config: { map_1: { hidden_objects: ['obstacles'] } } });
  const aus = ebenenReihe(karte).filter((n) => ebene(karte, n).hidden);
  assert.deepEqual(aus.sort(), ['carpets', 'obstacles']);
  assert.equal(karte._map.visible('carpets'), false);
  assert.equal(karte._map.visible('obstacles'), false);
  assert.equal(karte._map.visible('robot'), true);
  const { karte: k2 } = await kartenKarte('voll', { map_config: { map_2: { hidden_objects: ['robot'] } } });
  assert.equal(k2._map.visible('robot'), true, 'andere Karte wirkt nicht');
  assert.deepEqual(karte._map.config(1).hidden_objects.sort(), ['carpets', 'obstacles']);
});

test('Objekte nicht nur über Farbe unterscheidbar (R17)', async () => {
  const { karte } = await kartenKarte();
  const formen = ['robot', 'charger', 'router', 'obstacles'].map((n) => ebene(karte, n).querySelector('[data-object]').getAttribute('data-symbol'));
  assert.equal(new Set(formen).size, 4, 'eigene Form je Symbol: ' + formen);
  const css = karte.shadowRoot.querySelector('style').textContent;
  const linie = (sel) => (css.match(new RegExp(sel.replace(/[[\]]/g, '\\$&') + '[^{]*\\{([^}]*)\\}')) || [])[1] || '';
  const muster = ['no_go_areas', 'no_mopping_areas', 'carpets', 'detected_carpets', 'deleted_carpets', 'virtual_walls', 'passable_thresholds', 'impassable_thresholds']
    .map((n) => (linie('[data-layer=' + n + '] [data-object]').match(/stroke-dasharray:[^;]*/) || ['durchgezogen'])[0] + (linie('[data-layer=' + n + '] [data-object]').match(/stroke-width:[^;]*/) || [''])[0]);
  assert.ok(new Set(muster).size >= 6, 'Strichart/-stärke unterscheidet: ' + muster.join(' | '));
});

// ── Task 6: Treffertest, Modi, Raum-Chips ──────────────────────────────────
/** Karte mit Kartendaten-Abruf (fetch wie im Browser); `antwort` steuert die Antwort. */
async function datenKarte({ config = {}, antwort, fixture = 'voll' } = {}) {
  const u = bildUmgebung();
  const daten = ausFixture(fixture, { frame_id: 1180 });
  u.abrufe = [];
  u.kontext.fetch = async (url) => {
    u.abrufe.push(url);
    if (antwort) return antwort(url);
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(Object.assign({}, daten, { _zellen: undefined }))) };
  };
  const haus = hausAus(fixture);
  const karte = neueKarte(u, haus, config);
  // Eine handygroße Bühne statt der 200×100 der Attrappe: Trefferradien in Bildschirm-px werden realistisch.
  karte._map.stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 2000, bottom: 2000, width: 2000, height: 2000 });
  await mikro(); await mikro();
  return { u, haus, karte, daten };
}
const ereignisse = (karte, ...typen) => {
  const liste = [];
  for (const typ of typen) karte._map.el.addEventListener(typ, (e) => liste.push([typ, e.detail]));
  return liste;
};
const tippe = (u, karte, client) => { zeiger(u, karte, 'pointerdown', client.x, client.y); zeiger(u, karte, 'pointerup', client.x, client.y); u.uhr.vor(400); };
const bildschirm = (karte, robot) => karte._map.toScreen(karte._map.toImage(robot));

test('Datenmodus: Kartendaten nur bei neuem frame_id, URL mit &v=<frame_id>', async () => {
  const { u, haus, karte } = await datenKarte();
  assert.equal(u.abrufe.length, 1);
  assert.equal(u.abrufe[0], '/api/camera_map_data_proxy/camera.robo_map?token=testtoken&v=1180');
  assert.equal(karte._map.current().mode, 'data');
  karte.hass = haus.fremd();
  karte.hass = haus.setze(kamera(haus, { vacuum_position: { x: 1, y: 2, a: 0 } }));
  await mikro();
  assert.equal(u.abrufe.length, 1, 'gleicher Frame: kein Abruf');
  karte.hass = haus.setze(kamera(haus, { frame_id: 1181 }));
  await mikro(); await mikro();
  assert.deepEqual(u.abrufe.slice(1), ['/api/camera_map_data_proxy/camera.robo_map?token=testtoken&v=1181']);
  assert.equal(karte._map.stats.data, 2);
});

test('Datenmodus nicht verfügbar → Bildmodus, Treffertest Rechteck+Mittelpunkt', async () => {
  const { karte } = await datenKarte({ antwort: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  const m = karte._map;
  assert.equal(m.current().mode, 'image');
  for (const r of Object.values(raeume())) assert.equal(m.roomAt({ x: r.x, y: r.y }), r.room_id, r.name);
  assert.equal(m.passable({ x: 0, y: 0 }), null, 'unbekannt ohne Daten');
  const { karte: ohneFetch } = await kartenKarte();
  assert.equal(ohneFetch._map.current().mode, 'image');
});

test('roomAt/passable im Datenmodus exakt; unbekannte Raum-ID → null', async () => {
  const { karte, daten } = await datenKarte();
  const m = karte._map;
  for (const r of Object.values(raeume())) assert.equal(m.roomAt({ x: r.x, y: r.y }), r.room_id, r.name);
  const [left, top] = daten.size;
  assert.equal(m.roomAt({ x: left + 1, y: top + 1 }), null);
  assert.equal(m.passable({ x: left + 1, y: top + 1 }), false);
  const r = Object.values(raeume())[0];
  assert.equal(m.passable({ x: r.x, y: r.y }), true);
});

test('hitTest: Raum, Objekt (Hindernis), außerhalb', async () => {
  const { haus, karte } = await datenKarte();
  const m = karte._map;
  const r = raeume()['3'];
  const raum = m.hitTest(bildschirm(karte, r));
  assert.equal(raum.kind, 'room');
  assert.equal(raum.id, 3);
  assert.ok(Math.abs(raum.robot.x - r.x) < 1 && Math.abs(raum.robot.y - r.y) < 1, 'Roboter-mm');
  const hindernis = haus.states[CAM].attributes.obstacles['2'];
  const h = m.hitTest(bildschirm(karte, hindernis));
  assert.equal(h.kind, 'object');
  assert.equal(h.id, '2');
  assert.equal(h.layer, 'obstacles');
  assert.equal(h.object.reason, hindernis.reason);
  const aussen = m.hitTest(m.toScreen({ x: 1, y: 1 }));
  assert.equal(aussen.kind, 'outside');
});

test('Modi erzeugen die Vertragsereignisse; gesperrt keine', async () => {
  const { u, karte } = await datenKarte();
  const m = karte._map;
  const liste = ereignisse(karte, 'map-tap', 'map-room-tap', 'map-object-tap', 'map-long-press', 'map-drag');
  const r = raeume()['5'];
  tippe(u, karte, bildschirm(karte, r));
  assert.deepEqual(liste.map((e) => e[0]), ['map-tap', 'map-room-tap'], 'view: Tipp + Raum');
  assert.equal(liste[1][1].room, 5);
  assert.equal(liste[1][1].source, 'map');
  liste.length = 0;
  m.setMode('pick-point');
  tippe(u, karte, bildschirm(karte, r));
  assert.deepEqual(liste.map((e) => e[0]), ['map-tap']);
  assert.ok(Math.abs(liste[0][1].robot.x - r.x) < 1);
  assert.equal(liste[0][1].passable, true);
  liste.length = 0;
  m.setMode('pick-room');
  tippe(u, karte, bildschirm(karte, r));
  assert.deepEqual(liste.map((e) => e[0]), ['map-tap', 'map-room-tap']);
  liste.length = 0;
  // Halten ohne Bewegung.
  const p = bildschirm(karte, r);
  zeiger(u, karte, 'pointerdown', p.x, p.y); u.uhr.vor(600); zeiger(u, karte, 'pointerup', p.x, p.y);
  assert.deepEqual(liste.map((e) => e[0]), ['map-long-press']);
  liste.length = 0;
  // draw-rect: Ziehen verschiebt nicht, sondern meldet start/move/end mit Lupe.
  m.setMode('draw-rect');
  const vorher = ansichtZustand(karte);
  zeiger(u, karte, 'pointerdown', p.x, p.y); zeiger(u, karte, 'pointermove', p.x + 30, p.y + 20);
  assert.equal(karte.shadowRoot.querySelector('.map-loupe').hidden, false, 'Lupe beim Ziehen');
  zeiger(u, karte, 'pointerup', p.x + 30, p.y + 20);
  assert.deepEqual(liste.map((e) => e[1].phase), ['start', 'move', 'end']);
  assert.equal(liste[0][1].mode, 'draw-rect');
  assert.ok(liste[2][1].robot && liste[2][1].start, 'Roboter-mm von Start und Ende');
  assert.deepEqual(ansichtZustand(karte), vorher, 'kein Verschieben');
  assert.equal(karte.shadowRoot.querySelector('.map-loupe').hidden, true);
  liste.length = 0;
  m.setMode('view');
  karte._toggleLock();
  assert.equal(karte.getAttribute('data-locked'), 'true');
  tippe(u, karte, bildschirm(karte, r));
  assert.deepEqual(liste, [], 'gesperrt: keine Kartenereignisse');
  assert.throws(() => m.setMode('unsinn'), /mode/);
});

test('Hindernis antippen → map-object-tap', async () => {
  const { u, haus, karte } = await datenKarte();
  const liste = ereignisse(karte, 'map-object-tap');
  tippe(u, karte, bildschirm(karte, haus.states[CAM].attributes.obstacles['1']));
  assert.equal(liste.length, 1);
  assert.equal(liste[0][1].id, '1');
  assert.equal(liste[0][1].layer, 'obstacles');
});

test('Raum-Chips: Liste mit Namen, Symbol, Reihenfolge, Tastatur; Chip = Fläche (R08/R15/R16)', async () => {
  const { u, karte } = await datenKarte();
  const m = karte._map;
  const chips = karte.shadowRoot.querySelector('.room-chips');
  assert.ok(chips, 'Raum-Chips unter der Karte');
  assert.equal(chips.getAttribute('role'), 'group');
  assert.equal(chips.getAttribute('aria-label'), 'Räume');
  const knoepfe = chips.querySelectorAll('.room-chip');
  assert.equal(knoepfe.length, Object.keys(raeume()).length);
  assert.ok(knoepfe.every((k) => k.querySelector('ha-icon')), 'Symbol je Raum (R01: wie auf der Karte)');
  assert.deepEqual(knoepfe.map((k) => k.tabIndex), knoepfe.map((_, i) => (i === 0 ? 0 : -1)), 'ein Tabstopp');
  const liste = ereignisse(karte, 'map-room-tap');
  knoepfe[1].click();
  assert.equal(liste.length, 1);
  assert.equal(liste[0][1].room, Number(knoepfe[1].getAttribute('data-room')));
  assert.equal(liste[0][1].source, 'chip');
  // Pfeile wandern, Leertaste wählt (Button-Standard); gesperrt bleiben Chips bedienbar.
  karte._toggleLock();
  knoepfe[0].dispatchEvent(ev(u, 'keydown', { key: 'ArrowRight' }));
  assert.equal(chips.querySelectorAll('.room-chip')[1].tabIndex, 0);
  chips.querySelectorAll('.room-chip')[2].click();
  assert.equal(liste.length, 2, 'Chip wirkt auch gesperrt');
  // Eigene Chips eines Moduls: Auswahl, Reihenfolge-Badge, onToggle.
  const gewaehlt = [];
  const eigene = m.roomChips({ rooms: raeume(), selected: [3, 5], order: [5, 3], onToggle: (id) => gewaehlt.push(id) });
  const drei = eigene.querySelectorAll('.room-chip').find((k) => k.getAttribute('data-room') === '3');
  assert.equal(drei.getAttribute('aria-pressed'), 'true');
  assert.equal(drei.querySelector('.room-order').textContent, '2');
  assert.match(drei.getAttribute('aria-label'), /Salon.*2/);
  drei.click();
  assert.deepEqual(gewaehlt, [3]);
});

test('Beispiel späteres Modul: Ebene anlegen, pick-room, map-room-tap, Ebene entfernen', async () => {
  const { u, karte } = await datenKarte();
  const m = karte._map;
  const gezeichnet = [];
  m.addLayer('beispiel-auswahl', { z: 55, render: (g, ctx) => { for (const id of Object.keys(ctx.rooms)) gezeichnet.push(id); } });
  m.setMode('pick-room');
  const erhalten = [];
  m.el.addEventListener('map-room-tap', (e) => { erhalten.push(e.detail.room); m.refresh('beispiel-auswahl'); });
  tippe(u, karte, bildschirm(karte, raeume()['7']));
  assert.deepEqual(erhalten, [7]);
  assert.equal(gezeichnet.length, 2 * Object.keys(raeume()).length, 'angelegt + refresh');
  m.removeLayer('beispiel-auswahl');
  m.setMode('view');
  assert.equal(ebene(karte, 'beispiel-auswahl'), null);
});

module.exports = { intern, raeume };
