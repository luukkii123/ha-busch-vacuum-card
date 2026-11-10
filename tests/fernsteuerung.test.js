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
