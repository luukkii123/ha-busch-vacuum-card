'use strict';
// Modul map-editor (Plan 2026-11-10): Sicherheitsrahmen, Bearbeitungsdaten,
// Werkzeuge. Kein Test erreicht ein Gerät: callService der Attrappe sammelt
// nur. Synthetische Kartendaten (tests/kartendaten.js), keine Grundrisse.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const dienste = (haus) => haus.rufe.filter((r) => r.domain === 'dreame_vacuum').map((r) => r.service);

/** Karte aus einer Fixture; `vac` ändert Attribute von vacuum.robo, `cam` die der Kartenkamera. */
function aufbau({ name = 'voll', vac = {}, cam = {}, zustand, config = {} } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  const v = haus.states['vacuum.robo'];
  haus.states['vacuum.robo'] = Object.assign({}, v, { state: zustand || v.state, attributes: Object.assign({}, v.attributes, vac) });
  if (haus.states['camera.robo_map']) {
    const c = haus.states['camera.robo_map'];
    haus.states['camera.robo_map'] = Object.assign({}, c, { attributes: Object.assign({}, c.attributes, cam) });
  }
  haus.antwort = () => Promise.resolve();
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  const k = { u, haus, karte, I };
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
