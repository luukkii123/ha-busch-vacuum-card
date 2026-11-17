'use strict';
// Plan Task 2: keine echten Namen, keine IP/MAC/Tokens in tests/fixtures/.
// M7: Namen, Domain, Grundriss und Kartendaten stehen nur in der privaten
// Sperrliste (BVC_SPERRLISTE) als HMAC-SHA-256 ihres Prüfwerts, nie im Repo.
// Ohne Variable (GitHub, fremde Klone) werden diese Fälle sichtbar übersprungen;
// ist sie gesetzt und die Datei fehlt, bricht der Test ab.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ORDNER = path.join(__dirname, 'fixtures');
const ERWARTET = ['feindlich.json', 'integration-schluessel.json', 'minimal.json', 'ohne-dock.json', 'ohne-karte.json', 'uebersetzung-de.json', 'voll.json'];
const SPERRLISTE = process.env.BVC_SPERRLISTE ? JSON.parse(fs.readFileSync(process.env.BVC_SPERRLISTE, 'utf8')) : null;
const OHNE_LISTE = SPERRLISTE ? false : 'BVC_SPERRLISTE fehlt: private Sperrliste übersprungen';
const gleich = (v) => v;
const mac = SPERRLISTE ? (v) => crypto.createHmac('sha256', Buffer.from(SPERRLISTE.schluessel, 'hex')).update(v).digest('hex') : gleich;
const VERBOTENE_WOERTER = new Set(SPERRLISTE ? SPERRLISTE.woerter : []);

// Heimnetz-Domain: Prüfwert ist der SHA-256 (mit Salz) jedes Ausschnitts fester
// Länge jeder Buchstabenfolge, also auch in Subdomains, URLs und zusammengesetzten Wörtern.
const DOMAIN = SPERRLISTE ? { ...SPERRLISTE.domain, werte: new Set(SPERRLISTE.domain.werte) } : null;

/** Fundstellen der Heimnetz-Domain per Hash-Vergleich (leer = sauber). */
function domainFunde(text, domain = DOMAIN, pruef = mac) {
  if (!domain) return [];
  for (const folge of new Set(text.toLowerCase().match(/\p{L}+/gu) || [])) {
    for (let i = 0; i + domain.laenge <= folge.length; i++) {
      const wert = crypto.createHash('sha256').update(domain.salz + folge.slice(i, i + domain.laenge)).digest('hex');
      if (domain.werte.has(pruef(wert))) return ['Heimnetz-Domain (Hash)'];
    }
  }
  return [];
}

/** Liefert die Fundstellen privater Werte in einem Text (leer = sauber). */
function privateFunde(text, woerter = VERBOTENE_WOERTER, domain = DOMAIN, pruef = mac) {
  const funde = [];
  const muster = {
    IPv4: /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g,
    MAC: /\b[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}\b/gi,
    Token: /eyJ[\w-]*/g,
    Heimnetz: /192\.168\./g,
    HexToken: /\b[0-9a-f]{40,}\b/gi,
  };
  for (const [art, re] of Object.entries(muster)) for (const m of text.matchAll(re)) funde.push(`${art}: ${m[0]}`);
  funde.push(...domainFunde(text, domain, pruef));
  for (const wort of new Set(text.toLowerCase().match(/\p{L}+/gu) || [])) {
    if (woerter.has(pruef(crypto.createHash('sha256').update(wort).digest('hex')))) funde.push('echter Name (Hash)');
  }
  return funde;
}

test('alle Fixture-Dateien liegen vor (vier Varianten, feindlich (M27), die Schlüsselliste und die Übersetzung M21)', () => {
  assert.deepEqual(fs.readdirSync(ORDNER).filter((f) => f.endsWith('.json')).sort(), ERWARTET);
});

for (const datei of ERWARTET) {
  test(`${datei}: keine privaten Werte`, () => {
    assert.deepEqual(privateFunde(fs.readFileSync(path.join(ORDNER, datei), 'utf8')), []);
  });
}

// Testquelltexte (Plan device-settings Task 9): Geräteinfo nur synthetisch.
for (const datei of fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'datenschutz.test.js')) {
  test(`${datei}: keine privaten Werte`, () => {
    assert.deepEqual(privateFunde(fs.readFileSync(path.join(__dirname, datei), 'utf8')), []);
  });
}

// Grundriss: Prüfwert eines Raumrechtecks (x0,y0,x1,y1) ist sein scrypt-Wert.
const ECHTE_RAEUME = new Set(SPERRLISTE ? SPERRLISTE.raeume : []);
const raumWert = (r) => crypto.scryptSync(`${r.x0},${r.y0},${r.x1},${r.y1}`, 'busch-vacuum-raeume', 32).toString('hex');

/** Räume der Kartenkameras, deren Rechteck dem echten Grundriss entspricht. */
function echteRaeume(fixture, werte = ECHTE_RAEUME, pruef = mac) {
  const funde = [];
  for (const [id, s] of Object.entries(fixture.states || {})) {
    if (!id.startsWith('camera.')) continue;
    for (const [nr, r] of Object.entries(s.attributes.rooms || {})) if (werte.has(pruef(raumWert(r)))) funde.push(`${id} Raum ${nr}`);
  }
  return funde;
}

for (const datei of ERWARTET) {
  test(`${datei}: kein echter Grundriss (Raumrechtecke)`, { skip: OHNE_LISTE }, () => {
    assert.deepEqual(echteRaeume(JSON.parse(fs.readFileSync(path.join(ORDNER, datei), 'utf8'))), []);
  });
}

test('Gegenprobe: die Grundriss-Prüfung schlägt an', () => {
  const rechteck = { x0: -100, y0: -200, x1: 300, y1: 400 };
  assert.deepEqual(echteRaeume({ states: { 'camera.k': { attributes: { rooms: { 1: rechteck } } } } }, new Set([raumWert(rechteck)]), gleich), ['camera.k Raum 1']);
  assert.deepEqual(echteRaeume({ states: { 'camera.k': { attributes: { rooms: { 1: { ...rechteck, x0: -101 } } } } } }, new Set([raumWert(rechteck)]), gleich), []);
});

test('Gegenprobe: die Prüfung schlägt an', () => {
  assert.equal(privateFunde('ip 10.0.0.1').length, 1);
  assert.equal(privateFunde('aa:bb:cc:dd:ee:ff').length, 1);
  assert.equal(privateFunde('Bearer eyJhbGciOi').length, 1);
  assert.equal(privateFunde('http://' + ['192', '168', ''].join('.')).length, 1);
  assert.equal(privateFunde('token=' + 'ab'.repeat(32)).length, 1);
  const probe = new Set([crypto.createHash('sha256').update('probewort').digest('hex')]);
  assert.equal(privateFunde('Raum Probewort', probe, null, gleich).length, 1, 'Name per Hash erkannt, auch großgeschrieben');
  const domain = { salz: 'busch-vacuum-domain:', laenge: 7, werte: new Set([crypto.createHash('sha256').update('busch-vacuum-domain:probedo').digest('hex')]) };
  assert.deepEqual(privateFunde('https://ha.ProbeDomain.example/', probe, domain, gleich), ['Heimnetz-Domain (Hash)'], 'Domain per Hash erkannt, auch in Subdomain und großgeschrieben');
  assert.deepEqual(privateFunde('https://ha.probedx.example/', probe, domain, gleich), [], 'andere Domain bleibt sauber');
  assert.deepEqual(privateFunde('Version 2.0.3, Raum Atelier'), [], 'Versionsnummer ist keine IP');
});

// Kartendaten (map-view): Prüfwerte für Größe, Segment-Mittelpunkte und Lauflängen
// je Ebene sind scrypt-Werte. Geprüft werden alle JSON-Dateien des Repos und die
// synthetischen Kartendaten der Tests.
const ECHTE_KARTENDATEN = new Set(SPERRLISTE ? SPERRLISTE.kartendaten : []);
const kartenWert = (s) => crypto.scryptSync(s, 'busch-vacuum-kartendaten', 32).toString('hex');

/** Fundstellen echter Kartendaten in einem beliebigen Objekt (rekursiv). */
function echteKartendaten(objekt, werte = ECHTE_KARTENDATEN, pruef = mac) {
  const funde = [];
  const besuche = (o, wo) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.size) && o.size.length >= 7) {
      const [l, t, , , w, h, g] = o.size;
      if (werte.has(pruef(kartenWert(`size:${l},${t},${w},${h},${g}`)))) funde.push(wo + ': Kartengröße');
    }
    if (Array.isArray(o.segments)) for (const s of o.segments) if (Array.isArray(s) && werte.has(pruef(kartenWert(`seg:${s[0]},${s[1]},${s[2]}`)))) funde.push(wo + ': Segment ' + s[0]);
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
      for (const [k, v] of Object.entries(o.data)) {
        if (Array.isArray(v) && werte.has(pruef(kartenWert(`lauf:${k}:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`)))) funde.push(wo + ': Pixel ' + k);
      }
    }
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && k !== 'data') besuche(v, wo + '.' + k);
  };
  besuche(objekt, '');
  return funde;
}

function jsonDateien(ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) return ['.git', 'node_modules', 'graphify-out'].includes(e.name) ? [] : jsonDateien(p);
    return e.name.endsWith('.json') ? [p] : [];
  });
}

test('keine echten Kartendaten in JSON-Dateien des Repos', { skip: OHNE_LISTE }, () => {
  const dateien = jsonDateien(path.join(__dirname, '..'));
  assert.ok(dateien.length >= 4);
  for (const datei of dateien) assert.deepEqual(echteKartendaten(JSON.parse(fs.readFileSync(datei, 'utf8'))), [], datei);
});

test('synthetische Kartendaten der Tests sind keine echten', { skip: OHNE_LISTE }, () => {
  const { ausFixture } = require('./kartendaten.js');
  const { _zellen, ...daten } = ausFixture();
  assert.deepEqual(echteKartendaten(daten), []);
});

test('Gegenprobe: die Kartendaten-Prüfung schlägt an', () => {
  const probe = { size: [-100, -200, 0, 0, 30, 40, 50, 0], segments: [[3, 10, 20]], data: { 3: [0, 0, 5] } };
  const werte = new Set([kartenWert('size:-100,-200,30,40,50'), kartenWert('seg:3,10,20'),
    kartenWert('lauf:3:' + crypto.createHash('sha256').update(JSON.stringify([0, 0, 5])).digest('hex'))]);
  assert.deepEqual(echteKartendaten({ antwort: probe }, werte, gleich), ['.antwort: Kartengröße', '.antwort: Segment 3', '.antwort: Pixel 3']);
  assert.deepEqual(echteKartendaten({ ...probe, size: [-101, -200, 0, 0, 30, 40, 50, 0], segments: [], data: {} }, werte, gleich), []);
});

test('synthetische Verlaufsdaten der Tests sind keine echten (auch die eingebettete WLAN-Karte)', () => {
  const { verlaufsdaten } = require('./kartendaten.js');
  const daten = verlaufsdaten();
  assert.ok(daten.wifi_map_data && daten.wifi_map_data.size, 'WLAN-Karte wird mitgeprüft');
  assert.deepEqual(echteKartendaten(daten), []);
  assert.deepEqual(privateFunde(JSON.stringify(daten)), []);
});

test('Verlaufsbilder der Fixtures tragen nur den Test-Token', () => {
  for (const name of ERWARTET.filter((n) => n !== 'integration-schluessel.json')) {
    const f = JSON.parse(fs.readFileSync(path.join(ORDNER, name), 'utf8'));
    for (const s of Object.values(f.states || {})) {
      for (const key of ['cleaning_history_picture', 'cruising_history_picture']) {
        for (const url of Object.values((s.attributes || {})[key] || {})) assert.match(url, /[?&]token=testtoken&/, name + ' ' + key);
      }
    }
  }
});

test('private Sperrliste geladen (Namen, Domain, Grundriss, Kartendaten)', { skip: OHNE_LISTE }, () => {
  assert.ok(VERBOTENE_WOERTER.size && DOMAIN.werte.size && ECHTE_RAEUME.size && ECHTE_KARTENDATEN.size);
  const probe = new Set([mac(crypto.createHash('sha256').update('probewort').digest('hex'))]);
  assert.equal(privateFunde('Raum Probewort', probe).length, 1, 'HMAC-Weg erkennt das Wort');
});

test('M7: der Test selbst enthält keine Sperrhashes', () => {
  assert.deepEqual(fs.readFileSync(__filename, 'utf8').match(/\b[0-9a-f]{64}\b/g) || [], []);
});

// ── M30: alle öffentlichen Dateien ──────────────────────────────────────────
// Was im Repo liegt, ist öffentlich: `git ls-files`; ohne git (Testcontainer)
// der Verzeichnislauf ohne .git und ohne das, was .gitignore ausschließt.
const WURZEL = path.join(__dirname, '..');

/** .gitignore-Zeilen als Prüfer (genug für die Muster dieses Repos: *, Ordner/, mit und ohne /). */
function ignoriert(text) {
  const regeln = text.split('\n').map((z) => z.trim()).filter((z) => z && !z.startsWith('#') && !z.startsWith('!')).map((muster) => {
    const ordner = muster.endsWith('/');
    const kern = muster.replace(/\/$/, '').replace(/^\//, '');
    const re = kern.split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
    const anker = muster.replace(/\/$/, '').includes('/') ? '^' : '(?:^|/)';
    return new RegExp(anker + re + (ordner ? '/' : '(?:/|$)'));
  });
  return (datei) => regeln.some((r) => r.test(datei));
}

function oeffentlicheDateien(wurzel = WURZEL) {
  try {
    const liste = require('node:child_process').execFileSync('git', ['ls-files', '-z'], { cwd: wurzel, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const dateien = liste.split('\0').filter(Boolean);
    if (dateien.length) return { weg: 'git ls-files', dateien };
  } catch (e) {
    // kein git im Container: Verzeichnislauf
  }
  const gitignore = fs.existsSync(path.join(wurzel, '.gitignore')) ? fs.readFileSync(path.join(wurzel, '.gitignore'), 'utf8') : '';
  const aus = ignoriert(gitignore);
  const lauf = (rel) => fs.readdirSync(path.join(wurzel, rel), { withFileTypes: true }).flatMap((e) => {
    const p = rel ? rel + '/' + e.name : e.name;
    if (e.name === '.git' || aus(e.isDirectory() ? p + '/' : p)) return [];
    return e.isDirectory() ? lauf(p) : [p];
  });
  return { weg: 'Verzeichnislauf', dateien: lauf('') };
}

/** Text-Chunks einer PNG (tEXt, iTXt, zTXt, eXIf); Fehler bei kaputter Datei. */
function pngChunks(puffer) {
  assert.equal(puffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG-Signatur');
  const funde = [];
  for (let i = 8; i + 8 <= puffer.length;) {
    const laenge = puffer.readUInt32BE(i), typ = puffer.toString('latin1', i + 4, i + 8);
    if (['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(typ)) funde.push(typ + ': ' + puffer.toString('latin1', i + 8, i + 8 + Math.min(laenge, 60)).replace(/\0/g, '='));
    if (typ === 'IEND') break;
    i += 12 + laenge;
  }
  return funde;
}

const istText = (puffer) => !puffer.subarray(0, 8000).includes(0);
/**
 * Bekannte öffentliche Werte, keine Geheimnisse: die SHA-256 des Busch-UI-Blocks
 * in seiner Kopfzeile (dist, Zeile 1), Commit-SHAs gepinnter Actions (M1) und
 * die Loopback-Adresse des Renderers.
 */
function ohneBekannte(datei, text) {
  if (datei === 'dist/busch-vacuum-card.js') text = text.replace(/^(\/\* BEGIN BUSCH SHARED UI [\d.]+ sha256:)[0-9a-f]{64}/, '$1…');
  if (datei.startsWith('.github/workflows/')) text = text.replace(/(uses:\s*[\w.-]+\/[\w./-]+@)[0-9a-f]{40}\b/g, '$1…');
  return text.replace(/(?<![\d.])127\.0\.0\.1(?![\d.])/g, 'loopback');
}
/** Quelltexte mit Wörterbuch: nur Muster und Domain; Namen prüft die Sperrliste in Fixtures, Tests und Doku. */
const NUR_MUSTER = new Set(['dist/busch-vacuum-card.js', 'docs/render/render.py']);

const OEFFENTLICH = oeffentlicheDateien();

test(`M30 alle öffentlichen Dateien (${OEFFENTLICH.weg}) gefunden: README, Quelle, Doku, Workflows, Fixtures, PNGs`, () => {
  for (const d of ['README.md', 'dist/busch-vacuum-card.js', 'docs/entwicklung.md', '.github/workflows/release.yml', 'tests/fixtures/voll.json', 'hacs.json']) assert.ok(OEFFENTLICH.dateien.includes(d), d);
  assert.ok(OEFFENTLICH.dateien.filter((d) => d.endsWith('.png')).length >= 18, 'Baseline-PNGs');
  assert.equal(OEFFENTLICH.dateien.some((d) => d.startsWith('.git/') || d.startsWith('node_modules/')), false);
});

for (const datei of OEFFENTLICH.dateien) {
  const puffer = fs.readFileSync(path.join(WURZEL, datei));
  if (datei.endsWith('.png')) {
    test(`M30 ${datei}: PNG ohne Text-Chunks`, () => assert.deepEqual(pngChunks(puffer), []));
  } else if (istText(puffer) && datei !== 'tests/datenschutz.test.js') {
    const woerter = NUR_MUSTER.has(datei) ? new Set() : VERBOTENE_WOERTER;
    test(`M30 ${datei}: keine privaten Werte`, () => assert.deepEqual(privateFunde(ohneBekannte(datei, puffer.toString('utf8')), woerter), []));
  }
}

test('M30 Gegenprobe: eine probehalber ins README gesetzte private IP ergibt einen Fund', () => {
  const readme = fs.readFileSync(path.join(WURZEL, 'README.md'), 'utf8');
  assert.deepEqual(privateFunde(readme), []);
  const ip = ['10', '20', '30', '40'].join('.');
  assert.deepEqual(privateFunde(readme.replace('## Installation', 'Server ' + ip + '\n\n## Installation')), ['IPv4: ' + ip]);
  assert.deepEqual(privateFunde(ohneBekannte('README.md', 'Server ' + ip)), ['IPv4: ' + ip], 'die Ausnahmen lassen echte Adressen durch');
  assert.deepEqual(privateFunde(ohneBekannte('.github/workflows/x.yml', 'token: ' + 'ab'.repeat(20))).length, 1, 'nur gepinnte uses: sind ausgenommen');
});

test('M30 Gegenprobe: eine PNG mit tEXt-Chunk wird erkannt, die Prüfung liest die Chunk-Folge richtig', () => {
  const crc = () => Buffer.alloc(4);
  const chunk = (typ, daten) => { const l = Buffer.alloc(4); l.writeUInt32BE(daten.length); return Buffer.concat([l, Buffer.from(typ, 'latin1'), daten, crc()]); };
  const kopf = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = chunk('IHDR', Buffer.alloc(13));
  const mit = Buffer.concat([kopf, ihdr, chunk('tEXt', Buffer.from('Comment\0Raum Probe', 'latin1')), chunk('IDAT', Buffer.alloc(3)), chunk('IEND', Buffer.alloc(0))]);
  assert.deepEqual(pngChunks(mit), ['tEXt: Comment=Raum Probe']);
  assert.deepEqual(pngChunks(Buffer.concat([kopf, ihdr, chunk('IDAT', Buffer.alloc(3)), chunk('IEND', Buffer.alloc(0))])), []);
});

test('M30 Gegenprobe: .gitignore-Muster schließen lokale Dateien aus, öffentliche nicht', () => {
  const aus = ignoriert('node_modules/\n*.pyc\ndocs/render/ergebnis*/\nAGENTS.md\ndocs/abnahme-*.md\n# Kommentar\n');
  assert.deepEqual(['node_modules/', 'a/b.pyc', 'docs/render/ergebnis-1/', 'AGENTS.md', 'docs/abnahme-0.2.md'].filter((d) => !aus(d)), []);
  assert.deepEqual(['README.md', 'docs/entwicklung.md', 'docs/render/render.py', 'tests/AGENTS.md.js'].filter(aus), []);
});
