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
  assert.match(CARD_STYLES, /\.controls \.ctl\[data-variant=primary\] \{[^}]*flex: 1 0 auto;/);
  assert.match(CARD_STYLES, /:host\(:not\(\[data-width=wide\]\)\) \.controls \.dock \{[^}]*width: 52px;/);
  assert.match(CARD_STYLES, /:host\(:not\(\[data-width=wide\]\)\) \.controls \.dock span,[^{]*\{[^}]*display: none;/);
  assert.match(CARD_STYLES, /:host\(\[data-hand=left\]\) \.dock \{[^}]*order: 1;/);
  const k = aufbau();
  assert.match($(k, '.dock').getAttribute('aria-label'), /^Station/, 'Symbolknopf behält seinen Namen');
});

// ── Task 5: Kartenwerkzeuge ──────────────────────────────────────────────
const werkzeuge = (k) => k.karte._map.tools.childNodes.filter((n) => !n.hidden).map((n) => n.getAttribute('data-action') || n.className);

test('MAP-02 Werkzeugleiste: eine Gruppe – Zoom +, Zoom −, Einpassen | Bearbeiten, Karten, Info; dazu der Werkzeugknopf', () => {
  const k = aufbau();
  const folge = werkzeuge(k);
  assert.deepEqual(folge.slice(0, 4), ['map-zoom-in', 'map-zoom-out', 'map-fit', 'map-tools-divider']);
  assert.deepEqual(folge.slice(-2), ['map-info', 'map-more']);
  for (const mitte of folge.slice(4, -2)) assert.ok(['map-edit', 'map-maps'].includes(mitte), mitte);
  const mehr = $(k, '[data-action="map-more"]');
  assert.equal(mehr.getAttribute('aria-label'), 'Kartenwerkzeuge');
  assert.equal(mehr.getAttribute('aria-expanded'), 'false');
});

test('MAP-02 schmal: Werkzeugknopf klappt die übrigen Werkzeuge auf, Escape klappt zu und gibt den Fokus zurück', () => {
  const k = aufbau({ breite: 390 });
  const m = k.karte._map, mehr = $(k, '[data-action="map-more"]');
  mehr.click();
  assert.equal(m.tools.hasAttribute('data-open'), true);
  assert.equal(mehr.getAttribute('aria-expanded'), 'true');
  const e = k.u.neuesEreignis('keydown', { key: 'Escape' });
  m.tools.dispatchEvent(e);
  assert.equal(m.tools.hasAttribute('data-open'), false);
  assert.equal(mehr.getAttribute('aria-expanded'), 'false');
  assert.equal(k.sr.activeElement, mehr, 'Fokus zurück am Werkzeugknopf');
  const { CARD_STYLES } = k.u.registry.get('busch-vacuum-card').__internals;
  assert.match(CARD_STYLES, /:host\(:not\(\[data-width=wide\]\)\) \.layout \.map-tools:not\(\[data-open\]\) \.map-tool:not\(\[data-action=map-fit\]\):not\(\[data-action=map-more\]\) \{[^}]*display: none;/);
  assert.match(CARD_STYLES, /:host\(\[data-width=wide\]\) \.layout \[data-action=map-more\] \{[^}]*display: none;/);
});

test('MAP-02 Hinweis-Chip unten links je Aufgabe; ohne Zeiger-Ereignisse, gespiegelt bei Linkshändern', () => {
  const k = aufbau();
  const hint = () => k.karte._map.hint;
  assert.equal(hint().textContent, 'Ziehen verschiebt · Mausrad zoomt');
  aufgabe(k, 'room').click();
  assert.equal(hint().textContent, 'Räume antippen – Reihenfolge wie eingestellt', 'customized_cleaning: Folge des Geräts');
  aufgabe(k, 'zone').click();
  assert.equal(hint().textContent, 'Rechteck aufziehen');
  aufgabe(k, 'spot').click();
  assert.equal(hint().textContent, 'Punkt antippen');
  aufgabe(k, 'goto').click();
  assert.equal(hint().textContent, 'Ziel antippen');
  const laufend = aufbau({ zustand: 'cleaning' });
  assert.equal(laufend.karte._map.hint.hidden, true, 'laufend kein Hinweis');
  const gesperrt = aufbau({ config: { locked: 'always' } });
  assert.equal(gesperrt.karte._map.hint.textContent, 'Karte gesperrt');
  gesperrt.karte._toggleLock();
  assert.equal(gesperrt.karte._map.hint.textContent, 'Ziehen verschiebt · Mausrad zoomt', 'folgt der Sperre sofort');
  const { MAP_STYLES } = k.u.registry.get('busch-vacuum-card').__internals;
  assert.match(MAP_STYLES, /\.map-hint \{[^}]*pointer-events: none;/);
  assert.match(MAP_STYLES, /:host\(\[data-hand=left\]\) \.map-hint \{/);
});

// ── 0.2.2: Befunde der Live-Prüfung von 0.2.1 ────────────────────────────
const stilRegel = (css, sel) => {
  const i = css.indexOf('\n' + sel + ' {');
  return i < 0 ? null : css.slice(i + sel.length + 3, css.indexOf('}', i));
};

test('CORE-08/DOCK-05 Stationswarnung: Hinweisleiste im Panel, Aktionsleiste nur „Dock“ (breit) bzw. Symbol (schmal)', () => {
  for (const breite of [1280, 900, 390]) {
    const k = aufbau({ attribute: { clean_water_tank_status: 'Low water' }, breite });
    const hint = $(k, '.station-hint');
    assert.match(hint.textContent, /Station: Frischwasser niedrig/, breite + ' Hinweisleiste');
    assert.equal(hint.parentNode.className, 'station-slot', breite + ' im Panel');
    const dock = $(k, '.dock');
    assert.equal(dock.getAttribute('data-dock'), 'warning', breite + ' Farbe bleibt');
    assert.equal(dock.textContent, 'Dock', breite + ' sichtbar nur „Dock“, nie der Warntext');
    assert.equal(dock.getAttribute('aria-label'), 'Station · Frischwasser niedrig', breite + ' Name mit Zustand für Screenreader');
  }
  assert.equal($(aufbau({ breite: 1280 }), '.dock').getAttribute('aria-label'), 'Station', 'ohne Warnung nur „Station“');
});

test('CORE-08 Primärknopf kürzt nie: wächst, schrumpft nicht, Text ohne Auslassung; Dock fest', () => {
  const { CARD_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  assert.match(stilRegel(CARD_STYLES, '.controls .ctl[data-variant=primary]'), /flex: 1 0 auto;/);
  assert.match(stilRegel(CARD_STYLES, '.controls .ctl[data-variant=primary] .ctl-text'), /overflow: visible;[^]*text-overflow: clip;/);
  assert.match(stilRegel(CARD_STYLES, '.controls .dock'), /flex: none;/);
});

test('TASK-02 „Alle wählen“/„Auswahl leeren“ kleiner als die Zählzeile (Konzept 13 px zu 14 px/500)', () => {
  const { CARD_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  assert.match(stilRegel(CARD_STYLES, '.task-tools .busch-ui-action'), /font-size: 13px;/);
  const zahl = stilRegel(CARD_STYLES, '.task-count');
  assert.match(zahl, /font-size: 14px;/);
  assert.match(zahl, /font-weight: var\(--ha-font-weight-medium, 500\);/);
});

test('CORE-13 Panel Mode: Karte genau so hoch wie der Platz unter HAs Kopf (Höhe, nicht min-height, mit Safe Areas); Blatt scrollt selbst', () => {
  const { CARD_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  const host = stilRegel(CARD_STYLES, ':host([data-layout=panel])');
  assert.ok(host, 'Regel für den Host im Panel');
  assert.doesNotMatch(host, /height: 100%/, 'kein height: 100% – der HA-Panel-Elter hat keine feste Höhe');
  assert.match(host, /\bheight: calc\(100dvh - var\(--bvc-header-height, 56px\) - env\(safe-area-inset-top, 0px\) - env\(safe-area-inset-bottom, 0px\) - var\(--bvc-height-offset, 0px\)\);/);
  assert.doesNotMatch(host, /min-height/);
  const blatt = stilRegel(CARD_STYLES, ':host([data-layout=panel]:not([data-width=wide])) .panel');
  assert.ok(blatt, 'schmales Panel: eigenes Scrollen');
  assert.match(blatt, /flex: 1 1 0;/);
  assert.match(blatt, /min-height: 0;/);
  assert.match(blatt, /overflow-y: auto;/);
});
