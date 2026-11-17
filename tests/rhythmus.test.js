'use strict';
// Buschcheck M16 (#1203): inaktive Reiter lesbar, Aktivzustand über die Form, Abstandsskala im Panel.
const test = require('node:test');
const assert = require('node:assert');
const { neueUmgebung, hausAus, neueKarte } = require('./attrappe.js');

const { CARD_STYLES } = neueUmgebung().registry.get('busch-vacuum-card').__internals;
const regel = (sel) => {
  const i = CARD_STYLES.indexOf('\n' + sel + ' {');
  return i < 0 ? null : CARD_STYLES.slice(i + sel.length + 3, CARD_STYLES.indexOf('}', i)).replace(/\/\*[^]*?\*\//g, '');
};

// HA-Standardthema (wie hacs/docs/render/regeln.py): die Farben, auf denen die Reiter stehen.
const THEMEN = {
  hell: { '--secondary-text-color': '#727272', '--primary-text-color': '#212121', '--card-background-color': '#ffffff', '--secondary-background-color': '#e5e5e5' },
  dunkel: { '--secondary-text-color': '#9b9b9b', '--primary-text-color': '#e1e1e1', '--card-background-color': '#1c1c1c', '--secondary-background-color': '#202020' },
};
const leuchte = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a, b) => { const [x, y] = [leuchte(a), leuchte(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Erste Variable eines Werts (`var(--a, var(--b, #fff))` → --a); `transparent` bleibt. */
const variable = (wert) => { const m = /var\((--[a-z-]+)/.exec(wert || ''); return m ? m[1] : (wert || '').trim(); };
const wert = (block, eigenschaft) => { const m = new RegExp('(?:^|;)\\s*' + eigenschaft + ':\\s*([^;]+);').exec(block || ''); return m ? m[1].trim() : null; };

test('M16 inaktive Reiter: --secondary-text-color auf der Kartenfarbe, mindestens 4,5:1 hell und dunkel', () => {
  const leiste = regel(':host .tasks');
  const reiter = regel(':host .task');
  assert.ok(leiste && reiter, 'Regeln der Segmentsteuerung');
  assert.equal(wert(reiter, 'color'), 'var(--secondary-text-color, #727272)', 'HA-Nebentextfarbe, Rückfall wie HA');
  assert.equal(wert(reiter, 'background'), 'transparent');
  // Die Leiste füllt nicht grau: sonst steht der Nebentext auf --secondary-background-color (3,8:1 im hellen Thema).
  assert.equal(wert(leiste, 'background'), 'transparent', 'Leiste ohne graue Fläche');
  assert.equal(wert(leiste, 'border'), '1px solid var(--divider-color, #e0e0e0)', 'Form der Leiste über den Rahmen');
  for (const [name, t] of Object.entries(THEMEN)) {
    const k = kontrast(t[variable(wert(reiter, 'color'))], t['--card-background-color']);
    assert.ok(k >= 4.5, name + ': inaktiver Reiter ' + k.toFixed(2) + ':1');
  }
});

test('M16 aktiver Reiter: Fläche, Rahmen und Gewicht, nicht nur Farbe; Text mindestens 4,5:1', () => {
  const aktiv = regel(':host .task[aria-checked=true]');
  assert.ok(aktiv, 'Regel des gewählten Reiters');
  assert.equal(wert(aktiv, 'background'), 'var(--secondary-background-color, #e5e5e5)', 'gefüllte Fläche');
  assert.equal(wert(aktiv, 'box-shadow'), 'inset 0 0 0 1px var(--primary-text-color, #212121)', 'Rahmen in Textfarbe (auch dunkel sichtbar)');
  assert.equal(wert(aktiv, 'font-weight'), 'var(--ha-font-weight-medium, 500)');
  assert.equal(wert(aktiv, 'color'), 'var(--primary-text-color, #212121)');
  for (const [name, t] of Object.entries(THEMEN)) {
    const text = kontrast(t['--primary-text-color'], t[variable(wert(aktiv, 'background'))]);
    assert.ok(text >= 4.5, name + ': aktiver Reiter ' + text.toFixed(2) + ':1');
    const rahmen = kontrast(t['--primary-text-color'], t['--card-background-color']);
    assert.ok(rahmen >= 3, name + ': Rahmen gegen Karte ' + rahmen.toFixed(2) + ':1 (WCAG 1.4.11)');
  }
  // Außenmaß bleibt: 1 px Rahmen + 2 px Innenabstand statt 3 px Innenabstand.
  assert.equal(wert(regel(':host .tasks'), 'padding'), '2px');
});

test('M16 Abstandsskala: zwischen Panelgruppen --ha-space-4, innerhalb einer Gruppe --ha-space-2', () => {
  assert.equal(wert(regel('.panel'), 'gap'), 'var(--ha-space-4, 16px)', 'Meldungen, Station, Aufgaben, Verlauf');
  assert.equal(wert(regel('.task-area'), 'gap'), 'var(--ha-space-2, 8px)', 'innerhalb der Aufgabengruppe');
  assert.equal(wert(regel(':host .task-area > .task-head:not(:last-child)'), 'margin-bottom'), 'var(--ha-space-2, 8px)', 'Reiter → Kontext: 8 + 8 px');
  assert.equal(wert(regel(':host .task-area > .settings-row:not(:first-child)'), 'margin-top'), 'var(--ha-space-2, 8px)', 'Kontext → Einstellungen: 8 + 8 px');
  // Zwischen Gruppen gibt es genau einen Wert (16 px), innerhalb genau einen (8 px): zwei Abstandswerte.
  const px = (v) => Number(/(\d+)px\)$/.exec(v)[1]);
  const zwischen = new Set([px(wert(regel('.panel'), 'gap')), px(wert(regel('.task-area'), 'gap')) + px(wert(regel(':host .task-area > .task-head:not(:last-child)'), 'margin-bottom')),
    px(wert(regel('.task-area'), 'gap')) + px(wert(regel(':host .task-area > .settings-row:not(:first-child)'), 'margin-top'))]);
  assert.deepEqual([...zwischen], [16]);
});

test('M16 Aufbau: Reiter oben, Einstellungszeile zuletzt in der Aufgabengruppe (beide Breiten)', () => {
  for (const breite of [390, 1280]) {
    const u = neueUmgebung();
    const beobachter = [];
    u.kontext.ResizeObserver = class { constructor(fn) { this.fn = fn; this.ziele = []; beobachter.push(this); } observe(el) { this.ziele.push(el); } disconnect() {} };
    const k = neueKarte(u, hausAus('voll'), {});
    for (const b of beobachter) if (b.ziele.includes(k)) b.fn([{ target: k, contentRect: { width: breite, height: 800 } }]);
    const kinder = k.shadowRoot.querySelector('.task-area').childNodes.filter((n) => n.classList);
    assert.ok(kinder.length >= 3, breite + ': Reiter, Kontext, Einstellungen');
    assert.equal(kinder[0].className, 'task-head', breite + ': Reiter zuerst');
    assert.ok(kinder[kinder.length - 1].classList.contains('settings-row'), breite + ': Einstellungszeile zuletzt');
  }
});

test('M16 Kennzahlen: Beschriftung auf der grauen Kachel in Textfarbe, mindestens 4,5:1 hell und dunkel; Form bleibt', () => {
  const alle = (sel) => CARD_STYLES.split('\n' + sel + ' {').slice(1).map((b) => b.slice(0, b.indexOf('}')).replace(/\/\*[^]*?\*\//g, ''));
  assert.ok(alle('.metric').some((b) => wert(b, 'background') === 'var(--secondary-background-color, #f4f5f7)'), 'Artboard: Pille/Kachel bleibt grau');
  // Die letzte .metric-label-Regel (Kennzahlenleiste) entscheidet; sie färbt in Textfarbe.
  assert.equal(wert(alle('.metric-label').at(-1), 'color'), 'var(--primary-text-color, #212121)');
  for (const [name, t] of Object.entries(THEMEN)) {
    const k = kontrast(t['--primary-text-color'], t['--secondary-background-color']);
    assert.ok(k >= 4.5, name + ': Beschriftung ' + k.toFixed(2) + ':1');
  }
});
