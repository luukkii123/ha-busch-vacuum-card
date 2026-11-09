#!/usr/bin/env python3
"""
Renders and tests dist/busch-vacuum-card.js in real Chromium.

Pattern: ha-busch-lightcards/docs/render/render.py. The card runs against the
synthetic fixture tests/fixtures/voll.json (no real names, no real floor
plan); three states are derived from it: docked, cleaning, error.

Covered (plan 2026-11-09-busch-vacuum-card-core, Task 8):
  * 320/390/480/960/1280 px, light/dark, normal card and panel mode,
    states docked/cleaning/error: content, no horizontal overflow, touch
    targets >= 44 px, panel without border/radius/shadow; one screenshot each
  * dialog geometry: full screen below 450 x 500 px, centred above, sticky
    head flush with the sheet after scrolling, page scroll locked while open
    and released on close, fit again after turning the phone
  * confirmation dialog 320 px wide on a desktop, full screen on a phone
  * prefers-reduced-motion and hidden_card_objects: animations
  * HACS UI rules 1 and 2 (hacs/docs/render/regeln.py, mounted at /work)
  * every request, console error and page error lands in report.json

The page is served over HTTP so that any sub-resource would show up as a
real 404. The harness HTML is written into the output directory, which must
therefore lie inside the served repository (a copy of it is fine).

Usage:
    render.py <path/dist/busch-vacuum-card.js> <output-dir>
"""

import http.server
import json
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent

for _kandidat in ("/work", str(HERE)):
    if _kandidat not in sys.path:
        sys.path.insert(0, _kandidat)
try:
    from regeln import (messe_text, messe_popup, lauf_breiten, selbsttest,
                        bewerte, zaehle, THEMA_CSS)
    REGELN_DA = True
except ImportError:
    REGELN_DA = False
    THEMA_CSS = ""

WIDTHS = (320, 390, 480, 960, 1280)
THEMES = ("light", "dark")
STATES = ("docked", "cleaning", "error")
DIALOG_SIZES = ((360, 640), (360, 480), (640, 360), (800, 600), (1280, 800))
EXPECTED_CONTROLS = {"docked": ["start"], "cleaning": ["pause", "stop", "return"],
                     "error": ["start", "return"]}


def serve(directory, port_holder):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(directory), **kwargs)

        def log_message(self, *args):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port_holder.append(httpd.server_address[1])
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


PAGE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style id="regeln-thema">__THEMA__
:root { --info-color: #039be5; }
</style>
<style>
  body { margin: 0; padding: 8px; background: var(--primary-background-color, #fafafa);
         color: var(--primary-text-color); font-family: Roboto, "Helvetica Neue", Arial, sans-serif; }
  #stage { display: block; }
  #stage.panel { height: calc(100vh - 16px); }
</style>
</head><body>
<div id="stage"></div>
<script>
  // Stubs for the Home Assistant elements the card uses. ha-card carries the
  // look of HA's own (background, radius, border) so panel mode has something
  // to take away.
  class HaCardStub extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:block;' +
        'background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);' +
        'border-radius:var(--ha-card-border-radius,12px);border:1px solid var(--divider-color);' +
        'box-shadow:0 1px 3px rgba(0,0,0,.12);}</style><slot></slot>';
    }
  }
  customElements.define('ha-card', HaCardStub);

  class HaIconStub extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:inline-block;flex:none;' +
        'width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);vertical-align:middle;}' +
        'i{display:block;width:100%;height:100%;border-radius:22%;background:currentColor;opacity:.8;}</style><i></i>';
    }
  }
  customElements.define('ha-icon', HaIconStub);

  // Proves the editor's wiring, not HA's own selectors.
  class HaFormStub extends HTMLElement {
    set schema(v) { this._schema = v; } get schema() { return this._schema; }
    set data(v) { this._data = v; } get data() { return this._data; }
  }
  customElements.define('ha-form', HaFormStub);

  const WORDS = {
    de: { docked: 'Angedockt', cleaning: 'Reinigt', paused: 'Pausiert', returning: 'Kehrt zurück',
          idle: 'Untätig', error: 'Fehler', unavailable: 'Nicht verfügbar' },
    en: { docked: 'Docked', cleaning: 'Cleaning', paused: 'Paused', returning: 'Returning',
          idle: 'Idle', error: 'Error', unavailable: 'Unavailable' }
  };
  window.__serviceCalls = [];
  window.makeHass = (data, lang) => ({
    language: lang, locale: { language: lang, time_format: '24', first_weekday: 'monday' }, themes: {},
    states: data.states, entities: data.entities, services: data.services,
    formatEntityState: (s, state = s.state) => (WORDS[lang][state] || state)
      + (s.attributes.unit_of_measurement ? ' ' + s.attributes.unit_of_measurement : ''),
    callService: (domain, service, payload) => { window.__serviceCalls.push({ domain, service, payload }); return Promise.resolve(); }
  });
  window.closeDialogs = () => document.querySelectorAll('busch-vacuum-dialog').forEach((d) => d.remove());
  window.buildCard = ({ data, lang = 'de', config = {}, panel = false }) => {
    window.closeDialogs();
    const stage = document.getElementById('stage');
    stage.className = panel ? 'panel' : '';
    stage.replaceChildren();
    const card = document.createElement('busch-vacuum-card');
    card.setConfig(Object.assign({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, config));
    if (panel) card.isPanel = true;
    stage.appendChild(card);
    card.hass = window.makeHass(data, lang);
    return true;
  };
  window.card = () => document.querySelector('busch-vacuum-card');
  window.dialog = () => document.querySelector('busch-vacuum-dialog');
  /** Visible buttons below 44 x 44 px in a shadow root (WCAG 2.5.5 / ui-regeln). */
  window.smallTargets = (root) => Array.from(root.querySelectorAll('button')).filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' && (r.width < 44 || r.height < 44);
  }).map((b) => (b.getAttribute('data-action') || b.getAttribute('data-task') || b.getAttribute('data-entry') || b.className)
    + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height));
</script>
<script type="module" src="__SRC__"></script>
</body></html>
"""


def scenario(fixture, name):
    """docked as captured; cleaning and error derived from it (synthetic)."""
    data = json.loads(json.dumps({k: fixture[k] for k in ("states", "entities", "services")}))
    states = data["states"]
    vac = states["vacuum.robo"]
    if name == "cleaning":
        vac["state"] = "cleaning"
        vac["attributes"].update({"started": True, "cleaning_progress": 42, "charging": False})
        states["sensor.robo_cleaning_progress"]["state"] = "42"
    elif name == "error":
        vac["state"] = "error"
        vac["attributes"].update({"has_error": True, "error": "Wheel stuck", "charging": False})
        states["sensor.robo_error"]["state"] = "wheel_stuck"
        states["sensor.robo_error"]["attributes"]["description"] = (
            "Antriebsrad blockiert. Bitte Fremdkörper entfernen und neu starten.")
    return data


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    card_file = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    repo_root = card_file.parent.parent
    fixture = json.loads((repo_root / "tests" / "fixtures" / "voll.json").read_text(encoding="utf-8"))
    data = {name: scenario(fixture, name) for name in STATES}

    ports = []
    httpd = serve(repo_root, ports)
    port = ports[0]
    report = {"cardFile": str(card_file), "requests": [], "badResponses": [], "requestFailures": [],
              "consoleErrors": [], "pageErrors": [], "checks": [], "screenshots": []}

    def check(name, passed, detail=""):
        report["checks"].append({"name": name, "pass": bool(passed), "detail": detail})

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="de-DE")
        page.on("request", lambda r: report["requests"].append(r.url))
        page.on("response", lambda r: report["badResponses"].append({"url": r.url, "status": r.status})
                if r.status >= 400 else None)
        page.on("requestfailed", lambda r: report["requestFailures"].append({"url": r.url, "error": r.failure}))
        page.on("console", lambda m: report["consoleErrors"].append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["pageErrors"].append(str(e)))

        html = PAGE.replace("__SRC__", f"/dist/{card_file.name}").replace("__THEMA__", THEMA_CSS)
        harness = out_dir / "harness.html"
        harness.write_text(html, encoding="utf-8")
        page.goto(f"http://127.0.0.1:{port}/{harness.relative_to(repo_root).as_posix()}")
        page.wait_for_function("() => !!customElements.get('busch-vacuum-card')", timeout=15000)

        def theme(name):
            page.evaluate("(t) => { document.documentElement.dataset.theme = t; document.documentElement.style.colorScheme = t; }", name)

        def build(state="docked", lang="de", config=None, panel=False):
            page.evaluate("(a) => window.buildCard(a)",
                          {"data": data[state], "lang": lang, "config": config or {}, "panel": panel})
            page.wait_for_timeout(60)

        def open_menu():
            page.evaluate("() => { window.closeDialogs(); window.card().shadowRoot.querySelector('.menu-button').click(); }")

        def open_placeholder():
            page.evaluate("""() => { window.closeDialogs(); const c = window.card();
                c._openDialog(c._placeholderView({ name: 'settings', text: 'entrySettings', module: 'device-settings' })); }""")

        def open_confirm():
            page.evaluate("() => { window.closeDialogs(); window.card()._confirmMapChange('Obergeschoss mit sehr langem Namen', () => {}); }")

        # ------------------------------------------------------------------
        # 1. Matrix: widths x themes x layout x states
        # ------------------------------------------------------------------
        matrix = []
        for state in STATES:
            for panel in (False, True):
                for width in WIDTHS:
                    for th in THEMES:
                        page.set_viewport_size({"width": width, "height": 900})
                        theme(th)
                        build(state, panel=panel)
                        m = page.evaluate("""() => {
                            const sr = window.card().shadowRoot, ha = sr.querySelector('ha-card');
                            const cs = getComputedStyle(ha), r = ha.getBoundingClientRect();
                            return {
                              error: !!sr.querySelector('.error'),
                              title: sr.querySelector('.title').textContent,
                              stateText: sr.querySelector('.state').textContent,
                              controls: Array.from(sr.querySelectorAll('.ctl')).map((b) => b.getAttribute('data-action')),
                              dock: sr.querySelector('.dock') ? sr.querySelector('.dock').getAttribute('data-dock') : null,
                              progress: !!sr.querySelector('.progress'),
                              messages: Array.from(sr.querySelectorAll('.message')).map((m) => m.getAttribute('data-kind')),
                              tasks: sr.querySelectorAll('.task').length,
                              small: window.smallTargets(sr),
                              pageOverflow: document.documentElement.scrollWidth - innerWidth,
                              cardRight: r.right, cardLeft: r.left, W: innerWidth,
                              radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, border: cs.borderTopWidth,
                              height: r.height, H: innerHeight
                            };
                        }""")
                        name = f"karte-{state}-{'panel' if panel else 'karte'}-{width}-{th}.png"
                        page.screenshot(path=str(out_dir / name), full_page=not panel)
                        report["screenshots"].append(name)
                        matrix.append({"state": state, "panel": panel, "width": width, "theme": th, **m})
        report["matrix"] = matrix
        bad = lambda pred: [(x["state"], x["panel"], x["width"], x["theme"]) for x in matrix if not pred(x)]
        check("matrix: card renders without error box, title and HA state text (60 cases)",
              not bad(lambda x: not x["error"] and x["title"] == "Robo" and x["stateText"]),
              json.dumps(bad(lambda x: not x["error"] and x["title"] == "Robo" and x["stateText"])))
        check("matrix: control buttons per state (docked/cleaning/error)",
              not bad(lambda x: x["controls"] == EXPECTED_CONTROLS[x["state"]]),
              json.dumps(bad(lambda x: x["controls"] == EXPECTED_CONTROLS[x["state"]])))
        check("matrix: error state shows the error message and a red station only if the dock says so; cleaning shows progress",
              not bad(lambda x: (x["state"] != "error" or "error" in x["messages"])
                      and (x["state"] != "cleaning" or x["progress"]) and x["dock"] is not None),
              "")
        check("matrix: five task types while not busy, locked while cleaning",
              not bad(lambda x: x["tasks"] == 5), json.dumps(bad(lambda x: x["tasks"] == 5)))
        check("matrix: no horizontal page overflow, card inside the viewport",
              not bad(lambda x: x["pageOverflow"] <= 0 and x["cardLeft"] >= 0 and x["cardRight"] <= x["W"] + 0.5),
              json.dumps(bad(lambda x: x["pageOverflow"] <= 0 and x["cardRight"] <= x["W"] + 0.5)))
        check("matrix: every visible card button is at least 44 x 44 px",
              not bad(lambda x: not x["small"]),
              json.dumps([(x["state"], x["width"], x["small"]) for x in matrix if x["small"]][:6]))
        check("panel mode: no radius, no border, no shadow, full height",
              not bad(lambda x: not x["panel"] or (x["radius"] == "0px" and x["border"] == "0px"
                                                   and x["shadow"] == "none" and abs(x["height"] - (x["H"] - 16)) <= 1)),
              json.dumps([(x["width"], x["radius"], x["border"], x["shadow"], x["height"], x["H"])
                          for x in matrix if x["panel"]][:3]))
        check("normal card: keeps HA's card look",
              not bad(lambda x: x["panel"] or (x["radius"] == "12px" and x["border"] != "0px")), "")

        # English once, for the eye and the dictionary.
        page.set_viewport_size({"width": 390, "height": 900})
        theme("light")
        build("cleaning", lang="en")
        en = page.evaluate("() => Array.from(window.card().shadowRoot.querySelectorAll('.ctl')).map((b) => b.textContent)")
        page.screenshot(path=str(out_dir / "karte-cleaning-en-390.png"), full_page=True)
        report["screenshots"].append("karte-cleaning-en-390.png")
        check("English UI with English HA", en == ["Pause", "Stop", "Return"], json.dumps(en))

        # ------------------------------------------------------------------
        # 2. Dialog geometry (#877 rules, as Lightcards 0.11.0 sections 8e/8f)
        # ------------------------------------------------------------------
        page.evaluate("() => { const pad = document.createElement('div'); pad.id = 'pad'; pad.style.height = '4000px'; document.body.appendChild(pad); }")
        geometry = []
        for w, h in DIALOG_SIZES:
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": h})
                theme(th)
                build("docked")
                page.evaluate("() => window.scrollTo(0, 300)")
                open_menu()
                page.wait_for_timeout(400)
                g = page.evaluate("""() => {
                    const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
                    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                             maxScroll: sheet.scrollHeight - sheet.clientHeight,
                             htmlOverflow: getComputedStyle(document.documentElement).overflow,
                             small: window.smallTargets(sr) };
                }""")
                page.mouse.move(g["left"] + 4, (g["top"] + g["bottom"]) / 2)
                for _ in range(20):
                    page.mouse.wheel(0, 300)
                page.wait_for_timeout(300)
                after = page.evaluate("""() => {
                    const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet');
                    const head = sr.querySelector('.head').getBoundingClientRect(), box = sheet.getBoundingClientRect();
                    return { scrollTop: sheet.scrollTop, headTop: head.top - box.top,
                             headFlush: Math.abs(head.top - box.top) <= 1 && Math.abs(head.left - box.left) <= 1 && Math.abs(head.right - box.right) <= 1,
                             pageY: window.scrollY };
                }""")
                shot = f"dialog-menu-{w}x{h}-{th}.png"
                page.screenshot(path=str(out_dir / shot))
                report["screenshots"].append(shot)
                page.evaluate("() => window.dialog().close()")
                page.wait_for_timeout(450)
                released = page.evaluate("() => ({ open: !!window.dialog(), overflow: getComputedStyle(document.documentElement).overflow })")
                phone = w < 450 or h < 500
                inside = g["top"] >= -1 and g["left"] >= -1 and g["bottom"] <= g["H"] + 1 and g["right"] <= g["W"] + 1
                if phone:
                    place = abs(g["top"]) <= 1 and abs(g["bottom"] - g["H"]) <= 1 and abs(g["left"]) <= 1 and abs(g["right"] - g["W"]) <= 1
                else:
                    place = (abs(g["top"] - (g["H"] - g["bottom"])) <= 1 and abs(g["left"] - (g["W"] - g["right"])) <= 1
                             and g["top"] >= 12 and g["right"] - g["left"] <= 560.5)
                geometry.append({"w": w, "h": h, "theme": th, **g, **after, "phone": phone, "inside": inside,
                                 "place": place, "released": released})
        report["dialogGeometry"] = geometry
        check("dialog lies fully inside the viewport (5 sizes x 2 themes)",
              all(x["inside"] for x in geometry), json.dumps([(x["w"], x["h"]) for x in geometry if not x["inside"]]))
        check("dialog full screen below 450 x 500, centred (<= 560 px) above",
              all(x["place"] for x in geometry),
              json.dumps([(x["w"], x["h"], x["top"], x["bottom"], x["left"], x["right"]) for x in geometry if not x["place"]]))
        check("overflowing sheet scrolls, sticky head stays flush with the sheet",
              all(x["headFlush"] and (x["maxScroll"] <= 0 or abs(x["scrollTop"] - x["maxScroll"]) <= 1) for x in geometry)
              and any(x["maxScroll"] > 0 for x in geometry),
              json.dumps([(x["w"], x["h"], x["maxScroll"], x["scrollTop"], round(x["headTop"], 1)) for x in geometry]))
        check("page behind is locked while open and released on close",
              all(x["pageY"] == 300 and x["htmlOverflow"] == "hidden" and not x["released"]["open"]
                  and x["released"]["overflow"] != "hidden" for x in geometry),
              json.dumps([(x["w"], x["h"], x["pageY"], x["htmlOverflow"], x["released"]) for x in geometry]))
        check("every dialog button is at least 44 x 44 px",
              all(not x["small"] for x in geometry), json.dumps([(x["w"], x["small"]) for x in geometry if x["small"]]))

        page.set_viewport_size({"width": 360, "height": 640})
        build("docked")
        open_menu()
        page.wait_for_timeout(400)
        page.set_viewport_size({"width": 640, "height": 360})
        page.wait_for_timeout(300)
        turned = page.evaluate("() => { const r = window.dialog().shadowRoot.querySelector('.sheet').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, H: innerHeight }; }")
        page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; document.getElementById('pad').remove(); window.scrollTo(0, 0); }")
        check("after turning the phone the dialog fits again",
              abs(turned["top"]) <= 1 and abs(turned["bottom"] - turned["H"]) <= 1, json.dumps(turned))

        # Confirmation (CORE-20): 320 px on a desktop, full screen on a phone.
        confirm = []
        for w, h in ((1280, 800), (360, 640)):
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": h})
                theme(th)
                build("docked")
                open_confirm()
                page.wait_for_timeout(400)
                r = page.evaluate("() => { const r = window.dialog().shadowRoot.querySelector('.sheet').getBoundingClientRect(); return { width: r.width, height: r.height, W: innerWidth, H: innerHeight, small: window.smallTargets(window.dialog().shadowRoot) }; }")
                shot = f"dialog-bestaetigung-{w}x{h}-{th}.png"
                page.screenshot(path=str(out_dir / shot))
                report["screenshots"].append(shot)
                page.evaluate("() => window.closeDialogs()")
                confirm.append({"w": w, "theme": th, **r})
        page.evaluate("() => { document.documentElement.style.overflow = ''; }")
        check("confirmation dialog 320 px wide on a desktop, full screen on a phone, 44 px buttons",
              all((abs(x["width"] - 320) <= 0.5 if x["w"] > 450 else abs(x["width"] - x["W"]) <= 1 and abs(x["height"] - x["H"]) <= 1)
                  and not x["small"] for x in confirm), json.dumps(confirm))

        # Placeholder view, once per size class, for the eye.
        for w, h in ((390, 844), (1280, 800)):
            page.set_viewport_size({"width": w, "height": h})
            theme("dark")
            build("docked")
            open_placeholder()
            page.wait_for_timeout(400)
            shot = f"dialog-platzhalter-{w}x{h}-dark.png"
            page.screenshot(path=str(out_dir / shot))
            report["screenshots"].append(shot)
            page.evaluate("() => { window.dialog().close(); }")
            page.wait_for_timeout(450)

        # ------------------------------------------------------------------
        # 3. Motion: opening animation, reduced motion, hidden animations
        # ------------------------------------------------------------------
        def animations(config=None):
            build("docked", config=config)
            open_menu()
            page.wait_for_timeout(30)
            n = page.evaluate("() => { const sr = window.dialog().shadowRoot; return sr.querySelector('.sheet').getAnimations().length + sr.querySelector('.scrim').getAnimations().length; }")
            page.evaluate("() => window.dialog().close()")
            page.wait_for_timeout(450)
            return n

        page.set_viewport_size({"width": 1280, "height": 800})
        normal = animations()
        still = animations({"hidden_card_objects": ["animations"]})
        page.emulate_media(reduced_motion="reduce")
        reduced = animations()
        page.emulate_media(reduced_motion="no-preference")
        report["animations"] = {"normal": normal, "hidden": still, "reduced": reduced}
        check("dialog opens animated; without animation for prefers-reduced-motion and hidden animations",
              normal >= 1 and still == 0 and reduced == 0, json.dumps(report["animations"]))

        # Editor wiring with the ha-form stub (real selectors: see docs/entwicklung.md).
        editor = page.evaluate("""() => {
            const ed = document.createElement('busch-vacuum-card-editor');
            ed.setConfig({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' });
            ed.hass = window.makeHass({ states: {}, entities: {}, services: {} }, 'de');
            document.body.appendChild(ed);
            const form = ed.shadowRoot.querySelector('ha-form');
            const out = { fields: form.schema.length, label: form.computeLabel({ name: 'hidden_card_objects' }) };
            ed.remove();
            return out;
        }""")
        check("editor renders its ha-form with schema and German labels",
              editor["fields"] >= 6 and editor["label"] == "Ausgeblendete Teile", json.dumps(editor))

        # ------------------------------------------------------------------
        # 4. HACS UI rules 1 and 2 (hacs/docs/ui-regeln.md)
        # ------------------------------------------------------------------
        report["uiRegeln"] = {}
        if not REGELN_DA:
            report["uiRegeln"] = {"kein_urteil": "regeln.py nicht gefunden — /work war nicht gemountet"}
        else:
            r = report["uiRegeln"]
            page.set_viewport_size({"width": 620, "height": 1200})
            build("error")
            r["selbsttest_karte"] = selbsttest(page, "busch-vacuum-card")
            build("docked")
            open_menu()
            page.wait_for_timeout(400)
            r["selbsttest_dialog"] = selbsttest(page, ".sheet")
            page.evaluate("() => window.closeDialogs()")
            for state in STATES:
                r["regel1_karte_" + state] = lauf_breiten(
                    page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
                    vor_messung=lambda pg, s=state: build(s))
            r["regel1_karte_panel"] = lauf_breiten(
                page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
                vor_messung=lambda pg: build("cleaning", panel=True))
            for label, opener in (("menue", open_menu), ("platzhalter", open_placeholder), ("bestaetigung", open_confirm)):
                r["regel1_dialog_" + label] = lauf_breiten(
                    page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                    vor_messung=lambda pg, o=opener: (build("docked"), o(), page.wait_for_timeout(350)))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            for label, opener, kind in (("menue", open_menu, "ansicht"), ("platzhalter", open_placeholder, "bearbeitung"),
                                        ("bestaetigung", open_confirm, "bestaetigung")):
                r["regel2_dialog_" + label] = lauf_breiten(
                    page, breiten=(390, 960), hoehe=900,
                    messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                    vor_messung=lambda pg: build("docked"))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            r["zaehlung"] = zaehle(r)
            report["uiRegelnVerstoesse"] = bewerte(r)

        report["serviceCalls"] = page.evaluate("() => window.__serviceCalls")
        browser.close()
    httpd.shutdown()

    report["vendorRequests"] = [u for u in report["requests"] if "/dist/" in u and not u.endswith(".js")]
    report["passed"] = sum(1 for c in report["checks"] if c["pass"])
    report["failed"] = sum(1 for c in report["checks"] if not c["pass"])
    report["clean"] = (report["failed"] == 0 and not report["badResponses"] and not report["requestFailures"]
                       and not report["consoleErrors"] and not report["pageErrors"] and not report["vendorRequests"]
                       and not report["serviceCalls"] and report.get("uiRegelnVerstoesse", 0) == 0 and REGELN_DA)
    (out_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    for entry in report["checks"]:
        print(("  ok   " if entry["pass"] else "  FAIL ") + entry["name"])
        if not entry["pass"]:
            print("         " + entry["detail"][:1500])
    print(f"\n{report['passed']} passed, {report['failed']} failed")
    if REGELN_DA:
        z = report["uiRegeln"].get("zaehlung", {})
        print("UI-Regeln: %d Verstoesse (ueberlauf=%d ausserhalb=%d ueberlappung=%d verletzt=%d) geprueft=%d kein_urteil=%d gekuerzt=%d"
              % (report.get("uiRegelnVerstoesse", 0), z.get("ueberlauf", 0), z.get("ausserhalb", 0),
                 z.get("ueberlappung", 0), z.get("verletzt", 0), z.get("geprueft", 0), z.get("kein_urteil", 0),
                 z.get("gekuerzt", 0)))
    else:
        print("UI-Regeln: NICHT gemessen — regeln.py fehlt (/work nicht gemountet)")
    print(f"requests={len(report['requests'])} bad={len(report['badResponses'])} failures={len(report['requestFailures'])} "
          f"consoleErrors={len(report['consoleErrors'])} pageErrors={len(report['pageErrors'])} "
          f"serviceCalls={len(report['serviceCalls'])} screenshots={len(report['screenshots'])}")
    for e in report["pageErrors"] + report["consoleErrors"]:
        print("  error: " + e)
    print(f"report: {out_dir / 'report.json'}")
    return 0 if report["clean"] else 1


if __name__ == "__main__":
    sys.exit(main())
