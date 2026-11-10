'use strict';
// Modul dock (Plan 2026-11-10): Dock-Schlüssel, Fähigkeiten, Stationsstatus,
// Dock-Knopf mit Aktionsmenü, Station-Dialog mit Reitern und Wartung.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));

function sauger(haus, attribute = {}, zustand) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
}
function aufbau(name = 'voll', { attribute, states, zustand, config, speicher } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (speicher !== undefined) u.kontext.localStorage = speicher;
  if (attribute || zustand) haus.states = Object.assign({}, haus.states, sauger(haus, attribute, zustand));
  if (states) haus.states = Object.assign({}, haus.states, states);
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
const aufrufe = (k) => roh(k.haus.rufe);
const aktion = (key, value) => ({ domain: 'dreame_vacuum', service: 'vacuum_call_action', data: Object.assign({ entity_id: 'vacuum.robo', key }, value === undefined ? {} : { value }) });
const caps = (k) => k.haus.states['vacuum.robo'].attributes.capabilities;

// ── Task 1: Schlüssel, Fähigkeiten, Stationsstatus ────────────────────────────

test('Alle Dock-Schlüssel der Spec stehen in SETTINGS (Gruppe station) mit genau einem Reiter', () => {
  const { I } = aufbau();
  const spec = {
    wash: ['self_clean', 'washing_mode', 'water_temperature', 'smart_mop_washing', 'auto_rewashing', 'auto_recleaning', 'self_clean_frequency',
      'self_clean_area', 'self_clean_time', 'auto_add_detergent', 'auto_water_refilling', 'auto_mount_mop', 'hot_washing', 'uv_sterilization',
      'mop_wash_level', 'mopping_with_detergent', 'mop_washing_with_detergent', 'self_clean_by_zone', 'mop_clean_frequency', 'ultra_clean_mode'],
    dry: ['auto_drying', 'drying_time', 'silent_drying', 'smart_drying', 'dust_bag_drying'],
    empty: ['auto_dust_collecting', 'auto_empty_mode', 'auto_empty_frequency', 'auto_empty_area']
  };
  for (const [tab, keys] of Object.entries(spec)) {
    for (const key of keys) assert.deepEqual([key, I.SETTINGS[key] && I.SETTINGS[key].group, I.SETTINGS[key] && I.SETTINGS[key].tab], [key, 'station', tab]);
  }
  const station = Object.keys(I.SETTINGS).filter((key) => I.SETTINGS[key].group === 'station');
  assert.deepEqual(station.filter((key) => !Object.values(spec).flat().includes(key)), [], 'kein Stationsschlüssel ohne Reiter');
  assert.deepEqual(roh(I.STATION_TABS), ['wash', 'dry', 'empty']);
});

// Erwartet je Fixture: [voll, minimal, ohne-dock, ohne-karte]; Nachreinigen braucht die Fähigkeit map (button.py#L288).
const KANN = {
  dock: [1, 0, 0, 1], wash: [1, 0, 0, 1], dry: [1, 0, 0, 1], dust_bag_dry: [0, 0, 0, 0], empty: [1, 0, 0, 1], drain: [1, 0, 0, 1],
  empty_tank: [1, 0, 0, 1], station_cleaning: [1, 0, 0, 1], self_repair: [1, 0, 0, 1], recleaning: [1, 0, 0, 0]
};
for (const [i, name] of ['voll', 'minimal', 'ohne-dock', 'ohne-karte'].entries()) {
  test(`can() der Station für ${name}`, () => {
    const m = aufbau(name).model();
    const ist = Object.fromEntries(Object.keys(KANN).map((k) => [k, m.can(k) ? 1 : 0]));
    assert.deepEqual(ist, Object.fromEntries(Object.entries(KANN).map(([k, v]) => [k, v[i]])));
  });
}

test('can() synthetisch: nur Entleeren, nur Waschen, nur Beuteltrocknung; ohne vacuum_call_action keine Aktion', () => {
  const ohne = (k, weg, dazu = []) => caps(k).filter((c) => !weg.includes(c)).concat(dazu);
  const basis = aufbau();
  const leeren = aufbau('voll', { attribute: { capabilities: ohne(basis, ['self_wash_base', 'drainage', 'water_tank_draining', 'station_cleaning', 'auto_recleaning']) } }).model();
  assert.deepEqual(['dock', 'wash', 'dry', 'empty', 'drain', 'self_repair'].map((n) => leeren.can(n)), [true, false, false, true, false, false]);
  const waschen = aufbau('voll', { attribute: { capabilities: ohne(basis, ['auto_empty_base']) } }).model();
  assert.deepEqual(['dock', 'wash', 'dry', 'empty'].map((n) => waschen.can(n)), [true, true, true, false]);
  const beutel = aufbau('voll', { attribute: { capabilities: ohne(basis, ['self_wash_base', 'auto_empty_base'], ['dust_bag_drying']) } }).model();
  assert.deepEqual(['dock', 'wash', 'dry', 'dust_bag_dry', 'empty'].map((n) => beutel.can(n)), [true, false, false, true, false], 'Trocknen zählt zur Station');
  const k = aufbau();
  k.haus.services = Object.assign({}, k.haus.services, { dreame_vacuum: Object.fromEntries(Object.entries(k.haus.services.dreame_vacuum).filter(([s]) => s !== 'vacuum_call_action')) });
  k.karte.hass = k.haus.hass();
  assert.deepEqual(['dock', 'wash', 'empty', 'drain'].map((n) => k.model().can(n)), [true, false, false, false]);
});

test('stationStatus: alle Stationswerte mit Stufe, Text und Symbol; Probleme zuerst', () => {
  const k = aufbau();
  const liste = k.I.stationStatus(k.model());
  const keys = liste.map((s) => s.key);
  for (const key of ['clean_water_tank_status', 'dirty_water_tank_status', 'dust_bag_status', 'detergent_status', 'hot_water_status',
    'station_drainage_status', 'self_wash_base_status', 'auto_empty_status', 'low_water_warning', 'dust_collection', 'drying_left', 'drying_progress',
    'washing', 'drying', 'draining_available', 'washing_available', 'drying_available', 'dust_collection_available']) assert.ok(keys.includes(key), key);
  for (const s of liste) {
    assert.ok(s.label && s.text && s.icon && ['error', 'warning', 'info', 'ok'].includes(s.level), JSON.stringify(s));
  }
  assert.ok(liste.every((s) => s.level === 'ok' || s.level === 'info'), 'voll: alles in Ordnung');
  const p = aufbau('voll', { attribute: { dust_bag_status: 'Check', clean_water_tank_status: 'Not installed', low_water_warning: 'Please fill clean water tank' } });
  const l2 = p.I.stationStatus(p.model());
  assert.deepEqual(l2.slice(0, 3).map((s) => [s.key, s.level]), [['clean_water_tank_status', 'error'], ['dust_bag_status', 'warning'], ['low_water_warning', 'warning']]);
  assert.equal(l2[0].icon, 'mdi:alert-circle-outline');
  assert.deepEqual(roh(p.I.dockStatus(p.model())), { level: 'error', key: 'frischwasserFehlt' }, 'dockStatus unverändert: Farbe/Kurztext');
  assert.deepEqual((() => { const o = aufbau("ohne-dock"); return o.I.stationStatus(o.model()); })(), []);
});

test('stationStatus: laufende Vorgänge als Text (Waschen, pausiert, Trocknen mit Rest)', () => {
  const k = aufbau('voll', { attribute: { washing: true, washing_paused: true, drying: true } });
  const nach = Object.fromEntries(k.I.stationStatus(k.model()).map((s) => [s.key, s]));
  assert.equal(nach.washing.level, 'info');
  assert.match(nach.washing.text, /Ja/);
  assert.match(nach.washing_paused.text, /Ja/);
  assert.match(nach.draining_available.text, /Ja/);
});

test('Geräteinfo (ALL-12) nennt die Stationsprobleme aus stationStatus', () => {
  const k = aufbau('voll', { attribute: { dust_bag_status: 'Check' } });
  k.karte._openDialog(k.I.MODULE_VIEWS.settings(k.karte));
  const d = k.u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG');
  d.shadowRoot.querySelectorAll('[data-group]').find((b) => b.getAttribute('data-group') === 'info').click();
  assert.match(d.shadowRoot.querySelector('[data-info="station"]').textContent, /Dust bag status: Check/);
});

// ── Task 2: Dock-Knopf und Aktionsmenü (DOCK-05) ─────────────────────────────

const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const dockKnopf = (k) => k.karte.shadowRoot.querySelector('.dock');
function dockMenue(name = 'voll', optionen) {
  const k = aufbau(name, optionen);
  dockKnopf(k).click();
  return k;
}
const menueEintraege = (k) => $$d(k.u, '[data-station-action]').map((b) => b.getAttribute('data-station-action'));
const menueEintrag = (k, name) => $$d(k.u, '[data-station-action]').find((b) => b.getAttribute('data-station-action') === name);

test('Dock-Anzeige ist ein Knopf mit Text und Farbe wie bisher; ohne Dock keiner', () => {
  const k = aufbau('voll', { attribute: { dust_bag_status: 'Check' } });
  const knopf = dockKnopf(k);
  assert.equal(knopf.tagName, 'BUTTON');
  assert.equal(knopf.getAttribute('aria-haspopup'), 'menu');
  assert.equal(knopf.getAttribute('data-dock'), 'warning');
  assert.match(knopf.textContent, /Station · Staubbeutel/);
  assert.match(knopf.getAttribute('aria-label'), /Station · Staubbeutel/);
  assert.equal(dockKnopf(aufbau('ohne-dock')), null);
  assert.equal(dockKnopf(aufbau('voll', { config: { hidden_card_objects: ['dock_status_indicator'] } })), null);
  assert.deepEqual(k.haus.rufe, []);
});

test('Menü je Zustand mit genau den möglichen Einträgen', () => {
  const weg = { washing_available: false, drying_available: false, dust_collection_available: false };
  const faelle = [
    ['angedockt', {}, 'docked', ['wash', 'dry', 'empty', 'return?', 'settings']],
    ['waschend', { washing: true }, 'docked', ['wash', 'dry', 'empty', 'settings']],
    ['trocknend', { drying: true, washing_available: false }, 'docked', ['dry', 'empty', 'settings']],
    ['unterwegs', weg, 'cleaning', ['return', 'settings']],
    ['Fehler', weg, 'error', ['return', 'settings']]
  ];
  for (const [fall, attribute, zustand, soll] of faelle) {
    const k = dockMenue('voll', { attribute, zustand });
    assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'menu', fall);
    assert.deepEqual(menueEintraege(k), soll.filter((e) => e !== 'return?'), fall);
  }
  assert.match(menueEintrag(dockMenue('voll', { attribute: { washing: true } }), 'wash').textContent, /Waschen läuft · pausieren/);
  assert.match(menueEintrag(dockMenue('voll', { attribute: { washing: true, washing_paused: true } }), 'wash').textContent, /pausiert · fortsetzen/);
  assert.match(menueEintrag(dockMenue('voll', { attribute: { drying: true } }), 'dry').textContent, /Trocknen läuft · stoppen/);
  const beutel = dockMenue('voll', { attribute: { capabilities: caps(aufbau()).concat('dust_bag_drying') } });
  assert.ok(menueEintraege(beutel).includes('dust_bag_dry'), 'Beutel trocknen, wenn vorhanden');
});

test('Jeder Eintrag ruft genau seinen Dienst; Doppeltipp = ein Aufruf', () => {
  const soll = { wash: aktion('toggle_washing'), dry: aktion('toggle_drying'), empty: aktion('start_auto_empty'), dust_bag_dry: aktion('toggle_dust_bag_drying') };
  for (const [name, aufruf] of Object.entries(soll)) {
    const k = dockMenue('voll', { attribute: { capabilities: caps(aufbau()).concat('dust_bag_drying') } });
    const e = menueEintrag(k, name);
    e.click();
    e.click();
    assert.deepEqual(aufrufe(k), [aufruf], name);
  }
  const z = dockMenue('voll', { attribute: { washing_available: false }, zustand: 'cleaning' });
  const zurueck = menueEintrag(z, 'return');
  assert.match(zurueck.textContent, /Zurück/, 'gleicher Text wie der Steuerknopf (R01)');
  zurueck.click();
  zurueck.click();
  assert.deepEqual(aufrufe(z), [{ domain: 'vacuum', service: 'return_to_base', data: { entity_id: 'vacuum.robo' } }]);
});

test('Laufender Aufruf zeigt Zustand; Erfolg schließt das Menü, Fehler bleibt mit R12-Text', async () => {
  const k = dockMenue();
  let fertig;
  k.haus.antwort = () => new Promise((ok) => { fertig = ok; });
  menueEintrag(k, 'wash').click();
  const busy = menueEintrag(k, 'wash');
  assert.equal(busy.getAttribute('aria-busy'), 'true');
  assert.equal(busy.disabled, true);
  assert.match(busy.textContent, /Wird gestartet/);
  fertig();
  await mikro();
  k.u.uhr.vor(400);
  assert.equal(dialogVon(k.u), null, 'Menü zu');
  const f = dockMenue();
  f.haus.antwort = () => Promise.reject(new Error('nicht verfügbar während Reinigung'));
  menueEintrag(f, 'empty').click();
  await mikro();
  const note = $d(f.u, '[data-note="empty"]');
  assert.match(note.textContent, /nicht verfügbar während Reinigung/);
  assert.match(note.textContent, /erneut/);
  assert.equal(menueEintrag(f, 'empty').disabled, false, 'wieder bedienbar');
});

test('Station-Einstellungen aus dem Dock-Menü', () => {
  const k = dockMenue();
  menueEintrag(k, 'settings').click();
  assert.equal($d(k.u, 'h1').textContent, 'Station');
  assert.notEqual($d(k.u, '.sheet').getAttribute('data-kind'), 'menu');
});
