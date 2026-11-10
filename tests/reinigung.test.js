'use strict';
// Modul clean-settings (Plan 2026-11-10): Reinigungseinstellungen global, CleanGenius,
// Customized Cleaning je Raum, Mop-Typ, Reinigungsreihenfolge.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const SCHLUESSEL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'integration-schluessel.json'), 'utf8'));
const CAM = 'camera.robo_map';

function sauger(haus, attribute = {}, zustand) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
}
/** Karte aus einer Fixture; `attribute` ergänzen den Sauger, `raeume` ersetzen Räume der Kamera (je id gemischt). */
function aufbau(name = 'voll', { attribute, zustand, config, caps, raeume, services } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (attribute || zustand || caps) {
    const s = sauger(haus, attribute, zustand);
    if (caps) s['vacuum.robo'].attributes.capabilities = caps(s['vacuum.robo'].attributes.capabilities);
    haus.states = Object.assign({}, haus.states, s);
  }
  if (raeume) {
    const c = haus.states[CAM], r = roh(c.attributes.rooms);
    for (const [id, werte] of Object.entries(raeume)) r[id] = Object.assign({}, r[id], werte);
    haus.states = Object.assign({}, haus.states, { [CAM]: Object.assign({}, c, { attributes: Object.assign({}, c.attributes, { rooms: r }) }) });
  }
  if (services) haus.services = services(haus.services);
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
const aufrufe = (k) => roh(k.haus.rufe);
const setze = (key, value) => ({ domain: 'dreame_vacuum', service: 'vacuum_set_property', data: { entity_id: 'vacuum.robo', key, value } });
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const knopf = (k) => k.karte.shadowRoot.querySelector('[data-action="clean-settings"]');
function einstellungen(name, optionen) {
  const k = aufbau(name, optionen);
  knopf(k).click();
  return k;
}
const abschnitte = (k) => $$d(k.u, '[data-section]').map((s) => s.getAttribute('data-section'));
const zeileD = (k, key) => $d(k.u, '[data-setting="' + key + '"]');
const grund = (k, key) => {
  const z = k.I.settingRow(k.karte, k.model(), key);
  return z && z.getAttribute('data-state') === 'locked' ? z.querySelector('.setting-status').textContent : '';
};

// ── Task 1: globale Schlüssel, Knopf, Wiederholungen ────────────────────────

const GLOBAL = ['cleaning_mode', 'suction_level', 'mop_pad_humidity', 'wetness_level', 'water_volume', 'cleaning_route', 'mop_pressure',
  'customized_cleaning', 'cleangenius', 'cleangenius_mode'];

test('SETTINGS: ALL-01-Anteil in Gruppe clean; Raumschlüssel vollständig clean-settings oder map-editor', () => {
  const { I } = aufbau();
  for (const key of GLOBAL) assert.equal(I.SETTINGS[key] && I.SETTINGS[key].group, 'clean', key);
  const raum = [...SCHLUESSEL.raum.select, ...SCHLUESSEL.raum.number];
  const abgedeckt = [...I.ROOM_KEYS['clean-settings'], ...I.ROOM_KEYS['map-editor']];
  assert.deepEqual(raum.filter((k) => !abgedeckt.includes(k)), [], 'kein Raumschlüssel ohne Modul');
  assert.deepEqual(I.ROOM_KEYS['map-editor'].sort(), ['floor_material', 'floor_material_direction', 'name', 'visibility']);
});

test('Knopf „Einstellungen“ je Zustand (SET-01): Ruhe/Aufgabe ja; geplant, Shortcut, CleanGenius-Aufgabe nein', () => {
  const sichtbar = (opt) => !!knopf(aufbau('voll', opt));
  assert.equal(sichtbar(), true, 'Ruhe');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true } }), true, 'normale Aufgabe');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true, scheduled_clean: true } }), false, 'geplant');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true, shortcut_task: true } }), false, 'Shortcut');
  assert.equal(sichtbar({ zustand: 'cleaning', attribute: { started: true, cleangenius_cleaning: true } }), false, 'CleanGenius-Aufgabe');
  assert.equal(sichtbar({ attribute: { cleangenius_cleaning: true } }), true, 'Ruhe mit CleanGenius: sonst nicht abschaltbar');
  assert.equal(sichtbar({ config: { hidden_card_objects: ['task_type'] } }), false, 'task_type ausgeblendet');
  assert.equal(sichtbar({ services: (s) => ({ vacuum: s.vacuum, dreame_vacuum: {} }) }), false, 'ohne vacuum_set_property');
  assert.equal(knopf(aufbau()).textContent.includes('Einstellungen'), true, 'Text, nicht nur Symbol');
});

test('Dialog „Reinigungseinstellungen“: kind editor, Abschnitte in Reihenfolge, leere entfallen', () => {
  const k = einstellungen();
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'editor');
  assert.equal($d(k.u, 'h1').textContent, 'Reinigungseinstellungen');
  assert.deepEqual(abschnitte(k).slice(0, 3), ['cleangenius', 'basic', 'customized']);
  assert.equal(abschnitte(k).at(-1), 'more');
  const ohne = einstellungen('voll', { caps: (c) => c.filter((x) => !['cleangenius', 'customized_cleaning'].includes(x)), attribute: { cleangenius: undefined, cleangenius_list: undefined, customized_cleaning: undefined } });
  assert.deepEqual(abschnitte(ohne).filter((s) => ['cleangenius', 'customized'].includes(s)), [], 'ohne Fähigkeit/Wert kein Abschnitt');
});

test('Grundeinstellungen: Wert aus voll.json, genau ein vacuum_set_property je Änderung', () => {
  const soll = { cleaning_mode: ['Mopping after sweeping', 'Sweeping'], suction_level: ['Turbo', 'Quiet'], mop_pad_humidity: ['Moist', 'Wet'], cleaning_route: ['Deep', 'Quick'] };
  for (const [key, [ist, neu]] of Object.entries(soll)) {
    const k = einstellungen();
    const feld = zeileD(k, key).querySelector('select');
    assert.equal(feld.value, ist, key);
    feld.value = neu;
    feld.dispatchEvent(k.u.neuesEreignis('change'));
    assert.deepEqual(aufrufe(k), [setze(key, neu)], key);
  }
  const k = einstellungen();
  const nass = zeileD(k, 'wetness_level').querySelector('input');
  assert.equal(nass.value, '26');
  assert.deepEqual([nass.getAttribute('min'), nass.getAttribute('max')], ['1', '32']);
  nass.value = '12';
  nass.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze('wetness_level', 12)]);
  const sw = aufbau('voll', { caps: (c) => c.concat('mop_clean_frequency') });
  assert.equal(sw.I.settingState(sw.karte, sw.model(), 'wetness_level').max, 15, 'mit mop_clean_frequency 1–15 (number.py#L166)');
  // X40 hat weder water_volume noch mop_pressure: keine Zeile; synthetisch mit _list ja.
  assert.equal(zeileD(k, 'water_volume'), null);
  assert.equal(zeileD(k, 'mop_pressure'), null);
  const syn = einstellungen('voll', { attribute: { water_volume: 'Medium', water_volume_list: ['Low', 'Medium', 'High'], mop_pressure: 'Light', mop_pressure_list: ['Light', 'Normal'] } });
  for (const [key, neu] of [['water_volume', 'High'], ['mop_pressure', 'Normal']]) {
    const feld = zeileD(syn, key).querySelector('select');
    feld.value = neu;
    feld.dispatchEvent(syn.u.neuesEreignis('change'));
  }
  assert.deepEqual(aufrufe(syn), [setze('water_volume', 'High'), setze('mop_pressure', 'Normal')]);
});

test('Sperren mit Grund: leere _list, CleanGenius, Customized Cleaning, laufende Aufgabe', () => {
  assert.match(grund(aufbau('voll', { attribute: { cleaning_route_list: [] } }), 'cleaning_route'), /erlaubt die Änderung gerade nicht/);
  assert.match(grund(aufbau('voll', { attribute: { cleangenius_cleaning: true } }), 'suction_level'), /CleanGenius/);
  assert.match(grund(aufbau('voll', { attribute: { customized_cleaning: true } }), 'suction_level'), /je Raum/);
  assert.match(grund(aufbau('voll', { attribute: { customized_cleaning: true } }), 'cleaning_mode'), /je Raum/, 'custom_cleaning_mode');
  assert.equal(grund(aufbau('voll', { attribute: { customized_cleaning: true }, caps: (c) => c.filter((x) => x !== 'custom_cleaning_mode') }), 'cleaning_mode'), '');
  assert.match(grund(aufbau('voll', { zustand: 'cleaning', attribute: { started: true } }), 'cleaning_route'), /Während einer Aufgabe/);
  assert.match(grund(aufbau('voll', { zustand: 'cleaning', attribute: { started: true } }), 'customized_cleaning'), /Während einer Aufgabe/);
  assert.match(grund(aufbau('voll', { attribute: { has_saved_map: false } }), 'customized_cleaning'), /gespeicherter Karte/);
  assert.equal(grund(aufbau(), 'suction_level'), '');
});

test('Wiederholungen (repeatsRow): 1–3 im Speicher der Karte, geteilt mit der Aufgabenwahl', () => {
  const k = einstellungen();
  const zeile = () => $d(k.u, '.task-repeats');
  assert.match(zeile().textContent, /1×/);
  assert.match(zeile().textContent, /Raum ohne Customized Cleaning, Zone und Spot/);
  assert.equal(zeile().querySelector('[data-action="repeats-minus"]').disabled, true);
  zeile().querySelector('[data-action="repeats-plus"]').click();
  zeile().querySelector('[data-action="repeats-plus"]').click();
  assert.equal(zeile().querySelector('[data-action="repeats-plus"]').disabled, true);
  assert.equal(k.karte._repeats, 3);
  assert.deepEqual(aufrufe(k), [], 'kein Geräteschlüssel');
  const panel = k.karte.shadowRoot.querySelector('.task-repeats');
  if (panel) assert.match(panel.textContent, /3×/, 'Aufgabenwahl zeigt denselben Wert');
});

test('„Weitere Reinigungseinstellungen“ springt in device-settings, Gruppe Reinigung', () => {
  const k = einstellungen();
  $d(k.u, '[data-action="more-cleaning"]').click();
  assert.equal($d(k.u, 'h1').textContent, 'Reinigung');
  assert.ok(zeileD(k, 'max_suction_power'), 'Zeilen der Gruppe cleaning');
});

// ── Task 2: CleanGenius ─────────────────────────────────────────────────────

test('CleanGenius: Auswahl schreibt über vacuum_set_property; Modus nur bei CleanGenius an', () => {
  const k = einstellungen();
  const feld = zeileD(k, 'cleangenius').querySelector('select');
  assert.equal(feld.value, 'Off');
  assert.equal(zeileD(k, 'cleangenius_mode'), null, 'CleanGenius aus: Modus ausgeblendet');
  feld.value = 'Deep cleaning';
  feld.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze('cleangenius', 'Deep cleaning')]);
  const an = einstellungen('voll', { attribute: { cleangenius: 'Routine cleaning', cleangenius_cleaning: true, cleangenius_mode_list: ['Vacuum and mop', 'Mop after vacuum'] } });
  const modus = zeileD(an, 'cleangenius_mode').querySelector('select');
  assert.equal(modus.value, 'Mop after vacuum');
  modus.value = 'Vacuum and mop';
  modus.dispatchEvent(an.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(an), [setze('cleangenius_mode', 'Vacuum and mop')]);
});

test('CleanGenius an: Customized Cleaning ausgeblendet mit Satz, Grundwerte gesperrt mit Grund', () => {
  const k = einstellungen('voll', { attribute: { cleangenius: 'Routine cleaning', cleangenius_cleaning: true } });
  assert.equal(zeileD(k, 'customized_cleaning'), null);
  assert.match($d(k.u, '[data-section="customized"]').textContent, /CleanGenius wählt die Einstellungen je Raum selbst/);
  for (const key of ['cleaning_mode', 'suction_level', 'wetness_level', 'cleaning_route']) {
    assert.equal(zeileD(k, key).getAttribute('data-state'), 'locked', key);
    assert.match(zeileD(k, key).textContent, /CleanGenius/, key);
  }
});

test('CleanGenius selbst gesperrt (leere Liste: Aufgabe, Zone/Spot, Mop fehlt) mit Grund', () => {
  assert.match(grund(aufbau('voll', { attribute: { cleangenius_list: [] } }), 'cleangenius'), /Zone\/Spot|Mop/);
  assert.match(grund(aufbau('voll', { zustand: 'cleaning', attribute: { started: true } }), 'cleangenius'), /Während einer Aufgabe/);
});
