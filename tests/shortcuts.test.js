'use strict';
// Modul shortcuts (Plan 2026-11-10): Einträge, Knopf, Menü, Start (auch während
// einer Aufgabe), Verwaltung. Live hat das Gerät keine Shortcuts → synthetische
// Einträge in der Datenform von device.py#L11076 / types.py#L5099.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
/** Zwei Geräte-Shortcuts, absichtlich nicht nach index sortiert; Namen mit Umlaut und Emoji. */
const SHORTCUTS = {
  32: { id: 32, index: 1, name: 'Gewächshaus nach dem Gießen 🍝', map_id: 1, running: false, tasks: [[{ segment_id: 3, order: 1 }]] },
  30: { id: 30, index: 0, name: 'Galerie', running: false, tasks: [] },
  31: { id: 31, index: 2, name: 'Turmzimmer', map_id: 2, running: false, tasks: [] }
};
const SKRIPT = (id, name, state = 'off', icon) => ({ [id]: { entity_id: id, state, attributes: Object.assign({ friendly_name: name }, icon ? { icon } : {}) } });

function sauger(haus, attribute = {}, zustand) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand || alt.state, attributes: Object.assign({}, alt.attributes, attribute) } };
}
function aufbau(name = 'voll', { attribute, states, zustand, config } = {}) {
  const u = neueUmgebung(), haus = hausAus(name);
  if (attribute || zustand) haus.states = Object.assign({}, haus.states, sauger(haus, attribute, zustand));
  if (states) haus.states = Object.assign({}, haus.states, states);
  const karte = neueKarte(u, haus, config);
  const I = u.registry.get('busch-vacuum-card').__internals;
  return { u, haus, karte, I, model: () => karte._model() };
}
const mitShortcuts = (optionen = {}) => aufbau('voll', Object.assign({}, optionen, { attribute: Object.assign({ shortcuts: SHORTCUTS }, optionen.attribute) }));
const aufrufe = (k) => roh(k.haus.rufe);
const knopf = (k) => k.karte.shadowRoot.querySelector('[data-action="shortcuts"]');
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const eintraege = (k) => $$d(k.u, '[data-shortcut]').map((b) => b.getAttribute('data-shortcut'));
const eintrag = (k, id) => $$d(k.u, '[data-shortcut]').find((b) => b.getAttribute('data-shortcut') === id);
function menue(k) { knopf(k).click(); return k; }

// ── Task 1: Einträge, Knopf, Menü (SHO-01) ───────────────────────────────────

test('shortcutEntries: Scripts vor Geräte-Shortcuts (nach index), Namen/Symbol aus hass.states, fehlendes Script ausgelassen', () => {
  const k = mitShortcuts({ states: Object.assign(SKRIPT('script.gewaechshaus', 'Gewächshaus saugen', 'on', 'mdi:silverware'), SKRIPT('script.bibliothek', 'Bibliothek')) });
  const liste = k.I.shortcutEntries(k.karte._hass, k.model(), ['script.bibliothek', 'script.fehlt', 'script.gewaechshaus']);
  assert.deepEqual(roh(liste), [
    { kind: 'script', id: 'script.bibliothek', name: 'Bibliothek', icon: 'mdi:script-text-outline', running: false, mapId: null },
    { kind: 'script', id: 'script.gewaechshaus', name: 'Gewächshaus saugen', icon: 'mdi:silverware', running: true, mapId: null },
    { kind: 'device', id: 30, name: 'Galerie', icon: 'mdi:star-four-points-outline', running: false, mapId: null },
    { kind: 'device', id: 32, name: 'Gewächshaus nach dem Gießen 🍝', icon: 'mdi:star-four-points-outline', running: false, mapId: 1 },
    { kind: 'device', id: 31, name: 'Turmzimmer', icon: 'mdi:star-four-points-outline', running: false, mapId: 2 }
  ]);
  assert.deepEqual(k.u.fehler, []);
});

test('can(shortcuts) braucht Fähigkeit und Dienst; shortcut_manage zusätzlich Umbenennen/Löschen', () => {
  const k = aufbau();
  assert.deepEqual([k.model().can('shortcuts'), k.model().can('shortcut_manage')], [true, true]);
  k.haus.services = { dreame_vacuum: { vacuum_start_shortcut: {} } };
  k.karte.hass = k.haus.hass();
  assert.deepEqual([k.model().can('shortcuts'), k.model().can('shortcut_manage')], [true, false]);
  const m = aufbau('minimal').model();
  assert.deepEqual([m.can('shortcuts'), m.can('shortcut_manage')], [false, false]);
});

test('Knopf nur mit Einträgen: voll ohne Shortcuts und minimal ohne Knopf; nur Scripts reicht; hidden_card_objects blendet aus', () => {
  assert.equal(knopf(aufbau()), null, 'voll: shortcuts {} und keine Scripts');
  assert.equal(knopf(aufbau('minimal')), null);
  const nurSkript = aufbau('minimal', { states: SKRIPT('script.bibliothek', 'Bibliothek'), config: { scripts: ['script.bibliothek'] } });
  assert.ok(knopf(nurSkript), 'auch ohne Geräte-Shortcuts');
  assert.equal(knopf(aufbau('minimal', { config: { scripts: ['script.fehlt'] } })), null, 'fehlendes Script zählt nicht');
  const k = mitShortcuts();
  const b = knopf(k);
  assert.equal(b.getAttribute('aria-haspopup'), 'menu');
  assert.match(b.textContent, /Shortcuts/);
  assert.equal(knopf(mitShortcuts({ config: { hidden_card_objects: ['shortcuts'] } })), null);
  assert.deepEqual(k.haus.rufe, []);
});

test('Knopf steht vor der Station und spiegelt mit Linkshänder wie die anderen Knöpfe', () => {
  const k = mitShortcuts();
  const kinder = k.karte.shadowRoot.querySelector('.controls').childNodes.map((n) => n.getAttribute('data-action'));
  assert.ok(kinder.indexOf('shortcuts') >= 0 && kinder.indexOf('shortcuts') < kinder.indexOf('dock'), kinder.join());
  assert.ok(knopf(k).classList.contains('ctl'), 'gleiche Ausrichtung wie die Steuerknöpfe (CORE-08)');
});

test('Menü: flüchtig, Abschnitte Scripts und Shortcuts, läuft als Text, anderes Stockwerk genannt', () => {
  const k = menue(mitShortcuts({ config: { scripts: ['script.bibliothek'] }, states: SKRIPT('script.bibliothek', 'Bibliothek', 'on'),
    attribute: { shortcuts: Object.assign({}, SHORTCUTS, { 30: Object.assign({}, SHORTCUTS[30], { running: true }) }), maps: [{ id: 1, index: 1, name: 'Ebene A' }, { id: 2, index: 2, name: 'Ebene B' }], selected_map: 'Ebene A' } }));
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'menu');
  assert.deepEqual($$d(k.u, '.settings-heading').map((h) => h.textContent), ['Skripte', 'Shortcuts']);
  assert.deepEqual(eintraege(k), ['script:script.bibliothek', 'device:30', 'device:32', 'device:31']);
  assert.match(eintrag(k, 'script:script.bibliothek').textContent, /Bibliothek · läuft/);
  assert.match(eintrag(k, 'device:30').textContent, /Galerie · läuft/);
  assert.doesNotMatch(eintrag(k, 'device:32').textContent, /läuft|Ebene A/);
  assert.match(eintrag(k, 'device:31').textContent, /Turmzimmer · Ebene B/);
});

test('Snapshot beobachtet die Script-Entitäten: Zustandswechsel zeichnet neu, fremde Updates nicht', () => {
  const k = aufbau('minimal', { states: SKRIPT('script.bibliothek', 'Bibliothek'), config: { scripts: ['script.bibliothek'] } });
  menue(k);
  assert.doesNotMatch(eintrag(k, 'script:script.bibliothek').textContent, /läuft/);
  const vorher = knopf(k);
  k.karte.hass = k.haus.fremd();
  assert.equal(knopf(k), vorher, 'fremdes Update baut nichts neu');
  const neu = k.haus.setze(SKRIPT('script.bibliothek', 'Bibliothek', 'on'));
  k.karte.hass = neu;
  dialogVon(k.u).hass = neu;
  assert.notEqual(knopf(k), vorher);
  assert.match(eintrag(k, 'script:script.bibliothek').textContent, /läuft/);
});

test('Editor-Hinweis nennt fehlende Scripts', () => {
  const u = neueUmgebung(), haus = hausAus('voll');
  const editor = u.document.createElement('busch-vacuum-card-editor');
  editor.setConfig({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo', scripts: ['script.fehlt'] });
  editor.hass = haus.hass();
  u.body.appendChild(editor);
  const form = editor.shadowRoot.querySelector('ha-form') || editor._form;
  assert.match(form.computeHelper({ name: 'scripts' }), /script\.fehlt/);
});

// ── Task 2: Starten, auch bei laufender Aufgabe (SHO-01, TASK-07) ────────────

const start = (id) => ({ domain: 'dreame_vacuum', service: 'vacuum_start_shortcut', data: { entity_id: 'vacuum.robo', shortcut_id: id } });

test('Tipp startet genau den Eintrag; Doppeltipp = ein Aufruf; Erfolg schließt das Menü', async () => {
  const k = menue(mitShortcuts({ config: { scripts: ['script.bibliothek'] }, states: SKRIPT('script.bibliothek', 'Bibliothek') }));
  let fertig;
  k.haus.antwort = () => new Promise((ok) => { fertig = ok; });
  const e = eintrag(k, 'device:32');
  e.click();
  e.click();
  assert.deepEqual(aufrufe(k), [start(32)]);
  const busy = eintrag(k, 'device:32');
  assert.equal(busy.getAttribute('aria-busy'), 'true');
  assert.match(busy.textContent, /Wird gestartet/);
  fertig();
  await mikro();
  k.u.uhr.vor(400);
  assert.equal(dialogVon(k.u), null, 'Menü zu');
  const s = menue(mitShortcuts({ config: { scripts: ['script.bibliothek'] }, states: SKRIPT('script.bibliothek', 'Bibliothek') }));
  eintrag(s, 'script:script.bibliothek').click();
  assert.deepEqual(aufrufe(s), [{ domain: 'script', service: 'turn_on', data: { entity_id: 'script.bibliothek' } }]);
});

test('Bei laufender Aufgabe: kein stop/pause davor, Hinweis im Menükopf (TASK-07)', () => {
  for (const zustand of ['cleaning', 'paused']) {
    const k = menue(mitShortcuts({ zustand, attribute: { started: true } }));
    assert.match($d(k.u, '[data-note="task"]').textContent, /Aufgabe läuft/, zustand);
    eintrag(k, 'device:30').click();
    assert.deepEqual(aufrufe(k), [start(30)], zustand + ': nur der Start, kein vacuum.stop/pause');
  }
  assert.equal($d(menue(mitShortcuts()).u, '[data-note="task"]'), null, 'angedockt ohne Hinweis');
});

test('Gesperrt beim Ablassen mit Grund; Dienstfehler → R12-Text im Menü', async () => {
  const k = menue(mitShortcuts({ attribute: { draining: true } }));
  const e = eintrag(k, 'device:30');
  assert.equal(e.disabled, true);
  assert.match($d(k.u, '[data-note="locked"]').textContent, /Ablassen/);
  e.click();
  assert.deepEqual(aufrufe(k), []);
  const f = menue(mitShortcuts());
  f.haus.antwort = () => Promise.reject(new Error('unavailable_while_draining'));
  eintrag(f, 'device:31').click();
  await mikro();
  const note = $d(f.u, '[data-note="device:31"]');
  assert.match(note.textContent, /Turmzimmer wurde nicht gestartet \(unavailable_while_draining\)/);
  assert.match(note.textContent, /erneut/);
  assert.equal(eintrag(f, 'device:31').disabled, false);
});

