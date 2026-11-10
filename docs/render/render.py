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
  * map-view (plan 2026-11-10-busch-vacuum-card-map-view, Task 12): the
    camera endpoints are answered by Playwright routes with a SYNTHETIC map
    image (SVG) and SYNTHETIC map data built from the anonymised fixture
    rooms (same rule as tests/kartendaten.js) -- never a real floor plan.
    Data mode and image fallback, overlays on the expected pixels, zoom
    buttons/keys/wheel, lock, motion, obstacle bubble and dialog, map info,
    floor choice, touch targets, no foreign requests, a lab timing

The page is served over HTTP so that any sub-resource would show up as a
real 404. The harness HTML is written into the output directory, which must
therefore lie inside the served repository (a copy of it is fine).

Usage:
    render.py <path/dist/busch-vacuum-card.js> <output-dir>
"""

import http.server
import json
import math
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


def affine(cal):
    """Robot mm -> image px from three calibration pairs (as the card's affineFrom)."""
    (x0, y0), (x1, y1), (x2, y2) = [(c["vacuum"]["x"], c["vacuum"]["y"]) for c in cal[:3]]
    xs = [c["map"]["x"] for c in cal[:3]]
    ys = [c["map"]["y"] for c in cal[:3]]
    det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1)

    def solve(v):
        return ((v[0] * (y1 - y2) + v[1] * (y2 - y0) + v[2] * (y0 - y1)) / det,
                (v[0] * (x2 - x1) + v[1] * (x0 - x2) + v[2] * (x1 - x0)) / det,
                (v[0] * (x1 * y2 - x2 * y1) + v[1] * (x2 * y0 - x0 * y2) + v[2] * (x0 * y1 - x1 * y0)) / det)
    a, c, e = solve(xs)
    b, d, f = solve(ys)
    return lambda x, y: (a * x + c * y + e, b * x + d * y + f)


def synthetic_map_data(rooms, grid_size=50, frame_id=1):
    """Map data like /api/camera_map_data_proxy from the anonymised room rectangles:
    each cell belongs to the nearest centre among the rectangles holding it, wall ring around."""
    rs = [r for r in rooms.values() if "x0" in r]
    left = (min(r["x0"] for r in rs) // grid_size) * grid_size - 2 * grid_size
    top = (min(r["y0"] for r in rs) // grid_size) * grid_size - 2 * grid_size
    w = math.ceil((max(r["x1"] for r in rs) - left) / grid_size) + 2
    h = math.ceil((max(r["y1"] for r in rs) - top) / grid_size) + 2
    cells = [0] * (w * h)
    for gy in range(h):
        for gx in range(w):
            x, y = left + (gx + 0.5) * grid_size, top + (gy + 0.5) * grid_size
            best, dist = 0, float("inf")
            for r in rs:
                if r["x0"] <= x <= r["x1"] and r["y0"] <= y <= r["y1"]:
                    d = (x - r["x"]) ** 2 + (y - r["y"]) ** 2
                    if d < dist:
                        best, dist = r["room_id"], d
            cells[gy * w + gx] = best
    wall = cells[:]
    for gy in range(h):
        for gx in range(w):
            if not cells[gy * w + gx] and any(0 <= gx + dx < w and 0 <= gy + dy < h and 0 < cells[(gy + dy) * w + gx + dx] < 200
                                              for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                wall[gy * w + gx] = 255
    data = {}
    for y in range(h):
        x = 0
        while x < w:
            v, n = wall[y * w + x], 1
            while x + n < w and wall[y * w + x + n] == v:
                n += 1
            if v:
                data.setdefault(str(v), []).extend([x, y, n])
            x += n
    first = rs[0]["room_id"]
    data["512"] = [v for gy in range(h) for gx in range(0, w, 2) if wall[gy * w + gx] == first for v in (gx, gy, 1)]
    return {"size": [left, top, left, top, w, h, grid_size, 0, [0, 0, 0, 0], None], "data": data,
            "frame_id": frame_id, "map_id": 2, "map_index": 1, "empty_map": False, "temporary_map": False,
            "segments": [[r["room_id"], r["x"], r["y"]] for r in rs],
            "path": [[1] + [v for r in rs[:3] for v in (r["x"], r["y"])]],
            "predefined_points": [[rs[1]["x"] + 300, rs[1]["y"] + 300]]}


def synthetic_map_svg(cam_attrs, grid):
    """The integration's map picture, imitated: the synthetic grid drawn through the calibration."""
    to_img = affine(cam_attrs["calibration_points"])
    left, top, _, _, w, h, g = grid["size"][:7]
    corners = [to_img(left, top), to_img(left + w * g, top + h * g)]
    width, height = int(max(p[0] for p in corners)) + 20, int(max(p[1] for p in corners)) + 20
    colours = ["#b3d4f5", "#c8e6c9", "#ffe0b2", "#e1bee7", "#f8bbd0", "#d7ccc8", "#fff9c4", "#b2dfdb"]
    rects = []
    for key, runs in grid["data"].items():
        if key == "512":
            continue
        fill = "#555555" if key == "255" else colours[int(key) % len(colours)]
        for i in range(0, len(runs), 3):
            x, y, n = runs[i:i + 3]
            ax, ay = to_img(left + x * g, top + y * g)
            bx, by = to_img(left + (x + n) * g, top + (y + 1) * g)
            rects.append(f'<rect x="{min(ax, bx):.1f}" y="{min(ay, by):.1f}" width="{abs(bx - ax):.1f}" height="{abs(by - ay):.1f}" fill="{fill}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
            f'<rect width="100%" height="100%" fill="#f0f0f0"/>' + "".join(rects) + "</svg>"), (width, height)


OBSTACLE_PHOTO = ('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#cfd8dc"/>'
                  '<circle cx="160" cy="120" r="60" fill="#90a4ae"/></svg>')
CAMERA_ROUTES = ("/api/camera_proxy/", "/api/camera_map_data_proxy/", "/api/camera_map_obstacle_proxy/")


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
    # One obstacle with a photo, so the obstacle dialog shows the picture path.
    states["camera.robo_map"]["attributes"]["obstacles"]["2"]["picture_status"] = "Uploaded"
    if name == "cleaning":
        vac["state"] = "cleaning"
        vac["attributes"].update({"started": True, "cleaning_progress": 42, "charging": False})
        states["sensor.robo_cleaning_progress"]["state"] = "42"
    elif name == "floors":
        # Two floors: a second saved-map camera with its own picture (synthetic, like the first).
        maps = [{"id": 3, "index": 1, "name": "Karte 1", "custom_name": "Erdgeschoss"},
                {"id": 7, "index": 2, "name": "Karte 2", "custom_name": None}]
        vac["attributes"].update({"maps": maps, "map_count": 2, "selected_map": "Erdgeschoss"})
        second = json.loads(json.dumps(states["camera.robo_map_1"]))
        second["entity_id"] = "camera.robo_map_2"
        second["attributes"].update({"map_index": 2, "map_id": 7, "selected": False,
                                     "entity_picture": "/api/camera_proxy/camera.robo_map_2?token=testtoken&v=9"})
        states["camera.robo_map_2"] = second
        data["entities"]["camera.robo_map_2"] = dict(data["entities"]["camera.robo_map_1"], entity_id="camera.robo_map_2", translation_key="map_2")
    elif name == "settings":
        # device-settings: synthetic periods, schedules, two maps and a worn part, so every list has content.
        vac["attributes"].update({
            "dnd": [{"id": 0, "enabled": True, "start": "20:00", "end": "09:00", "repeats": 127, "ss": 0},
                    {"id": 3, "enabled": False, "start": "12:00", "end": "13:00", "repeats": 62, "ss": 5}],
            "schedule": [{"id": 1, "enabled": True, "invalid": False, "time": "09:30", "repeats": "0000000", "once": True, "map_id": "3",
                          "suction_level": 0, "water_volume": 146, "options": None},
                         {"id": 4, "enabled": False, "invalid": False, "time": "18:00", "repeats": "0111110", "once": False, "map_id": "3",
                          "suction_level": 2, "water_volume": 2, "options": None}],
            "maps": [{"id": 3, "index": 1, "name": "Karte 1", "custom_name": None}, {"id": 7, "index": 2, "name": "Karte 2", "custom_name": None}],
            "map_count": 2, "filter_left": 21})
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
    data = {name: scenario(fixture, name) for name in STATES + ("floors", "settings")}
    cam = fixture["states"]["camera.robo_map"]["attributes"]
    grid = synthetic_map_data(cam["rooms"], frame_id=cam["frame_id"])
    svg, svg_size = synthetic_map_svg(cam, grid)
    routing = {"data": True}

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

        def camera_route(route):
            url = route.request.url
            if "/api/camera_map_data_proxy/" in url:
                body = grid if routing["data"] else {"empty_map": True, "size": [0, 0, 0, 0, 1, 1, 0, 0, [0, 0, 0, 0]]}
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
            if "/api/camera_map_obstacle_proxy/" in url:
                return route.fulfill(status=200, content_type="image/svg+xml", body=OBSTACLE_PHOTO)
            return route.fulfill(status=200, content_type="image/svg+xml", body=svg)
        page.route("**/api/camera_*proxy/**", camera_route)

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
                              height: r.height, H: innerHeight,
                              map: (() => {
                                const m = window.card()._map;
                                if (!m) return null;
                                const pos = window.card().hass.states['camera.robo_map'].attributes.vacuum_position;
                                const want = m.toScreen(m.toImage(pos));
                                const node = sr.querySelector('[data-layer=robot] [data-object]');
                                const b = node ? node.getBoundingClientRect() : null;
                                const stage = sr.querySelector('.map-stage').getBoundingClientRect();
                                return { mode: m.current().mode, base: sr.querySelector('.map-base') && sr.querySelector('.map-base').tagName,
                                         notes: Array.from(sr.querySelectorAll('.map-note')).map((n) => n.dataset.kind),
                                         robotOff: b && want ? Math.hypot(b.left + b.width / 2 - want.x, b.top + b.height / 2 - want.y) : null,
                                         chips: sr.querySelectorAll('.room-chip').length, stageW: stage.width, stageH: stage.height,
                                         stageInside: stage.left >= r.left - 0.5 && stage.right <= r.right + 0.5 };
                              })()
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
        check("map: data mode with canvas, 7 room chips, no state notes, stage inside the card (60 cases)",
              not bad(lambda x: x["map"] and x["map"]["mode"] == "data" and x["map"]["base"] == "CANVAS" and not x["map"]["notes"]
                      and x["map"]["chips"] == 7 and x["map"]["stageInside"] and x["map"]["stageW"] > 100 and x["map"]["stageH"] > 100),
              json.dumps([(x["state"], x["panel"], x["width"], x["map"]) for x in matrix
                          if not (x["map"] and x["map"]["mode"] == "data" and x["map"]["base"] == "CANVAS")][:4]))
        check("map: robot symbol on its position (within 1.5 px, 60 cases)",
              not bad(lambda x: x["map"] and x["map"]["robotOff"] is not None and x["map"]["robotOff"] <= 1.5),
              json.dumps([(x["state"], x["width"], x["map"]["robotOff"]) for x in matrix if x["map"]][:6]))
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
        # 3b. Map view (map-view Task 12)
        # ------------------------------------------------------------------
        def shot(name):
            page.screenshot(path=str(out_dir / name))
            report["screenshots"].append(name)

        def map_eval(js):
            return page.evaluate("() => { const c = window.card(), m = c._map, sr = c.shadowRoot; " + js + " }")

        # Image fallback: overlays on the calibration's pixels.
        routing["data"] = False
        page.set_viewport_size({"width": 390, "height": 844})
        theme("light")
        image_data = json.loads(json.dumps(data["docked"]))
        image_data["states"]["camera.robo_map"]["attributes"]["vacuum_position"] = {"x": 1000, "y": 0, "a": 0}
        page.evaluate("(a) => window.buildCard(a)", {"data": image_data, "lang": "de", "config": {}, "panel": False})
        page.wait_for_timeout(400)
        cal = cam["calibration_points"][1]["map"]
        img = map_eval("""const node = sr.querySelector('[data-layer=robot] [data-object]').getBoundingClientRect();
            const want = m.toScreen({ x: %d, y: %d }); const base = sr.querySelector('.map-base');
            return { mode: m.current().mode, tag: base.tagName, natural: [base.naturalWidth, base.naturalHeight],
                     image: m.toImage({ x: 1000, y: 0 }), off: Math.hypot(node.left + node.width / 2 - want.x, node.top + node.height / 2 - want.y) };""" % (cal["x"], cal["y"]))
        shot("karte-bildmodus-390-light.png")
        check("map image fallback: picture of the camera, robot on calibration point (1000, 0) mm -> (%d, %d) px" % (cal["x"], cal["y"]),
              img["mode"] == "image" and img["tag"] == "IMG" and img["natural"] == list(svg_size)
              and abs(img["image"]["x"] - cal["x"]) < 0.01 and abs(img["image"]["y"] - cal["y"]) < 0.01 and img["off"] <= 1.5,
              json.dumps(img))
        routing["data"] = True

        # Zoom: buttons, keyboard, wheel; lock; motion.
        page.set_viewport_size({"width": 1280, "height": 900})
        build("docked")
        page.wait_for_timeout(300)
        z = map_eval("""const k0 = m._view.a; sr.querySelector('[data-action=map-zoom-in]').click();
            const k1 = m._view.a, z1 = m._zoom, transition = getComputedStyle(m.pan).transitionDuration; m.region.focus();
            m.region.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
            const z2 = m._zoom; sr.querySelector('[data-action=map-fit]').click();
            const s = sr.querySelector('.map-stage').getBoundingClientRect();
            m.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, clientX: s.left + 40, clientY: s.top + 40, bubbles: true, cancelable: true }));
            return { ratio: k1 / k0, z1, z2, wheel: m._zoom, transition, wheelTransition: getComputedStyle(m.pan).transitionDuration };""")
        page.wait_for_timeout(300)
        shot("karte-zoom-1280-light.png")
        check("map zoom: button x2 animated (transform doubles), key + x4, wheel zooms directly",
              abs(z["ratio"] - 2) < 1e-6 and z["z1"] == 2 and z["z2"] == 4 and z["wheel"] > 1 and z["transition"] != "0s"
              and z["wheelTransition"] == "0s", json.dumps(z))
        build("docked", config={"locked": "always"})
        lock = map_eval("""return { touch: getComputedStyle(sr.querySelector('.map-stage')).touchAction,
            disabled: Array.from(sr.querySelectorAll('[data-action=map-zoom-in],[data-action=map-zoom-out],[data-action=map-fit]')).every((b) => b.disabled),
            info: !sr.querySelector('[data-action=map-info]').disabled };""")
        check("map locked: touch-action pan-y, zoom buttons disabled, info stays usable", lock["touch"] == "pan-y" and lock["disabled"] and lock["info"], json.dumps(lock))
        build("docked", config={"hidden_card_objects": ["animations"]})
        still = map_eval("sr.querySelector('[data-action=map-zoom-in]').click(); return getComputedStyle(m.pan).transitionDuration;")
        page.emulate_media(reduced_motion="reduce")
        build("docked")
        reduced_map = map_eval("sr.querySelector('[data-action=map-zoom-in]').click(); return getComputedStyle(m.pan).transitionDuration;")
        page.emulate_media(reduced_motion="no-preference")
        check("map motion: no transition with hidden animations and reduced motion", still == "0s" and reduced_map == "0s",
              json.dumps([still, reduced_map]))

        # Colour schemes and icon sets, for the eye.
        for label, config in (("dunkel", {"color_scheme": "dark"}), ("grau", {"color_scheme": "grey"}),
                              ("grundriss", {"map_display": "floor_plan"}), ("material", {"icon_set": "material"})):
            page.set_viewport_size({"width": 390, "height": 844})
            theme("dark" if label == "dunkel" else "light")
            build("cleaning", config=config)
            page.wait_for_timeout(300)
            page.screenshot(path=str(out_dir / f"karte-{label}-390.png"), full_page=True)
            report["screenshots"].append(f"karte-{label}-390.png")

        # Obstacle bubble and dialog, map info, floors.
        def open_obstacle():
            page.evaluate("""() => { window.closeDialogs(); const m = window.card()._map;
                const o = window.card().hass.states['camera.robo_map'].attributes.obstacles['2'];
                const s = m.toScreen(m.toImage(o)); m._emitTap(s);
                window.card().shadowRoot.querySelector('[data-action=obstacle-details]').click(); }""")

        def open_info():
            page.evaluate("() => { window.closeDialogs(); window.card().shadowRoot.querySelector('[data-action=map-info]').click(); }")

        def open_floors():
            page.evaluate("() => { window.closeDialogs(); window.card().shadowRoot.querySelector('[data-action=map-floors]').click(); }")

        dialogs = []
        for w, h in ((390, 844), (1280, 800)):
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": h})
                theme(th)
                build("docked")
                page.wait_for_timeout(250)
                bubble = map_eval("""const o = c.hass.states['camera.robo_map'].attributes.obstacles['2'];
                    m._emitTap(m.toScreen(m.toImage(o))); const b = sr.querySelector('.map-bubble').getBoundingClientRect();
                    const st = sr.querySelector('.map-stage').getBoundingClientRect();
                    const tools = sr.querySelector('.map-tools').getBoundingClientRect();
                    return { shown: !sr.querySelector('.map-bubble').hidden, inside: b.left >= st.left - 0.5 && b.right <= st.right + 0.5
                             && (b.right <= tools.left + 0.5 || b.left >= tools.right - 0.5 || b.bottom <= tools.top || b.top >= tools.bottom),
                             small: window.smallTargets(sr) };""")
                shot(f"karte-blase-{w}-{th}.png")
                for label, opener, state in (("hindernis", open_obstacle, "docked"), ("info", open_info, "docked"), ("stockwerk", open_floors, "floors")):
                    build(state)
                    page.wait_for_timeout(250)
                    opener()
                    page.wait_for_timeout(400)
                    g = page.evaluate("""() => { const d = window.dialog(); if (!d) return null; const sr = d.shadowRoot, r = sr.querySelector('.sheet').getBoundingClientRect();
                        return { title: sr.querySelector('h1').textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                                 photo: !!sr.querySelector('.obstacle-photo'), previews: sr.querySelectorAll('.floor-preview').length,
                                 photoLoaded: sr.querySelector('.obstacle-photo') ? sr.querySelector('.obstacle-photo').naturalWidth : null,
                                 small: window.smallTargets(sr) }; }""")
                    shot(f"dialog-{label}-{w}x{h}-{th}.png")
                    page.evaluate("() => window.closeDialogs()")
                    page.evaluate("() => { document.documentElement.style.overflow = ''; }")
                    dialogs.append({"label": label, "w": w, "theme": th, "bubble": bubble, **(g or {"missing": True})})
        report["mapDialogs"] = dialogs
        ok_geo = lambda x: not x.get("missing") and ((x["w"] < 450 and abs(x["top"]) <= 1 and abs(x["bottom"] - x["H"]) <= 1)
                                                     or (x["w"] >= 450 and x["right"] - x["left"] <= 560.5 and x["top"] >= 12))
        check("map dialogs obstacle/info/floor: open, full screen on a phone, centred <= 560 px above, 44 px buttons",
              all(ok_geo(x) and not x["small"] for x in dialogs), json.dumps([x for x in dialogs if not (ok_geo(x) and not x["small"])][:3]))
        check("obstacle dialog with photo (route answered), floor dialog with two previews, titles",
              all((x["label"] != "hindernis" or (x["photo"] and x["photoLoaded"] == 320 and x["title"] == "Hindernis"))
                  and (x["label"] != "stockwerk" or (x["previews"] == 2 and x["title"] == "Stockwerk wählen"))
                  and (x["label"] != "info" or x["title"] == "Karteninfo") for x in dialogs), json.dumps(dialogs[:3]))
        check("obstacle bubble opens inside the map, clear of the zoom buttons, 44 px buttons",
              all(x["bubble"]["shown"] and x["bubble"]["inside"] and not x["bubble"]["small"] for x in dialogs), json.dumps([x["bubble"] for x in dialogs][:2]))

        # Lab timing (not a field value, R20): update with a moved robot, phone profile with 4x CPU throttling.
        page.set_viewport_size({"width": 390, "height": 844})
        build("cleaning")
        page.wait_for_timeout(300)
        timing_js = """(n) => { const c = window.card(), base = c.hass; const t = [];
            for (let i = 0; i < n; i++) { const st = Object.assign({}, base.states); const cam = st['camera.robo_map'];
              st['camera.robo_map'] = Object.assign({}, cam, { attributes: Object.assign({}, cam.attributes, { vacuum_position: { x: i * 10, y: -i * 10, a: i } }) });
              const h = Object.assign({}, base, { states: st }); const t0 = performance.now(); c.hass = h; t.push(performance.now() - t0); }
            t.sort((a, b) => a - b); return { median: t[Math.floor(n / 2)], max: t[n - 1] }; }"""
        desktop = page.evaluate(timing_js, 30)
        cdp = page.context.new_cdp_session(page)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        phone = page.evaluate(timing_js, 30)
        long_tasks = page.evaluate("""async () => { const seen = []; const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => seen.push(e.duration)));
            obs.observe({ type: 'longtask', buffered: false }); const m = window.card()._map; const s = m.stage.getBoundingClientRect();
            for (let i = 0; i < 12; i++) { m.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: i < 6 ? -120 : 120, clientX: s.left + s.width / 2, clientY: s.top + s.height / 2, bubbles: true, cancelable: true }));
              await new Promise((r) => requestAnimationFrame(r)); }
            await new Promise((r) => setTimeout(r, 300)); obs.disconnect(); return seen; }""")
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
        report["timing"] = {"robotUpdateDesktopMs": desktop, "robotUpdatePhone4xMs": phone, "zoomLongTasksMs": long_tasks}
        check("lab timing: robot update <= 16 ms script (desktop median), zoom without long tasks > 50 ms (4x CPU)",
              desktop["median"] <= 16 and not [d for d in long_tasks if d > 50], json.dumps(report["timing"]))

        # ------------------------------------------------------------------
        # 3c. Device settings (device-settings Task 11): overview, every group,
        #     search, forms, confirmations — geometry, touch targets, overflow
        # ------------------------------------------------------------------
        settings_open = """(steps) => { window.closeDialogs(); const c = window.card(); const I = customElements.get('busch-vacuum-card').__internals;
            c._openDialog(I.MODULE_VIEWS.settings(c)); const sr = () => window.dialog().shadowRoot;
            for (const [sel, value] of steps) { const n = sr().querySelector(sel); if (!n) return 'missing ' + sel;
              if (value == null) n.click(); else { n.value = value; n.dispatchEvent(new Event(n.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); } }
            return sr().querySelector('h1').textContent; }"""
        settings_views = [("uebersicht", [])]
        settings_views += [("gruppe-" + g, [(f"[data-group={g}]", None)]) for g in
                           ("cleaning", "mopping", "carpet", "station", "camera", "audio", "dnd", "schedule", "battery", "consumables", "info", "other")]
        settings_views += [
            ("suche", [(".settings-search", "carpet")]),
            ("suche-leer", [(".settings-search", "xyz")]),
            ("dnd-formular", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None)]),
            ("dnd-fehler", [("[data-group=dnd]", None), ("[data-action=dnd-add]", None), ("[data-day='1']", None), ("[data-day='2']", None),
                            ("[data-day='3']", None), ("[data-day='4']", None), ("[data-day='5']", None), ("[data-day='6']", None), ("[data-day='0']", None), ("[data-action=save]", None)]),
            ("dnd-loeschen", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None), ("[data-action=delete]", None)]),
            ("zeitplan-formular", [("[data-group=schedule]", None), ("[data-action=schedule-edit]", None)]),
            ("sprachpaket-fehler", [("[data-group=audio]", None), ("[data-action=voice-pack]", None), ("[data-action=submit]", None)]),
            ("zubehoer-zuruecksetzen", [("[data-group=consumables]", None), ("[data-part=filter] [data-action=reset]", None)]),
            ("rotation-bestaetigen", [("[data-group=other]", None), ("[data-setting=map_rotation] select", "90")]),
        ]
        settings_geo = []
        for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": h})
                theme(th)
                for label, steps in settings_views:
                    build("settings")
                    page.wait_for_timeout(150)
                    title = page.evaluate(settings_open, steps)
                    # The opening animation runs 0.3 s; measure after it settled.
                    page.wait_for_timeout(550)
                    g = page.evaluate("""() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
                        const fields = Array.from(sr.querySelectorAll('select, input')).filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44).length;
                        return { kind: sheet.getAttribute('data-kind'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                                 overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr), smallFields: fields,
                                 rows: sr.querySelectorAll('.setting').length, errors: Array.from(sr.querySelectorAll('.field-error')).filter((e) => e.textContent).length }; }""")
                    if (w, th) in ((360, "light"), (1280, "dark")):
                        shot(f"einstellungen-{label}-{w}x{h}-{th}.png")
                    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                    settings_geo.append({"label": label, "w": w, "h": h, "theme": th, "title": title, **g})
        report["settingsDialogs"] = settings_geo
        inside = lambda x: x["top"] >= -0.5 and x["bottom"] <= x["H"] + 0.5 and x["left"] >= -0.5 and x["right"] <= x["W"] + 0.5
        bad = [x for x in settings_geo if not inside(x) or x["small"] or x["smallFields"] or x["overflowX"] > 1 or str(x["title"]).startswith("missing")]
        check("device settings: 23 views x 4 sizes x 2 themes inside the viewport, no sideways overflow, 44 px buttons and fields",
              not bad, json.dumps(bad[:4]))
        by = {x["label"]: x for x in settings_geo if x["w"] == 390 and x["theme"] == "light"}
        check("device settings: titles, rows and states as expected (search hits, inline errors, confirmations narrow)",
              by["uebersicht"]["title"] == "Geräteeinstellungen" and by["gruppe-carpet"]["rows"] == 7 and by["suche"]["rows"] >= 7
              and by["suche-leer"]["rows"] == 0 and by["dnd-fehler"]["errors"] == 1 and by["sprachpaket-fehler"]["errors"] == 4
              and all(by[k]["kind"] == "confirm" for k in ("dnd-loeschen", "zubehoer-zuruecksetzen", "rotation-bestaetigen"))
              and by["gruppe-station"]["title"] == "Station" and by["gruppe-info"]["rows"] >= 8,
              json.dumps({k: {"title": v["title"], "rows": v["rows"], "errors": v["errors"], "kind": v["kind"]} for k, v in by.items()}))

        # ------------------------------------------------------------------
        # 3d. Station (dock Task 4): dock button, menu, every tab, confirmation,
        #     keyboard — geometry, touch targets, overflow, no service call
        # ------------------------------------------------------------------
        dock_open = """(steps) => { window.closeDialogs(); try { localStorage.clear(); } catch (e) {}
            const knopf = window.card().shadowRoot.querySelector('.dock'); if (!knopf) return 'missing .dock'; knopf.click();
            const sr = () => window.dialog().shadowRoot;
            for (const sel of steps) { const n = sr().querySelector(sel); if (!n) return 'missing ' + sel; n.click(); }
            return sr().querySelector('h1').textContent; }"""
        einstellungen = "[data-station-action=settings]"
        dock_views = [
            ("menue", []),
            ("waschen", [einstellungen]),
            ("trocknen", [einstellungen, "[data-tab=dry]"]),
            ("entleeren", [einstellungen, "[data-tab=empty]"]),
            ("ablassen-bestaetigen", [einstellungen, "[data-station-action=drain]"]),
        ]
        build("docked")
        page.wait_for_timeout(150)
        dock_button = page.evaluate("""() => { const b = window.card().shadowRoot.querySelector('.dock'), r = b.getBoundingClientRect();
            return { tag: b.tagName, popup: b.getAttribute('aria-haspopup'), level: b.getAttribute('data-dock'), text: b.textContent, w: r.width, h: r.height }; }""")
        check("dock button: a 44 px button with menu popup, text and level", dock_button["tag"] == "BUTTON" and dock_button["popup"] == "menu"
              and dock_button["h"] >= 44 and dock_button["w"] >= 44 and "Station" in dock_button["text"], json.dumps(dock_button))
        dock_geo = []
        for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": h})
                theme(th)
                for label, steps in dock_views:
                    build("docked")
                    page.wait_for_timeout(150)
                    title = page.evaluate(dock_open, steps)
                    page.wait_for_timeout(550)
                    g = page.evaluate("""() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
                        const fields = Array.from(sr.querySelectorAll('select, input')).filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44).length;
                        const tab = sr.querySelector('[role=tab][aria-selected=true]');
                        return { kind: sheet.getAttribute('data-kind'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                                 overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr), smallFields: fields,
                                 rows: sr.querySelectorAll('.setting').length, tabs: sr.querySelectorAll('[role=tab]').length, tab: tab ? tab.getAttribute('data-tab') : null,
                                 status: sr.querySelectorAll('[data-status]').length, actions: Array.from(sr.querySelectorAll('[data-station-action]')).map((n) => n.getAttribute('data-station-action')) }; }""")
                    if (w, th) in ((360, "light"), (1280, "dark")):
                        shot(f"station-{label}-{w}x{h}-{th}.png")
                    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                    dock_geo.append({"label": label, "w": w, "h": h, "theme": th, "title": title, **g})
        report["dockDialogs"] = dock_geo
        bad = [x for x in dock_geo if not inside(x) or x["small"] or x["smallFields"] or x["overflowX"] > 1 or str(x["title"]).startswith("missing")]
        check("station: menu, three tabs and a confirmation x 4 sizes x 2 themes inside the viewport, no sideways overflow, 44 px buttons and fields",
              not bad, json.dumps(bad[:4]))
        by = {x["label"]: x for x in dock_geo if x["w"] == 390 and x["theme"] == "light"}
        check("station: menu entries, tabs, rows, status list and confirmation as expected",
              by["menue"]["kind"] == "menu" and by["menue"]["actions"] == ["wash", "dry", "empty", "settings"]
              and by["waschen"]["tab"] == "wash" and by["waschen"]["tabs"] == 3 and by["waschen"]["rows"] == 12 and by["waschen"]["status"] >= 15
              and by["trocknen"]["tab"] == "dry" and by["trocknen"]["rows"] == 2 and by["entleeren"]["tab"] == "empty" and by["entleeren"]["rows"] == 2
              and by["ablassen-bestaetigen"]["kind"] == "confirm",
              json.dumps({k: {"title": v["title"], "rows": v["rows"], "tab": v["tab"], "kind": v["kind"], "actions": v["actions"]} for k, v in by.items()}))
        page.set_viewport_size({"width": 390, "height": 844})
        build("docked")
        page.wait_for_timeout(150)
        page.evaluate(dock_open, [einstellungen])
        page.wait_for_timeout(400)
        page.evaluate("() => window.dialog().shadowRoot.querySelector('[role=tab]').focus()")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("End")
        keys = page.evaluate("""() => { const sr = window.dialog().shadowRoot; return { active: sr.activeElement ? sr.activeElement.getAttribute('data-tab') : null,
            selected: sr.querySelector('[role=tab][aria-selected=true]').getAttribute('data-tab'), stored: localStorage.getItem('busch-vacuum-card:dock-tab:vacuum.robo') }; }""")
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        back = page.evaluate("() => window.dialog() ? window.dialog().shadowRoot.querySelector('.sheet').getAttribute('data-kind') : null")
        page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        check("station keyboard: arrows/End move tab and focus, tab remembered, Escape goes back to the menu",
              keys == {"active": "empty", "selected": "empty", "stored": "empty"} and back == "menu", json.dumps({"keys": keys, "back": back}))

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
            for label, opener, state in (("hindernis", open_obstacle, "docked"), ("info", open_info, "docked"), ("stockwerk", open_floors, "floors")):
                r["regel1_dialog_" + label] = lauf_breiten(
                    page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                    vor_messung=lambda pg, o=opener, s=state: (build(s), page.wait_for_timeout(200), o(), page.wait_for_timeout(350)))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                r["regel2_dialog_" + label] = lauf_breiten(
                    page, breiten=(390, 960), hoehe=900,
                    messung=lambda pg, o=opener: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ="ansicht"),
                    vor_messung=lambda pg, s=state: (build(s), page.wait_for_timeout(200)))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            for label, steps, kind in (("einstellungen", [], "bearbeitung"), ("einstellungen_kamera", [("[data-group=camera]", None)], "bearbeitung"),
                                       ("einstellungen_dnd_formular", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None)], "bearbeitung"),
                                       ("einstellungen_loeschen", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None), ("[data-action=delete]", None)], "bestaetigung")):
                opener = lambda st=steps: page.evaluate(settings_open, st)
                r["regel1_dialog_" + label] = lauf_breiten(
                    page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                    vor_messung=lambda pg, o=opener: (build("settings"), page.wait_for_timeout(150), o(), page.wait_for_timeout(350)))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                # Rule 2 (one Escape/back closes the popup) applies to the dialog's first view; deeper
                # views go back one level on Escape/back by design (R03/R25), tested in einstellungen.test.js.
                if steps:
                    continue
                r["regel2_dialog_" + label] = lauf_breiten(
                    page, breiten=(390, 960), hoehe=900,
                    messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                    vor_messung=lambda pg: (build("settings"), page.wait_for_timeout(150)))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            for label, steps, kind in (("dock_menue", [], "ansicht"), ("station", [einstellungen], "bearbeitung"),
                                       ("station_trocknen", [einstellungen, "[data-tab=dry]"], "bearbeitung"),
                                       ("station_bestaetigung", [einstellungen, "[data-station-action=drain]"], "bestaetigung")):
                opener = lambda st=steps: page.evaluate(dock_open, st)
                r["regel1_dialog_" + label] = lauf_breiten(
                    page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                    vor_messung=lambda pg, o=opener: (build("docked"), page.wait_for_timeout(150), o(), page.wait_for_timeout(350)))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                if steps:
                    continue
                r["regel2_dialog_" + label] = lauf_breiten(
                    page, breiten=(390, 960), hoehe=900,
                    messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                    vor_messung=lambda pg: (build("docked"), page.wait_for_timeout(150)))
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            r["regel1_karte_floors"] = lauf_breiten(
                page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
                vor_messung=lambda pg: (build("floors"), page.wait_for_timeout(200)))
            r["zaehlung"] = zaehle(r)
            report["uiRegelnVerstoesse"] = bewerte(r)

        report["serviceCalls"] = page.evaluate("() => window.__serviceCalls")
        browser.close()
    httpd.shutdown()

    report["vendorRequests"] = [u for u in report["requests"] if "/dist/" in u and not u.endswith(".js")]
    # Only the local harness and the three routed camera endpoints: no request leaves the page.
    report["foreignRequests"] = [u for u in report["requests"]
                                 if not u.startswith(f"http://127.0.0.1:{port}/")
                                 or ("/api/" in u and not any(r in u for r in CAMERA_ROUTES))]
    report["passed"] = sum(1 for c in report["checks"] if c["pass"])
    report["failed"] = sum(1 for c in report["checks"] if not c["pass"])
    report["clean"] = (report["failed"] == 0 and not report["badResponses"] and not report["requestFailures"]
                       and not report["consoleErrors"] and not report["pageErrors"] and not report["vendorRequests"]
                       and not report["serviceCalls"] and not report["foreignRequests"]
                       and report.get("uiRegelnVerstoesse", 0) == 0 and REGELN_DA)
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
          f"serviceCalls={len(report['serviceCalls'])} foreign={len(report['foreignRequests'])} screenshots={len(report['screenshots'])}")
    for e in report["pageErrors"] + report["consoleErrors"]:
        print("  error: " + e)
    print(f"report: {out_dir / 'report.json'}")
    return 0 if report["clean"] else 1


if __name__ == "__main__":
    sys.exit(main())
