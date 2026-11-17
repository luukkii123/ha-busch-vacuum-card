'use strict';
// Modul history (Plan 2026-11-10): Reinigungs- und Cruising-Verlauf, Detail je Lauf,
// Karte des Laufs, Hindernisse, „Nochmal reinigen“. Verlaufsdaten nur synthetisch.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro, verlaufsAbruf } = require('./attrappe.js');
const { roh, dialogVon } = require('./hilfen.js');
const { verlaufsdaten } = require('./kartendaten.js');

const HIST = 'sensor.robo_cleaning_history';

function aufbau(name = 'voll', { states, config, services, haus: mitHaus, antwort } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (antwort) u.abrufe = verlaufsAbruf(u, antwort);
  if (states) haus.states = Object.assign({}, haus.states, states(haus.states));
  if (services) haus.services = services(haus.services);
  if (mitHaus) mitHaus(haus);
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
/** Ein Verlaufssensor mit genau diesen Läufen (Schlüssel → Eintrag). */
const sensor = (laeufe, id = HIST) => ({ entity_id: id, state: '2026-11-09T12:47:09+00:00', attributes: Object.assign({ friendly_name: 'Verlauf' }, laeufe) });

// ── Task 1: Läufe, Stufen, Gruppen, Summen ──────────────────────────────────

test('HIS-01 historyRuns: Fixture voll — 30 Läufe nach timestamp absteigend', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(haus.states[HIST]);
  assert.equal(runs.length, 30);
  const ts = runs.map((r) => r.timestamp);
  assert.deepEqual(ts, ts.slice().sort((a, b) => b - a));
  assert.equal(runs[0].key, '11-09 13:47');
  assert.equal(runs.at(-1).key, '10-20 15:06');
});

test('historyRuns: Sortierung nach timestamp, nicht nach dem Schlüsseltext (Jahreswechsel)', () => {
  const { I } = aufbau();
  const runs = I.historyRuns(sensor({
    '12-31 23:50': { timestamp: 1798761000, cleaning_time: '5 min', cleaned_area: '3 m²', completed: true },
    '2027-01-01 00:20': { timestamp: 1798762800, cleaning_time: '7 min', cleaned_area: '4 m²', completed: true },
    '01-02 08:00': { timestamp: 1798876800, cleaning_time: '9 min', cleaned_area: '5 m²', completed: true },
    friendly_name: 'kein Lauf', icon: 'mdi:x'
  }));
  assert.deepEqual(runs.map((r) => r.key), ['01-02 08:00', '2027-01-01 00:20', '12-31 23:50']);
});

test('HIS-01 historyRuns: Stufen unterbrochen / auffällig / fertig', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(haus.states[HIST]);
  const stufe = (key) => runs.find((r) => r.key === key).level;
  assert.equal(stufe('10-22 07:52'), 'interrupted', 'completed false schlägt blockierte Räume');
  assert.equal(stufe('11-03 07:46'), 'interrupted');
  assert.equal(stufe('11-09 13:47'), 'notice', 'blockierte Räume');
  assert.equal(stufe('11-04 08:36'), 'done', 'leeres blocked_rooms ist kein Befund');
  assert.equal(stufe('10-29 10:03'), 'done');
  const syn = I.historyRuns(sensor({ a: { timestamp: 5, completed: true, interrupt_reason: 'Robot lifted' } }));
  assert.equal(syn[0].level, 'notice', 'Unterbrechungsgrund bei fertigem Lauf');
});

test('HIS-01 historyRuns: Gruppen über gleiches multiple_cleaning_time (nur ab zwei Läufen)', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(haus.states[HIST]);
  const g = (key) => runs.find((r) => r.key === key).group;
  assert.equal(g('11-09 13:47'), '1794228271');
  assert.equal(g('11-09 12:46'), '1794228271');
  assert.equal(g('10-29 10:03'), null, 'eigenes multiple_cleaning_time ohne Partner');
  assert.equal(g('11-07 11:38'), null, 'ohne multiple_cleaning_time');
});

test('HIS-01 historySums: Fläche, Zeit, Anzahl aus den Texten; ft² mit HA-Einheiten', () => {
  const { I, haus } = aufbau();
  const runs = I.historyRuns(sensor({
    a: { timestamp: 3, cleaning_time: '50 min', cleaned_area: '10 m²' },
    b: { timestamp: 2, cleaning_time: '25 min', cleaned_area: '24 m²' },
    c: { timestamp: 1, cleaning_time: 'kaputt', cleaned_area: '' }
  }));
  const hass = haus.hass();
  const s = I.historySums(runs, hass);
  assert.equal(s.count, 3);
  assert.equal(s.area, 34);
  assert.equal(s.minutes, 75);
  assert.equal(s.areaText, '34 m²');
  assert.equal(s.timeText, '1 h 15 min');
  const us = Object.assign({}, hass, { config: { unit_system: { length: 'mi' } } });
  const f = I.historySums(runs, us);
  assert.equal(f.areaText, '366 ft²', '34 m² × 10,7639');
  assert.equal(I.historySums(I.historyRuns(haus.states[HIST]), hass).count, 30);
});

// ── Task 2: Liste und Menüeinträge ──────────────────────────────────────────

const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const menueEintraege = (k) => {
  k.karte.shadowRoot.querySelector('.menu-button').click();
  const liste = $$d(k.u, '.menu-item').map((b) => b.getAttribute('data-entry'));
  dialogVon(k.u).remove();
  return liste;
};
/** Öffnet Menü → Eintrag (history / cruising_history). */
function oeffne(k, name = 'history') {
  k.karte.shadowRoot.querySelector('.menu-button').click();
  $$d(k.u, '.menu-item').find((b) => b.getAttribute('data-entry') === name).click();
}
const HA_TEXTE = {
  'component.dreame_vacuum.entity.sensor.status.state.room_cleaning': 'Raumreinigung',
  'component.dreame_vacuum.entity.sensor.status.state.cleaning': 'Reinigen',
  'component.dreame_vacuum.entity.sensor.startup_method.state.app': 'App',
  'component.dreame_vacuum.entity.sensor.cleanup_method.state.default': 'Standard'
};
const mitTexten = (haus) => { const h = haus.hass; haus.hass = () => Object.assign(h(), { localize: (id) => HA_TEXTE[id] || '' }); };
const taste = (el, key, extra = {}) => el.dispatchEvent({ type: 'keydown', key, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra });

test('Menü: history/cruising_history aus MODULE_VIEWS statt Platzhalter', () => {
  const k = aufbau();
  assert.equal(typeof k.I.MODULE_VIEWS.history, 'function');
  assert.equal(typeof k.I.MODULE_VIEWS.cruising_history, 'function');
  oeffne(k);
  assert.equal($d(k.u, 'h1').textContent, 'Reinigungsverlauf');
  assert.equal($d(k.u, '.placeholder'), null);
  assert.ok($$d(k.u, '[data-run]').length > 0);
});

test("HIS-03 can('cruising_history') = Fähigkeit cruising und Sensor; hidden_card_objects blendet aus", () => {
  assert.ok(menueEintraege(aufbau()).includes('cruising_history'));
  const ohneCap = aufbau('voll', { states: (s) => ({ 'vacuum.robo': Object.assign({}, s['vacuum.robo'], { attributes: Object.assign({}, s['vacuum.robo'].attributes, { capabilities: s['vacuum.robo'].attributes.capabilities.filter((c) => c !== 'cruising') }) }) }) });
  assert.equal(ohneCap.model().can('cruising_history'), false);
  assert.ok(!menueEintraege(ohneCap).includes('cruising_history'));
  const ohneSensor = aufbau('voll', { haus: (h) => {
    h.entities = Object.fromEntries(Object.entries(h.entities).filter(([id]) => id !== 'sensor.robo_cruising_history'));
    h.states = Object.fromEntries(Object.entries(h.states).filter(([id]) => id !== 'sensor.robo_cruising_history'));
  } });
  assert.equal(ohneSensor.model().can('cruising_history'), false);
  assert.ok(!menueEintraege(ohneSensor).includes('cruising_history'));
  const versteckt = aufbau('voll', { config: { hidden_card_objects: ['cruising_history'] } });
  const e = menueEintraege(versteckt);
  assert.ok(e.includes('history') && !e.includes('cruising_history'));
});

test('HIS-01 Liste: Datum nach HA, Status übersetzt (Rückfall Rohtext), Fläche, Dauer, Statuspunkt mit Symbol und Wort', () => {
  const k = aufbau('voll', { haus: mitTexten });
  oeffne(k);
  // Gruppen zu: oberste Zeile ist der Kopf der Gruppe 1794228271.
  const kopf = $d(k.u, '[data-group="1794228271"]');
  assert.ok(kopf, 'Gruppenkopf');
  assert.equal(kopf.getAttribute('aria-expanded'), 'false');
  kopf.click();
  const zeile = $d(k.u, '[data-run="1794228429"]');
  assert.ok(zeile, 'neuester Lauf nach Aufklappen');
  const text = zeile.textContent;
  assert.match(text, /09\.11\./);
  const d = new Date(1794228429 * 1000), zwei = (n) => String(n).padStart(2, '0');
  assert.ok(text.includes(zwei(d.getHours()) + ':' + zwei(d.getMinutes())), 'Uhrzeit 24 h nach HA (Zeitzone des Prozesses)');
  assert.match(text, /Reinigen/, 'HA-Übersetzung des Status');
  assert.match(text, /24 m²/);
  assert.match(text, /53 min/);
  const punkt = zeile.querySelector('.run-status');
  assert.equal(punkt.getAttribute('data-level'), 'notice');
  assert.ok(punkt.querySelector('ha-icon'), 'Symbol');
  assert.match(punkt.textContent, /Auffällig/, 'Wort, nicht nur Farbe (R17)');
  // Rohtext ohne HA-Übersetzung
  const k2 = aufbau('voll', { states: () => ({ [HIST]: sensor({ a: { timestamp: 1794228429, status: 'Mystery mode', completed: false, cleaned_area: '1 m²', cleaning_time: '2 min' } }) }) });
  oeffne(k2);
  const z2 = $d(k2.u, '[data-run="1794228429"]');
  assert.match(z2.textContent, /Mystery mode/);
  assert.equal(z2.querySelector('.run-status').getAttribute('data-level'), 'interrupted');
  assert.match(z2.querySelector('.run-status').textContent, /Unterbrochen/);
});

test('HIS-01 Liste: Gruppen per Shift+Plus/Minus auf- und zuklappen; Summenzeile', () => {
  const k = aufbau();
  oeffne(k);
  const summe = $d(k.u, '.history-sums');
  assert.match(summe.textContent, /30 Läufe/);
  assert.match(summe.textContent, /\d+ m²/);
  assert.match(summe.textContent, /\d+ h \d+ min/);
  let kopf = $d(k.u, '[data-group="1794228271"]');
  assert.match(kopf.textContent, /2 Läufe/);
  assert.match(kopf.textContent, /58 m²/, 'Gruppensumme 34 + 24');
  taste(kopf, '+', { shiftKey: true });
  kopf = $d(k.u, '[data-group="1794228271"]');
  assert.equal(kopf.getAttribute('aria-expanded'), 'true');
  assert.ok($d(k.u, '[data-run="1794224793"]'));
  taste(kopf, '-', { shiftKey: true });
  assert.equal($d(k.u, '[data-group="1794228271"]').getAttribute('aria-expanded'), 'false');
  assert.equal($d(k.u, '[data-run="1794224793"]'), null);
  // Einzelläufe stehen ohne Kopf in der Liste.
  assert.ok($d(k.u, '[data-run="1794047923"]'), '11-07 11:38 ohne Gruppe');
});

test('Leerzustand ohne Läufe und ohne Sensorwert (R18)', () => {
  for (const s of [sensor({}), { entity_id: HIST, state: 'unavailable', attributes: {} }]) {
    const k = aufbau('voll', { states: () => ({ [HIST]: s }) });
    oeffne(k);
    assert.equal($$d(k.u, '[data-run]').length, 0);
    assert.match($d(k.u, '.history-empty').textContent, /Kein Verlauf/);
    assert.match($d(k.u, '.history-empty').textContent, /Cloud/);
  }
});

test('Snapshot: fremde Updates zeichnen die Liste nicht neu, ein neuer Sensorwert schon', () => {
  const k = aufbau();
  oeffne(k);
  const vorher = $d(k.u, '.history-list');
  dialogVon(k.u).hass = k.haus.fremd();
  assert.equal($d(k.u, '.history-list'), vorher);
  const s = k.haus.states[HIST];
  dialogVon(k.u).hass = k.haus.setze({ [HIST]: Object.assign({}, s, { attributes: Object.assign({}, s.attributes, { '11-10 08:00': { timestamp: 1794297600, completed: true, cleaned_area: '5 m²', cleaning_time: '6 min' } }) }) });
  assert.notEqual($d(k.u, '.history-list'), vorher);
  assert.ok($d(k.u, '[data-run="1794297600"]'));
});

// ── Task 3: Detail ohne Karte, Blättern ────────────────────────────────────

const NEUESTER = 1794228429; // 11-09 13:47, blockierte Räume 4/5/9, Gruppe mit 12:46
const ZWEITER = 1794224793;
const verlaufAbrufe = (k) => k.u.abrufe.filter((a) => a.url.includes('/api/camera_history_map_proxy/'));
/** Antwort: Daten-JSON für jeden Lauf; `je` setzt je v= etwas anderes (Status, Daten, Versprechen). */
const datenAntwort = (je = {}) => (url) => {
  if (!url.includes('/api/camera_history_map_proxy/')) return { status: 404 };
  const v = Number(/[?&]v=(\d+)/.exec(url)[1]);
  return je[v] !== undefined ? (typeof je[v] === 'function' ? je[v](url) : je[v]) : { json: verlaufsdaten() };
};
function detail(optionen = {}, ts = NEUESTER) {
  const k = aufbau('voll', Object.assign({ antwort: datenAntwort(), haus: mitTexten }, optionen));
  oeffne(k);
  const kopf = $d(k.u, '[data-group="1794228271"]');
  if (kopf && !$d(k.u, '[data-run="' + ts + '"]')) kopf.click();
  $d(k.u, '[data-run="' + ts + '"]').click();
  return k;
}
const wert = (k, name) => { const dd = $d(k.u, '[data-fact="' + name + '"]'); return dd ? dd.textContent : null; };

test('HIS-02 Detail: Sensorwerte sofort, Daten-JSON-Werte „—“ mit Ladeanzeige, danach Zähler/Startmethode', async () => {
  const k = detail();
  assert.equal($d(k.u, 'h1').textContent.includes(':'), true, 'Titel = Datum und Uhrzeit');
  assert.equal(wert(k, 'area'), '24 m²');
  assert.equal(wert(k, 'duration'), '53 min');
  assert.equal(wert(k, 'cleanup_method'), 'Standard');
  assert.equal(wert(k, 'mop_pad'), 'Installed');
  assert.equal(wert(k, 'startup_method'), '—');
  assert.equal($d(k.u, '[data-fact="startup_method"]').getAttribute('aria-busy'), 'true');
  assert.ok($d(k.u, '[data-load="loading"]'), 'Ladeanzeige');
  await mikro(); await mikro();
  assert.equal(wert(k, 'startup_method'), 'App');
  assert.equal(wert(k, 'dust_collection_count'), '1');
  assert.equal(wert(k, 'mop_wash_count'), '3');
  assert.equal($d(k.u, '[data-load="loading"]'), null);
  const blockiert = $d(k.u, '.history-blocked').childNodes.map((n) => n.textContent);
  assert.deepEqual(blockiert, ['Galerie · Blocked by door', 'Bibliothek · Blocked by threshold', 'Sauna · Blocked by door']);
  const abrufe = verlaufAbrufe(k);
  assert.equal(abrufe.length, 1, 'genau ein Abruf je geöffnetem Lauf');
  assert.match(abrufe[0].url, /^\/api\/camera_history_map_proxy\/camera\.robo_map\?token=testtoken&index=\d+&v=1794228429&data=1$/);
});

test('Kein Abruf ohne geöffnetes Detail (Liste, fremde Updates)', async () => {
  const k = aufbau('voll', { antwort: datenAntwort() });
  oeffne(k);
  dialogVon(k.u).hass = k.haus.fremd();
  await mikro();
  assert.equal(verlaufAbrufe(k).length, 0);
});

test('HIS-02 Blättern: Älter/Neuer und ←/→, am Rand gesperrt; ein Abruf je Lauf, Abbruch beim Blättern', async () => {
  let offen = null;
  const k = detail({ antwort: datenAntwort({ [ZWEITER]: () => new Promise((r) => { offen = r; }) }) });
  await mikro(); await mikro();
  const neuer = $d(k.u, '[data-action="newer"]'), aelter = $d(k.u, '[data-action="older"]');
  assert.equal(neuer.disabled, true, 'neuester Lauf: Neuer gesperrt');
  assert.equal(aelter.disabled, false);
  const titel = $d(k.u, 'h1').textContent;
  aelter.click();
  assert.notEqual($d(k.u, 'h1').textContent, titel);
  assert.equal(wert(k, 'area'), '34 m²', '11-09 12:46');
  await mikro();
  assert.equal(verlaufAbrufe(k).length, 2);
  const zweiter = verlaufAbrufe(k)[1];
  taste($d(k.u, '.history-detail'), 'ArrowLeft');
  assert.equal($d(k.u, 'h1').textContent, titel, '← = neuer');
  assert.equal(zweiter.signal.aborted, true, 'laufender Abruf beim Blättern abgebrochen');
  assert.equal(verlaufAbrufe(k).length, 2, 'fertiger Lauf wird nicht neu geladen');
  assert.equal(wert(k, 'startup_method'), 'App');
  offen({ json: verlaufsdaten() });
  taste($d(k.u, '.history-detail'), 'ArrowRight');
  await mikro();
  assert.equal(verlaufAbrufe(k).length, 3, 'abgebrochener Lauf lädt beim Wiederkommen neu');
});

test('Escape/Zurück: Liste an gleicher Position, Fokus auf dem Lauf', async () => {
  const k = detail({}, 1794047923);
  const d = dialogVon(k.u);
  d._sheet.scrollTop = 0;
  k.u.document.dispatchEvent(k.u.neuesEreignis('keydown', { key: 'Escape' }));
  k.u.zurueck();
  assert.equal($d(k.u, 'h1').textContent, 'Reinigungsverlauf');
  k.u.bild();
  assert.equal(d.shadowRoot.activeElement && d.shadowRoot.activeElement.getAttribute('data-run'), '1794047923');
});

test('Fehler beim Laden → R12-Text mit Erneut; 404 → keine Daten für diesen Lauf', async () => {
  let n = 0;
  const k = detail({ antwort: datenAntwort({ [NEUESTER]: () => (++n === 1 ? { status: 500 } : { json: verlaufsdaten() }) }) });
  await mikro(); await mikro();
  const fehler = $d(k.u, '[data-load="error"]');
  assert.ok(fehler);
  assert.match(fehler.textContent, /nicht geladen/);
  assert.equal(wert(k, 'startup_method'), '—');
  $d(k.u, '[data-action="retry"]').click();
  await mikro(); await mikro();
  assert.equal(wert(k, 'startup_method'), 'App');
  assert.equal(verlaufAbrufe(k).length, 2);
  const k2 = detail({ antwort: datenAntwort({ [NEUESTER]: { status: 404 } }) });
  await mikro(); await mikro();
  assert.match($d(k2.u, '[data-load="missing"]').textContent, /Keine Karte/);
  assert.equal($d(k2.u, '[data-action="retry"]'), null);
});

test('Schließen bricht den laufenden Abruf ab', async () => {
  const k = detail({ antwort: datenAntwort({ [NEUESTER]: () => new Promise(() => {}) }) });
  await mikro();
  const a = verlaufAbrufe(k)[0];
  dialogVon(k.u).close();
  k.u.zurueck();
  assert.equal(a.signal.aborted, true);
});

// ── Task 4: Karte des Laufs, Reinigungs-/WLAN-Umschalter, Hindernisse ──────

async function geladen(optionen, ts) {
  const k = detail(optionen, ts);
  await mikro(); await mikro();
  return k;
}
const leinwand = (k) => $d(k.u, '.history-map-canvas');

test('HIS-02 Datenmodus: Karte des Laufs als Canvas aus dem Daten-JSON, Alternativtext, Pfad; kein weiterer Abruf', async () => {
  const k = await geladen();
  const c = leinwand(k);
  assert.ok(c, 'Canvas');
  assert.equal(c.getAttribute('role'), 'img');
  assert.match(c.getAttribute('aria-label'), /^Karte des Laufs vom /);
  const daten = k.I.decodeMapData(verlaufsdaten());
  assert.equal(c.width, daten.width);
  assert.equal(c.height, daten.height);
  assert.equal($$d(k.u, '[data-path]').length, 2, 'zwei Pfadstriche');
  assert.equal($d(k.u, '.history-map-img'), null, 'kein PNG im Datenmodus');
  assert.equal(verlaufAbrufe(k).length, 1);
});

test('HIS-02 Umschalter Reinigungs-/WLAN-Karte nur mit wifi_map_data; Tastatur; WLAN ohne Pfad', async () => {
  const k = await geladen();
  const tabs = $$d(k.u, '[role="tab"]');
  assert.deepEqual(tabs.map((t) => t.textContent), ['Reinigungskarte', 'WLAN-Karte']);
  assert.equal($d(k.u, '[role="tablist"]').getAttribute('aria-label'), 'Karte des Laufs');
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  taste(tabs[0], 'ArrowRight');
  const wlan = $$d(k.u, '[role="tab"]')[1];
  assert.equal(wlan.getAttribute('aria-selected'), 'true');
  assert.match(leinwand(k).getAttribute('aria-label'), /^WLAN-Karte des Laufs vom /);
  assert.equal($$d(k.u, '[data-path]').length, 0);
  assert.equal(verlaufAbrufe(k).length, 1, 'WLAN-Karte steckt im selben Daten-JSON');
  const ohne = await geladen({ antwort: datenAntwort({ [NEUESTER]: { json: verlaufsdaten({ wifi_map_data: null }) } }) });
  assert.equal($d(ohne.u, '[role="tablist"]'), null);
});

test('Bildmodus-Rückfall: PNG mit info=0 und cleaning=1 bzw. wifi=1; Bildfehler → keine Karte', async () => {
  const kaputt = { size: null, data: null };
  const k = await geladen({ antwort: datenAntwort({ [NEUESTER]: { json: verlaufsdaten(Object.assign({}, kaputt, { wifi_map_data: Object.assign({}, kaputt) })) } }) });
  assert.equal(leinwand(k), null);
  const img = $d(k.u, '.history-map-img');
  assert.match(img.getAttribute('src'), /^\/api\/camera_history_map_proxy\/camera\.robo_map\?token=testtoken&index=\d+&v=1794228429&info=0&cleaning=1$/);
  assert.match(img.getAttribute('alt'), /^Karte des Laufs vom /);
  $$d(k.u, '[role="tab"]')[1].click();
  const w = $d(k.u, '.history-map-img');
  assert.match(w.getAttribute('src'), /&info=0&wifi=1$/);
  w.dispatchEvent({ type: 'error' });
  assert.equal($d(k.u, '.history-map-img'), null);
  assert.match($d(k.u, '[data-map="missing"]').textContent, /Keine WLAN-Karte/);
  assert.equal(verlaufAbrufe(k).length, 1, 'Bilder lädt der Browser, nicht fetch');
});

test('Zoom per Knopf: +, −, Einpassen', async () => {
  const k = await geladen();
  const stufe = () => $d(k.u, '.history-map-stage').getAttribute('data-zoom');
  assert.equal(stufe(), '1');
  assert.equal($d(k.u, '[data-action="zoom-out"]').disabled, true);
  $d(k.u, '[data-action="zoom-in"]').click();
  $d(k.u, '[data-action="zoom-in"]').click();
  assert.equal(stufe(), '2');
  $d(k.u, '[data-action="zoom-out"]').click();
  assert.equal(stufe(), '1.5');
  $d(k.u, '[data-action="zoom-fit"]').click();
  assert.equal(stufe(), '1');
});

test('MAP-04 Hindernisse des Laufs: Liste und Marker, Foto nur mit gemeldetem Bild über den Verlaufs-Endpunkt, kein Ignorieren', async () => {
  const k = await geladen();
  const eintraege = $$d(k.u, '[data-obstacle]');
  assert.equal(eintraege.length, 1, 'blockierte Räume stehen schon oben');
  assert.match(eintraege[0].textContent, /Shoes/);
  assert.match(eintraege[0].textContent, /Salon/);
  assert.equal($$d(k.u, '[data-marker]').length, 1);
  const n = /index=(\d+)&v=1794228429/.exec(verlaufAbrufe(k)[0].url)[1];
  eintraege[0].click();
  const foto = $d(k.u, '.obstacle-photo');
  assert.equal(foto.getAttribute('src'), '/api/camera_map_obstacle_history_proxy/camera.robo_map?token=testtoken&index=2&history_index=' + n);
  assert.match($d(k.u, '[data-action="obstacle-download"]').getAttribute('href'), /&file=1$/);
  assert.equal($d(k.u, '[data-action="obstacle-ignore"]'), null);
  // ohne gemeldetes Bild kein Foto
  const ohne = verlaufsdaten();
  ohne.obstacles[1][6] = 0;
  const k2 = await geladen({ antwort: datenAntwort({ [NEUESTER]: { json: ohne } }) });
  $$d(k2.u, '[data-obstacle]')[0].click();
  assert.equal($d(k2.u, '.obstacle-photo'), null);
  assert.match($d(k2.u, '.obstacle-note').textContent, /kein Foto/);
});

// ── Task 5: Nochmal reinigen ────────────────────────────────────────────────

const ohneCap = (cap) => ({ states: (s) => ({ 'vacuum.robo': Object.assign({}, s['vacuum.robo'], { attributes: Object.assign({}, s['vacuum.robo'].attributes, { capabilities: s['vacuum.robo'].attributes.capabilities.filter((c) => c !== cap) }) }) }) });

test('recleanState: nur neuester Lauf, Fähigkeit, Dienst, blockierte Räume, gleiche Karte, keine Aufgabe', () => {
  const k = aufbau();
  const runs = k.I.historyRuns(k.haus.states[HIST]);
  const bereit = { status: 'ready', data: verlaufsdaten() };
  const st = (model, run = runs[0], load = bereit, mapId = 2) => k.I.recleanState(model, run, { newest: runs[0], load, mapId });
  assert.deepEqual(roh(st(k.model())), { show: true, ok: true, reason: null, rooms: ['4', '5', '9'] });
  assert.equal(st(k.model(), runs[1]).show, false, 'nicht der neueste Lauf');
  assert.equal(st(aufbau('voll', ohneCap('auto_recleaning')).model()).show, false, 'ohne auto_recleaning');
  const ohneDienst = aufbau('voll', { services: (sv) => ({ ...sv, dreame_vacuum: Object.fromEntries(Object.entries(sv.dreame_vacuum).filter(([n]) => n !== 'vacuum_call_action')) }) });
  assert.equal(st(ohneDienst.model()).show, false, 'ohne vacuum_call_action');
  const leer = { timestamp: 1, level: 'done', group: null, entry: { completed: true } };
  assert.equal(st(k.model(), leer, { status: 'ready', data: verlaufsdaten({ blocked_segments: null }) }).show, false, 'keine blockierten Räume');
  const andere = st(k.model(), runs[0], bereit, 7);
  assert.deepEqual([andere.show, andere.ok, andere.reason], [true, false, 'nachAndereKarte']);
  const laeuft = aufbau('voll', { states: (s) => ({ 'vacuum.robo': Object.assign({}, s['vacuum.robo'], { state: 'cleaning', attributes: Object.assign({}, s['vacuum.robo'].attributes, { started: true }) }) }) });
  assert.deepEqual([st(laeuft.model()).ok, st(laeuft.model()).reason], [false, 'nachAufgabeLaeuft']);
  assert.deepEqual([st(k.model(), runs[0], { status: 'loading' }).ok, st(k.model(), runs[0], { status: 'loading' }).reason], [false, 'nachLaedt']);
});

const chips = (k) => $$d(k.u, '[data-reclean-room]');
const nachKnopf = (k) => $d(k.u, '[data-action="reclean"]');

test('Nochmal reinigen: Chips der blockierten Räume, Auswahl Pflicht, Bestätigung nennt Räume, genau start_recleaning', async () => {
  const k = await geladen();
  assert.deepEqual(chips(k).map((c) => c.textContent), ['Galerie', 'Bibliothek', 'Sauna']);
  assert.ok(chips(k).every((c) => c.getAttribute('aria-pressed') === 'false'), 'vorgewählt: keiner');
  assert.equal(nachKnopf(k).textContent.includes('Nachreinigen'), true, 'gleicher Text wie die Stationsaktion (R01)');
  assert.equal(nachKnopf(k).disabled, true);
  for (const id of ['4', '5', '9']) chips(k).find((c) => c.getAttribute('data-reclean-room') === id).click();
  assert.equal(nachKnopf(k).disabled, false);
  nachKnopf(k).click();
  assert.equal(k.haus.rufe.length, 0, 'erst nach Bestätigung');
  assert.match($d(k.u, '.body').textContent, /Galerie, Bibliothek, Sauna/);
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(roh(k.haus.rufe), [{ domain: 'dreame_vacuum', service: 'vacuum_call_action', data: { entity_id: 'vacuum.robo', key: 'start_recleaning' } }]);
  k.u.zurueck();
  assert.equal(nachKnopf(k).disabled, true, 'belegt bis zur Antwort (R11)');
});

test('Nochmal reinigen mit Teilauswahl: neuer Raumlauf über vacuum_clean_segment mit Hinweis', async () => {
  const k = await geladen();
  chips(k).find((c) => c.getAttribute('data-reclean-room') === '5').click();
  nachKnopf(k).click();
  assert.match($d(k.u, '.body').textContent, /Bibliothek/);
  assert.match($d(k.u, '.body').textContent, /neuer Lauf/);
  $d(k.u, '[data-action="confirm"]').click();
  const soll = k.I.taskPayload(k.model(), 'room', { rooms: [5], zones: [], spots: [], goto: null }, 1);
  assert.deepEqual(roh(k.haus.rufe), [{ domain: soll.domain, service: 'vacuum_clean_segment', data: Object.assign({ entity_id: 'vacuum.robo' }, roh(soll.data)) }]);
});

test('Nochmal reinigen: nicht bei älteren Läufen; gesperrt mit Grund bei anderer Karte', async () => {
  const k = await geladen({}, ZWEITER);
  assert.equal(nachKnopf(k), null);
  const k2 = await geladen({ antwort: datenAntwort({ [NEUESTER]: { json: verlaufsdaten({ map_id: 7 }) } }) });
  assert.equal(nachKnopf(k2).disabled, true);
  assert.match($d(k2.u, '[data-note="reclean"]').textContent, /anderen Karte/);
});

// ── Task 6: Cruising-Verlauf ────────────────────────────────────────────────

test('HIS-03 Cruising: Liste ohne Flächensumme, Detail mit cruising=1, Dauer/Art/Karte, kein Nochmal-reinigen, kein Umschalter', async () => {
  const k = aufbau('voll', { antwort: datenAntwort({ 1745078136: { json: verlaufsdaten({ wifi_map_data: Object.assign({}, verlaufsdaten().wifi_map_data), map_name: undefined }) } }), states: (s) => {
    const c = s['sensor.robo_cruising_history'];
    const e = Object.assign({}, c.attributes['2025-04-19 17:55'], { map_name: 'Karte 1' });
    return { 'sensor.robo_cruising_history': Object.assign({}, c, { attributes: Object.assign({}, c.attributes, { '2025-04-19 17:55': e }) }) };
  } });
  oeffne(k, 'cruising_history');
  assert.equal($d(k.u, 'h1').textContent, 'Cruising-Verlauf');
  assert.equal($d(k.u, '.history-sums').textContent, '1 Lauf · 1 min');
  const zeile = $d(k.u, '[data-run="1745078136"]');
  assert.match(zeile.textContent, /2025/, 'anderes Jahr mit Jahreszahl');
  assert.equal(zeile.querySelector('.run-status').getAttribute('data-level'), 'interrupted');
  zeile.click();
  await mikro(); await mikro();
  assert.match(verlaufAbrufe(k)[0].url, /&v=1745078136&cruising=1&data=1$/);
  assert.equal(wert(k, 'duration'), '1 min');
  assert.equal(wert(k, 'cruising_type'), '0');
  assert.equal(wert(k, 'map_name'), 'Karte 1');
  assert.equal(wert(k, 'area'), null, 'keine Fläche');
  assert.equal(nachKnopf(k), null);
  assert.equal($d(k.u, '[role="tablist"]'), null);
  assert.ok(leinwand(k));
  const run = k.I.historyRuns(k.haus.states['sensor.robo_cruising_history'])[0];
  assert.match(k.I.historyUrl(k.haus.states['camera.robo_map'], run, { kind: 'cruising_history' }), /&cruising=1&info=0$/);
});

// ── M12 (Buschcheck 17.11.2026, W2): Verlaufsliste fluchtet ──
test('M12 HIS-01 Liste: jede Zeile hat vorn die feste Symbolspalte, Titel = Datum, Typ in der Zeile darunter', () => {
  const k = aufbau('voll', { haus: mitTexten });
  oeffne(k);
  const kopf = $d(k.u, '[data-group="1794228271"]');
  kopf.click();
  const zeilen = $$d(k.u, '.history-run');
  assert.ok(zeilen.length > 5);
  for (const z of zeilen) {
    const erstes = z.childNodes[0];
    assert.ok(erstes.className === 'run-lead', 'Symbolspalte zuerst: ' + z.getAttribute('data-run'));
    assert.equal(erstes.getAttribute('aria-hidden'), 'true');
    assert.ok(z.childNodes[1].className === 'run-text', 'Text immer an zweiter Stelle, also gleiches x');
  }
  const offenerKopf = $d(k.u, '[data-group="1794228271"]');
  assert.equal(offenerKopf.querySelector('.run-lead').querySelector('ha-icon').getAttribute('icon'), 'mdi:chevron-up', 'Chevron in der Spalte');
  const mitglied = $d(k.u, '[data-run="1794228429"]');
  assert.equal(mitglied.querySelector('.run-lead').querySelector('ha-icon'), null, 'Mitglied: Linie per CSS statt Einrückung');
  const einzel = $d(k.u, '[data-run="1794047923"]');
  assert.equal(einzel.querySelector('.run-lead').querySelector('ha-icon'), null, 'Einzellauf: leerer Platzhalter');
  const titel = mitglied.querySelector('.run-title').textContent;
  assert.match(titel, /09\.11\./);
  assert.doesNotMatch(titel, /Reinigen|·/, 'Titel nur Datum (primär)');
  assert.match(mitglied.querySelector('.run-meta').textContent, /^Reinigen · 24 m² · 53 min$/, 'Typ sekundär vor Fläche und Dauer');
  assert.doesNotMatch(offenerKopf.querySelector('.run-title').textContent, /·/, 'Gruppentitel nur Datum');
  assert.match(offenerKopf.querySelector('.run-meta').textContent, /^Reinigung \+ Nachreinigung · /);
});

test('M12 CSS: Raster mit 40-px-Symbolspalte, keine Einrückung der Gruppe, Chip schmal unter dem Titel', () => {
  const { DIALOG_STYLES } = aufbau().I;
  const regel = (sel) => { const i = DIALOG_STYLES.indexOf('\n' + sel + ' {'); return i < 0 ? null : DIALOG_STYLES.slice(i, DIALOG_STYLES.indexOf('}', i)); };
  assert.match(regel('.history-run'), /display: grid;[^]*grid-template-columns: 40px minmax\(0, 1fr\) auto;/);
  assert.match(regel('.run-lead'), /grid-column: 1;[^]*width: 40px;/);
  assert.match(regel('.history-members .run-lead::before'), /width: 2px;[^]*background: var\(--divider-color/, 'Gruppe als Linie in der Spalte');
  assert.match(DIALOG_STYLES, /\n\.history-members \{\n    padding-inline-start: 0;/, 'Mitglieder ohne Einrückung, die Spalte zeigt die Gruppe');
  assert.match(regel('.run-status'), /white-space: nowrap;/);
  const i = DIALOG_STYLES.indexOf('/* M12: on a phone');
  assert.ok(i > 0);
  const schmal = DIALOG_STYLES.slice(i, DIALOG_STYLES.indexOf('\n}\n', i));
  assert.match(schmal, /@media \(max-width: 449\.98px\)[^]*\.history-run \{[^}]*grid-template-columns: 40px minmax\(0, 1fr\);[^]*\.run-status \{[^}]*grid-column: 2;/);
});
