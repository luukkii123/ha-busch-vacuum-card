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
  // map_editor blendet nur Stift und Verwaltung aus (Task 4); kein anderer Name klingt nach Abschalten der Bestätigung.
  for (const name of alle.filter((n) => n !== 'map_editor')) assert.ok(!/edit|backup|map_confirm/.test(name), name + ' darf die Kartenbestätigung nicht abschalten');
  // Verhalten: auch mit allen ausgeblendeten Teilen erscheint die Bestätigung und sendet erst nach dem Klick.
  const s = new k.I.MapEditSession(k.karte);
  k.karte._openDialog(k.I.mapConfirm(k.karte, s, { title: 'x', lines: ['No-Go-Zonen: 1 neu'], action: 'Speichern', calls: [ZONE] }));
  assert.equal(dialogVon(k.u)._views.at(-1).kind, 'confirm');
  assert.deepEqual(k.haus.rufe, []);
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

// ── Task 3: Kartenverwaltung (EDI-01, ALL-13, ALL-10) ───────────────────────

const ZWEI_KARTEN = [
  { id: 3, index: 1, name: 'Karte 1', custom_name: null },
  { id: 7, index: 2, name: 'Karte 2', custom_name: 'Oben' },
];
/** Kartenverwaltung über das Menü öffnen. */
function verwaltung(k) {
  k.karte._openDialog(k.karte._menuView());
  Array.from($$d(k.u, '.menu-item')).find((b) => b.getAttribute('data-entry') === 'maps').click();
  return dialogVon(k.u);
}
const karteZeile = (k, id) => $d(k.u, '[data-map="' + id + '"]');
const knopfIn = (node, action) => node.querySelectorAll('[data-action="' + action + '"]')[0] || null;

test('EDI-01 Menüeintrag maps und Kartenwerkzeug öffnen dieselbe Ansicht: Liste mit Vorschau, aktiv markiert', () => {
  const k = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true } });
  const d = verwaltung(k);
  assert.equal($d(k.u, 'h1').textContent, 'Kartenverwaltung');
  assert.equal($d(k.u, '.placeholder'), null, 'Registry statt Platzhalter');
  assert.equal(d._views.at(-1).kind, 'editor');
  assert.equal(karteZeile(k, 3).getAttribute('aria-current'), 'true');
  assert.match(karteZeile(k, 3).textContent, /Karte 1 · aktiv/);
  assert.equal(karteZeile(k, 7).getAttribute('aria-current'), null);
  assert.match(karteZeile(k, 7).textContent, /Oben/);
  assert.match(karteZeile(k, 3).querySelector('img').getAttribute('src'), /camera_proxy\/camera\.robo_map_1/);
  assert.equal(knopfIn(karteZeile(k, 3), 'select'), null, 'die aktive Karte ist schon gewählt');
  d.remove(); k.karte._dialog = null;
  const werkzeug = k.karte._map.tools.querySelector('[data-action="map-maps"]');
  assert.ok(werkzeug, 'Kartenwerkzeug');
  werkzeug.click();
  assert.equal($d(k.u, 'h1').textContent, 'Kartenverwaltung');
  assert.ok(karteZeile(k, 7));
  assert.deepEqual(k.haus.rufe, []);
  const ohne = aufbau({ vac: { capabilities: ['map'] } });
  assert.equal(ohne.karte._map.tools.querySelector('[data-action="map-maps"]'), null, 'ohne multi_floor_map kein Werkzeug (wie das Menü)');
});

test('EDI-01 Wählen nur über MapView.selectMap mit der Bestätigung von core (CORE-20)', () => {
  const k = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true } });
  verwaltung(k);
  knopfIn(karteZeile(k, 7), 'select').click();
  assert.deepEqual(k.haus.rufe, []);
  assert.match($d(k.u, '.placeholder').textContent, /Oben/);
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_select_map', data: { entity_id: 'vacuum.robo', map_id: 7 } }]);
});

test('EDI-01 Umbenennen → vacuum_rename_map { map_id, map_name } nach Bestätigung, leer = Standardname; Formular mit Dirty-Schutz', async () => {
  const k = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true } });
  const d = verwaltung(k);
  knopfIn(karteZeile(k, 7), 'rename').click();
  assert.equal(d._views.at(-1).kind, 'editor');
  const feld = $d(k.u, '[data-field="map_name"]');
  assert.equal(feld.value, 'Oben');
  assert.match(d.shadowRoot.textContent, /Leer lassen für den Standardnamen „Karte 2“/);
  feld.value = 'Keller';
  feld.dispatchEvent(k.u.neuesEreignis('input'));
  // Escape mit offener Eingabe: Dialog bleibt, fragt.
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  assert.ok(d._sheet.classList.contains('shake'));
  assert.ok($d(k.u, '[data-action="keep"]'), 'Speichern / Verwerfen / Weiter bearbeiten');
  $d(k.u, '[data-action="keep"]').click();
  k.u.zurueck();
  assert.equal($d(k.u, '[data-field="map_name"]').value, 'Keller', 'Eingabe bleibt');
  $d(k.u, '[data-action="save"]').click();
  assert.equal(d._views.at(-1).kind, 'confirm');
  assert.match(d.shadowRoot.textContent, /Name: Oben → Keller/);
  assert.match(d.shadowRoot.textContent, /Karte: Oben/);
  assert.deepEqual(k.haus.rufe, [], 'erst nach Bestätigung');
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(roh(k.haus.rufe), [
    { domain: 'dreame_vacuum', service: 'vacuum_backup_map', data: { entity_id: 'vacuum.robo', map_id: 7 } },
    { domain: 'dreame_vacuum', service: 'vacuum_rename_map', data: { entity_id: 'vacuum.robo', map_id: 7, map_name: 'Keller' } },
  ]);
  // Leerer Name = Standardname.
  const k2 = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true, capabilities: ['map', 'multi_floor_map'] } });
  verwaltung(k2);
  knopfIn(karteZeile(k2, 7), 'rename').click();
  const f2 = $d(k2.u, '[data-field="map_name"]');
  f2.value = '';
  f2.dispatchEvent(k2.u.neuesEreignis('input'));
  $d(k2.u, '[data-action="save"]').click();
  $d(k2.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(roh(k2.haus.rufe.at(-1).data), { entity_id: 'vacuum.robo', map_id: 7, map_name: '' });
});

test('EDI-01 Löschen: Bestätigung nennt die Karte, ohne Multi-Floor „löscht alle Karten“; destruktiv, nicht umkehrbar', async () => {
  const k = aufbau({ vac: { capabilities: ['map', 'multi_floor_map'] } });
  verwaltung(k);
  knopfIn(karteZeile(k, 3), 'delete').click();
  const text = dialogVon(k.u).shadowRoot.textContent;
  assert.match(text, /Karte „Karte 1“ wird gelöscht/);
  assert.match(text, /Das Gerät löscht alle Karten/);
  assert.match(text, /Wiederherstellen in der Kartensicherung/);
  assert.equal($d(k.u, '[data-action="confirm"]').getAttribute('data-variant'), 'destructive');
  $d(k.u, '[data-action="cancel"]').click();
  assert.deepEqual(k.haus.rufe, []);
  const k2 = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true, capabilities: ['map', 'multi_floor_map'] } });
  verwaltung(k2);
  knopfIn(karteZeile(k2, 7), 'delete').click();
  assert.doesNotMatch(dialogVon(k2.u).shadowRoot.textContent, /alle Karten/, 'mit Multi-Floor nur diese Karte');
  $d(k2.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(roh(k2.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_delete_map', data: { entity_id: 'vacuum.robo', map_id: 7 } }]);
});

test('ALL-10 Multi-Floor-Zeile = settingRow aus device-settings, mit Bestätigung; gesperrt bei temporärer Karte', () => {
  const k = aufbau();
  verwaltung(k);
  const zeile = $d(k.u, '[data-setting="multi_floor_map"]');
  assert.ok(zeile, 'dieselbe Zeile wie in den Geräteeinstellungen');
  zeile.querySelector('[role="switch"]').click();
  assert.deepEqual(k.haus.rufe, []);
  assert.equal(dialogVon(k.u)._views.at(-1).kind, 'confirm');
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Multi-Floor/);
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_set_property', data: { entity_id: 'vacuum.robo', key: 'multi_floor_map', value: 1 } }]);
  const t = aufbau({ vac: { has_temporary_map: true } });
  verwaltung(t);
  const gesperrt = $d(t.u, '[data-setting="multi_floor_map"]');
  assert.equal(gesperrt.getAttribute('data-state'), 'locked');
  assert.match(gesperrt.textContent, /temporäre Karte/);
  assert.ok(gesperrt.querySelector('[role="switch"]').disabled);
});

test('ALL-13 Neue Karte: start_mapping nur bei mapping_available, nach Bestätigung erst Sicherung der aktiven Karte, dann vacuum_call_action', async () => {
  const k = aufbau();
  verwaltung(k);
  const kartierung = $d(k.u, '[data-action="start_mapping"]');
  assert.ok(kartierung.disabled, 'mapping_available false');
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Platz für eine neue Karte/);
  const schnell = $d(k.u, '[data-action="start_fast_mapping"]');
  schnell.click();
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Roboter fährt/);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="confirm"]').click();
  await mikro();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map'], 'zuerst die aktive gespeicherte Karte sichern');
  assert.deepEqual(roh(k.haus.rufe[0].data), { entity_id: 'vacuum.robo', map_id: 3 });
  await k.sicherungFertig();
  assert.deepEqual(roh(k.haus.rufe.at(-1)), { domain: 'dreame_vacuum', service: 'vacuum_call_action', data: { entity_id: 'vacuum.robo', key: 'start_fast_mapping' } });
  const m = aufbau({ vac: { mapping_available: true } });
  verwaltung(m);
  assert.equal($d(m.u, '[data-action="start_mapping"]').disabled, false);
});

test('ALL-13 Temporäre Karte: speichern/verwerfen/ersetzen nur bei has_temporary_map; Karte neu anfordern ohne Bestätigung', async () => {
  const k = aufbau();
  verwaltung(k);
  assert.equal($d(k.u, '[data-action="save_temporary"]'), null);
  $d(k.u, '[data-action="request_map"]').click();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_request_map', data: { entity_id: 'vacuum.robo' } }], 'nicht zerstörend: direkt');
  const t = aufbau({ vac: { has_temporary_map: true, maps: ZWEI_KARTEN, map_count: 2 } });
  verwaltung(t);
  assert.equal(knopfIn(karteZeile(t, 7), 'rename').disabled, true, 'nicht bei temporärer Karte');
  $d(t.u, '[data-action="save_temporary"]').click();
  assert.match(dialogVon(t.u).shadowRoot.textContent, /Keine Sicherung möglich/);
  $d(t.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(roh(t.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_save_temporary_map', data: { entity_id: 'vacuum.robo' } }]);
  const v = aufbau({ vac: { has_temporary_map: true } });
  verwaltung(v);
  $d(v.u, '[data-action="discard_temporary"]').click();
  assert.equal($d(v.u, '[data-action="confirm"]').getAttribute('data-variant'), 'destructive');
  $d(v.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(dienste(v.haus), ['vacuum_discard_temporary_map']);
  const r = aufbau({ vac: { has_temporary_map: true, maps: ZWEI_KARTEN, map_count: 2 } });
  verwaltung(r);
  $d(r.u, '[data-action="replace_temporary"]').click();
  $d(r.u, '[data-replace="7"]').click();
  assert.match(dialogVon(r.u).shadowRoot.textContent, /„Oben“ wird durch die temporäre Karte ersetzt/);
  $d(r.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(roh(r.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_replace_temporary_map', data: { entity_id: 'vacuum.robo', map_id: 7 } }]);
});

test('EDI-01 Leerzustand ohne gespeicherte Karte (R18)', () => {
  const k = aufbau({ vac: { maps: [], map_count: 0, has_saved_map: false } });
  verwaltung(k);
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Noch keine gespeicherte Karte/);
  assert.ok($d(k.u, '[data-action="start_fast_mapping"]'), 'Anlegen bleibt möglich');
});

// ── Task 4: Bearbeitungsmodus (EDI-02) ──────────────────────────────────────

const stift = (k) => k.karte._map.tools.querySelector('[data-action="map-edit"]');
/** Testwerkzeuge in der Registry: Zonen legt eine No-Go-Zone an, Linien einen Vorhang, Wände nur ein Panel. */
function werkzeuge(k) {
  const knopf = (body, action, fn) => { const b = k.u.document.createElement('button'); b.setAttribute('data-action', action); b.addEventListener('click', fn); body.appendChild(b); };
  k.I.EDIT_TOOLS.zones.panel = (card, editor, body) => knopf(body, 'add-zone', () => { editor.edit('restricted').no_go_areas.push([100, 100, 600, 600]); editor.changed(); });
  k.I.EDIT_TOOLS.lines.panel = (card, editor, body) => knopf(body, 'add-curtain', () => { editor.edit('curtain').curtains.push([0, 0, 500, 0]); editor.changed(); });
  k.I.EDIT_TOOLS.walls.panel = (card, editor, body) => knopf(body, 'walls-panel', () => {});
}
function bearbeiten(k) {
  werkzeuge(k);
  stift(k).click();
  return dialogVon(k.u);
}
const werkzeug = (k, name) => $d(k.u, '[data-tool="' + name + '"]');

test('EDI-02 Stift nur bei can("map_edit"); hidden_card_objects map_editor blendet Stift, Kartenwerkzeug und Menüeintrag aus (Label/Helper DE/EN)', () => {
  const k = aufbau();
  assert.equal(k.karte._model().can('map_edit'), true);
  assert.ok(stift(k));
  assert.equal(stift(k).getAttribute('aria-label'), 'Karte bearbeiten');
  const haus = hausAus('voll');
  haus.services.dreame_vacuum = { vacuum_set_property: {}, vacuum_select_map: {} };
  const ohneDienste = neueKarte(neueUmgebung(), haus);
  assert.equal(ohneDienste._model().can('map_edit'), false, 'Karte, aber kein Bearbeitungsdienst');
  assert.equal(ohneDienste._map.tools.querySelector('[data-action="map-edit"]'), null);
  const ohneKarte = neueKarte(neueUmgebung(), hausAus('ohne-karte'));
  assert.equal(ohneKarte._model().can('map_edit'), false, 'ohne Karte kein Stift, kein Fehler');
  const aus = aufbau({ config: { hidden_card_objects: ['map_editor'] } });
  assert.equal(stift(aus), null);
  assert.equal(aus.karte._map.tools.querySelector('[data-action="map-maps"]'), null);
  assert.ok(!aus.karte._menuEntries(aus.karte._model()).some((e) => e.name === 'maps'), 'Menüeintrag maps ausgeblendet');
  assert.ok(aus.I.HIDDEN_OBJECTS.includes('map_editor'));
  for (const lang of ['de', 'en']) {
    assert.ok(aus.I.TEXTE[lang].texte.obj_map_editor, 'Label ' + lang);
    assert.match(aus.I.TEXTE[lang].helpers.hidden_card_objects, lang === 'de' ? /Kartenbearbeitung/ : /Map editing/);
  }
});

test('EDI-02 Bearbeitungsmodus: Dialog kind editor, Karte wandert in die Ansicht und zurück, Ebene editor, Sitzung; Sperre aufgehoben mit Hinweis; ausgeblendete Objekte sichtbar', () => {
  const k = aufbau({ config: { locked: 'always', hidden_objects: ['no_go_areas'] } });
  const m = k.karte._map;
  assert.equal(m._locked(), true);
  assert.equal(m.visible('no_go_areas'), false);
  const d = bearbeiten(k);
  assert.equal(d._views.at(-1).kind, 'editor');
  assert.equal($d(k.u, 'h1').textContent, 'Karte bearbeiten');
  assert.ok(d.shadowRoot.all().includes(m.el), 'Karte liegt in der Ansicht');
  assert.ok(!k.karte._mapSlot.childNodes.includes(m.el));
  assert.ok(k.karte._editSession instanceof k.I.MapEditSession);
  assert.ok(m._layers.has('editor'));
  assert.equal(m._locked(), false, 'Gesten frei, solange der Modus läuft');
  assert.match(d.shadowRoot.textContent, /Kartensperre ist während der Bearbeitung aufgehoben/);
  assert.equal(m.visible('no_go_areas'), true);
  assert.match(d.shadowRoot.textContent, /Ausgeblendete Objekte .*No-Go/);
  assert.equal(stift(k), null, 'kein zweiter Einstieg im Modus');
  $d(k.u, '[data-action="done"]').click();
  k.u.uhr.vor(400);
  assert.equal(dialogVon(k.u), null);
  assert.ok(k.karte._mapSlot.childNodes.includes(m.el), 'Karte zurück in der Karte');
  assert.equal(m._layers.has('editor'), false);
  assert.equal(m._locked(), true);
  assert.equal(m.visible('no_go_areas'), false);
  assert.equal(k.karte._editSession, null);
  assert.equal(k.karte._mapEdit, null);
  assert.ok(stift(k));
  assert.deepEqual(k.haus.rufe, []);
});

test('EDI-02 Werkzeugleiste je editCaps (nur gebaute Werkzeuge), Zähler, Sammel-Speichern mit einer Bestätigung und je Gruppe einem vollständigen Aufruf; Rückgängig', async () => {
  const k = aufbau();
  const d = bearbeiten(k);
  await mikro(); await mikro();
  assert.ok(werkzeug(k, 'zones') && werkzeug(k, 'lines') && werkzeug(k, 'walls'));
  assert.equal(werkzeug(k, 'rooms'), null, 'ohne Panel kein Werkzeug');
  assert.equal(werkzeug(k, 'walls').disabled, true, 'ohne Bearbeitungsdaten gesperrt');
  assert.match(d.shadowRoot.textContent, /Bearbeitungsdaten der Karte fehlen/);
  assert.equal($d(k.u, '[data-action="save"]').disabled, true, 'nichts offen');
  werkzeug(k, 'zones').click();
  assert.equal(werkzeug(k, 'zones').getAttribute('aria-pressed'), 'true');
  $d(k.u, '[data-action="add-zone"]').click();
  assert.match($d(k.u, '[data-counter]').textContent, /Ungespeicherte Änderungen: 1/);
  // Linien hat eigene Listen: Wechsel ohne Rückfrage? Nein — offene Änderungen des Werkzeugs fragen.
  werkzeug(k, 'lines').click();
  assert.ok($d(k.u, '[data-action="keep"]'), 'Werkzeugwechsel mit offenen Änderungen fragt');
  $d(k.u, '[data-action="keep"]').click();
  k.u.zurueck();
  assert.equal(werkzeug(k, 'zones').getAttribute('aria-pressed'), 'true');
  // Zweite Gruppe über einen Testweg im selben Entwurf.
  k.karte._mapEdit.edit('curtain').curtains.push([0, 0, 500, 0]);
  k.karte._mapEdit.changed();
  $d(k.u, '[data-action="save"]').click();
  const text = d.shadowRoot.textContent;
  assert.equal(d._views.at(-1).kind, 'confirm');
  assert.match(text, /No-Go-Zonen: 1 neu, 0 geändert, 0 gelöscht/);
  assert.match(text, /Vorhänge: 1 neu, 0 geändert, 0 gelöscht/);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_restricted_zone', 'vacuum_set_curtain'], 'eine Bestätigung, je Gruppe ein Aufruf');
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', walls: [[777, -7926, 794, -6336]], zones: [[100, 100, 600, 600]], no_mops: [] }, 'vollständig: die virtuelle Wand geht mit');
  assert.deepEqual(roh(k.haus.rufe[2].data), { entity_id: 'vacuum.robo', curtains: [[0, 0, 500, 0]] });
  k.u.zurueck();
  assert.equal(k.karte._mapEdit.dirty(), false);
  $d(k.u, '[data-action="undo"]').click();
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Stand vor der letzten Speicherung/);
  $d(k.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(dienste(k.haus).slice(3), ['vacuum_set_restricted_zone', 'vacuum_set_curtain']);
  assert.deepEqual(roh(k.haus.rufe[3].data), { entity_id: 'vacuum.robo', walls: [[777, -7926, 794, -6336]], zones: [], no_mops: [] }, 'Ausgangsliste');
  assert.deepEqual(roh(k.haus.rufe[4].data), { entity_id: 'vacuum.robo', curtains: [] });
});

test('EDI-02 Dirty-Schutz: Escape, Zurück, Schließen, Fertig, Aufgabentyp und Kartenwechsel fragen; Verwerfen setzt zurück und geht', () => {
  const k = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true } });
  const d = bearbeiten(k);
  werkzeug(k, 'zones').click();
  $d(k.u, '[data-action="add-zone"]').click();
  const gefragt = () => !!$d(k.u, '[data-action="keep"]');
  const weiter = () => { $d(k.u, '[data-action="keep"]').click(); k.u.zurueck(); };
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  assert.ok(gefragt(), 'Escape');
  assert.ok(d._sheet.classList.contains('shake'), 'Dialog wackelt');
  weiter();
  d.close();
  assert.ok(gefragt(), 'Schließen');
  weiter();
  $d(k.u, '[data-action="done"]').click();
  assert.ok(gefragt(), 'Fertig');
  weiter();
  k.u.zurueck();
  assert.ok(gefragt(), 'Zurück-Geste');
  weiter();
  k.karte._chooseTask('zone');
  assert.equal(k.karte._task, 'all', 'Aufgabentyp gesperrt, solange Änderungen offen sind');
  assert.ok(gefragt(), 'Aufgabentyp fragt');
  weiter();
  k.karte._map.selectMap(7);
  assert.ok(gefragt(), 'Kartenwechsel fragt');
  assert.deepEqual(k.haus.rufe, []);
  // Verwerfen führt weiter zur Frage von core (CORE-20); Abbrechen dort zurück in den Modus.
  $d(k.u, '[data-action="discard"]').click();
  assert.match(d.shadowRoot.textContent, /„Oben“ wechseln/);
  assert.equal(k.karte._mapEdit.dirty(), false, 'verworfen');
  $d(k.u, '[data-action="cancel"]').click();
  k.u.zurueck();
  assert.ok(werkzeug(k, 'zones'), 'wieder im Bearbeitungsmodus');
  // Verwerfen beim Verlassen beendet den Modus.
  $d(k.u, '[data-action="add-zone"]').click();
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  $d(k.u, '[data-action="discard"]').click();
  k.u.uhr.vor(400);
  assert.equal(dialogVon(k.u), null);
  assert.equal(k.karte._mapEdit, null);
  assert.deepEqual(k.haus.rufe, []);
});

test('EDI-02 Nur aktive Karte: andere Karte → „Zu <Karte> wechseln“ über selectMap (CORE-20)', () => {
  const k = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true } });
  werkzeuge(k);
  verwaltung(k);
  knopfIn(karteZeile(k, 3), 'edit').click();
  assert.ok(werkzeug(k, 'zones'), 'aktive Karte: Werkzeuge');
  const k2 = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true } });
  werkzeuge(k2);
  verwaltung(k2);
  knopfIn(karteZeile(k2, 7), 'edit').click();
  const text = dialogVon(k2.u).shadowRoot.textContent;
  assert.match(text, /nur die aktive Karte/);
  assert.equal(werkzeug(k2, 'zones'), null, 'keine Werkzeuge für eine andere Karte');
  $d(k2.u, '[data-action="switch-map"]').click();
  assert.deepEqual(k2.haus.rufe, []);
  assert.match(dialogVon(k2.u).shadowRoot.textContent, /„Oben“ wechseln/);
  $d(k2.u, '[data-action="confirm"]').click();
  assert.deepEqual(roh(k2.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_select_map', data: { entity_id: 'vacuum.robo', map_id: 7 } }]);
});

test('EDI-02 Bearbeitungsdaten beim Betreten; fremdes neues frame_id → Hinweis und Abgleich vor dem Speichern; eigene Speicherung ohne Hinweis', async () => {
  const k = aufbau({ abruf: (url) => (/saved=1/.test(url) ? { json: bearbeitungsdaten() } : { status: 404 }) });
  await mikro();
  const gespeichert = () => k.abrufe.filter((a) => /saved=1/.test(a.url)).length;
  assert.equal(gespeichert(), 0);
  const d = bearbeiten(k);
  await mikro(); await mikro(); await mikro();
  assert.equal(gespeichert(), 1, 'beim Betreten');
  assert.equal(werkzeug(k, 'walls').disabled, false, 'mit Daten frei');
  werkzeug(k, 'zones').click();
  $d(k.u, '[data-action="add-zone"]').click();
  k.sauger({ battery_level: 42 });
  k.haus.fremd(); k.karte.hass = k.haus.hass();
  assert.equal(gespeichert(), 1, 'fremde Updates: 0 Abrufe');
  // Fremde Änderung: neue Wischverbotszone und neues frame.
  k.kamera({ frame_id: 1181, no_mopping_areas: [{ x0: 0, y0: 0, x1: 300, y1: 0, x2: 300, y2: 300, x3: 0, y3: 300, angle: null }] });
  assert.equal(d._views.at(-1).render && $d(k.u, '[data-action="save"]').disabled, true, 'Abgleich läuft: Speichern wartet');
  await mikro(); await mikro(); await mikro();
  assert.equal(gespeichert(), 2, 'neu geladen');
  assert.match(d.shadowRoot.textContent, /Karte hat sich auf dem Gerät geändert/);
  $d(k.u, '[data-action="save"]').click();
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Abgeglichen/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(roh(k.haus.rufe.at(-1).data), { entity_id: 'vacuum.robo', walls: [[777, -7926, 794, -6336]], zones: [[100, 100, 600, 600]], no_mops: [[0, 0, 300, 300]] }, 'fremde Wischverbotszone bleibt erhalten');
  k.u.zurueck();
  k.kamera({ frame_id: 1182 });
  await mikro(); await mikro(); await mikro();
  assert.equal(gespeichert(), 3, 'nach eigener Speicherung neu geladen');
  assert.doesNotMatch(dialogVon(k.u).shadowRoot.textContent, /Karte hat sich auf dem Gerät geändert/, 'eigene Speicherung: kein Hinweis');
});
