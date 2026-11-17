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
