'use strict';
// Plan Task 1: Karte registriert sich und rendert mit `entity` einen leeren Rahmen ohne Fehler.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, neuesHaus, hausAus, neueKarte } = require('./attrappe.js');

test('M5 ein Dienstweg: callService( genau einmal, in callDevice', () => {
  const quelle = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8');
  const stellen = Array.from(quelle.matchAll(/callService\(/g), (m) => m.index);
  assert.equal(stellen.length, 1, 'callService( nur in callDevice');
  const anfang = quelle.indexOf('function callDevice(');
  assert.ok(anfang >= 0 && stellen[0] > anfang && stellen[0] < quelle.indexOf('\n}\n', anfang), 'in callDevice');
});

// M9: Zähler, die nur sinken dürfen. KOPF_GRENZE = Funktionsköpfe mit mehr als 4 Parametern in Karteneditor und Sicherung.
const KOPF_GRENZE = 0;
/** Zeilen [von, bis) einer Klasse: vom Kopf bis zur ersten Zeile „}“ am Zeilenanfang. */
function klassenZeilen(zeilen, kopf) {
  const von = zeilen.findIndex((z) => z.startsWith(kopf));
  assert.ok(von >= 0, 'nicht gefunden: ' + kopf);
  return [von, zeilen.findIndex((z, i) => i > von && z === '}')];
}
const ausserhalb = (zeilen, [von, bis], muster) => zeilen.flatMap((z, i) => (i >= von && i <= bis ? [] : Array.from(z.matchAll(muster), (m) => (i + 1) + ': ' + m[0])));
/** Parameterzahl einer Parameterliste (Kommas auf oberster Ebene). */
function parameter(liste) {
  if (!liste.trim()) return 0;
  let tiefe = 0, n = 1;
  for (const c of liste) {
    if ('([{'.includes(c)) tiefe++;
    else if (')]}'.includes(c)) tiefe--;
    else if (c === ',' && tiefe === 0) n++;
  }
  return n;
}
/** Funktionsköpfe (function, const x = (…) =>, Methoden) mit mehr als `grenze` Parametern zwischen zwei Markern. */
function langeKoepfe(zeilen, von, bis, grenze) {
  const a = zeilen.findIndex((z) => z.startsWith(von)), b = zeilen.findIndex((z) => z.startsWith(bis));
  assert.ok(a >= 0 && b > a, 'Modulgrenzen ' + von + ' … ' + bis);
  const kopf = /^\s*(?:async\s+)?(?:function\s*\w*\s*\(|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(|(?!(?:if|for|while|switch|catch|return|function)\b)\w+\s*\((?=.*\)\s*\{\s*$))/;
  const treffer = [];
  for (let i = a; i < b; i++) {
    const m = zeilen[i].match(kopf);
    if (!m) continue;
    // Parameterliste bis zur passenden Klammer
    let tiefe = 1, j = m[0].length, rest = zeilen[i];
    while (j < rest.length && tiefe > 0) { if (rest[j] === '(') tiefe++; else if (rest[j] === ')') tiefe--; j++; }
    const liste = rest.slice(m[0].length, j - 1), danach = rest.slice(j);
    const istKopf = /^\s*(?:=>|\{)/.test(danach) && (/function|const|let/.test(m[0]) || /^\s*\{\s*$/.test(danach));
    if (istKopf && parameter(liste) > grenze) treffer.push((i + 1) + ': ' + rest.trim().slice(0, 90));
  }
  return treffer;
}

test('M9 Kopplung: außerhalb des Dialogs kein dialog._x, außerhalb der Karte kein card._x, Köpfe in Editor/Sicherung höchstens 4 Parameter', () => {
  const zeilen = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8').split('\n');
  assert.deepEqual(ausserhalb(zeilen, klassenZeilen(zeilen, 'class BuschVacuumDialog '), /\b(?:dialog|d|owner|_dialog)\._[a-zA-Z]+/g), [], 'private Dialogfelder außerhalb von BuschVacuumDialog');
  assert.deepEqual(ausserhalb(zeilen, klassenZeilen(zeilen, 'class BuschVacuumCard '), /\bcard\._[a-zA-Z]+/g), [], 'private Kartenfelder außerhalb von BuschVacuumCard');
  const koepfe = [
    ...langeKoepfe(zeilen, '// Map editor (map-editor)', '// Map backup (map-backup', 4),
    ...langeKoepfe(zeilen, '// Map backup (map-backup', 'BuschVacuumCard.__internals', 4),
  ];
  assert.ok(koepfe.length <= KOPF_GRENZE, 'mehr lange Köpfe als zuletzt (' + KOPF_GRENZE + '):\n' + koepfe.join('\n'));
  assert.equal(koepfe.length, KOPF_GRENZE, 'weniger lange Köpfe: KOPF_GRENZE auf ' + koepfe.length + ' senken');
});

// M41: __internals ist die Testschnittstelle (docs/entwicklung.md); kein Eintrag ohne Testnutzer, keine Funktion ohne Aufrufer.
test('M41 kein toter Code: jede Funktion außerhalb des Shared-UI-Blocks hat einen Aufrufer, jeder __internals-Eintrag einen Testnutzer', () => {
  const fs = require('node:fs'), path = require('node:path');
  // Kommentare zählen nicht als Aufruf (Blockkommentare und reine Kommentarzeilen).
  const quelle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'busch-vacuum-card.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  const a = quelle.indexOf('\nBuschVacuumCard.__internals = {'), b = quelle.indexOf('\n};', a);
  assert.ok(a > 0 && b > a, '__internals-Block gefunden');
  const eigen = quelle.slice(quelle.indexOf('\nconst TEXTE_BUSCH_VACUUM_CARD'));
  const ohneBlock = eigen.slice(0, eigen.indexOf('\nBuschVacuumCard.__internals = {')) + quelle.slice(b);
  // Aufruf = der Name ohne Punkt davor (obj.name ist ein anderer Name), Spread ...name zählt.
  const zaehle = (text, name, vor = '(?<![\\w$])(?<![^.]\\.)') => (text.match(new RegExp(vor + name.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || []).length;
  const namen = Array.from(eigen.matchAll(/^(?:async\s+)?(?:function\s*\*?\s*([\w$]+)\s*\(|(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>)/gm), (m) => m[1] || m[2]);
  assert.ok(namen.length > 100, 'Funktionen gefunden: ' + namen.length);
  assert.deepEqual(namen.filter((n) => zaehle(ohneBlock, n) < 2), [], 'Funktionen ohne Aufrufer (nur Kopf, höchstens __internals)');
  const eintraege = Array.from(quelle.slice(a, b).matchAll(/^\s+([\w$]+)\s*[:,]/gm), (m) => m[1]);
  assert.ok(eintraege.length > 50, '__internals-Einträge: ' + eintraege.length);
  const tests = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  assert.deepEqual(eintraege.filter((n) => zaehle(tests, n, '(?<![\\w$])') === 0), [], '__internals-Einträge ohne Testnutzer');
});

test('Karte, Editor und Picker-Eintrag sind registriert', () => {
  const u = neueUmgebung();
  assert.ok(u.registry.get('busch-vacuum-card'), 'Karte definiert');
  assert.ok(u.registry.get('busch-vacuum-card-editor'), 'Editor definiert');
  const eintrag = u.kontext.window.customCards.find((c) => c.type === 'busch-vacuum-card');
  assert.ok(eintrag, 'customCards-Eintrag');
  assert.equal(eintrag.preview, false);
  assert.match(eintrag.name, /Saugroboter/, 'Name deutsch bei deutschem Browser');
  assert.ok(eintrag.description.endsWith('.'));
  assert.equal(u.registry.get('busch-vacuum-card').__internals.version, '0.4.0');
});

test('Picker-Eintrag englisch bei englischem Browser', () => {
  const u = neueUmgebung({ sprache: 'en-US' });
  assert.match(u.kontext.window.customCards[0].name, /vacuum/i);
});

test('CORE-01 mit entity: leerer Rahmen in ha-card, keine Fehler', () => {
  const u = neueUmgebung();
  const karte = neueKarte(u, neuesHaus());
  const card = karte.shadowRoot.querySelector('ha-card');
  assert.ok(card, 'ha-card vorhanden');
  assert.equal(card.querySelector('.error'), null, 'kein Fehlerkasten');
  assert.deepEqual(u.fehler, [], 'keine Konsolenfehler');
});

test('ohne entity: Fehlerkasten im Wörterbuchtext statt Absturz', () => {
  const u = neueUmgebung();
  const karte = u.document.createElement('busch-vacuum-card');
  karte.setConfig({ type: 'custom:busch-vacuum-card' });
  u.body.appendChild(karte);
  karte.hass = neuesHaus().hass();
  const box = karte.shadowRoot.querySelector('.error');
  assert.ok(box, 'Fehlerkasten');
  assert.match(box.textContent, /Saugroboter/);
});

test('CORE-01 falsche Domain wird abgewiesen', () => {
  const u = neueUmgebung();
  const karte = neueKarte(u, neuesHaus(), { entity: 'light.decke' });
  assert.ok(karte.shadowRoot.querySelector('.error'));
});

test('Stub-Konfiguration nimmt den ersten Saugroboter', () => {
  const u = neueUmgebung();
  const Karte = u.registry.get('busch-vacuum-card');
  const stub = Karte.getStubConfig(neuesHaus().hass());
  assert.deepEqual(JSON.parse(JSON.stringify(stub)), { type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' });
});

test('Kartengröße und Raster in Vielfachen von 3', () => {
  const u = neueUmgebung();
  const karte = neueKarte(u, neuesHaus());
  assert.ok(karte.getCardSize() > 0);
  const raster = karte.getGridOptions();
  assert.equal(raster.columns % 3, 0);
  assert.equal(raster.min_columns % 3, 0);
});

test('M37 Kartengröße nach Layout: mit Karte 9, ohne Karte 4, Panel 1; Raster mit Zeilen', () => {
  const u = neueUmgebung();
  const mit = neueKarte(u, hausAus('voll'));
  assert.ok(mit.hasAttribute('data-map'), 'Voraussetzung: Kartenkamera');
  assert.equal(mit.getCardSize(), 9);
  assert.deepEqual(JSON.parse(JSON.stringify(mit.getGridOptions())), { columns: 12, min_columns: 6, rows: 'auto', min_rows: 8 });
  const ohne = neueKarte(u, hausAus('ohne-karte'));
  assert.ok(!ohne.hasAttribute('data-map'), 'Voraussetzung: keine Kartenkamera');
  assert.equal(ohne.getCardSize(), 4);
  assert.deepEqual(JSON.parse(JSON.stringify(ohne.getGridOptions())), { columns: 12, min_columns: 6, rows: 'auto', min_rows: 4 });
  const panel = neueKarte(u, hausAus('voll'));
  panel.isPanel = true;
  assert.equal(panel.getCardSize(), 1);
  assert.equal(panel.getGridOptions().min_rows, 1, 'Panel: kleinste Kachel, HA zeigt die Karte ohnehin ganzseitig');
});
