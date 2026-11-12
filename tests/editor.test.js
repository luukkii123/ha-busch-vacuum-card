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

const OPTIONEN = ['entity', 'title', 'scripts', 'locked', 'touch_lock', 'disable_haptic', 'left_handed', 'full_height', 'aspect_ratio', 'max_height_offset', 'hidden_card_objects',
  'map_display', 'color_scheme', 'icon_set', 'hidden_objects'];
// override_colors (hell und dunkel) und map_config sind eigene, nicht flache Abschnitte.
const FARBEN = ['floor', 'wall', 'room', 'carpet', 'no_go', 'no_mop', 'virtual_wall', 'path', 'robot', 'charger'];

// ── Editor (CORE-18) ───────────────────────────────────────────────────────
/** Felder der flachen Abschnitte; verschachtelte Abschnitte (override_colors, map_config) als eigener Name. */
function flach(schema) {
  return schema.flatMap((f) => (f.type === 'expandable' ? (f.flatten ? flach(f.schema) : [f]) : [f]));
}

test('CORE-18 Schema: jede Option der Karte hat ein Feld', () => {
  const { SCHEMA } = intern(neueUmgebung());
  assert.deepEqual(flach(SCHEMA).map((f) => f.name).sort(), [...OPTIONEN, 'override_colors', 'map_config'].sort());
  const farben = flach(SCHEMA).find((f) => f.name === 'override_colors');
  assert.deepEqual(farben.schema.filter((f) => f.name !== 'dark').map((f) => f.name), FARBEN);
  assert.deepEqual(farben.schema.find((f) => f.name === 'dark').schema.map((f) => f.name), FARBEN, 'dunkel getrennt (MAP-09)');
  assert.ok(farben.schema.every((f) => f.type === 'expandable' || f.selector.color_rgb), 'Farbwähler');
});

test('Entität nur vacuum.*, Skripte nur script.* (mehrere)', () => {
  const alle = Object.fromEntries(felder(intern(neueUmgebung()).SCHEMA).map((f) => [f.name, f]));
  assert.deepEqual(roh(alle.entity.selector), { entity: { domain: 'vacuum' } });
  assert.equal(alle.entity.required, true);
  assert.deepEqual(roh(alle.scripts.selector), { entity: { domain: 'script', multiple: true } });
  assert.deepEqual(roh(alle.locked.selector.select.options), ['auto', 'only_touch', 'never', 'always']);
  assert.equal(alle.hidden_card_objects.selector.select.multiple, true);
});

test('CORE-18 hidden_card_objects: alle Namen aus dem Inventar CORE-18', () => {
  const alle = Object.fromEntries(felder(intern(neueUmgebung()).SCHEMA).map((f) => [f.name, f]));
  assert.deepEqual(roh(alle.hidden_card_objects.selector.select.options), [
    'title', 'state', 'menu', 'status', 'task_type', 'controls', 'action_buttons', 'animations', 'shortcuts',
    'cruising_history', 'error_message', 'warning_message', 'info_message', 'low_water_message',
    'map_change_confirmation', 'progress_bar', 'dock_status_indicator', 'map_editor',
  ]);
});

test('Labels und Helfer DE/EN für jedes Feld und jeden Abschnitt (HACS-Regel 3)', () => {
  const { SCHEMA, TEXTE } = intern(neueUmgebung());
  const { MAP_CONFIG_FIELDS } = intern(neueUmgebung());
  const namen = [...SCHEMA.filter((f) => f.type === 'expandable').map((f) => f.name), ...OPTIONEN, 'override_colors', 'map_config', 'dark', ...FARBEN, ...felder(MAP_CONFIG_FIELDS).map((f) => f.name), ...MAP_CONFIG_FIELDS.filter((f) => f.type === 'expandable').map((f) => f.name)];
  for (const sprache of ['de', 'en']) {
    for (const name of namen) {
      const label = TEXTE[sprache].labels[name], helfer = TEXTE[sprache].helpers[name];
      assert.ok(label && label.split(/\s+/).length <= 4 && !/[.()]$/.test(label), `${sprache} Label ${name}: ${label}`);
      assert.ok(helfer && /[.!?]$/.test(helfer), `${sprache} Helfer ${name}: ${helfer}`);
    }
  }
});

test('CORE-16 Editor zeigt DE bzw. EN, Auswahlwerte übersetzt', () => {
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

test('CORE-18 ohne hidden_card_objects ist alles sichtbar', () => {
  const { karte } = karteMit({});
  for (const sel of ['.title', '.state', '.menu-button', '.stats', '.controls']) assert.equal($(karte, sel).hidden, false, sel);
  assert.ok($(karte, '.tasks'));
  assert.ok($(karte, '.dock'));
});

test('CORE-03 title, state, menu, status, task_type, controls ausblendbar (CORE-03)', () => {
  const { karte } = karteMit(versteckt(['title', 'state', 'menu', 'status', 'task_type', 'controls']));
  for (const sel of ['.title', '.state', '.menu-button', '.stats', '.controls']) assert.equal($(karte, sel).hidden, true, sel);
  assert.equal($(karte, '.tasks'), null);
});

test('CORE-08 action_buttons und dock_status_indicator getrennt', () => {
  const ohneKnoepfe = karteMit(versteckt(['action_buttons'])).karte;
  assert.deepEqual($$(ohneKnoepfe, '.ctl'), []);
  assert.ok($(ohneKnoepfe, '.dock'));
  const ohneDock = karteMit(versteckt(['dock_status_indicator'])).karte;
  assert.equal($(ohneDock, '.dock'), null);
  assert.ok($$(ohneDock, '.ctl').length > 0);
});

test('CORE-18 progress_bar und Meldungsarten einzeln ausblendbar', () => {
  const fortschritt = { 'sensor.robo_cleaning_progress': { entity_id: 'sensor.robo_cleaning_progress', state: '42', attributes: {} } };
  assert.equal($(karteMit(versteckt(['progress_bar']), 'cleaning', { started: true }, fortschritt).karte, '.progress'), null);
  const attr = { error: 'Remove mop', low_water: true, cleaning_paused: 1, started: true };
  const kinds = (k) => $$(k, '.message').map((m) => m.getAttribute('data-kind'));
  assert.deepEqual(kinds(karteMit({}, 'docked', attr).karte).sort(), ['info', 'low_water', 'warning']);
  assert.deepEqual(kinds(karteMit(versteckt(['warning_message', 'info_message']), 'docked', attr).karte), ['low_water']);
  assert.deepEqual(kinds(karteMit(versteckt(['low_water_message']), 'docked', attr).karte).sort(), ['info', 'warning']);
  assert.deepEqual(kinds(karteMit(versteckt(['error_message']), 'error', { error: 'Wheel stuck', has_error: true }).karte), []);
});

test('CORE-18 cruising_history nimmt den Menüeintrag weg', () => {
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

test('CORE-03 eigener Titel statt Gerätename', () => {
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
test('CORE-20 Kartenwechsel fragt nach; Abbrechen wechselt nicht, Wechseln schon', () => {
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

test('CORE-20 map_change_confirmation ausgeblendet: wechselt ohne Rückfrage', () => {
  const { u, karte } = karteMit(versteckt(['map_change_confirmation']));
  let gewechselt = 0;
  karte._confirmMapChange('Oben', () => gewechselt++);
  assert.equal(gewechselt, 1);
  assert.equal(dialogVon(u), null);
});

// ── Sprache (CORE-16) ─────────────────────────────────────────────────────
test('CORE-16 Wörterbuch: jeder Text in beiden Sprachen', () => {
  const { TEXTE } = intern(neueUmgebung());
  for (const teil of ['labels', 'helpers', 'texte']) {
    assert.deepEqual(Object.keys(TEXTE.de[teil]).sort(), Object.keys(TEXTE.en[teil]).sort(), teil);
  }
});

test('CORE-16 Karte englisch bei englischem HA', () => {
  const u = neueUmgebung(), haus = hausAus('voll', { sprache: 'en' });
  const karte = neueKarte(u, haus);
  assert.equal($$(karte, '.ctl').find((b) => b.getAttribute('data-action') === 'start').textContent, 'Clean');
  assert.equal($(karte, '.menu-button').getAttribute('aria-label'), 'Menu');
  assert.equal($$(karte, '.task').find((b) => b.getAttribute('data-task') === 'all').textContent, 'All');
});

test('CORE-16 Uhrzeit nach HAs 12/24-h-Einstellung, erster Wochentag nach HA', () => {
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
test('CORE-17 --bvc-*-Haken mit HA-Rückfall, nie auf :host gesetzt', () => {
  const { CARD_STYLES, DIALOG_STYLES } = intern(neueUmgebung());
  // Ohne den gemeinsamen BuschUI-Block (wörtlich synchronisiert, nicht kartenspezifisch).
  const css = (CARD_STYLES + DIALOG_STYLES).split('\n').filter((z) => !z.includes('busch-ui')).join('\n');
  for (const [haken, ha] of [['accent', 'primary'], ['warning', 'warning'], ['error', 'error'], ['success', 'success']]) {
    assert.match(css, new RegExp(`var\\(--bvc-${haken}-color, var\\(--${ha}-color`), haken);
    assert.doesNotMatch(css, new RegExp(`--bvc-${haken}-color\\s*:`), `${haken} nicht definiert (Theme setzt es)`);
  }
  assert.doesNotMatch(css.replace(/var\(--bvc-[\w-]+, var\(--(warning|error|success|primary)-color/g, ''), /var\(--(warning|error|success)-color/, 'jede Statusfarbe über einen Haken');
});

// ── map-view Task 11: Abschnitt Karte ──────────────────────────────────────
function kartenEditor(config = {}, sprache = 'de') {
  const u = neueUmgebung();
  const ed = u.document.createElement('busch-vacuum-card-editor');
  const aenderungen = [];
  ed.addEventListener('config-changed', (e) => aenderungen.push(roh(e.detail.config)));
  ed.setConfig(Object.assign({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, config));
  const haus = hausAus('voll', { sprache });
  ed.hass = haus.hass();
  u.body.appendChild(ed);
  const form = ed.shadowRoot.querySelector('ha-form');
  const aendere = (patch) => form.dispatchEvent({ type: 'value-changed', detail: { value: Object.assign({}, roh(form.data), patch) }, stopPropagation() {} });
  return { u, ed, form, haus, aenderungen, aendere };
}
const abschnitt = (schema, name) => flach(schema).find((f) => f.name === name);

test('MAP-07 Karte: je Stockwerk aus maps ein aufklappbarer Block map_config', () => {
  const { form } = kartenEditor();
  const bloecke = abschnitt(form.schema, 'map_config').schema;
  assert.deepEqual(bloecke.map((b) => b.name), ['map_1']);
  assert.equal(bloecke[0].type, 'expandable');
  assert.deepEqual(felder(bloecke[0].schema).map((f) => f.name), ['rotation', 'scale', 'opacity', 'object_scale', 'object_opacity', 'font_size',
    'top', 'right', 'bottom', 'left', 'url', 'x0', 'y0', 'x1', 'y1', 'url', 'x0', 'y0', 'x1', 'y1', 'hidden_objects']);
  assert.equal(form.computeLabel({ name: 'map_1' }), 'Stockwerk Karte 1');
  assert.match(form.computeHelper({ name: 'map_1' }), /\.$/);
  const drehung = felder(bloecke[0].schema).find((f) => f.name === 'rotation');
  assert.deepEqual(roh(drehung.selector.select.options), [{ value: '0', label: '0°' }, { value: '90', label: '90°' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }]);
  assert.equal(form.data.map_config.map_1.font_size, 12, 'Vorgaben sichtbar');
});

test('Karte: Auswahlwerte übersetzt, Helfer nennen die Vorgabe', () => {
  const { form } = kartenEditor();
  const optionen = (name) => abschnitt(form.schema, name).selector.select.options.map((o) => o.label);
  assert.deepEqual(optionen('map_display'), ['Standard', 'Grundriss']);
  assert.deepEqual(optionen('color_scheme'), ['Automatisch', 'Hell', 'Dunkel', 'Grau']);
  assert.deepEqual(optionen('icon_set'), ['Busch', 'Material Design']);
  assert.equal(optionen('hidden_objects')[0], 'Raumnamen');
  for (const name of ['map_display', 'color_scheme', 'icon_set', 'hidden_objects', 'rotation', 'scale', 'opacity', 'object_scale', 'object_opacity', 'font_size']) {
    assert.match(form.computeHelper({ name }), /Vorgabe/, name);
  }
  const en = kartenEditor({}, 'en').form;
  assert.deepEqual(abschnitt(en.schema, 'color_scheme').selector.select.options.map((o) => o.label), ['Automatic', 'Light', 'Dark', 'Grey']);
});

test('Karte: schreibt nur Abweichungen, auch verschachtelt', () => {
  const { form, aenderungen, aendere } = kartenEditor();
  aendere({});
  assert.deepEqual(aenderungen.at(-1), { type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, 'Vorgaben schreiben nichts');
  const map_config = roh(form.data.map_config);
  map_config.map_1.rotation = '90';
  map_config.map_1.crop = { top: 0, right: 10, bottom: 0, left: 0 };
  map_config.map_1.background_image = { url: '', x0: 0 };
  aendere({ map_display: 'floor_plan', color_scheme: 'dark', override_colors: { floor: [10, 20, 30], wall: [], dark: { floor: [1, 2, 3] } }, map_config });
  assert.deepEqual(aenderungen.at(-1), {
    type: 'custom:busch-vacuum-card', entity: 'vacuum.robo', map_display: 'floor_plan', color_scheme: 'dark',
    override_colors: { floor: [10, 20, 30], dark: { floor: [1, 2, 3] } },
    map_config: { map_1: { rotation: 90, crop: { right: 10 } } },
  });
  map_config.map_1.rotation = '0';
  map_config.map_1.crop = { top: 0, right: 0, bottom: 0, left: 0 };
  aendere({ map_display: 'standard', color_scheme: 'auto', override_colors: { floor: [], dark: {} }, map_config });
  assert.deepEqual(aenderungen.at(-1), { type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, 'zurück auf Vorgabe entfernt alles');
});

test('MAP-09 override_colors aus dem Farbwähler ([r, g, b]) wirkt in der Karte', () => {
  const { normalizeConfig } = intern(neueUmgebung());
  const n = normalizeConfig({ entity: 'vacuum.robo', override_colors: { floor: [10, 20, 30], dark: { wall: [300, -1, 5] } } });
  assert.deepEqual(roh(n.override_colors), { floor: 'rgb(10, 20, 30)', dark: { wall: 'rgb(255, 0, 5)' } });
});
