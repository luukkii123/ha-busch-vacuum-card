'use strict';
// Plan Task 6 (CORE-08/13/14/15): Layout, Linkshänder, Karten-Sperre, Haptik.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

const knopf = (karte, aktion) => karte.shadowRoot.querySelectorAll('.ctl').find((b) => b.getAttribute('data-action') === aktion);
const schloss = (karte) => karte.shadowRoot.querySelector('.lock');
const symbol = (node) => node.querySelector('ha-icon').getAttribute('icon');

/** Umgebung mit wählbarem Gerät: Touch (maxTouchPoints) und Vibration (Aufrufe gesammelt). */
function umgebung({ touch = false, vibrate = true } = {}) {
  const u = neueUmgebung();
  u.kontext.navigator.maxTouchPoints = touch ? 5 : 0;
  u.vibriert = [];
  if (vibrate) u.kontext.navigator.vibrate = (ms) => { u.vibriert.push(ms); return true; };
  return u;
}
const karte = (config = {}, opts = {}, fixture = 'voll') => { const u = umgebung(opts); return { u, karte: neueKarte(u, hausAus(fixture), config) }; };
const halten = (u, node, ms) => { node.dispatchEvent(u.neuesEreignis('pointerdown')); u.uhr.vor(ms); };
const loslassen = (u, node) => node.dispatchEvent(u.neuesEreignis('pointerup'));

// ── Layout (CORE-13) ───────────────────────────────────────────────────────
test('normale Karte: begrenzte Höhe, Versatz 0', () => {
  const { karte: k } = karte();
  assert.equal(k.getAttribute('data-layout'), 'card');
  assert.equal(k.style['--bvc-height-offset'], '0px');
  assert.equal(k.style['--bvc-header-height'], 'var(--header-height, 56px)', 'Kopfhöhe von HA');
});

test('Panel Mode über isPanel und layout = panel', () => {
  const a = karte().karte;
  a.isPanel = true;
  assert.equal(a.getAttribute('data-layout'), 'panel');
  const b = karte().karte;
  b.layout = 'panel';
  assert.equal(b.getAttribute('data-layout'), 'panel');
  b.layout = 'grid';
  assert.equal(b.getAttribute('data-layout'), 'card');
});

test('full_height füllt die Höhe, max_height_offset zieht ab', () => {
  const { karte: k } = karte({ full_height: true, max_height_offset: 120 });
  assert.equal(k.getAttribute('data-layout'), 'full');
  assert.equal(k.style['--bvc-height-offset'], '120px');
});

test('aspect_ratio: 16:9, 16/9 und Zahl; Unsinn und full_height ohne Seitenverhältnis', () => {
  assert.equal(karte({ aspect_ratio: '16:9' }).karte.style['--bvc-aspect-ratio'], '16 / 9');
  assert.equal(karte({ aspect_ratio: '4/3' }).karte.style['--bvc-aspect-ratio'], '4 / 3');
  assert.equal(karte({ aspect_ratio: 1.5 }).karte.style['--bvc-aspect-ratio'], '1.5');
  assert.equal(karte({ aspect_ratio: '16:9' }).karte.hasAttribute('data-aspect'), true);
  assert.equal(karte({ aspect_ratio: 'breit' }).karte.hasAttribute('data-aspect'), false);
  assert.equal(karte({ aspect_ratio: '16:9', full_height: true }).karte.hasAttribute('data-aspect'), false);
});

test('CSS: Panel randlos, Höhe aus Variable, Seitenverhältnis, Linkshänder gespiegelt', () => {
  const { CARD_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  assert.match(CARD_STYLES, /:host\(\[data-layout=panel\]\) ha-card \{[^}]*border-radius: 0;[^}]*box-shadow: none;/);
  assert.match(CARD_STYLES, /max-height: calc\(100dvh - var\(--bvc-header-height, 56px\) - var\(--bvc-height-offset, 0px\)\)/);
  assert.match(CARD_STYLES, /:host\(\[data-layout=full\]\) ha-card \{[^}]*height: calc\(100dvh/);
  assert.match(CARD_STYLES, /aspect-ratio: var\(--bvc-aspect-ratio\)/);
  assert.match(CARD_STYLES, /:host\(\[data-hand=left\]\) \.dock/);
});

// ── Linkshänder (CORE-08) ──────────────────────────────────────────────────
test('Aktionsknöpfe rechts, Linkshänder links', () => {
  assert.equal(karte().karte.getAttribute('data-hand'), 'right');
  assert.equal(karte({ left_handed: true }).karte.getAttribute('data-hand'), 'left');
});

// ── Karten-Sperre (CORE-14) ────────────────────────────────────────────────
test('locked auto: am Touchgerät gesperrt, im Panel nicht', () => {
  const touch = karte({}, { touch: true }).karte;
  assert.equal(touch.getAttribute('data-locked'), 'true');
  assert.equal(schloss(touch).hidden, false);
  assert.equal(symbol(schloss(touch)), 'mdi:lock');
  assert.match(schloss(touch).getAttribute('aria-label'), /gesperrt.*halten/i, 'Zustand in Worten, nicht nur Symbol');
  const panel = karte({}, { touch: true }).karte;
  panel.isPanel = true;
  assert.equal(panel.getAttribute('data-locked'), 'false');
  assert.equal(karte().karte.getAttribute('data-locked'), 'false', 'Desktop: frei');
});

test('locked always/never/only_touch', () => {
  assert.equal(karte({ locked: 'always' }).karte.getAttribute('data-locked'), 'true');
  const nie = karte({ locked: 'never' }, { touch: true }).karte;
  assert.equal(nie.getAttribute('data-locked'), 'false');
  assert.equal(schloss(nie).hidden, true, 'kein Schloss, wenn nie gesperrt');
  assert.equal(karte({ locked: 'only_touch' }).karte.getAttribute('data-locked'), 'false');
  const touchPanel = karte({ locked: 'only_touch' }, { touch: true }).karte;
  touchPanel.isPanel = true;
  assert.equal(touchPanel.getAttribute('data-locked'), 'true', 'only_touch sperrt auch im Panel');
  assert.equal(karte({ locked: 'quatsch' }, { touch: true }).karte.getAttribute('data-locked'), 'true', 'unbekannt = auto');
});

test('ohne Karte kein Schloss (nichts zu sperren)', () => {
  assert.equal(schloss(karte({ locked: 'always' }, {}, 'ohne-karte').karte).hidden, true);
});

test('Entsperren durch Halten (touch_lock), kurzes Tippen reicht nicht', () => {
  const { u, karte: k } = karte({ locked: 'always', touch_lock: 300 });
  halten(u, schloss(k), 299);
  assert.equal(k.getAttribute('data-locked'), 'true');
  loslassen(u, schloss(k));
  u.uhr.vor(500);
  assert.equal(k.getAttribute('data-locked'), 'true', 'losgelassen vor der Zeit');
  halten(u, schloss(k), 300);
  assert.equal(k.getAttribute('data-locked'), 'false');
  assert.equal(symbol(schloss(k)), 'mdi:lock-open-variant');
  assert.match(schloss(k).getAttribute('aria-label'), /entsperrt/i);
  schloss(k).click();
  assert.equal(k.getAttribute('data-locked'), 'false', 'Klick nach dem Halten schaltet nicht zurück');
  loslassen(u, schloss(k));
  halten(u, schloss(k), 300);
  assert.equal(k.getAttribute('data-locked'), 'true', 'erneutes Halten sperrt wieder');
});

test('touch_lock begrenzt auf 100–400 ms, Vorgabe 200 ms', () => {
  const kurz = karte({ locked: 'always', touch_lock: 20 });
  halten(kurz.u, schloss(kurz.karte), 100);
  assert.equal(kurz.karte.getAttribute('data-locked'), 'false');
  const lang = karte({ locked: 'always', touch_lock: 5000 });
  halten(lang.u, schloss(lang.karte), 400);
  assert.equal(lang.karte.getAttribute('data-locked'), 'false');
  const vorgabe = karte({ locked: 'always' });
  halten(vorgabe.u, schloss(vorgabe.karte), 199);
  assert.equal(vorgabe.karte.getAttribute('data-locked'), 'true');
  vorgabe.u.uhr.vor(1);
  assert.equal(vorgabe.karte.getAttribute('data-locked'), 'false');
});

test('Tastatur: Enter/Leertaste schaltet die Sperre ohne Halten', () => {
  const { u, karte: k } = karte({ locked: 'always' });
  schloss(k).dispatchEvent(u.neuesEreignis('click', { detail: 0 }));
  assert.equal(k.getAttribute('data-locked'), 'false');
});

test('Sperre überlebt eigene und fremde Updates', () => {
  const { u, karte: k } = karte({ locked: 'always' });
  halten(u, schloss(k), 200);
  const haus = hausAus('voll');
  k.hass = haus.fremd();
  assert.equal(k.getAttribute('data-locked'), 'false');
});

// ── Haptik (CORE-15) ───────────────────────────────────────────────────────
test('Haptik bei Steuerknopf, Aufgabenart und Entsperren', () => {
  const { u, karte: k } = karte({ locked: 'always' });
  const aufgabe = (name) => k.shadowRoot.querySelectorAll('.task').find((b) => b.getAttribute('data-task') === name);
  aufgabe('zone').click();
  aufgabe('all').click();
  knopf(k, 'start').click(); // danach läuft die Aufgabe, die Wahl ist gesperrt
  halten(u, schloss(k), 200);
  assert.equal(u.vibriert.length, 4);
});

test('disable_haptic schaltet ab; ohne vibrate kein Fehler', () => {
  const aus = karte({ disable_haptic: true });
  knopf(aus.karte, 'start').click();
  assert.deepEqual(aus.u.vibriert, []);
  const ohne = karte({}, { vibrate: false });
  knopf(ohne.karte, 'start').click();
  assert.deepEqual(ohne.u.fehler, []);
});
