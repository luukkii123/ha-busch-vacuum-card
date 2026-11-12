'use strict';
// Plan Task 3 (CORE-03/04/07/11): Kopf, Statuswerte, Steuerknöpfe je Zustand, Dock-Knopf.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const $ = (karte, sel) => karte.shadowRoot.querySelector(sel);
const aktionen = (karte) => karte.shadowRoot.querySelectorAll('.ctl').map((b) => b.getAttribute('data-action'));
const knopf = (karte, aktion) => karte.shadowRoot.querySelectorAll('.ctl').find((b) => b.getAttribute('data-action') === aktion);
const wert = (karte, art) => { const m = karte.shadowRoot.querySelectorAll('.metric').find((x) => x.getAttribute('data-metric') === art); return m ? m.querySelector('.metric-value').textContent : null; };

/** Sauger der Fixture mit anderem Zustand/Attributen (neues Zustandsobjekt wie in HA). */
function sauger(haus, zustand, attribute = {}) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand, attributes: Object.assign({}, alt.attributes, attribute) } };
}
function karteMit(name, zustand, attribute) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (zustand) haus.states = Object.assign({}, haus.states, sauger(haus, zustand, attribute));
  return { u, haus, karte: neueKarte(u, haus) };
}

// ── Kopf und Statuswerte ───────────────────────────────────────────────────
test('CORE-02 ohne Karte nutzbar: Status, Steuerung (Start sendet vacuum.start), Menü mit Einstellungen, Dock-Knopf; keine Karte, kein Fehler', () => {
  const { karte, u, haus } = karteMit('ohne-karte');
  assert.equal(karte.shadowRoot.querySelector('.map-stage'), null, 'keine Karte');
  assert.ok($(karte, '.state').textContent.length > 0, 'Statuszeile');
  assert.ok(wert(karte, 'battery'), 'Akku');
  assert.ok(aktionen(karte).length > 0, 'Steuerknöpfe');
  knopf(karte, aktionen(karte).includes('start') ? 'start' : aktionen(karte)[0]).click();
  assert.equal(haus.rufe.length, 1, 'ein Steueraufruf');
  assert.equal(haus.rufe[0].domain, 'vacuum');
  assert.ok($(karte, '.menu-button'), 'Menü');
  karte.shadowRoot.querySelector('.menu-button').click();
  const d = u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG');
  const eintraege = d.shadowRoot.querySelectorAll('.menu-item').map((b) => b.getAttribute('data-entry'));
  assert.ok(eintraege.includes('settings'), 'Einstellungen: ' + eintraege.join(','));
  assert.ok(karte.shadowRoot.querySelector('[data-action="dock"], .dock-button'), 'Dock-Knopf (Station vorhanden)');
  assert.deepEqual(u.fehler, []);
});

test('CORE-03 Kopf: Gerätename und Zustand in HAs Übersetzung', () => {
  const { karte, u } = karteMit('voll');
  assert.equal($(karte, '.title').textContent, 'Robo');
  assert.equal($(karte, '.state').textContent, 'Angedockt');
  assert.deepEqual(u.fehler, []);
});

test('CORE-03 Titel = Gerätename aus dem Register, nicht der doppelte friendly_name (Live 0.1.0: „X40 Ultra  X40 Ultra“)', () => {
  const doppelt = { friendly_name: 'X40 Ultra  X40 Ultra' };
  const mit = (devices, config = {}) => {
    const u = neueUmgebung(), haus = hausAus('voll', { devices });
    haus.states = Object.assign({}, haus.states, sauger(haus, 'docked', doppelt));
    return { u, karte: neueKarte(u, haus, config) };
  };
  const geraet = (extra) => ({ geraet_robo: Object.assign({ id: 'geraet_robo', name: 'X40 Ultra', name_by_user: null }, extra) });
  const { karte, u } = mit(geraet());
  assert.equal($(karte, '.title').textContent, 'X40 Ultra', 'Gerätename einmal');
  assert.deepEqual(u.fehler, []);
  assert.equal($(mit(geraet({ name_by_user: 'Robi' })).karte, '.title').textContent, 'Robi', 'eigener Gerätename zuerst');
  assert.equal($(mit(geraet(), { title: 'Oben' }).karte, '.title').textContent, 'Oben', 'Titel aus der Konfiguration gewinnt');
  assert.equal($(mit(undefined).karte, '.title').textContent, 'X40 Ultra  X40 Ultra', 'ohne Register: friendly_name');
  assert.equal($(mit({ anderes: { id: 'anderes', name: 'Fremd' } }).karte, '.title').textContent, 'X40 Ultra  X40 Ultra', 'Gerät fehlt im Register: friendly_name');
});

test('CORE-04 Fläche, Zeit und Akku mit den Einheiten der HA-Entitäten', () => {
  const { karte } = karteMit('voll');
  assert.equal(wert(karte, 'area'), '24 m²');
  assert.equal(wert(karte, 'time'), '53 min');
  assert.equal(wert(karte, 'battery'), '100 %');
});

test('CORE-04 Einheit folgt HA (ft² bei imperialem System)', () => {
  const u = neueUmgebung(), haus = hausAus('voll');
  const alt = haus.states['sensor.robo_cleaned_area'];
  haus.states = Object.assign({}, haus.states, { 'sensor.robo_cleaned_area': { entity_id: alt.entity_id, state: '258', attributes: Object.assign({}, alt.attributes, { unit_of_measurement: 'ft²' }) } });
  assert.equal(wert(neueKarte(u, haus), 'area'), '258 ft²');
});

test('CORE-02/CORE-04 minimal: Akku aus dem Attribut, keine leeren Fläche/Zeit-Felder', () => {
  const { karte, u } = karteMit('minimal');
  assert.equal(wert(karte, 'battery'), '80 %');
  assert.equal(wert(karte, 'area'), null);
  assert.equal(wert(karte, 'time'), null);
  assert.deepEqual(u.fehler, []);
});

const AKKU = [
  ['lädt', { battery: 45, charging: true }, 'charging', 'mdi:battery-charging-40', /lädt/],
  ['niedrig', { battery: 15, charging: false }, 'low', 'mdi:battery-alert-variant-outline', /niedrig/],
  ['Pause zum Laden', { battery: 30, charging: true, cleaning_paused: 1 }, 'paused', 'mdi:battery-clock', /fortsetzen/i],
  ['voll', { battery: 100, charging: false }, 'normal', 'mdi:battery', /^100 %$/],
];
for (const [name, attr, art, symbol, text] of AKKU) {
  test(`CORE-04 Akkusymbol: ${name} (Symbol, Farbe und Text)`, () => {
    const u = neueUmgebung(), haus = hausAus('voll');
    // Ohne Akku-Sensor gilt das Attribut: so steuert der Test den Wert direkt.
    const { 'sensor.robo_battery_level': _weg, ...ohneSensor } = haus.states;
    haus.states = Object.assign(ohneSensor, sauger(haus, 'docked', attr));
    const karte = neueKarte(u, haus);
    const akku = karte.shadowRoot.querySelectorAll('.metric').find((m) => m.getAttribute('data-metric') === 'battery');
    assert.equal(akku.getAttribute('data-battery'), art);
    assert.equal(akku.querySelector('ha-icon').getAttribute('icon'), symbol);
    assert.match(akku.querySelector('.metric-value').textContent, text);
  });
}

// ── Steuerknöpfe ───────────────────────────────────────────────────────────
const KNOEPFE = {
  docked: ['start'],
  idle: ['start', 'return'],
  cleaning: ['pause', 'stop', 'return'],
  paused: ['resume', 'stop', 'return'],
  returning: ['pause', 'stop'],
  error: ['start', 'return'],
  unavailable: [],
};
for (const [zustand, erwartet] of Object.entries(KNOEPFE)) {
  test(`CORE-07 Knöpfe im Zustand ${zustand}: ${erwartet.join(', ') || 'keine'}`, () => {
    assert.deepEqual(aktionen(karteMit('voll', zustand).karte), erwartet);
  });
}

test('CORE-07 angedockt mit laufendem Dock-Vorgang: Stopp beendet auch ihn', () => {
  assert.deepEqual(aktionen(karteMit('voll', 'docked', { washing: true }).karte), ['start', 'stop']);
  assert.deepEqual(aktionen(karteMit('voll', 'docked', { drying: true }).karte), ['start', 'stop']);
});

const DIENSTE = [['docked', 'start', 'start'], ['cleaning', 'pause', 'pause'], ['paused', 'resume', 'start'],
  ['cleaning', 'stop', 'stop'], ['cleaning', 'return', 'return_to_base']];
for (const [zustand, aktion, dienst] of DIENSTE) {
  test(`CORE-07 ${aktion} ruft genau vacuum.${dienst}`, () => {
    const { karte, haus } = karteMit('voll', zustand);
    knopf(karte, aktion).click();
    assert.deepEqual(JSON.parse(JSON.stringify(haus.rufe)), [{ domain: 'vacuum', service: dienst, data: { entity_id: 'vacuum.robo' } }]);
  });
}

test('CORE-07 Knöpfe nur mit passender Fähigkeit (ohne stop-Bit kein Stopp)', () => {
  const { karte } = karteMit('voll', 'cleaning', { supported_features: 31676 - 8 });
  assert.deepEqual(aktionen(karte), ['pause', 'return']);
});

test('CORE-07 Knöpfe haben Text, nicht nur ein Symbol', () => {
  const { karte } = karteMit('voll', 'cleaning');
  for (const b of karte.shadowRoot.querySelectorAll('.ctl')) assert.ok(b.textContent.trim() && b.getAttribute('aria-label'));
  assert.equal(knopf(karte, 'pause').textContent, 'Pause');
});

// ── Sofortanzeige ──────────────────────────────────────────────────────────
test('CORE-07 Sofortanzeige: Zielzustand sofort, bleibt bei fremden Updates', () => {
  const { karte, haus } = karteMit('voll');
  knopf(karte, 'start').click();
  assert.equal($(karte, '.state').textContent, 'Reinigt');
  assert.deepEqual(aktionen(karte), ['pause', 'stop', 'return'], 'Doppeltippen auf Reinigen ist nicht mehr möglich');
  karte.hass = haus.fremd();
  assert.equal($(karte, '.state').textContent, 'Reinigt');
  karte.hass = haus.setze(sauger(haus, 'cleaning'));
  assert.equal($(karte, '.state').textContent, 'Reinigt');
});

test('Sofortanzeige endet nach 5 s ohne Antwort des Geräts', () => {
  const { karte, u } = karteMit('voll');
  knopf(karte, 'start').click();
  u.uhr.vor(4900);
  assert.equal($(karte, '.state').textContent, 'Reinigt');
  u.uhr.vor(200);
  assert.equal($(karte, '.state').textContent, 'Angedockt');
  assert.deepEqual(aktionen(karte), ['start']);
});

test('Fehler von callService setzt sofort auf den echten Zustand zurück', async () => {
  const { karte, haus } = karteMit('voll');
  haus.antwort = () => Promise.reject(new Error('Gerät antwortet nicht'));
  knopf(karte, 'start').click();
  await mikro();
  assert.equal($(karte, '.state').textContent, 'Angedockt');
});

test('echter neuer Zustand beendet die Vorschau sofort', () => {
  const { karte, haus } = karteMit('voll');
  knopf(karte, 'start').click();
  karte.hass = haus.setze(sauger(haus, 'error'));
  assert.equal($(karte, '.state').textContent, 'Fehler');
});

// ── Dock-Knopf ─────────────────────────────────────────────────────────────
test('CORE-11 Dock-Anzeige: ohne Befund neutral, mit Text', () => {
  const dock = $(karteMit('voll').karte, '.dock');
  assert.ok(dock);
  assert.equal(dock.getAttribute('data-dock'), 'ok');
  assert.equal(dock.textContent, 'Dock', '0.2.2: sichtbar „Dock“');
  assert.equal(dock.getAttribute('aria-label'), 'Station');
});

test('CORE-11 Dock-Anzeige orange bei Warnung, mit Text statt nur Farbe', () => {
  const dock = $(karteMit('voll', 'docked', { clean_water_tank_status: 'Low water' }).karte, '.dock');
  assert.equal(dock.getAttribute('data-dock'), 'warning');
  assert.equal(dock.textContent, 'Dock', '0.2.2: der Text steht in der Hinweisleiste, nicht im Knopf');
  assert.match(dock.getAttribute('aria-label'), /Frischwasser niedrig/);
});

test('CORE-11 Dock-Anzeige rot bei Fehler, Fehler geht vor Warnung', () => {
  const dock = $(karteMit('voll', 'docked', { clean_water_tank_status: 'Low water', dirty_water_tank_status: 'Not installed or full' }).karte, '.dock');
  assert.equal(dock.getAttribute('data-dock'), 'error');
  assert.match(dock.getAttribute('aria-label'), /Schmutzwassertank/);
});

test('ohne Station keine Dock-Anzeige', () => {
  assert.equal($(karteMit('ohne-dock').karte, '.dock'), null);
  assert.equal($(karteMit('minimal').karte, '.dock'), null);
});

// ── kein Neubau bei fremden Updates ─────────────────────────────────────────
test('fremde und nicht beobachtete Updates bauen nichts neu', () => {
  const { karte, haus } = karteMit('voll');
  const vorher = knopf(karte, 'start');
  karte.hass = haus.fremd();
  const filter = haus.states['sensor.robo_filter_left'];
  karte.hass = haus.setze({ 'sensor.robo_filter_left': Object.assign({}, filter, { state: '68' }) });
  assert.equal(knopf(karte, 'start'), vorher, 'derselbe Knopf');
  karte.hass = haus.setze(sauger(haus, 'cleaning'));
  assert.deepEqual(aktionen(karte), ['pause', 'stop', 'return'], 'eigene Änderung kommt an');
});
