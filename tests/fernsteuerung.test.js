'use strict';
// Modul remote (Plan 2026-11-10): Wertabbildung, Sende-Logik, Ansicht, Freigabe,
// Auto-Stopp, Regler, Tastatur, Karte. Kein Test erreicht ein Gerät: callService
// der Attrappe sammelt nur; Antworten steuert jeder Test selbst.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const DIENST = 'vacuum_remote_control_move_step';

/** Haus mit Antworten auf Abruf: `offen` hält je Aufruf { ok, fehler }. */
function steuerbar(haus) {
  const offen = [];
  haus.antwort = () => new Promise((ok, fehler) => offen.push({ ok, fehler }));
  return offen;
}
const schritte = (haus) => haus.rufe.filter((r) => r.service === DIENST).map((r) => [r.data.velocity, r.data.rotation]);

function sender(name = 'voll') {
  const u = neueUmgebung(), haus = hausAus(name);
  const offen = steuerbar(haus);
  const karte = neueKarte(u, haus);
  const I = u.registry.get('busch-vacuum-card').__internals;
  const zustaende = [];
  const s = new I.RemoteSender(() => haus.hass(), 'vacuum.robo', (z) => zustaende.push(z));
  /** Antwortet auf den ältesten offenen Aufruf und arbeitet die Mikrotasks ab. */
  const antworte = async (fehler) => { const a = offen.shift(); if (fehler) a.fehler(fehler); else a.ok(); await mikro(); };
  return { u, haus, karte, I, s, offen, antworte, zustaende };
}

// ── Task 1: Wertabbildung ───────────────────────────────────────────────────

test('remoteValue: Totzone ±0,15 → 0, außerhalb linear bis 100/−100/±128, ganzzahlig', () => {
  const { I } = sender();
  const v = (raw, m) => I.remoteValue('velocity', raw, m), r = (raw, m) => I.remoteValue('rotation', raw, m);
  for (const x of [0, 0.1, -0.15, 0.15]) { assert.strictEqual(v(x), 0); assert.strictEqual(r(x), 0); }
  assert.equal(v(1), 100);
  assert.equal(v(-1), -100, 'rückwärts vorsichtig −100, nicht −300');
  assert.equal(r(1), 128);
  assert.equal(r(-1), -128);
  assert.equal(v(2), 100, 'geklemmt');
  assert.equal(v(0.575), 50, 'Mitte zwischen Totzone und Anschlag');
  assert.equal(r(-0.575), -64);
  for (const x of [0.2, 0.33, 0.77, -0.91]) assert.ok(Number.isInteger(v(x)) && Number.isInteger(r(x)));
  assert.strictEqual(v(0.1501), 0, 'kein −0/Bruchteil am Rand');
  assert.strictEqual(Object.is(r(-0.1501), -0), false);
});

test('remoteValue: Umschalt halbiert Tempo, Strg halbiert Drehen, Präzision beides', () => {
  const { I } = sender();
  const v = (m) => I.remoteValue('velocity', 1, m), r = (m) => I.remoteValue('rotation', 1, m);
  assert.equal(v({ shift: true }), 50);
  assert.equal(r({ shift: true }), 128, 'Umschalt wirkt nicht aufs Drehen');
  assert.equal(r({ ctrl: true }), 64);
  assert.equal(v({ ctrl: true }), 100, 'Strg wirkt nicht aufs Tempo');
  assert.equal(v({ precision: true }), 50);
  assert.equal(r({ precision: true }), 64);
  assert.equal(I.REMOTE.forward, 100);
  assert.equal(I.REMOTE.backward, -100);
  assert.equal(I.REMOTE.rotation, 128);
  assert.equal(I.REMOTE.stepMs, 200);
});

// ── Task 1: Sende-Logik ─────────────────────────────────────────────────────

test('RemoteSender: Aufruf genau dreame_vacuum.vacuum_remote_control_move_step ohne prompt', () => {
  const { haus, s } = sender();
  s.set({ v: 40, r: -12 });
  assert.deepEqual(roh(haus.rufe), [{ domain: 'dreame_vacuum', service: DIENST, data: { entity_id: 'vacuum.robo', velocity: 40, rotation: -12 } }]);
});

test('RemoteSender: nie zwei gleichzeitig, Abstand ≥ 200 ms, Zwischenwerte verfallen', async () => {
  const { u, haus, s, antworte } = sender();
  s.set({ v: 10, r: 0 });
  s.set({ v: 20, r: 0 });
  s.set({ v: 30, r: 5 });
  assert.equal(haus.rufe.length, 1, 'ein Aufruf unterwegs');
  u.uhr.vor(50);
  await antworte();
  assert.equal(haus.rufe.length, 1, 'erst 200 ms nach dem vorigen');
  u.uhr.vor(149);
  assert.equal(haus.rufe.length, 1);
  u.uhr.vor(1);
  assert.deepEqual(schritte(haus), [[10, 0], [30, 5]], 'neuester Wert gewinnt');
  // Langsame Antwort: der nächste erst nach der Antwort, nie parallel.
  u.uhr.vor(500);
  assert.equal(haus.rufe.length, 2);
  await antworte();
  assert.equal(haus.rufe.length, 3, 'Abstand längst vorbei → sofort');
});

test('RemoteSender: Dauerbewegung ≤ 5 Aufrufe/s, nie zwei gleichzeitig', async () => {
  const { u, haus, s, offen, antworte } = sender();
  let max = 0;
  s.set({ v: 50, r: 0 });
  for (let t = 0; t < 3000; t += 10) {
    if (t % 30 === 0) s.set({ v: 50 + (t % 7), r: 0 });
    max = Math.max(max, offen.length);
    if (offen.length && t % 40 === 0) await antworte();
    u.uhr.vor(10);
  }
  assert.equal(max, 1);
  assert.ok(haus.rufe.length <= 15 + 1, 'höchstens 5/s über 3 s: ' + haus.rufe.length);
  assert.ok(haus.rufe.length >= 12, 'hält die Bewegung aufrecht: ' + haus.rufe.length);
});

test('RemoteSender: Stopp mit Vorrang direkt nach der Antwort und einmal nach 300 ms', async () => {
  const { u, haus, s, antworte, zustaende } = sender();
  s.set({ v: 60, r: 0 });
  s.stop('release');
  assert.equal(haus.rufe.length, 1, 'wartet auf die laufende Antwort');
  u.uhr.vor(20);
  await antworte();
  assert.deepEqual(schritte(haus), [[60, 0], [0, 0]], 'ohne Mindestabstand');
  await antworte();
  u.uhr.vor(299);
  assert.equal(haus.rufe.length, 2);
  u.uhr.vor(1);
  assert.deepEqual(schritte(haus).at(-1), [0, 0], 'Wiederholung');
  await antworte();
  u.uhr.vor(5000);
  assert.equal(haus.rufe.length, 3, 'genau einmal wiederholt, danach Ruhe');
  assert.equal(zustaende.at(-1), 'stopped');
});

test('RemoteSender: Stopp ohne vorige Bewegung sendet nichts', () => {
  const { u, haus, s } = sender();
  s.stop('blur');
  u.uhr.vor(1000);
  assert.deepEqual(haus.rufe, []);
  s.set({ v: 0, r: 0 });
  assert.deepEqual(haus.rufe, [], 'Nullwert ist Stopp, kein Schritt');
});

test('RemoteSender: Dienstfehler → keine Bewegung mehr, Stopp-Versuch, Fehlerzustand', async () => {
  const { u, haus, s, antworte, zustaende } = sender();
  s.set({ v: 60, r: 0 });
  await antworte(new Error('Gerät antwortet nicht'));
  assert.deepEqual(schritte(haus), [[60, 0], [0, 0]], 'Stopp-Versuch');
  assert.equal(s.state, 'error');
  assert.match(s.error, /Gerät antwortet nicht/);
  s.set({ v: 60, r: 0 });
  await antworte();
  u.uhr.vor(1000);
  await antworte();
  u.uhr.vor(1000);
  assert.ok(schritte(haus).slice(1).every(([v, r]) => v === 0 && r === 0), 'nach Fehler nur Stopps');
  assert.ok(zustaende.includes('error'));
});

test('RemoteSender: 2 s ohne Antwort → Zeitüberschreitung, Stopp-Versuch, Fehlerzustand', async () => {
  const { u, haus, s } = sender();
  s.set({ v: 60, r: 0 });
  u.uhr.vor(1999);
  assert.equal(s.state, 'moving');
  u.uhr.vor(1);
  assert.equal(s.state, 'error');
  assert.equal(s.error, 'timeout');
  assert.deepEqual(schritte(haus), [[60, 0], [0, 0]], 'Stopp-Versuch trotz hängender Antwort');
  s.set({ v: 60, r: 0 });
  assert.equal(haus.rufe.length, 2);
});

test('RemoteSender: neue Bewegung nach Stopp setzt die Wiederholung aus', async () => {
  const { u, haus, s, antworte } = sender();
  s.set({ v: 60, r: 0 });
  s.stop('release');
  await antworte();
  await antworte();
  s.set({ v: 30, r: 0 });
  u.uhr.vor(200);
  assert.deepEqual(schritte(haus), [[60, 0], [0, 0], [30, 0]]);
  await antworte();
  u.uhr.vor(150);
  assert.deepEqual(schritte(haus).at(-1), [30, 0], 'keine verspätete Stopp-Wiederholung mitten in der Fahrt');
});

// ── Task 2: Ansicht, Freigabe, Auto-Stopp ───────────────────────────────────

const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const eintrag = (u, name) => dialogVon(u).shadowRoot.querySelectorAll('.menu-item').find((b) => b.getAttribute('data-entry') === name);
const taste = (u, key, extra = {}, typ = 'keydown') => u.document.dispatchEvent(u.neuesEreignis(typ, Object.assign({ key }, extra)));

/** Karte, Menü → Fernsteuerung; `sauger` ändert vacuum.robo vor dem Öffnen. */
function ansicht(name = 'voll', sauger) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (sauger) {
    const alt = haus.states['vacuum.robo'];
    haus.states = Object.assign({}, haus.states, { 'vacuum.robo': Object.assign({}, alt, sauger(alt), { attributes: Object.assign({}, alt.attributes, (sauger(alt) || {}).attributes) }) });
  }
  const offen = steuerbar(haus);
  const karte = neueKarte(u, haus);
  karte.shadowRoot.querySelector('.menu-button').click();
  eintrag(u, 'remote').click();
  const k = { u, haus, karte, offen, I: u.registry.get('busch-vacuum-card').__internals };
  k.ctl = () => dialogVon(u)._views.at(-1).remote;
  k.zustand = () => $d(u, '.remote').getAttribute('data-state');
  k.antworte = async (fehler) => { const a = offen.shift(); if (fehler) a.fehler(fehler); else a.ok(); await mikro(); };
  k.starten = () => $d(u, '[data-action="arm"]').click();
  /** Freigeben, vorwärts, erster Schritt beantwortet: der Roboter „fährt“. */
  k.faehrt = async () => { k.starten(); k.ctl().input('probe', { v: 1, t: 0 }); await k.antworte(); assert.deepEqual(schritte(haus), [[100, 0]]); };
  k.sauger = (z, attribute = {}) => { const alt = haus.states['vacuum.robo']; karte.hass = haus.setze({ 'vacuum.robo': Object.assign({}, alt, { state: z || alt.state, attributes: Object.assign({}, alt.attributes, attribute) }) }); };
  return k;
}
const letzterIstStopp = (haus) => assert.deepEqual(schritte(haus).at(-1), [0, 0]);

test('Menü → Fernsteuerung: eigene Ansicht statt Platzhalter, unscharf mit Warnhinweis', () => {
  const { u, haus, I, zustand } = ansicht();
  assert.equal(typeof I.MODULE_VIEWS.remote, 'function');
  assert.equal($d(u, 'h1').textContent, 'Fernsteuerung');
  assert.equal($d(u, '.placeholder'), null);
  assert.equal(dialogVon(u)._views.at(-1).kind, 'editor', 'kein Außenklick-Schließen (R04)');
  assert.equal(zustand(), 'unarmed');
  assert.match($d(u, '.remote-warning').textContent, /Rückwärts fährt ohne Kollisionsschutz\. Loslassen hält sofort an\./);
  const arm = $d(u, '[data-action="arm"]');
  assert.equal(arm.disabled, false);
  assert.match(arm.textContent, /Steuerung starten/);
  assert.match($d(u, '.remote-status').textContent, /nicht freigegeben/i);
  assert.deepEqual(haus.rufe, []);
  assert.deepEqual(u.fehler, []);
});

test('ohne Freigabe: kein Aufruf über Eingabe, Stopp-Knopf, Fokusverlust und Schließen', () => {
  const { u, haus, ctl } = ansicht();
  ctl().input('probe', { v: 1, t: 1 });
  $d(u, '[data-action="stop"]').click();
  for (const fn of u.kontext.window.listeners.blur || []) fn({});
  u.document.hidden = true;
  u.document.dispatchEvent(u.neuesEreignis('visibilitychange'));
  u.uhr.vor(1000);
  $d(u, '[data-action="close"]').click();
  u.uhr.vor(1000);
  assert.deepEqual(haus.rufe, []);
});

test('Freigabe je Öffnen: nach Schließen und neuem Öffnen wieder unscharf', async () => {
  const k = ansicht();
  k.starten();
  assert.equal(k.zustand(), 'ready');
  assert.equal($d(k.u, '[data-action="arm"]').hidden, true);
  k.ctl().input('probe', { v: 0.575, t: 0 });
  assert.deepEqual(schritte(k.haus), [[50, 0]]);
  await k.antworte();
  assert.equal(k.zustand(), 'moving');
  $d(k.u, '[data-action="back"]').click();
  k.u.zurueck();
  eintrag(k.u, 'remote').click();
  assert.equal(k.zustand(), 'unarmed', 'nichts gemerkt (R21)');
  k.ctl().input('probe', { v: 1, t: 0 });
  assert.equal(schritte(k.haus).filter(([v]) => v).length, 1, 'neue Ansicht ohne Freigabe sendet nicht');
});

for (const [name, sauger, grund] of [
  ['Mop-Wäsche', () => ({ attributes: { washing: true } }), /Mopp/],
  ['Schnellkartierung', () => ({ attributes: { mapping: true } }), /Schnellkartierung/],
  ['Fehler', () => ({ state: 'error' }), /Fehler/],
  ['nicht verfügbar', () => ({ state: 'unavailable' }), /nicht verfügbar/]
]) {
  test('gesperrt beim Öffnen: ' + name + ' → Starten aus mit Grund, 0 Aufrufe', () => {
    const { u, haus, ctl, zustand } = ansicht('voll', sauger);
    const arm = $d(u, '[data-action="arm"]');
    assert.equal(arm.disabled, true);
    assert.match($d(u, '.remote-blocked').textContent, grund);
    assert.equal(zustand(), 'blocked');
    arm.click();
    ctl().input('probe', { v: 1, t: 0 });
    assert.deepEqual(haus.rufe, []);
  });
}

// Auto-Stopp: jeder Auslöser einzeln, jeweils während der Fahrt.
const AUSLOESER = [
  ['Schließen ×', (k) => $d(k.u, '[data-action="close"]').click()],
  ['Zurück-Pfeil', (k) => $d(k.u, '[data-action="back"]').click()],
  ['Escape', (k) => taste(k.u, 'Escape')],
  ['Zurück-Geste (popstate)', (k) => k.u.zurueck()],
  ['window blur', (k) => { for (const fn of k.u.kontext.window.listeners.blur || []) fn({}); }],
  ['visibilitychange verborgen', (k) => { k.u.document.hidden = true; k.u.document.dispatchEvent(k.u.neuesEreignis('visibilitychange')); }]
];
for (const [name, ausloesen] of AUSLOESER) {
  test('Auto-Stopp: ' + name, async () => {
    const k = await (async () => { const k = ansicht(); await k.faehrt(); return k; })();
    ausloesen(k);
    letzterIstStopp(k.haus);
    assert.equal(schritte(k.haus).length, 2, 'sofort, ohne Mindestabstand');
  });
}

test('Auto-Stopp: blur/visibilitychange lassen die Ansicht freigegeben', async () => {
  const k = ansicht();
  await k.faehrt();
  for (const fn of k.u.kontext.window.listeners.blur || []) fn({});
  await k.antworte();
  k.u.uhr.vor(400);
  await k.antworte();
  assert.equal(k.zustand(), 'stopped');
  assert.match($d(k.u, '.remote-status').textContent, /Gestoppt/);
  k.ctl().input('probe', { v: 1, t: 0 });
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus).at(-1), [100, 0], 'weiter ohne neue Freigabe');
});

test('visibilitychange sichtbar stoppt nicht', async () => {
  const k = ansicht();
  await k.faehrt();
  k.u.document.hidden = false;
  k.u.document.dispatchEvent(k.u.neuesEreignis('visibilitychange'));
  assert.equal(schritte(k.haus).length, 1);
});

test('Auto-Stopp: Verbindungsverlust → Stopp-Versuch, Hinweis, Freigabe zurückgenommen', async () => {
  const k = ansicht();
  await k.faehrt();
  k.karte.hass = Object.assign(k.haus.hass(), { connected: false });
  letzterIstStopp(k.haus);
  assert.match($d(k.u, '.remote-note').textContent, /Verbindung.*Dreame-App/);
  assert.notEqual(k.zustand(), 'ready');
  assert.equal($d(k.u, '[data-action="arm"]').disabled, true, 'ohne Verbindung kein Neustart');
  k.ctl().input('probe', { v: 1, t: 0 });
  assert.equal(schritte(k.haus).filter(([v]) => v).length, 1);
  k.karte.hass = Object.assign(k.haus.hass(), { connected: true });
  assert.equal(k.zustand(), 'unarmed', 'neu starten nötig');
  assert.equal($d(k.u, '[data-action="arm"]').disabled, false);
});

test('Auto-Stopp: Dienstfehler → Stopp-Versuch, R12-Text, Freigabe zurückgenommen', async () => {
  const k = ansicht();
  k.starten();
  k.ctl().input('probe', { v: 1, t: 0 });
  await k.antworte(new Error('Gerät nicht erreichbar'));
  letzterIstStopp(k.haus);
  assert.equal(k.zustand(), 'unarmed');
  assert.match($d(k.u, '.remote-note').textContent, /Gerät nicht erreichbar.*neu starten/);
  k.ctl().input('probe', { v: 1, t: 0 });
  assert.equal(schritte(k.haus).filter(([v]) => v).length, 1);
  k.starten();
  await k.antworte();
  k.u.uhr.vor(400);
  await k.antworte();
  k.ctl().input('probe', { v: 1, t: 0 });
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus).at(-1), [100, 0], 'nach neuem Start wieder bereit');
});

test('Auto-Stopp: Zeitüberschreitung → Stopp-Versuch, Text, Freigabe zurückgenommen', async () => {
  const k = ansicht();
  k.starten();
  k.ctl().input('probe', { v: 1, t: 0 });
  k.u.uhr.vor(2000);
  letzterIstStopp(k.haus);
  assert.equal(k.zustand(), 'unarmed');
  assert.match($d(k.u, '.remote-note').textContent, /2 s/);
});

test('Auto-Stopp: Zustand error → Stopp, gesperrt mit Grund', async () => {
  const k = ansicht();
  await k.faehrt();
  k.sauger('error');
  letzterIstStopp(k.haus);
  assert.equal(k.zustand(), 'blocked');
  assert.match($d(k.u, '.remote-blocked').textContent, /Fehler/);
});

test('fremde Updates zeichnen die Ansicht nicht neu (Regler bleiben unter dem Finger)', async () => {
  const k = ansicht();
  k.starten();
  const wurzel = $d(k.u, '.remote');
  k.karte.hass = k.haus.fremd();
  k.sauger(null, { battery_level: 50 });
  assert.equal($d(k.u, '.remote'), wurzel);
});

test('Schließen: Stopp-Folge genau Stopp + eine Wiederholung, auch wenn mehrere Wege gleichzeitig stoppen', async () => {
  const k = ansicht();
  await k.faehrt();
  $d(k.u, '[data-action="close"]').click();
  for (const fn of k.u.kontext.window.listeners.blur || []) fn({});
  await k.antworte();
  k.u.zurueck();
  k.u.uhr.vor(299);
  assert.equal(schritte(k.haus).length, 2, 'kein vorgezogener zweiter Stopp');
  k.u.uhr.vor(1);
  await k.antworte();
  k.u.uhr.vor(2000);
  assert.deepEqual(schritte(k.haus), [[100, 0], [0, 0], [0, 0]]);
  assert.equal(dialogVon(k.u), null);
});

// ── Task 3: Regler und Halte-Knöpfe (REM-01) ────────────────────────────────

const zeiger = (k, el, typ, id, x = 100, y = 50) => el.dispatchEvent(k.u.neuesEreignis(typ, { pointerId: id, clientX: x, clientY: y }));
/** Regler mit protokolliertem setPointerCapture (Rechteck der Attrappe: 200 × 100, Mitte 100/50). */
function regler(k, achse) {
  const el = $d(k.u, '[data-axis="' + achse + '"]');
  el.gefangen = [];
  el.setPointerCapture = (id) => el.gefangen.push(id);
  return el;
}
const halte = (k, richtung) => { const el = $d(k.u, '[data-hold="' + richtung + '"]'); el.gefangen = []; el.setPointerCapture = (id) => el.gefangen.push(id); return el; };

test('Regler: role=slider mit Namen, Ausrichtung, Grenzen und Text „Mitte“; touch-action none', () => {
  const k = ansicht();
  const v = regler(k, 'velocity'), t = regler(k, 'turn');
  for (const [el, name, lage] of [[v, 'Tempo', 'vertical'], [t, 'Lenken', 'horizontal']]) {
    assert.equal(el.getAttribute('role'), 'slider');
    assert.equal(el.getAttribute('aria-label'), name);
    assert.equal(el.getAttribute('aria-orientation'), lage);
    assert.equal(el.getAttribute('aria-valuemin'), '-100');
    assert.equal(el.getAttribute('aria-valuemax'), '100');
    assert.equal(el.getAttribute('aria-valuenow'), '0');
    assert.equal(el.getAttribute('aria-valuetext'), 'Mitte');
    assert.equal(el.tabIndex, 0);
  }
  assert.match(k.I.DIALOG_STYLES, /\.remote-stick\s*\{[^}]*touch-action:\s*none/);
});

test('Regler ohne Freigabe: kein Aufruf, kein Zeigerfang', () => {
  const k = ansicht();
  const v = regler(k, 'velocity'), h = halte(k, 'forward');
  zeiger(k, v, 'pointerdown', 1, 100, 0);
  zeiger(k, v, 'pointermove', 1, 100, 0);
  zeiger(k, h, 'pointerdown', 2);
  k.u.uhr.vor(1000);
  assert.deepEqual(k.haus.rufe, []);
  assert.deepEqual(v.gefangen, []);
  assert.equal(v.getAttribute('aria-valuetext'), 'Mitte');
});

test('Regler: Zeigerfang, Wert aus der Position, Text „vorwärts 41 %“, neuester Wert', async () => {
  const k = ansicht();
  k.starten();
  const v = regler(k, 'velocity');
  zeiger(k, v, 'pointerdown', 7, 100, 0);
  assert.deepEqual(v.gefangen, [7]);
  assert.deepEqual(schritte(k.haus), [[100, 0]]);
  assert.equal(v.getAttribute('aria-valuetext'), 'vorwärts 100 %');
  assert.ok(v.hasAttribute('data-held'));
  assert.notEqual(regler(k, 'velocity').querySelector('.remote-knob').style.transform, 'translate(0%, 0%)');
  zeiger(k, v, 'pointermove', 7, 100, 75);
  zeiger(k, v, 'pointermove', 7, 100, 25);
  assert.equal(v.getAttribute('aria-valuetext'), 'vorwärts 41 %');
  assert.equal(v.getAttribute('aria-valuenow'), '41');
  await k.antworte();
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus), [[100, 0], [41, 0]], 'Zwischenwert rückwärts verfallen');
  const t = regler(k, 'turn');
  zeiger(k, t, 'pointerdown', 8, 50, 50);
  assert.equal(t.getAttribute('aria-valuetext'), 'links 41 %');
  zeiger(k, t, 'pointermove', 8, 150, 50);
  assert.equal(t.getAttribute('aria-valuetext'), 'rechts 41 %');
});

test('zwei Zeiger gleichzeitig: Tempo und Lenken in einem Schritt, Loslassen einzeln', async () => {
  const k = ansicht();
  k.starten();
  const v = regler(k, 'velocity'), t = regler(k, 'turn');
  zeiger(k, v, 'pointerdown', 1, 100, 0);
  zeiger(k, t, 'pointerdown', 2, 200, 50);
  zeiger(k, t, 'pointermove', 1, 0, 50); // fremder Zeiger auf dem Lenkregler zählt nicht
  zeiger(k, v, 'pointerdown', 3, 100, 100); // zweiter Finger auf demselben Regler zählt nicht
  await k.antworte();
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus), [[100, 0], [100, -128]]);
  assert.deepEqual(v.gefangen, [1]);
  zeiger(k, v, 'pointerup', 1);
  await k.antworte();
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus).at(-1), [0, -128], 'Lenken läuft weiter');
  assert.equal(v.getAttribute('aria-valuetext'), 'Mitte');
  zeiger(k, t, 'pointerup', 2);
  await k.antworte();
  letzterIstStopp(k.haus);
});

for (const ende of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test('Auto-Stopp: ' + ende + ' am Regler', async () => {
    const k = ansicht();
    k.starten();
    const t = regler(k, 'turn');
    zeiger(k, t, 'pointerdown', 4, 0, 50);
    await k.antworte();
    zeiger(k, t, ende, 4);
    assert.deepEqual(schritte(k.haus), [[0, 128], [0, 0]]);
    assert.equal(t.hasAttribute('data-held'), false);
    assert.equal(t.querySelector('.remote-knob').style.transform, 'translate(0%, 0%)', 'federt zur Mitte zurück');
  });
}

test('Zurückfedern: Übergang nur beim Loslassen, keiner bei reduzierter Bewegung', () => {
  const { I } = ansicht();
  assert.match(I.DIALOG_STYLES, /\.remote-stick:not\(\[data-held\]\) \.remote-knob\s*\{[^}]*transition:/);
  assert.match(I.DIALOG_STYLES, /prefers-reduced-motion: reduce\)\s*\{[^}]*\.remote-knob\s*\{\s*transition: none/);
});

test('Haptik beim Verlassen der Totzone und beim Stopp, nicht in der Totzone; disable_haptic schaltet ab', async () => {
  for (const [aus, erwartet] of [[false, 2], [true, 0]]) {
    const u = neueUmgebung(), haus = hausAus('voll');
    steuerbar(haus);
    const vib = [];
    u.kontext.navigator.vibrate = (ms) => { vib.push(ms); return true; };
    const karte = neueKarte(u, haus, { disable_haptic: aus });
    karte.shadowRoot.querySelector('.menu-button').click();
    eintrag(u, 'remote').click();
    const k = { u };
    vib.length = 0;
    $d(u, '[data-action="arm"]').click();
    vib.length = 0;
    const v = regler(k, 'velocity');
    zeiger(k, v, 'pointerdown', 1, 100, 45); // in der Totzone
    assert.equal(vib.length, 0);
    zeiger(k, v, 'pointermove', 1, 100, 10);
    zeiger(k, v, 'pointermove', 1, 100, 5);
    zeiger(k, v, 'pointerup', 1);
    assert.equal(vib.length, erwartet, aus ? 'abgeschaltet' : 'raus aus der Totzone + Stopp');
  }
});

test('Halte-Knöpfe ▲▼◀▶ fahren mit 50 % über dieselbe Sende-Logik; Stopp-Knopf hält an', async () => {
  const k = ansicht();
  k.starten();
  const namen = ['forward', 'backward', 'left', 'right'].map((r) => $d(k.u, '[data-hold="' + r + '"]').getAttribute('aria-label'));
  assert.deepEqual(namen, ['Vorwärts (halten)', 'Rückwärts (halten)', 'Links drehen (halten)', 'Rechts drehen (halten)']);
  const vor = halte(k, 'forward');
  zeiger(k, vor, 'pointerdown', 5);
  assert.deepEqual(vor.gefangen, [5]);
  await k.antworte();
  const links = halte(k, 'left');
  zeiger(k, links, 'pointerdown', 6);
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus), [[50, 0], [50, 64]]);
  zeiger(k, vor, 'pointerleave', 5);
  await k.antworte();
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus).at(-1), [0, 64]);
  vor.click(); // Klick nach dem Loslassen stoppt den anderen Knopf nicht
  assert.deepEqual(schritte(k.haus).at(-1), [0, 64]);
  await k.antworte();
  $d(k.u, '[data-action="stop"]').click();
  letzterIstStopp(k.haus);
  const zurueck = halte(k, 'backward');
  await k.antworte();
  k.u.uhr.vor(400);
  await k.antworte();
  zeiger(k, zurueck, 'pointerdown', 9);
  k.u.uhr.vor(200);
  assert.deepEqual(schritte(k.haus).at(-1), [-50, 0]);
  zeiger(k, zurueck, 'lostpointercapture', 9);
  await k.antworte();
  letzterIstStopp(k.haus);
});

// ── Task 4: Tastatur (REM-02) ───────────────────────────────────────────────

/** Freigegeben; jeder Schritt wird sofort beantwortet und der Abstand abgewartet. */
async function tastatur() {
  const k = ansicht();
  k.starten();
  k.schritt = async () => { while (k.offen.length) await k.antworte(); k.u.uhr.vor(200); };
  k.runter = (key, extra) => { const e = k.u.neuesEreignis('keydown', Object.assign({ key }, extra)); k.u.document.dispatchEvent(e); return e; };
  k.hoch = (key, extra) => { const e = k.u.neuesEreignis('keyup', Object.assign({ key }, extra)); k.u.document.dispatchEvent(e); return e; };
  return k;
}

test('Tastatur: W/S/↑/↓ und A/D/←/→ kombinierbar, letzte keyup = Stopp', async () => {
  const k = await tastatur();
  const e = k.runter('w');
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(schritte(k.haus), [[100, 0]]);
  k.runter('d');
  await k.schritt();
  assert.deepEqual(schritte(k.haus).at(-1), [100, -128]);
  k.hoch('w');
  await k.schritt();
  assert.deepEqual(schritte(k.haus).at(-1), [0, -128], 'D hält noch');
  k.hoch('d');
  await k.schritt();
  letzterIstStopp(k.haus);
  for (const [key, soll] of [['ArrowUp', [100, 0]], ['ArrowDown', [-100, 0]], ['ArrowLeft', [0, 128]], ['ArrowRight', [0, -128]], ['S', [-100, 0]], ['A', [0, 128]]]) {
    k.u.uhr.vor(1000);
    await k.schritt();
    k.runter(key);
    await k.schritt();
    assert.deepEqual(schritte(k.haus).filter(([v, r]) => v || r).at(-1), soll, key);
    k.hoch(key);
    await k.schritt();
  }
});

test('Tastatur: Auto-Repeat ignoriert, auch nach Fokusverlust kein Wiederanfahren', async () => {
  const k = await tastatur();
  k.runter('w');
  for (let i = 0; i < 20; i++) k.runter('w', { repeat: true });
  assert.equal(schritte(k.haus).length, 1);
  for (const fn of k.u.kontext.window.listeners.blur || []) fn({});
  await k.schritt();
  const vorher = schritte(k.haus).length;
  k.runter('w', { repeat: true });
  k.u.uhr.vor(1000);
  await k.schritt();
  assert.ok(schritte(k.haus).slice(vorher).every(([v, r]) => !v && !r), 'gehaltene Taste nach blur fährt nicht wieder an');
  k.hoch('w');
  k.runter('w');
  await k.schritt();
  assert.deepEqual(schritte(k.haus).at(-1), [100, 0], 'neuer Tastendruck fährt');
});

test('Tastatur: Umschalt langsamer, Strg nur aufs Drehen, Strg+W/S nicht belegt', async () => {
  const k = await tastatur();
  k.runter('W', { shiftKey: true });
  assert.deepEqual(schritte(k.haus), [[50, 0]]);
  k.hoch('Shift', { shiftKey: false });
  await k.schritt();
  assert.deepEqual(schritte(k.haus).at(-1), [100, 0], 'Umschalt losgelassen → voll');
  k.hoch('w');
  await k.schritt();
  k.u.uhr.vor(1000);
  await k.schritt();
  k.runter('a', { ctrlKey: true });
  await k.schritt();
  assert.deepEqual(schritte(k.haus).filter(([v, r]) => v || r).at(-1), [0, 64]);
  k.hoch('a', { ctrlKey: true });
  await k.schritt();
  k.u.uhr.vor(1000);
  await k.schritt();
  const vorher = k.haus.rufe.length;
  for (const key of ['w', 's', 'W']) {
    const e = k.runter(key, { ctrlKey: true });
    assert.equal(e.defaultPrevented, false, 'Strg+' + key + ' bleibt beim Browser');
    k.hoch(key, { ctrlKey: true });
  }
  k.u.uhr.vor(1000);
  assert.equal(k.haus.rufe.length, vorher);
});

test('Tastatur: Leertaste = Stopp, Escape = Stopp und Ansicht verlassen', async () => {
  const k = await tastatur();
  k.runter('w');
  k.runter('a');
  await k.antworte();
  const e = k.runter(' ');
  assert.equal(e.defaultPrevented, true);
  letzterIstStopp(k.haus);
  k.hoch('w'); k.hoch('a');
  await k.schritt();
  k.u.uhr.vor(1000);
  await k.schritt();
  k.runter('ArrowUp');
  await k.antworte();
  k.runter('Escape');
  letzterIstStopp(k.haus);
  k.u.zurueck();
  assert.equal($d(k.u, '.remote'), null, 'zurück im Menü');
});

test('REM-02 Leertaste stoppt immer, auch wenn ein Knopf/Schalter den Fokus hat (keine Knopf-Auslösung)', async () => {
  const k = await tastatur();
  for (const sel of ['[data-action="precision"]', '[data-action="stop"]', '.remote-hold', '[data-axis="turn"]']) {
    const knopf = $d(k.u, sel);
    assert.ok(knopf, sel);
    knopf.focus();
    k.runter('w');
    await k.antworte();
    assert.deepEqual(schritte(k.haus).at(-1), [100, 0], sel + ': fährt');
    let klicks = 0;
    const zaehle = () => { klicks++; };
    knopf.addEventListener('click', zaehle);
    const runter = k.u.tasteAn(knopf, 'keydown', { key: ' ' });
    assert.equal(runter.defaultPrevented, true, sel + ': keydown verhindert');
    letzterIstStopp(k.haus);
    const hoch = k.u.tasteAn(knopf, 'keyup', { key: ' ' });
    assert.equal(hoch.defaultPrevented, true, sel + ': keyup verhindert (sonst löst der Knopf aus)');
    knopf.removeEventListener('click', zaehle);
    assert.equal(klicks, 0);
    assert.equal($d(k.u, '[data-action="precision"]').getAttribute('aria-checked'), 'false', sel + ': Präzision unverändert');
    k.hoch('w');
    await k.schritt();
    k.u.uhr.vor(1000);
    await k.schritt();
  }
});

test('REM-02 Leertaste vor dem Starten löst den fokussierten Knopf nicht aus und sendet nichts', () => {
  const k = ansicht();
  const knopf = $d(k.u, '[data-action="precision"]');
  knopf.focus();
  assert.equal(k.u.tasteAn(knopf, 'keydown', { key: ' ' }).defaultPrevented, true);
  assert.equal(k.u.tasteAn(knopf, 'keyup', { key: ' ' }).defaultPrevented, true);
  assert.deepEqual(k.haus.rufe, []);
});

test('Tastatur: nur freigegeben, nicht in Textfeldern, nicht wenn eine andere Ansicht oben liegt', async () => {
  const k = ansicht();
  taste(k.u, 'w');
  assert.deepEqual(k.haus.rufe, [], 'unscharf');
  k.starten();
  const feld = k.u.document.createElement('input');
  dialogVon(k.u).shadowRoot.appendChild(feld);
  feld.focus();
  taste(k.u, 'w');
  assert.deepEqual(k.haus.rufe, [], 'Textfeld hat den Fokus');
  feld.remove();
  $d(k.u, '[data-axis="velocity"]').focus();
  dialogVon(k.u)._views.push({ title: 'x', kind: 'editor', render: () => {} });
  taste(k.u, 'w');
  assert.deepEqual(k.haus.rufe, [], 'andere Ansicht oben');
  dialogVon(k.u)._views.pop();
  taste(k.u, 'w');
  assert.deepEqual(schritte(k.haus), [[100, 0]]);
});

test('Präzision: sichtbarer Schalter, halbiert Tempo und Drehen, je Öffnen aus', async () => {
  const k = await tastatur();
  const p = $d(k.u, '[data-action="precision"]');
  assert.equal(p.getAttribute('role'), 'switch');
  assert.equal(p.getAttribute('aria-checked'), 'false');
  assert.match(p.textContent, /Präzision/);
  p.click();
  assert.equal(p.getAttribute('aria-checked'), 'true');
  k.runter('w'); k.runter('d');
  await k.schritt();
  assert.deepEqual(schritte(k.haus).at(-1), [50, -64]);
  assert.equal($d(k.u, '[data-axis="velocity"]').getAttribute('aria-valuetext'), 'Mitte', 'Tasten bewegen den Regler nicht');
});

test('Hilfe nennt die Tastenbelegung und dass Strg+W/S beim Browser bleibt (R03)', () => {
  const k = ansicht();
  const hilfe = $d(k.u, '.remote-help').textContent;
  for (const t of ['W', 'S', 'A', 'D', 'Umschalt', 'Strg', 'Leertaste', 'Escape', 'Strg+W']) assert.ok(hilfe.includes(t), t);
});

test('Starten legt den Fokus auf den Tempo-Regler (Tastatur sofort bereit)', () => {
  const k = ansicht();
  k.starten();
  assert.equal(dialogVon(k.u).shadowRoot.activeElement, $d(k.u, '[data-axis="velocity"]'));
});

// ── Task 5: Live-Karte, Zustandsknöpfe, Layout (REM-03) ─────────────────────

const KAMERA = 'camera.robo_map';
/** Ansicht mit fertigem Kartenbild der einen MapView (Bildmodus, Größe gesetzt wie nach decode). */
async function mitKarte(name = 'voll', sauger) {
  const k = ansicht(name, sauger);
  await mikro();
  k.map = k.karte._map;
  k.map._size = { width: 1000, height: 800 };
  k.kamera = (attribute) => { const alt = k.haus.states[KAMERA]; k.karte.hass = k.haus.setze({ [KAMERA]: Object.assign({}, alt, { attributes: Object.assign({}, alt.attributes, attribute) }) }); };
  k.karte.hass = k.haus.fremd();
  return k;
}
const prozent = (k, pos) => { const p = k.map.toImage(pos); return 'translate(' + (p.x / 10).toFixed(2) + '%, ' + (p.y / 8).toFixed(2) + '%)'; };

test('Karte: Bild der aktiven Kamera (gleiche Adresse, kein eigener Abruf) und Marker über toImage', async () => {
  const k = await mitKarte();
  const abrufe = k.map.stats.images;
  const bild = $d(k.u, '.remote-map-base');
  assert.equal(bild.tagName, 'IMG');
  assert.equal(bild.getAttribute('src'), k.map._image.getAttribute('src'), 'dieselbe URL → Browser-Cache');
  assert.equal(bild.getAttribute('alt'), '');
  const pos = k.haus.states[KAMERA].attributes.vacuum_position;
  assert.equal($d(k.u, '.remote-marker').style.transform, prozent(k, pos));
  assert.equal($d(k.u, '.remote-map-note').hidden, true);
  k.kamera({ vacuum_position: { x: pos.x + 500, y: pos.y, a: 0 } });
  assert.equal($d(k.u, '.remote-marker').style.transform, prozent(k, { x: pos.x + 500, y: pos.y }), 'neue Position');
  const p = k.map.toImage({ x: pos.x + 500, y: pos.y }), q = k.map.toImage({ x: pos.x + 600, y: pos.y });
  assert.equal($d(k.u, '.remote-robot').style.transform, 'rotate(' + Math.round(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI) + 'deg)', 'Richtung aus a');
  assert.equal(k.map.stats.images, abrufe, 'kein zusätzliches Kartenbild geladen');
  assert.deepEqual(k.haus.rufe, []);
});

test('Karte: im Datenmodus eine Kopie des gemalten Canvas, neu bei map-frame', async () => {
  const k = await mitKarte();
  const quelle = k.u.document.createElement('canvas');
  quelle.width = 1000; quelle.height = 800;
  k.map._image = quelle;
  const gemalt = [];
  const orig = k.u.document.createElement;
  k.u.document.createElement = (tag) => { const n = orig.call(k.u.document, tag); if (tag === 'canvas') n.getContext = () => ({ drawImage: (q) => gemalt.push(q) }); return n; };
  k.karte.hass = k.haus.fremd();
  k.map.el.dispatchEvent(new k.u.kontext.CustomEvent('map-frame', { detail: { frameId: 2, mode: 'data' } }));
  const kopie = $d(k.u, '.remote-map-base');
  assert.equal(kopie.tagName, 'CANVAS');
  assert.equal(kopie.width, 1000);
  assert.ok(gemalt.length >= 1 && gemalt.every((q) => q === quelle));
  const vorher = gemalt.length;
  k.karte.hass = k.haus.fremd();
  assert.equal(gemalt.length, vorher, 'fremdes Update malt nicht neu');
  k.map.el.dispatchEvent(new k.u.kontext.CustomEvent('map-frame', { detail: { frameId: 3, mode: 'data' } }));
  assert.equal(gemalt.length, vorher + 1, 'neuer Frame → neu kopiert');
  k.u.document.createElement = orig;
});

test('Karte: ohne Kartenkamera bzw. ohne Position Hinweis, Regler bleiben (R18)', async () => {
  const k = ansicht('ohne-karte');
  assert.equal($d(k.u, '.remote-map').hidden, true);
  assert.match($d(k.u, '.remote-map-note').textContent, /Keine Karte/);
  assert.ok($d(k.u, '[data-axis="velocity"]'));
  const k2 = await mitKarte();
  k2.kamera({ vacuum_position: undefined });
  assert.equal($d(k2.u, '.remote-marker').hidden, true);
  assert.match($d(k2.u, '.remote-map-note').textContent, /Position/);
});

test('Karte: verlassen entfernt den map-frame-Zuhörer', async () => {
  const k = await mitKarte();
  const vorher = (k.map.el.listeners['map-frame'] || []).length;
  $d(k.u, '[data-action="back"]').click();
  assert.equal((k.map.el.listeners['map-frame'] || []).length, vorher - 1);
});

test('Zustand: HA-Übersetzung des Zustands in der Ansicht', () => {
  const k = ansicht();
  assert.equal($d(k.u, '.remote-state').textContent, 'Angedockt');
  k.sauger('cleaning', { status: 'remote_control' });
  assert.equal($d(k.u, '.remote-state').textContent, 'Reinigt');
});

test('Fortsetzen/Zurück zur Station je Zustand über core _call (vacuum.start / return_to_base)', async () => {
  const k = ansicht();
  assert.equal($d(k.u, '[data-control="resume"]').hidden, true, 'angedockt: kein Fortsetzen');
  assert.equal($d(k.u, '[data-control="return"]').hidden, true, 'angedockt: kein Zurück');
  k.sauger('paused', { docked: false, started: true, paused: true });
  assert.equal($d(k.u, '[data-control="resume"]').hidden, false);
  assert.equal($d(k.u, '[data-control="return"]').hidden, false);
  k.sauger('cleaning', { docked: false, started: true, paused: false, running: false, status: 'remote_control' });
  assert.equal($d(k.u, '[data-control="resume"]').hidden, false, 'Aufgabe begonnen, gerade ferngesteuert');
  k.sauger('returning', { docked: false, started: false, paused: false });
  assert.equal($d(k.u, '[data-control="return"]').hidden, true, 'fährt schon zurück');
  assert.equal($d(k.u, '[data-control="resume"]').hidden, true);
  k.sauger('idle', { docked: false });
  $d(k.u, '[data-control="return"]').click();
  assert.deepEqual(roh(k.haus.rufe.at(-1)), { domain: 'vacuum', service: 'return_to_base', data: { entity_id: 'vacuum.robo' } });
  k.sauger('paused', { docked: false, started: true, paused: true });
  $d(k.u, '[data-control="resume"]').click();
  assert.deepEqual(roh(k.haus.rufe.at(-1)), { domain: 'vacuum', service: 'start', data: { entity_id: 'vacuum.robo' } });
});

test('Fortsetzen während der Fahrt: erst Stopp, dann der core-Aufruf', async () => {
  const k = ansicht();
  await k.faehrt();
  k.sauger('cleaning', { docked: false, started: true, paused: false, running: false });
  $d(k.u, '[data-control="resume"]').click();
  await k.antworte();
  const namen = k.haus.rufe.map((r) => r.service);
  assert.deepEqual(namen.slice(0, 2), [DIENST, DIENST]);
  assert.deepEqual(roh(k.haus.rufe[1].data), { entity_id: 'vacuum.robo', velocity: 0, rotation: 0 });
  assert.ok(namen.includes('start'));
});

test('Layout: Hochformat Karte oben; Querformat am Handy Regler an den Rändern mit Safe Areas; Linkshänder gespiegelt', () => {
  const k = ansicht('voll');
  const kinder = $d(k.u, '.remote').childNodes.map((n) => n.className.split(' ')[0]);
  assert.ok(kinder.indexOf('remote-map-wrap') < kinder.indexOf('remote-pad'), 'Karte vor den Reglern');
  const css = k.I.DIALOG_STYLES;
  const quer = css.match(/@media \(orientation: landscape\) and \(max-height: 500px\) \{([\s\S]*?)\n\}/);
  assert.ok(quer, 'Querformat-Regel');
  assert.match(quer[1], /\.remote-pad \{ display: contents; \}/);
  assert.match(quer[1], /grid-template-areas: "speed info turn"/);
  assert.match(quer[1], /safe-area-inset-left/);
  assert.match(quer[1], /safe-area-inset-right/);
  assert.match(css, /\.remote\[data-hand=left\]/);
  assert.equal($d(k.u, '.remote').getAttribute('data-hand'), 'right');
  const u = neueUmgebung(), haus = hausAus('voll');
  const karte = neueKarte(u, haus, { left_handed: true });
  karte.shadowRoot.querySelector('.menu-button').click();
  eintrag(u, 'remote').click();
  assert.equal($d(u, '.remote').getAttribute('data-hand'), 'left');
});

test('Dialog-Element entfernt (ohne Schließen): Stopp und keine Tasten-/Fokus-Zuhörer mehr', async () => {
  const k = ansicht();
  await k.faehrt();
  const dialog = dialogVon(k.u);
  dialog.remove();
  letzterIstStopp(k.haus);
  await k.antworte();
  k.u.uhr.vor(400);
  await k.antworte();
  const vorher = k.haus.rufe.length;
  taste(k.u, 'w');
  for (const fn of k.u.kontext.window.listeners.blur || []) fn({});
  k.u.uhr.vor(1000);
  assert.equal(k.haus.rufe.length, vorher, 'eine abgehängte Ansicht reagiert nicht mehr');
});
