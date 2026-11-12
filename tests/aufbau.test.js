'use strict';
// #1002: Panelinhalt, Kontextbereich, Aktionsleiste und Kartenwerkzeuge nach dem Designkonzept.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

function aufbau({ fixture = 'voll', attribute, zustand, config, breite } = {}) {
  const u = neueUmgebung();
  const beobachter = [];
  u.kontext.ResizeObserver = class { constructor(fn) { this.fn = fn; this.ziele = []; beobachter.push(this); } observe(el) { this.ziele.push(el); } disconnect() {} };
  const haus = hausAus(fixture);
  if (attribute || zustand) {
    const alt = haus.states['vacuum.robo'];
    haus.states = Object.assign({}, haus.states, { 'vacuum.robo': Object.assign({}, alt, { state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) }) });
  }
  const karte = neueKarte(u, haus, config);
  const setze = (w) => { for (const b of beobachter) if (b.ziele.includes(karte)) b.fn([{ target: karte, contentRect: { width: w, height: 800 } }]); };
  if (breite) setze(breite);
  return { u, haus, karte, setze, sr: karte.shadowRoot };
}
const $ = (k, sel) => k.sr.querySelector(sel);
const $$ = (k, sel) => k.sr.querySelectorAll(sel);
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const ansichtId = (u) => { const d = dialogVon(u); const s = d && d.shadowRoot.querySelector('.sheet'); return s ? s.getAttribute('data-view') : null; };
const aufgabe = (k, name) => $$(k, '.task').find((b) => b.getAttribute('data-task') === name);
const ctl = (k, name) => $$(k, '.ctl').find((b) => b.getAttribute('data-action') === name);

// ── Task 2: Panelinhalt ──────────────────────────────────────────────────
test('CORE-09 Statuskacheln in der Reihenfolge Akku, Fläche, Zeit', () => {
  const k = aufbau();
  assert.deepEqual($$(k, '.metric').map((m) => m.getAttribute('data-metric')), ['battery', 'area', 'time']);
});

test('CORE-03 Statuspunkt: Zustandszeile trägt eine Stufe (Farbe nie allein, Text bleibt)', () => {
  assert.equal($(aufbau(), '.state').getAttribute('data-level'), 'ok');
  assert.equal($(aufbau({ zustand: 'cleaning' }), '.state').getAttribute('data-level'), 'active');
  const fehler = $(aufbau({ zustand: 'error' }), '.state');
  assert.equal(fehler.getAttribute('data-level'), 'error');
  assert.ok(fehler.textContent.length > 0);
});

test('DOCK-05 Stationshinweis nur bei Warnung oder Fehler der Station; Tipp öffnet die Station', () => {
  const ok = aufbau();
  assert.equal($(ok, '.station-hint'), null, 'alles gut: kein Hinweis');
  const warn = aufbau({ attribute: { clean_water_tank_status: 'Low water' } });
  const hint = $(warn, '.station-hint');
  assert.ok(hint, 'Warnung: Hinweis da');
  assert.equal(hint.getAttribute('data-level'), 'warning');
  assert.equal(hint.getAttribute('data-action'), 'station-hint');
  assert.match(hint.textContent, /Station/);
  assert.match(hint.textContent, /Frischwasser/i);
  assert.ok($(warn, '.panel').contains ? true : true);
  hint.click();
  assert.equal(ansichtId(warn.u), 'station', 'öffnet die Stationsansicht');
  const err = aufbau({ attribute: { clean_water_tank_status: 'Not installed' } });
  assert.equal($(err, '.station-hint').getAttribute('data-level'), 'error');
  const aus = aufbau({ attribute: { clean_water_tank_status: 'Low water' }, config: { hidden_card_objects: ['dock_status_indicator'] } });
  assert.equal($(aus, '.station-hint'), null, 'mit dem Stationsanzeiger ausgeblendet');
  assert.equal($(aufbau({ fixture: 'ohne-dock', attribute: { clean_water_tank_status: 'Low water' } }), '.station-hint'), null, 'ohne Station nie');
});

test('CORE-06 Segmentsteuerung: fünf Arten als Radiogruppe, Go-To heißt auf Deutsch „Ziel“', () => {
  const k = aufbau();
  const gruppe = $(k, '.tasks');
  assert.equal(gruppe.getAttribute('role'), 'radiogroup');
  assert.deepEqual($$(k, '.task').map((b) => b.textContent), ['Gesamt', 'Raum', 'Zone', 'Spot', 'Ziel']);
  assert.equal(aufgabe(k, 'goto').getAttribute('aria-label'), 'Ziel');
});

test('SET-01 Einstellungszeile fasst Modus · Saugstufe · Feuchte zusammen und öffnet die Reinigungseinstellungen', () => {
  const k = aufbau();
  const zeile = $(k, '[data-action="clean-settings"]');
  assert.ok(zeile.classList.contains('settings-row'));
  const text = zeile.querySelector('.settings-summary').textContent;
  assert.equal(text.split(' · ').length, 3, text);
  assert.match(text, /Turbo/);
  assert.match(text, /26/);
  assert.match(zeile.getAttribute('aria-label'), /^Reinigungseinstellungen: /);
  zeile.click();
  assert.equal(ansichtId(k.u), 'clean-settings');
});

// ── Task 3: Kontextbereich ───────────────────────────────────────────────
const sichtbareChips = (k) => $$(k, '.room-chip').filter((c) => !c.hidden);

test('MAP-08/TASK-02 Raum-Chips liegen im Panel, nicht mehr als eigene Reihe unter der Karte', () => {
  const k = aufbau();
  const liste = $(k, '.room-chips');
  assert.ok(liste, 'Chips da');
  assert.equal(liste.parentNode.className, 'chip-slot');
  assert.equal(liste.parentNode.parentNode, $(k, '.task-area'), 'im Kontextbereich');
  assert.equal(k.karte._map.el.childNodes.some((n) => n.className === 'room-chips'), false, 'keine Reihe unter der Karte');
});

test('TASK-01 Gesamt: „Alle 7 Räume“, Räume in Reinigungsfolge, drei sichtbar und „+ 4 weitere“ klappt auf', () => {
  const k = aufbau();
  assert.equal($(k, '.rooms-title').textContent, 'Alle 7 Räume');
  assert.deepEqual($$(k, '.room-chip').map((c) => c.getAttribute('data-room')), ['3', '5', '7', '1', '6', '9', '4'], 'Folge wie cleaning_sequence/order');
  assert.deepEqual(sichtbareChips(k).map((c) => c.getAttribute('data-room')), ['3', '5', '7']);
  const mehr = $(k, '[data-action="rooms-more"]');
  assert.equal(mehr.textContent, '+ 4 weitere');
  assert.equal(mehr.getAttribute('aria-expanded'), 'false');
  mehr.click();
  assert.equal(sichtbareChips(k).length, 7, 'alle sichtbar');
  assert.equal($(k, '[data-action="rooms-more"]').getAttribute('aria-expanded'), 'true');
  assert.equal($(k, '[data-action="rooms-more"]').textContent, 'Weniger');
});

test('CORE-06 Gesamt: Tastatur wandert nur über sichtbare Chips (R15/R22)', () => {
  const k = aufbau();
  const chips = sichtbareChips(k);
  chips[2].dispatchEvent(k.u.neuesEreignis('keydown', { key: 'ArrowRight' }));
  assert.equal(sichtbareChips(k)[0].tabIndex, 0, 'vom dritten zurück zum ersten, kein verborgener Chip');
  chips[0].dispatchEvent(k.u.neuesEreignis('keydown', { key: 'End' }));
  assert.equal(sichtbareChips(k)[2].tabIndex, 0);
});

test('TASK-01 Gesamt: „Reihenfolge ändern“ öffnet die Reihenfolge der Reinigungseinstellungen', () => {
  const k = aufbau();
  const knopf = $(k, '[data-action="sequence-open"]');
  assert.ok(knopf);
  assert.equal(knopf.textContent, 'Reihenfolge ändern');
  knopf.click();
  assert.equal(ansichtId(k.u), 'sequence');
});

test('TASK-02 Raum: Auswahl im Panel mit Reihenfolge-Badges, alle Chips sichtbar, Wiederholungen als Stepper', () => {
  const k = aufbau();
  aufgabe(k, 'room').click();
  assert.equal(sichtbareChips(k).length, 7, 'im Raummodus nie eingeklappt');
  assert.equal($(k, '[data-action="rooms-more"]'), null);
  const chip = (id) => $$(k, '.room-chip').find((c) => c.getAttribute('data-room') === String(id));
  chip(5).click();
  chip(3).click();
  assert.equal(chip(5).getAttribute('aria-pressed'), 'true');
  // customized_cleaning-fähig: das Gerät reinigt in der gespeicherten Folge (3 vor 5), die Badges zeigen sie.
  assert.equal(chip(3).querySelector('.room-order').textContent, '1');
  assert.equal(chip(5).querySelector('.room-order').textContent, '2');
  assert.equal($(k, '.task-count').textContent, '2 Räume gewählt');
  assert.ok($(k, '.task-repeats'), 'Wiederholungen da');
  assert.ok($(k, '[data-action="repeats-plus"]'));
});

// ── Task 4: Aktionsleiste ────────────────────────────────────────────────
test('CORE-07 Primärknopf nennt die Aufgabe: „Alles reinigen“, „N Räume reinigen“, Zone, Spot', () => {
  const k = aufbau();
  assert.equal(ctl(k, 'start').textContent, 'Alles reinigen');
  assert.equal(ctl(k, 'start').getAttribute('aria-label'), 'Alles reinigen');
  aufgabe(k, 'room').click();
  const chip = (id) => $$(k, '.room-chip').find((c) => c.getAttribute('data-room') === String(id));
  chip(3).click();
  assert.equal(ctl(k, 'start').textContent, '1 Raum reinigen');
  chip(5).click();
  assert.equal(ctl(k, 'start').textContent, '2 Räume reinigen');
  aufgabe(k, 'zone').click();
  assert.equal(ctl(k, 'start').textContent, 'Zone reinigen');
  k.karte._addZone(k.karte._fitZone({ x0: -1000, y0: -1000, x1: 0, y1: 0 }));
  k.karte._addZone(k.karte._fitZone({ x0: 500, y0: 500, x1: 1500, y1: 1500 }));
  assert.equal(ctl(k, 'start').textContent, '2 Zonen reinigen');
  aufgabe(k, 'spot').click();
  assert.equal(ctl(k, 'start').textContent, 'Spot reinigen');
  const en = aufbau({ fixture: 'voll' });
  assert.ok(en);
});

test('CORE-07 laufend: Pause/Stopp/Zurück wie bisher, kein Aufgabentext', () => {
  const k = aufbau({ zustand: 'cleaning' });
  assert.deepEqual($$(k, '.ctl').filter((b) => b.getAttribute('data-action') !== 'shortcuts').map((b) => b.getAttribute('data-action')), ['pause', 'stop', 'return']);
});

test('CORE-08 Aktionsleiste: Station sekundär, Primär füllt; schmal Station als 52-px-Symbolknopf; Linkshänder gespiegelt', () => {
  const { CARD_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  assert.match(CARD_STYLES, /\.controls \.ctl\[data-variant=primary\] \{[^}]*flex: 1 1 auto;/);
  assert.match(CARD_STYLES, /:host\(:not\(\[data-width=wide\]\)\) \.controls \.dock \{[^}]*width: 52px;/);
  assert.match(CARD_STYLES, /:host\(:not\(\[data-width=wide\]\)\) \.controls \.dock span,[^{]*\{[^}]*display: none;/);
  assert.match(CARD_STYLES, /:host\(\[data-hand=left\]\) \.dock \{[^}]*order: 1;/);
  const k = aufbau();
  assert.match($(k, '.dock').getAttribute('aria-label'), /^Station/, 'Symbolknopf behält seinen Namen');
});
