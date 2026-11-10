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

// ── Task 3: Station-Dialog mit Reitern (DOCK-01…04) ──────────────────────────

/** Station-Ansicht über Dock-Menü → Station-Einstellungen. */
function station(name = 'voll', optionen) {
  const k = dockMenue(name, optionen);
  menueEintrag(k, 'settings').click();
  return k;
}
const reiter = (k) => $$d(k.u, '[role="tab"]').map((t) => t.getAttribute('data-tab'));
const aktiv = (k) => $$d(k.u, '[role="tab"]').find((t) => t.getAttribute('aria-selected') === 'true').getAttribute('data-tab');
/** Die Attrappe kennt keine Nachfahren-Selektoren: erst der Container, dann darin. */
const $$in = (k, behaelter, sel) => $d(k.u, behaelter).querySelectorAll(sel);
const $in = (k, behaelter, sel) => $$in(k, behaelter, sel)[0] || null;
const zeilenIm = (k) => $$in(k, '[role="tabpanel"]', '[data-setting]').map((z) => z.getAttribute('data-setting'));
const taste = (k, el, key) => el.dispatchEvent(k.u.neuesEreignis('keydown', { key }));
function speicher(start = {}, { lesenWirft = false, schreibenWirft = false } = {}) {
  const daten = Object.assign({}, start);
  return {
    daten,
    getItem(key) { if (lesenWirft) throw new Error('SecurityError'); return key in daten ? daten[key] : null; },
    setItem(key, value) { if (schreibenWirft) throw new Error('QuotaExceededError'); daten[key] = String(value); }
  };
}
const SPEICHER_KEY = 'busch-vacuum-card:dock-tab:vacuum.robo';

test('Gleiche Ansicht aus Dock-Menü und Geräteeinstellungen → Station; Reiter als tablist', () => {
  const k = station();
  assert.equal($d(k.u, 'h1').textContent, 'Station');
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'editor');
  assert.ok($d(k.u, '[role="tablist"]'));
  assert.deepEqual(reiter(k), ['wash', 'dry', 'empty']);
  assert.equal(aktiv(k), 'wash');
  const tab = $$d(k.u, '[role="tab"]')[0];
  assert.equal(tab.getAttribute('aria-controls'), $d(k.u, '[role="tabpanel"]').id);
  assert.match(tab.textContent, /Waschen/);
  const e = aufbau();
  e.karte._openDialog(e.I.MODULE_VIEWS.settings(e.karte));
  $$d(e.u, '[data-group]').find((b) => b.getAttribute('data-group') === 'station').click();
  assert.deepEqual(reiter(e), ['wash', 'dry', 'empty']);
  assert.equal($d(e.u, '.placeholder'), null);
  assert.deepEqual(k.haus.rufe, []);
});

test('Reiter nur je Fähigkeit: nur Entleeren, nur Waschen', () => {
  const basis = caps(aufbau());
  const nurLeeren = station('voll', { attribute: { capabilities: basis.filter((c) => c !== 'self_wash_base') } });
  assert.deepEqual(reiter(nurLeeren), ['empty']);
  const nurWaschen = station('voll', { attribute: { capabilities: basis.filter((c) => c !== 'auto_empty_base') } });
  assert.deepEqual(reiter(nurWaschen), ['wash', 'dry']);
});

test('Pfeiltasten, Home und End wechseln den Reiter und den Fokus', () => {
  const k = station('voll', { speicher: speicher() });
  const erster = $$d(k.u, '[role="tab"]')[0];
  assert.equal(erster.tabIndex, 0);
  assert.equal($$d(k.u, '[role="tab"]')[1].tabIndex, -1);
  taste(k, erster, 'ArrowRight');
  assert.equal(aktiv(k), 'dry');
  assert.equal(dialogVon(k.u).shadowRoot.activeElement.getAttribute('data-tab'), 'dry');
  taste(k, $$d(k.u, '[role="tab"]')[1], 'End');
  assert.equal(aktiv(k), 'empty');
  taste(k, $$d(k.u, '[role="tab"]')[2], 'ArrowRight');
  assert.equal(aktiv(k), 'wash', 'läuft rundum');
  taste(k, $$d(k.u, '[role="tab"]')[0], 'ArrowLeft');
  assert.equal(aktiv(k), 'empty');
  taste(k, $$d(k.u, '[role="tab"]')[2], 'Home');
  assert.equal(aktiv(k), 'wash');
  $$d(k.u, '[role="tab"]')[1].click();
  assert.equal(aktiv(k), 'dry');
});

test('Letzter Reiter je Sauger aus localStorage; fehlender oder defekter Speicher → erster, kein Fehler', () => {
  const s = speicher();
  const k = station('voll', { speicher: s });
  $$d(k.u, '[role="tab"]')[2].click();
  assert.equal(s.daten[SPEICHER_KEY], 'empty');
  assert.equal(aktiv(station('voll', { speicher: s })), 'empty', 'beim nächsten Öffnen wieder da');
  assert.equal(aktiv(station('voll', { speicher: speicher({ [SPEICHER_KEY]: 'gibtsnicht' }) })), 'wash');
  const ohne = station('voll');
  assert.equal(aktiv(ohne), 'wash');
  const kaputt = station('voll', { speicher: speicher({}, { lesenWirft: true, schreibenWirft: true }) });
  assert.equal(aktiv(kaputt), 'wash');
  $$d(kaputt.u, '[role="tab"]')[1].click();
  assert.equal(aktiv(kaputt), 'dry', 'Wechsel geht auch ohne Speicher');
  assert.deepEqual(kaputt.u.fehler, []);
  const nurLeeren = station('voll', { speicher: speicher({ [SPEICHER_KEY]: 'dry' }), attribute: { capabilities: caps(aufbau()).filter((c) => c !== 'self_wash_base') } });
  assert.equal(aktiv(nurLeeren), 'empty', 'gemerkter Reiter fehlt auf diesem Gerät');
});

test('Statusliste oben mit Symbol und Text, Probleme zuerst', () => {
  const k = station('voll', { attribute: { dust_bag_status: 'Check' } });
  const punkte = $$d(k.u, '[data-status]');
  assert.ok(punkte.length >= 15, 'alle Werte vorhanden');
  assert.deepEqual($$in(k, '.station-status', '[data-status]').map((p) => p.getAttribute('data-status')), ['dust_bag_status'], 'offen nur die Probleme');
  assert.match($d(k.u, '.station-values').textContent, /Alle Stationswerte/, 'der Rest eingeklappt (R25)');
  assert.equal($d(k.u, '.station-values').open, false);
  const ok = station();
  assert.match($in(ok, '.station-status', '[data-status]').textContent, /in Ordnung/, 'ohne Problem: eine Zeile „in Ordnung“');
  assert.equal(punkte[0].getAttribute('data-status'), 'dust_bag_status');
  assert.equal(punkte[0].getAttribute('data-level'), 'warning');
  assert.match(punkte[0].textContent, /Check/);
  assert.ok(punkte[0].querySelector('ha-icon'), 'Symbol + Text (R17)');
});

// Spec-Tabellen Waschen/Trocknen/Entleeren: Fixture voll (X40) — Wert und Schreibaufruf je Zeile.
const REITER_ZEILEN = {
  wash: { self_clean: true, auto_add_detergent: true, auto_water_refilling: false, auto_mount_mop: true, smart_mop_washing: true,
    washing_mode: 'Standard', water_temperature: null, self_clean_frequency: 'By room', auto_recleaning: 'In all modes', auto_rewashing: 'In all modes',
    self_clean_area: 20, self_clean_time: null },
  dry: { auto_drying: true, drying_time: '3' },
  empty: { auto_dust_collecting: true, auto_empty_mode: 'High frequency' }
};
const setze = (key, value) => ({ domain: 'dreame_vacuum', service: 'vacuum_set_property', data: { entity_id: 'vacuum.robo', key, value } });

for (const [name, erwartet] of Object.entries(REITER_ZEILEN)) {
  test(`Reiter ${name}: jede Zeile mit Fixture-Wert und eigenem Schreibaufruf (settingRow)`, () => {
    const k = station('voll', { speicher: speicher({ [SPEICHER_KEY]: name }) });
    assert.deepEqual(zeilenIm(k).slice().sort(), Object.keys(erwartet).sort());
    const soll = [];
    for (const [key, wert] of Object.entries(erwartet)) {
      const z = $$in(k, '[role="tabpanel"]', '[data-setting]').find((x) => x.getAttribute('data-setting') === key);
      if (wert === null) { assert.equal(z.getAttribute('data-state'), 'locked', key); continue; }
      const schalter = z.querySelector('[role="switch"]');
      const feld = z.querySelector('select') || z.querySelector('input');
      if (schalter) {
        assert.equal(schalter.getAttribute('aria-checked'), String(wert), key);
        schalter.click();
        soll.push(setze(key, wert ? 0 : 1));
      } else if (feld.tagName === 'SELECT') {
        assert.equal(feld.value, String(wert), key);
        const anders = feld.childNodes.map((o) => o.value).find((v) => v && v !== String(wert));
        feld.value = anders;
        feld.dispatchEvent(k.u.neuesEreignis('change'));
        soll.push(setze(key, anders));
      } else {
        assert.equal(feld.value, String(wert), key);
        assert.deepEqual([feld.getAttribute('min'), feld.getAttribute('max')], ['10', '35'], key + ': Grenzen aus _min/_max');
        feld.value = '25';
        feld.dispatchEvent(k.u.neuesEreignis('change'));
        soll.push(setze(key, 25));
      }
    }
    assert.deepEqual(aufrufe(k), soll);
  });
}

test('Aktionen im Reiter: gleicher Text, gleiches Symbol, gleicher Aufruf wie im Dock-Menü (R01)', () => {
  const k = station('voll', { speicher: speicher({ [SPEICHER_KEY]: 'dry' }) });
  const knopf = $in(k, '[role="tabpanel"]', '[data-station-action="dry"]');
  assert.match(knopf.textContent, /Trocknen starten/);
  knopf.click();
  assert.deepEqual(aufrufe(k), [aktion('toggle_drying')]);
});

test('Wartung: jede Aktion nach Bestätigung mit Folgetext; Station reinigen und Nachreinigen sagen, dass der Roboter das Dock verlässt', () => {
  const wartung = (k) => $$in(k, '.station-upkeep', '[data-station-action]').map((b) => b.getAttribute('data-station-action'));
  assert.deepEqual(wartung(station()), ['drain', 'empty_tank', 'station_cleaning', 'self_repair', 'recleaning']);
  for (const [name, soll, folge] of [['drain', aktion('start_draining'), /lässt ihr Wasser ab/], ['empty_tank', aktion('start_draining', '1'), /verworfen/],
    ['self_repair', aktion('start_self_repairing'), /repariert sich selbst/],
    // Live 10.11.2026: der X40 fuhr für die Stationsreinigung aus dem Dock und kam nicht selbst zurück.
    ['station_cleaning', aktion('start_station_cleaning'), /verlässt das Dock.*Zurück zum Dock/],
    // start_recleaning startet eine Reinigung (device.py#L5630, clean_segment/SECOND_CLEANING).
    ['recleaning', aktion('start_recleaning'), /verlässt das Dock/]]) {
    const k = station();
    $in(k, '.station-upkeep', '[data-station-action="' + name + '"]').click();
    assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'confirm', name);
    assert.match($d(k.u, '.body').textContent, folge, name);
    assert.deepEqual(aufrufe(k), [], name + ': erst nach Bestätigung');
    $d(k.u, '[data-action="cancel"]').click();
    k.u.zurueck();
    assert.deepEqual(aufrufe(k), [], name + ': Abbrechen ruft nichts');
    $in(k, '.station-upkeep', '[data-station-action="' + name + '"]').click();
    $d(k.u, '[data-action="confirm"]').click();
    assert.deepEqual(aufrufe(k), [soll], name);
  }
  const k = station('voll', { attribute: { draining_available: false } });
  assert.deepEqual(wartung(k), ['station_cleaning', 'self_repair', 'recleaning'], 'Ablassen nur wenn möglich');
});

test('Sperrgründe sichtbar: Wassertemperatur, Waschmodus, Selbstreinigungsfläche, Trocknungsdauer', () => {
  const grund = (k, key) => {
    const z = k.I.settingRow(k.karte, k.model(), key);
    return z.getAttribute('data-state') === 'locked' ? z.querySelector('.setting-status').textContent : '';
  };
  assert.match(grund(aufbau(), 'water_temperature'), /intelligente/i);
  assert.match(grund(aufbau('voll', { attribute: { self_clean: false } }), 'water_temperature'), /Selbstreinigung/);
  assert.match(grund(aufbau('voll', { attribute: { self_clean: false } }), 'washing_mode'), /Selbstreinigung/);
  assert.equal(grund(aufbau(), 'washing_mode'), '');
  assert.equal(grund(aufbau(), 'self_clean_area'), '');
  assert.match(grund(aufbau('voll', { attribute: { cleangenius_cleaning: true } }), 'self_clean_area'), /CleanGenius/);
  assert.match(grund(aufbau('voll', { attribute: { self_clean_frequency: 'By time' } }), 'self_clean_area'), /nach Zeit/);
  assert.match(grund(aufbau(), 'self_clean_time'), /nach Zeit/);
  assert.match(grund(aufbau('voll', { attribute: { auto_drying: false } }), 'drying_time'), /automatisch/i);
  assert.match(grund(aufbau('voll', { attribute: { auto_dust_collecting: false, auto_empty_frequency: 1 } }), 'auto_empty_frequency'), /Auto-Entleeren/);
});

test('Roboter außerhalb des Docks im Ruhezustand: „Zurück zum Dock“ zuerst und hervorgehoben', () => {
  const knoepfe = (k) => k.karte.shadowRoot.querySelectorAll('.ctl').map((b) => b.getAttribute('data-action') + ':' + b.getAttribute('data-variant'));
  assert.deepEqual(knoepfe(aufbau('voll', { zustand: 'idle', attribute: { docked: false } })), ['return:primary', 'start:secondary']);
  assert.deepEqual(knoepfe(aufbau('voll', { zustand: 'idle', attribute: { docked: true } })), ['start:primary', 'return:secondary'], 'ohne Befund bleibt Start vorn');
  assert.deepEqual(knoepfe(aufbau('voll', { zustand: 'idle', attribute: { docked: undefined } })), ['start:primary', 'return:secondary'], 'unbekannt bleibt unbekannt');
  const k = aufbau('voll', { zustand: 'idle', attribute: { docked: false } });
  assert.equal(k.karte.shadowRoot.querySelectorAll('.ctl')[0].textContent, 'Zurück zum Dock');
  k.karte.shadowRoot.querySelectorAll('.ctl')[0].click();
  assert.deepEqual(aufrufe(k).map((c) => c.domain + '.' + c.service), ['vacuum.return_to_base']);
});
