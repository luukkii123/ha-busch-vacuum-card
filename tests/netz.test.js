'use strict';
// Etappe E4 des Buschcheck-Masterplans (17.11.2026): Kartenabruf und Netz.
// M6 Single-Flight/letzter guter Stand/Backoff, M19 Frame-Cache, M18 Verbindung.
// Latenz, Fehler und Rennen nur über die Uhr- und fetch-Attrappe; kein Gerät.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');
const { roh } = require('./hilfen.js');
const { ausFixture } = require('./kartendaten.js');

const CAM = 'camera.robo_map';
const kamera = (haus, attribute) => {
  const alt = haus.states[CAM];
  return { [CAM]: { entity_id: CAM, state: alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
};
const hinweise = (karte) => karte.shadowRoot.querySelectorAll('.map-note').map((n) => n.getAttribute('data-kind'));
const frameVon = (url) => Number((/[?&]v=(\d+)/.exec(url) || [])[1]);

/**
 * Steuerbarer Kartendaten-Abruf: `latenz` in ms über die Uhr, `status(url, nr)`
 * je Abruf (Vorgabe 200). Zählt gleichzeitig laufende Abrufe; ein abgebrochenes
 * Signal lehnt mit AbortError ab.
 */
function netz(u, { latenz = 0, status = () => 200 } = {}) {
  const n = { abrufe: [], laufend: 0, hoechstens: 0, latenz, status };
  u.kontext.AbortController = AbortController;
  u.kontext.fetch = (url, opt = {}) => {
    const eintrag = { url, signal: opt.signal || null };
    n.abrufe.push(eintrag);
    n.laufend++;
    n.hoechstens = Math.max(n.hoechstens, n.laufend);
    const nr = n.abrufe.length;
    return new Promise((ok, nein) => {
      let offen = true;
      const ende = () => { if (offen) { offen = false; n.laufend--; return true; } return false; };
      const fertig = () => {
        if (!ende()) return;
        const s = n.status(url, nr);
        ok({ ok: s >= 200 && s < 300, status: s, json: async () => roh(Object.assign({}, ausFixture('voll', { frame_id: frameVon(url) }), { _zellen: undefined })) });
      };
      if (eintrag.signal) eintrag.signal.addEventListener('abort', () => { if (ende()) nein(Object.assign(new Error('abgebrochen'), { name: 'AbortError' })); });
      if (n.latenz) u.uhr.setTimeout(fertig, n.latenz); else fertig();
    });
  };
  return n;
}

/** Umgebung mit Bildmaßen (wie nach decode()) und optional festem Math.random. */
function umgebung({ zufall } = {}) {
  const u = neueUmgebung();
  const erzeuge = u.document.createElement.bind(u.document);
  u.bilder = [];
  u.document.createElement = (tag) => {
    const n = erzeuge(tag);
    if (tag === 'img') { n.naturalWidth = 1444; n.naturalHeight = 1444; n.decode = () => Promise.resolve(); u.bilder.push(n); }
    return n;
  };
  if (zufall !== undefined) u.kontext.Math = Object.assign(Object.create(Math), { random: () => zufall });
  return u;
}

/** Karte im Datenmodus mit Frame 1180; `optionen` gehen an netz(). */
async function datenKarte({ zufall, ...optionen } = {}) {
  const u = umgebung({ zufall });
  const n = netz(u, optionen);
  const haus = hausAus('voll');
  haus.states = Object.assign({}, haus.states, kamera(haus, { frame_id: 1180 }));
  const karte = neueKarte(u, haus);
  karte._map.stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 });
  const frames = [];
  karte._map.el.addEventListener('map-frame', (e) => frames.push(e.detail));
  await mikro(); await mikro();
  return { u, n, haus, karte, frames };
}
const neuerFrame = (k, frame, mehr = {}) => { k.karte.hass = k.haus.setze(kamera(k.haus, Object.assign({ frame_id: frame }, mehr))); };

// ── M6 · Single-Flight, letzter guter Stand, Backoff ───────────────────────

test('MAP-01 M6 Single-Flight: Latenz 3 s, Frames alle 1 s → nach 10 s ≥ 2 Frames angewandt, nie mehr als 1 Abruf', async () => {
  const k = await datenKarte({ latenz: 3000 });
  k.u.uhr.vor(3000); await mikro();
  assert.deepEqual(k.frames.map((f) => f.frameId), [1180], 'Startframe angewandt');
  k.frames.length = 0;
  for (let s = 1; s <= 10; s++) {
    neuerFrame(k, 1180 + s);
    await mikro();
    k.u.uhr.vor(1000);
    await mikro();
  }
  const angewandt = k.frames.filter((f) => f.mode === 'data').map((f) => f.frameId);
  assert.ok(angewandt.length >= 2, 'angewandt: ' + angewandt.join(', '));
  assert.ok(angewandt.every((f, i) => i === 0 || f > angewandt[i - 1]), 'nur neuere Frames');
  assert.equal(k.n.hoechstens, 1, 'höchstens ein Abruf gleichzeitig');
  assert.equal(k.karte._map.stats.data, k.n.abrufe.length, 'stats.data zählt gestartete Abrufe');
  assert.equal(k.karte._map.current().mode, 'data');
});

test('MAP-01 M6 Kartenwechsel bricht den laufenden Abruf ab (signal.aborted)', async () => {
  const k = await datenKarte({ latenz: 3000 });
  k.u.uhr.vor(3000); await mikro();
  neuerFrame(k, 1181);
  await mikro();
  const laufend = k.n.abrufe.at(-1);
  assert.equal(frameVon(laufend.url), 1181);
  neuerFrame(k, 7, { map_index: 2, map_id: 9 });
  await mikro();
  assert.equal(laufend.signal.aborted, true, 'alter Abruf abgebrochen');
  assert.equal(frameVon(k.n.abrufe.at(-1).url), 7, 'neue Karte sofort geholt');
  k.u.uhr.vor(3000); await mikro();
  assert.deepEqual(k.frames.map((f) => f.frameId), [1180, 7], 'nur der neue Frame angewandt, je einmal');
});

test('MAP-01 M6 500er: Datenmodus bleibt, data-stale und Hinweis (R12), nach 2 s genau ein zweiter Abruf; Erfolg nimmt data-stale weg', async () => {
  const k = await datenKarte({ zufall: 0.5 });
  const m = k.karte._map;
  assert.equal(m.current().mode, 'data');
  let fehler = true;
  k.n.status = () => (fehler ? 500 : 200);
  neuerFrame(k, 1181);
  await mikro(); await mikro();
  assert.equal(k.n.abrufe.length, 2);
  assert.equal(m.current().mode, 'data', 'alter Stand bleibt');
  assert.equal(m.el.hasAttribute('data-stale'), true);
  assert.ok(hinweise(k.karte).includes('stale'), 'Hinweis sichtbar: ' + hinweise(k.karte));
  const text = k.karte.shadowRoot.querySelectorAll('.map-note').find((n) => n.getAttribute('data-kind') === 'stale').textContent;
  assert.match(text, /nicht aktuell/, 'was');
  assert.match(text, /zuletzt geladene/, 'Folge');
  assert.match(text, /erneut/, 'nächster Schritt');
  assert.deepEqual(k.frames.map((f) => f.frameId), [1180], 'kein map-frame für den Fehler');
  k.u.uhr.vor(1999); await mikro();
  assert.equal(k.n.abrufe.length, 2, 'vor 2 s kein Abruf');
  fehler = false;
  k.u.uhr.vor(1); await mikro(); await mikro();
  assert.equal(k.n.abrufe.length, 3, 'genau ein zweiter Abruf');
  assert.equal(frameVon(k.n.abrufe[2].url), 1181, 'desselben Frames');
  assert.equal(m.el.hasAttribute('data-stale'), false, 'Erfolg: nicht mehr veraltet');
  assert.ok(!hinweise(k.karte).includes('stale'));
  assert.deepEqual(k.frames.map((f) => f.frameId), [1180, 1181], 'map-frame genau einmal je angewandtem Frame');
  k.u.uhr.vor(120000); await mikro();
  assert.equal(k.n.abrufe.length, 3, 'danach keine weiteren Abrufe');
});

test('MAP-01 M6 Backoff 2/5/15/60 s, ±20 % Streuung; ein neuer Frame setzt ihn zurück', async () => {
  const k = await datenKarte({ zufall: 0.5 });
  k.n.status = () => 503;
  neuerFrame(k, 1181);
  await mikro(); await mikro();
  const zeiten = [];
  const start = k.u.uhr.jetzt;
  for (let i = 0; i < 5; i++) {
    const vorher = k.n.abrufe.length;
    for (let t = 0; t < 2000 && k.n.abrufe.length === vorher; t++) { k.u.uhr.vor(100); await mikro(); }
    zeiten.push(k.u.uhr.jetzt - start);
  }
  assert.deepEqual(zeiten, [2000, 7000, 22000, 82000, 142000], 'Abstände 2, 5, 15, 60, 60 s');
  neuerFrame(k, 1182);
  await mikro(); await mikro();
  assert.equal(frameVon(k.n.abrufe.at(-1).url), 1182, 'neuer Frame sofort');
  const nach = k.u.uhr.jetzt, anzahl = k.n.abrufe.length;
  for (let t = 0; t < 2000 && k.n.abrufe.length === anzahl; t++) { k.u.uhr.vor(100); await mikro(); }
  assert.equal(k.u.uhr.jetzt - nach, 2000, 'Backoff wieder ab 2 s');
  for (const [zufall, ms] of [[0, 1600], [0.999, 2399]]) {
    const z = await datenKarte({ zufall });
    z.n.status = () => 500;
    neuerFrame(z, 1181);
    await mikro(); await mikro();
    z.u.uhr.vor(ms - 1); await mikro();
    assert.equal(z.n.abrufe.length, 2, zufall + ': noch kein Versuch');
    z.u.uhr.vor(1); await mikro();
    assert.equal(z.n.abrufe.length, 3, zufall + ': Versuch nach ' + ms + ' ms');
  }
});

test('MAP-01 M6 ohne älteren Stand: Fehler → Bildmodus wie bisher; 404 ist endgültig (kein Wiederholen), 5xx wird wiederholt', async () => {
  for (const [status, wiederholt] of [[404, false], [500, true]]) {
    const u = umgebung({ zufall: 0.5 });
    const n = netz(u, { status: () => status });
    const haus = hausAus('voll');
    const karte = neueKarte(u, haus);
    await mikro(); await mikro();
    assert.equal(karte._map.current().mode, 'image', status + ': Bildmodus');
    assert.equal(karte._map.el.hasAttribute('data-stale'), false, status + ': ohne Stand nicht „veraltet“');
    assert.equal(karte._map.stats.images, 1, status + ': Kartenbild geholt');
    u.uhr.vor(2000); await mikro();
    assert.equal(n.abrufe.length, wiederholt ? 2 : 1, status + ': wiederholt = ' + wiederholt);
  }
});

test('MAP-01 M6 Bildmodus: ein dekodiertes neueres Bild erscheint, auch wenn ein noch neueres unterwegs ist; Überholtes lädt nicht weiter', async () => {
  const u = neueUmgebung();
  const erzeuge = u.document.createElement.bind(u.document);
  const bilder = [];
  u.document.createElement = (tag) => {
    const n = erzeuge(tag);
    if (tag === 'img') { n.naturalWidth = 100; n.naturalHeight = 100; n.decode = () => new Promise((ok) => bilder.push({ n, ok })); }
    return n;
  };
  const haus = hausAus('voll');
  const karte = neueKarte(u, haus);
  const bild = (v) => { karte.hass = haus.setze(kamera(haus, { entity_picture: '/api/camera_proxy/' + CAM + '?token=testtoken&v=' + v })); };
  bild(2);
  bild(3);
  assert.equal(bilder.length, 3, 'drei Bilder unterwegs');
  const gezeigt = () => { const b = karte.shadowRoot.querySelector('.map-base'); return b ? b.getAttribute('src') : null; };
  bilder[1].ok(); await mikro();
  assert.match(gezeigt(), /v=2$/, 'v=2 erscheint, obwohl v=3 unterwegs ist');
  assert.equal(bilder[0].n.getAttribute('src'), '', 'überholtes v=1 lädt nicht weiter');
  bilder[0].ok(); await mikro();
  assert.match(gezeigt(), /v=2$/, 'spätes älteres Bild ändert nichts');
  bilder[2].ok(); await mikro();
  assert.match(gezeigt(), /v=3$/);
  assert.deepEqual(hinweise(karte), []);
  assert.deepEqual(u.fehler, []);
});

test('MAP-01 M6 loadEditData: ein Fehler wird nicht gemerkt, der nächste Aufruf desselben Frames holt neu', async () => {
  const k = await datenKarte();
  const I = k.u.registry.get('busch-vacuum-card').__internals;
  k.n.status = () => 500;
  const vorher = k.n.abrufe.length;
  assert.equal(await I.loadEditData(k.karte), null, 'fehlgeschlagen');
  assert.equal(k.n.abrufe.length, vorher + 1);
  k.n.status = () => 200;
  const daten = await I.loadEditData(k.karte);
  assert.equal(k.n.abrufe.length, vorher + 2, 'zweiter Abruf');
  assert.ok(daten, 'jetzt mit Daten');
  await I.loadEditData(k.karte);
  assert.equal(k.n.abrufe.length, vorher + 2, 'Erfolg bleibt gemerkt');
});

test('M6 loadSettingTexts: ein fehlgeschlagenes Laden der Übersetzungen wird beim nächsten Mal wiederholt', async () => {
  const k = await datenKarte();
  let rufe = 0;
  const hass = k.karte.hass;
  const mit = Object.assign({}, hass, { loadBackendTranslation: () => { rufe++; return rufe === 1 ? Promise.reject(new Error('weg')) : Promise.resolve(); } });
  k.karte._hass = mit;
  k.karte._update();
  await mikro();
  assert.equal(rufe, 1);
  assert.equal(k.karte._settingTexts, null, 'Fehler nicht gemerkt');
  k.karte._update();
  await mikro();
  assert.equal(rufe, 2, 'zweiter Versuch');
  assert.ok(k.karte._settingTexts, 'Erfolg gemerkt');
});

// ── M19 · Frame-Cache, Bild nur als Absicherung ───────────────────────────

/** Zwei Karten derselben Kamera in einer Umgebung (ein Modul, ein Cache). */
async function zweiKarten(optionen = {}) {
  const u = umgebung();
  const n = netz(u, optionen);
  const haus = hausAus('voll');
  haus.states = Object.assign({}, haus.states, kamera(haus, { frame_id: 1180 }));
  const a = neueKarte(u, haus), b = neueKarte(u, haus);
  return { u, n, haus, a, b };
}

test('MAP-01 M19 zwei Karten, ein Frame, Daten < 600 ms: genau 1 Datenabruf und 0 Bildabrufe; cacheHits zählt', async () => {
  const { u, n, a, b } = await zweiKarten({ latenz: 300 });
  await mikro();
  u.uhr.vor(300); await mikro(); await mikro();
  u.uhr.vor(1000); await mikro();
  assert.equal(n.abrufe.length, 1, 'ein Datenabruf: ' + n.abrufe.map((x) => x.url).join(' | '));
  assert.equal(a._map.stats.images + b._map.stats.images, 0, 'kein Kartenbild');
  assert.equal(u.bilder.length, 0);
  assert.equal(a._map.stats.data + b._map.stats.data, 1);
  assert.equal(a._map.stats.cacheHits + b._map.stats.cacheHits, 1, 'die zweite Karte aus dem Cache');
  for (const k of [a, b]) assert.equal(k._map.current().mode, 'data');
});

test('MAP-01 M19 Daten nach 1 s: genau 1 Bildabruf nach 600 ms, danach Wechsel auf das Canvas', async () => {
  const k = await datenKarte({ latenz: 1000 });
  const m = k.karte._map;
  assert.equal(m.stats.images, 0, 'sofort kein Bild');
  k.u.uhr.vor(599); await mikro();
  assert.equal(m.stats.images, 0, 'vor 600 ms kein Bild');
  k.u.uhr.vor(1); await mikro();
  assert.equal(m.stats.images, 1, 'Absicherung nach 600 ms');
  assert.equal(k.karte.shadowRoot.querySelector('.map-base').tagName, 'IMG', 'erst das Bild');
  k.u.uhr.vor(400); await mikro(); await mikro();
  assert.equal(m.current().mode, 'data');
  assert.equal(k.karte.shadowRoot.querySelector('.map-base').tagName, 'CANVAS', 'dann das Canvas');
  assert.equal(m.stats.images, 1, 'genau ein Bildabruf');
  neuerFrame(k, 1181);
  k.u.uhr.vor(2000); await mikro(); await mikro();
  assert.equal(m.stats.images, 1, 'im Datenmodus kein weiteres Bild');
});

test('MAP-01 M19 Cache: höchstens 2 Frames je Kamera; Fehler bleiben nicht im Cache', async () => {
  const { u, n, haus, a } = await zweiKarten();
  await mikro(); await mikro();
  const I = u.registry.get('busch-vacuum-card').__internals;
  for (const f of [1181, 1182, 1183]) { a.hass = haus.setze(kamera(haus, { frame_id: f })); await mikro(); await mikro(); }
  assert.deepEqual(I.FRAME_CACHE.get(CAM).map((e) => e.key), ['1:1182', '1:1183'], 'die zwei neuesten');
  n.status = () => 500;
  a.hass = haus.setze(kamera(haus, { frame_id: 1184 }));
  await mikro(); await mikro();
  assert.ok(!I.FRAME_CACHE.get(CAM).some((e) => e.key === '1:1184'), 'fehlgeschlagen: nicht gemerkt');
});

test('M19 loadEditData teilt den laufenden Abruf der MapView (ungespeicherte Karte): 0 zusätzliche Abrufe', async () => {
  const u = umgebung();
  const n = netz(u, { latenz: 1000 });
  const haus = hausAus('voll');
  const alt = haus.states['vacuum.robo'];
  haus.states = Object.assign({}, haus.states, kamera(haus, { frame_id: 1180 }), { 'vacuum.robo': Object.assign({}, alt, { attributes: Object.assign({}, alt.attributes, { has_temporary_map: true }) }) });
  const karte = neueKarte(u, haus);
  await mikro();
  assert.equal(n.abrufe.length, 1);
  const I = u.registry.get('busch-vacuum-card').__internals;
  const daten = I.loadEditData(karte);
  u.uhr.vor(1000); await mikro(); await mikro();
  assert.ok(await daten, 'Bearbeitungsdaten aus demselben Abruf');
  assert.equal(n.abrufe.length, 1, 'kein zweiter Abruf');
});

// ── M18 · Verbindungszustand in der ganzen Karte ──────────────────────────

const getrennt = (haus, an = false) => Object.assign(haus.hass(), { connected: an });
const knopf = (karte, name) => karte.shadowRoot.querySelectorAll('[data-action="' + name + '"]')[0] || null;
const meldungen = (karte) => karte.shadowRoot.querySelectorAll('.message').map((n) => n.getAttribute('data-kind'));

test('M18 offline: Hinweis sichtbar (R12), Start/Pause/Einstellung erzeugen 0 callService, Knöpfe mit Grund gesperrt', async () => {
  const k = await datenKarte();
  const I = k.u.registry.get('busch-vacuum-card').__internals;
  k.karte.hass = getrennt(k.haus);
  assert.equal(k.karte.hasAttribute('data-offline'), true);
  assert.ok(meldungen(k.karte).includes('offline'), 'Hinweis: ' + meldungen(k.karte));
  const hinweis = k.karte.shadowRoot.querySelectorAll('.message').find((n) => n.getAttribute('data-kind') === 'offline');
  assert.match(hinweis.textContent, /Keine Verbindung zu Home Assistant/);
  assert.match(hinweis.textContent, /veraltet/);
  const start = knopf(k.karte, 'start');
  assert.equal(start.disabled, true, 'Start gesperrt');
  assert.equal(start.getAttribute('aria-describedby'), hinweis.id, 'Grund am Knopf');
  start.click();
  k.karte._startTask(k.haus.states['vacuum.robo']);
  k.karte._call('pause', k.haus.states['vacuum.robo']);
  const schalter = Object.keys(I.SETTINGS).find((key) => I.SETTINGS[key].control === 'switch');
  assert.equal(I.writeSetting(k.karte, schalter, true), false, 'Einstellung verweigert');
  await mikro();
  assert.equal(k.haus.rufe.length, 0, '0 callService: ' + JSON.stringify(k.haus.rufe));
  assert.equal(k.karte._pending, null, 'kein optimistischer Zustand');
});

test('M18 zurück online: Knöpfe frei, Hinweis weg, ein vorher fehlgeschlagener Kartenabruf läuft sofort erneut', async () => {
  const k = await datenKarte({ zufall: 0.5 });
  k.n.status = () => 500;
  k.karte.hass = getrennt(k.haus);
  neuerFrame(k, 1181);
  k.karte.hass = getrennt(k.haus);
  await mikro(); await mikro();
  const vorher = k.n.abrufe.length;
  assert.equal(k.karte._map.el.hasAttribute('data-stale'), true, 'Abruf fehlgeschlagen');
  k.n.status = () => 200;
  k.karte.hass = getrennt(k.haus, true);
  await mikro(); await mikro();
  assert.equal(k.n.abrufe.length, vorher + 1, 'sofort neu geholt, ohne Backoff');
  assert.equal(k.karte._map.el.hasAttribute('data-stale'), false);
  assert.equal(k.karte.hasAttribute('data-offline'), false);
  assert.ok(!meldungen(k.karte).includes('offline'));
  const start = knopf(k.karte, 'start');
  assert.equal(start.disabled, false, 'Start frei');
  start.click();
  assert.equal(k.haus.rufe.length, 1, 'online geht der Befehl raus');
});

test('M18 zurück online: eine offene Einstellung, die das Gerät inzwischen meldet, gilt als bestätigt', async () => {
  const k = await datenKarte();
  const I = k.u.registry.get('busch-vacuum-card').__internals;
  const schalter = Object.keys(I.SETTINGS).find((key) => I.SETTINGS[key].control === 'switch' && I.settingState(k.karte, k.karte._model(), key).present);
  assert.ok(schalter, 'ein vorhandener Schalter');
  const alt = I.settingState(k.karte, k.karte._model(), schalter).value;
  assert.equal(I.writeSetting(k.karte, schalter, !alt), true);
  assert.equal(k.karte._settingWrites.has(schalter), true, 'wartet auf Bestätigung');
  k.karte.hass = getrennt(k.haus);
  k.karte._settingWrites.get(schalter).check = () => true; // das Gerät meldet den Wert inzwischen
  k.karte.hass = getrennt(k.haus, true);
  assert.equal(k.karte._settingWrites.has(schalter), false, 'bei Rückkehr bestätigt');
  assert.equal(k.karte._settingNotes.has(schalter), false, 'kein Fehlerhinweis');
});

// ── M20 · Kartensicherung: Status-Rennen, Teilfehler, eigener Frame ────────

const ZONE = { service: 'vacuum_set_restricted_zone', data: { walls: [], zones: [[0, 0, 500, 500]], no_mops: [] } };
const GRANT = (karte) => ({ card: karte, confirmed: true });
const kartenDienste = (haus) => haus.rufe.filter((r) => r.domain === 'dreame_vacuum').map((r) => r.service);

/** Karte wie in karteneditor.test.js: Dienste antworten sofort, ohne Kartendaten-Abruf. */
function sicherungsKarte({ vac = {} } = {}) {
  const u = neueUmgebung(), haus = hausAus('voll');
  const v = haus.states['vacuum.robo'];
  haus.states['vacuum.robo'] = Object.assign({}, v, { attributes: Object.assign({}, v.attributes, vac) });
  haus.antwort = () => Promise.resolve();
  const karte = neueKarte(u, haus);
  const I = u.registry.get('busch-vacuum-card').__internals;
  const k = { u, haus, karte, I };
  k.setze = (id, attribute = {}) => { const alt = haus.states[id] || { entity_id: id, state: 'idle', attributes: {} }; karte.hass = haus.setze({ [id]: Object.assign({}, alt, { attributes: Object.assign({}, alt.attributes, attribute) }) }); };
  return k;
}
/** Die Kameras, deren recovery_map_list die Karte für die aktive Karte liest. */
/** maps[].id der Fixture (Karte 1); die Kartenverwaltung übergibt sie so an backup(). */
const sicherungsKameras = (k) => Object.keys(k.haus.states).filter((id) => id.startsWith('camera.robo_map') && k.haus.states[id].attributes.recovery_map_list !== undefined);

test('BAK-01 M20 Status-Rennen: Start „Success“, Dienst beantwortet, Status bleibt „Success“, Sicherungsliste ändert sich → backup() in < 1 s ohne Zeitlimit', async () => {
  const k = sicherungsKarte({ vac: { map_backup_status: 'Success' } });
  const kameras = sicherungsKameras(k);
  assert.ok(kameras.length, 'Fixture hat eine Sicherungsliste');
  const s = new k.I.MapEditSession(k.karte);
  k.karte._editSession = s;
  let fertig = null;
  s.backup(GRANT(k.karte), 3).then(() => { fertig = 'ok'; }, (e) => { fertig = e; });
  await mikro();
  assert.deepEqual(kartenDienste(k.haus), ['vacuum_backup_map']);
  k.karte.hass = k.haus.fremd();
  await mikro();
  assert.equal(fertig, null, 'ohne Listenänderung wartet sie weiter (bisheriges Verhalten)');
  for (const id of kameras) {
    const alt = k.haus.states[id].attributes.recovery_map_list || [];
    k.setze(id, { recovery_map_list: [{ date: '2026-11-17 10:00', map_type: 'Backup Map', object_name: 'neu' }].concat(alt) });
  }
  k.u.uhr.vor(1000);
  await mikro();
  assert.equal(fertig, 'ok', 'erledigt ohne Zeitlimit: ' + (fertig && fertig.message));
  assert.equal(s._wait, null);
});

test('BAK-01 M20 Status-Rennen: eine Listenänderung zählt erst, wenn der Dienst beantwortet ist; ohne sie bleibt das Zeitlimit', async () => {
  const k = sicherungsKarte({ vac: { map_backup_status: 'Success' } });
  let antworten;
  k.haus.antwort = () => new Promise((ok) => { antworten = ok; });
  const s = new k.I.MapEditSession(k.karte);
  k.karte._editSession = s;
  let fertig = null;
  s.backup(GRANT(k.karte), 3).then(() => { fertig = 'ok'; }, (e) => { fertig = e; });
  await mikro();
  for (const id of sicherungsKameras(k)) k.setze(id, { recovery_map_list: [{ date: '2026-11-17 10:00', map_type: 'Backup Map', object_name: 'x' }] });
  await mikro();
  assert.equal(fertig, null, 'Dienst noch offen: nicht fertig');
  antworten();
  await mikro(); await mikro();
  assert.equal(fertig, 'ok', 'mit der Antwort erledigt');
  // Ohne Listenänderung: wie bisher bis zum Zeitlimit.
  const z = sicherungsKarte({ vac: { map_backup_status: 'Success' } });
  const s2 = new z.I.MapEditSession(z.karte);
  z.karte._editSession = s2;
  let ende = null;
  s2.backup(GRANT(z.karte), 3).then(() => { ende = 'ok'; }, (e) => { ende = e; });
  await mikro(); await mikro();
  z.karte.hass = z.haus.fremd();
  z.u.uhr.vor(59999); await mikro();
  assert.equal(ende, null);
  z.u.uhr.vor(1); await mikro();
  assert.ok(ende && ende.timeout, 'Zeitlimit wie bisher');
});

test('EDI-02 M20 Teilfehler: drei Aufrufe, der dritte scheitert → „2 von 3“, Undo enthält die zwei geschriebenen Gruppen', async () => {
  const k = sicherungsKarte({ vac: { capabilities: [] } });
  const s = new k.I.MapEditSession(k.karte);
  let nr = 0;
  k.haus.antwort = () => (++nr === 3 ? Promise.reject(new Error('Gerät lehnt ab')) : Promise.resolve());
  const ruf = (i) => ({ service: 'vacuum_set_restricted_zone', data: { nr: i } });
  const zurueck = (i) => ({ service: 'vacuum_set_restricted_zone', data: { zurueck: i } });
  const undo = { text: 'drei Gruppen', calls: [zurueck(1), zurueck(2), zurueck(3)], groups: [{ count: 1, calls: [zurueck(1)] }, { count: 1, calls: [zurueck(2)] }, { count: 1, calls: [zurueck(3)] }] };
  assert.equal(await s.commit(GRANT(k.karte), [ruf(1), ruf(2), ruf(3)], { undo, backup: false }), false);
  assert.match(s.error.text, /2 von 3 Gruppen gespeichert/);
  assert.match(s.error.text, /Gerät lehnt ab/);
  assert.match(s.error.text, /vollständigen Listen/, 'nächster Schritt: erneut speichern ist unschädlich');
  assert.equal(s.undo.length, 1);
  assert.deepEqual(roh(s.undo[0].calls), roh([zurueck(1), zurueck(2)]), 'Undo der geschriebenen Gruppen');
  nr = 10;
  k.haus.antwort = () => Promise.reject(new Error('weg'));
  assert.equal(await s.commit(GRANT(k.karte), [ruf(1)], { undo: { text: 'x', calls: [zurueck(1)], groups: [{ count: 1, calls: [zurueck(1)] }] }, backup: false }), false);
  assert.doesNotMatch(s.error.text, /von/, 'nichts geschrieben: der bisherige Text');
  assert.equal(s.undo.length, 1, 'kein leeres Undo');
});

/** Bearbeitungsmodus wie karteneditor.test.js: Testwerkzeug legt eine No-Go-Zone an. */
async function bearbeitung(k) {
  const knopf = (body, action, fn) => { const b = k.u.document.createElement('button'); b.setAttribute('data-action', action); b.addEventListener('click', fn); body.appendChild(b); };
  k.I.EDIT_TOOLS.zones.panel = (card, editor, body) => knopf(body, 'add-zone', () => { editor.edit('restricted').no_go_areas.push([100, 100, 600, 600]); editor.changed(); });
  k.karte._map.tools.querySelector('[data-action="map-edit"]').click();
  const $ = (sel) => dialogVon(k.u).shadowRoot.querySelector(sel);
  await mikro(); await mikro();
  $('[data-tool="zones"]').click();
  $('[data-action="add-zone"]').click();
  k.karte._mapEdit.edit('curtain').curtains.push([0, 0, 500, 0]);
  k.karte._mapEdit.changed();
  $('[data-action="save"]').click();
  return $;
}
const { dialogVon } = require('./hilfen.js');
/** Die Sicherung vor dem ersten Speichern läuft an und endet erfolgreich. */
const sicherungFertig = async (k) => { await mikro(); k.setze('vacuum.robo', { map_backup_status: 'Running' }); k.setze('vacuum.robo', { map_backup_status: 'Success' }); await mikro(); await mikro(); await mikro(); };

test('EDI-02 M20 Teilfehler im Editor: zwei Gruppen, die zweite scheitert → „1 von 2“, Undo nur für die erste', async () => {
  const k = sicherungsKarte();
  const $ = await bearbeitung(k);
  k.haus.antwort = (d, service) => (service === 'vacuum_set_curtain' ? Promise.reject(new Error('Gerät lehnt ab')) : Promise.resolve());
  $('[data-action="confirm"]').click();
  await sicherungFertig(k);
  assert.deepEqual(kartenDienste(k.haus).filter((x) => x !== 'vacuum_backup_map'), ['vacuum_set_restricted_zone', 'vacuum_set_curtain']);
  const s = k.karte._editSession;
  assert.match(s.error.text, /1 von 2 Gruppen gespeichert/);
  assert.equal(s.undo.length, 1);
  assert.deepEqual(s.undo[0].calls.map((c) => c.service), ['vacuum_set_restricted_zone'], 'Undo der geschriebenen Gruppe');
});

test('EDI-02 M20 eigener Frame: ein fremder Frame zwischen Speichern und eigenem ergibt foreign = true, der eigene wird erkannt', async () => {
  for (const fremdZuerst of [false, true]) {
    const k = sicherungsKarte();
    const $ = await bearbeitung(k);
    $('[data-action="confirm"]').click();
    await sicherungFertig(k);
    k.u.zurueck(); // zurück in die Bearbeitungsansicht (Verlauf der Attrappe)
    const ed = k.karte._mapEdit;
    assert.equal(ed.dirty(), false, 'gespeichert');
    assert.ok(ed.expect, 'Erwartung des eigenen Frames');
    if (fremdZuerst) {
      k.setze(CAM, { frame_id: 1181 }); // Gerät meldet die alte Liste (fremder Frame)
      await mikro(); await mikro();
      assert.equal(ed.foreign, true, 'fremder Frame erkannt');
      assert.ok(ed.expect, 'eigener Frame steht noch aus');
    }
    k.setze(CAM, { frame_id: 1182, no_go_areas: [{ x0: 100, y0: 100, x1: 600, y1: 100, x2: 600, y2: 600, x3: 100, y3: 600, angle: null }] }); // das Gerät meldet die gespeicherte Zone
    await mikro(); await mikro();
    assert.equal(ed.expect, null, fremdZuerst + ': eigener Frame erkannt');
    assert.equal(ed.foreign, fremdZuerst, fremdZuerst ? 'Hinweis bleibt vom fremden Frame' : 'eigener Frame allein: kein Hinweis');
  }
});
