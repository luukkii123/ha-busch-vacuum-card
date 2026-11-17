'use strict';
// Buschcheck 17.11.2026, Etappe E5 (Security): Adressen aus Eingaben und
// Attributen. M29 Sprachpaket/Datei-URL. Nur erfundene Adressen (.invalid).
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte, mikro } = require('./attrappe.js');
const { roh, dialogVon } = require('./hilfen.js');

const EIGEN = 'http://ha.invalid:8123';
const $d = (u, sel) => dialogVon(u).shadowRoot.querySelector(sel);
const $$d = (u, sel) => dialogVon(u).shadowRoot.querySelectorAll(sel);
const text = (k) => dialogVon(k.u).shadowRoot.textContent;

function aufbau({ basis = EIGEN, config } = {}) {
  const u = neueUmgebung(), haus = hausAus('voll', { basis });
  haus.antwort = () => Promise.resolve();
  const karte = neueKarte(u, haus, config);
  return { u, haus, karte, I: u.registry.get('busch-vacuum-card').__internals };
}
const menuePunkt = (k, name) => { k.karte._openDialog(k.karte._menuView()); Array.from($$d(k.u, '.menu-item')).find((b) => b.getAttribute('data-entry') === name).click(); };
function tippe(k, name, wert) {
  const f = $d(k.u, `[data-field="${name}"]`);
  f.value = wert;
  f.dispatchEvent(k.u.neuesEreignis('input'));
}

// ── M29 Sprachpaket ─────────────────────────────────────────────────────────

function sprachpaket(k, url) {
  menuePunkt(k, 'settings');
  Array.from($$d(k.u, '[data-group]')).find((b) => b.getAttribute('data-group') === 'audio').click();
  $d(k.u, '[data-action="voice-pack"]').click();
  tippe(k, 'lang_id', 'DE');
  tippe(k, 'url', url);
  tippe(k, 'md5', 'd41d8cd98f00b204e9800998ecf8427e');
  tippe(k, 'size', '2048');
  $d(k.u, '[data-action="submit"]').click();
  return dialogVon(k.u).shadowRoot.querySelector('.sheet').getAttribute('data-kind');
}

test('M29 Sprachpaket: http:// eines fremden Hosts ergibt den Inlinefehler, kein Aufruf', () => {
  const k = aufbau();
  assert.equal(sprachpaket(k, 'http://example.invalid/x'), 'editor');
  assert.match(text(k), /https:\/\//);
  assert.match(text(k), /dieses Home Assistant/);
  assert.deepEqual(k.haus.rufe, []);
  const ohneBasis = aufbau({ basis: null });
  assert.equal(sprachpaket(ohneBasis, 'http://ha.invalid:8123/local/de.pkg'), 'editor', 'ohne bekannte eigene Adresse nur https');
});

test('M29 Sprachpaket: /local/ der eigenen Instanz wird angenommen und als volle Adresse gesendet; eigene http-Adresse und https ebenso', async () => {
  for (const [eingabe, gesendet] of [['/local/de.pkg', EIGEN + '/local/de.pkg'], [EIGEN + '/local/de.pkg', EIGEN + '/local/de.pkg'], ['https://pakete.invalid/de.pkg', 'https://pakete.invalid/de.pkg']]) {
    const k = aufbau();
    assert.equal(sprachpaket(k, eingabe), 'confirm', eingabe);
    $d(k.u, '[data-action="confirm"]').click();
    await mikro();
    assert.equal(roh(k.haus.rufe)[0].data.url, gesendet);
  }
});

test('M29 Sprachpaket: Bestätigung hebt den Host hervor und sagt, ob er fremd oder dieses Home Assistant ist', () => {
  const k = aufbau();
  sprachpaket(k, 'https://pakete.invalid/de.pkg');
  const zeile = $d(k.u, '[data-part="host"]');
  assert.ok(zeile, 'eigene Host-Zeile');
  assert.equal(zeile.querySelectorAll('strong')[0].textContent, 'pakete.invalid');
  assert.match(zeile.textContent, /fremder Server/);
  const l = aufbau();
  sprachpaket(l, '/local/de.pkg');
  assert.equal($d(l.u, '[data-part="host"]').querySelectorAll('strong')[0].textContent, 'ha.invalid:8123');
  assert.match($d(l.u, '[data-part="host"]').textContent, /dieses Home Assistant/);
});

// ── M29 Datei-URL ───────────────────────────────────────────────────────────

function dateiFormular(k) {
  menuePunkt(k, 'maps');
  $d(k.u, '[data-map="3"]').querySelectorAll('[data-action="backups"]')[0].click();
  $d(k.u, '[data-action="restore-file"]').click();
}

test('M29 Datei-URL: mit /local/ der eigenen Instanz vorbelegt, das ist noch kein Entwurf und keine gültige Datei', () => {
  const k = aufbau();
  dateiFormular(k);
  assert.equal($d(k.u, '[data-field="file_url"]').value, EIGEN + '/local/');
  const d = dialogVon(k.u);
  d._goBack();
  k.u.zurueck();
  assert.doesNotMatch(text(k), /Ungespeicherte Änderung/i, 'Vorbelegung allein fragt nicht');
  assert.notEqual(d._views.at(-1).id, 'backup-file', 'Formular ohne Rückfrage verlassen');
  const n = aufbau();
  dateiFormular(n);
  $d(n.u, '[data-action="submit"]').click();
  assert.equal(dialogVon(n.u)._views.at(-1).kind, 'editor', 'nur /local/ ohne Datei: Inlinefehler');
  assert.match(text(n), /bis zur Datei/);
  const ohneBasis = aufbau({ basis: null });
  dateiFormular(ohneBasis);
  assert.equal($d(ohneBasis.u, '[data-field="file_url"]').value, '', 'ohne eigene Adresse leer');
});

test('M29 Datei-URL: eigener Host ohne Zusatzschritt; fremder Host braucht eine zweite Bestätigung, Host hervorgehoben', async () => {
  const k = aufbau();
  dateiFormular(k);
  tippe(k, 'file_url', EIGEN + '/local/karte.mb.tbz2');
  $d(k.u, '[data-action="submit"]').click();
  assert.equal($d(k.u, '[data-field="foreign_ok"]'), null);
  assert.match($d(k.u, '[data-part="host"]').textContent, /dieses Home Assistant/);
  assert.equal($d(k.u, '[data-action="confirm"]').disabled, false);

  const f = aufbau();
  dateiFormular(f);
  tippe(f, 'file_url', 'https://fremd.invalid/karte.mb.tbz2');
  $d(f.u, '[data-action="submit"]').click();
  assert.equal($d(f.u, '[data-part="host"]').querySelectorAll('strong')[0].textContent, 'fremd.invalid');
  assert.match(text(f), /Home Assistant ruft diese fremde Adresse ab/);
  assert.equal($d(f.u, '[data-action="confirm"]').disabled, true, 'erst nach der zweiten Bestätigung');
  $d(f.u, '[data-action="confirm"]').click();
  await mikro();
  assert.deepEqual(f.haus.rufe, []);
  const haken = $d(f.u, '[data-field="foreign_ok"]');
  haken.checked = true;
  haken.dispatchEvent({ type: 'change' });
  assert.equal($d(f.u, '[data-action="confirm"]').disabled, false);
  const vorher = $d(f.u, '[data-field="backup_first"]');
  if (vorher) { vorher.checked = false; vorher.dispatchEvent({ type: 'change' }); }
  $d(f.u, '[data-action="confirm"]').click();
  await mikro();
  assert.deepEqual(roh(f.haus.rufe).map((r) => [r.service, r.data.file_url]).filter((r) => r[0] === 'vacuum_restore_map_from_file'),
    [['vacuum_restore_map_from_file', 'https://fremd.invalid/karte.mb.tbz2']]);
});

// ── M28 Bild-URLs per Positivliste ──────────────────────────────────────────

const BILD = (url) => ({ url, x0: 0, y0: 0, x1: 1000, y1: 1000 });
const bildAus = (I, url) => I.normalizeConfig({ entity: 'vacuum.robo', map_config: { map_1: { background_image: BILD(url), overlay_image: BILD(url) } } }).map_config.map_1;

test('M28 Bild-URL erlaubt: /local/, /media/, /api/, http(s)://, data:image/png|jpeg|webp|gif;base64', () => {
  const I = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  for (const url of ['/local/grundriss.png', '/local/oben.svg', '/media/local/plan.jpg', '/api/image/serve/abc/original', 'https://bilder.invalid/plan.png', 'http://ha.invalid:8123/local/plan.png',
    'data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ', 'data:image/webp;base64,UklGRg==', 'data:image/gif;base64,R0lGODlh']) {
    const m = bildAus(I, url);
    assert.equal(m.background_image && m.background_image.url, url, url);
    assert.equal(m.overlay_image && m.overlay_image.url, url, url);
  }
});

test('M28 Bild-URL abgelehnt: data:text/html, data:image/svg+xml, javascript (jede Schreibung), //fremd, relative und andere Schemata', () => {
  const I = neueUmgebung().registry.get('busch-vacuum-card').__internals;
  for (const url of ['data:text/html,x', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/svg+xml,<svg onload=alert(1)>', 'data:image/png,roh',
    'JAVASCRIPT:x', 'javascript:alert(1)', ' vbscript:x', 'file:///etc/passwd', '//evil.invalid/x.png', 'bild.png', '../local/x.png', 'ftp://x.invalid/a.png', 'blob:http://ha/1', '/config/x.png']) {
    const m = bildAus(I, url);
    assert.equal(m.background_image, undefined, url);
    assert.equal(m.overlay_image, undefined, url);
  }
});

test('M28 Editor: fremder Bildserver steht im Hinweis des URL-Felds mit Host; eigene Adressen ohne Hinweis', () => {
  const u = neueUmgebung();
  const hinweis = (url) => {
    const ed = u.document.createElement('busch-vacuum-card-editor');
    ed.setConfig({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo', map_config: { map_1: { background_image: BILD(url) } } });
    ed.hass = hausAus('voll', { basis: EIGEN }).hass();
    u.body.appendChild(ed);
    return ed.shadowRoot.querySelector('ha-form').computeHelper({ name: 'url' });
  };
  assert.match(hinweis('https://bilder.invalid/plan.png'), /fremden Server.*bilder\.invalid.*jeden Aufruf/);
  for (const url of ['/local/plan.png', EIGEN + '/local/plan.png', 'data:image/png;base64,iVBORw0KGgo=']) assert.doesNotMatch(hinweis(url), /fremden Server/, url);
});
