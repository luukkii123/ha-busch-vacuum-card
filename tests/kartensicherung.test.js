'use strict';
// Modul map-backup (Plan 2026-11-10): Stände der Karte (Original, Bearbeitet,
// Backup), Vollbild, manuelles Backup, Wiederherstellen, Datei. Kein Test
// erreicht ein Gerät: callService der Attrappe sammelt nur. Nur synthetische
// Listen und Adressen (Fixture voll.json), kein Grundriss, keine Kartendatei.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const dienste = (haus) => haus.rufe.filter((r) => r.domain === 'dreame_vacuum').map((r) => r.service);

const ZWEI_KARTEN = [
  { id: 3, index: 1, name: 'Karte 1', custom_name: null },
  { id: 7, index: 2, name: 'Karte 2', custom_name: 'Oben' },
];
const URL = (cam, k, v, file) => '/api/camera_recovery_map_proxy/' + cam + '?token=t&index=' + k + '&v=' + v + (file ? '&file=1' : '');
/** Kamera-Attribute einer Recovery-Liste (neueste zuerst wie types.py#L5072), Schlüssel wie camera.py#L1353. */
function staende(cam, liste) {
  const n = liste.length, bild = {}, datei = {};
  liste.forEach((e, i) => {
    const k = n - i, key = '01/0' + k + '/26 10:0' + k + ':00: Map' + k + ' (' + e.map_type + ')';
    bild[key] = URL(cam, k, 100 + k);
    datei[key] = URL(cam, k, 100 + k, true);
  });
  return { recovery_map_list: liste, recovery_map_picture: bild, recovery_map_file: datei };
}
const EINTRAG = (date, map_type, nr) => ({ date, map_type, object_name: 'cloud/geraet/1/' + nr });

/** Karte aus der Fixture; `vac` ändert vacuum.robo, `kameras` ersetzt Attribute einzelner Kameras. */
function aufbau({ vac = {}, kameras = {}, zustand, ohneDienste = [] } = {}) {
  const u = neueUmgebung(), haus = hausAus('voll');
  const v = haus.states['vacuum.robo'];
  haus.states['vacuum.robo'] = Object.assign({}, v, { state: zustand || v.state, attributes: Object.assign({}, v.attributes, vac) });
  for (const [id, attrs] of Object.entries(kameras)) {
    const alt = haus.states[id] || { entity_id: id, state: 'idle', attributes: {} };
    if (!haus.entities[id]) haus.entities[id] = { entity_id: id, device_id: 'geraet_robo', platform: 'dreame_vacuum', translation_key: 'saved_map' };
    haus.states[id] = Object.assign({}, alt, { attributes: attrs === null ? {} : Object.assign({}, alt.attributes, attrs) });
  }
  for (const d of ohneDienste) delete haus.services.dreame_vacuum[d];
  haus.antwort = () => Promise.resolve();
  const karte = neueKarte(u, haus);
  const I = u.registry.get('busch-vacuum-card').__internals;
  const k = { u, haus, karte, I };
  k.sauger = (attribute = {}, z) => { const alt = haus.states['vacuum.robo']; karte.hass = haus.setze({ 'vacuum.robo': Object.assign({}, alt, { state: z || alt.state, attributes: Object.assign({}, alt.attributes, attribute) }) }); };
  k.model = () => karte._model();
  return k;
}

// ── Task 1: Einträge und Status (BAK-01, ALL-13) ────────────────────────────

test('BAK-01 recoveryEntries: k = Länge − Position (neueste zuerst), Bild/Datei derselben Nummer, Typ aus Text — 1 bis 4 Einträge, gemischte Typen', () => {
  const k = aufbau();
  const typen = [['Originalkarte'], ['Bearbeitete Karte', 'Originalkarte'], ['Sicherungskarte', 'Bearbeitete Karte', 'Originalkarte'],
    ['Backup Map', 'Edited Map', 'Sicherungskarte', 'Original Map']];
  for (const liste of typen) {
    const eintraege = liste.map((t, i) => EINTRAG('2026-0' + (liste.length - i) + '-01 1' + i + ':00', t, i));
    const kk = aufbau({ kameras: { 'camera.robo_map_1': staende('camera.robo_map_1', eintraege) } });
    const r = roh(kk.I.recoveryEntries(kk.karte._hass, kk.model(), 3));
    assert.deepEqual(r.map((e) => e.k), liste.map((_, i) => liste.length - i), 'k je Position: ' + liste.join(','));
    r.forEach((e, i) => {
      assert.equal(e.picture, URL('camera.robo_map_1', e.k, 100 + e.k), 'Bild zu k=' + e.k);
      assert.equal(e.file, URL('camera.robo_map_1', e.k, 100 + e.k, true), 'Datei zu k=' + e.k);
      assert.equal(e.typeText, liste[i]);
      assert.equal(e.date, eintraege[i].date);
    });
    assert.deepEqual(r.map((e) => e.type), liste.map((t) => (/original/i.test(t) ? 'original' : /bearbeit|edit/i.test(t) ? 'edited' : 'backup')));
  }
  // Fixture: Bearbeitet (k 2) vor Original (k 1), wie live.
  assert.deepEqual(roh(k.I.recoveryEntries(k.karte._hass, k.model(), 3)).map((e) => [e.k, e.type]), [[2, 'edited'], [1, 'original']]);
});

test('BAK-01 recoveryEntries: fehlende Attribute, nur Bildschlüssel, unbekannter Typ, fremde Karte', () => {
  const k = aufbau({ kameras: { 'camera.robo_map_1': { recovery_map_list: null, recovery_map_picture: null, recovery_map_file: null } } });
  // Ohne Liste der gespeicherten Kamera: die aktive Kamera trägt nur Bild/Datei (Schlüssel „…: Map<k> (<Typ>)“).
  const nurBild = roh(k.I.recoveryEntries(k.karte._hass, k.model(), 3));
  assert.deepEqual(nurBild.map((e) => [e.k, e.type, e.typeText]), [[2, 'edited', 'Bearbeitete Karte'], [1, 'original', 'Originalkarte']]);
  assert.equal(nurBild[0].date, null, 'ohne Liste kein Datum, nur der Schlüsseltext');
  assert.equal(nurBild[0].when, '04/26/26 13:23:13');
  assert.match(nurBild[0].file, /index=2&.*file=1$/);
  const leer = aufbau({ kameras: { 'camera.robo_map_1': null, 'camera.robo_map': { recovery_map_picture: undefined, recovery_map_file: undefined } } });
  assert.deepEqual(roh(leer.I.recoveryEntries(leer.karte._hass, leer.model(), 3)), []);
  const fremd = aufbau({ kameras: { 'camera.robo_map_1': staende('camera.robo_map_1', [EINTRAG('2026-01-01 10:00', 'Irgendwas', 1)]) } });
  const r = roh(fremd.I.recoveryEntries(fremd.karte._hass, fremd.model(), 3));
  assert.deepEqual([r[0].k, r[0].type, r[0].typeText], [1, 'unknown', 'Irgendwas']);
  assert.deepEqual(roh(fremd.I.recoveryEntries(fremd.karte._hass, fremd.model(), 99)), [], 'unbekannte Karte: keine Stände');
  // Zweite Karte: eigene Kamera camera.robo_map_2 (map_index 2).
  const zwei = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2 }, kameras: { 'camera.robo_map_2': Object.assign({ map_index: 2, map_id: 7, entity_picture: '/api/camera_proxy/camera.robo_map_2?token=t' },
    staende('camera.robo_map_2', [EINTRAG('2026-02-02 10:00', 'Sicherungskarte', 9), EINTRAG('2025-01-01 10:00', 'Originalkarte', 8)])) } });
  assert.deepEqual(roh(zwei.I.recoveryEntries(zwei.karte._hass, zwei.model(), 7)).map((e) => [e.k, e.type]), [[2, 'backup'], [1, 'original']]);
  assert.deepEqual(roh(zwei.I.recoveryEntries(zwei.karte._hass, zwei.model(), 3)).map((e) => e.k), [2, 1]);
  assert.equal(k.I.recoveryType('Sicherungskarte'), 'backup');
  assert.equal(k.I.recoveryType('Backup'), 'backup');
});

test('ALL-13 map_backup_status/map_recovery_status als Zustand mit Sperrlogik; can(map_recovery), can(backup_map)', () => {
  const k = aufbau();
  const st = (v) => k.I.recoveryStatus(v);
  assert.deepEqual(['Idle', 'Running', 'Success', 'Fail', 'Fail 2', 'Unknown', 'irgendwas', undefined, null].map(st),
    ['idle', 'running', 'success', 'failed', 'failed', 'unknown', 'unknown', null, null]);
  assert.equal(k.model().can('map_recovery'), true);
  assert.equal(k.model().can('backup_map'), true);
  assert.equal(aufbau({ ohneDienste: ['vacuum_restore_map'] }).model().can('map_recovery'), false, 'ohne Dienst nur ansehen');
  assert.equal(aufbau({ vac: { map_recovery_status: undefined } }).model().can('map_recovery'), false, 'ohne Attribut keine Wiederherstellung');
  assert.equal(aufbau({ vac: { capabilities: ['map'] } }).model().can('backup_map'), false);
  // Sperren mit Grund (Sicherheitsrahmen 5): Sicherung/Wiederherstellung läuft, Aufgabe, temporäre Karte.
  const lock = (kk) => kk.I.restoreLock(kk.karte, kk.model());
  assert.equal(lock(k), '');
  assert.equal(lock(aufbau({ vac: { map_recovery_status: 'Running' } })), 'kartenSperreSicherung');
  assert.equal(lock(aufbau({ vac: { map_backup_status: 'Running' } })), 'kartenSperreSicherung');
  assert.equal(lock(aufbau({ zustand: 'cleaning', vac: { status: 'Cleaning', started: true } })), 'kartenSperreAufgabe');
  assert.equal(lock(aufbau({ vac: { has_temporary_map: true } })), 'kartenSperreTemporaer');
  assert.equal(lock(aufbau({ ohneDienste: ['vacuum_restore_map'] })), 'sicherungNurAnsehen');
});

test('BAK-01 Kameras gespeicherter Karten beobachtet nur die offene Liste (R20): Karte ohne, backupWatch mit camera.robo_map_1', () => {
  const k = aufbau();
  assert.ok(!k.karte._seen.ids.includes('camera.robo_map_1'), 'die Karte selbst beobachtet die gespeicherte Kamera nicht');
  const ids = k.I.backupWatch(k.karte, 3);
  assert.ok(ids.includes('vacuum.robo') && ids.includes('camera.robo_map_1') && ids.includes('camera.robo_map'), ids.join(','));
  assert.deepEqual(k.haus.rufe, []);
});
