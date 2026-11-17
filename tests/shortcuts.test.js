'use strict';
// Modul shortcuts (Plan 2026-11-10): Einträge, Knopf, Menü, Start (auch während
// einer Aufgabe), Verwaltung. Live hat das Gerät keine Shortcuts → synthetische
// Einträge in der Datenform von device.py#L11076 / types.py#L5099.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');
const { roh, dialogVon, sauger } = require('./hilfen.js');

/** Zwei Geräte-Shortcuts, absichtlich nicht nach index sortiert; Namen mit Umlaut und Emoji. */
const SHORTCUTS = {
  32: { id: 32, index: 1, name: 'Gewächshaus nach dem Gießen 🍝', map_id: 1, running: false, tasks: [[{ segment_id: 3, order: 1 }]] },
  30: { id: 30, index: 0, name: 'Galerie', running: false, tasks: [] },
  31: { id: 31, index: 2, name: 'Turmzimmer', map_id: 2, running: false, tasks: [] }
};
const SKRIPT = (id, name, state = 'off', icon) => ({ [id]: { entity_id: id, state, attributes: Object.assign({ friendly_name: name }, icon ? { icon } : {}) } });

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
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const eintraege = (k) => $$d(k.u, '[data-shortcut]').map((b) => b.getAttribute('data-shortcut'));
const eintrag = (k, id) => $$d(k.u, '[data-shortcut]').find((b) => b.getAttribute('data-shortcut') === id);
function menue(k) { knopf(k).click(); return k; }

// ── Task 1: Einträge, Knopf, Menü (SHO-01) ───────────────────────────────────

test('SHO-01 shortcutEntries: Scripts vor Geräte-Shortcuts (nach index), Namen/Symbol aus hass.states, fehlendes Script ausgelassen', () => {
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

test('SHO-01 Knopf nur mit Einträgen: voll ohne Shortcuts und minimal ohne Knopf; nur Scripts reicht; hidden_card_objects blendet aus', () => {
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

test('SHO-01 Menü: flüchtig, Abschnitte Scripts und Shortcuts, läuft als Text, anderes Stockwerk genannt', () => {
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
  // M4: die Leiste bleibt an Ort und Stelle; gezählt wird der Neuaufbau der Karte.
  let neuaufbau = 0;
  const echt = k.karte._update.bind(k.karte);
  k.karte._update = () => { neuaufbau++; echt(); };
  k.karte.hass = k.haus.fremd();
  assert.equal(neuaufbau, 0, 'fremdes Update baut nichts neu');
  const neu = k.haus.setze(SKRIPT('script.bibliothek', 'Bibliothek', 'on'));
  k.karte.hass = neu;
  dialogVon(k.u).hass = neu;
  assert.equal(neuaufbau, 1);
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

test('SHO-01 Tipp startet genau den Eintrag; Doppeltipp = ein Aufruf; Erfolg schließt das Menü', async () => {
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

test('TASK-07 Bei laufender Aufgabe: kein stop/pause davor, Hinweis im Menükopf (TASK-07)', () => {
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

// ── Task 3: Verwaltung (SHO-02, ALL-13 reload_shortcuts) ──────────────────────

function verwaltung(optionen) {
  const k = menue(mitShortcuts(optionen));
  $d(k.u, '[data-action="manage"]').click();
  return k;
}
const zeile = (k, id) => $$d(k.u, '[data-manage]').find((z) => z.getAttribute('data-manage') === String(id));
const darin = (z, sel) => z.querySelectorAll(sel)[0] || null;
const umbenennen = (id, name) => ({ domain: 'dreame_vacuum', service: 'vacuum_rename_shortcut', data: { entity_id: 'vacuum.robo', shortcut_id: id, shortcut_name: name } });

test('SHO-02 „Verwalten“ nur mit can(shortcut_manage); Liste mit Starten, Umbenennen, Löschen; Neu laden', () => {
  const nurSkript = menue(aufbau('minimal', { states: SKRIPT('script.bibliothek', 'Bibliothek'), config: { scripts: ['script.bibliothek'] } }));
  assert.equal($d(nurSkript.u, '[data-action="manage"]'), null);
  const k = verwaltung();
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'editor');
  assert.deepEqual($$d(k.u, '[data-manage]').map((z) => z.getAttribute('data-manage')), ['30', '32', '31']);
  const z = zeile(k, 32);
  assert.match(darin(z, '[data-shortcut]').textContent, /Gewächshaus nach dem Gießen 🍝/, 'gleicher Starten-Eintrag wie im Menü (R01)');
  assert.ok(darin(z, '[data-action="rename"]') && darin(z, '[data-action="delete"]'));
  darin(z, '[data-shortcut]').click();
  $d(k.u, '[data-action="reload"]').click();
  assert.deepEqual(aufrufe(k), [start(32), { domain: 'dreame_vacuum', service: 'vacuum_call_action', data: { entity_id: 'vacuum.robo', key: 'reload_shortcuts' } }]);
});

test('Ohne Shortcuts erreichbar über Geräteeinstellungen → Sonstiges: Leerzustand und Neu laden', () => {
  const k = aufbau();
  k.karte._openDialog(k.I.MODULE_VIEWS.settings(k.karte));
  $$d(k.u, '[data-group]').find((b) => b.getAttribute('data-group') === 'other').click();
  $d(k.u, '[data-action="shortcuts-manage"]').click();
  assert.match($d(k.u, '.body').textContent, /Dreame-App/);
  $d(k.u, '[data-action="reload"]').click();
  assert.deepEqual(aufrufe(k), [{ domain: 'dreame_vacuum', service: 'vacuum_call_action', data: { entity_id: 'vacuum.robo', key: 'reload_shortcuts' } }]);
  const m = aufbau('minimal');
  m.karte._openDialog(m.I.MODULE_VIEWS.settings(m.karte));
  assert.equal($$d(m.u, '[data-group]').find((b) => b.getAttribute('data-group') === 'other'), undefined);
});

test('SHO-02 Umbenennen: Pflichtfeld, unverändert = Speichern aus, Hinweis auf Nummer; genau vacuum_rename_shortcut', () => {
  const k = verwaltung();
  darin(zeile(k, 30), '[data-action="rename"]').click();
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'editor');
  const feld = $d(k.u, '[data-field="shortcut_name"]');
  assert.equal(feld.value, 'Galerie');
  assert.equal($d(k.u, '[data-action="save"]').disabled, true, 'unverändert');
  assert.match($d(k.u, '.body').textContent, /hängt das Gerät eine Zahl an/);
  feld.value = '   ';
  feld.dispatchEvent(k.u.neuesEreignis('input'));
  $d(k.u, '[data-action="save"]').click();
  assert.match($d(k.u, '.field-error').textContent, /Namen eingeben/);
  assert.deepEqual(aufrufe(k), []);
  const f2 = $d(k.u, '[data-field="shortcut_name"]');
  f2.value = 'Galerie Süd ✨';
  f2.dispatchEvent(k.u.neuesEreignis('input'));
  $d(k.u, '[data-action="save"]').click();
  $d(k.u, '[data-action="save"]').click();
  assert.deepEqual(aufrufe(k), [umbenennen(30, 'Galerie Süd ✨')]);
});

test('M4 Umbenennen: Sauger-Update während der Eingabe – dasselbe input, Wert, selectionStart und Fokus; Sperre an Ort und Stelle', () => {
  const k = verwaltung();
  darin(zeile(k, 30), '[data-action="rename"]').click();
  const feld = $d(k.u, '[data-field="shortcut_name"]');
  feld.focus();
  feld.value = 'Galerie Nord';
  feld.dispatchEvent(k.u.neuesEreignis('input'));
  feld.selectionStart = feld.selectionEnd = 7;
  for (let i = 0; i < 3; i++) k.karte.hass = k.haus.setze(sauger(k.haus, { battery_level: 50 + i }));
  assert.ok($d(k.u, '[data-field="shortcut_name"]') === feld);
  assert.equal(feld.value, 'Galerie Nord');
  assert.equal(feld.selectionStart, 7);
  assert.ok(dialogVon(k.u).shadowRoot.activeElement === feld);
  k.karte.hass = k.haus.setze(sauger(k.haus, { started: true }, 'cleaning'));
  assert.ok($d(k.u, '[data-field="shortcut_name"]') === feld, 'auch beim Sperren');
  assert.match($d(k.u, '.body').textContent, /Während einer Aufgabe/);
  assert.equal($d(k.u, '[data-action="save"]').disabled, true);
  k.karte.hass = k.haus.setze(sauger(k.haus, { started: false }, 'docked'));
  assert.doesNotMatch($d(k.u, '.body').textContent, /Während einer Aufgabe/);
  assert.equal($d(k.u, '[data-action="save"]').disabled, false);
});

test('SHO-02 Umbenennen gesperrt während einer Aufgabe; Eingabe bleibt beim Verlassen und nach Dienstfehler (R04/R12)', async () => {
  const g = verwaltung({ zustand: 'cleaning', attribute: { started: true } });
  darin(zeile(g, 30), '[data-action="rename"]').click();
  const feld = $d(g.u, '[data-field="shortcut_name"]');
  feld.value = 'Neu';
  feld.dispatchEvent(g.u.neuesEreignis('input'));
  assert.equal($d(g.u, '[data-action="save"]').disabled, true);
  assert.match($d(g.u, '.body').textContent, /Während einer Aufgabe/);
  const k = verwaltung();
  darin(zeile(k, 30), '[data-action="rename"]').click();
  const f = $d(k.u, '[data-field="shortcut_name"]');
  f.value = 'Entwurf';
  f.dispatchEvent(k.u.neuesEreignis('input'));
  dialogVon(k.u)._goBack();
  k.u.zurueck();
  darin(zeile(k, 30), '[data-action="rename"]').click();
  assert.equal($d(k.u, '[data-field="shortcut_name"]').value, 'Entwurf', 'ungespeicherter Name bleibt');
  assert.match($d(k.u, '.body').textContent, /noch nicht gespeichert/);
  k.haus.antwort = () => Promise.reject(new Error('unavailable_while_running'));
  $d(k.u, '[data-action="save"]').click();
  await mikro();
  assert.match($d(k.u, '.body').textContent, /unavailable_while_running/);
  assert.equal($d(k.u, '[data-field="shortcut_name"]').value, 'Entwurf');
});

test('SHO-02 Löschen nur nach Bestätigung mit Namen; gesperrt, solange dieser Shortcut läuft', () => {
  const k = verwaltung();
  darin(zeile(k, 31), '[data-action="delete"]').click();
  assert.equal($d(k.u, '.sheet').getAttribute('data-kind'), 'confirm');
  assert.match($d(k.u, '.body').textContent, /„Turmzimmer“/);
  assert.deepEqual(aufrufe(k), []);
  $d(k.u, '[data-action="confirm"]').click();
  assert.deepEqual(aufrufe(k), [{ domain: 'dreame_vacuum', service: 'vacuum_delete_shortcut', data: { entity_id: 'vacuum.robo', shortcut_id: 31 } }]);
  const l = verwaltung({ attribute: { shortcuts: Object.assign({}, SHORTCUTS, { 31: Object.assign({}, SHORTCUTS[31], { running: true }) }) } });
  const loeschen = darin(zeile(l, 31), '[data-action="delete"]');
  assert.equal(loeschen.disabled, true);
  assert.match(zeile(l, 31).textContent, /Läuft gerade — Löschen geht erst danach/);
  assert.equal(darin(zeile(l, 30), '[data-action="delete"]').disabled, false);
});
