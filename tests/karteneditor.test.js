'use strict';
// Modul map-editor (Plan 2026-11-10): Sicherheitsrahmen, Bearbeitungsdaten,
// Werkzeuge. Kein Test erreicht ein Gerät: callService der Attrappe sammelt
// nur. Synthetische Kartendaten (tests/kartendaten.js), keine Grundrisse.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro, verlaufsAbruf } = require('./attrappe.js');
const { ausFixture } = require('./kartendaten.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const dienste = (haus) => haus.rufe.filter((r) => r.domain === 'dreame_vacuum').map((r) => r.service);

/** Karte aus einer Fixture; `vac` ändert Attribute von vacuum.robo, `cam` die der Kartenkamera. */
function aufbau({ name = 'voll', vac = {}, cam = {}, zustand, config = {}, abruf = null } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  const abrufe = abruf ? verlaufsAbruf(u, abruf) : null;
  const v = haus.states['vacuum.robo'];
  haus.states['vacuum.robo'] = Object.assign({}, v, { state: zustand || v.state, attributes: Object.assign({}, v.attributes, vac) });
  if (haus.states['camera.robo_map']) {
    const c = haus.states['camera.robo_map'];
    haus.states['camera.robo_map'] = Object.assign({}, c, { attributes: Object.assign({}, c.attributes, cam) });
  }
  haus.antwort = () => Promise.resolve();
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  const k = { u, haus, karte, I, abrufe };
  /** Neuer Zustand des Saugers (Attribute zusammengeführt). */
  k.sauger = (attribute = {}, z) => { const alt = haus.states['vacuum.robo']; karte.hass = haus.setze({ 'vacuum.robo': Object.assign({}, alt, { state: z || alt.state, attributes: Object.assign({}, alt.attributes, attribute) }) }); };
  k.kamera = (attribute = {}) => { const alt = haus.states['camera.robo_map']; karte.hass = haus.setze({ 'camera.robo_map': Object.assign({}, alt, { attributes: Object.assign({}, alt.attributes, attribute) }) }); };
  /** Sicherung läuft an und endet erfolgreich. */
  k.sicherungFertig = async () => { await mikro(); k.sauger({ map_backup_status: 'Running' }); k.sauger({ map_backup_status: 'Success' }); await mikro(); await mikro(); };
  return k;
}

const ZONE = { service: 'vacuum_set_restricted_zone', data: { walls: [], zones: [[0, 0, 500, 500]], no_mops: [] } };

// ── Task 1: Sicherheitsrahmen ───────────────────────────────────────────────

test('EDI-02 erste Speicherung: zuerst genau vacuum_backup_map { entity_id, map_id }, Dienst erst nach „Success“; zweite ohne Sicherung', async () => {
  const k = aufbau();
  const s = new k.I.MapEditSession(k.karte);
  k.karte._editSession = s;
  const fertig = s.commit({ card: k.karte, confirmed: true }, [ZONE]);
  await mikro();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_backup_map', data: { entity_id: 'vacuum.robo', map_id: 2 } }]);
  k.sauger({ map_backup_status: 'Running' });
  await mikro();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map'], 'noch keine Kartenänderung während der Sicherung');
  k.sauger({ map_backup_status: 'Success' });
  assert.equal(await fertig, true);
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_restricted_zone']);
  assert.equal(await s.commit({ card: k.karte, confirmed: true }, [ZONE]), true);
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_restricted_zone', 'vacuum_set_restricted_zone'], 'zweite Speicherung ohne neue Sicherung');
});

test('EDI-02 Sicherung scheitert oder Zeitlimit → 0 Kartendienste, R12-Text, Erneut behält die Änderungen', async () => {
  const k = aufbau();
  const s = new k.I.MapEditSession(k.karte);
  k.karte._editSession = s;
  k.haus.antwort = (d, service) => (service === 'vacuum_backup_map' ? Promise.reject(new Error('Gerät lehnt ab')) : Promise.resolve());
  assert.equal(await s.commit({ card: k.karte, confirmed: true }, [ZONE]), false);
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map']);
  assert.match(s.error.text, /Sicherung fehlgeschlagen.*Gerät lehnt ab.*unverändert.*Erneut versuchen/);
  // Zeitlimit: Status bleibt „Running“.
  k.haus.antwort = () => Promise.resolve();
  const zweiter = s.commit({ card: k.karte, confirmed: true }, [ZONE]);
  await mikro();
  k.sauger({ map_backup_status: 'Running' });
  k.u.uhr.vor(60000);
  assert.equal(await zweiter, false);
  assert.match(s.error.text, /60 s/);
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_backup_map'], 'kein Kartendienst ohne Sicherung');
  assert.equal(await s.commit({ card: k.karte, confirmed: true }, [ZONE]), false, 'solange „Running“ steht, gesperrt');
  k.sauger({ map_backup_status: 'Failed' });
  const dritter = s.commit({ card: k.karte, confirmed: true }, [ZONE]);
  await k.sicherungFertig();
  assert.equal(await dritter, true);
  assert.deepEqual(roh(k.haus.rufe.at(-1).data), { entity_id: 'vacuum.robo', walls: [], zones: [[0, 0, 500, 500]], no_mops: [] });
});

test('EDI-02 Bestätigung: kind confirm, kein Außenklick, nennt Karte und Objekte; Abbrechen 0 Aufrufe; Doppeltipp 1 Aufruf', async () => {
  const k = aufbau();
  const s = new k.I.MapEditSession(k.karte);
  k.karte._editSession = s;
  k.karte._openDialog(k.I.mapConfirm(k.karte, s, { title: 'No-Go-Zonen speichern', lines: ['No-Go-Zonen: 1 neu, 0 geändert, 0 gelöscht'], action: 'Speichern', calls: [ZONE] }));
  const d = dialogVon(k.u);
  assert.equal(d._views.at(-1).kind, 'confirm');
  const text = d.shadowRoot.textContent;
  assert.match(text, /No-Go-Zonen: 1 neu, 0 geändert, 0 gelöscht/);
  assert.match(text, /Karte: Karte 1/);
  assert.match(text, /Sicherung der Karte erstellt/);
  d.shadowRoot.querySelector('.scrim').click();
  assert.ok(dialogVon(k.u), 'Außenklick schließt nicht (R04)');
  $d(k.u, '[data-action="cancel"]').click();
  assert.deepEqual(k.haus.rufe, []);
  k.karte._openDialog(k.I.mapConfirm(k.karte, s, { title: 'x', lines: [], action: 'Speichern', calls: [ZONE] }));
  const knopf = $d(k.u, '[data-action="confirm"]');
  knopf.click();
  knopf.click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_restricted_zone'], 'Doppeltipp sendet einmal');
});

test('EDI-02 ohne backup_map: Bestätigung nennt „Keine Sicherung möglich“, Speichern geht direkt', async () => {
  const k = aufbau({ vac: { capabilities: [] } });
  const s = new k.I.MapEditSession(k.karte);
  k.karte._openDialog(k.I.mapConfirm(k.karte, s, { title: 'x', lines: [], action: 'Speichern', calls: [ZONE] }));
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Keine Sicherung möglich/);
  $d(k.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(dienste(k.haus), ['vacuum_set_restricted_zone']);
});

test('EDI-02 Rückgängig sendet die Ausgangsliste mit demselben Dienst, bestätigt, ohne Sicherung; nicht umkehrbare verweisen auf Wiederherstellen', async () => {
  const k = aufbau();
  const s = new k.I.MapEditSession(k.karte);
  k.karte._editSession = s;
  const vorher = { service: 'vacuum_set_restricted_zone', data: { walls: [[1, 2, 3, 4]], zones: [], no_mops: [] } };
  const p = s.commit({ card: k.karte, confirmed: true }, [ZONE], { undo: { text: 'No-Go-Zonen', calls: [vorher] } });
  await k.sicherungFertig();
  assert.equal(await p, true);
  k.karte._openDialog(k.I.mapUndoConfirm(k.karte, s));
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Stand vor der letzten Speicherung: No-Go-Zonen/);
  assert.doesNotMatch(dialogVon(k.u).shadowRoot.textContent, /Sicherung/, 'Rückgängig sichert nicht');
  $d(k.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_restricted_zone', 'vacuum_set_restricted_zone']);
  assert.deepEqual(roh(k.haus.rufe.at(-1).data), { entity_id: 'vacuum.robo', walls: [[1, 2, 3, 4]], zones: [], no_mops: [] });
  assert.equal(s.undo.length, 0);
  k.karte._dialog.remove();
  k.karte._dialog = null;
  k.karte._openDialog(k.I.mapConfirm(k.karte, s, { title: 'Teilen', lines: [], action: 'Teilen', irreversible: true, destructive: true, calls: [] }));
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Wiederherstellen in der Kartensicherung/);
  assert.equal($d(k.u, '[data-action="confirm"]').getAttribute('data-variant'), 'destructive');
});

test('EDI-02 kein hidden_card_objects-Schalter schaltet die Bestätigung ab; mapWrite ohne Bestätigung wirft', () => {
  const alle = aufbau().I.HIDDEN_OBJECTS || [];
  const k = aufbau({ config: { hidden_card_objects: alle.slice() } });
  assert.throws(() => k.I.mapWrite(k.karte, null, 'vacuum_set_walls', {}), /without confirmation/);
  assert.throws(() => k.I.mapWrite(k.karte, { card: k.karte }, 'vacuum_set_walls', {}), /without confirmation/);
  assert.deepEqual(k.haus.rufe, []);
  for (const name of alle) assert.ok(!/edit|backup|map_confirm/.test(name), name + ' darf die Kartenbestätigung nicht abschalten');
});

test('EDI-02 Sperren: laufende Aufgabe, temporäre Karte, Sicherung/Wiederherstellung läuft', async () => {
  const k = aufbau({ zustand: 'cleaning' });
  const s = new k.I.MapEditSession(k.karte);
  assert.equal(s.lock('vacuum_set_walls'), 'kartenSperreAufgabe');
  assert.equal(s.lock('vacuum_set_restricted_zone'), '', 'Zonen gehen während einer Aufgabe');
  k.sauger({ has_temporary_map: true }, 'docked');
  assert.equal(s.lock('vacuum_set_restricted_zone'), 'kartenSperreTemporaer');
  assert.equal(s.lock('vacuum_save_temporary_map'), '');
  k.sauger({ has_temporary_map: false, map_recovery_status: 'Running' });
  assert.equal(s.lock('vacuum_set_curtain'), 'kartenSperreSicherung');
  assert.equal(await s.commit({ card: k.karte, confirmed: true }, [ZONE]), false);
  assert.deepEqual(k.haus.rufe, []);
  assert.match(s.error.text, /Sicherung oder Wiederherstellung/);
});

test('EDI-02 Dialog mit offenen Änderungen: Escape, Schließen und Zurück-Geste schließen nicht, der Dialog wackelt', () => {
  const k = aufbau();
  let offen = true, gefragt = 0;
  k.karte._openDialog({ title: 'Form', kind: 'editor', guard: () => { if (offen) gefragt++; return offen; }, render: () => {} });
  const d = dialogVon(k.u);
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  assert.ok(dialogVon(k.u));
  assert.ok(d._sheet.classList.contains('shake'));
  d.close();
  assert.ok(dialogVon(k.u));
  const tiefe = d._depth;
  k.u.zurueck();
  assert.ok(dialogVon(k.u), 'Zurück-Geste');
  assert.equal(d._depth, tiefe, 'Verlaufseintrag wieder da');
  assert.equal(gefragt, 3);
  offen = false;
  d.close();
  k.u.zurueck();
  k.u.uhr.vor(400);
  assert.equal(dialogVon(k.u), null);
});

// ── Task 2: Bearbeitungsdaten und Fähigkeiten ───────────────────────────────

/**
 * Synthetische Bearbeitungsdaten wie camera_map_data_proxy (map.py get_data):
 * Gitter aus den verfremdeten Fixture-Räumen, dazu frei erfundene Wände,
 * Türen, Teppiche, Möbel, Nachbarn. Keine echten Grundrisse.
 */
function bearbeitungsdaten(mehr = {}) {
  const { _zellen, _breite, _hoehe, ...karte } = ausFixture('voll', { frame_id: 1180 });
  return Object.assign(karte, {
    saved_map: true, station_segment: 2,
    segments: [
      [1, 100, 200, 4, null, 0, 1, [2], 1, 0, 1],
      [2, 900, 200, 0, 'V2Vya3N0YXR0', 0, 2, [1, 3], 2, null, 1],
      [3, 900, 900, 7, null, 1, 3, [2], 0, null, 0],
    ],
    walls: {
      1: [[0, 0, 1000, 0, 0, 0, 1000, 0, 1, 500, 0], [1000, 0, 1000, 800, 1000, 0, 1000, 800, 1, 1000, 400]],
      3: [[0, 900, 600, 900, 0, 950, 600, 950, 2, 300, 900]],
    },
    doors: [[400, 0, 600, 0, 400, 0, 600, 0, 0, 7, 1]],
    carpets: [
      [100, 100, 500, 100, 500, 400, 100, 400, 4, 0, 1, null, 6, 0, null],
      [600, 600, 900, 600, 900, 800, 600, 800, 5, 1, 2, null, 5, 0, null],
    ],
    deleted_carpets: [[-200, -200, 0, -200, 0, 0, -200, 0, 9]],
    detected_carpets: [[1200, 100, 1400, 100, 1400, 300, 1200, 300, 11, 0, 1, null, 7, 1, null, null, [1], null]],
    furnitures: [[300, 400, 800, 600, 4, 1, 90, 1, 1, 3], [1500, 200, 400, 400, 14, 0, 0, 1.2, 2, 6]],
    predefined_points: [[100, 100], [200, 300]],
  }, mehr);
}

test('EDI-04 editData: Wände je Raum und Türen mit 11 Werten, unverändert zurück im Dienstformat', () => {
  const k = aufbau();
  const roh0 = bearbeitungsdaten();
  const d = k.I.editData(roh0);
  assert.equal(d.walls.length, 3);
  assert.deepEqual(roh(d.walls[0]), { room: '1', x0: 0, y0: 0, x1: 1000, y1: 0, ix0: 0, iy0: 0, ix1: 1000, iy1: 0, type: 1, x: 500, y: 0 });
  assert.deepEqual(roh(d.doors[0]), { x0: 400, y0: 0, x1: 600, y1: 0, ix0: 400, iy0: 0, ix1: 600, iy1: 0, type: 0, id: 7, status: 1 });
  const lists = k.I.editLists(k.karte._map.current().objects, d);
  const p = k.I.payloadFor('walls', lists, 2);
  assert.equal(p.service, 'vacuum_set_walls');
  assert.deepEqual(roh(p.data), { walls: roh0.walls, doors: roh0.doors, map_id: 2 });
  assert.equal(k.I.editData(null), null);
  assert.equal(k.I.editData(bearbeitungsdaten({ walls: null, doors: null })).walls, null, 'ohne Wände in den Daten: null, nicht leer');
});

test('EDI-05 Teppiche: 8 Ecken → Rechteck + id/ellipse/Typ, gelöschte und erkannte; Dienst mit allen Teppichen', () => {
  const k = aufbau();
  const d = k.I.editData(bearbeitungsdaten());
  assert.deepEqual(roh(d.carpets[1]), { rect: [600, 600, 900, 800], id: 5, ellipse: 1, cleaning: 2, preferences: null, type: 5, hidden: 0 });
  assert.deepEqual(roh(d.deletedCarpets), [{ rect: [-200, -200, 0, 0], id: 9 }]);
  assert.deepEqual(roh(d.detectedCarpets[0]), { rect: [1200, 100, 1400, 300], id: 11, ellipse: 0, cleaning: 1, preferences: null, type: 7, hidden: 1 });
  const lists = k.I.editLists(k.karte._map.current().objects, d);
  assert.deepEqual(roh(lists.carpets), [[100, 100, 500, 400, 4, 0, 6], [600, 600, 900, 800, 5, 1, 5]]);
  assert.deepEqual(roh(k.I.payloadFor('carpet', lists, 2)), { service: 'vacuum_set_carpet_area', data: { carpets: [[100, 100, 500, 400, 4, 0, 6], [600, 600, 900, 800, 5, 1, 5]], deleted_carpets: [[-200, -200, 0, 0]] } });
});

test('EDI-05 Möbel: Datenreihenfolge [x,y,b,h,typ,edit,winkel,skala,raum,id] → Dienst [id,typ,raum,b,h,x,y,winkel,skala,edit,geändert]', () => {
  const k = aufbau();
  const d = k.I.editData(bearbeitungsdaten());
  assert.deepEqual(roh(d.furnitures[0]), { x: 300, y: 400, width: 800, height: 600, type: 4, editType: 1, angle: 90, scale: 1, segment: 1, id: 3 });
  const lists = k.I.editLists(k.karte._map.current().objects, d);
  assert.deepEqual(roh(lists.furnitures), [[3, 4, 1, 800, 600, 300, 400, 90, 1, 1, 0], [6, 14, 2, 400, 400, 1500, 200, 0, 1.2, 0, 0]]);
  assert.deepEqual(roh(k.I.payloadFor('furniture', lists, 2)), { service: 'vacuum_set_furniture', data: { furnitures: roh(lists.furnitures) } });
  assert.deepEqual(roh(k.I.furnitureEntry({ x: 1, y: 2, width: 3, height: 4, type: 5, editType: 0, angle: 0, scale: 1, segment: 2, id: null }, 1)), [-1, 5, 2, 3, 4, 1, 2, 0, 1, 0, 1], 'ohne id: neu (−1), geändert 1');
});

test('EDI-03 station_segment und Raumnachbarn aus den Bearbeitungsdaten', () => {
  const k = aufbau();
  const d = k.I.editData(bearbeitungsdaten());
  assert.equal(d.stationSegment, 2);
  assert.deepEqual(roh(d.neighbors), { 1: [2], 2: [1, 3], 3: [2] });
  assert.deepEqual(roh(d.segments[1]), { id: 2, x: 900, y: 200, type: 0, name: 'Werkstatt', index: 0, color: 2, neighbors: [1, 3], floorMaterial: 2, floorDirection: null, visibility: 1 });
  assert.equal(k.I.editData(bearbeitungsdaten({ station_segment: undefined })).stationSegment, null);
});

test('EDI-05 payloadFor: jede Gruppe vollständige Listen; restricted und threshold immer alle drei', () => {
  const k = aufbau({ cam: {
    no_go_areas: [{ x0: 0, y0: 0, x1: 500, y1: 0, x2: 500, y2: 400, x3: 0, y3: 400, angle: null }],
    no_mopping_areas: [{ x0: 10, y0: 10, x1: 300, y1: 10, x2: 300, y2: 300, x3: 10, y3: 300, angle: 15 }],
    ramps: [{ x0: 0, y0: 0, x1: 100, y1: 0, x2: 100, y2: 200, x3: 0, y3: 200, angle: 90 }],
    curtains: [{ x0: 1, y0: 2, x1: 3, y1: 4 }],
    predefined_points: { 1: { x: 10, y: 20 } },
  } });
  const lists = k.I.editLists(k.karte._map.current().objects, null);
  assert.deepEqual(roh(lists.no_go_areas), [[0, 0, 500, 400]]);
  assert.deepEqual(roh(lists.no_mopping_areas), [[10, 10, 300, 300, 15]], '5. Wert durchgereicht');
  assert.deepEqual(roh(lists.virtual_walls), [[777, -7926, 794, -6336]]);
  lists.no_go_areas.push([1000, 1000, 1500, 1500]);
  assert.deepEqual(roh(k.I.payloadFor('restricted', lists)), { service: 'vacuum_set_restricted_zone', data: { walls: [[777, -7926, 794, -6336]], zones: [[0, 0, 500, 400], [1000, 1000, 1500, 1500]], no_mops: [[10, 10, 300, 300, 15]] } });
  assert.deepEqual(roh(k.I.payloadFor('threshold', lists)), { service: 'vacuum_set_threshold', data: { passable_thresholds: [[-4584, -7932, -3289, -7932], [-4708, -7418, -3234, -7418]], impassable_thresholds: [], ramps: [[0, 0, 100, 200, 90]] } });
  assert.deepEqual(roh(k.I.payloadFor('curtain', lists)), { service: 'vacuum_set_curtain', data: { curtains: [[1, 2, 3, 4]] } });
  assert.deepEqual(roh(k.I.payloadFor('points', lists)), { service: 'vacuum_set_predefined_points', data: { points: [[10, 20]] } });
  assert.deepEqual(roh(k.I.payloadFor('router', lists)), { service: 'vacuum_set_router_position', data: { x: 2560, y: -3063 } });
  assert.deepEqual(roh(k.I.payloadFor('virtual_threshold', Object.assign({}, lists, { virtual_thresholds: [[1, 1, 2, 2]] }))), { service: 'vacuum_set_virtual_threshold', data: { virtual_thresholds: [[1, 1, 2, 2]] } });
  assert.equal(k.I.payloadFor('carpet', lists), null, 'ohne Bearbeitungsdaten keine Teppich-IDs: kein Aufruf');
  assert.equal(k.I.payloadFor('walls', lists, 2), null);
  const vorher = JSON.stringify(lists);
  const p = k.I.payloadFor('restricted', lists);
  p.data.zones.length = 0;
  assert.equal(JSON.stringify(lists), vorher, 'payloadFor kopiert, die Listen bleiben unberührt');
});

test('EDI-02 editCaps: je Werkzeug vorhanden/gesperrt + Grund; ohne Bearbeitungsdaten nur Wände/Teppiche/Möbel gesperrt', () => {
  const k = aufbau();
  const model = k.karte._model();
  const attrs = k.karte._map.current().objects;
  const ohne = k.I.editCaps(model, null, attrs);
  assert.deepEqual(Object.keys(ohne), ['rooms', 'walls', 'zones', 'lines', 'carpets', 'furniture', 'points', 'wifi']);
  for (const name of Object.keys(ohne)) assert.equal(ohne[name].shown, true, name);
  assert.deepEqual(Object.keys(ohne).filter((n) => ohne[n].locked), ['walls', 'carpets', 'furniture']);
  assert.equal(ohne.walls.reason, 'kartenOhneDaten');
  assert.equal(ohne.zones.reason, '');
  const mit = k.I.editCaps(model, k.I.editData(bearbeitungsdaten()), attrs);
  assert.deepEqual(Object.keys(mit).filter((n) => mit[n].locked), []);
  assert.deepEqual(roh(mit.rooms.features), { visibility: true, floor: true, direction: true });
  assert.deepEqual(roh(mit.carpets.features), { type: false, cleaning: true });
  // Fähigkeiten fehlen: Wände, Punkte (cruising), WLAN nicht da; Vorhänge ohne Attribut fehlen in lines nicht allein.
  const k2 = aufbau({ vac: { capabilities: ['map', 'multi_floor_map'] } });
  const c2 = k.I.editCaps(k2.karte._model(), null, k2.karte._map.current().objects);
  assert.deepEqual(Object.keys(c2).filter((n) => c2[n].shown), ['rooms', 'zones', 'lines', 'carpets']);
  assert.equal(c2.rooms.features.visibility, false);
  // Ohne Dienste: nichts.
  const k3 = aufbau();
  k3.haus.services.dreame_vacuum = {};
  k3.karte.hass = k3.haus.setze({});
  const c3 = k.I.editCaps(k3.karte._model(), null, k3.karte._map.current().objects);
  assert.deepEqual(Object.keys(c3).filter((n) => c3[n].shown), []);
});

test('EDI-02 Bearbeitungsdaten: Laden mit &saved=1&index=…&v=<frame_id>, fremde Updates 0 Abrufe, neues frame_id lädt neu', async () => {
  const k = aufbau({ abruf: (url) => ({ json: /saved=1/.test(url) ? bearbeitungsdaten() : bearbeitungsdaten({ walls: null, doors: null, saved_map: false }) }) });
  await mikro(); await mikro();
  const gespeichert = () => k.abrufe.filter((a) => /saved=1/.test(a.url));
  assert.equal(gespeichert().length, 0, 'ohne Bearbeitungsmodus kein Abruf');
  const d = await k.I.loadEditData(k.karte);
  assert.equal(gespeichert().length, 1);
  assert.match(gespeichert()[0].url, /^\/api\/camera_map_data_proxy\/camera\.robo_map\?token=[^&]+&saved=1&index=1&v=1180$/);
  assert.equal(d.walls.length, 3);
  assert.equal(k.karte._editData.data, d);
  k.haus.fremd(); k.karte.hass = k.haus.hass();
  k.sauger({ battery_level: 50 });
  assert.equal(await k.I.loadEditData(k.karte), d, 'gleiches frame: aus dem Speicher');
  assert.equal(gespeichert().length, 0 + 1, 'fremde Updates: 0 Abrufe');
  k.kamera({ frame_id: 1181 });
  await k.I.loadEditData(k.karte);
  assert.equal(gespeichert().length, 2);
  assert.match(gespeichert()[1].url, /&v=1181$/);
});

test('EDI-02 Bearbeitungsdaten: MapView-Daten desselben frame mit Wänden werden wiederverwendet (0 zusätzliche Abrufe); Fehler → null', async () => {
  const k = aufbau({ abruf: () => ({ json: bearbeitungsdaten() }) });
  await mikro(); await mikro(); await mikro();
  const vorher = k.abrufe.length;
  assert.ok(vorher >= 1, 'MapView hat die Kartendaten geholt');
  const d = await k.I.loadEditData(k.karte);
  assert.equal(k.abrufe.length, vorher, 'kein zusätzlicher Abruf');
  assert.equal(d.walls.length, 3);
  const k2 = aufbau({ abruf: (url) => (/saved=1/.test(url) ? { status: 500 } : { status: 404 }) });
  await mikro(); await mikro();
  assert.equal(await k2.I.loadEditData(k2.karte), null);
  assert.equal(k2.karte._editData.failed, true);
});
