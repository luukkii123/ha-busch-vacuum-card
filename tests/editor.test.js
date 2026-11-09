'use strict';
// Plan Task 7 (CORE-16/17/18/20): visueller Editor, Sprache, Theme, Kartenwechsel-Bestätigung.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, neuesHaus } = require('./attrappe.js');

const roh = (x) => JSON.parse(JSON.stringify(x));
const intern = (u) => u.registry.get('busch-vacuum-card').__internals;
const $ = (karte, sel) => karte.shadowRoot.querySelector(sel);
const $$ = (karte, sel) => karte.shadowRoot.querySelectorAll(sel);
const dialogVon = (u) => u.body.childNodes.find((n) => n.tagName === 'BUSCH-VACUUM-DIALOG') || null;

/** Alle Feldnamen des Schemas, Abschnitte (expandable) aufgelöst. */
function felder(schema) {
  return schema.flatMap((f) => (f.type === 'expandable' ? felder(f.schema) : [f]));
}

/** Editor mit Attrappen-hass; `aenderungen` sammelt jede config-changed-Ausgabe. */
function editor(config = { type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, sprache = 'de') {
  const u = neueUmgebung();
  const ed = u.document.createElement('busch-vacuum-card-editor');
  const aenderungen = [];
  ed.addEventListener('config-changed', (e) => aenderungen.push(roh(e.detail.config)));
  ed.setConfig(config);
  ed.hass = neuesHaus({ sprache }).hass();
  u.body.appendChild(ed);
  const form = ed.shadowRoot.querySelector('ha-form');
  /** Wie ha-form: das ganze Datenobjekt mit der Änderung. */
  const aendere = (patch) => form.dispatchEvent({ type: 'value-changed', detail: { value: Object.assign({}, form.data, patch) }, stopPropagation() {} });
  return { u, ed, form, aenderungen, aendere };
}

const OPTIONEN = ['entity', 'title', 'scripts', 'locked', 'touch_lock', 'disable_haptic', 'left_handed', 'full_height', 'aspect_ratio', 'max_height_offset', 'hidden_card_objects'];

// ── Editor (CORE-18) ───────────────────────────────────────────────────────
test('Schema: jede Option der Karte hat ein Feld', () => {
  const { SCHEMA } = intern(neueUmgebung());
  assert.deepEqual(felder(SCHEMA).map((f) => f.name).sort(), [...OPTIONEN].sort());
});

test('Entität nur vacuum.*, Skripte nur script.* (mehrere)', () => {
  const alle = Object.fromEntries(felder(intern(neueUmgebung()).SCHEMA).map((f) => [f.name, f]));
  assert.deepEqual(roh(alle.entity.selector), { entity: { domain: 'vacuum' } });
  assert.equal(alle.entity.required, true);
  assert.deepEqual(roh(alle.scripts.selector), { entity: { domain: 'script', multiple: true } });
  assert.deepEqual(roh(alle.locked.selector.select.options), ['auto', 'only_touch', 'never', 'always']);
  assert.equal(alle.hidden_card_objects.selector.select.multiple, true);
});

test('hidden_card_objects: alle Namen aus dem Inventar CORE-18', () => {
  const alle = Object.fromEntries(felder(intern(neueUmgebung()).SCHEMA).map((f) => [f.name, f]));
  assert.deepEqual(roh(alle.hidden_card_objects.selector.select.options), [
    'title', 'state', 'menu', 'status', 'task_type', 'controls', 'action_buttons', 'animations', 'shortcuts',
    'cruising_history', 'error_message', 'warning_message', 'info_message', 'low_water_message',
    'map_change_confirmation', 'progress_bar', 'dock_status_indicator',
  ]);
});

test('Labels und Helfer DE/EN für jedes Feld und jeden Abschnitt (HACS-Regel 3)', () => {
  const { SCHEMA, TEXTE } = intern(neueUmgebung());
  const namen = [...SCHEMA.filter((f) => f.type === 'expandable').map((f) => f.name), ...OPTIONEN];
  for (const sprache of ['de', 'en']) {
    for (const name of namen) {
      const label = TEXTE[sprache].labels[name], helfer = TEXTE[sprache].helpers[name];
      assert.ok(label && label.split(/\s+/).length <= 4 && !/[.()]$/.test(label), `${sprache} Label ${name}: ${label}`);
      assert.ok(helfer && /[.!?]$/.test(helfer), `${sprache} Helfer ${name}: ${helfer}`);
    }
  }
});

test('Editor zeigt DE bzw. EN, Auswahlwerte übersetzt', () => {
  const de = editor().form;
  assert.equal(de.computeLabel({ name: 'locked' }), 'Karten-Sperre');
  assert.match(de.computeHelper({ name: 'touch_lock' }), /Vorgabe 200/);
  const sperre = felder(de.schema).find((f) => f.name === 'locked');
  assert.deepEqual(roh(sperre.selector.select.options.map((o) => o.value)), ['auto', 'only_touch', 'never', 'always']);
  assert.equal(sperre.selector.select.options[0].label, 'Automatisch');
  const versteckt = felder(de.schema).find((f) => f.name === 'hidden_card_objects');
  assert.equal(versteckt.selector.select.options.find((o) => o.value === 'map_change_confirmation').label, 'Bestätigung beim Kartenwechsel');
  const en = editor(undefined, 'en').form;
  assert.equal(en.computeLabel({ name: 'locked' }), 'Map lock');
  assert.equal(felder(en.schema).find((f) => f.name === 'locked').selector.select.options[0].label, 'Automatic');
});

test('Editor zeigt Vorgaben an, schreibt aber nur Abweichungen', () => {
  const { form, aenderungen, aendere } = editor();
  assert.equal(form.data.locked, 'auto');
  assert.equal(form.data.touch_lock, 200);
  assert.equal(form.data.max_height_offset, 0);
  assert.deepEqual(roh(form.data.hidden_card_objects), []);
  aendere({});
  assert.deepEqual(aenderungen.at(-1), { type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, 'nur Vorgaben: nichts dazu');
  aendere({ locked: 'always', touch_lock: 300, left_handed: true, hidden_card_objects: ['title'], scripts: ['script.vorher'], title: 'Unten' });
  assert.deepEqual(aenderungen.at(-1), {
    type: 'custom:busch-vacuum-card', entity: 'vacuum.robo', locked: 'always', touch_lock: 300,
    left_handed: true, hidden_card_objects: ['title'], scripts: ['script.vorher'], title: 'Unten',
  });
  aendere({ locked: 'auto', touch_lock: 200, left_handed: false, hidden_card_objects: [], scripts: [], title: '' });
  assert.deepEqual(aenderungen.at(-1), { type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, 'zurück auf Vorgabe entfernt den Schlüssel');
});

test('Editor übernimmt bestehende Werte in das Formular', () => {
  const { form } = editor({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo', full_height: true, aspect_ratio: '16:9', hidden_card_objects: ['menu'] });
  assert.equal(form.data.full_height, true);
  assert.equal(form.data.aspect_ratio, '16:9');
  assert.deepEqual(roh(form.data.hidden_card_objects), ['menu']);
});

// ── hidden_card_objects in der Karte ──────────────────────────────────────
function sauger(haus, zustand, attribute = {}) {
  const alt = haus.states['vacuum.robo'];
  return { 'vacuum.robo': { entity_id: 'vacuum.robo', state: zustand, attributes: Object.assign({}, alt.attributes, attribute) } };
}
function karteMit(config, zustand, attribute, extra = {}) {
  const u = neueUmgebung(), haus = hausAus('voll');
  if (zustand) haus.states = Object.assign({}, haus.states, sauger(haus, zustand, attribute), extra);
  return { u, haus, karte: neueKarte(u, haus, config) };
}
const versteckt = (namen) => ({ hidden_card_objects: namen });

test('ohne hidden_card_objects ist alles sichtbar', () => {
  const { karte } = karteMit({});
  for (const sel of ['.title', '.state', '.menu-button', '.stats', '.controls']) assert.equal($(karte, sel).hidden, false, sel);
  assert.ok($(karte, '.tasks'));
  assert.ok($(karte, '.dock'));
});

test('title, state, menu, status, task_type, controls ausblendbar (CORE-03)', () => {
  const { karte } = karteMit(versteckt(['title', 'state', 'menu', 'status', 'task_type', 'controls']));
  for (const sel of ['.title', '.state', '.menu-button', '.stats', '.controls']) assert.equal($(karte, sel).hidden, true, sel);
  assert.equal($(karte, '.tasks'), null);
});

test('action_buttons und dock_status_indicator getrennt', () => {
  const ohneKnoepfe = karteMit(versteckt(['action_buttons'])).karte;
  assert.deepEqual($$(ohneKnoepfe, '.ctl'), []);
  assert.ok($(ohneKnoepfe, '.dock'));
  const ohneDock = karteMit(versteckt(['dock_status_indicator'])).karte;
  assert.equal($(ohneDock, '.dock'), null);
  assert.ok($$(ohneDock, '.ctl').length > 0);
});

test('progress_bar und Meldungsarten einzeln ausblendbar', () => {
  const fortschritt = { 'sensor.robo_cleaning_progress': { entity_id: 'sensor.robo_cleaning_progress', state: '42', attributes: {} } };
  assert.equal($(karteMit(versteckt(['progress_bar']), 'cleaning', { started: true }, fortschritt).karte, '.progress'), null);
  const attr = { error: 'Remove mop', low_water: true, cleaning_paused: 1, started: true };
  const kinds = (k) => $$(k, '.message').map((m) => m.getAttribute('data-kind'));
  assert.deepEqual(kinds(karteMit({}, 'docked', attr).karte).sort(), ['info', 'low_water', 'warning']);
  assert.deepEqual(kinds(karteMit(versteckt(['warning_message', 'info_message']), 'docked', attr).karte), ['low_water']);
  assert.deepEqual(kinds(karteMit(versteckt(['low_water_message']), 'docked', attr).karte).sort(), ['info', 'warning']);
  assert.deepEqual(kinds(karteMit(versteckt(['error_message']), 'error', { error: 'Wheel stuck', has_error: true }).karte), []);
});

test('cruising_history nimmt den Menüeintrag weg', () => {
  const { u, karte } = karteMit(versteckt(['cruising_history']));
  $(karte, '.menu-button').click();
  const eintraege = dialogVon(u).shadowRoot.querySelectorAll('.menu-item').map((b) => b.getAttribute('data-entry'));
  assert.ok(eintraege.includes('history'));
  assert.ok(!eintraege.includes('cruising_history'));
});

test('animations: Dialog öffnet ohne Animation', () => {
  const mit = karteMit({});
  $(mit.karte, '.menu-button').click();
  assert.equal(dialogVon(mit.u).hasAttribute('data-still'), false);
  const ohne = karteMit(versteckt(['animations']));
  $(ohne.karte, '.menu-button').click();
  assert.equal(dialogVon(ohne.u).hasAttribute('data-still'), true);
  assert.match(intern(ohne.u).DIALOG_STYLES, /:host\(\[data-still\]\) \.scrim,\s*:host\(\[data-still\]\) \.sheet \{\s*animation: none;/);
});

test('eigener Titel statt Gerätename', () => {
  assert.equal($(karteMit({ title: 'Unten' }).karte, '.title').textContent, 'Unten');
});

test('normalizeConfig: unbekannte Objekte und Nicht-Skripte fallen weg', () => {
  const { normalizeConfig } = intern(neueUmgebung());
  const c = normalizeConfig({ entity: 'vacuum.robo', hidden_card_objects: ['title', 'gibts_nicht', 'menu'], scripts: ['script.a', 'light.b', 'script.c'], title: '  ' });
  assert.deepEqual(roh(c.hidden_card_objects), ['title', 'menu']);
  assert.deepEqual(roh(c.scripts), ['script.a', 'script.c']);
  assert.equal(c.title, '');
  const leer = normalizeConfig({ entity: 'vacuum.robo', hidden_card_objects: 'title', scripts: 'script.a' });
  assert.deepEqual(roh(leer.hidden_card_objects), []);
  assert.deepEqual(roh(leer.scripts), []);
});

// ── Kartenwechsel-Bestätigung (CORE-20) ────────────────────────────────────
test('Kartenwechsel fragt nach; Abbrechen wechselt nicht, Wechseln schon', () => {
  const { u, karte } = karteMit({});
  let gewechselt = 0;
  karte._confirmMapChange('Oben', () => gewechselt++);
  const d = dialogVon(u);
  assert.ok(d, 'Bestätigungsdialog offen');
  assert.equal(d.shadowRoot.querySelector('.sheet').getAttribute('data-kind'), 'confirm');
  assert.match(d.shadowRoot.querySelector('.body').textContent, /Oben/);
  d.shadowRoot.querySelector('.scrim').click();
  u.uhr.vor(400);
  assert.ok(dialogVon(u), 'kein Schließen per Außenklick (R04)');
  d.shadowRoot.querySelectorAll('button').find((b) => b.getAttribute('data-action') === 'cancel').click();
  u.uhr.vor(400);
  assert.equal(gewechselt, 0);
  assert.equal(dialogVon(u), null);
  karte._confirmMapChange('Oben', () => gewechselt++);
  dialogVon(u).shadowRoot.querySelectorAll('button').find((b) => b.getAttribute('data-action') === 'confirm').click();
  u.uhr.vor(400);
  assert.equal(gewechselt, 1);
  assert.equal(dialogVon(u), null);
});

test('map_change_confirmation ausgeblendet: wechselt ohne Rückfrage', () => {
  const { u, karte } = karteMit(versteckt(['map_change_confirmation']));
  let gewechselt = 0;
  karte._confirmMapChange('Oben', () => gewechselt++);
  assert.equal(gewechselt, 1);
  assert.equal(dialogVon(u), null);
});

// ── Sprache (CORE-16) ─────────────────────────────────────────────────────
test('Wörterbuch: jeder Text in beiden Sprachen', () => {
  const { TEXTE } = intern(neueUmgebung());
  for (const teil of ['labels', 'helpers', 'texte']) {
    assert.deepEqual(Object.keys(TEXTE.de[teil]).sort(), Object.keys(TEXTE.en[teil]).sort(), teil);
  }
});

test('Karte englisch bei englischem HA', () => {
  const u = neueUmgebung(), haus = hausAus('voll', { sprache: 'en' });
  const karte = neueKarte(u, haus);
  assert.equal($$(karte, '.ctl').find((b) => b.getAttribute('data-action') === 'start').textContent, 'Clean');
  assert.equal($(karte, '.menu-button').getAttribute('aria-label'), 'Menu');
  assert.equal($$(karte, '.task').find((b) => b.getAttribute('data-task') === 'all').textContent, 'All');
});

test('Uhrzeit nach HAs 12/24-h-Einstellung, erster Wochentag nach HA', () => {
  const { clockText, firstWeekday } = intern(neueUmgebung());
  const hass = (locale) => ({ locale: Object.assign({ language: 'en' }, locale) });
  assert.equal(clockText(hass({ time_format: '24' }), 14, 5), '14:05');
  assert.match(clockText(hass({ time_format: '12' }), 14, 5), /^2:05\sPM$/);
  assert.equal(clockText(hass({ language: 'de', time_format: 'language' }), 9, 30), '09:30');
  assert.equal(firstWeekday(hass({ first_weekday: 'sunday' })), 0);
  assert.equal(firstWeekday(hass({ first_weekday: 'monday' })), 1);
  assert.equal(firstWeekday(hass({ first_weekday: 'saturday' })), 6);
  const sprache = firstWeekday(hass({ language: 'de', first_weekday: 'language' }));
  assert.ok(sprache >= 0 && sprache <= 6);
});

// ── Theme (CORE-17) ───────────────────────────────────────────────────────
test('--bvc-*-Haken mit HA-Rückfall, nie auf :host gesetzt', () => {
  const { CARD_STYLES, DIALOG_STYLES } = intern(neueUmgebung());
  // Ohne den gemeinsamen BuschUI-Block (wörtlich synchronisiert, nicht kartenspezifisch).
  const css = (CARD_STYLES + DIALOG_STYLES).split('\n').filter((z) => !z.includes('busch-ui')).join('\n');
  for (const [haken, ha] of [['accent', 'primary'], ['warning', 'warning'], ['error', 'error'], ['success', 'success']]) {
    assert.match(css, new RegExp(`var\\(--bvc-${haken}-color, var\\(--${ha}-color`), haken);
    assert.doesNotMatch(css, new RegExp(`--bvc-${haken}-color\\s*:`), `${haken} nicht definiert (Theme setzt es)`);
  }
  assert.doesNotMatch(css.replace(/var\(--bvc-[\w-]+, var\(--(warning|error|success|primary)-color/g, ''), /var\(--(warning|error|success)-color/, 'jede Statusfarbe über einen Haken');
});
