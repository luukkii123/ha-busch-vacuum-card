'use strict';
// DOM-, Uhr- und hass-Attrappe für die Saugroboter-Tests (node --test, ohne Browser).
// Muster: ha-busch-lightcards/tests/attrappe.js. Die Karte wird in einer
// vm-Sandbox geladen; Zeit läuft nur über `uhr.vor(ms)`.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KARTE = path.join(__dirname, '..', 'dist', 'busch-vacuum-card.js');

/** Steuerbare Uhr: setTimeout/clearTimeout/Date.now laufen nur bei `vor()`. */
function neueUhr(start = 1_800_000_000_000) {
  let jetzt = start, nr = 0;
  const wartend = new Map();
  const uhr = {
    get jetzt() { return jetzt; },
    /** M17: wie viele Timer noch warten (Aushängen darf keinen offen lassen). */
    get offen() { return wartend.size; },
    setTimeout(fn, ms = 0, ...a) { const id = ++nr; wartend.set(id, { zeit: jetzt + Math.max(0, Number(ms) || 0), fn, a }); return id; },
    clearTimeout(id) { wartend.delete(id); },
    /** Lässt `ms` vergehen und führt fällige Timer in Zeitreihenfolge aus. */
    vor(ms) {
      const ziel = jetzt + ms;
      for (;;) {
        let naechster = null;
        for (const [id, t] of wartend) if (t.zeit <= ziel && (!naechster || t.zeit < naechster[1].zeit)) naechster = [id, t];
        if (!naechster) break;
        wartend.delete(naechster[0]);
        jetzt = naechster[1].zeit;
        naechster[1].fn(...naechster[1].a);
      }
      jetzt = ziel;
    },
  };
  const Echt = Date;
  uhr.Date = class extends Echt {
    constructor(...a) { if (a.length) super(...a); else super(jetzt); }
    static now() { return jetzt; }
  };
  return uhr;
}

class ClassList {
  constructor(el) { this.el = el; }
  _liste() { return String(this.el.className || '').split(/\s+/).filter(Boolean); }
  contains(c) { return this._liste().includes(c); }
  add(...c) { const l = this._liste(); for (const x of c) if (!l.includes(x)) l.push(x); this.el.className = l.join(' '); }
  remove(...c) { this.el.className = this._liste().filter((x) => !c.includes(x)).join(' '); }
  toggle(c, an) { const soll = an === undefined ? !this.contains(c) : !!an; if (soll) this.add(c); else this.remove(c); return soll; }
}

function neueUmgebung({ uhr, sprache = 'de' } = {}) {
  uhr = uhr || neueUhr();
  const registry = new Map();
  const fehler = [];
  let body;

  class Element {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.parentNode = null;
      this.listeners = {}; this.attributes = {}; this.dataset = {}; this.className = ''; this.title = ''; this.id = '';
      // Wie im Browser: Bedienelemente sind ohne tabindex fokussierbar.
      this._text = ''; this._tabIndex = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName) ? 0 : -1; this.scrollTop = 0; this.clientHeight = 80;
      const style = {}; style.setProperty = (k, v) => { style[k] = String(v); }; style.getPropertyValue = (k) => style[k] || ''; style.removeProperty = (k) => { delete style[k]; };
      this.style = style; this.classList = new ClassList(this);
    }
    get tabIndex() { return this._tabIndex; } set tabIndex(v) { this._tabIndex = Number(v); }
    get disabled() { return 'disabled' in this.attributes; }
    set disabled(v) { if (v) this.attributes.disabled = ''; else delete this.attributes.disabled; }
    get hidden() { return 'hidden' in this.attributes; }
    set hidden(v) { if (v) this.attributes.hidden = ''; else delete this.attributes.hidden; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes.at(-1) || null; }
    get isConnected() { let w = this; while (w) { if (w === body) return true; w = w.parentNode || w.host || null; } return false; }
    attachShadow() { const r = new Element('#shadow'); r.host = this; r._aktiv = null; Object.defineProperty(r, 'activeElement', { get() { return r._aktiv && r.all().includes(r._aktiv) ? r._aktiv : null; } }); this.shadowRoot = r; return r; }
    set textContent(v) { this._text = String(v); for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; }
    get textContent() { return this._text + this.childNodes.map((n) => n.textContent).join(''); }
    set innerHTML(v) { this.textContent = ''; if (v) this._text = String(v); }
    get innerHTML() { return this._text; }
    appendChild(n) { if (n.parentNode) n.remove(); n.parentNode = this; this.childNodes.push(n); if (this === body && n.connectedCallback) n.connectedCallback(); return n; }
    append(...n) { for (const x of n) this.appendChild(x); }
    insertBefore(n, ref) { if (!ref) return this.appendChild(n); if (n.parentNode) n.remove(); n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); return n; }
    replaceChildren(...n) { this.textContent = ''; this.append(...n); }
    remove() { const p = this.parentNode; if (!p) return; p.childNodes = p.childNodes.filter((c) => c !== this); this.parentNode = null; if (p === body && this.disconnectedCallback) this.disconnectedCallback(); }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'tabindex') this._tabIndex = Number(v); }
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
    hasAttribute(k) { return k in this.attributes; }
    removeAttribute(k) { delete this.attributes[k]; }
    toggleAttribute(k, an) { const soll = an === undefined ? !(k in this.attributes) : !!an; if (soll) this.attributes[k] = ''; else delete this.attributes[k]; return soll; }
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
    dispatchEvent(e) { for (const fn of [...(this.listeners[e.type] || [])]) fn(e); return true; }
    focus() { let w = this; while (w.parentNode) w = w.parentNode; w._aktiv = this; }
    blur() {}
    getClientRects() { return [1]; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 }; }
    composedPath() { return []; }
    all() { return [this, ...this.childNodes.flatMap((c) => c.all())]; }
    _passt(sel) {
      sel = sel.trim();
      const wert = sel.match(/^\[([\w-]+)="([^"]*)"\]$/);
      if (wert) return this.attributes[wert[1]] === wert[2];
      const attr = sel.match(/^\[([\w-]+)\]$/);
      if (attr) return attr[1] in this.attributes;
      if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
      if (sel.startsWith('#')) return this.id === sel.slice(1);
      return this.tagName === sel.toUpperCase();
    }
    matches(sel) { return sel.split(',').some((s) => this._passt(s)); }
    querySelectorAll(sel) { return this.all().slice(1).filter((n) => n.matches(sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    click() { this.dispatchEvent(neuesEreignis('click')); }
  }
  function neuesEreignis(type, init = {}) {
    return Object.assign({ type, defaultPrevented: false, propagationStopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } }, init);
  }
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }

  body = new Element('body');
  const docListeners = {};
  const docCapture = {};
  const document = {
    body,
    documentElement: new Element('html'),
    activeElement: null,
    createElement(tag) { const K = registry.get(tag); if (K) { const n = new K(); n.tagName = tag.toUpperCase(); return n; } return new Element(tag); },
    createElementNS(_ns, tag) { return new Element(tag); },
    // Capture-Listener (drittes Argument true/{capture}) merkt sich die Attrappe zusätzlich, damit `tasteAn` die Phasen nachbilden kann.
    addEventListener(t, fn, opt) { (docListeners[t] ||= []).push(fn); if (opt === true || (opt && opt.capture)) (docCapture[t] ||= new Set()).add(fn); },
    removeEventListener(t, fn) { docListeners[t] = (docListeners[t] || []).filter((f) => f !== fn); if (docCapture[t]) docCapture[t].delete(fn); },
    dispatchEvent(e) { for (const fn of [...(docListeners[e.type] || [])]) fn(e); return true; },
    querySelector() { return null; },
  };
  const fenster = { customCards: [], listeners: {}, addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }, removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); } };
  // Verlauf zählt nur mit; popstate lösen Tests selbst über window.listeners aus.
  const verlauf = { laenge: 1, aufrufe: [], pushState() { this.laenge++; this.aufrufe.push('push'); }, back() { this.aufrufe.push('back'); }, go(n) { this.aufrufe.push('go ' + n); } };
  // Steuerbare Animationsframes: laufen nur bei `bild()`.
  const bilder = new Map();
  let bildNr = 0;
  const bild = () => { const jetzt = [...bilder.values()]; bilder.clear(); for (const fn of jetzt) fn(uhr.jetzt); return jetzt.length; };
  const kontext = {
    // console.error/warn der Karte landen in `fehler`, damit Tests „ohne Fehler“ prüfen können.
    console: { info() {}, warn(...a) { fehler.push(a); }, error(...a) { fehler.push(a); }, log() {} },
    window: fenster, document, history: verlauf, location: { href: 'http://ha/lovelace/0' },
    navigator: { language: sprache },
    HTMLElement: Element, CustomEvent, Event: CustomEvent,
    customElements: { define: (k, v) => registry.set(k, v), get: (k) => registry.get(k) },
    setTimeout: uhr.setTimeout, clearTimeout: uhr.clearTimeout, Date: uhr.Date,
    requestAnimationFrame: (fn) => { bilder.set(++bildNr, fn); return bildNr; }, cancelAnimationFrame: (id) => bilder.delete(id),
    Promise, Math, JSON, Object, Array, Map, Set, WeakMap, Number, String, Boolean, Error, Symbol, Intl, RegExp,
    // Wie im Browser: Base64 → Binärtext (Raumnamen der Kartendaten).
    atob: (b) => Buffer.from(String(b), 'base64').toString('latin1'),
  };
  kontext.globalThis = kontext;
  vm.createContext(kontext);
  vm.runInContext(fs.readFileSync(KARTE, 'utf8'), kontext, { filename: 'busch-vacuum-card.js' });
  /**
   * Tastenereignis wie im Browser an einem fokussierten Element: erst die
   * Capture-Listener des Dokuments, dann Ziel und Vorfahren (Bubble), dann die
   * übrigen Dokument-Listener — außer jemand ruft stopPropagation().
   */
  const tasteAn = (ziel, type, init = {}) => {
    const e = neuesEreignis(type, init);
    const cap = docCapture[type] || new Set();
    for (const fn of [...(docListeners[type] || [])]) if (cap.has(fn)) fn(e);
    for (let w = ziel; w && !e.propagationStopped; w = w.parentNode || w.host || null) w.dispatchEvent(e);
    if (!e.propagationStopped) for (const fn of [...(docListeners[type] || [])]) if (!cap.has(fn)) fn(e);
    return e;
  };
  /** Zurück-Geste: popstate an alle Fenster-Listener. */
  const zurueck = () => { for (const fn of [...(fenster.listeners.popstate || [])]) fn({}); };
  return { uhr, kontext, document, body, registry, fehler, neuesEreignis, verlauf, zurueck, bild, tasteAn };
}

// ---- hass ---------------------------------------------------------------

/** Ein Saugroboter ohne alles: nur `vacuum.robo`, dazu 50 fremde Sensoren. */
function einfacherSauger(zustand = 'docked', attribute = {}) {
  return { entity_id: 'vacuum.robo', state: zustand, last_updated: String(Math.random()), attributes: Object.assign({ friendly_name: 'Robo' }, attribute) };
}

const ZUSTAND = { docked: 'Angedockt', cleaning: 'Reinigt', paused: 'Pausiert', returning: 'Kehrt zurück', idle: 'Untätig', error: 'Fehler', unavailable: 'Nicht verfügbar' };

/**
 * `states` (und optional `entities`/`services`) wie in HA. `rufe` sammelt jeden
 * callService-Aufruf; `antwort` bestimmt, was callService zurückgibt (Vorgabe:
 * offenes Versprechen wie ein langsamer Roboter).
 */
function neuesHaus({ states, entities = {}, services = {}, devices, sprache = 'de', user = { id: 'nutzer', name: 'Testnutzer', is_admin: true, is_owner: false }, basis = null } = {}) {
  states = Object.assign({ 'vacuum.robo': einfacherSauger() }, states);
  for (let i = 0; i < 50; i++) states['sensor.fremd_' + i] = { entity_id: 'sensor.fremd_' + i, state: String(i), attributes: {} };
  // `zusatz` sammelt je Aufruf die Argumente nach `data` (target, notifyOnError, …), M5.
  // `user` wie hass.user (M8); Vorgabe Admin, damit alle bisherigen Fälle unverändert gelten.
  const haus = { rufe: [], zusatz: [], antwort: () => new Promise(() => {}), sprache, entities, services, devices, user, basis };
  haus.hass = () => ({
    states: haus.states, entities: haus.entities, services: haus.services, devices: haus.devices, user: haus.user,
    language: haus.sprache, locale: { language: haus.sprache }, themes: {}, config: { unit_system: { length: 'km' } },
    // Wie HAs Formatierer: Zustände übersetzt, Zahl mit der Einheit der Entität.
    formatEntityState: (s, zustand = s.state) => (ZUSTAND[zustand] || zustand) + (s.attributes.unit_of_measurement ? ' ' + s.attributes.unit_of_measurement : ''),
    callService: (domain, service, data, ...rest) => { haus.rufe.push({ domain, service, data }); haus.zusatz.push(rest); return haus.antwort(domain, service, data); },
    // `basis` (M29): hass.hassUrl wie im Frontend; Vorgabe ohne, dann bleiben Pfade relativ wie bisher.
    ...(haus.basis ? { hassUrl: (pfad = '') => (/^https?:\/\//i.test(pfad) ? pfad : haus.basis + pfad) } : {}),
  });
  haus.states = states;
  /** Neuer Zustand wie von HA: neues states-Objekt, nur die genannten Einträge ersetzt. */
  haus.setze = (aenderungen) => { haus.states = Object.assign({}, haus.states, aenderungen); return haus.hass(); };
  /** Eine fremde Entität ändert sich (neues states-Objekt, eigene Einträge identisch). */
  haus.fremd = () => { const id = 'sensor.fremd_' + Math.floor(Math.random() * 50); return haus.setze({ [id]: { entity_id: id, state: String(Math.random()), attributes: {} } }); };
  return haus;
}

/** Haus aus einer Fixture unter tests/fixtures/ (voll, minimal, ohne-dock, ohne-karte). */
function hausAus(name, optionen = {}) {
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8'));
  return neuesHaus(Object.assign({ states: f.states, entities: f.entities, services: f.services }, optionen));
}

/** Karte bauen, ins Dokument hängen, hass setzen. */
function neueKarte(umgebung, haus, config = {}) {
  const karte = umgebung.document.createElement('busch-vacuum-card');
  karte.setConfig(Object.assign({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, config));
  umgebung.body.appendChild(karte);
  karte.hass = haus.hass();
  return karte;
}

/**
 * fetch wie im Browser für die Verlaufs-Endpunkte: `antwort(url)` liefert
 * `{ status, json }` (Vorgabe 404). Der Verlaufsdaten-Endpunkt antwortet mit
 * gzip und `Content-Encoding: gzip`; der Browser entpackt selbst — hier
 * ebenso aus echten gzip-Bytes. `abrufe` sammelt `{ url, signal }`.
 */
function verlaufsAbruf(umgebung, antwort = () => ({ status: 404 })) {
  const zlib = require('node:zlib');
  const abrufe = [];
  umgebung.kontext.AbortController = AbortController;
  umgebung.kontext.fetch = (url, optionen = {}) => {
    abrufe.push({ url, signal: optionen.signal || null });
    return Promise.resolve(antwort(url)).then((a) => {
      if (optionen.signal && optionen.signal.aborted) throw Object.assign(new Error('abgebrochen'), { name: 'AbortError' });
      const status = (a && a.status) || 200;
      const roh = a && a.json !== undefined ? zlib.gzipSync(Buffer.from(JSON.stringify(a.json))) : null;
      return { ok: status >= 200 && status < 300, status, headers: { get: (k) => (/encoding/i.test(k) && roh ? 'gzip' : null) },
        json: async () => JSON.parse(zlib.gunzipSync(roh).toString('utf8')) };
    });
  };
  return abrufe;
}

/** Alle Mikrotasks (Promise-Ketten) abarbeiten. */
const mikro = () => new Promise((r) => setImmediate(r));

module.exports = { neueUhr, neueUmgebung, neuesHaus, hausAus, neueKarte, einfacherSauger, mikro, verlaufsAbruf };
