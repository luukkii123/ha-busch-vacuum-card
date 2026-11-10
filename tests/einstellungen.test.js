'use strict';
// Modul device-settings (Plan 2026-11-10): Einstellungstabelle, Zeile, Schreibweg,
// Übersicht, Gruppen, Nicht stören, Zeitpläne, Zubehör, Geräteinfo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const SCHLUESSEL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'integration-schluessel.json'), 'utf8'));

function sauger(haus, attribute = {}, zustand) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
}

/** Karte mit Fixture; `attribute` ergänzen den Sauger. */
function aufbau(name = 'voll', { attribute, states, zustand } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (attribute || zustand) haus.states = Object.assign({}, haus.states, sauger(haus, attribute, zustand));
  if (states) haus.states = Object.assign({}, haus.states, states);
  const karte = neueKarte(u, haus);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
const zeile = (k, key) => k.I.settingRow(k.karte, k.model(), key);
/** Neuer Sauger-Zustand wie von HA (Karte und Dialog bekommen ihn). */
function neu(k, attribute) { k.karte.hass = k.haus.setze(sauger(k.haus, attribute)); }
const aufrufe = (k) => roh(k.haus.rufe);
const setze = (_k, key, value) => ({ domain: 'dreame_vacuum', service: 'vacuum_set_property', data: { entity_id: 'vacuum.robo', key, value } });

// Dialog
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
function menue(k) { k.karte.shadowRoot.querySelector('.menu-button').click(); }
const eintrag = (u, name) => $$d(u, '.menu-item').find((b) => b.getAttribute('data-entry') === name);
function einstellungen(name = 'voll', optionen) {
  const k = aufbau(name, optionen);
  menue(k);
  eintrag(k.u, 'settings').click();
  return k;
}
const gruppe = (k, name) => $$d(k.u, '[data-group]').find((b) => b.getAttribute('data-group') === name);

// ── Task 1: Tabelle, Zustand, Zeile, Schreibweg, Menü-Registry ─────────────────

test('Vollständigkeit: jeder Geräteschlüssel v2.0.3 steht in SETTINGS mit seiner Plattform', () => {
  const { I } = aufbau();
  const fehlt = [], falsch = [];
  for (const [plattform, keys] of Object.entries(SCHLUESSEL.geraet)) {
    for (const key of keys) {
      if (!I.SETTINGS[key]) fehlt.push(key);
      // Je Modell zwei Plattformen: drying_time Auswahl/Zahl, wider_corner_coverage Schalter/Auswahl
      // (select.py/switch.py); die Tabelle führt eine, der Schreibweg ist derselbe.
      else if (I.SETTINGS[key].platform !== plattform && !['drying_time', 'wider_corner_coverage'].includes(key)) falsch.push(key + ':' + plattform);
    }
  }
  assert.deepEqual(fehlt, []);
  assert.deepEqual(falsch, []);
  const alle = new Set(Object.values(SCHLUESSEL.geraet).flat());
  assert.deepEqual(Object.keys(I.SETTINGS).filter((k) => !alle.has(k)), ['custom_mopping_mode'], 'nur belegte Schlüssel ohne Entität');
  assert.equal(SCHLUESSEL.raum.modul, 'clean-settings/map-editor', 'Raumschlüssel gehören zu anderen Modulen');
  for (const key of Object.keys(I.SETTINGS)) assert.ok(I.SETTING_GROUPS.some((g) => g.name === I.SETTINGS[key].group) || ['clean'].includes(I.SETTINGS[key].group), key);
});

test('settingState: Attribut, aktivierte Entität, unbekannt, fehlt', () => {
  const k = aufbau('voll', { attribute: { ai_obstacle_detection: true } });
  const m = k.model();
  const lock = k.I.settingState(k.karte, m, 'child_lock');
  assert.deepEqual([lock.present, lock.known, lock.value, lock.source], [true, true, false, 'attr']);
  const fl = k.I.settingState(k.karte, m, 'mop_extend_frequency');
  assert.deepEqual(roh(fl.options), ['Standard', 'Intelligent', 'High']);
  assert.equal(fl.value, 'High');
  // pet_picture hat kein Attribut; die aktivierte Entität ist hier unbekannt → nie geraten.
  const pet = k.I.settingState(k.karte, m, 'pet_picture');
  assert.deepEqual([pet.present, pet.known, pet.source], [true, false, 'entity']);
  const k2 = aufbau('voll', { states: { 'switch.robo_pet_picture': { entity_id: 'switch.robo_pet_picture', state: 'on', attributes: {} } }, attribute: { ai_obstacle_detection: true } });
  const pet2 = k2.I.settingState(k2.karte, k2.model(), 'pet_picture');
  assert.deepEqual([pet2.known, pet2.value, pet2.source], [true, true, 'entity']);
  const licht = k.I.settingState(k.karte, m, 'camera_light_brightness');
  assert.deepEqual([licht.present, licht.known, licht.min, licht.max], [true, false, 40, 100]);
  assert.equal(k.I.settingState(k.karte, m, 'hair_compression').present, false);
  assert.equal(zeile(k, 'hair_compression'), null, 'keine Zeile für Fehlendes (R18)');
});

test('leere Liste der Integration = Zeile gesperrt mit Grund', () => {
  const k = aufbau('voll', { attribute: { mop_extend_frequency_list: [] } });
  const s = k.I.settingState(k.karte, k.model(), 'mop_extend_frequency');
  assert.equal(s.locked, true);
  assert.match(s.reason, /gerade nicht/);
  const z = zeile(k, 'mop_extend_frequency');
  assert.equal(z.querySelector('select').disabled, true);
  assert.match(z.querySelector('.setting-status').textContent, /gerade nicht/);
});

test('Schalter: genau ein vacuum_set_property mit 1/0, Doppeltipp = ein Aufruf, role=switch', () => {
  const k = aufbau();
  const z = zeile(k, 'child_lock');
  const knopf = z.querySelector('[role="switch"]');
  assert.equal(knopf.getAttribute('aria-checked'), 'false');
  assert.match(knopf.textContent, /Aus/, 'Zustand als Wort, nicht nur Farbe (R17)');
  knopf.click();
  knopf.click();
  const nach = zeile(k, 'child_lock').querySelector('[role="switch"]');
  assert.equal(nach.getAttribute('aria-checked'), 'true', 'optimistisch');
  assert.equal(nach.getAttribute('aria-busy'), 'true');
  nach.click();
  assert.deepEqual(aufrufe(k), [setze(k, 'child_lock', 1)]);
  assert.match(zeile(k, 'child_lock').querySelector('.setting-status').textContent, /Speichert/);
});

test('Auswahl, Zahl, Zeit: je genau ein Aufruf in der Form der Integration', () => {
  const k = aufbau();
  const sel = zeile(k, 'carpet_cleaning').querySelector('select');
  assert.deepEqual(sel.childNodes.map((o) => o.value), ['Avoidance', 'Adaptation', 'Remove mop', 'Vacuum and mop', 'Ignore']);
  sel.value = 'Ignore';
  sel.dispatchEvent(k.u.neuesEreignis('change'));
  const zahl = zeile(k, 'volume').querySelector('input');
  assert.deepEqual([zahl.getAttribute('type'), zahl.getAttribute('min'), zahl.getAttribute('max')], ['number', '0', '100']);
  zahl.value = '55';
  zahl.dispatchEvent(k.u.neuesEreignis('change'));
  const zeit = zeile(k, 'off_peak_charging_start').querySelector('input');
  assert.equal(zeit.getAttribute('type'), 'time');
  assert.equal(zeit.value, '22:00');
  zeit.value = '23:30';
  zeit.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'carpet_cleaning', 'Ignore'), setze(k, 'volume', 55), setze(k, 'off_peak_charging_start', '23:30')]);
});

test('Zahl außerhalb der Grenzen: kein Aufruf, Hinweis in der Zeile (R10)', () => {
  const k = aufbau();
  const zahl = zeile(k, 'volume').querySelector('input');
  zahl.value = '120';
  zahl.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), []);
  assert.match(zeile(k, 'volume').querySelector('.setting-status').textContent, /0.*100/);
});

test('Bestätigt erst über das Attribut; sonst nach OPTIMISTIC_HOLD_MS alter Wert und Hinweis', () => {
  const k = aufbau();
  zeile(k, 'child_lock').querySelector('[role="switch"]').click();
  neu(k, { child_lock: true });
  k.u.uhr.vor(6000);
  const ok = zeile(k, 'child_lock');
  assert.equal(ok.querySelector('[role="switch"]').getAttribute('aria-checked'), 'true');
  assert.equal(ok.querySelector('.setting-status').textContent, '');
  zeile(k, 'resume_cleaning').querySelector('[role="switch"]').click();
  k.u.uhr.vor(5000);
  const alt = zeile(k, 'resume_cleaning');
  assert.equal(alt.querySelector('[role="switch"]').getAttribute('aria-checked'), 'true', 'alter Wert');
  assert.match(alt.querySelector('.setting-status').textContent, /nicht übernommen/);
  assert.equal(alt.getAttribute('data-state'), 'error');
});

test('Dienstfehler: R12-Text mit Grund, Folge und nächstem Schritt; Wert zurück', async () => {
  const k = aufbau();
  k.haus.antwort = () => Promise.reject(new Error('Gerät offline'));
  zeile(k, 'child_lock').querySelector('[role="switch"]').click();
  await mikro();
  const z = zeile(k, 'child_lock');
  assert.equal(z.querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
  const text = z.querySelector('.setting-status').textContent;
  assert.match(text, /Gerät offline/);
  assert.match(text, /bisherige Wert/);
  assert.match(text, /erneut/);
});

test('Menü: Geräteeinstellungen und Zubehör öffnen Registry-Ansichten, andere bleiben Platzhalter', () => {
  const k = aufbau();
  menue(k);
  eintrag(k.u, 'settings').click();
  assert.equal($d(k.u, 'h1').textContent, 'Geräteeinstellungen');
  assert.equal($d(k.u, '.placeholder'), null);
  assert.ok(gruppe(k, 'carpet'), 'Gruppen statt Platzhalter');
  const k2 = aufbau();
  menue(k2);
  eintrag(k2.u, 'consumables').click();
  assert.equal($d(k2.u, 'h1').textContent, 'Zubehör');
  const k3 = aufbau();
  menue(k3);
  eintrag(k3.u, 'remote').click();
  assert.match($d(k3.u, '.placeholder').textContent, /remote/);
  assert.deepEqual(k.haus.rufe, []);
});

test('dock/clean-settings nutzen dieselbe Zeile ohne Änderung (Dock-Schlüssel)', () => {
  const k = aufbau();
  const sel = zeile(k, 'washing_mode').querySelector('select');
  sel.value = sel.childNodes[0].value;
  sel.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'washing_mode', sel.childNodes[0].value)]);
});

// ── Task 2: Übersicht, Gruppen, Suche (R25) ─────────────────────────────────

const gruppen = (k) => $$d(k.u, '[data-group]').map((b) => b.getAttribute('data-group'));
function uebersicht(name) {
  const k = aufbau(name);
  k.karte._openDialog(k.I.MODULE_VIEWS.settings(k.karte));
  return k;
}

test('Übersicht: Gruppen nur mit Inhalt (voll, ohne Dock, minimal)', () => {
  const k = einstellungen();
  assert.deepEqual(gruppen(k), ['cleaning', 'mopping', 'carpet', 'station', 'camera', 'audio', 'dnd', 'schedule', 'battery', 'consumables', 'info', 'other']);
  for (const b of $$d(k.u, '[data-group]')) assert.ok(b.textContent.trim(), 'Text, nicht nur Symbol');
  assert.ok(!gruppen(uebersicht('ohne-dock')).includes('station'));
  assert.deepEqual(gruppen(uebersicht('minimal')), ['info'], 'fremder Sauger: nur Geräteinfo');
});

test('Station führt in die Dock-Ansicht (Platzhalter bis Modul dock)', () => {
  const k = einstellungen();
  gruppe(k, 'station').click();
  assert.equal($d(k.u, 'h1').textContent, 'Station');
  assert.match($d(k.u, '.placeholder').textContent, /dock/);
});

test('Gruppe als Unterseite; Escape geht genau eine Ebene zurück', () => {
  const k = einstellungen();
  gruppe(k, 'carpet').click();
  assert.equal($d(k.u, 'h1').textContent, 'Teppich');
  assert.deepEqual($$d(k.u, '.setting').map((z) => z.getAttribute('data-setting')),
    ['carpet_recognition', 'carpet_avoidance', 'carpet_boost', 'intensive_carpet_cleaning', 'clean_carpets_first', 'side_brush_carpet_rotate', 'carpet_cleaning']);
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  k.u.zurueck();
  assert.equal($d(k.u, 'h1').textContent, 'Geräteeinstellungen');
  assert.ok(gruppe(k, 'carpet'));
});

test('Suche über alle Zeilen mit Ergebnisanzahl; leeres Ergebnis mit Text (R14/R18)', () => {
  const k = einstellungen();
  const feld = $d(k.u, 'input[type="search"]') || $d(k.u, '.settings-search');
  assert.equal(feld.getAttribute('aria-label'), 'Einstellungen durchsuchen');
  feld.value = 'carpet';
  feld.dispatchEvent(k.u.neuesEreignis('input'));
  const treffer = $$d(k.u, '.setting').map((z) => z.getAttribute('data-setting'));
  assert.ok(treffer.length >= 7 && treffer.every((key) => key.includes('carpet')), treffer.join());
  assert.equal($d(k.u, '.search-count').textContent, treffer.length + ' Treffer');
  assert.equal($$d(k.u, '[data-group]').length, 0, 'Treffer statt Gruppen');
  feld.value = 'xyz';
  feld.dispatchEvent(k.u.neuesEreignis('input'));
  assert.equal($$d(k.u, '.setting').length, 0);
  assert.match($d(k.u, '.search-count').textContent, /Keine Einstellung/);
  feld.value = '';
  feld.dispatchEvent(k.u.neuesEreignis('input'));
  assert.ok(gruppe(k, 'carpet'), 'leere Suche zeigt wieder die Gruppen');
});

test('Suche bleibt beim Neuzeichnen erhalten und nutzt HA-Namen der Integration', () => {
  const k = aufbau();
  const hass = k.haus.hass;
  k.haus.hass = () => Object.assign(hass(), { localize: (id) => (id === 'component.dreame_vacuum.entity.switch.child_lock.name' ? 'Kindersicherung' : '') });
  k.karte.hass = k.haus.hass();
  menue(k);
  eintrag(k.u, 'settings').click();
  const feld = $d(k.u, '.settings-search');
  feld.value = 'kinder';
  feld.dispatchEvent(k.u.neuesEreignis('input'));
  assert.deepEqual($$d(k.u, '.setting').map((z) => z.getAttribute('data-setting')), ['child_lock']);
  neu(k, { child_lock: true });
  assert.equal($d(k.u, '.settings-search').value, 'kinder');
  assert.deepEqual($$d(k.u, '.setting').map((z) => z.getAttribute('data-setting')), ['child_lock']);
});

// ── Task 3: Reinigung, Wischen, Teppich (ALL-01 Anteil, ALL-02, DEV-03/04) ────

const zeilen = (k) => $$d(k.u, '[data-setting]').map((z) => z.getAttribute('data-setting'));
const wert = (z) => {
  const s = z.querySelector('[role="switch"]');
  return s ? s.getAttribute('aria-checked') === 'true' : z.querySelector('select').value;
};
const ERWARTET_GRUPPEN = {
  cleaning: { resume_cleaning: true, max_suction_power: false, large_particles_boost: true, pet_focused_cleaning: false, floor_direction_cleaning: true, side_reach: true, gap_cleaning_extension: true },
  mopping: { custom_mopping_mode: true, tight_mopping: false, mop_extend: true, mopping_under_furnitures: true, mop_extend_frequency: 'High' },
  carpet: { carpet_recognition: true, carpet_avoidance: false, carpet_boost: true, intensive_carpet_cleaning: true, clean_carpets_first: false, side_brush_carpet_rotate: false, carpet_cleaning: 'Remove mop' }
};

for (const [name, erwartet] of Object.entries(ERWARTET_GRUPPEN)) {
  test(`${name}: jede Zeile der Spec-Tabelle mit Fixture-Wert und eigenem Schreibaufruf`, () => {
    const k = einstellungen();
    gruppe(k, name).click();
    assert.deepEqual(zeilen(k), Object.keys(erwartet));
    for (const z of $$d(k.u, '.setting')) assert.deepEqual([z.getAttribute('data-setting'), wert(z)], [z.getAttribute('data-setting'), erwartet[z.getAttribute('data-setting')]]);
    const soll = [];
    for (const key of Object.keys(erwartet)) {
      const z = $$d(k.u, '.setting').find((x) => x.getAttribute('data-setting') === key);
      const s = z.querySelector('[role="switch"]');
      if (s) { s.click(); soll.push(setze(k, key, erwartet[key] ? 0 : 1)); }
      else {
        const sel = z.querySelector('select');
        sel.value = sel.childNodes[0].value;
        sel.dispatchEvent(k.u.neuesEreignis('change'));
        soll.push(setze(k, key, sel.childNodes[0].value));
      }
    }
    assert.deepEqual(aufrufe(k), soll);
  });
}

test('side_reach: Wert aus der seit 10.11.2026 aktivierten Entität', () => {
  const k = aufbau();
  const s = k.I.settingState(k.karte, k.model(), 'side_reach');
  assert.deepEqual([s.source, s.value], ['entity', true]);
});

test('Teppich-Unterpunkte gesperrt mit Grund: Erkennung aus, Meiden an, Aufgabe läuft', () => {
  const unter = ['carpet_boost', 'intensive_carpet_cleaning', 'clean_carpets_first', 'side_brush_carpet_rotate', 'carpet_cleaning'];
  for (const [attribute, grund, zustand] of [[{ carpet_recognition: 0 }, /Teppicherkennung/], [{ carpet_avoidance: true }, /Teppich-Meiden/], [{ started: true }, /Aufgabe/, 'cleaning']]) {
    const k = aufbau('voll', { attribute, zustand });
    for (const key of unter) {
      const z = zeile(k, key);
      assert.equal(z.getAttribute('data-state'), 'locked', key);
      assert.match(z.querySelector('.setting-status').textContent, grund, key);
      assert.equal((z.querySelector('[role="switch"]') || z.querySelector('select')).disabled, true, key);
    }
    for (const key of ['carpet_recognition', 'carpet_avoidance']) assert.notEqual(zeile(k, key).getAttribute('data-state'), 'locked', key);
  }
  const frei = aufbau();
  for (const key of unter) assert.equal(zeile(frei, key).getAttribute('data-state'), 'ok', key);
});

test('Wischen verweist auf Station → Waschen (gleiche Zeilen, Abnahme dock); ohne Dock kein Verweis', () => {
  const k = einstellungen();
  gruppe(k, 'mopping').click();
  const link = $d(k.u, '[data-action="station"]');
  assert.match(link.textContent, /Station/);
  link.click();
  assert.equal($d(k.u, 'h1').textContent, 'Station');
  const o = einstellungen('ohne-dock');
  gruppe(o, 'mopping').click();
  assert.equal($d(o.u, '[data-action="station"]'), null);
});

// ── Task 4: Kamera und KI (ALL-06, DEV-05) ──────────────────────────────────

const zustand = (id, state, attributes = {}) => ({ [id]: { entity_id: id, state, attributes } });

test('Kamera und KI: alle Zeilen des Geräts, Werte aus Attribut bzw. aktivierter Entität', () => {
  const k = einstellungen();
  gruppe(k, 'camera').click();
  assert.deepEqual(zeilen(k), ['obstacle_avoidance', 'ai_obstacle_detection', 'ai_obstacle_image_upload', 'ai_obstacle_picture', 'ai_pet_detection',
    'ai_furniture_detection', 'ai_fluid_detection', 'fuzzy_obstacle_detection', 'pet_focused_detection', 'pet_picture', 'stain_avoidance',
    'collision_avoidance', 'fill_light', 'human_follow', 'camera_light_brightness_auto', 'camera_light_brightness']);
  const m = k.model();
  for (const key of ['obstacle_avoidance', 'ai_obstacle_detection', 'collision_avoidance', 'fill_light']) {
    assert.equal(k.I.settingState(k.karte, m, key).value, m.attr(key) === true || m.attr(key) === 1, key);
  }
  assert.deepEqual([k.I.settingState(k.karte, m, 'human_follow').source, k.I.settingState(k.karte, m, 'human_follow').value], ['entity', false]);
});

test('Die sieben früher deaktivierten Einstellungen: Entitätswert oder ehrlich „unbekannt“ mit Ein/Aus', () => {
  const k = aufbau('voll', { attribute: { ai_obstacle_detection: true } });
  for (const key of ['ai_furniture_detection', 'ai_fluid_detection', 'fuzzy_obstacle_detection', 'camera_light_brightness_auto']) {
    const z = zeile(k, key);
    assert.equal(z.querySelector('[role="switch"]'), null, key + ': kein geratener Schalterzustand');
    assert.match(z.querySelector('.setting-status').textContent, /Wert unbekannt/, key);
    assert.ok(z.querySelector('[data-action="on"]') && z.querySelector('[data-action="off"]'), key);
  }
  zeile(k, 'ai_furniture_detection').querySelector('[data-action="on"]').click();
  assert.deepEqual(aufrufe(k), [setze(k, 'ai_furniture_detection', 1)]);
  const h = aufbau('voll', { states: zustand('switch.robo_human_follow', 'on') });
  assert.equal(zeile(h, 'human_follow').querySelector('[role="switch"]').getAttribute('aria-checked'), 'true');
});

test('KI-Unterpunkte gesperrt, solange die KI-Hinderniserkennung aus ist; Fleckenmeiden braucht Flüssigkeitserkennung', () => {
  const k = aufbau();
  assert.match(zeile(k, 'pet_focused_detection').querySelector('.setting-status').textContent, /KI-Hinderniserkennung/);
  const f = aufbau('voll', { attribute: { ai_obstacle_detection: true }, states: zustand('switch.robo_ai_fluid_detection', 'off') });
  assert.match(zeile(f, 'stain_avoidance').querySelector('.setting-status').textContent, /Flüssigkeitserkennung/);
  assert.equal(zeile(f, 'pet_focused_detection').getAttribute('data-state'), 'ok');
});

test('Kameralicht-Helligkeit 40–100; mit Automatik gesperrt', () => {
  const k = aufbau('voll', { states: zustand('number.robo_camera_light_brightness', '70', { min: 40, max: 100, step: 1 }) });
  const feld = zeile(k, 'camera_light_brightness').querySelector('input');
  assert.deepEqual([feld.getAttribute('min'), feld.getAttribute('max'), feld.value], ['40', '100', '70']);
  feld.value = '30';
  feld.dispatchEvent(k.u.neuesEreignis('change'));
  assert.match(zeile(k, 'camera_light_brightness').querySelector('.setting-status').textContent, /40 bis 100/);
  const neuFeld = zeile(k, 'camera_light_brightness').querySelector('input');
  neuFeld.value = '85';
  neuFeld.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'camera_light_brightness', 85)]);
  const a = aufbau('voll', { states: zustand('number.robo_camera_light_brightness', '101') });
  assert.match(zeile(a, 'camera_light_brightness').querySelector('.setting-status').textContent, /Automatik/);
});

test('Kameralicht automatisch über den belegten Umweg: an = Helligkeit 40 mit params [101], aus = 40', () => {
  const an = aufbau('voll', { states: zustand('switch.robo_camera_light_brightness_auto', 'off') });
  zeile(an, 'camera_light_brightness_auto').querySelector('[role="switch"]').click();
  assert.deepEqual(aufrufe(an), [{ domain: 'dreame_vacuum', service: 'vacuum_set_property', data: { entity_id: 'vacuum.robo', key: 'camera_light_brightness', value: 40, params: [101] } }]);
  // Bestätigt über die Entität der Automatik, nicht über den geschriebenen Schlüssel.
  an.karte.hass = an.haus.setze(zustand('switch.robo_camera_light_brightness_auto', 'on'));
  an.u.uhr.vor(6000);
  assert.equal(zeile(an, 'camera_light_brightness_auto').querySelector('.setting-status').textContent, '');
  const aus = aufbau('voll', { states: zustand('switch.robo_camera_light_brightness_auto', 'on') });
  zeile(aus, 'camera_light_brightness_auto').querySelector('[role="switch"]').click();
  assert.deepEqual(aufrufe(aus), [setze(aus, 'camera_light_brightness', 40)]);
});

// ── Task 5: Audio und Sprachpaket (ALL-07, DEV-02) ───────────────────────────

const taste = (k, key) => k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key }));
const feld = (k, name) => $d(k.u, `[data-field="${name}"]`);
function tippe(k, name, text) {
  const f = feld(k, name);
  f.value = text;
  f.dispatchEvent(k.u.neuesEreignis('input'));
}
function audio() {
  const k = einstellungen();
  gruppe(k, 'audio').click();
  return k;
}

test('Audio: Lautstärke 0–100, Sprachassistent, Sprache als Liste, Streaming-Ansage, Sprachpaket als Anzeige', () => {
  const k = audio();
  assert.deepEqual(zeilen(k), ['voice_assistant', 'streaming_voice_prompt', 'voice_assistant_language', 'volume']);
  const sprache = $$d(k.u, '.setting').find((z) => z.getAttribute('data-setting') === 'voice_assistant_language').querySelector('select');
  assert.equal(sprache.childNodes.length, 7);
  assert.equal(sprache.value, 'English');
  const paket = $d(k.u, '[data-info="voice_packet_id"]');
  assert.match(paket.textContent, /DE/);
  assert.equal(paket.querySelector('button, select, input'), null, 'nur Anzeige: Buchstaben-IDs lassen sich nicht über vacuum_set_property setzen');
});

test('Sprachpaket installieren: Pflichtfelder und Inline-Prüfung, kein Aufruf bei Fehlern (R10)', () => {
  const k = audio();
  $d(k.u, '[data-action="voice-pack"]').click();
  assert.equal($d(k.u, 'h1').textContent, 'Sprachpaket installieren');
  for (const name of ['lang_id', 'url', 'md5', 'size']) {
    const f = feld(k, name);
    assert.ok($$d(k.u, 'label').some((l) => l.getAttribute('for') === f.id), name + ' hat ein Label');
    assert.equal(f.getAttribute('aria-required'), 'true');
  }
  $d(k.u, '[data-action="submit"]').click();
  assert.equal($$d(k.u, '.field-error').filter((e) => e.textContent).length, 4);
  assert.equal(feld(k, 'url').getAttribute('aria-invalid'), 'true');
  tippe(k, 'lang_id', 'DE');
  tippe(k, 'url', 'ftp://beispiel.invalid/paket.pkg');
  tippe(k, 'md5', '1234');
  tippe(k, 'size', '0');
  $d(k.u, '[data-action="submit"]').click();
  const fehler = $$d(k.u, '.field-error').map((e) => e.textContent).filter(Boolean);
  assert.equal(fehler.length, 3);
  assert.match(fehler.join(' '), /http/);
  assert.match(fehler.join(' '), /32/);
  assert.deepEqual(k.haus.rufe, []);
});

test('Sprachpaket: Bestätigung nennt das Paket; erst dann genau vacuum_install_voice_pack', () => {
  const k = audio();
  $d(k.u, '[data-action="voice-pack"]').click();
  tippe(k, 'lang_id', 'DE');
  tippe(k, 'url', 'https://beispiel.invalid/de.pkg');
  tippe(k, 'md5', 'D41D8CD98F00B204E9800998ECF8427E');
  tippe(k, 'size', '2048');
  $d(k.u, '[data-action="submit"]').click();
  assert.equal(dialogVon(k.u).shadowRoot.querySelector('.sheet').getAttribute('data-kind'), 'confirm');
  assert.match($d(k.u, '.body').textContent, /DE/);
  assert.match($d(k.u, '.body').textContent, /beispiel\.invalid/);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(aufrufe(k), [{ domain: 'dreame_vacuum', service: 'vacuum_install_voice_pack', data: { entity_id: 'vacuum.robo', lang_id: 'DE', url: 'https://beispiel.invalid/de.pkg', md5: 'd41d8cd98f00b204e9800998ecf8427e', size: 2048 } }]);
});

test('Sprachpaket: Eingaben bleiben beim Verlassen und nach einem Dienstfehler erhalten (R10/R12)', async () => {
  const k = audio();
  $d(k.u, '[data-action="voice-pack"]').click();
  tippe(k, 'url', 'https://beispiel.invalid/de.pkg');
  taste(k, 'Escape');
  k.u.zurueck();
  $d(k.u, '[data-action="voice-pack"]').click();
  assert.equal(feld(k, 'url').value, 'https://beispiel.invalid/de.pkg', 'Entwurf erhalten');
  tippe(k, 'lang_id', 'DE');
  tippe(k, 'md5', 'd41d8cd98f00b204e9800998ecf8427e');
  tippe(k, 'size', '10');
  k.haus.antwort = () => Promise.reject(new Error('Download fehlgeschlagen'));
  $d(k.u, '[data-action="submit"]').click();
  $d(k.u, '[data-action="confirm"]').click();
  await mikro();
  assert.match($d(k.u, '.body').textContent, /Download fehlgeschlagen/);
  assert.match($d(k.u, '.body').textContent, /Eingaben bleiben erhalten/);
  assert.equal($d(k.u, '[data-action="confirm"]').disabled, false, 'erneut versuchen möglich');
  $d(k.u, '[data-action="cancel"]').click();
  k.u.zurueck();
  assert.equal(feld(k, 'lang_id').value, 'DE', 'Formular mit Eingaben wieder da');
  assert.equal(feld(k, 'url').value, 'https://beispiel.invalid/de.pkg');
});

test('Sprachpaket: Erfolg schließt den Dialog und meldet die Anfrage in „Audio“ (R11)', async () => {
  const k = audio();
  k.haus.antwort = () => Promise.resolve();
  $d(k.u, '[data-action="voice-pack"]').click();
  tippe(k, 'lang_id', 'DE');
  tippe(k, 'url', 'https://beispiel.invalid/de.pkg');
  tippe(k, 'md5', 'd41d8cd98f00b204e9800998ecf8427e');
  tippe(k, 'size', '10');
  $d(k.u, '[data-action="submit"]').click();
  $d(k.u, '[data-action="confirm"]').click();
  await mikro();
  k.u.zurueck();
  k.u.uhr.vor(400);
  assert.equal(dialogVon(k.u), null);
  menue(k);
  eintrag(k.u, 'settings').click();
  gruppe(k, 'audio').click();
  assert.match($d(k.u, '.form-note').textContent, /angefragt/);
});

// ── Task 6: Nicht stören (ALL-08, DEV-06) ────────────────────────────────────

const DREI = [
  { id: 0, enabled: true, start: '20:00', end: '09:00', repeats: 127, ss: 0 },
  { id: 3, enabled: false, start: '12:00', end: '13:00', repeats: 62, ss: 5 },
  { id: 7, enabled: true, start: '06:00', end: '07:00', repeats: 65, ss: -1 },
];
function nichtStoeren(dnd, extra = {}) {
  const k = einstellungen('voll', { attribute: Object.assign(dnd ? { dnd } : {}, extra) });
  gruppe(k, 'dnd').click();
  return k;
}
const zeitraum = (k, id) => $d(k.u, `[data-dnd="${id}"]`);
const dndAufruf = (liste) => setze(null, 'dnd_task', JSON.stringify(liste));
function tag(k, d) { $d(k.u, `[data-day="${d}"]`).click(); }

test('Wochentage: eine Zuordnung für DnD-Bitfeld und Zeitplan-Zeichenkette, verlustfrei hin und zurück', () => {
  const { I } = aufbau();
  for (let m = 0; m < 128; m++) {
    assert.equal(I.maskOfDays(I.daysOfMask(m)), m);
    assert.equal(I.maskOfRepeats(I.repeatsOfMask(m)), m);
  }
  assert.equal(I.repeatsOfMask(0), '0000000', 'App-Beispiel 10.11.2026: einmaliger Zeitplan');
  assert.equal(I.repeatsOfMask(127), '1111111');
  assert.deepEqual(roh(I.daysOfMask(127)), [0, 1, 2, 3, 4, 5, 6]);
  // Annahme bis zum App-Beispiel mit Wochentag: Bit d = Date#getDay d (0 = Sonntag).
  assert.deepEqual(roh(I.daysOfMask(2)), [1]);
});

test('Liste der Zeiträume aus dnd (Start–Ende, Tage, an/aus); leer → Leerzustand mit Hinzufügen', () => {
  const k = nichtStoeren();
  const z = zeitraum(k, '0');
  assert.match(z.textContent, /20:00/);
  assert.match(z.textContent, /09:00/);
  assert.match(z.textContent, /Täglich/);
  assert.equal(z.querySelector('[role="switch"]').getAttribute('aria-checked'), 'true');
  assert.equal($d(k.u, '[data-setting="dnd"]'), null, 'Gerät mit dnd_task: kein einfacher Schalter');
  const leer = nichtStoeren([]);
  assert.match($d(leer.u, '.dnd-empty').textContent, /Keine Zeiträume/);
  assert.ok($d(leer.u, '[data-action="dnd-add"]'));
});

test('Anlegen schreibt die ganze Liste als dnd_task-JSON; neue id = höchste + 1', () => {
  const k = nichtStoeren(DREI);
  $d(k.u, '[data-action="dnd-add"]').click();
  assert.equal($d(k.u, 'h1').textContent, 'Zeitraum hinzufügen');
  feld(k, 'start').value = '08:00'; feld(k, 'start').dispatchEvent(k.u.neuesEreignis('input'));
  feld(k, 'end').value = '10:00'; feld(k, 'end').dispatchEvent(k.u.neuesEreignis('input'));
  assert.equal($d(k.u, '[data-day="1"]').getAttribute('aria-pressed'), 'true', 'Vorgabe täglich (R10)');
  $d(k.u, '[data-action="save"]').click();
  const soll = [{ id: 0, en: 1, st: '20:00', et: '09:00', wk: 127, ss: 0 }, { id: 3, en: 0, st: '12:00', et: '13:00', wk: 62, ss: 5 },
    { id: 7, en: 1, st: '06:00', et: '07:00', wk: 65, ss: -1 }, { id: 8, en: 1, st: '08:00', et: '10:00', wk: 127, ss: 0 }];
  const r = aufrufe(k);
  assert.equal(r.length, 1);
  assert.equal(r[0].data.key, 'dnd_task');
  assert.deepEqual(JSON.parse(r[0].data.value), soll);
});

test('Bearbeiten eines von drei Zeiträumen lässt die anderen und ss unverändert', () => {
  const k = nichtStoeren(DREI);
  zeitraum(k, '3').querySelector('[data-action="dnd-edit"]').click();
  assert.equal($d(k.u, 'h1').textContent, 'Zeitraum bearbeiten');
  assert.equal(feld(k, 'start').value, '12:00');
  assert.equal($d(k.u, '[data-day="1"]').getAttribute('aria-pressed'), 'true');
  feld(k, 'end').value = '14:30'; feld(k, 'end').dispatchEvent(k.u.neuesEreignis('input'));
  tag(k, 0);
  $d(k.u, '[data-action="save"]').click();
  const liste = JSON.parse(aufrufe(k)[0].data.value);
  assert.deepEqual(liste[1], { id: 3, en: 0, st: '12:00', et: '14:30', wk: 63, ss: 5 });
  assert.deepEqual(liste[0], { id: 0, en: 1, st: '20:00', et: '09:00', wk: 127, ss: 0 });
  assert.deepEqual(liste[2], { id: 7, en: 1, st: '06:00', et: '07:00', wk: 65, ss: -1 });
});

test('Ein/Aus in der Liste: ganze Liste mit geändertem en, Doppeltipp = ein Aufruf', () => {
  const k = nichtStoeren(DREI);
  zeitraum(k, '7').querySelector('[role="switch"]').click();
  zeitraum(k, '7').querySelector('[role="switch"]').click();
  const r = aufrufe(k);
  assert.equal(r.length, 1);
  assert.deepEqual(JSON.parse(r[0].data.value).map((t) => t.en), [1, 0, 0]);
  assert.match($d(k.u, '.dnd-status').textContent, /Speichert/);
});

test('Validierung: Start ≠ Ende, mindestens ein Tag; kein Aufruf (R10)', () => {
  const k = nichtStoeren([]);
  $d(k.u, '[data-action="dnd-add"]').click();
  feld(k, 'start').value = '10:00'; feld(k, 'start').dispatchEvent(k.u.neuesEreignis('input'));
  feld(k, 'end').value = '10:00'; feld(k, 'end').dispatchEvent(k.u.neuesEreignis('input'));
  for (let d = 0; d < 7; d++) tag(k, d);
  $d(k.u, '[data-action="save"]').click();
  const fehler = $$d(k.u, '.field-error').map((e) => e.textContent).filter(Boolean).join(' ');
  assert.match(fehler, /Ende/);
  assert.match(fehler, /Tag/);
  assert.deepEqual(k.haus.rufe, []);
});

test('Löschen nur nach Bestätigung mit Objekt → vacuum_call_action delete_dnd_task (R13)', () => {
  const k = nichtStoeren(DREI);
  zeitraum(k, '3').querySelector('[data-action="dnd-edit"]').click();
  $d(k.u, '[data-action="delete"]').click();
  assert.equal(dialogVon(k.u).shadowRoot.querySelector('.sheet').getAttribute('data-kind'), 'confirm');
  assert.match($d(k.u, '.body').textContent, /12:00/);
  $d(k.u, '[data-action="cancel"]').click();
  assert.deepEqual(k.haus.rufe, []);
  k.u.zurueck();
  $d(k.u, '[data-action="delete"]').click();
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(aufrufe(k), [{ domain: 'dreame_vacuum', service: 'vacuum_call_action', data: { entity_id: 'vacuum.robo', key: 'delete_dnd_task', value: '3' } }]);
});

test('Optionen nur bei aktivem DnD; ohne aktiven Zeitraum gesperrt mit Grund', () => {
  const k = nichtStoeren();
  assert.deepEqual(zeilen(k), ['dnd_disable_auto_empty', 'dnd_disable_resume_cleaning', 'dnd_reduce_volume']);
  assert.equal($d(k.u, '[data-setting="dnd_reduce_volume"]').getAttribute('data-state'), 'ok');
  const aus = nichtStoeren([{ id: 0, enabled: false, start: '20:00', end: '09:00', repeats: 127, ss: 0 }]);
  assert.match($d(aus.u, '[data-setting="dnd_reduce_volume"]').querySelector('.setting-status').textContent, /Nicht stören/);
});

test('Geräte ohne dnd_task: Schalter dnd und Zeiten dnd_start/dnd_end (HH:MM)', () => {
  const caps = hausAus('voll').states['vacuum.robo'].attributes.capabilities.filter((c) => c !== 'dnd_task');
  const k = nichtStoeren(true, { capabilities: caps, dnd_start: '22:00', dnd_end: '07:00' });
  assert.deepEqual(zeilen(k), ['dnd', 'dnd_disable_auto_empty', 'dnd_disable_resume_cleaning', 'dnd_reduce_volume', 'dnd_start', 'dnd_end']);
  assert.equal($d(k.u, '[data-dnd]'), null);
  const ende = $d(k.u, '[data-setting="dnd_end"]').querySelector('input');
  ende.value = '06:30';
  ende.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'dnd_end', '06:30')]);
});

test('Ungespeichertes DnD-Formular bleibt beim Verlassen erhalten und ist als ungespeichert markiert (R04/R10)', () => {
  const k = nichtStoeren(DREI);
  zeitraum(k, '0').querySelector('[data-action="dnd-edit"]').click();
  assert.equal($d(k.u, '[data-kind="dirty"]'), null);
  feld(k, 'start').value = '21:00'; feld(k, 'start').dispatchEvent(k.u.neuesEreignis('input'));
  assert.match($d(k.u, '[data-kind="dirty"]').textContent, /nicht gespeichert/);
  taste(k, 'Escape');
  k.u.zurueck();
  zeitraum(k, '0').querySelector('[data-action="dnd-edit"]').click();
  assert.equal(feld(k, 'start').value, '21:00');
  $d(k.u, '[data-action="discard"]').click();
  assert.equal(feld(k, 'start').value, '20:00');
});

test('DnD-Speichern scheitert: R12-Text in der Liste, Eingaben kommen ins Formular zurück', async () => {
  const k = nichtStoeren(DREI);
  k.haus.antwort = () => Promise.reject(new Error('Zeitüberschreitung'));
  zeitraum(k, '3').querySelector('[data-action="dnd-edit"]').click();
  feld(k, 'start').value = '11:15'; feld(k, 'start').dispatchEvent(k.u.neuesEreignis('input'));
  $d(k.u, '[data-action="save"]').click();
  k.u.zurueck();
  await mikro();
  const status = $d(k.u, '.dnd-status');
  assert.equal(status.getAttribute('data-kind'), 'error');
  assert.match(status.textContent, /Zeitüberschreitung/);
  assert.match(status.textContent, /Eingaben bleiben erhalten/);
  zeitraum(k, '3').querySelector('[data-action="dnd-edit"]').click();
  assert.equal(feld(k, 'start').value, '11:15');
});

// ── Task 7: Akku und Sonstiges (ALL-09, ALL-10, DEV-07/10) ──────────────────

function wahl(k, key, wert) {
  const sel = $d(k.u, `[data-setting="${key}"]`).querySelector('select');
  sel.value = wert;
  sel.dispatchEvent(k.u.neuesEreignis('change'));
}

test('Akku: Nebenzeit-Laden mit Beginn/Ende (HH:MM)', () => {
  const k = einstellungen();
  gruppe(k, 'battery').click();
  assert.deepEqual(zeilen(k), ['off_peak_charging', 'off_peak_charging_start', 'off_peak_charging_end']);
  $d(k.u, '[data-setting="off_peak_charging"]').querySelector('[role="switch"]').click();
  const ende = $d(k.u, '[data-setting="off_peak_charging_end"]').querySelector('input');
  ende.value = '06:00';
  ende.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'off_peak_charging', 1), setze(k, 'off_peak_charging_end', '06:00')]);
});

test('Weitere Modelle: Ladegrenze 80/90/100 % als Auswahl', () => {
  const k = aufbau('voll', { attribute: { battery_charge_level: '90%', battery_charge_level_list: ['80%', '90%', '100%'] } });
  const sel = zeile(k, 'battery_charge_level').querySelector('select');
  assert.equal(sel.value, '90%');
  sel.value = '80%';
  sel.dispatchEvent(k.u.neuesEreignis('change'));
  assert.deepEqual(aufrufe(k), [setze(k, 'battery_charge_level', '80%')]);
});

test('Sonstiges: Kindersicherung, Mehrstockwerkskarte, Kartenwahl, Kartenrotation', () => {
  const k = einstellungen();
  gruppe(k, 'other').click();
  assert.deepEqual(zeilen(k), ['child_lock', 'multi_floor_map', 'selected_map', 'map_rotation']);
  assert.equal($d(k.u, '[data-setting="selected_map"]').querySelector('select').value, 'Karte 1');
  assert.equal($d(k.u, '[data-setting="map_rotation"]').querySelector('select').value, '0');
  $d(k.u, '[data-setting="multi_floor_map"]').querySelector('[role="switch"]').click();
  assert.deepEqual(aufrufe(k), [setze(k, 'multi_floor_map', 1)]);
});

test('Kartenrotation nur nach Bestätigung mit Wert (ändert die Roboterkarte, R13)', () => {
  const k = einstellungen();
  gruppe(k, 'other').click();
  wahl(k, 'map_rotation', '90');
  assert.deepEqual(k.haus.rufe, []);
  assert.equal(dialogVon(k.u).shadowRoot.querySelector('.sheet').getAttribute('data-kind'), 'confirm');
  assert.match($d(k.u, '.body').textContent, /90°/);
  $d(k.u, '[data-action="cancel"]').click();
  assert.deepEqual(k.haus.rufe, []);
  k.u.zurueck();
  wahl(k, 'map_rotation', '180');
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(aufrufe(k), [setze(k, 'map_rotation', 180)]);
});

test('Kartenwahl über MapView.selectMap mit der Bestätigung von core (CORE-20)', () => {
  const maps = [{ id: 3, index: 1, name: 'Karte 1', custom_name: null }, { id: 7, index: 2, name: 'Karte 2', custom_name: null }];
  const k = einstellungen('voll', { attribute: { maps, map_count: 2 } });
  gruppe(k, 'other').click();
  assert.deepEqual($d(k.u, '[data-setting="selected_map"]').querySelector('select').childNodes.map((o) => o.value), ['Karte 1', 'Karte 2']);
  wahl(k, 'selected_map', 'Karte 2');
  assert.match($d(k.u, '.placeholder').textContent, /Karte 2/);
  assert.deepEqual(k.haus.rufe, []);
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(aufrufe(k), [{ domain: 'dreame_vacuum', service: 'vacuum_select_map', data: { entity_id: 'vacuum.robo', map_id: 7 } }]);
});
