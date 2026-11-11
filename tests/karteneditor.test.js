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
function aufbau({ name = 'voll', vac = {}, cam = {}, zustand, config = {}, abruf = null, bild = false } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (bild) {
    // Kartenbild mit Größe und Bühne 400 × 400 (wie aufgaben.test.js): toScreen/fromScreen gehen.
    const erzeuge = u.document.createElement.bind(u.document);
    u.document.createElement = (tag) => {
      const n = erzeuge(tag);
      if (tag === 'img') { n.naturalWidth = 1444; n.naturalHeight = 1444; n.decode = () => Promise.resolve(); }
      return n;
    };
  }
  const abrufe = abruf ? verlaufsAbruf(u, abruf) : null;
  const v = haus.states['vacuum.robo'];
  haus.states['vacuum.robo'] = Object.assign({}, v, { state: zustand || v.state, attributes: Object.assign({}, v.attributes, vac) });
  if (haus.states['camera.robo_map']) {
    const c = haus.states['camera.robo_map'];
    haus.states['camera.robo_map'] = Object.assign({}, c, { attributes: Object.assign({}, c.attributes, cam) });
  }
  haus.antwort = () => Promise.resolve();
  const karte = neueKarte(u, haus, config);
  if (bild && karte._map) karte._map.stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 });
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
  assert.deepEqual(roh(mit.carpets.features), { type: false, cleaning: true, shape: true, mats: false, preferences: false });
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
  assert.deepEqual(roh(v.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_discard_temporary_map', data: { entity_id: 'vacuum.robo' } }]);
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
  k.I.EDIT_TOOLS.wifi.panel = null; // Werkzeug ohne Panel erscheint nicht
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
  assert.equal(werkzeug(k, 'wifi'), null, 'ohne Panel kein Werkzeug');
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

// ── Task 5: Räume — Name, Typ, Sichtbarkeit, Boden (EDI-03) ────────────────

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
/** Bearbeitungsdaten mit den Raum-IDs der Fixture (verfremdete Namen), Nachbarn frei erfunden. */
function raumdaten(mehr = {}) {
  return bearbeitungsdaten(Object.assign({
    station_segment: 9,
    segments: [
      [1, 1229, -981, 4, null, 0, 1, [9, 7], 1, 90, 1],
      [3, -3461, -2902, 1, null, 0, 2, [7], 1, 90, 1],
      [4, 2585, -6349, 0, b64('Galerie'), 0, 3, [9], 2, null, 1],
      [5, -4252, -8496, 2, null, 0, 1, [7], 1, 0, 1],
      [6, 1003, -10134, 0, b64('Werkstatt'), 2, 2, [], 1, 90, 1],
      [7, -410, -5049, 8, null, 0, 0, [1, 3, 5], 2, null, 0],
      [9, 2472, -3806, 6, null, 0, 2, [1, 4], 2, null, 1],
    ],
  }, mehr));
}
const raumFeldE = (k, key) => { const zeile = $d(k.u, '[data-setting="room-' + key + '"]'); return zeile ? zeile.querySelector('select') : null; };
const waehle = (k, node, wert) => { node.value = String(wert); node.dispatchEvent(k.u.neuesEreignis('change')); };
const raumChip = (k, id) => Array.from($$d(k.u, '.room-chip')).find((b) => b.getAttribute('data-room') === String(id)) || null;
function raeumeOffen(k) {
  const d = bearbeiten(k);
  werkzeug(k, 'rooms').click();
  return d;
}

test('EDI-03 Raumlisten und Dienstformen: Name je Raum ein Aufruf, Typ nur geänderte [typ, index, name], Sichtbarkeit alle versteckten, Boden alle Räume', () => {
  const k = aufbau();
  const base = k.I.editLists(k.karte._map.current().objects, null);
  assert.deepEqual(roh(base.room_names), [[1, null], [3, null], [4, 'Galerie'], [5, null], [6, 'Werkstatt'], [7, null], [9, null]]);
  assert.deepEqual(roh(base.room_types), [[1, 4, 0], [3, 1, 0], [4, 0, 1], [5, 2, 0], [6, 0, 2], [7, 8, 0], [9, 6, 0]]);
  assert.deepEqual(roh(base.hidden_segments), []);
  assert.deepEqual(roh(base.floor_materials), [[1, 1, 0], [3, 1, 90], [4, 2, null], [5, 1, 0], [6, 1, 90], [7, 2, null], [9, 2, null]]);
  const nach = roh(base);
  nach.room_names[0] = [1, 'Atelier Neu'];
  nach.room_types[0] = [1, 0, 0];
  nach.room_types[6] = [9, 1, k.I.nextTypeIndex(nach.room_types, 9, 1)];
  nach.hidden_segments = [7, 3];
  nach.floor_materials[2] = [4, 1, 90];
  assert.deepEqual(roh(nach.room_types[6]), [9, 1, 1], 'laufende Nummer: Salon hat Typ 1 mit Index 0');
  assert.equal(k.I.nextTypeIndex(base.room_types, 4, 4), 1);
  assert.deepEqual(roh(k.I.groupCalls('segment_name', nach, 2, base)), [{ service: 'vacuum_rename_segment', data: { segment_id: 1, segment_name: 'Atelier Neu' } }]);
  assert.deepEqual(roh(k.I.groupCalls('segment_type', nach, 2, base)), [{ service: 'vacuum_set_segment_type', data: { type: { 9: [1, 1, null] }, map_id: 2 } }], 'Raum 1 wird über den Namen zum eigenen Namen');
  assert.deepEqual(roh(k.I.groupCalls('hidden_segments', nach, 2, base)), [{ service: 'vacuum_set_hidden_segments', data: { segments: [3, 7], map_id: 2 } }]);
  assert.deepEqual(roh(k.I.groupCalls('floor_material', nach, 2, base)), [{ service: 'vacuum_set_floor_material', data: { material: { 1: [1, 0], 3: [1, 90], 4: [1, 90], 5: [1, 0], 6: [1, 90], 7: [2, 0], 9: [2, 0] }, map_id: 2 } }], 'alle Räume der Karte');
  // Rückweg: dieselben Gruppen mit der Ausgangsliste.
  assert.deepEqual(roh(k.I.groupCalls('segment_name', base, 2, nach)), [], 'kein leerer Name');
  assert.deepEqual(roh(k.I.groupCalls('segment_type', base, 2, nach)), [{ service: 'vacuum_set_segment_type', data: { type: { 1: [4, 0, null], 9: [6, 0, null] }, map_id: 2 } }]);
  // Bearbeitungsdaten gehen vor: Sichtbarkeit 0, Richtung roh.
  const mit = k.I.editLists(k.karte._map.current().objects, k.I.editData(raumdaten()));
  assert.deepEqual(roh(mit.hidden_segments), [7]);
  assert.deepEqual(roh(mit.floor_materials[0]), [1, 1, 90]);
  // Nur Attribute, Karte um 90° gedreht: angezeigte Richtung → Geräterichtung.
  const k2 = aufbau({ cam: { rotation: 90 } });
  assert.deepEqual(roh(k2.I.editLists(k2.karte._map.current().objects, null).floor_materials[0]), [1, 1, 90]);
  assert.equal(k.I.payloadFor('segment_name', nach, 2), null, 'Gruppen mit Einzelaufrufen gehen nur über groupCalls');
});

test('EDI-03 Räume: Wahl per Fläche (pick-room) und Chip, Formular Name/Typ/Sichtbarkeit/Boden, Sammel-Speichern mit Zeilen je Raum; Rückgängig', async () => {
  const k = aufbau();
  const d = raeumeOffen(k);
  await mikro(); await mikro();
  const m = k.karte._map;
  assert.equal(m._mode, 'pick-room');
  assert.match(d.shadowRoot.textContent, /Raum auf der Karte antippen oder als Chip wählen/);
  m._roomTap(5, 'map');
  assert.match($d(k.u, '[data-panel="rooms"]').textContent, /Bibliothek/);
  assert.equal(raumChip(k, 5).getAttribute('aria-pressed'), 'true', 'Fläche und Chip zeigen dieselbe Wahl');
  raumChip(k, 1).click();
  assert.match($d(k.u, '[data-panel="rooms"]').textContent, /Atelier/);
  // Typ „Eigener Name“: Namensfeld mit dem bisherigen Namen, dann umbenennen.
  assert.equal(raumFeldE(k, 'type').value, '4');
  waehle(k, raumFeldE(k, 'type'), 0);
  const name = $d(k.u, '[data-field="room-name"]');
  assert.equal(name.value, 'Atelier');
  name.value = 'Atelier Neu';
  name.dispatchEvent(k.u.neuesEreignis('change'));
  // Raum 5: ausblenden, Boden Fliese; Raum 4: Holz mit Richtung.
  raumChip(k, 5).click();
  $d(k.u, '[data-field="room-visible"]').click();
  waehle(k, raumFeldE(k, 'floor_material'), 2);
  assert.equal(raumFeldE(k, 'floor_material_direction'), null, 'Richtung nur bei Holz');
  raumChip(k, 4).click();
  waehle(k, raumFeldE(k, 'floor_material'), 1);
  waehle(k, raumFeldE(k, 'floor_material_direction'), 90);
  assert.deepEqual(k.haus.rufe, [], 'nichts gesendet vor dem Speichern');
  $d(k.u, '[data-action="save"]').click();
  const text = d.shadowRoot.textContent;
  assert.match(text, /Atelier: Name „Atelier Neu“/);
  assert.match(text, /Bibliothek: ausgeblendet/);
  assert.match(text, /Bibliothek: Boden Fliese/);
  assert.match(text, /Galerie: Boden Holz · senkrecht/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_rename_segment', 'vacuum_set_hidden_segments', 'vacuum_set_floor_material']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', segment_id: 1, segment_name: 'Atelier Neu' });
  assert.deepEqual(roh(k.haus.rufe[2].data), { entity_id: 'vacuum.robo', segments: [5], map_id: 2 });
  assert.deepEqual(roh(k.haus.rufe[3].data), { entity_id: 'vacuum.robo', material: { 1: [1, 0], 3: [1, 90], 4: [1, 90], 5: [2, 0], 6: [1, 90], 7: [2, 0], 9: [2, 0] }, map_id: 2 });
  k.u.zurueck();
  $d(k.u, '[data-action="undo"]').click();
  $d(k.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(dienste(k.haus).slice(4), ['vacuum_set_segment_type', 'vacuum_set_hidden_segments', 'vacuum_set_floor_material'], 'Rückgängig: Typ zurück statt leerem Namen');
  assert.deepEqual(roh(k.haus.rufe[4].data), { entity_id: 'vacuum.robo', type: { 1: [4, 0, null] }, map_id: 2 });
  assert.deepEqual(roh(k.haus.rufe[5].data), { entity_id: 'vacuum.robo', segments: [], map_id: 2 });
});

test('EDI-03 Prüfungen: leerer Name abgelehnt (R10), Typ mit laufender Nummer, Dock-Raum aus roomAt(charger_position) bzw. station_segment nicht versteckbar', async () => {
  const k = aufbau();
  raeumeOffen(k);
  await mikro(); await mikro();
  const m = k.karte._map;
  m._roomTap(1, 'map');
  assert.equal($d(k.u, '[data-field="room-visible"]').disabled, true, 'ohne Daten: Raum der Station über roomAt(charger_position)');
  assert.match($d(k.u, '[data-panel="rooms"]').textContent, /Raum mit der Station bleibt sichtbar/);
  m._roomTap(9, 'map');
  assert.equal($d(k.u, '[data-field="room-visible"]').disabled, false);
  waehle(k, raumFeldE(k, 'type'), 1);
  assert.deepEqual(roh(k.karte._mapEdit.lists().room_types.find((e) => e[0] === 9)), [9, 1, 1]);
  assert.equal($d(k.u, '[data-field="room-name"]'), null, 'Typname statt eigenem Namen');
  m._roomTap(4, 'map');
  const name = $d(k.u, '[data-field="room-name"]');
  name.value = '   ';
  name.dispatchEvent(k.u.neuesEreignis('change'));
  assert.match($d(k.u, '[data-panel="rooms"]').textContent, /Der Name darf nicht leer sein/);
  assert.equal($d(k.u, '[data-field="room-name"]').getAttribute('aria-invalid'), 'true');
  assert.deepEqual(roh(k.karte._mapEdit.lists().room_names.find((e) => e[0] === 4)), [4, 'Galerie'], 'leer nicht übernommen');
  // Mit Bearbeitungsdaten entscheidet station_segment; ausgeblendete Räume bleiben wählbar.
  const k2 = aufbau({ abruf: (url) => (/saved=1/.test(url) ? { json: raumdaten() } : { status: 404 }) });
  await mikro();
  raeumeOffen(k2);
  await mikro(); await mikro(); await mikro();
  k2.karte._map._roomTap(9, 'map');
  assert.equal($d(k2.u, '[data-field="room-visible"]').disabled, true, 'station_segment 9');
  k2.karte._map._roomTap(1, 'map');
  assert.equal($d(k2.u, '[data-field="room-visible"]').disabled, false);
  $d(k2.u, '[data-room-pick="7"]').click();
  assert.equal($d(k2.u, '[data-field="room-visible"]').getAttribute('aria-checked'), 'false', 'ausgeblendeter Raum über die Liste wählbar');
  $d(k2.u, '[data-field="room-visible"]').click();
  assert.deepEqual(roh(k2.karte._mapEdit.lists().hidden_segments), []);
});

test('EDI-03 Boden: Richtung nur bei Holz und floor_direction_cleaning; ohne Fähigkeiten keine Felder', async () => {
  const { fixture } = require('./kartendaten.js');
  const alle = fixture('voll').states['vacuum.robo'].attributes.capabilities;
  const k = aufbau({ vac: { capabilities: alle.filter((c) => c !== 'floor_direction_cleaning') } });
  raeumeOffen(k);
  await mikro(); await mikro();
  k.karte._map._roomTap(1, 'map');
  assert.ok(raumFeldE(k, 'floor_material'));
  assert.equal(raumFeldE(k, 'floor_material_direction'), null, 'ohne floor_direction_cleaning keine Richtung');
  const k2 = aufbau({ vac: { capabilities: alle.filter((c) => !['floor_material', 'segment_visibility'].includes(c)) } });
  raeumeOffen(k2);
  await mikro(); await mikro();
  k2.karte._map._roomTap(1, 'map');
  assert.equal(raumFeldE(k2, 'floor_material'), null);
  assert.equal($d(k2.u, '[data-field="room-visible"]'), null);
  assert.ok(raumFeldE(k2, 'type'), 'Name/Typ bleiben');
});

// ── Task 6: Räume teilen und zusammenführen (EDI-03) ────────────────────────

const tippeAuf = (k, robot) => k.karte._map._emit('map-tap', { robot, hit: null, passable: null, mode: k.karte._map._mode });
const zieh = (k, phase, start, robot) => k.karte._map._emit('map-drag', { phase, mode: k.karte._map._mode, start, robot });
const feldE = (k, name) => $d(k.u, '[data-field="' + name + '"]');
const tippen = (k, node, wert) => { node.value = String(wert); node.dispatchEvent(k.u.neuesEreignis('change')); };

test('EDI-03 gemeinsamer Baustein (R08): shapeFit/shapeStep/shapeDrag/shapeMove für Zonen von clean-tasks und Linien des Editors', () => {
  const k = aufbau();
  const { shapeFit, shapeDrag, shapeMove } = k.I;
  assert.deepEqual(roh(shapeFit({ x0: 10, y0: 500, x1: 0, y1: 0 }, 150)), { x0: 0, y0: 0, x1: 150, y1: 500 });
  const o = { x0: 0, y0: 0, x1: 100, y1: 200 };
  assert.deepEqual(roh(shapeDrag({ kind: 'move', origin: o, start: { x: 10, y: 10 } }, { x: 60, y: 40 })), { x0: 50, y0: 30, x1: 150, y1: 230 });
  assert.deepEqual(roh(shapeDrag({ kind: 'corner', origin: o, j: 2, start: { x: 100, y: 200 } }, { x: 300, y: 400 })), { x0: 0, y0: 0, x1: 300, y1: 400 });
  assert.deepEqual(roh(shapeDrag({ kind: 'end', origin: o, j: 0 }, { x: -5, y: -6 })), { x0: -5, y0: -6, x1: 100, y1: 200 });
  assert.deepEqual(roh(shapeDrag({ kind: 'end', origin: o, j: 1 }, { x: 7, y: 8 })), { x0: 0, y0: 0, x1: 7, y1: 8 });
  assert.deepEqual(roh(shapeDrag({ kind: 'draw', start: { x: 1, y: 2 } }, { x: 3, y: 4 })), { x0: 1, y0: 2, x1: 3, y1: 4 });
  assert.deepEqual(roh(shapeMove(o, { x: 50, y: -10 })), { x0: 50, y0: -10, x1: 150, y1: 190 });
  const schritt = k.I.shapeStep(k.karte._map, 'right', 50);
  assert.equal(Math.abs(schritt.x) + Math.abs(schritt.y), 50, 'ein Achsschritt in Roboter-mm');
  // clean-tasks nutzt denselben Baustein (Quelltext): keine zweite Rechteck-/Schrittlogik.
  const quelle = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');
  for (const name of ['_fitZone', '_zoneStep', '_zoneDrag']) {
    const start = quelle.indexOf('    ' + name + '(');
    const rumpf = quelle.slice(start, quelle.indexOf('\n    }\n', start));
    assert.match(rumpf, /shape(Fit|Step|Drag)\(/, name + ' nutzt den gemeinsamen Baustein');
  }
});

test('EDI-03 Teilen: Linie per zwei Kartenpunkten oder Koordinatenfeldern (R15), Prüfungen, eigene Bestätigung (destruktiv, nicht umkehrbar) → vacuum_split_segments', async () => {
  const k = aufbau();
  const d = raeumeOffen(k);
  await mikro(); await mikro();
  k.karte._map._roomTap(5, 'map');
  $d(k.u, '[data-action="room-split"]').click();
  assert.equal(k.karte._map._mode, 'drag', 'Punkte setzen und Griffe ziehen');
  assert.match(d.shadowRoot.textContent, /zwei Punkte auf der Karte/);
  assert.equal($d(k.u, '[data-action="split-go"]').disabled, true);
  assert.match(d.shadowRoot.textContent, /Die Linie braucht zwei Punkte/);
  // Linie ganz im Raum: schneidet nicht.
  tippeAuf(k, { x: -6000, y: -8496 });
  tippeAuf(k, { x: -3000, y: -8496 });
  assert.equal(feldE(k, 'split-x0').value, '-6000');
  assert.equal(feldE(k, 'split-x1').value, '-3000');
  assert.match(d.shadowRoot.textContent, /muss den Raum ganz durchqueren/);
  assert.equal($d(k.u, '[data-action="split-go"]').disabled, true);
  // Koordinatenfelder statt Ziehen (R15): Linie verlängern.
  tippen(k, feldE(k, 'split-x0'), -9000);
  tippen(k, feldE(k, 'split-x1'), -600);
  assert.doesNotMatch(d.shadowRoot.textContent, /durchqueren/);
  // Tastatur: Pfeil ±50 mm, mit Umschalt ±10 mm.
  k.u.tasteAn(feldE(k, 'split-y0'), 'keydown', { key: 'ArrowUp' });
  assert.equal(feldE(k, 'split-y0').value, '-8446');
  k.u.tasteAn(feldE(k, 'split-y0'), 'keydown', { key: 'ArrowDown', shiftKey: true });
  assert.equal(feldE(k, 'split-y0').value, '-8456');
  tippen(k, feldE(k, 'split-y0'), -8496);
  const linie = $d(k.u, '[data-action="split-line"]');
  k.u.tasteAn(linie, 'keydown', { key: 'ArrowRight' });
  k.u.tasteAn(linie, 'keydown', { key: 'ArrowLeft' });
  assert.equal(feldE(k, 'split-x0').value, '-9000', 'Linie hin und zurück');
  assert.ok(k.karte._map._layers.get('editor').group.querySelector('[data-edit="split-line"]'), 'Linie auf der Ebene editor');
  assert.equal($d(k.u, '[data-action="split-go"]').disabled, false);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="split-go"]').click();
  const text = d.shadowRoot.textContent;
  assert.equal(d._views.at(-1).kind, 'confirm');
  assert.match(text, /„Bibliothek“ wird an der Linie \(-9000, -8496\) → \(-600, -8496\) in zwei Räume geteilt/);
  assert.match(text, /Nicht per Rückgängig umkehrbar. Rückweg: Wiederherstellen in der Kartensicherung/);
  assert.equal($d(k.u, '[data-action="confirm"]').getAttribute('data-variant'), 'destructive');
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(roh(k.haus.rufe.map((r) => [r.service, r.data])), [
    ['vacuum_backup_map', { entity_id: 'vacuum.robo', map_id: 2 }],
    ['vacuum_split_segments', { entity_id: 'vacuum.robo', segment: 5, line: [-9000, -8496, -600, -8496], map_id: 2 }],
  ]);
  assert.equal(k.karte._mapEdit.split, null);
  assert.equal(k.karte._mapEdit.session.undo.length, 0, 'kein Rückgängig für Teilen');
});

test('EDI-03 Teilen: Punkte tippen, Endpunkt ziehen; Raumgrenze 49 bzw. 29 (map_v2); offene Änderungen sperren Teilen und Zusammenführen', async () => {
  const k = aufbau({ bild: true });
  const d = raeumeOffen(k);
  await mikro(); await mikro();
  k.karte._map._roomTap(5, 'map');
  $d(k.u, '[data-action="room-split"]').click();
  tippeAuf(k, { x: -9000, y: -8000 });
  tippeAuf(k, { x: -700, y: -8000 });
  // Endpunkt am Griff ziehen (Treffer über die Ebene editor).
  zieh(k, 'start', { x: -700, y: -8000 }, { x: -700, y: -8000 });
  zieh(k, 'move', { x: -700, y: -8000 }, { x: -600, y: -8100 });
  zieh(k, 'end', { x: -700, y: -8000 }, { x: -600, y: -8100 });
  assert.equal(feldE(k, 'split-x1').value, '-600');
  assert.equal(feldE(k, 'split-y1').value, '-8100');
  assert.equal(feldE(k, 'split-x0').value, '-9000', 'anderer Endpunkt bleibt');
  // Raumgrenze: 49 ohne map_v2.
  const viele = {};
  for (let i = 1; i <= 49; i++) viele[i] = { room_id: i, name: 'R' + i, x0: i * 1000, y0: 0, x1: i * 1000 + 900, y1: 900, x: i * 1000 + 450, y: 450, visibility: 'Visible' };
  const k2 = aufbau({ cam: { rooms: viele } });
  raeumeOffen(k2);
  await mikro(); await mikro();
  k2.karte._map._roomTap(3, 'map');
  $d(k2.u, '[data-action="room-split"]').click();
  tippeAuf(k2, { x: 3450, y: -100 });
  tippeAuf(k2, { x: 3450, y: 1000 });
  assert.match(dialogVon(k2.u).shadowRoot.textContent, /Höchstens 49 Räume/);
  assert.equal($d(k2.u, '[data-action="split-go"]').disabled, true);
  assert.equal(k2.I.splitLimit(k2.karte._model()), 49);
  const { fixture } = require('./kartendaten.js');
  const k3 = aufbau({ vac: { capabilities: fixture('voll').states['vacuum.robo'].attributes.capabilities.concat(['map_v2']) } });
  assert.equal(k3.I.splitLimit(k3.karte._model()), 29);
  // Offene Änderungen: erst speichern oder verwerfen.
  $d(k.u, '[data-action="split-cancel"]').click();
  assert.equal(k.karte._map._mode, 'pick-room');
  $d(k.u, '[data-field="room-visible"]').click();
  assert.equal($d(k.u, '[data-action="room-split"]').disabled, true);
  assert.equal($d(k.u, '[data-action="room-merge"]').disabled, true);
  assert.match(d.shadowRoot.textContent, /Erst speichern oder verwerfen/);
  assert.deepEqual(k.haus.rufe, []);
});

test('EDI-03 Zusammenführen: genau zwei Räume (Fläche/Chip), Nachbarschaft aus den Daten, ohne Daten entscheidet das Gerät → vacuum_merge_segments', async () => {
  const k = aufbau({ abruf: (url) => (/saved=1/.test(url) ? { json: raumdaten() } : { status: 404 }) });
  await mikro();
  const d = raeumeOffen(k);
  await mikro(); await mikro(); await mikro();
  const m = k.karte._map;
  m._roomTap(1, 'map');
  $d(k.u, '[data-action="room-merge"]').click();
  assert.equal(m._mode, 'pick-room');
  assert.match(d.shadowRoot.textContent, /Genau zwei Räume wählen/);
  raumChip(k, 4).click();
  assert.match(d.shadowRoot.textContent, /grenzen nicht aneinander/, '1 und 4 sind keine Nachbarn');
  assert.equal($d(k.u, '[data-action="merge-go"]').disabled, true);
  raumChip(k, 4).click();
  m._roomTap(9, 'map');
  assert.equal(raumChip(k, 1).getAttribute('aria-pressed'), 'true');
  assert.equal(raumChip(k, 9).getAttribute('aria-pressed'), 'true');
  assert.equal($d(k.u, '[data-action="merge-go"]').disabled, false);
  m._roomTap(3, 'map');
  assert.deepEqual(roh(k.karte._mapEdit.merge), [9, 3], 'ein dritter Raum ersetzt den ältesten: nie mehr als zwei');
  m._roomTap(3, 'map');
  m._roomTap(1, 'map');
  $d(k.u, '[data-action="merge-go"]').click();
  assert.match(d.shadowRoot.textContent, /Räume: Sauna \+ Atelier → ein Raum/);
  assert.match(d.shadowRoot.textContent, /Wiederherstellen in der Kartensicherung/);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(roh(k.haus.rufe.map((r) => [r.service, r.data])), [
    ['vacuum_backup_map', { entity_id: 'vacuum.robo', map_id: 2 }],
    ['vacuum_merge_segments', { entity_id: 'vacuum.robo', segments: [9, 1], map_id: 2 }],
  ]);
  // Ohne Bearbeitungsdaten: keine Nachbarprüfung, das Gerät entscheidet.
  const k2 = aufbau();
  raeumeOffen(k2);
  await mikro(); await mikro();
  k2.karte._map._roomTap(1, 'map');
  $d(k2.u, '[data-action="room-merge"]').click();
  raumChip(k2, 4).click();
  assert.equal($d(k2.u, '[data-action="merge-go"]').disabled, false);
  assert.equal(k2.I.mergeCheck(null, [1, 4]), '');
  assert.equal(k2.I.mergeCheck(k2.I.editData(raumdaten()), [1, 4]), 'zusammenNachbarn');
  assert.equal(k2.I.mergeCheck(null, [1]), 'zusammenZwei');
});

// ── Checkpoint B (nach Task 3–6): Sicherheitsrahmen deckt jede Speicherung ──

/** Quelltext ohne Kommentare; Zeichenketten bleiben (Dienstnamen sind Zeichenketten). */
function ohneKommentare(text) {
  let aus = '', i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); aus += ' '.repeat(e + 2 - i); i = e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      aus += text.slice(i, j + 1); i = j + 1; continue;
    }
    aus += c; i++;
  }
  return aus;
}
/** [Anfang, Ende) des Rumpfs ab `kopf` (Klammern gezählt, Zeichenketten übersprungen). */
function spanne(text, kopf) {
  const start = text.indexOf(kopf);
  assert.ok(start >= 0, 'nicht gefunden: ' + kopf);
  let i = text.indexOf('{', start + kopf.length - 1), tiefe = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (text[j] !== c) j += text[j] === '\\' ? 2 : 1; i = j; continue; }
    if (c === '{') tiefe++;
    if (c === '}' && --tiefe === 0) return [start, i + 1];
  }
  throw new Error('offen: ' + kopf);
}
const fundstellen = (text, muster) => Array.from(text.matchAll(muster), (m) => m.index);
const drin = (i, [a, b]) => i >= a && i < b;

/** Kartendienste der Spec-Tabellen (Kartenverwaltung, Räume, Objekte, Wände, WLAN) und der Sicherung. */
const KARTENDIENSTE = ['vacuum_set_property', 'vacuum_call_action', 'vacuum_rename_map', 'vacuum_select_map', 'vacuum_delete_map', 'vacuum_save_temporary_map',
  'vacuum_discard_temporary_map', 'vacuum_replace_temporary_map', 'vacuum_request_map', 'vacuum_rename_segment', 'vacuum_set_segment_type', 'vacuum_set_hidden_segments',
  'vacuum_set_floor_material', 'vacuum_split_segments', 'vacuum_merge_segments', 'vacuum_set_restricted_zone', 'vacuum_set_threshold', 'vacuum_set_virtual_threshold',
  'vacuum_set_curtain', 'vacuum_set_carpet_area', 'vacuum_set_carpet_type', 'vacuum_set_custom_carpet_cleaning', 'vacuum_set_furniture', 'vacuum_set_predefined_points',
  'vacuum_set_walls', 'vacuum_set_router_position', 'vacuum_backup_map', 'vacuum_restore_map'];
/** Kartendienste des Moduls map-backup: ihre Schreibweg-Zeilen prüft tests/kartensicherung.test.js (Checkpoint C dort). */
const MAP_BACKUP_DIENSTE = ['vacuum_restore_map'];
/** Wege außerhalb von mapWrite, je mit eigener Bestätigung oder als dokumentierte Ausnahme. */
const EIGENE_WEGE = {
  vacuum_select_map: 'CORE-20: nur in card._confirmMapChange (MapView.selectMap, Spec „Wählen“)',
  vacuum_set_property: 'device-settings writeSetting; multi_floor_map nur über SETTINGS.confirm',
  vacuum_call_action: 'device-settings callAction; start_mapping/start_fast_mapping nur im done einer mapConfirm',
  vacuum_request_map: 'dokumentierte Ausnahme: requestMap, nicht zerstörend (Spec-Tabelle), ohne Bestätigung',
};

test('EDI-02 Checkpoint B: alle Aufrufer von mapWrite/confirmGrant gegen die Bestätigungswege; jeder Kartendienst der Spec nur hinter einer Bestätigung (requestMap Ausnahme)', () => {
  const quelle = ohneKommentare(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8'));
  const confirm = spanne(quelle, 'function mapConfirm(');
  const session = spanne(quelle, 'class MapEditSession {');
  const request = spanne(quelle, 'function requestMap(');
  const newMap = spanne(quelle, 'function newMapActions(');
  // 1. Grants: genau eine Quelle, der Klick in mapConfirm; kein nachgebauter Grant.
  const grants = fundstellen(quelle, /confirmGrant\(/g);
  assert.equal(grants.length, 1, 'confirmGrant( genau einmal aufgerufen');
  assert.ok(drin(grants[0], confirm), 'nur in mapConfirm');
  const klick = quelle.slice(quelle.lastIndexOf('const go = BuschUI.action(', grants[0]), grants[0]);
  assert.match(klick, /onClick: \(\) => \{/, 'im onClick des Bestätigungsknopfs');
  assert.deepEqual(fundstellen(quelle, /confirmed:\s*true/g).length, 1, 'confirmed: true nur in confirmGrant');
  assert.equal(aufbau().I.confirmGrant, undefined, 'confirmGrant nicht exportiert');
  // 2. mapWrite: nur MapEditSession (Sicherung + commit nach dem Grant).
  const schreiber = fundstellen(quelle, /(?<!function )mapWrite\(/g);
  assert.equal(schreiber.length, 2);
  for (const i of schreiber) assert.ok(drin(i, session), 'mapWrite nur in MapEditSession');
  assert.deepEqual(fundstellen(quelle, /\.commit\(/g).filter((i) => !drin(i, confirm)), [], 'commit nur aus mapConfirm');
  // 3. Jeder callService: Kartendienste nur über mapWrite oder die eigenen Wege.
  const aufrufe = Array.from(quelle.matchAll(/callService\(\s*([^,]+?),\s*([^,]+?),/g), (m) => ({ i: m.index, dienst: m[2].trim() }));
  const dynamisch = aufrufe.filter((a) => !/^'[^']*'$/.test(a.dienst));
  assert.deepEqual(dynamisch.map((a) => a.dienst).sort(), ['call ? call.service : control.service', 'payload.service', 'service'], 'nur bekannte Sender mit variablem Dienst');
  assert.ok(drin(dynamisch.find((a) => a.dienst === 'service').i, spanne(quelle, 'function mapWrite(')), 'variabler Kartendienst nur in mapWrite');
  assert.ok(drin(dynamisch.find((a) => a.dienst === 'payload.service').i, spanne(quelle, 'function runReclean(')), 'Aufgabe (taskPayload) in runReclean');
  const aufgaben = quelle.slice(...spanne(quelle, 'const TASK_SERVICES = {'));
  for (const d of KARTENDIENSTE) assert.ok(!aufgaben.includes("'" + d + "'"), 'Aufgabendienste sind keine Kartendienste: ' + d);
  for (const a of aufrufe.filter((x) => KARTENDIENSTE.includes(x.dienst.slice(1, -1)))) {
    const dienst = a.dienst.slice(1, -1);
    assert.ok(EIGENE_WEGE[dienst], dienst + ' direkt über callService statt mapWrite');
    const zeile = quelle.slice(quelle.lastIndexOf('\n', a.i), a.i);
    if (dienst === 'vacuum_select_map') assert.match(zeile, /_confirmMapChange\(/, 'Kartenwahl nur hinter CORE-20');
    if (dienst === 'vacuum_request_map') assert.ok(drin(a.i, request), 'request_map nur in requestMap');
  }
  // 4. Die eigenen Wege bestätigen selbst: multi_floor_map mit confirm, Kartierung im done einer mapConfirm.
  const k = aufbau();
  assert.equal(k.I.SETTINGS.multi_floor_map.confirm, true);
  for (const key of ['start_mapping', 'start_fast_mapping']) {
    for (const i of fundstellen(quelle, new RegExp("'" + key + "'", 'g'))) assert.ok(drin(i, newMap), key + ' nur in newMapActions');
  }
  const kartierung = quelle.slice(...newMap);
  assert.ok(kartierung.indexOf('callAction(') > kartierung.indexOf('done:') && kartierung.indexOf('done:') > kartierung.indexOf('mapConfirm('), 'callAction erst im done der Bestätigung');
  // 5. Klassifizierung vollständig: jeder Kartendienst ist mapWrite-Dienst (Gruppen, Verwaltung, Teilen/Zusammenführen) oder eigener Weg.
  const ueberMapWrite = KARTENDIENSTE.filter((d) => !EIGENE_WEGE[d]);
  for (const g of Object.values(k.I.EDIT_GROUPS)) assert.ok(ueberMapWrite.includes(g.service), 'Gruppe ' + g.service + ' ist ein Spec-Dienst');
  for (const d of ueberMapWrite) {
    assert.ok(quelle.includes("'" + d + "'"), d + ' kommt im Quelltext vor');
    assert.throws(() => k.I.mapWrite(k.karte, null, d, {}), /without confirmation/, d);
    assert.throws(() => k.I.mapWrite(k.karte, { card: k.karte, confirmed: false }, d, {}), /without confirmation/, d);
  }
  assert.deepEqual(k.haus.rufe, []);
});

// ── Task 7: Zonen und Linien (EDI-05) ───────────────────────────────────────

/** Bearbeitungsmodus mit den echten Werkzeugen (ohne Testpanels) und gewähltem Werkzeug. */
function werkzeugOffen(k, name) {
  stift(k).click();
  werkzeug(k, name).click();
  return dialogVon(k.u);
}
const eintrag = (k, list, i) => $d(k.u, '[data-edit-item="' + list + ':' + i + '"]');
const wert = (k, name) => Number(feldE(k, name).value);
const optionen = (node) => Array.from(node.querySelectorAll('option'), (o) => o.value);
/** Roboterpunkt, der auf dem Bildschirm `dx`/`dy` px neben `p` liegt. */
const daneben = (k, p, dx, dy) => { const m = k.karte._map, s = m.toScreen(m.toImage(p)); return m.toRobot(m.fromScreen({ x: s.x + dx, y: s.y + dy })); };

test('EDI-05 Zonen/Linien: Arten je Dienst und Attribut; virtuelle Schwellen nur ohne passable_thresholds — nie set_threshold und set_virtual_threshold zugleich', () => {
  const arten = (k) => { const c = k.I.editCaps(k.karte._model(), null, k.karte._map.current().objects); return { zones: roh(c.zones.kinds), lines: roh(c.lines.kinds) }; };
  assert.deepEqual(arten(aufbau()), { zones: ['no_go_areas', 'no_mopping_areas', 'ramps'], lines: ['virtual_walls', 'passable_thresholds', 'impassable_thresholds', 'curtains'] });
  assert.deepEqual(arten(aufbau({ cam: { virtual_thresholds: [] } })).lines, ['virtual_walls', 'passable_thresholds', 'impassable_thresholds', 'curtains'], 'beide Attribute: nur set_threshold (dasselbe Feld vwsl)');
  assert.deepEqual(arten(aufbau({ cam: { passable_thresholds: null, impassable_thresholds: [], virtual_thresholds: [] } })),
    { zones: ['no_go_areas', 'no_mopping_areas'], lines: ['virtual_walls', 'virtual_thresholds', 'curtains'] }, 'nur virtuelle Schwellen: keine Art von set_threshold (es schriebe vwsl leer)');
  const { fixture } = require('./kartendaten.js');
  const alle = fixture('voll').states['vacuum.robo'].attributes.capabilities;
  assert.ok(!arten(aufbau({ vac: { capabilities: alle.filter((c) => c !== 'curtains') } })).lines.includes('curtains'), 'Vorhänge nur mit Fähigkeit curtains');
  const k = aufbau();
  k.haus.services.dreame_vacuum = Object.assign({}, k.haus.services.dreame_vacuum);
  delete k.haus.services.dreame_vacuum.vacuum_set_threshold;
  k.karte.hass = k.haus.setze({});
  assert.deepEqual(arten(k), { zones: ['no_go_areas', 'no_mopping_areas'], lines: ['virtual_walls', 'curtains'] });
});

test('EDI-05 Zonen: + legt ein Rechteck in die Bildmitte, Formular mit Koordinaten (±50/10 mm), Mindestgröße zwei Raster, Liste mit Zustandstext; Speichern sendet alle drei Listen', async () => {
  const k = aufbau({ bild: true });
  const d = werkzeugOffen(k, 'zones');
  await mikro(); await mikro();
  assert.equal(k.karte._map._mode, 'draw-rect');
  assert.match(d.shadowRoot.textContent, /No-Go-Zonen: keine/);
  assert.match(d.shadowRoot.textContent, /Wischverbotszonen: keine/, 'Begriff aus R26');
  assert.deepEqual(optionen(feldE(k, 'edit-kind')), ['no_go_areas', 'no_mopping_areas', 'ramps']);
  waehle(k, feldE(k, 'edit-kind'), 'no_mopping_areas');
  $d(k.u, '[data-action="edit-add"]').click();
  const z = eintrag(k, 'no_mopping_areas', 0);
  assert.equal(z.getAttribute('data-state'), 'new');
  assert.equal(z.getAttribute('data-state-text'), 'neu', 'Zustand als Text, nicht nur Farbe (R17)');
  assert.match(z.getAttribute('aria-label'), /Wischverbotszone 1, 1,0 × 1,0 m, neu/);
  assert.equal(z.getAttribute('aria-pressed'), 'true', 'das neue Objekt ist gewählt');
  const [x0, y0, x1, y1] = ['edit-x0', 'edit-y0', 'edit-x1', 'edit-y1'].map((f) => wert(k, f));
  assert.equal(x1 - x0, 1000);
  assert.equal(y1 - y0, 1000);
  const mitte = k.karte._mapCentre();
  assert.ok(Math.abs((x0 + x1) / 2 - mitte.x) <= 1 && Math.abs((y0 + y1) / 2 - mitte.y) <= 1, 'Bildmitte');
  assert.equal(k.karte._map._layers.get('editor').group.querySelector('[data-edit="no_mopping_areas"]').getAttribute('data-state'), 'new', 'auf der Ebene editor mit Zustand (Muster)');
  k.u.tasteAn(feldE(k, 'edit-x0'), 'keydown', { key: 'ArrowUp' });
  assert.equal(wert(k, 'edit-x0'), x0 + 50);
  k.u.tasteAn(feldE(k, 'edit-x0'), 'keydown', { key: 'ArrowDown', shiftKey: true });
  assert.equal(wert(k, 'edit-x0'), x0 + 40);
  tippen(k, feldE(k, 'edit-x1'), x0 + 60);
  assert.equal(wert(k, 'edit-x1'), x0 + 140, 'Mindestgröße: zwei Kartenraster (2 × 50 mm)');
  assert.match($d(k.u, '[data-panel="zones"]').textContent, /Mindestens 100 mm/);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="save"]').click();
  assert.match(d.shadowRoot.textContent, /Wischverbotszonen: 1 neu, 0 geändert, 0 gelöscht/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_restricted_zone']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', walls: [[777, -7926, 794, -6336]], zones: [], no_mops: [[x0 + 40, y0, x0 + 140, y1]] }, 'die anderen zwei Listen unverändert mit');
});

test('EDI-05 Schwellen und Rampen: eine Art ändern → vacuum_set_threshold mit allen drei Listen; 5. Wert bestehender Rampen durchgereicht, neue ohne; Entfernen zeigt „gelöscht“, Zurückholen', async () => {
  const k = aufbau({ bild: true, cam: { ramps: [{ x0: 0, y0: 0, x1: 400, y1: 0, x2: 400, y2: 600, x3: 0, y3: 600, angle: 90 }] } });
  const d = werkzeugOffen(k, 'lines');
  await mikro(); await mikro();
  eintrag(k, 'passable_thresholds', 0).click();
  assert.equal(wert(k, 'edit-x0'), -4584);
  tippen(k, feldE(k, 'edit-x0'), -4600);
  assert.equal(eintrag(k, 'passable_thresholds', 0).getAttribute('data-state'), 'changed');
  assert.match(eintrag(k, 'passable_thresholds', 0).getAttribute('aria-label'), /Passierbare Schwelle 1, .* m, geändert/);
  eintrag(k, 'virtual_walls', 0).click();
  $d(k.u, '[data-action="edit-remove"]').click();
  const weg = $d(k.u, '[data-edit-removed="virtual_walls:0"]');
  assert.equal(weg.getAttribute('data-state-text'), 'gelöscht');
  assert.match(weg.textContent, /Virtuelle Wand 1/);
  assert.equal(eintrag(k, 'virtual_walls', 0), null);
  weg.querySelector('[data-action="edit-restore"]').click();
  assert.equal(eintrag(k, 'virtual_walls', 0).getAttribute('data-state'), null, 'zurückgeholt: unverändert');
  assert.equal(k.karte._mapEdit.dirty(['virtual_walls']), false);
  $d(k.u, '[data-action="save"]').click();
  assert.match(d.shadowRoot.textContent, /Passierbare Schwellen: 0 neu, 1 geändert, 0 gelöscht/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_threshold'], 'nur die Gruppe der geänderten Art');
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', passable_thresholds: [[-4600, -7932, -3289, -7932], [-4708, -7418, -3234, -7418]], impassable_thresholds: [], ramps: [[0, 0, 400, 600, 90]] });
  // Rampe verschieben (Pfeiltaste auf dem Eintrag) und neue Rampe: 5. Wert nur bei der bestehenden.
  k.u.zurueck();
  werkzeug(k, 'zones').click();
  const rampe = eintrag(k, 'ramps', 0);
  rampe.click();
  k.u.tasteAn(eintrag(k, 'ramps', 0), 'keydown', { key: 'ArrowRight' });
  k.u.tasteAn(eintrag(k, 'ramps', 0), 'keydown', { key: 'ArrowRight', shiftKey: true });
  waehle(k, feldE(k, 'edit-kind'), 'ramps');
  $d(k.u, '[data-action="edit-add"]').click();
  $d(k.u, '[data-action="save"]').click();
  $d(k.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(dienste(k.haus).slice(2), ['vacuum_set_threshold']);
  const { ramps, passable_thresholds } = roh(k.haus.rufe[2].data);
  assert.equal(ramps.length, 2);
  assert.equal(ramps[0][4], 90, 'bestehende Rampe: 5. Wert durchgereicht');
  assert.equal(Math.abs(ramps[0][0]) + Math.abs(ramps[0][1]), 60, 'verschoben um 50 + 10 mm');
  assert.equal(ramps[0][2] - ramps[0][0], 400);
  assert.equal(ramps[1].length, 4, 'neue Rampe ohne 5. Wert');
  assert.deepEqual(passable_thresholds, [[-4600, -7932, -3289, -7932], [-4708, -7418, -3234, -7418]], 'Schwellen unverändert mit');
  // Entf auf dem Eintrag entfernt.
  k.u.zurueck();
  k.u.tasteAn(eintrag(k, 'ramps', 1), 'keydown', { key: 'Delete' });
  assert.equal(eintrag(k, 'ramps', 1), null);
  assert.ok($d(k.u, '[data-edit-removed="ramps:1"]'));
});

test('EDI-05 Geräte nur mit virtual_thresholds: neue Linie → nur vacuum_set_virtual_threshold, nie vacuum_set_threshold', async () => {
  const k = aufbau({ bild: true, cam: { passable_thresholds: null, impassable_thresholds: [], ramps: null, virtual_thresholds: [{ x0: 0, y0: 0, x1: 800, y1: 0 }] } });
  werkzeugOffen(k, 'lines');
  await mikro(); await mikro();
  assert.deepEqual(optionen(feldE(k, 'edit-kind')), ['virtual_walls', 'virtual_thresholds', 'curtains']);
  waehle(k, feldE(k, 'edit-kind'), 'virtual_thresholds');
  $d(k.u, '[data-action="edit-add"]').click();
  const [x0, y0, x1, y1] = ['edit-x0', 'edit-y0', 'edit-x1', 'edit-y1'].map((f) => wert(k, f));
  assert.equal(Math.round(Math.hypot(x1 - x0, y1 - y0)), 1000, 'neue Linie 1 m');
  $d(k.u, '[data-action="save"]').click();
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Virtuelle Schwellen: 1 neu/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_virtual_threshold']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', virtual_thresholds: [[0, 0, 800, 0], [x0, y0, x1, y1]] });
});

test('EDI-05 Karte: Aufziehen in draw-rect legt an (Mindestgröße), Eckgriff (44 px) skaliert, Fläche verschiebt, Abbrechen stellt her; Linienende ziehen', async () => {
  const k = aufbau({ bild: true });
  werkzeugOffen(k, 'zones');
  await mikro(); await mikro();
  const c = k.karte._mapCentre();
  const p = (dx, dy) => ({ x: c.x + dx, y: c.y + dy });
  const no = () => roh(k.karte._mapEdit.lists().no_go_areas);
  const r = (v) => v.map(Math.round);
  zieh(k, 'start', p(0, 0), p(0, 0));
  zieh(k, 'move', p(0, 0), p(4000, 3000));
  assert.deepEqual(no(), [], 'während des Ziehens bleibt der Entwurf unberührt');
  zieh(k, 'end', p(0, 0), p(4000, 3000));
  assert.deepEqual(no(), [r([c.x, c.y, c.x + 4000, c.y + 3000])]);
  // Kleines Aufziehen: Mindestgröße.
  zieh(k, 'start', p(-9000, -9000), p(-9000, -9000));
  zieh(k, 'end', p(-9000, -9000), p(-8990, -8990));
  assert.deepEqual(no()[1], r([c.x - 9000, c.y - 9000, c.x - 8900, c.y - 8900]));
  // Eckgriff: 15 px neben der Ecke trifft noch (44-px-Ziel).
  eintrag(k, 'no_go_areas', 0).click();
  const ecke = daneben(k, p(4000, 3000), 15, 15);
  zieh(k, 'start', ecke, ecke);
  zieh(k, 'end', ecke, p(5000, 3500));
  assert.deepEqual(no()[0], r([c.x, c.y, c.x + 5000, c.y + 3500]), 'gegenüberliegende Ecke bleibt');
  // Fläche verschieben.
  zieh(k, 'start', p(2000, 1500), p(2000, 1500));
  zieh(k, 'end', p(2000, 1500), p(2500, 1000));
  assert.deepEqual(no()[0], r([c.x + 500, c.y - 500, c.x + 5500, c.y + 3000]));
  // Abbrechen stellt her.
  zieh(k, 'start', p(2000, 1500), p(2000, 1500));
  zieh(k, 'move', p(2000, 1500), p(9000, 9000));
  zieh(k, 'cancel', p(2000, 1500), p(9000, 9000));
  assert.deepEqual(no()[0], r([c.x + 500, c.y - 500, c.x + 5500, c.y + 3000]));
  // Linien: Ende am Griff ziehen.
  $d(k.u, '[data-action="discard-draft"]').click();
  werkzeug(k, 'lines').click();
  eintrag(k, 'virtual_walls', 0).click();
  const ende = daneben(k, { x: 794, y: -6336 }, 10, 0);
  zieh(k, 'start', ende, ende);
  zieh(k, 'end', ende, { x: 900, y: -5000 });
  assert.deepEqual(roh(k.karte._mapEdit.lists().virtual_walls), [[777, -7926, 900, -5000]], 'anderes Ende bleibt');
  // Tippen auf leere Karte hebt die Wahl auf.
  tippeAuf(k, p(-20000, -20000));
  assert.equal(eintrag(k, 'virtual_walls', 0).getAttribute('aria-pressed'), 'false');
  assert.deepEqual(k.haus.rufe, []);
});

// ── Task 8: Teppiche (EDI-05) ───────────────────────────────────────────────

const VOLL_CAPS = () => require('./kartendaten.js').fixture('voll').states['vacuum.robo'].attributes.capabilities;
/** Karte mit Bearbeitungsdaten (Teppich-IDs 4/5, erkannter 11) und gewähltem Werkzeug Teppiche. */
async function teppiche(mehr = {}, daten = {}) {
  const k = aufbau(Object.assign({ bild: true, abruf: (url) => (/saved=1/.test(url) ? { json: bearbeitungsdaten(daten) } : { status: 404 }) }, mehr));
  await mikro();
  stift(k).click();
  await mikro(); await mikro(); await mikro();
  werkzeug(k, 'carpets').click();
  return { k, d: dialogVon(k.u) };
}

test('EDI-05 Teppich-Listen: Typ erkannter Teppiche → vacuum_set_carpet_type, Reinigung → vacuum_set_custom_carpet_cleaning (je ein Aufruf mit Listen, Vorlieben nur wenn geändert)', () => {
  const k = aufbau();
  const base = k.I.editLists(k.karte._map.current().objects, k.I.editData(bearbeitungsdaten()));
  assert.deepEqual(roh(base.carpet_types), [[11, 7]], 'nur erkannte: eigene tragen den Typ im 7. Wert von set_carpet_area');
  assert.deepEqual(roh(base.carpet_cleanings), [['1:4', 4, 1, 1, null], ['1:5', 5, 1, 2, null], ['0:11', 11, 0, 1, null]]);
  const nach = roh(base);
  nach.carpet_types[0] = [11, 6];
  nach.carpet_cleanings[1] = ['1:5', 5, 1, 3, null];
  nach.carpet_cleanings[2] = ['0:11', 11, 0, 5, null];
  assert.deepEqual(roh(k.I.groupCalls('carpet_type', nach, 2, base)), [{ service: 'vacuum_set_carpet_type', data: { id: [11], object_type: [0], carpet_type: [6] } }]);
  assert.deepEqual(roh(k.I.groupCalls('carpet_cleaning', nach, 2, base)), [{ service: 'vacuum_set_custom_carpet_cleaning', data: { id: [5, 11], object_type: [1, 0], carpet_cleaning: [3, 5] } }]);
  nach.carpet_cleanings[2] = ['0:11', 11, 0, 5, 5];
  assert.deepEqual(roh(k.I.groupCalls('carpet_cleaning', nach, 2, base)[0].data.carpet_preferences), [[], ['clean_carpets_first', 'intensive_carpet_cleaning']], 'Vorlieben als Namen (device.py set_custom_carpet_cleaning)');
  assert.deepEqual(roh(k.I.groupCalls('carpet_cleaning', base, 2, nach)[0].data), { id: [5, 11], object_type: [1, 0], carpet_cleaning: [2, 1], carpet_preferences: [[], []] }, 'Rückweg');
  assert.equal(k.I.editLists(k.karte._map.current().objects, null).carpet_types, null, 'ohne Bearbeitungsdaten unbekannt');
});

test('EDI-05 Teppiche: bestehende IDs bleiben, neue −1, rund/eckig, Typ 5–8 (8 nur floor_mats) im 7. Wert, Koordinaten; Speichern → vacuum_set_carpet_area mit allen Teppichen', async () => {
  const { k, d } = await teppiche({ vac: { capabilities: VOLL_CAPS().concat(['carpet_type', 'floor_mats']) } });
  assert.equal(werkzeug(k, 'carpets').disabled, false);
  assert.equal(k.karte._map._mode, 'draw-rect');
  assert.equal(feldE(k, 'edit-kind'), null, 'nur eine Art: kein Auswahlfeld');
  eintrag(k, 'carpets', 0).click();
  assert.equal(wert(k, 'edit-x0'), 100);
  tippen(k, feldE(k, 'edit-x0'), 150);
  assert.deepEqual(optionen(feldE(k, 'carpet-type')), ['5', '6', '7', '8']);
  waehle(k, feldE(k, 'carpet-type'), 5);
  $d(k.u, '[data-action="edit-add"]').click();
  assert.equal(eintrag(k, 'carpets', 2).getAttribute('data-state'), 'new');
  assert.equal(feldE(k, 'edit-ellipse').value, '0');
  waehle(k, feldE(k, 'edit-ellipse'), 1);
  waehle(k, feldE(k, 'carpet-type'), 8);
  assert.equal(feldE(k, 'carpet-cleaning'), null, 'neuer Teppich: Reinigung erst nach dem Speichern');
  assert.match($d(k.u, '[data-panel="carpets"]').textContent, /Reinigung lässt sich nach dem Speichern einstellen/);
  assert.ok(k.karte._map._layers.get('editor').group.querySelector('ellipse'), 'runder Teppich als Ellipse');
  const neu = roh(k.karte._mapEdit.lists().carpets[2]);
  $d(k.u, '[data-action="save"]').click();
  assert.match(d.shadowRoot.textContent, /Teppiche: 1 neu, 1 geändert, 0 gelöscht/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_carpet_area']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', carpets: [[150, 100, 500, 400, 4, 0, 5], [600, 600, 900, 800, 5, 1, 5], neu], deleted_carpets: [[-200, -200, 0, 0]] });
  assert.deepEqual(neu.slice(4), [-1, 1, 8], 'neu: id −1, rund, Bodenmatte');
  // Ohne floor_mats kein Typ 8, ohne carpet_type kein Typfeld.
  const ohne = await teppiche({ vac: { capabilities: VOLL_CAPS().concat(['carpet_type']) } });
  eintrag(ohne.k, 'carpets', 0).click();
  assert.deepEqual(optionen(feldE(ohne.k, 'carpet-type')), ['5', '6', '7']);
  const keinTyp = await teppiche();
  eintrag(keinTyp.k, 'carpets', 0).click();
  assert.equal(feldE(keinTyp.k, 'carpet-type'), null);
});

test('EDI-05 Erkannte Teppiche: nur Typ, Reinigung und Ausblenden; gelöschte ein-/ausblenden; Typ → set_carpet_type, Reinigung → set_custom_carpet_cleaning', async () => {
  const { k, d } = await teppiche({ vac: { capabilities: VOLL_CAPS().concat(['carpet_type']) } });
  const erkannt = $d(k.u, '[data-carpet-detected="0"]');
  assert.match(erkannt.getAttribute('aria-label'), /Erkannter Teppich 1/);
  erkannt.click();
  assert.equal(feldE(k, 'edit-x0'), null, 'Form gehört dem Gerät: keine Koordinaten');
  assert.equal($d(k.u, '[data-action="edit-remove"]'), null);
  waehle(k, feldE(k, 'carpet-type'), 6);
  assert.deepEqual(optionen(feldE(k, 'carpet-cleaning')), ['-1', '1', '2', '3', '5', '6'], 'Optionen der Teppich-Reinigung des Geräts (select carpet_cleaning)');
  waehle(k, feldE(k, 'carpet-cleaning'), 5);
  assert.equal($d(k.u, '[data-field="carpet-pref-clean_carpets_first"]'), null, 'Vorlieben nur mit carpet_cleanset_v3');
  $d(k.u, '[data-action="carpet-hide"]').click();
  assert.match($d(k.u, '[data-carpet-detected="0"]').getAttribute('aria-label'), /ausgeblendet/);
  // Gelöschte einblenden: Liste mit Wieder-Einblenden.
  const umschalter = $d(k.u, '[data-action="carpet-deleted-toggle"]');
  assert.equal(umschalter.getAttribute('aria-pressed'), 'false');
  assert.equal($d(k.u, '[data-carpet-deleted="0"]'), null);
  umschalter.click();
  assert.equal($d(k.u, '[data-action="carpet-deleted-toggle"]').getAttribute('aria-pressed'), 'true');
  assert.ok($d(k.u, '[data-carpet-deleted="0"]') && $d(k.u, '[data-carpet-deleted="1"]'));
  $d(k.u, '[data-carpet-deleted="0"]').querySelector('[data-action="carpet-unhide"]').click();
  assert.equal($d(k.u, '[data-carpet-deleted="1"]'), null);
  $d(k.u, '[data-action="save"]').click();
  const text = d.shadowRoot.textContent;
  assert.match(text, /Erkannter Teppich 1: Typ Teppich kurzflorig/);
  assert.match(text, /Erkannter Teppich 1: Reinigung /);
  assert.match(text, /Erkannter Teppich 1: ausgeblendet/);
  assert.match(text, /1 gelöschter Teppich wieder eingeblendet/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_carpet_area', 'vacuum_set_carpet_type', 'vacuum_set_custom_carpet_cleaning']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', carpets: [[100, 100, 500, 400, 4, 0, 6], [600, 600, 900, 800, 5, 1, 5]], deleted_carpets: [[1200, 100, 1400, 300]] }, 'eigene unverändert mit');
  assert.deepEqual(roh(k.haus.rufe[2].data), { entity_id: 'vacuum.robo', id: [11], object_type: [0], carpet_type: [6] });
  assert.deepEqual(roh(k.haus.rufe[3].data), { entity_id: 'vacuum.robo', id: [11], object_type: [0], carpet_cleaning: [5] });
  // carpet_cleanset_v3: Vorlieben als Schalter, als Namen gesendet.
  const v3 = await teppiche({ vac: { capabilities: VOLL_CAPS().concat(['carpet_cleanset_v3']) } });
  eintrag(v3.k, 'carpets', 1).click();
  assert.deepEqual(optionen(feldE(v3.k, 'carpet-cleaning')), ['-1', '1', '2', '3', '5', '6']);
  $d(v3.k.u, '[data-field="carpet-pref-intensive_carpet_cleaning"]').click();
  $d(v3.k.u, '[data-action="save"]').click();
  $d(v3.k.u, '[data-action="confirm"]').click();
  await v3.k.sicherungFertig();
  assert.deepEqual(roh(v3.k.haus.rufe.at(-1).data), { entity_id: 'vacuum.robo', id: [5], object_type: [1], carpet_cleaning: [2], carpet_preferences: [['intensive_carpet_cleaning']] });
});

test('EDI-05 Teppiche gesperrt während einer Aufgabe: Hinweis, Hinzufügen/Felder aus, Ziehen ohne Wirkung; ohne Bearbeitungsdaten Werkzeug gesperrt', async () => {
  const { k, d } = await teppiche({ zustand: 'cleaning' });
  assert.match($d(k.u, '[data-panel="carpets"]').textContent, /Gesperrt, solange eine Aufgabe läuft/);
  assert.equal($d(k.u, '[data-action="edit-add"]').disabled, true);
  eintrag(k, 'carpets', 0).click();
  assert.equal(feldE(k, 'edit-x0').disabled, true);
  const c = k.karte._mapCentre();
  zieh(k, 'start', c, c);
  zieh(k, 'end', c, { x: c.x + 3000, y: c.y + 3000 });
  assert.equal(k.karte._mapEdit.dirty(), false);
  assert.ok(d);
  const ohne = aufbau();
  werkzeuge(ohne);
  stift(ohne).click();
  assert.equal(werkzeug(ohne, 'carpets').disabled, true, 'ohne Teppich-IDs gesperrt');
});

// ── Task 9: Möbel und Zielpunkte (EDI-05) ───────────────────────────────────

async function mitDaten(name, mehr = {}, daten = {}) {
  const k = aufbau(Object.assign({ bild: true, abruf: (url) => (/saved=1/.test(url) ? { json: bearbeitungsdaten(daten) } : { status: 404 }) }, mehr));
  await mikro();
  stift(k).click();
  await mikro(); await mikro(); await mikro();
  werkzeug(k, name).click();
  return k;
}

test('EDI-05 Möbel: nur erlaubte Typen wie map.py set_furnitures (furnitures_v2/v3, extended_furnitures, pet_furniture)', () => {
  const typen = (caps) => roh(aufbau({ vac: { capabilities: caps } }).I.furnitureTypes(aufbau({ vac: { capabilities: caps } }).karte._model()));
  const basis = VOLL_CAPS().filter((c) => !['furnitures_v2', 'furnitures_v3', 'extended_furnitures', 'pet_furniture'].includes(c));
  const bis = (n) => Array.from({ length: n }, (_, i) => i + 1);
  assert.deepEqual(typen(basis.concat(['furnitures_v2', 'extended_furnitures', 'pet_furniture'])), bis(26).concat([29, 30, 31]));
  assert.deepEqual(typen(basis.concat(['furnitures_v2', 'pet_furniture'])), [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 25], 'ohne erweiterte Möbel: >13 außer 25 und 8 fallen weg');
  assert.deepEqual(typen(basis.concat(['furnitures_v3'])), [1, 2, 3, 4, 5, 6, 7, 9, 25], 'ohne Haustier-Möbel keine 10–13');
  assert.deepEqual(typen(basis), bis(9), 'Möbel v1: nur Typen unter 10');
});

test('EDI-05 Möbel: vollständige Liste mit 11 Werten, neu id −1, drehen in 15°, skalieren, Raum über roomAt; Speichern → vacuum_set_furniture', async () => {
  const k = await mitDaten('furniture');
  const d = dialogVon(k.u);
  assert.equal(k.karte._map._mode, 'draw-rect');
  const sofa = eintrag(k, 'furnitures', 0);
  assert.match(sofa.getAttribute('aria-label'), /Zweisitzer-Sofa 1, 0,8 × 0,6 m/);
  sofa.click();
  assert.match($d(k.u, '[data-panel="furniture"]').textContent, /Winkel: 90°/);
  $d(k.u, '[data-action="furniture-rotate-right"]').click();
  $d(k.u, '[data-action="furniture-rotate-left"]').click();
  $d(k.u, '[data-action="furniture-rotate-left"]').click();
  assert.match($d(k.u, '[data-panel="furniture"]').textContent, /Winkel: 75°/);
  tippen(k, feldE(k, 'edit-x'), -4252);
  tippen(k, feldE(k, 'edit-y'), -8496);
  assert.match($d(k.u, '[data-panel="furniture"]').textContent, /Raum: Bibliothek/, 'Raum über roomAt');
  $d(k.u, '[data-action="furniture-larger"]').click();
  assert.equal(wert(k, 'edit-width'), 880);
  assert.equal(wert(k, 'edit-height'), 660);
  assert.equal(wert(k, 'edit-x'), -4252, 'skalieren um die Mitte');
  // Neues Möbel: Typ wählen, platzieren.
  assert.ok(optionen(feldE(k, 'furniture-new-type')).includes('31'));
  waehle(k, feldE(k, 'furniture-new-type'), 11);
  $d(k.u, '[data-action="edit-add"]').click();
  assert.match(eintrag(k, 'furnitures', 2).getAttribute('aria-label'), /Haustierbett 3, 0,8 × 0,8 m, neu/);
  assert.equal(feldE(k, 'furniture-type').value, '11');
  const neu = roh(k.karte._mapEdit.lists().furnitures[2]);
  assert.equal(neu.length, 11);
  assert.deepEqual([neu[0], neu[1], neu[3], neu[4], neu[7], neu[8], neu[9], neu[10]], [-1, 11, 800, 800, 0, 1, 0, 1]);
  assert.equal(neu[2], k.karte._map.roomAt({ x: neu[5], y: neu[6] }));
  $d(k.u, '[data-action="save"]').click();
  assert.match(d.shadowRoot.textContent, /Möbel: 1 neu, 1 geändert, 0 gelöscht/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_furniture']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', furnitures: [[3, 4, 5, 880, 660, -4252, -8496, 75, 1, 1, 1], [6, 14, 2, 400, 400, 1500, 200, 0, 1.2, 0, 0], neu] }, 'vollständige Liste, unveränderte mit geändert 0');
  // Ohne erweiterte Möbel: kein Kühlschrank zur Wahl.
  const k2 = await mitDaten('furniture', { vac: { capabilities: VOLL_CAPS().filter((c) => c !== 'extended_furnitures') } });
  assert.ok(!optionen(feldE(k2, 'furniture-new-type')).includes('14'));
  // Fläche ziehen verschiebt (gedrehtes Möbel getroffen über seine Ecken).
  const m = k2.karte._mapEdit;
  zieh(k2, 'start', { x: 300, y: 400 }, { x: 300, y: 400 });
  zieh(k2, 'end', { x: 300, y: 400 }, { x: 800, y: 900 });
  assert.deepEqual(roh(m.lists().furnitures[0]).slice(5, 7), [800, 900]);
});

test('EDI-05 Zielpunkte: nur mit cruising, höchstens 20, nur auf befahrbarer Fläche (passable !== false), gesperrt während einer Aufgabe → vacuum_set_predefined_points', async () => {
  const neunzehn = {};
  for (let i = 1; i <= 19; i++) neunzehn[i] = { x: -4000 + i * 10, y: -8000 };
  const k = aufbau({ bild: true, cam: { predefined_points: neunzehn } });
  k.karte._map.passable = (p) => (p.x > 100000 ? false : null);
  const d = werkzeugOffen(k, 'points');
  await mikro(); await mikro();
  assert.equal(eintrag(k, 'predefined_points', 18).getAttribute('data-state'), null);
  assert.match(eintrag(k, 'predefined_points', 0).getAttribute('aria-label'), /Zielpunkt 1, \(-3990, -8000\)/);
  // Außerhalb: abgelehnt, Wert bleibt.
  eintrag(k, 'predefined_points', 0).click();
  tippen(k, feldE(k, 'edit-x'), 200000);
  assert.equal(wert(k, 'edit-x'), -3990);
  assert.match($d(k.u, '[data-panel="points"]').textContent, /nicht auf befahrbarer Fläche/);
  tippeAuf(k, { x: 200000, y: 0 });
  assert.equal(k.karte._mapEdit.lists().predefined_points.length, 19, 'Tipp neben die Fläche legt nichts an');
  // Tipp auf freie Karte (weiter als 44 px von den Punkten) legt einen Punkt an; danach ist die Grenze 20 erreicht.
  tippeAuf(k, { x: 2585, y: -6349 });
  assert.equal(eintrag(k, 'predefined_points', 19).getAttribute('data-state'), 'new');
  assert.equal($d(k.u, '[data-action="edit-add"]').disabled, true);
  assert.match(d.shadowRoot.textContent, /Höchstens 20 Zielpunkte/);
  tippeAuf(k, { x: 1229, y: -981 });
  assert.equal(k.karte._mapEdit.lists().predefined_points.length, 20);
  $d(k.u, '[data-action="save"]').click();
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_predefined_points']);
  const punkte = roh(k.haus.rufe[1].data.points);
  assert.equal(punkte.length, 20);
  assert.deepEqual(punkte.at(-1), [2585, -6349]);
  // Laufende Aufgabe: gesperrt.
  const k2 = aufbau({ bild: true, zustand: 'cleaning' });
  werkzeugOffen(k2, 'points');
  await mikro(); await mikro();
  assert.match($d(k2.u, '[data-panel="points"]').textContent, /Gesperrt, solange eine Aufgabe läuft/);
  assert.equal($d(k2.u, '[data-action="edit-add"]').disabled, true);
  tippeAuf(k2, { x: -4252, y: -8496 });
  assert.equal(k2.karte._mapEdit.dirty(), false);
  // Ohne cruising kein Werkzeug.
  const k3 = aufbau({ vac: { capabilities: VOLL_CAPS().filter((c) => c !== 'cruising') } });
  stift(k3).click();
  assert.equal(werkzeug(k3, 'points'), null);
});

// ── Fix nach Task 9: Teppich-Reinigung entfernter Teppiche, R01-Namen ───────

test('EDI-05 Teppich erst in der Reinigung geändert, dann entfernt: kein vacuum_set_custom_carpet_cleaning für die alte ID, auch nicht für neue (−1)', async () => {
  const { k, d } = await teppiche();
  eintrag(k, 'carpets', 1).click();
  waehle(k, feldE(k, 'carpet-cleaning'), 3);
  assert.deepEqual(roh(k.karte._mapEdit.lists().carpet_cleanings[1]), ['1:5', 5, 1, 3, null]);
  $d(k.u, '[data-action="edit-remove"]').click();
  $d(k.u, '[data-action="edit-add"]').click();
  assert.deepEqual(roh(k.karte._mapEdit.lists().carpets.map((e) => e[4])), [4, -1]);
  $d(k.u, '[data-action="save"]').click();
  assert.doesNotMatch(d.shadowRoot.textContent, /Reinigung/, 'keine Bestätigungszeile für den entfernten Teppich');
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_carpet_area']);
  // Rein: ohne den Teppich in der Liste kein Aufruf; mit ihm genau seiner.
  const base = k.I.editLists(k.karte._map.current().objects, k.I.editData(bearbeitungsdaten()));
  const nach = roh(base);
  nach.carpet_cleanings[1] = ['1:5', 5, 1, 3, null];
  assert.deepEqual(roh(k.I.groupCalls('carpet_cleaning', nach, 2, base)), [{ service: 'vacuum_set_custom_carpet_cleaning', data: { id: [5], object_type: [1], carpet_cleaning: [3] } }]);
  nach.carpets = [nach.carpets[0], [600, 600, 900, 800, -1, 1, 5]];
  assert.deepEqual(roh(k.I.groupCalls('carpet_cleaning', nach, 2, base)), [], 'id 5 nicht mehr da (neuer Teppich −1 an ihrer Stelle)');
});

test('EDI-05 R01/R26: Wischverbotszone(n) heißen in Kartenansicht (Ebene, Farbe) und Editor gleich', () => {
  const k = aufbau();
  const de = k.I.TEXTE.de, en = k.I.TEXTE.en;
  assert.equal(de.texte.mapobj_no_mopping_areas, 'Wischverbotszonen');
  assert.equal(de.labels.no_mop, 'Wischverbotszone');
  assert.match(de.helpers.no_mop, /Wischverbotszonen/);
  for (const lang of [de, en]) {
    const alles = JSON.stringify(lang);
    assert.equal(lang.texte.kartenObj_no_mopping_areas === undefined || lang.texte.kartenObj_no_mopping_areas === lang.texte.mapobj_no_mopping_areas, true, 'Editor-Liste = Ebenenname');
    assert.equal(lang.texte.kartenEins_no_mopping_areas, lang === de ? 'Wischverbotszone' : 'No-mop zone');
    if (lang === de) assert.doesNotMatch(alles, /No-Mop/i, 'kein „No-Mop“ mehr im Deutschen');
  }
  assert.equal(en.texte.mapobj_no_mopping_areas, 'No-mop zones');
});

// ── Task 10: Wände und Türen (EDI-04) ───────────────────────────────────────

test('EDI-04 Wände: nur mit walls + Bearbeitungsdaten; je Raum verschieben, Zurücksetzen (Felder 5–8) je Wand/Raum/alle, Türen Breite/Lage → vacuum_set_walls { walls, doors, map_id }', async () => {
  // Lange Tür abseits der Wände: Fläche und Enden auf dem 400-px-Testbild getrennt greifbar.
  const k = await mitDaten('walls', {}, { doors: [[-6000, 3000, 6000, 3000, -6000, 3000, 6000, 3000, 0, 7, 1]] });
  const d = dialogVon(k.u);
  const panel = () => $d(k.u, '[data-panel="walls"]');
  assert.equal(k.karte._map._mode, 'draw-rect');
  assert.match(panel().textContent, /Anlegen und Löschen.*keinen öffentlichen Schreibweg/, 'ehrlicher Hinweis im Werkzeug');
  assert.equal($d(k.u, '[data-action="edit-add"]'), null, 'kein Hinzufügen');
  assert.deepEqual(optionen(feldE(k, 'wall-room')), ['', '1', '3'], 'Räume mit Wänden, dazu alle');
  assert.ok(eintrag(k, 'walls', 0) && eintrag(k, 'walls', 2) && eintrag(k, 'doors', 0));
  // Raum 3: nur seine Wand; sie liegt nicht auf der Ausgangslage → Zurücksetzen je Wand.
  waehle(k, feldE(k, 'wall-room'), 3);
  assert.equal(eintrag(k, 'walls', 0), null);
  eintrag(k, 'walls', 2).click();
  assert.equal(wert(k, 'edit-y0'), 900);
  assert.equal($d(k.u, '[data-action="edit-remove"]'), null, 'kein Löschen');
  $d(k.u, '[data-action="wall-reset"]').click();
  assert.deepEqual(roh(k.karte._mapEdit.lists().walls[2]), ['3', 0, 950, 600, 950, 0, 950, 600, 950, 2, 300, 900]);
  assert.equal(eintrag(k, 'walls', 2).getAttribute('data-state'), 'changed');
  assert.equal($d(k.u, '[data-action="wall-reset"]').disabled, true, 'auf Ausgangslage: nichts zurückzusetzen');
  // Raum 1: Wand verschieben (Formular und Pfeiltaste), Entf löscht nicht; Raum zurücksetzen.
  waehle(k, feldE(k, 'wall-room'), 1);
  eintrag(k, 'walls', 0).click();
  tippen(k, feldE(k, 'edit-y0'), 100);
  k.u.tasteAn(eintrag(k, 'walls', 0), 'keydown', { key: 'Delete' });
  assert.equal(k.karte._mapEdit.lists().walls.length, 3, 'Entf löscht keine Wand');
  assert.deepEqual(roh(k.karte._mapEdit.lists().walls[0]).slice(0, 5), ['1', 0, 100, 1000, 0]);
  $d(k.u, '[data-action="walls-reset-room"]').click();
  assert.deepEqual(roh(k.karte._mapEdit.lists().walls[0]).slice(0, 5), ['1', 0, 0, 1000, 0], 'Raum zurück auf Ausgangslage');
  tippen(k, feldE(k, 'edit-y1'), 50);
  // Tür: Breite über das Ende, Lage durch Verschieben der Fläche.
  waehle(k, feldE(k, 'wall-room'), '');
  eintrag(k, 'doors', 0).click();
  tippen(k, feldE(k, 'edit-x1'), 6500);
  zieh(k, 'start', { x: 0, y: 3000 }, { x: 0, y: 3000 });
  zieh(k, 'end', { x: 0, y: 3000 }, { x: 0, y: 3040 });
  assert.deepEqual(roh(k.karte._mapEdit.lists().doors[0]), [-6000, 3040, 6500, 3040, -6000, 3000, 6000, 3000, 0, 7, 1]);
  // Leere Kartenfläche ziehen legt nichts an.
  zieh(k, 'start', { x: -9000, y: -9000 }, { x: -9000, y: -9000 });
  zieh(k, 'end', { x: -9000, y: -9000 }, { x: -6000, y: -6000 });
  assert.equal(k.karte._mapEdit.lists().walls.length, 3);
  assert.equal(k.karte._mapEdit.lists().doors.length, 1);
  $d(k.u, '[data-action="save"]').click();
  assert.match(d.shadowRoot.textContent, /Wände: 0 neu, 2 geändert, 0 gelöscht/);
  assert.match(d.shadowRoot.textContent, /Türen: 0 neu, 1 geändert, 0 gelöscht/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_walls']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', map_id: 2,
    walls: { 1: [[0, 0, 1000, 50, 0, 0, 1000, 0, 1, 500, 0], [1000, 0, 1000, 800, 1000, 0, 1000, 800, 1, 1000, 400]], 3: [[0, 950, 600, 950, 0, 950, 600, 950, 2, 300, 900]] },
    doors: [[-6000, 3040, 6500, 3040, -6000, 3000, 6000, 3000, 0, 7, 1]] }, 'alle Wände je Raum und alle Türen, Anzahl gleich');
  // Alle zurücksetzen: Wände und Türen auf die Ausgangslage.
  k.u.zurueck();
  $d(k.u, '[data-action="walls-reset-all"]').click();
  assert.deepEqual(roh(k.karte._mapEdit.lists().doors[0]).slice(0, 4), [-6000, 3000, 6000, 3000]);
  assert.deepEqual(roh(k.karte._mapEdit.lists().walls[0]).slice(1, 5), [0, 0, 1000, 0]);
});

test('EDI-04 Wände: Anzahl je Raum oder der Türen geändert → Speichern gesperrt (mit Grund, auch im Dirty-Dialog); laufende Aufgabe sperrt; ohne Daten/walls kein Werkzeug', async () => {
  const k = await mitDaten('walls');
  const m = k.karte._mapEdit;
  m.edit('walls').walls.pop();
  m.changed();
  assert.equal($d(k.u, '[data-action="save"]').disabled, true);
  assert.match($d(k.u, '[data-panel="walls"]').textContent, /Anzahl der Wände je Raum und der Türen muss gleich bleiben/);
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  assert.equal($d(k.u, '[data-action="save"]').disabled, true, 'auch „Speichern“ im Dirty-Dialog');
  $d(k.u, '[data-action="keep"]').click();
  k.u.zurueck();
  m.discard();
  m.edit('walls').doors.push([1, 2, 3, 4, 1, 2, 3, 4, 0, 99, 0]);
  m.changed();
  assert.equal($d(k.u, '[data-action="save"]').disabled, true, 'Türen ebenso');
  m.discard();
  assert.equal($d(k.u, '[data-action="save"]').disabled, true, 'nichts offen');
  assert.deepEqual(k.haus.rufe.filter((r) => r.service === 'vacuum_set_walls'), []);
  // Laufende Aufgabe: Hinweis, Felder aus, Ziehen ohne Wirkung.
  const k2 = await mitDaten('walls', { zustand: 'cleaning' });
  assert.match($d(k2.u, '[data-panel="walls"]').textContent, /Gesperrt, solange eine Aufgabe läuft/);
  eintrag(k2, 'walls', 0).click();
  assert.equal(feldE(k2, 'edit-x0').disabled, true);
  assert.equal($d(k2.u, '[data-action="walls-reset-all"]').disabled, true);
  zieh(k2, 'start', { x: 500, y: 0 }, { x: 500, y: 0 });
  zieh(k2, 'end', { x: 500, y: 0 }, { x: 500, y: 300 });
  assert.equal(k2.karte._mapEdit.dirty(), false);
  // Ohne Bearbeitungsdaten gesperrt, ohne Fähigkeit walls gar nicht da.
  const k3 = aufbau();
  stift(k3).click();
  assert.equal(werkzeug(k3, 'walls').disabled, true);
  const k4 = aufbau({ vac: { capabilities: VOLL_CAPS().filter((c) => c !== 'walls') } });
  stift(k4).click();
  assert.equal(werkzeug(k4, 'walls'), null);
});

// ── Task 11: Schnellbearbeitung (EDI-06) ────────────────────────────────────

/** Startkarte mit Teppichen/Möbeln in den Attributen, die zu den Bearbeitungsdaten passen. */
function schnell(mehr = {}) {
  const ecken = (x0, y0, x1, y1) => ({ x0, y0, x1: x1, y1: y0, x2: x1, y2: y1, x3: x0, y3: y1, angle: null });
  return aufbau(Object.assign({ bild: true, abruf: (url) => (/saved=1/.test(url) ? { json: bearbeitungsdaten() } : { status: 404 }),
    cam: { carpets: [ecken(100, 100, 500, 400), ecken(600, 600, 900, 800)], detected_carpets: [ecken(1200, 100, 1400, 300)],
      furnitures: [{ x: 1500, y: 200, width: 400, height: 400, type: 'Refrigerator', furniture_id: 6, angle: 0 }] } }, mehr));
}
const tippeKarte = (k, robot) => { const m = k.karte._map; m._emitTap(m.toScreen(m.toImage(robot))); };
const blase = (k) => k.karte._map.bubble;

test('EDI-06 Blase bei Teppich/Möbel trägt „Bearbeiten“ (Aktionsplatz) und startet die Sitzung mit dem gewählten Objekt im passenden Werkzeug; gleicher Rahmen', async () => {
  const k = schnell();
  await mikro(); await mikro();
  const m = k.karte._map;
  assert.equal(m._mode, 'view');
  tippeKarte(k, { x: 700, y: 700 });
  assert.equal(blase(k).hidden, false, 'Blase am Teppich');
  assert.equal(blase(k).getAttribute('data-object-layer'), 'carpets');
  assert.match(blase(k).textContent, /Teppich/);
  const knopf = blase(k).querySelector('[data-action="object-map-edit"]');
  assert.ok(knopf, 'Aktionsplatz „Bearbeiten“');
  assert.equal(knopf.getAttribute('aria-label'), 'Bearbeiten');
  knopf.click();
  assert.equal(blase(k).hidden, true);
  const d = dialogVon(k.u);
  assert.equal(d._views.at(-1).kind, 'editor');
  await mikro(); await mikro(); await mikro();
  assert.equal(werkzeug(k, 'carpets').getAttribute('aria-pressed'), 'true');
  assert.equal(eintrag(k, 'carpets', 1).getAttribute('aria-pressed'), 'true', 'gewählter Teppich');
  assert.equal(wert(k, 'edit-x0'), 600);
  tippen(k, feldE(k, 'edit-x0'), 650);
  $d(k.u, '[data-action="save"]').click();
  assert.match(d.shadowRoot.textContent, /Teppiche: 0 neu, 1 geändert, 0 gelöscht/);
  assert.match(d.shadowRoot.textContent, /Sicherung der Karte erstellt/, 'Sicherung wie im Bearbeitungsmodus');
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_carpet_area']);
  k.u.zurueck();
  assert.ok($d(k.u, '[data-action="undo"]'), 'Rückgängig wie im Bearbeitungsmodus');
  // Möbel und erkannter Teppich.
  const k2 = schnell();
  await mikro(); await mikro();
  tippeKarte(k2, { x: 1500, y: 200 });
  assert.equal(blase(k2).getAttribute('data-object-layer'), 'furnitures');
  assert.match(blase(k2).textContent, /Kühlschrank/);
  blase(k2).querySelector('[data-action="object-map-edit"]').click();
  await mikro(); await mikro(); await mikro();
  assert.equal(werkzeug(k2, 'furniture').getAttribute('aria-pressed'), 'true');
  assert.equal(eintrag(k2, 'furnitures', 1).getAttribute('aria-pressed'), 'true', 'Möbel über furniture_id');
  const k3 = schnell();
  await mikro(); await mikro();
  tippeKarte(k3, { x: 1250, y: 150 });
  assert.equal(blase(k3).getAttribute('data-object-layer'), 'detected_carpets');
  blase(k3).querySelector('[data-action="object-map-edit"]').click();
  await mikro(); await mikro(); await mikro();
  assert.equal($d(k3.u, '[data-carpet-detected="0"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(k3.haus.rufe, []);
  // Daneben (kein Objekt): keine Blase.
  const k4 = schnell();
  await mikro();
  tippeKarte(k4, { x: -20000, y: -20000 });
  assert.equal(blase(k4).hidden, true);
});

test('EDI-06 keine Schnellbearbeitung bei hidden_card_objects map_editor, ohne can("map_edit") und im Bearbeitungsmodus', async () => {
  const aus = schnell({ config: { hidden_card_objects: ['map_editor'] } });
  await mikro();
  tippeKarte(aus, { x: 700, y: 700 });
  assert.equal(blase(aus).hidden, true);
  const ohne = schnell();
  ohne.haus.services.dreame_vacuum = { vacuum_select_map: {} };
  ohne.karte.hass = ohne.haus.setze({});
  assert.equal(ohne.karte._model().can('map_edit'), false);
  tippeKarte(ohne, { x: 700, y: 700 });
  assert.equal(blase(ohne).hidden, true);
  const modus = schnell();
  await mikro();
  stift(modus).click();
  await mikro(); await mikro();
  tippeKarte(modus, { x: 700, y: 700 });
  assert.equal(blase(modus).hidden, true, 'im Bearbeitungsmodus wählt das Werkzeug, keine Blase');
  // Hindernis-Blase (MAP-04) bleibt unverändert.
  assert.equal(typeof modus.karte._map.addObstacleAction, 'function');
});

// ── Task 12: WLAN-Karte und Router (EDI-07) ─────────────────────────────────

const wlanBild = (k) => k.karte._map._layers.get('editor').group.querySelector('image');

test('EDI-07 WLAN-Karte: Umschalter Reinigungs-/WLAN-Karte, Bild der WLAN-Kamera kalibriert über der Karte, allgemeine Legende; Router tippen/ziehen nur auf Fläche → vacuum_set_router_position { x, y }, Rückgängig', async () => {
  const k = await mitDaten('wifi');
  const d = dialogVon(k.u);
  const panel = () => $d(k.u, '[data-panel="wifi"]');
  k.karte._map.passable = (p) => (p.x > 100000 ? false : null);
  assert.equal(k.karte._map._mode, 'draw-rect');
  assert.equal($d(k.u, '[data-wifi-view="wifi"]').getAttribute('aria-pressed'), 'true', 'WLAN-Karte zuerst');
  assert.equal($d(k.u, '[data-wifi-view="cleaning"]').getAttribute('aria-pressed'), 'false');
  assert.match($d(k.u, '[data-wifi-view="cleaning"]').textContent, /Reinigungskarte/);
  await mikro(); await mikro();
  const bild = wlanBild(k);
  assert.ok(bild, 'WLAN-Bild in der Ebene editor');
  assert.match(bild.getAttribute('href'), /\/api\/camera_proxy\/camera\.robo_wifi_map_1\?token=testtoken/);
  assert.equal(bild.getAttribute('width'), '1444');
  assert.match(bild.getAttribute('transform'), /^matrix\(/);
  assert.match(panel().textContent, /Signalstärke/);
  for (const stufe of ['Ausgezeichnet', 'Gut', 'Schwach', 'Sehr schwach', 'Nicht erreicht']) assert.ok(panel().textContent.includes(stufe), stufe);
  assert.match(panel().textContent, /Allgemeine Legende/);
  $d(k.u, '[data-wifi-view="cleaning"]').click();
  assert.equal(wlanBild(k), null, 'Reinigungskarte: kein WLAN-Bild');
  assert.equal($d(k.u, '.wifi-legend'), null);
  $d(k.u, '[data-wifi-view="wifi"]').click();
  // Router: Liste, Tipp neben die Fläche abgelehnt, Tipp auf Fläche setzt, Ziehen verschiebt.
  assert.match(eintrag(k, 'router', 0).getAttribute('aria-label'), /Router 1, \(2560, -3063\)/);
  assert.equal($d(k.u, '[data-action="edit-add"]'), null, 'ein Router: kein Hinzufügen');
  tippeAuf(k, { x: 200000, y: 0 });
  assert.deepEqual(roh(k.karte._mapEdit.lists().router), [[2560, -3063]]);
  assert.match(panel().textContent, /nicht auf befahrbarer Fläche/);
  tippeAuf(k, { x: 1000, y: -2000 });
  assert.deepEqual(roh(k.karte._mapEdit.lists().router), [[1000, -2000]]);
  assert.equal(eintrag(k, 'router', 0).getAttribute('data-state'), 'changed');
  zieh(k, 'start', { x: 1000, y: -2000 }, { x: 1000, y: -2000 });
  zieh(k, 'end', { x: 1000, y: -2000 }, { x: 200000, y: -2100 });
  assert.deepEqual(roh(k.karte._mapEdit.lists().router), [[1000, -2000]], 'Ziehen neben die Fläche abgelehnt');
  zieh(k, 'start', { x: 1000, y: -2000 }, { x: 1000, y: -2000 });
  zieh(k, 'end', { x: 1000, y: -2000 }, { x: 1200, y: -2100 });
  assert.deepEqual(roh(k.karte._mapEdit.lists().router), [[1200, -2100]]);
  assert.equal(eintrag(k, 'router', 0).getAttribute('aria-pressed'), 'true', 'gezogener Router ist gewählt: Formular offen');
  tippen(k, feldE(k, 'edit-x'), 1300);
  $d(k.u, '[data-action="save"]').click();
  assert.match(d.shadowRoot.textContent, /Router: neue Lage \(1300, -2100\)/);
  $d(k.u, '[data-action="confirm"]').click();
  await k.sicherungFertig();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_set_router_position']);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', x: 1300, y: -2100 });
  k.u.zurueck();
  $d(k.u, '[data-action="undo"]').click();
  $d(k.u, '[data-action="confirm"]').click();
  await mikro(); await mikro();
  assert.deepEqual(roh(k.haus.rufe.at(-1)), { domain: 'dreame_vacuum', service: 'vacuum_set_router_position', data: { entity_id: 'vacuum.robo', x: 2560, y: -3063 } });
});

test('EDI-07 Legende aus wifi_map_data (Anteile je Stufe); gesperrt während einer Aufgabe; ohne Router-Position Hinweis; ohne wifi_map kein Werkzeug', async () => {
  const k = await mitDaten('wifi', {}, { wifi_map_data: { size: [0, 0, 0, 0, 4, 1, 50, 0], data: { 14: [0, 0, 3], 10: [3, 0, 1] } } });
  const text = $d(k.u, '[data-panel="wifi"]').textContent;
  assert.match(text, /Ausgezeichnet: 75 %/);
  assert.match(text, /Nicht erreicht: 25 %/);
  assert.match(text, /Gut: 0 %/);
  assert.doesNotMatch(text, /Allgemeine Legende/);
  const k2 = await mitDaten('wifi', { zustand: 'cleaning' });
  assert.match($d(k2.u, '[data-panel="wifi"]').textContent, /Gesperrt, solange eine Aufgabe läuft/);
  tippeAuf(k2, { x: 1000, y: -2000 });
  assert.equal(k2.karte._mapEdit.dirty(), false);
  eintrag(k2, 'router', 0).click();
  assert.equal(feldE(k2, 'edit-x').disabled, true);
  const k3 = await mitDaten('wifi', { cam: { router_position: null } });
  assert.match($d(k3.u, '[data-panel="wifi"]').textContent, /keine Router-Position/);
  tippeAuf(k3, { x: 1000, y: -2000 });
  assert.equal(k3.karte._mapEdit.dirty(), false);
  const k4 = aufbau({ vac: { capabilities: VOLL_CAPS().filter((c) => c !== 'wifi_map') } });
  stift(k4).click();
  assert.equal(werkzeug(k4, 'wifi'), null);
  assert.deepEqual([k, k2, k3].flatMap((x) => x.haus.rufe), []);
});

// ── Checkpoint C (nach Task 7–12): jede Zeile der Schreibweg-Tabellen mit Test ──

test('ALL-13 Karte anlegen (Kartierungsfahrt): nach Bestätigung erst Sicherung der aktiven Karte, dann vacuum_call_action { key: start_mapping }', async () => {
  const k = aufbau({ vac: { mapping_available: true } });
  verwaltung(k);
  $d(k.u, '[data-action="start_mapping"]').click();
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Roboter fährt/);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="confirm"]').click();
  await mikro();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_backup_map', data: { entity_id: 'vacuum.robo', map_id: 3 } }]);
  await k.sicherungFertig();
  assert.deepEqual(roh(k.haus.rufe.at(-1)), { domain: 'dreame_vacuum', service: 'vacuum_call_action', data: { entity_id: 'vacuum.robo', key: 'start_mapping' } });
});

/** Spec „Schreibwege“: Tabellenzeile → Dienst (bzw. Schlüssel) → Test, der Dienst und Datenform prüft. */
const SCHREIBWEGE = [
  ['Multi-Floor an/aus', "key: 'multi_floor_map'", 'ALL-10 Multi-Floor-Zeile'],
  ['Karte anlegen', "key: 'start_mapping'", 'ALL-13 Karte anlegen (Kartierungsfahrt)'],
  ['Schnellkartierung', "key: 'start_fast_mapping'", 'ALL-13 Neue Karte: start_mapping'],
  ['Umbenennen', 'vacuum_rename_map', 'EDI-01 Umbenennen'],
  ['Wählen', 'vacuum_select_map', 'EDI-01 Wählen nur über MapView.selectMap'],
  ['Löschen', 'vacuum_delete_map', 'EDI-01 Löschen'],
  ['Temporäre Karte speichern', 'vacuum_save_temporary_map', 'ALL-13 Temporäre Karte'],
  ['Temporäre Karte verwerfen', 'vacuum_discard_temporary_map', 'ALL-13 Temporäre Karte'],
  ['Durch temporäre ersetzen', 'vacuum_replace_temporary_map', 'ALL-13 Temporäre Karte'],
  ['Karte neu anfordern', 'vacuum_request_map', 'ALL-13 Temporäre Karte'],
  ['Eigener Name', 'vacuum_rename_segment', 'EDI-03 Raumlisten und Dienstformen'],
  ['Typ', 'vacuum_set_segment_type', 'EDI-03 Raumlisten und Dienstformen'],
  ['Sichtbarkeit', 'vacuum_set_hidden_segments', 'EDI-03 Raumlisten und Dienstformen'],
  ['Bodenmaterial, Holzrichtung', 'vacuum_set_floor_material', 'EDI-03 Raumlisten und Dienstformen'],
  ['Teilen', 'vacuum_split_segments', 'EDI-03 Teilen: Linie per zwei Kartenpunkten'],
  ['Zusammenführen', 'vacuum_merge_segments', 'EDI-03 Zusammenführen'],
  ['Virtuelle Wände, No-Go, Wischverbot', 'vacuum_set_restricted_zone', 'EDI-05 Zonen: + legt ein Rechteck'],
  ['Schwellen, Rampen', 'vacuum_set_threshold', 'EDI-05 Schwellen und Rampen'],
  ['Virtuelle Schwellen', 'vacuum_set_virtual_threshold', 'EDI-05 Geräte nur mit virtual_thresholds'],
  ['Vorhänge', 'vacuum_set_curtain', 'EDI-02 Werkzeugleiste je editCaps'],
  ['Teppiche (Fläche, rund, gelöscht)', 'vacuum_set_carpet_area', 'EDI-05 Teppiche: bestehende IDs bleiben'],
  ['Teppichart', 'vacuum_set_carpet_type', 'EDI-05 Erkannte Teppiche'],
  ['Teppich-Reinigung', 'vacuum_set_custom_carpet_cleaning', 'EDI-05 Erkannte Teppiche'],
  ['Möbel', 'vacuum_set_furniture', 'EDI-05 Möbel: vollständige Liste'],
  ['Zielpunkte', 'vacuum_set_predefined_points', 'EDI-05 Zielpunkte'],
  ['Wände und Türen', 'vacuum_set_walls', 'EDI-04 Wände: nur mit walls'],
  ['WLAN-Karte Router', 'vacuum_set_router_position', 'EDI-07 WLAN-Karte'],
  ['Sicherung (Sicherheitsrahmen 2)', 'vacuum_backup_map', 'EDI-02 erste Speicherung'],
];

test('EDI-02 Checkpoint C: jede Zeile der Schreibweg-Tabellen hat einen Test mit Dienstname und Datenform; jeder Kartendienst steht in der Tabelle', () => {
  const quelle = require('node:fs').readFileSync(__filename, 'utf8');
  const tests = Array.from(quelle.matchAll(/^test\('([^']*)'/gm), (m) => ({ i: m.index, name: m[1] }));
  const rumpf = (name) => {
    const n = tests.findIndex((t) => t.name.startsWith(name));
    assert.ok(n >= 0, 'Test fehlt: ' + name);
    return quelle.slice(tests[n].i, n + 1 < tests.length ? tests[n + 1].i : quelle.length);
  };
  for (const [zeile, dienst, name] of SCHREIBWEGE) {
    const b = rumpf(name);
    const wort = dienst.startsWith('key:') ? dienst : "'" + dienst + "'";
    // Dienst und seine Daten in derselben Prüfung: { service: '<dienst>', data: {…} } bzw. ein Datenvergleich im selben Test.
    assert.ok(b.includes(wort) || (dienst.startsWith('vacuum_') && b.includes(dienst)), zeile + ': ' + dienst + ' nicht in „' + name + '“');
    assert.match(b, /data(: \{|\))|\.data\b|data: \{/, zeile + ': keine Datenform in „' + name + '“');
  }
  const gedeckt = new Set(SCHREIBWEGE.map(([, d]) => (d.startsWith('key:') ? (d.includes('multi_floor') ? 'vacuum_set_property' : 'vacuum_call_action') : d)));
  for (const d of KARTENDIENSTE.filter((x) => !MAP_BACKUP_DIENSTE.includes(x))) assert.ok(gedeckt.has(d), 'Kartendienst ohne Tabellenzeile: ' + d);
  const sicherung = require('node:fs').readFileSync(require('node:path').join(__dirname, 'kartensicherung.test.js'), 'utf8');
  for (const d of MAP_BACKUP_DIENSTE) assert.match(sicherung, new RegExp("service: '" + d + "', data: \\{"), 'map-backup prüft ' + d + ' mit Datenform');
});

// ── Task 13: Befunde der Browserprüfung (render.py) ─────────────────────────

test('EDI-02 Dialog-Stile: [hidden] bleibt im Dialog verborgen (leere Kartenblase im Bearbeitungsmodus), Symbole vor dem Text, gewählter Eintrag sichtbar', () => {
  const { DIALOG_STYLES } = aufbau().I;
  assert.match(DIALOG_STYLES, /\[hidden\] \{\s*display: none !important;/, 'die Karte bringt ihre Blase mit hidden in den Dialog');
  assert.match(DIALOG_STYLES, /\.edit-tools \.busch-ui-action ha-icon,[^{]*\.map-entry \.busch-ui-action ha-icon[^{]*\{\s*order: -1;/, 'Symbol vor dem Text');
  assert.match(DIALOG_STYLES, /\.edit-item\[aria-pressed=true\] \{[^}]*outline/, 'gewählter Eintrag nicht nur über aria-pressed');
});

test('EDI-04 lange Wandlisten: mehr als 12 Wände → Liste startet beim ersten Raum; eine gewählte Wand schaltet auf ihren Raum; „Alle Räume“ bleibt wählbar', async () => {
  const wand = (x) => [x, 0, x + 500, 0, x, 0, x + 500, 0, 1, x + 250, 0];
  const k = await mitDaten('walls', {}, { walls: { 1: [0, 1, 2, 3, 4, 5, 6].map((i) => wand(i * 600)), 3: [0, 1, 2, 3, 4, 5].map((i) => wand(-5000 - i * 600)) } });
  assert.equal(feldE(k, 'wall-room').value, '1', 'erster Raum statt aller 13 Wände');
  assert.ok(eintrag(k, 'walls', 0));
  assert.equal(eintrag(k, 'walls', 7), null, 'Wände von Raum 3 nicht gelistet');
  const editor = k.karte._mapEdit;
  editor.pick = { list: 'walls', i: 8 };
  editor.changed();
  assert.equal(feldE(k, 'wall-room').value, '3', 'gewählte Wand (Karte) zeigt ihren Raum');
  assert.ok(eintrag(k, 'walls', 8));
  waehle(k, feldE(k, 'wall-room'), 1);
  assert.equal(feldE(k, 'wall-room').value, '1', 'Raumwahl bleibt, auch wenn die gewählte Wand woanders liegt');
  waehle(k, feldE(k, 'wall-room'), '');
  assert.ok(eintrag(k, 'walls', 0) && eintrag(k, 'walls', 12), 'alle Räume auf Wunsch');
  const kurz = await mitDaten('walls');
  assert.equal(feldE(kurz, 'wall-room').value, '', 'bis 12 Wände alle (wie bisher)');
  assert.deepEqual(k.haus.rufe, []);
});

test('EDI-07 Router-Formular nennt den Router in der Tastenhilfe, nicht Wand oder Tür', async () => {
  const k = await mitDaten('wifi');
  eintrag(k, 'router', 0).click();
  const text = $d(k.u, '[data-panel="wifi"]').textContent;
  assert.doesNotMatch(text, /Wand oder Tür/);
  assert.match(text, /verschieben die Pfeiltasten den Router/);
  assert.match(k.I.TEXTE.en.texte.routerTasten, /move the router/);
});

test('EDI-01 Kartenzeile: Wählen und Symbolknöpfe als eine Gruppe (bricht nur als Ganzes um)', () => {
  const k = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2, multi_floor_map: true } });
  verwaltung(k);
  const gruppe = (id) => karteZeile(k, id).querySelector('.map-actions');
  assert.deepEqual(Array.from(gruppe(7).childNodes, (n) => n.getAttribute('data-action')), ['select', 'edit', 'backups', 'rename', 'delete']);
  assert.deepEqual(Array.from(gruppe(3).childNodes, (n) => n.getAttribute('data-action')), ['edit', 'backups', 'rename', 'delete'], 'map-backup: „Sicherungen“ in derselben Gruppe');
});

test('EDI-02 Dirty-Dialog: eine Änderung in der Einzahl (DE/EN)', () => {
  const k = aufbau();
  const d = bearbeiten(k);
  werkzeug(k, 'zones').click();
  $d(k.u, '[data-action="add-zone"]').click();
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  assert.match(d.shadowRoot.textContent, /Es gibt 1 ungespeicherte Änderung\./);
  assert.match(k.I.TEXTE.en.texte.kartenOffenFrageEins, /There is 1 unsaved change\./);
});
