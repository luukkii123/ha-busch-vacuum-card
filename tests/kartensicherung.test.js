'use strict';
// Modul map-backup (Plan 2026-11-10): Stände der Karte (Original, Bearbeitet,
// Backup), Vollbild, manuelles Backup, Wiederherstellen, Datei. Kein Test
// erreicht ein Gerät: callService der Attrappe sammelt nur. Nur synthetische
// Listen und Adressen (Fixture voll.json), kein Grundriss, keine Kartendatei.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');
const { roh, dialogVon } = require('./hilfen.js');

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
  assert.equal(lock(aufbau({ zustand: 'cleaning', vac: { status: 'Cleaning', started: true } })), 'wiederherstellenSperreLaeuft', 'eigener Grund: läuft oder pausiert');
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

// ── Task 2: Liste und Vollbild (BAK-01) ─────────────────────────────────────

/** Kartenverwaltung über das Menü öffnen. */
function verwaltung(k) {
  k.karte._openDialog(k.karte._menuView());
  Array.from($$d(k.u, '.menu-item')).find((b) => b.getAttribute('data-entry') === 'maps').click();
  return dialogVon(k.u);
}
const knopf = (k, action) => $d(k.u, '[data-action="' + action + '"]');
/** Sicherungen der Karte 3 aus der Kartenverwaltung. */
function sicherungen(k, id = 3) {
  const d = verwaltung(k);
  $d(k.u, '[data-map="' + id + '"]').querySelectorAll('[data-action="backups"]')[0].click();
  return d;
}
/** Das Bild der Vollbildbühne (die Attrappe kennt keine Nachfahren-Selektoren). */
const bildIn = (k) => $d(k.u, '.backup-stage').querySelectorAll('img')[0] || null;
const eintraege = (k) => Array.from($$d(k.u, '.backup-entry'));

test('BAK-01 Einstieg „Sicherungen“ je Karte (Kartenverwaltung, Bearbeitungsmodus); Liste mit Typ-Symbol + Text, Datum, Nummer; ohne Stände/Dienste kein Eintrag', () => {
  const k = aufbau();
  const d = sicherungen(k);
  assert.equal($d(k.u, 'h1').textContent, 'Kartensicherungen');
  assert.equal(d._views.at(-1).kind, 'editor');
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Karte: Karte 1/);
  const e = eintraege(k);
  assert.deepEqual(e.map((n) => n.getAttribute('data-k')), ['2', '1']);
  assert.deepEqual(e.map((n) => n.getAttribute('data-type')), ['edited', 'original']);
  assert.equal(e[0].querySelectorAll('ha-icon')[0].getAttribute('icon'), 'mdi:map-check-outline', 'Typ-Symbol');
  assert.match(e[0].textContent, /Bearbeitete Karte/, 'Typ als Text, nicht nur Symbol (R17)');
  assert.match(e[0].textContent, /26\.04\.2026/, 'Datum im HA-Format');
  assert.match(e[0].textContent, /13:23/);
  assert.match(e[0].textContent, /Nr\. 2/);
  assert.match(e[1].textContent, /Originalkarte.*21\.11\.2024/);
  assert.equal($d(k.u, '.backup-list').getAttribute('role'), 'list', 'Liste semantisch (R16)');
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Sicherung: bereit/);
  assert.match(dialogVon(k.u).shadowRoot.textContent, /Wiederherstellung: bereit/);
  assert.equal(d._seen.ids.includes('camera.robo_map_1'), true, 'die offene Liste beobachtet die gespeicherte Kamera');
  // Neuer Stand in der Kamera → Liste neu, ohne Abruf.
  const alt = k.haus.states['camera.robo_map_1'];
  k.karte.hass = k.haus.setze({ 'camera.robo_map_1': Object.assign({}, alt, { attributes: Object.assign({}, alt.attributes, staende('camera.robo_map_1', [EINTRAG('2026-11-11 09:00', 'Sicherungskarte', 3), EINTRAG('2026-04-26 13:23', 'Bearbeitete Karte', 2), EINTRAG('2024-11-21 10:20', 'Originalkarte', 1)])) }) });
  assert.deepEqual(eintraege(k).map((n) => n.getAttribute('data-type')), ['backup', 'edited', 'original']);
  d.remove(); k.karte._dialog = null;
  // Bearbeitungsmodus: „Sicherungen“ der aktiven Karte.
  k.karte._map.tools.querySelector('[data-action="map-edit"]').click();
  knopf(k, 'backups').click();
  assert.equal($d(k.u, 'h1').textContent, 'Kartensicherungen');
  assert.equal(eintraege(k).length, 3);
  assert.deepEqual(k.haus.rufe, []);
  // Ohne Stände, ohne Wiederherstellen und ohne Sicherung: kein Eintrag „Sicherungen“.
  const ohne = aufbau({ vac: { map_recovery_status: undefined, map_backup_status: undefined }, kameras: { 'camera.robo_map_1': { recovery_map_list: null, recovery_map_picture: null, recovery_map_file: null }, 'camera.robo_map': { recovery_map_picture: null, recovery_map_file: null } } });
  verwaltung(ohne);
  assert.equal($d(ohne.u, '[data-map="3"]').querySelectorAll('[data-action="backups"]').length, 0);
});

test('BAK-01 Leerzustand „Keine Stände“ (R18) und nur ansehen ohne Wiederherstellen-Dienst', () => {
  const leer = aufbau({ kameras: { 'camera.robo_map_1': { recovery_map_list: [], recovery_map_picture: {}, recovery_map_file: {} }, 'camera.robo_map': { recovery_map_picture: {}, recovery_map_file: {} } } });
  sicherungen(leer);
  assert.equal(eintraege(leer).length, 0);
  assert.match(dialogVon(leer.u).shadowRoot.textContent, /Keine Stände/);
  const ansehen = aufbau({ ohneDienste: ['vacuum_restore_map', 'vacuum_restore_map_from_file'] });
  sicherungen(ansehen);
  assert.equal(eintraege(ansehen).length, 2);
  assert.match(dialogVon(ansehen.u).shadowRoot.textContent, /nur ansehen und herunterladen/);
  assert.equal(knopf(ansehen, 'restore'), null);
});

/** img mit steuerbarem decode(): `bilder` sammelt [img, erfüllen, ablehnen]. */
function mitBildern(k) {
  const bilder = [];
  const erzeuge = k.u.document.createElement.bind(k.u.document);
  k.u.document.createElement = (tag) => {
    const n = erzeuge(tag);
    if (tag === 'img') n.decode = () => new Promise((ok, nein) => bilder.push([n, ok, nein]));
    return n;
  };
  return bilder;
}

test('BAK-01 Vollbild: size full, kind menu; „Aktuelle Karte“ zuerst; Bild erst auf Abruf mit decode(), Lade-/Fehlerzustand mit Erneut; Vor/Zurück mit Knöpfen und Pfeiltasten; Escape schließt', async () => {
  const k = aufbau();
  const bilder = mitBildern(k);
  const d = sicherungen(k);
  assert.equal(bilder.length, 0, 'die Liste lädt kein Bild (R20)');
  eintraege(k)[0].querySelectorAll('[data-action="view"]')[0].click();
  const sicht = d._views.at(-1);
  assert.equal(sicht.size, 'full');
  assert.equal(sicht.kind, 'menu');
  assert.equal($d(k.u, '.sheet').getAttribute('data-size'), 'full');
  assert.match($d(k.u, '.backup-caption').textContent, /Bearbeitete Karte · 26\.04\.2026/);
  assert.match($d(k.u, '.backup-position').textContent, /2 von 3/);
  const img = bildIn(k);
  assert.equal(img.getAttribute('src'), URL('camera.robo_map_1', 2, 1777202593).replace('token=t', 'token=testtoken'));
  assert.match(img.getAttribute('alt'), /Bearbeitete Karte/, 'Alternativtext je Stand (R16)');
  assert.match($d(k.u, '.backup-state').textContent, /wird geladen/, 'Ladezustand (R11)');
  assert.equal(bilder.length, 1);
  bilder[0][1]();
  await mikro();
  assert.equal($d(k.u, '.backup-state'), null, 'geladen: kein Hinweis mehr');
  // Zurück zum ersten Eintrag: die aktuelle Karte (entity_picture der gespeicherten Kamera).
  knopf(k, 'previous').click();
  assert.match($d(k.u, '.backup-caption').textContent, /Aktuelle Karte/);
  assert.match(bildIn(k).getAttribute('src'), /camera_proxy\/camera\.robo_map_1/);
  assert.equal(knopf(k, 'previous').disabled, true);
  // Pfeiltaste rechts zweimal: Original; ein Fehler zeigt R12 mit Erneut.
  k.u.tasteAn($d(k.u, '.backup-stage'), 'keydown', { key: 'ArrowRight' });
  k.u.tasteAn($d(k.u, '.backup-stage'), 'keydown', { key: 'ArrowRight' });
  assert.match($d(k.u, '.backup-caption').textContent, /Originalkarte/);
  assert.equal(knopf(k, 'next').disabled, true);
  const original = bilder.find(([n]) => /index=1/.test(n.getAttribute('src')));
  original[2](new Error('404'));
  await mikro();
  assert.match($d(k.u, '.backup-state').textContent, /nicht geladen.*Cloud/);
  assert.equal($d(k.u, '.backup-state').getAttribute('data-kind'), 'error');
  knopf(k, 'retry').click();
  assert.match($d(k.u, '.backup-state').textContent, /wird geladen/);
  // Ein schon geladener Stand lädt nicht noch einmal (Cache bis zum Schließen).
  const vorher = bilder.length;
  knopf(k, 'previous').click();
  assert.equal(bilder.length, vorher);
  // Zoom über die Knöpfe: Vergrößern verdoppelt, Einpassen setzt zurück.
  knopf(k, 'zoom-in').click();
  assert.match(bildIn(k).style.transform, /scale\(2\)/);
  knopf(k, 'fit').click();
  assert.match(bildIn(k).style.transform, /scale\(1\)/);
  k.u.tasteAn($d(k.u, '.backup-stage'), 'keydown', { key: 'Escape' });
  k.u.zurueck(); // Escape geht über den Verlauf zurück (history.back → popstate)
  assert.equal(d._views.at(-1).title, 'Kartensicherungen', 'Escape schließt das Vollbild');
  assert.deepEqual(k.haus.rufe, []);
});

test('BAK-01 Zoomlogik aus map-view wiederverwendet (R08): zoomAround/clampPan sind die Rechnung der Karte', () => {
  const k = aufbau();
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const z = k.I.zoomAround({ zoom: 1, panX: 0, panY: 0 }, 2, { x: 300, y: 150 }, rect);
  assert.deepEqual(roh(z), { zoom: 2, panX: -100, panY: 0 });
  assert.deepEqual(roh(k.I.zoomAround({ zoom: 1, panX: 0, panY: 0 }, 99, null, rect)).zoom, 8, 'Grenze MAP_ZOOM.max');
  assert.deepEqual(roh(k.I.clampPan(2, 900, -900, { width: 200, height: 100 })), { panX: 200, panY: -100 });
  assert.deepEqual(roh(k.I.clampPan(1, 50, 50, { width: 200, height: 100 })), { panX: 0, panY: 0 });
  const quelle = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');
  assert.match(quelle, /_zoomed\(from, zoom, client\) \{\s*return zoomAround\(/, 'MapView rechnet mit derselben Funktion');
});

// ── Task 3: Manuelles Backup (BAK-02, ALL-13) ───────────────────────────────

const MIT_BACKUP = () => staende('camera.robo_map_1', [EINTRAG('2026-11-01 09:30', 'Sicherungskarte', 3), EINTRAG('2026-04-26 13:23', 'Bearbeitete Karte', 2), EINTRAG('2024-11-21 10:20', 'Originalkarte', 1)]);
const text = (k) => dialogVon(k.u).shadowRoot.textContent;

test('BAK-02 Jetzt sichern: nur can(backup_map) und aktive Karte; Bestätigung ohne Außenklick; genau vacuum_backup_map { entity_id, map_id } über MapEditSession.backup; Status bis Success; Doppeltipp = 1 Aufruf', async () => {
  const k = aufbau();
  const d = sicherungen(k);
  const jetzt = knopf(k, 'backup-now');
  assert.ok(jetzt, 'Knopf „Jetzt sichern“');
  assert.equal(jetzt.disabled, false);
  jetzt.click();
  assert.equal(d._views.at(-1).kind, 'confirm', 'kein Außenklick (R04)');
  assert.match(text(k), /Erstellt eine Sicherung von „Karte 1“/);
  assert.doesNotMatch(text(k), /ersetzen/, 'ohne Backup-Eintrag kein Ersetzen-Hinweis');
  assert.doesNotMatch(text(k), /Vor dem Speichern/, 'kein Speichern-Hinweis des Editors');
  assert.deepEqual(k.haus.rufe, [], 'erst der Klick sendet');
  knopf(k, 'confirm').click();
  knopf(k, 'confirm').click();
  await mikro();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_backup_map', data: { entity_id: 'vacuum.robo', map_id: 3 } }], 'Doppeltipp: ein Aufruf');
  assert.match(text(k), /Sicherung läuft/);
  k.sauger({ map_backup_status: 'Running' });
  assert.match(text(k), /Sicherung läuft/);
  k.sauger({ map_backup_status: 'Success' });
  await mikro(); await mikro();
  k.u.zurueck();
  assert.equal(d._views.at(-1).title, 'Kartensicherungen', 'nach Erfolg zurück zur Liste');
  assert.match(text(k), /Sicherung: erfolgreich/);
  // Ein zweites Backup in derselben Ansicht sichert erneut (eigene Sitzung je Klick).
  knopf(k, 'backup-now').click();
  knopf(k, 'confirm').click();
  await mikro();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_backup_map']);
  // Sperren mit Grund (Aufgabe, Status Running, keine gespeicherte Karte, temporäre Karte, nicht aktive Karte).
  const grund = (kk, id = 3) => { sicherungen(kk, id); const b = knopf(kk, 'backup-now'); return [b.disabled, text(kk)]; };
  let [aus, t] = grund(aufbau({ zustand: 'cleaning' }));
  assert.ok(aus && /solange eine Aufgabe läuft/.test(t));
  [aus, t] = grund(aufbau({ vac: { map_backup_status: 'Running' } }));
  assert.ok(aus && /Sicherung oder Wiederherstellung läuft/.test(t));
  [aus, t] = grund(aufbau({ vac: { has_temporary_map: true } }));
  assert.ok(aus && /temporäre Karte/.test(t));
  const zwei = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2 } });
  [aus, t] = grund(zwei, 7);
  assert.ok(aus && /nur für die aktive Karte/.test(t), 'nicht aktive Karte');
  knopf(zwei, 'switch-map').click();
  assert.deepEqual(zwei.haus.rufe, [], 'Wechsel erst nach der Bestätigung von core (CORE-20)');
  assert.match(text(zwei), /Oben/);
  const ohne = aufbau({ vac: { capabilities: ['map', 'multi_floor_map'] } });
  sicherungen(ohne);
  assert.equal(knopf(ohne, 'backup-now'), null, 'ohne backup_map kein Knopf');
});

test('BAK-02 Jetzt sichern mit vorhandenem Backup: Hinweis „kann die Sicherung vom <Datum> ersetzen“; Fehler und Zeitlimit (R12) mit Erneut, Karte unverändert', async () => {
  const k = aufbau({ kameras: { 'camera.robo_map_1': MIT_BACKUP() } });
  sicherungen(k);
  knopf(k, 'backup-now').click();
  assert.match(text(k), /Kann die Sicherung vom 01\.11\.2026 09:30 ersetzen/);
  knopf(k, 'confirm').click();
  await mikro();
  k.sauger({ map_backup_status: 'Running' });
  k.sauger({ map_backup_status: 'Fail' });
  await mikro(); await mikro();
  assert.match(text(k), /Sicherung fehlgeschlagen \(Fail\)/);
  assert.equal(knopf(k, 'confirm').textContent, 'Erneut versuchen');
  knopf(k, 'confirm').click();
  await mikro();
  k.u.uhr.vor(60000);
  await mikro(); await mikro();
  assert.match(text(k), /Zeitlimit 60 s/);
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map', 'vacuum_backup_map'], 'nur Sicherungen, kein Kartendienst');
});

// ── Task 4: Wiederherstellen (BAK-02) ───────────────────────────────────────

const zeile = (k, typ) => eintraege(k).find((n) => n.getAttribute('data-type') === typ);
const wiederherstellen = (k, typ) => zeile(k, typ).querySelectorAll('[data-action="restore"]')[0];
const option = (k) => $d(k.u, '[data-field="backup_first"]');
const kamera = (k, attribute) => { const alt = k.haus.states['camera.robo_map']; k.karte.hass = k.haus.setze({ 'camera.robo_map': Object.assign({}, alt, { attributes: Object.assign({}, alt.attributes, attribute) }) }); };

test('BAK-02 Wiederherstellen: Bestätigung kind confirm mit Karte, Stand, Vorschau, Folge, Rückweg; Abbrechen 0 Aufrufe; bestätigt genau vacuum_restore_map { entity_id, recovery_map_index: k, map_id }; Running → Success mit Hinweis nach neuem frame_id', async () => {
  const k = aufbau({ kameras: { 'camera.robo_map': { frame_id: 41 } } });
  const d = sicherungen(k);
  wiederherstellen(k, 'original').click();
  assert.equal(d._views.at(-1).kind, 'confirm', 'kein Außenklick (R04)');
  assert.equal($d(k.u, 'h1').textContent, 'Stand wiederherstellen');
  const t = text(k);
  assert.match(t, /Karte: Karte 1/);
  assert.match(t, /Stand: Originalkarte vom 21\.11\.2024 10:20 \(Nr\. 1\)/);
  assert.match(t, /Ersetzt die gespeicherte Karte: Räume, Namen, Zonen, Teppiche, Möbel, Reihenfolge und Raumeinstellungen dieser Karte/);
  assert.match(t, /Rückweg/);
  assert.match($d(k.u, '.backup-preview').getAttribute('src'), /camera_recovery_map_proxy\/camera\.robo_map_1\?.*index=1&/, 'Vorschau desselben k');
  assert.equal(knopf(k, 'confirm').getAttribute('data-variant'), 'destructive', 'rot (endgültig)');
  knopf(k, 'cancel').click();
  k.u.zurueck();
  assert.deepEqual(k.haus.rufe, [], 'Abbrechen → 0 Aufrufe');
  wiederherstellen(k, 'original').click();
  option(k).checked = false;
  option(k).dispatchEvent({ type: 'change' });
  knopf(k, 'confirm').click();
  knopf(k, 'confirm').click();
  await mikro();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_restore_map', data: { entity_id: 'vacuum.robo', recovery_map_index: 1, map_id: 3 } }], 'Doppeltipp: ein Aufruf');
  assert.match(text(k), /Wiederherstellung läuft/);
  k.sauger({ map_recovery_status: 'Running' });
  // Während Running: Editor, Aufgabenwahl und weitere Wiederherstellungen gesperrt.
  assert.equal(new k.I.MapEditSession(k.karte).lock('vacuum_set_restricted_zone'), 'kartenSperreSicherung');
  assert.ok(Array.from(k.karte.shadowRoot.querySelectorAll('.task')).every((b) => b.disabled), 'Aufgabenwahl gesperrt');
  k.sauger({ map_recovery_status: 'Success' });
  await mikro(); await mikro();
  k.u.zurueck();
  assert.equal(d._views.at(-1).title, 'Kartensicherungen');
  assert.match(text(k), /Wiederhergestellt: Originalkarte vom 21\.11\.2024 10:20/);
  assert.match(text(k), /Karte wird neu geladen/, 'bis ein neues frame_id kommt');
  kamera(k, { frame_id: 42 });
  assert.doesNotMatch(text(k), /Karte wird neu geladen/);
  assert.match(text(k), /Wiederhergestellt: Originalkarte/);
  assert.equal(Array.from(k.karte.shadowRoot.querySelectorAll('.task')).some((b) => b.disabled), false, 'nach Success wieder frei');
});

test('BAK-02 „Aktuellen Stand vorher sichern“: vorausgewählt ohne Backup-Eintrag (erst backup_map, nach Success restore), nicht vorausgewählt mit Eintrag (Ersetzen-Hinweis), beim Backup-Stand nicht angeboten', async () => {
  const k = aufbau();
  sicherungen(k);
  wiederherstellen(k, 'edited').click();
  assert.equal(option(k).checked, true, 'ohne Backup-Eintrag vorausgewählt');
  knopf(k, 'confirm').click();
  await mikro();
  assert.deepEqual(dienste(k.haus), ['vacuum_backup_map'], 'erst die Sicherung');
  assert.match(text(k), /Sicherung läuft/);
  k.sauger({ map_backup_status: 'Running' });
  k.sauger({ map_backup_status: 'Success' });
  await mikro(); await mikro();
  assert.deepEqual(roh(k.haus.rufe.map((r) => [r.service, r.data])), [['vacuum_backup_map', { entity_id: 'vacuum.robo', map_id: 3 }],
    ['vacuum_restore_map', { entity_id: 'vacuum.robo', recovery_map_index: 2, map_id: 3 }]], 'nach Success der Restore');
  const mit = aufbau({ kameras: { 'camera.robo_map_1': MIT_BACKUP() } });
  sicherungen(mit);
  wiederherstellen(mit, 'original').click();
  assert.equal(option(mit).checked, false, 'mit Backup-Eintrag nicht vorausgewählt');
  assert.match(text(mit), /Kann die Sicherung vom 01\.11\.2026 09:30 ersetzen/);
  knopf(mit, 'cancel').click();
  mit.u.zurueck();
  wiederherstellen(mit, 'backup').click();
  assert.equal(option(mit), null, 'Backup-Stand: keine Sicherung davor');
  assert.match(text(mit), /keine Sicherung davor/);
  knopf(mit, 'confirm').click();
  await mikro();
  assert.deepEqual(roh(mit.haus.rufe.map((r) => [r.service, r.data])), [['vacuum_restore_map', { entity_id: 'vacuum.robo', recovery_map_index: 3, map_id: 3 }]]);
  const ohne = aufbau({ vac: { capabilities: ['map', 'multi_floor_map'] } });
  sicherungen(ohne);
  wiederherstellen(ohne, 'original').click();
  assert.equal(option(ohne), null);
  assert.match(text(ohne), /Keine Sicherung möglich/);
});

test('BAK-02 Sperren und Fehler: nicht aktive Karte erst wechseln (CORE-20), Aufgabe, temporäre Karte, Running; Fehler, Zeitlimit 120 s, cloud_required (R12)', async () => {
  const zwei = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2 }, kameras: { 'camera.robo_map_2': Object.assign({ map_index: 2, map_id: 7 }, staende('camera.robo_map_2', [EINTRAG('2025-01-01 10:00', 'Originalkarte', 8)])) } });
  sicherungen(zwei, 7);
  assert.equal(wiederherstellen(zwei, 'original').disabled, true, 'nicht aktive Karte');
  assert.match(text(zwei), /nur für die aktive Karte/);
  knopf(zwei, 'switch-map').click();
  assert.match(text(zwei), /Oben/, 'CORE-20 fragt zuerst');
  assert.deepEqual(zwei.haus.rufe, []);
  for (const [vac, zustand, muster] of [[{}, 'cleaning', /solange eine Aufgabe läuft/], [{ has_temporary_map: true }, undefined, /temporäre Karte/], [{ map_recovery_status: 'Running' }, undefined, /Sicherung oder Wiederherstellung läuft/]]) {
    const k = aufbau({ vac, zustand });
    sicherungen(k);
    assert.equal(wiederherstellen(k, 'original').disabled, true, String(muster));
    assert.match(text(k), muster);
  }
  // Fehler des Dienstes: R12-Text, Erneut; cloud_required eigener Text; Zeitlimit 120 s „Ergebnis unbekannt“.
  const fehler = async (antwort, schritt) => {
    const k = aufbau();
    k.haus.antwort = (domain, service) => (service === 'vacuum_restore_map' ? antwort() : Promise.resolve());
    sicherungen(k);
    wiederherstellen(k, 'original').click();
    option(k).checked = false;
    option(k).dispatchEvent({ type: 'change' });
    knopf(k, 'confirm').click();
    await mikro();
    if (schritt) await schritt(k);
    return k;
  };
  let k = await fehler(() => Promise.reject(Object.assign(new Error('Map recovery requires a cloud connection'), { translation_key: 'cloud_required' })));
  assert.match(text(k), /Wiederherstellen braucht die Cloud-Anmeldung der Integration/);
  assert.match(text(k), /Karte ist unverändert/);
  k = await fehler(() => Promise.resolve(), async (kk) => { kk.sauger({ map_recovery_status: 'Running' }); kk.sauger({ map_recovery_status: 'Fail' }); await mikro(); await mikro(); });
  assert.match(text(k), /Wiederherstellen fehlgeschlagen \(Fail\)/);
  assert.equal(knopf(k, 'confirm').textContent, 'Erneut versuchen');
  k = await fehler(() => Promise.resolve(), async (kk) => { kk.sauger({ map_recovery_status: 'Running' }); kk.u.uhr.vor(119000); await mikro(); assert.doesNotMatch(text(kk), /unbekannt/); kk.u.uhr.vor(1000); await mikro(); await mikro(); });
  assert.match(text(k), /Ergebnis nach 120 s unbekannt — prüfe die Karte/);
  assert.deepEqual(dienste(k.haus), ['vacuum_restore_map']);
});

test('BAK-02 Wiederherstellen gesperrt mit Grund, solange der Roboter läuft oder pausiert ist — auch pausiert in der Station (live 12.11.2026: Integration lehnt ab)', () => {
  // started (device.py#L7017) lehnt ab; Zustände/Attribute, in denen die Karte das sehen muss.
  for (const [vac, zustand] of [[{}, 'cleaning'], [{}, 'paused'], [{}, 'returning'], [{ paused: true }, 'docked'], [{ started: true }, 'docked']]) {
    const k = aufbau({ vac, zustand });
    sicherungen(k);
    const was = zustand + ' ' + JSON.stringify(vac);
    assert.equal(wiederherstellen(k, 'original').disabled, true, was);
    assert.match(text(k), /Wiederherstellen geht nicht, solange der Roboter läuft oder pausiert ist/, was);
    assert.match(text(k), /Aufgabe beenden \(Stopp\)/, was);
  }
  // Angedockt ohne Aufgabe: frei.
  const frei = aufbau();
  sicherungen(frei);
  assert.equal(wiederherstellen(frei, 'original').disabled, false);
  assert.doesNotMatch(text(frei), /solange der Roboter läuft/);
  // Wird der Roboter während der offenen Bestätigung pausiert, sendet der Klick nichts.
  const spaet = aufbau();
  sicherungen(spaet);
  wiederherstellen(spaet, 'original').click();
  spaet.sauger({ paused: true });
  assert.equal(knopf(spaet, 'confirm').disabled, true, 'Bestätigen gesperrt');
  assert.match(text(spaet), /solange der Roboter läuft oder pausiert ist/);
  knopf(spaet, 'confirm').click();
  assert.deepEqual(spaet.haus.rufe, []);
});

/** Restore der Karte 3 ohne Vorab-Sicherung bis Success; das Gerät setzt dabei die Raumwerte zurück (live 12.11.2026). */
async function wiederhergestellt(k) {
  const vorher = roh(k.haus.states['camera.robo_map'].attributes.rooms);
  const d = sicherungen(k);
  wiederherstellen(k, 'original').click();
  const bestaetigung = text(k);
  option(k).checked = false;
  option(k).dispatchEvent({ type: 'change' });
  knopf(k, 'confirm').click();
  await mikro();
  k.sauger({ map_recovery_status: 'Running' });
  kamera(k, { rooms: Object.fromEntries(Object.entries(vorher).map(([id, r]) => [id, Object.assign({}, r, { suction_level: 1, wetness_level: 16, cleaning_times: 1, cleaning_route: 1 })])) });
  k.sauger({ map_recovery_status: 'Success' });
  await mikro(); await mikro();
  k.u.zurueck();
  return { d, vorher, bestaetigung };
}
const raeumeFertig = async () => { for (let i = 0; i < 20; i++) await mikro(); };

test('BAK-02 Wiederherstellen setzt die Raumeinstellungen zurück: Bestätigung sagt es; Karte merkt alle Räume vorher und bietet danach „Raumeinstellungen wiederherstellen“ an — ein vacuum_set_custom_cleaning je Raum', async () => {
  const k = aufbau();
  const { d, vorher, bestaetigung } = await wiederhergestellt(k);
  assert.match(bestaetigung, /setzt dabei die Reinigungseinstellungen aller Räume \(Saugstufe, Feuchte, Durchgänge, Modus, Route\) auf Standard zurück und berechnet die Raumgrenzen neu/);
  assert.match(bestaetigung, /Die Karte merkt sich die Raumeinstellungen von 7 Räumen/);
  assert.equal(d._views.at(-1).title, 'Kartensicherungen');
  assert.match(text(k), /Raumeinstellungen wiederherstellen/);
  const n = k.haus.rufe.length;
  knopf(k, 'restore-rooms').click();
  assert.equal(d._views.at(-1).kind, 'confirm', 'kein Außenklick (R04)');
  assert.match(text(k), /Atelier: Turbo · 27 · 3×/, 'gemerkte Werte je Raum');
  assert.deepEqual(k.haus.rufe.length, n, 'Öffnen sendet nichts');
  knopf(k, 'confirm').click();
  knopf(k, 'confirm').click();
  await raeumeFertig();
  const rufe = roh(k.haus.rufe.slice(n));
  assert.equal(rufe.length, Object.keys(vorher).length, 'ein Aufruf je Raum (Doppeltipp: einmal)');
  assert.ok(rufe.every((r) => r.domain === 'dreame_vacuum' && r.service === 'vacuum_set_custom_cleaning'));
  assert.deepEqual(rufe.map((r) => r.data.segment_id[0]).sort((a, b) => a - b), Object.keys(vorher).map(Number).sort((a, b) => a - b));
  assert.deepEqual(rufe.find((r) => r.data.segment_id[0] === 1).data,
    { entity_id: 'vacuum.robo', segment_id: [1], suction_level: [3], wetness_level: [27], repeats: [3], cleaning_mode: [2], cleaning_route: [2] });
  assert.match(text(k), /Raumeinstellungen von 7 Räumen wiederhergestellt/);
  knopf(k, 'cancel').click();
  k.u.zurueck();
  assert.equal(d._views.at(-1).title, 'Kartensicherungen');
  assert.equal(knopf(k, 'restore-rooms'), null, 'nach Erfolg kein Angebot mehr');
});

test('BAK-02 Raumeinstellungen wiederherstellen: gesperrt während einer Aufgabe; Fehler hält an, nennt die fertigen Räume, Erneut sendet nur die übrigen', async () => {
  const k = aufbau();
  await wiederhergestellt(k);
  k.sauger({}, 'cleaning');
  assert.equal(knopf(k, 'restore-rooms').disabled, true, 'während einer Aufgabe');
  assert.match(text(k), /Während einer Aufgabe nicht änderbar/);
  k.sauger({}, 'docked');
  let anzahl = 0;
  k.haus.antwort = (domain, service) => (service === 'vacuum_set_custom_cleaning' && ++anzahl === 3 ? Promise.reject(new Error('Gerät antwortet nicht')) : Promise.resolve());
  const n = k.haus.rufe.length;
  knopf(k, 'restore-rooms').click();
  knopf(k, 'confirm').click();
  await raeumeFertig();
  assert.equal(k.haus.rufe.length - n, 3, 'hält beim ersten Fehler an');
  assert.match(text(k), /Gerät antwortet nicht/);
  assert.match(text(k), /Fertig: Atelier, Salon/, 'nennt, was schon zurückgeschrieben ist (R12)');
  assert.equal(knopf(k, 'confirm').textContent, 'Erneut versuchen');
  knopf(k, 'confirm').click();
  await raeumeFertig();
  const zweite = k.haus.rufe.slice(n + 3).map((r) => r.data.segment_id[0]);
  assert.equal(zweite.length, 5, 'nur der fehlgeschlagene und die übrigen Räume');
  assert.ok(!zweite.includes(1) && !zweite.includes(3));
  assert.match(text(k), /Raumeinstellungen von 7 Räumen wiederhergestellt/);
  // Ohne Customized Cleaning merkt sich die Karte nichts und bietet nichts an.
  const ohne = aufbau({ ohneDienste: ['vacuum_set_custom_cleaning'] });
  const { bestaetigung } = await wiederhergestellt(ohne);
  assert.doesNotMatch(bestaetigung, /merkt sich die Raumeinstellungen/);
  assert.match(bestaetigung, /auf Standard zurück/, 'die Folge steht trotzdem da');
  assert.equal(knopf(ohne, 'restore-rooms'), null);
});

// ── Task 5: Herunterladen und Wiederherstellen aus Datei-URL (BAK-02) ───────

test('BAK-02 Herunterladen: Link = recovery_map_file-URL (frisch aus dem Attribut), download, Hinweis „enthält den Grundriss“; im Vollbild ebenso; ohne Datei kein Link', () => {
  const k = aufbau();
  const d = sicherungen(k);
  const link = zeile(k, 'original').querySelectorAll('[data-action="download"]')[0];
  assert.equal(link.tagName, 'A');
  assert.equal(link.getAttribute('href'), '/api/camera_recovery_map_proxy/camera.robo_map_1?token=testtoken&index=1&v=1732180819&file=1');
  assert.ok(link.hasAttribute('download'));
  assert.match(text(k), /enthält den Grundriss/);
  // Neues Token in der Kamera: der Link folgt dem Attribut.
  const alt = k.haus.states['camera.robo_map_1'];
  const datei = Object.fromEntries(Object.entries(alt.attributes.recovery_map_file).map(([key, url]) => [key, url.replace('testtoken', 'neu')]));
  k.karte.hass = k.haus.setze({ 'camera.robo_map_1': Object.assign({}, alt, { attributes: Object.assign({}, alt.attributes, { recovery_map_file: datei }) }) });
  assert.match(zeile(k, 'original').querySelectorAll('[data-action="download"]')[0].getAttribute('href'), /token=neu&index=1&/);
  zeile(k, 'edited').querySelectorAll('[data-action="view"]')[0].click();
  assert.match(knopf(k, 'download').getAttribute('href'), /token=neu&index=2&.*file=1$/);
  assert.match(text(k), /enthält den Grundriss/);
  assert.equal(d._views.at(-1).size, 'full');
  const ohne = aufbau({ kameras: { 'camera.robo_map_1': { recovery_map_file: null }, 'camera.robo_map': { recovery_map_file: null } } });
  sicherungen(ohne);
  assert.equal(knopf(ohne, 'download'), null);
  assert.deepEqual(k.haus.rufe, []);
});

test('BAK-02 Aus Datei-URL wiederherstellen (Erweitert): Pflichtfeld mit Inlineprüfung http(s)://, Zielkarte, Dirty-Schutz; gleicher Bestätigungsrahmen → vacuum_restore_map_from_file { entity_id, file_url, map_id }', async () => {
  const k = aufbau({ vac: { maps: ZWEI_KARTEN, map_count: 2 } });
  const d = sicherungen(k);
  knopf(k, 'restore-file').click();
  assert.equal(d._views.at(-1).kind, 'editor');
  assert.equal($d(k.u, 'h1').textContent, 'Aus Datei-URL wiederherstellen');
  assert.match(text(k), /für Home Assistant erreichbaren URL/);
  const feld = $d(k.u, '[data-field="file_url"]');
  assert.equal(feld.getAttribute('aria-required'), 'true');
  assert.deepEqual(Array.from($d(k.u, '[data-field="map_id"]').querySelectorAll('option'), (o) => o.value), ['3', '7']);
  knopf(k, 'submit').click();
  assert.match(text(k), /vollständige Adresse mit http:\/\/ oder https:\/\//, 'leer: Inlinefehler');
  assert.equal(d._views.at(-1).kind, 'editor');
  feld.value = 'ftp://x/y.tbz2';
  feld.dispatchEvent({ type: 'input' });
  knopf(k, 'submit').click();
  assert.equal(d._views.at(-1).kind, 'editor', 'ftp abgelehnt');
  const feld2 = $d(k.u, '[data-field="file_url"]');
  feld2.value = 'http://ha.local:8123/local/karte.mb.tbz2';
  feld2.dispatchEvent({ type: 'input' });
  // Dirty-Schutz: Escape fragt (Regel 2, R10), der Entwurf bleibt.
  d._goBack();
  assert.match(text(k), /Ungespeicherte Änderungen|ungespeicherte Änderung/);
  knopf(k, 'keep').click();
  k.u.zurueck();
  assert.equal($d(k.u, '[data-field="file_url"]').value, 'http://ha.local:8123/local/karte.mb.tbz2');
  // Zielkarte nicht aktiv → erst wechseln (CORE-20).
  const wahl = $d(k.u, '[data-field="map_id"]');
  wahl.value = '7';
  wahl.dispatchEvent({ type: 'change' });
  assert.equal(knopf(k, 'submit').disabled, true);
  assert.match(text(k), /nur für die aktive Karte/);
  const wahl2 = $d(k.u, '[data-field="map_id"]');
  wahl2.value = '3';
  wahl2.dispatchEvent({ type: 'change' });
  knopf(k, 'submit').click();
  assert.equal(d._views.at(-1).kind, 'confirm');
  assert.match(text(k), /Stand aus Datei: http:\/\/ha\.local:8123\/local\/karte\.mb\.tbz2/);
  assert.match(text(k), /Ersetzt die gespeicherte Karte/);
  assert.equal(option(k).checked, true, 'Rückweg wie beim Stand: vorher sichern');
  option(k).checked = false;
  option(k).dispatchEvent({ type: 'change' });
  assert.deepEqual(k.haus.rufe, []);
  knopf(k, 'confirm').click();
  await mikro();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_restore_map_from_file', data: { entity_id: 'vacuum.robo', file_url: 'http://ha.local:8123/local/karte.mb.tbz2', map_id: 3 } }]);
  k.sauger({ map_recovery_status: 'Running' });
  k.sauger({ map_recovery_status: 'Success' });
  await mikro(); await mikro();
  assert.equal(k.karte._drafts.has('restore-url'), false, 'Entwurf nach Erfolg verworfen');
  const ohne = aufbau({ ohneDienste: ['vacuum_restore_map_from_file'] });
  sicherungen(ohne);
  assert.equal(knopf(ohne, 'restore-file'), null, 'ohne Dienst kein Formular');
});
