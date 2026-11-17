'use strict';
// M8 (Buschcheck 17.11.2026, Security S1): folgenreiche Gerätefunktionen nur für
// Admins. Option admin_actions (Vorgabe admins); hass.user.is_admin aus der Attrappe.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');
const { dialogVon, sauger } = require('./hilfen.js');

const NICHT_ADMIN = { id: 'gast', name: 'Gast', is_admin: false, is_owner: false };
const SHORTCUTS = { 30: { id: 30, index: 0, name: 'Galerie', running: false, tasks: [] } };

function aufbau({ user, config } = {}) {
  const u = neueUmgebung(), haus = hausAus('voll', user === undefined ? {} : { user });
  haus.states = Object.assign({}, haus.states, sauger(haus, { shortcuts: SHORTCUTS, capabilities: haus.states['vacuum.robo'].attributes.capabilities.concat(['multi_floor_map']) }));
  const karte = neueKarte(u, haus, config);
  return { u, haus, karte, I: u.registry.get('busch-vacuum-card').__internals };
}
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const menuePunkt = (k, name) => { k.karte._openDialog(k.karte._menuView()); Array.from($$d(k.u, '.menu-item')).find((b) => b.getAttribute('data-entry') === name).click(); };
const gruppe = (k, name) => Array.from($$d(k.u, '[data-group]')).find((b) => b.getAttribute('data-group') === name).click();

/** Jede Stelle der sechs Funktionen, je in einer frischen Karte geöffnet: Name → gefunden? */
function funde(optionen) {
  const sieht = {};
  let k = aufbau(optionen);
  menuePunkt(k, 'settings'); gruppe(k, 'audio');
  sieht.sprachpaket = !!$d(k.u, '[data-action="voice-pack"]');
  k = aufbau(optionen);
  menuePunkt(k, 'settings'); gruppe(k, 'other');
  sieht.shortcutsEinstellungen = !!$d(k.u, '[data-action="shortcuts-manage"]');
  k = aufbau(optionen);
  k.karte.shadowRoot.querySelector('[data-action="shortcuts"]').click();
  sieht.shortcutsMenue = !!$d(k.u, '[data-action="manage"]');
  k = aufbau(optionen);
  menuePunkt(k, 'consumables');
  sieht.zuruecksetzen = $$d(k.u, '[data-action="reset"]').length > 0;
  k = aufbau(optionen);
  sieht.stift = !!k.karte._map.tools.querySelector('[data-action="map-edit"]');
  menuePunkt(k, 'maps');
  const zeile = $d(k.u, '[data-map="3"]');
  sieht.kartenLoeschen = zeile.querySelectorAll('[data-action="delete"]').length > 0;
  sieht.kartenBearbeiten = zeile.querySelectorAll('[data-action="edit"]').length > 0;
  zeile.querySelectorAll('[data-action="backups"]')[0].click();
  sieht.wiederherstellen = $$d(k.u, '[data-action="restore"]').length > 0;
  sieht.herunterladen = $$d(k.u, '[data-action="download"]').length > 0;
  sieht.grundrissHinweis = /Grundriss/.test(dialogVon(k.u).shadowRoot.textContent);
  sieht.ausDatei = !!$d(k.u, '[data-action="restore-file"]');
  assert.deepEqual(k.u.fehler, []);
  return sieht;
}
const alle = (sieht, wert) => Object.fromEntries(Object.keys(sieht).map((n) => [n, wert]));

test('M8 admin_actions: Vorgabe admins, all bleibt, Unbekanntes = admins; Editorfeld in Bedienung mit Label/Helper und Optionen DE/EN', () => {
  const I = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  const norm = (extra) => I.normalizeConfig(Object.assign({ entity: 'vacuum.robo' }, extra)).admin_actions;
  assert.deepEqual([norm({}), norm({ admin_actions: 'all' }), norm({ admin_actions: 'admins' }), norm({ admin_actions: 'jeder' })], ['admins', 'all', 'admins', 'admins']);
  const bedienung = I.SCHEMA.find((f) => f.name === 'operation_section');
  const feld = bedienung.schema.find((f) => f.name === 'admin_actions');
  assert.deepEqual(feld.selector.select.options, ['admins', 'all']);
  for (const sprache of ['de', 'en']) {
    const t = I.TEXTE[sprache];
    assert.ok(t.labels.admin_actions && t.helpers.admin_actions, sprache + ': Label und Helper');
    assert.ok(t.texte.admin_admins && t.texte.admin_all, sprache + ': Optionen');
  }
  assert.match(I.TEXTE.de.helpers.admin_actions, /Vorgabe Nur Admins/);
});

test('M8 can(): ohne Admin-Recht sind die ADMIN_ONLY-Fähigkeiten falsch, andere unverändert; Admin und admin_actions all wie heute; ohne hass.user kein Admin', () => {
  const namen = ['dreame_vacuum.vacuum_install_voice_pack', 'dreame_vacuum.vacuum_restore_map_from_file', 'dreame_vacuum.vacuum_delete_map',
    'map_recovery', 'map_edit', 'shortcut_manage', 'consumable_reset', 'map_download'];
  const werte = (k) => namen.map((n) => k.karte._model().can(n));
  const admin = aufbau();
  assert.deepEqual(werte(admin), namen.map(() => true), 'Fixture voll kann alles');
  assert.deepEqual(werte(aufbau({ user: NICHT_ADMIN })), namen.map(() => false));
  assert.deepEqual(werte(aufbau({ user: null })), namen.map(() => false), 'ohne hass.user');
  assert.deepEqual(werte(aufbau({ user: NICHT_ADMIN, config: { admin_actions: 'all' } })), namen.map(() => true));
  const gast = aufbau({ user: NICHT_ADMIN }).karte._model();
  for (const n of ['map', 'shortcuts', 'consumables', 'settings', 'dreame_vacuum.vacuum_rename_map', 'dreame_vacuum.vacuum_backup_map']) assert.equal(gast.can(n), admin.karte._model().can(n), n);
});

test('M8 Nicht-Admin sieht die sechs Funktionen nirgends (Einstellungen, Shortcut-Menü, Zubehör, Kartenstift, Kartenverwaltung, Sicherungen)', () => {
  const gast = funde({ user: NICHT_ADMIN });
  assert.deepEqual(gast, alle(gast, false));
});

test('M8 Admin und admin_actions all sehen alles wie heute', () => {
  const admin = funde({});
  assert.deepEqual(admin, alle(admin, true));
  assert.deepEqual(funde({ user: NICHT_ADMIN, config: { admin_actions: 'all' } }), admin);
});

test('M8 Nicht-Admin: Sicherungsliste ohne den Hinweis „nur ansehen und herunterladen“, Zubehör zeigt weiter die Prozente', () => {
  const k = aufbau({ user: NICHT_ADMIN });
  menuePunkt(k, 'consumables');
  assert.ok($$d(k.u, '[data-part]').length >= 3, 'Teile mit Rest bleiben sichtbar');
  // Gerät ohne Wiederherstellen: der Hinweis „lassen sich nur ansehen und herunterladen“ wäre für Gäste falsch.
  const l = aufbau({ user: NICHT_ADMIN });
  l.karte.hass = l.haus.setze(sauger(l.haus, { map_recovery_status: undefined }));
  menuePunkt(l, 'maps');
  $d(l.u, '[data-map="3"]').querySelectorAll('[data-action="backups"]')[0].click();
  assert.doesNotMatch(dialogVon(l.u).shadowRoot.textContent, /nur ansehen/);
  assert.ok($$d(l.u, '.backup-entry').length > 0, 'die Stände bleiben sichtbar');
});
