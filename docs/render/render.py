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
  * remote (plan 2026-11-10-busch-vacuum-card-remote, Task 6): unarmed/armed at
    390x844, 844x390, 1280x800, light/dark; real mouse drag, two real touch points
    (CDP), keyboard, stop after release/blur/visibilitychange/Escape, rate and
    spacing from timestamps; every call stays in the harness stub
  * map editor (plan 2026-11-10-busch-vacuum-card-map-editor, Task 13): SYNTHETIC edit
    data (walls, doors, carpets, furniture, points, WiFi grid) for &saved=1; map
    management, edit mode per tool with one form per kind, confirmation (outside
    click keeps it), dirty dialog (Escape keeps it and shakes), WiFi switch, bubble
    "Bearbeiten" at 360/390/800/1280 light/dark; 0 calls without a confirming click
  * map backup (plan 2026-11-10-busch-vacuum-card-map-backup, Task 6): SYNTHETIC
    states (Original, Edited, Backup) whose pictures come through the route
    /api/camera_recovery_map_proxy/** as the synthetic SVG; list, full screen
    (size full at every width, picture loaded, keys, wheel), restore and backup
    confirmations, file-URL form with inline error, running status, at
    360/390/800/1280 light/dark; outside click keeps the confirmation, 0 calls
    without a confirming click
  * history (plan 2026-11-10-busch-vacuum-card-history, Task 7): the history
    endpoints answer with a SYNTHETIC run (gzip JSON like the integration, an
    SVG picture, an SVG obstacle photo): list, groups, detail with cleaning and
    WiFi map, photo, re-clean confirmation, cruising, empty; keyboard

The page is served over HTTP so that any sub-resource would show up as a
real 404. The harness HTML is written into the output directory, which must
therefore lie inside the served repository (a copy of it is fine).

Symbols (M14): ha-icon draws glyphs from docs/render/mdi-pfade.json (docs/render/mdi-pfade.py, @mdi/js).
Translation (M21): area "uebersetzung" renders with localize (tests/fixtures/uebersetzung-de.json) and without.
States (M15): area "zustaende" pictures karte-<roboter-weg|kamera-weg|laedt|abruf-fehler|konfig-fehler|keine-raeume>-<320|390|1280>-<theme>.png.
Buschcheck Welle 1/2 (#1163), appended after "regeln": rechte (M8 guest vs admin), adressen (M29), feindlich (M27,
tests/fixtures/feindlich.json against a harmless copy), netz (M6 karte-veraltet, M18 offline, M39 netz-langsam/-fehler,
fernsteuerung-langsam; faults made in the page, no real 5xx), teilfehler (M20), befehle (M3/M5), leiste (M2),
oberflaeche (E6: M11, M12, M13, M21 words), feinschliff (E7: M31-M36), anzeige (E9: M45 forced colors, M46, M47),
kontrast (M16), etiketten (M10 step 6: label/marker rectangles, karte-m10-rand/-zoom),
abrufe (M19: camera_proxy picture fetches of the whole run, only over all areas).

Usage:
    render.py <path/dist/busch-vacuum-card.js> <output-dir> [--nur <bereich>[,<bereich>...]]

    --nur runs only the named areas (in the registry's order, BEREICHE below):
        karte, layout, dialog, bewegung, kartenansicht, einstellungen, station,
        shortcuts, aufgaben, verlauf, fernsteuerung, reinigung, editor, sicherung,
        uebersetzung, zustaende, regeln, rechte, adressen, feindlich, netz, teilfehler,
        befehle, leiste, oberflaeche, feinschliff, anzeige, kontrast, etiketten, abrufe
    An unknown area exits with 2 and the list. Checks that only mean something
    over all areas (every VIEW_IDS view pictured) are then listed under
    report.json "nichtGemessen", not counted as passed; report.json "bereiche"
    names what ran, "nur" the choice (null without --nur), "bereichSekunden"
    the time per area, "ruheUeberschritten" every readiness wait that ran out.
"""

import functools
import http.server
import inspect
import json
import math
import re
import socketserver
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

from playwright.sync_api import sync_playwright, Page, TimeoutError as PlaywrightTimeout

# Release Task 2: every picture records which dialog views (data-view = the
# view's id) are open, so each id of the card's VIEW_IDS needs a picture.
VIEWS_SEEN = {}
# M14: at every picture, visible buttons without visible text (icon only) and their accessible name.
ICON_BUTTONS = {"pictures": 0, "checked": 0, "unnamed": {}}
UNNAMED_JS = """() => {
    const roots = [document], out = { checked: 0, unnamed: [] };
    for (let i = 0; i < roots.length; i++) roots[i].querySelectorAll('*').forEach((n) => { if (n.shadowRoot) roots.push(n.shadowRoot); });
    for (const r of roots) r.querySelectorAll('button, [role=button]').forEach((b) => {
        const box = b.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(b).visibility === 'hidden' || (b.innerText || '').trim()) return;
        out.checked++;
        const named = (b.getAttribute('aria-label') || '').trim() || b.getAttribute('aria-labelledby') || (b.title || '').trim();
        if (!named) out.unnamed.push((b.getAttribute('data-action') || b.getAttribute('data-entry') || b.className || b.tagName) + '');
    });
    return out;
}"""
_SCREENSHOT = Page.screenshot


def _screenshot_with_views(self, *args, **kwargs):
    try:
        ids = self.evaluate("""() => Array.from(document.querySelectorAll('busch-vacuum-dialog')).map((d) => {
            const s = d.shadowRoot && d.shadowRoot.querySelector('.sheet'); return s ? (s.getAttribute('data-view') || '(ohne id)') : null; }).filter(Boolean)""")
    except Exception:  # a page without the harness (e.g. closed) records nothing
        ids = []
    name = Path(str(kwargs.get("path") or "")).name
    try:
        unnamed = self.evaluate(UNNAMED_JS)
    except Exception:
        unnamed = None
    if unnamed is not None:
        ICON_BUTTONS["pictures"] += 1
        ICON_BUTTONS["checked"] += unnamed["checked"]
        for b in unnamed["unnamed"]:
            ICON_BUTTONS["unnamed"].setdefault(b, []).append(name)
    for view_id in ids:
        VIEWS_SEEN.setdefault(view_id, []).append(name)
    return _SCREENSHOT(self, *args, **kwargs)


Page.screenshot = _screenshot_with_views

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
# M22 (#1163): regeln.py takes warten= (called instead of its fixed waits); an older hacs checkout keeps them.
REGELN_WARTEN = REGELN_DA and all("warten" in inspect.signature(f).parameters for f in (selbsttest, messe_popup, lauf_breiten))
if REGELN_DA:
    _SELBSTTEST, _MESSE_POPUP, _LAUF_BREITEN = selbsttest, messe_popup, lauf_breiten

# Inventory IDs of the render checks (release Task 1, scripts/vacuum-inventar-pruefen.py): by name start.
RENDER_IDS = [
    ("matrix: card renders", ["CORE-03", "CORE-17"]), ("matrix: control buttons", ["CORE-07"]),
    ("matrix: error state", ["CORE-10", "CORE-11", "CORE-09"]), ("matrix: five task types", ["CORE-06"]),
    ("matrix: every visible card button", ["CORE-08"]), ("panel mode", ["CORE-13"]),
    ("map: data mode", ["MAP-01", "MAP-08"]), ("map: robot symbol", ["MAP-03"]), ("English UI", ["CORE-16"]),
    ("dialog ", ["CORE-12"]), ("overflowing sheet", ["CORE-12"]), ("page behind is locked", ["CORE-12"]),
    ("every dialog button", ["CORE-12"]), ("after turning the phone", ["CORE-12"]),
    ("confirmation dialog", ["CORE-12", "CORE-20"]), ("editor renders", ["CORE-18"]),
    ("map image fallback", ["MAP-01"]), ("map zoom", ["MAP-02"]), ("map locked", ["CORE-14"]),
    ("map motion", ["MAP-02"]), ("map dialogs", ["MAP-04", "CORE-19", "MAP-07"]), ("obstacle", ["MAP-04"]),
    ("device settings", ["DEV-01", "DEV-06", "DEV-09"]), ("dock button", ["DOCK-05", "CORE-11"]),
    ("station", ["DOCK-01", "DOCK-02", "DOCK-05"]), ("shortcuts", ["SHO-01", "SHO-02"]),
    ("tasks room", ["TASK-02"]), ("tasks zone", ["TASK-03"]), ("tasks spot", ["TASK-04"]), ("tasks go-to", ["TASK-05"]),
    ("tasks matrix", ["TASK-02", "TASK-03", "TASK-04", "TASK-05"]), ("history", ["HIS-01", "HIS-02"]),
    ("remote keyboard", ["REM-02"]), ("remote", ["REM-01", "REM-03"]), ("clean settings", ["SET-02", "SET-04", "SET-05"]),
    ("map editor", ["EDI-01", "EDI-02"]), ("map backup", ["BAK-01", "BAK-02"]), ("views:", ["CORE-12"]),
    ("layout:", ["CORE-13", "CORE-08"]), ("ha panel:", ["CORE-13"]), ("station warning:", ["CORE-08", "DOCK-05"]),
    ("selection tools:", ["TASK-02"]), ("symbols:", ["CORE-08", "CORE-12"]), ("translation:", ["CORE-16"]), ("states:", ["CORE-10", "CORE-07"]),
]

WIDTHS = (320, 390, 480, 960, 1280)
# #1002: card widths of the new layout (two columns from 900 px card width).
LAYOUT_WIDTHS = (360, 390, 480, 800, 1280, 1600)
# The harness's HA header (--header-height); a panel card fills the viewport below it.
HA_HEADER = 56
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


def synthetic_edit_data(grid, cam):
    """Edit data like camera_map_data_proxy &saved=1 (map.py get_data): the synthetic grid plus
    INVENTED walls (the room rectangles' edges), doors, carpets (the fixture's anonymised carpet
    rectangles), furniture, target points and a WiFi grid -- never a real floor plan."""
    rs = sorted((r for r in cam["rooms"].values() if r.get("x0") is not None), key=lambda r: r["room_id"])
    touch = lambda a, b: a["x0"] <= b["x1"] + 100 and b["x0"] <= a["x1"] + 100 and a["y0"] <= b["y1"] + 100 and b["y0"] <= a["y1"] + 100
    floor = {"Wood": 1, "Tile": 2}
    direction = {"Horizontal": 0, "Vertical": 90}
    segments = [[r["room_id"], r["x"], r["y"], r.get("type", 0), None, r.get("index", 0), r.get("color_index", 0),
                 [o["room_id"] for o in rs if o is not r and touch(r, o)], floor.get(r.get("floor_material"), 0),
                 direction.get(r.get("floor_material_direction")), 1] for r in rs]
    walls = {}
    for r in rs:
        x0, y0, x1, y1 = r["x0"], r["y0"], r["x1"], r["y1"]
        walls[str(r["room_id"])] = [[ax, ay, bx, by, ax, ay, bx, by, 1, (ax + bx) // 2, (ay + by) // 2]
                                    for ax, ay, bx, by in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0))]
    doors = []
    for i, r in enumerate(rs[:3]):
        mx = (r["x0"] + r["x1"]) // 2
        doors.append([mx - 400, r["y1"], mx + 400, r["y1"], mx - 400, r["y1"], mx + 400, r["y1"], 0, 50 + i, 1])
    corners = lambda c: [c["x0"], c["y0"], c["x1"], c["y1"], c["x2"], c["y2"], c["x3"], c["y3"]]
    carpets = [corners(c) + [i + 1, 0, 1, None, 6, 0, None] for i, c in enumerate(cam["carpets"])]
    deleted = [corners(c) + [20 + i] for i, c in enumerate(cam["deleted_carpets"])]
    detected = [corners(c) + [30 + i, 0, 1, None, 7, 0, None, None, [rs[0]["room_id"]], None] for i, c in enumerate(cam["detected_carpets"])]
    furnitures = [[f["x"], f["y"], f["width"], f["height"], t, 0, f["angle"], 1, f["segment"], f["furniture_id"]]
                  for f, t in ((FURNITURE[0], 4), (FURNITURE[1], 14))]
    levels = [14, 13, 12, 11, 10]
    wifi = {"size": grid["size"], "data": {str(levels[i % 5]): runs for i, (k, runs) in enumerate(sorted(grid["data"].items()))
                                            if k not in ("255", "512")}}
    return dict(grid, saved_map=True, station_segment=rs[0]["room_id"], segments=segments, walls=walls, doors=doors,
                carpets=carpets, deleted_carpets=deleted, detected_carpets=detected, furnitures=furnitures,
                predefined_points=[[rs[0]["x"], rs[0]["y"] + 400], [rs[2]["x"] + 300, rs[2]["y"]]], wifi_map_data=wifi)


# Furniture for the edit scenario, in the camera attribute form (and as edit data above); invented positions.
FURNITURE = [{"x": -3461, "y": -2902, "width": 1800, "height": 900, "type": "Two seat sofa", "furniture_id": 3, "angle": 0, "segment": 3},
             {"x": 2472, "y": -3806, "width": 700, "height": 700, "type": "Refrigerator", "furniture_id": 6, "angle": 0, "segment": 9}]


OBSTACLE_PHOTO = ('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#cfd8dc"/>'
                  '<circle cx="160" cy="120" r="60" fill="#90a4ae"/></svg>')
CAMERA_ROUTES = ("/api/camera_proxy/", "/api/camera_map_data_proxy/", "/api/camera_map_obstacle_proxy/",
                 "/api/camera_history_map_proxy/", "/api/camera_map_obstacle_history_proxy/", "/api/camera_recovery_map_proxy/")


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


HA_PANEL_JS = """() => {
    const c = window.card(), sr = c.shadowRoot;
    const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const panel = sr.querySelector('.panel'), start = sr.querySelector('[data-action=start] .ctl-text');
    const dock = sr.querySelector('.dock'), dockWords = dock && dock.querySelector('span');
    const hint = sr.querySelector('.station-hint'), count = sr.querySelector('.task-count'), all = sr.querySelector('[data-action=rooms-all]');
    const out = { width: c.getAttribute('data-width'), H: innerHeight,
        pageScroll: document.scrollingElement.scrollHeight - innerHeight, card: box(sr.querySelector('ha-card')),
        controls: box(sr.querySelector('.controls')), panelOverflow: getComputedStyle(panel).overflowY,
        panelScrollable: panel.scrollHeight - panel.clientHeight,
        start: start && start.textContent, startCut: start ? start.scrollWidth - start.clientWidth : null,
        dockText: dockWords && dockWords.getBoundingClientRect().width > 0 ? dockWords.textContent : '',
        dockLabel: dock && dock.getAttribute('aria-label'), dockW: dock ? dock.getBoundingClientRect().width : null,
        hint: hint && hint.getBoundingClientRect().height > 0 ? hint.textContent : null,
        countFont: count && getComputedStyle(count).fontSize, countWeight: count && getComputedStyle(count).fontWeight,
        toolFont: all && getComputedStyle(all).fontSize, small: window.smallTargets(sr) };
    panel.scrollTop = 100000;
    out.panelScrolled = panel.scrollTop;
    out.controlsAfter = box(sr.querySelector('.controls'));
    return out;
}"""


def ha_panel_checks(page, data, room_pick, check, report, out_dir, ruhe):
    """0.2.2 (#1002 live findings of 0.2.1): HA's panel structure and the station warning.

    Panel at 390x844, 390x640, 1280x900, 1600x900 and a normal card 900/1280 px wide, all with
    the station reporting "fresh water low"; phone sizes with two rooms chosen (long sheet).
    `ruhe` is main()'s readiness wait (M22)."""
    rows = []
    cases = [(True, 390, 844), (True, 390, 640), (True, 1280, 900), (True, 1600, 900), (False, 916, 900), (False, 1296, 900)]
    for panel, w, h in cases:
        page.set_viewport_size({"width": w, "height": h})
        page.evaluate("() => { document.documentElement.dataset.theme = 'light'; document.documentElement.style.colorScheme = 'light'; }")
        page.evaluate("(a) => window.buildCard(a)", {"data": data["station_low"], "lang": "de", "config": {}, "panel": panel})
        ruhe()
        room = w < 900
        if room:
            page.evaluate(room_pick)
            ruhe()
        m = page.evaluate(HA_PANEL_JS)
        name = f"ha-{'panel' if panel else 'karte'}-station-{w}x{h}.png"
        page.evaluate("() => window.scrollTo(0, 0)")
        page.screenshot(path=str(out_dir / name), full_page=False)
        report["screenshots"].append(name)
        rows.append({"panel": panel, "w": w, "h": h, "room": room, **m})
    report["haPanel"] = rows
    pan = [r for r in rows if r["panel"]]
    fails = lambda pred, rs: [(r["w"], r["h"]) for r in rs if not pred(r)]
    ok = lambda r: (r["pageScroll"] <= 0.5 and abs(r["card"]["h"] - (r["H"] - HA_HEADER)) <= 1
                    and r["controls"]["t"] >= HA_HEADER and r["controls"]["b"] <= r["H"] + 0.5)
    check("ha panel: card exactly fills the view below HA's header, no page scroll, action bar fully visible",
          not fails(ok, pan), json.dumps([(r["w"], r["h"], r["pageScroll"], r["card"], r["controls"]) for r in pan if not ok(r)][:4]))
    sheet = lambda r: (r["width"] == "wide" or (r["panelOverflow"] == "auto" and (r["panelScrollable"] <= 0 or r["panelScrolled"] > 0)
                       and r["controlsAfter"]["b"] <= r["H"] + 0.5 and r["controlsAfter"]["t"] >= HA_HEADER))
    long = [r for r in pan if r["width"] != "wide" and r["h"] == 640]
    check("ha panel: phone sheet scrolls inside the card (long room list at 390x640), action bar stays",
          not fails(sheet, pan) and long and all(r["panelScrollable"] > 0 for r in long),
          json.dumps([(r["w"], r["h"], r["panelOverflow"], r["panelScrollable"], r["panelScrolled"], r["controlsAfter"]) for r in pan][:4]))
    want = lambda r: "2 Räume reinigen" if r["room"] else "Alles reinigen"
    label = lambda r: r["start"] == want(r) and r["startCut"] <= 0
    check("station warning: primary label complete (panel 390/1280/1600, card 900/1280)",
          not fails(label, rows), json.dumps([(r["w"], r["h"], r["start"], r["startCut"]) for r in rows if not label(r)][:6]))
    dock = lambda r: (r["hint"] and "Frischwasser niedrig" in r["hint"] and r["dockLabel"] == "Station · Frischwasser niedrig"
                      and (r["dockText"] == "Dock" if r["width"] == "wide" else r["dockText"] == "" and r["dockW"] <= 52.5))
    check("station warning: text in the panel's hint bar; action bar shows 'Dock' (wide) or the symbol (phone)",
          not fails(dock, rows), json.dumps([(r["w"], r["width"], r["hint"], r["dockText"], r["dockLabel"], r["dockW"]) for r in rows if not dock(r)][:6]))
    font = lambda r: not r["room"] or (r["toolFont"] == "13px" and r["countFont"] == "14px" and r["countWeight"] == "500")
    check("selection tools: 'Alle wählen'/'Auswahl leeren' 13 px below the 14 px count line",
          not fails(font, rows), json.dumps([(r["w"], r["toolFont"], r["countFont"], r["countWeight"]) for r in rows if r["room"]]))
    check("ha panel: every visible button >= 44 px with the station warning", not fails(lambda r: not r["small"], rows),
          json.dumps([(r["w"], r["small"]) for r in rows if r["small"]][:4]))


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
  /* 0.2.2: panel mode like HA's real panel view -- a fixed app header of --header-height, the view
     padded below it, NO fixed-height parent, so a card taller than the rest makes the PAGE scroll
     (the old #stage height hid exactly that). */
  :root { --header-height: 56px; }
  #ha-header { display: none; }
  body.ha-panel { padding: var(--header-height) 8px 0; }
  body.ha-panel #ha-header { display: block; position: fixed; top: 0; left: 0; right: 0; z-index: 9;
                             height: var(--header-height); background: var(--app-header-background-color, #03a9f4); }
</style>
</head><body>
<div id="ha-header"></div>
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

  // M14: ha-icon draws the real MDI glyph from docs/render/mdi-pfade.json (made by mdi-pfade.py, no network).
  // An unknown name shows a hollow box and lands in window.__iconsMissing (check "symbols:").
  const MDI = __MDI__;
  window.__iconsMissing = new Set();
  class HaIconStub extends HTMLElement {
    static get observedAttributes() { return ['icon']; }
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:inline-block;flex:none;' +
        'width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);vertical-align:middle;}' +
        'svg{display:block;width:100%;height:100%;fill:currentColor;}</style>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd"></path></svg>';
      this._draw();
    }
    attributeChangedCallback() { this._draw(); }
    get icon() { return this.getAttribute('icon'); }
    set icon(v) { this.setAttribute('icon', v); }
    _draw() {
      const name = this.getAttribute('icon'), d = name ? MDI[name] : '';
      if (name && !d) window.__iconsMissing.add(name);
      this.toggleAttribute('data-missing', !!name && !d);
      this.shadowRoot.querySelector('path').setAttribute('d', d || (name ? 'M3 3H21V21H3ZM5 5V19H19V5Z' : ''));
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
  // M21: `texte` (id -> text, tests/fixtures/uebersetzung-de.json) gives hass a localize like HA's
  // ('' for an unknown key); without it there is no localize, as before.
  window.makeHass = (data, lang, texte) => Object.assign({
    language: lang, locale: { language: lang, time_format: '24', first_weekday: 'monday' }, themes: {},
    states: data.states, entities: data.entities, services: data.services,
    // Wie echtes HA (M8/M29): angemeldeter Admin, hassUrl auf die eigene Instanz.
    user: { id: 'test', name: 'Test', is_admin: true }, hassUrl: (p = '') => location.origin + p,
    formatEntityState: (s, state = s.state) => (WORDS[lang][state] || state)
      + (s.attributes.unit_of_measurement ? ' ' + s.attributes.unit_of_measurement : ''),
    callService: (domain, service, payload) => { window.__serviceCalls.push({ domain, service, payload, at: performance.now() }); return Promise.resolve(); }
  }, texte ? { localize: (id) => (Object.hasOwn(texte, id) ? texte[id] : ''), loadBackendTranslation: () => Promise.resolve() } : {});
  window.closeDialogs = () => document.querySelectorAll('busch-vacuum-dialog').forEach((d) => d.remove());
  window.buildCard = ({ data, lang = 'de', config = {}, panel = false, texte = null }) => {
    window.closeDialogs();
    const stage = document.getElementById('stage');
    stage.className = panel ? 'panel' : '';
    document.body.classList.toggle('ha-panel', !!panel);
    window.scrollTo(0, 0);
    stage.replaceChildren();
    const card = document.createElement('busch-vacuum-card');
    card.setConfig(Object.assign({ type: 'custom:busch-vacuum-card', entity: 'vacuum.robo' }, config));
    if (panel) card.isPanel = true;
    stage.appendChild(card);
    card.hass = window.makeHass(data, lang, texte);
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


# M15: the missing states (F4) as scenarios; map frames marked for the routes of bereich_zustaende.
ZUSTAND_SZENARIEN = ("roboter_weg", "kamera_weg", "laedt", "abruf_fehler", "keine_raeume")
ZUSTAND_FRAMES = {"laedt": 990101, "abruf_fehler": 990102}


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
    elif name == "shortcuts":
        # shortcuts: the X40 has none live; synthetic entries in the source's data form (device.py#L11076), one script.
        vac["attributes"]["shortcuts"] = {
            "32": {"id": 32, "index": 1, "name": "Gewächshaus nach dem Gießen mit sehr langem Namen 🍝", "map_id": 3, "running": False, "tasks": []},
            "30": {"id": 30, "index": 0, "name": "Galerie", "running": True, "tasks": []},
            "31": {"id": 31, "index": 2, "name": "Turmzimmer", "map_id": 7, "running": False, "tasks": []}}
        vac["attributes"].update({"maps": [{"id": 3, "index": 1, "name": "Karte 1", "custom_name": None}, {"id": 7, "index": 2, "name": "Karte 2", "custom_name": None}],
                                  "selected_map": "Karte 1"})
        states["script.abendrunde"] = {"entity_id": "script.abendrunde", "state": "off", "attributes": {"friendly_name": "Abendrunde"}}
    elif name == "cleangenius":
        # clean-settings: CleanGenius on (synthetic mode list, the X40 empties it while off).
        vac["attributes"].update({"cleangenius": "Routine cleaning", "cleangenius_cleaning": True,
                                  "cleangenius_mode_list": ["Vacuum and mop", "Mop after vacuum"]})
    elif name == "editor":
        # map-editor: furniture in the camera attributes (the X40 reports none), matching synthetic_edit_data.
        states["camera.robo_map"]["attributes"]["furnitures"] = [{k: f[k] for k in ("x", "y", "width", "height", "type", "furniture_id", "angle")} for f in FURNITURE]
    elif name in ("backup", "backup_running"):
        # map-backup: three SYNTHETIC states of map 3 (newest first, types.py#L5072), keys and URLs like camera.py#L1353.
        cam = states["camera.robo_map_1"]["attributes"]
        listed = [("2026-11-01 09:30", "Sicherungskarte", 3), ("2026-04-26 13:23", "Bearbeitete Karte", 2), ("2024-11-21 10:20", "Originalkarte", 1)]
        cam["recovery_map_list"] = [{"date": d, "map_type": typ, "object_name": "cloud/geraet/1/10" + str(k)} for d, typ, k in listed]
        keys = {k: "%s/%s/%s %s:00: Map%d (%s)" % (d[5:7], d[8:10], d[2:4], d[11:16], k, typ) for d, typ, k in listed}
        cam["recovery_map_picture"] = {keys[k]: "/api/camera_recovery_map_proxy/camera.robo_map_1?token=testtoken&index=%d&v=17%d" % (k, k) for _, _, k in listed}
        cam["recovery_map_file"] = {key: url + "&file=1" for key, url in zip(cam["recovery_map_picture"].keys(), cam["recovery_map_picture"].values())}
        if name == "backup_running":
            vac["attributes"].update({"map_recovery_status": "Running", "map_backup_status": "Success"})
    elif name == "temporary":
        # map-editor: a temporary map (synthetic) — save, discard and replace one of the stored maps.
        vac["attributes"]["has_temporary_map"] = True
    elif name == "station_low":
        # 0.2.2: the station's live warning (fresh water low), as the real station reported it 12.11.2026.
        vac["attributes"]["clean_water_tank_status"] = "Low water"
    elif name == "customized":
        vac["attributes"]["customized_cleaning"] = True
    elif name == "nonstrict":
        # clean-settings: a device without cleaning_sequence_v2 and two rooms in order (synthetic).
        vac["attributes"]["capabilities"] = [c for c in vac["attributes"]["capabilities"] if c != "cleaning_sequence_v2"]
        vac["attributes"]["cleaning_sequence"] = [3, 5]
    elif name == "history_empty":
        # history: the sensor without runs (no cloud connection), R18.
        sensor = states["sensor.robo_cleaning_history"]
        sensor["attributes"] = {k: v for k, v in sensor["attributes"].items() if not isinstance(v, dict)}
    elif name == "roboter_weg":
        # M15: the robot entity is unavailable (HA keeps the attributes of the last report).
        vac["state"] = "unavailable"
    elif name == "kamera_weg":
        # M15: the map camera is unavailable.
        for cam_id in ("camera.robo_map", "camera.robo_map_1"):
            states[cam_id]["state"] = "unavailable"
    elif name in ("laedt", "abruf_fehler"):
        # M15: map picture and map data with a marked frame; bereich_zustaende holds (laedt) or spoils
        # (abruf_fehler) exactly these answers (ZUSTAND_FRAMES).
        frame = ZUSTAND_FRAMES[name]
        for cam_id in ("camera.robo_map", "camera.robo_map_1"):
            a = states[cam_id]["attributes"]
            a["frame_id"] = frame
            a["entity_picture"] = "/api/camera_proxy/%s?token=testtoken&v=%d" % (cam_id, frame)
    elif name == "keine_raeume":
        # M15: a map without rooms (empty room list).
        for cam_id in ("camera.robo_map", "camera.robo_map_1"):
            states[cam_id]["attributes"]["rooms"] = {}
    elif name == "error":
        vac["state"] = "error"
        vac["attributes"].update({"has_error": True, "error": "Wheel stuck", "charging": False})
        states["sensor.robo_error"]["state"] = "wheel_stuck"
        states["sensor.robo_error"]["attributes"]["description"] = (
            "Antriebsrad blockiert. Bitte Fremdkörper entfernen und neu starten.")
    return data


# ---------------------------------------------------------------------------
# Readiness instead of fixed waits (M22). RUHE_INIT runs in every harness page before the card
# (add_init_script, PAGE stays as it is) and counts what is still loading: fetch until the body is
# read, img.decode() until it settles. RUHE_JS is the predicate of ruhe(): two frames in a row
# without a running finite animation (document and the card's/dialog's shadow roots; endless ones
# are ignored), without loading work, every non-lazy (or visible lazy) picture complete, the card's
# map picture not loading (_imageState 'loading' with an _imageUrl: a map that is not shown never
# loads one and starts as 'loading'), and the caller's condition true. Python adds the requests
# still in flight.
# ---------------------------------------------------------------------------
RUHE_INIT = """(() => {
  if (window.__ruhe) return;
  const st = window.__ruhe = { offen: 0 };
  const zu = () => { st.offen = Math.max(0, st.offen - 1); };
  const later = () => setTimeout(zu, 0);
  const decode = HTMLImageElement.prototype.decode;
  if (decode) HTMLImageElement.prototype.decode = function () { st.offen++; const p = decode.call(this); p.then(zu, zu); return p; };
  const holen = window.fetch;
  if (holen) window.fetch = function () { st.offen++; const p = holen.apply(this, arguments); p.then(later, zu); return p; };
  for (const name of ['json', 'text', 'arrayBuffer', 'blob']) {
    const read = Response.prototype[name];
    if (read) Response.prototype[name] = function () { st.offen++; const p = read.call(this); p.then(later, zu); return p; };
  }
})();"""

RUHE_JS = """(a) => {
  const c = document.querySelector('busch-vacuum-card'), d = document.querySelector('busch-vacuum-dialog');
  const sr = d && d.shadowRoot, m = c && c._map;
  const st = window.__ruhePoll || (window.__ruhePoll = { token: null, n: 0 });
  if (st.token !== a.token) { st.token = a.token; st.n = 0; }
  const roots = [document, c && c.shadowRoot].concat(Array.from(document.querySelectorAll('busch-vacuum-dialog')).map((x) => x.shadowRoot)).filter(Boolean);
  const anis = new Set();
  roots.forEach((r) => r.getAnimations().forEach((x) => anis.add(x)));
  const running = Array.from(anis).filter((x) => (x.playState === 'running' || x.pending) && x.effect
    && Number.isFinite(x.effect.getComputedTiming().endTime));
  if (a.fertig) running.forEach((x) => { try { x.finish(); } catch (e) { /* not finishable: waited for */ } });
  const away = (n) => { const r = n.getBoundingClientRect(); return (!r.width && !r.height) || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth; };
  const pictures = roots.slice(1).some((r) => Array.from(r.querySelectorAll('img')).some((i) => !i.complete && !(i.loading === 'lazy' && away(i))));
  let wann = false;
  try { wann = !!(__WANN__); } catch (e) { wann = false; }
  const ok = !running.length && !pictures && !(window.__ruhe && window.__ruhe.offen > 0)
    && !(document.fonts && document.fonts.status !== 'loaded') && !(m && m._imageState === 'loading' && m._imageUrl) && wann;
  st.n = ok ? st.n + 1 : 0;
  return st.n >= 2;
}"""

FRAMES_JS = "(n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); })"

# Conditions for ruhe(wann=...): JS expressions (c, d, sr, m in scope, see RUHE_JS).
WANN_DIALOG_ZU = "!d"
# regeln.py's waits: rest, and no close pending on the popstate it waits for (close() -> history.go -> _dismiss).
WANN_KEIN_SCHLIESSEN = "!d || !d._closing"
WANN_AUFRUF = "window.__serviceCalls.length > 0"
# Remote: a stop and its repeat after stopRepeatMs (the controller always sends both) are the last two steps.
WANN_STOPP = ("(() => { const s = window.__serviceCalls.filter((x) => x.service === 'vacuum_remote_control_move_step');"
              " return s.length >= 2 && s.slice(-2).every((x) => !x.payload.velocity && !x.payload.rotation); })()")


def wann_ansicht(view_id):
    """Condition: the dialog shows the view with this data-view id (the card's VIEW_IDS)."""
    return "sr && sr.querySelector('.sheet') && sr.querySelector('.sheet').getAttribute('data-view') === " + json.dumps(view_id)

# Waiting inside the async openers: frames until nothing loads any more (window.__ruhe), and frames until a
# selector is there -- bounded by a number of frames, never a fixed time.
OEFFNER_HILFEN = """const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const settle = async () => { for (let i = 0; i < 600; i++) { await frame(); if (!window.__ruhe || window.__ruhe.offen <= 0) return; } };
    const find = async (get) => { for (let i = 0; i < 300; i++) { const n = get(); if (n) return n; await frame(); } return null; };"""

# ---------------------------------------------------------------------------
# Openers and view lists shared by several areas (the area's own and "regeln" uses them again).
# ---------------------------------------------------------------------------
room_pick = """() => { const sr = window.card().shadowRoot; sr.querySelector('.task[data-task=room]').click();
    ['3', '5'].forEach((id) => sr.querySelector('.room-chip[data-room="' + id + '"]').click()); }"""

settings_open = """(steps) => { window.closeDialogs(); const c = window.card(); const I = customElements.get('busch-vacuum-card').__internals;
    c._openDialog(I.MODULE_VIEWS.settings(c)); const sr = () => window.dialog().shadowRoot;
    for (const [sel, value] of steps) { const n = sr().querySelector(sel); if (!n) return 'missing ' + sel;
      if (value == null) n.click(); else { n.value = value; n.dispatchEvent(new Event(n.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); } }
    return sr().querySelector('h1').textContent; }"""

inside = lambda x: x["top"] >= -0.5 and x["bottom"] <= x["H"] + 0.5 and x["left"] >= -0.5 and x["right"] <= x["W"] + 0.5

dock_open = """(steps) => { window.closeDialogs(); try { localStorage.clear(); } catch (e) {}
    const knopf = window.card().shadowRoot.querySelector('.dock'); if (!knopf) return 'missing .dock'; knopf.click();
    const sr = () => window.dialog().shadowRoot;
    for (const sel of steps) { const n = sr().querySelector(sel); if (!n) return 'missing ' + sel; n.click(); }
    return sr().querySelector('h1').textContent; }"""
einstellungen = "[data-station-action=settings]"

short_config = {"scripts": ["script.abendrunde"]}
short_open = """(steps) => { window.closeDialogs();
    const knopf = window.card().shadowRoot.querySelector('[data-action=shortcuts]'); if (!knopf) return 'missing shortcuts button'; knopf.click();
    const sr = () => window.dialog().shadowRoot;
    for (const sel of steps) { const n = sr().querySelector(sel); if (!n) return 'missing ' + sel; n.click(); }
    return sr().querySelector('h1').textContent; }"""

task_prepare = """(t) => { const c = window.card(); c.shadowRoot.querySelector('[data-task=' + t + ']').click();
    const r = c.hass.states['camera.robo_map'].attributes.rooms;
    if (t === 'room') c._selection.rooms.push(5, 3);
    if (t === 'zone') { c._selection.zones.push({ x0: r['3'].x - 900, y0: r['3'].y - 700, x1: r['3'].x + 900, y1: r['3'].y + 700 }); c._zoneActive = 0; }
    if (t === 'spot') { c._selection.spots.push({ x: r['5'].x, y: r['5'].y }); c._spotActive = 0; }
    if (t === 'goto') c._selection.goto = { x: r['5'].x, y: r['5'].y };
    c._selectionChanged(); return true; }"""

# Opened as the dialog's first view (the menu entry itself is covered in tests/verlauf.test.js).
hist_open = """async (a) => { window.closeDialogs(); const c = window.card(); const I = customElements.get('busch-vacuum-card').__internals;
    const sr = () => window.dialog().shadowRoot; """ + OEFFNER_HILFEN + """
    c._openDialog(I.MODULE_VIEWS[a.entry](c));
    for (const sel of a.steps) { await settle(); const n = await find(() => sr().querySelector(sel)); if (!n) return 'missing ' + sel; n.click(); }
    await settle(); return sr().querySelector('h1').textContent; }"""
detail_steps = ["[data-group='1794228271']", "[data-run='1794228429']"]

remote_open = """async (arm) => { window.closeDialogs(); window.__serviceCalls = []; const c = window.card();
    const I = customElements.get('busch-vacuum-card').__internals; """ + OEFFNER_HILFEN + """
    c._openDialog(I.MODULE_VIEWS.remote(c)); await settle();
    const sr = window.dialog().shadowRoot; if (arm) sr.querySelector('[data-action="arm"]').click(); await settle();
    return sr.querySelector('h1').textContent; }"""

clean_open = """(steps) => { window.closeDialogs(); const b = window.card().shadowRoot.querySelector('[data-action=clean-settings]');
    if (!b) return 'missing settings button'; b.click(); const sr = () => window.dialog().shadowRoot;
    for (const sel of steps) { const n = sr().querySelector(sel); if (!n) return 'missing ' + sel; n.click(); }
    return sr().querySelector('h1').textContent; }"""

edit_open = """async (a) => { window.closeDialogs(); const c = window.card(); """ + OEFFNER_HILFEN + """
    const sr = () => window.dialog() && window.dialog().shadowRoot;
    const tool = c._map && c._map.tools.querySelector('[data-action=' + (a.entry === 'maps' ? 'map-maps' : 'map-edit') + ']');
    if (!tool) return 'missing entry ' + a.entry;
    tool.click();
    await settle();
    for (const sel of a.steps) {
      if (sel.startsWith('key:')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: sel.slice(4), bubbles: true, composed: true })); await settle(); continue; }
      const n = await find(() => sr() && sr().querySelector(sel)); if (!n) return 'missing ' + sel; n.click(); await settle(); }
    await settle(); return sr() ? sr().querySelector('h1').textContent : 'missing dialog'; }"""

edit_views = [
    ("verwaltung", "floors", "maps", []),
    ("verwaltung-umbenennen", "floors", "maps", ["[data-map='7'] [data-action=rename]"]),
    ("verwaltung-loeschen", "floors", "maps", ["[data-map='7'] [data-action=delete]"]),
    ("modus", "editor", "edit", []),
    ("raeume", "editor", "edit", ["[data-tool=rooms]", ".room-chip[data-room='3']"]),
    ("raeume-teilen", "editor", "edit", ["[data-tool=rooms]", ".room-chip[data-room='3']", "[data-action=room-split]"]),
    ("waende", "editor", "edit", ["[data-tool=walls]", "[data-edit-item='walls:0']"]),
    ("zonen", "editor", "edit", ["[data-tool=zones]", "[data-action=edit-add]"]),
    ("linien", "editor", "edit", ["[data-tool=lines]", "[data-edit-item='virtual_walls:0']"]),
    ("teppiche", "editor", "edit", ["[data-tool=carpets]", "[data-edit-item='carpets:0']"]),
    ("moebel", "editor", "edit", ["[data-tool=furniture]", "[data-edit-item='furnitures:0']"]),
    ("punkte", "editor", "edit", ["[data-tool=points]", "[data-edit-item='predefined_points:0']"]),
    ("wlan", "editor", "edit", ["[data-tool=wifi]", "[data-edit-item='router:0']"]),
    ("wlan-reinigungskarte", "editor", "edit", ["[data-tool=wifi]", "[data-wifi-view=cleaning]"]),
    ("bestaetigung", "editor", "edit", ["[data-tool=zones]", "[data-action=edit-add]", "[data-action=save]"]),
    ("ungespeichert", "editor", "edit", ["[data-tool=zones]", "[data-action=edit-add]", "key:Escape"]),
]

bak_open = """async (a) => { window.closeDialogs(); const c = window.card(); """ + OEFFNER_HILFEN + """
    const sr = () => window.dialog() && window.dialog().shadowRoot;
    const tool = c._map && c._map.tools.querySelector('[data-action=map-maps]');
    if (!tool) return 'missing maps tool';
    tool.click();
    await settle();
    for (const sel of a.steps) {
      // map-backup fix 12.11.2026: the note after a restore, with the rooms remembered before it.
      if (sel === 'note:rooms') { const I = customElements.get('busch-vacuum-card').__internals;
        c._restoreNote = { mapId: 3, text: 'Wiederhergestellt: Originalkarte vom 21.11.2024 10:20 um 13:44.', frame: null,
          rooms: I.roomSnapshot(c._model()), roomRun: { done: [], error: '', running: false } }; continue; }
      if (sel.startsWith('key:')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: sel.slice(4), bubbles: true, composed: true })); await settle(); continue; }
      const n = await find(() => sr() && sr().querySelector(sel)); if (!n) return 'missing ' + sel; n.click(); await settle(); }
    await settle(); return sr() ? sr().querySelector('h1').textContent : 'missing dialog'; }"""

bak_list = ["[data-map='3'] [data-action=backups]"]
bak_views = [
    ("liste", "backup", bak_list),
    ("vollbild", "backup", bak_list + [".backup-entry [data-action=view]"]),
    ("vollbild-aktuell", "backup", bak_list + [".backup-entry [data-action=view]", "[data-action=previous]"]),
    ("wiederherstellen", "backup", bak_list + [".backup-entry[data-type=original] [data-action=restore]"]),
    ("wiederherstellen-backup", "backup", bak_list + [".backup-entry[data-type=backup] [data-action=restore]"]),
    ("sichern", "backup", bak_list + ["[data-action=backup-now]"]),
    ("datei", "backup", bak_list + ["[data-action=restore-file]"]),
    ("datei-fehler", "backup", bak_list + ["[data-action=restore-file]", "[data-action=submit]"]),
    ("laeuft", "backup_running", bak_list),
    ("raeume-zurueck", "backup", ["note:rooms"] + bak_list + ["[data-action=restore-rooms]"]),
    ("temporaer-ersetzen", "temporary", ["[data-action=replace_temporary]"]),
]


def bereich_karte(k):
    """1. Matrix: Breiten x Themen x Karte/Panel x Zustände, dazu einmal Englisch."""
    page, report, check, out_dir, theme, build = k.page, k.report, k.check, k.out_dir, k.theme, k.build
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
                                               and x["shadow"] == "none" and abs(x["height"] - (x["H"] - HA_HEADER)) <= 1)),
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
    en_return = page.evaluate("() => { const b = window.card().shadowRoot.querySelector('.ctl[data-action=return]'); return b && b.getAttribute('aria-label'); }")
    page.screenshot(path=str(out_dir / "karte-cleaning-en-390.png"), full_page=True)
    report["screenshots"].append("karte-cleaning-en-390.png")
    # M2: the bar says the short word "Dock", the full command is the button's name.
    check("English UI with English HA", en == ["Pause", "Stop", "Dock"] and en_return == "Return to dock", json.dumps([en, en_return]))


def bereich_layout(k):
    """1b. Layout (#1002), HA-Panel mit Stationswarnung, Linkshänder."""
    page, data, report, check, out_dir, theme, build, ruhe = k.page, k.data, k.report, k.check, k.out_dir, k.theme, k.build, k.ruhe
    # ------------------------------------------------------------------
    # 1b. Layout (#1002): card widths x themes x normal/panel, task Gesamt and Raum
    # ------------------------------------------------------------------
    layout = []
    for panel in (False, True):
        for width in LAYOUT_WIDTHS:
            for th in THEMES:
                # The stage pads 8 px each side: the viewport is chosen so the CARD has this width.
                page.set_viewport_size({"width": width + 16, "height": 900})
                theme(th)
                build("docked", panel=panel)
                for task in ("all", "room"):
                    if task == "room":
                        page.evaluate(room_pick)
                        ruhe()
                    m = page.evaluate("""() => {
                        const c = window.card(), sr = c.shadowRoot, ha = sr.querySelector('ha-card').getBoundingClientRect();
                        const box = (sel) => { const n = sr.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
                        const chips = sr.querySelector('.room-chips');
                        const more = sr.querySelector('[data-action=map-more]');
                        return { cardW: ha.width, width: c.getAttribute('data-width'), panel: box('.panel'), map: box('.map-stage'),
                                 tools: box('.map-tools'), controls: box('.controls'), card: box('ha-card'), start: (sr.querySelector('[data-action=start] .ctl-text') || {}).textContent,
                                 chipsInPanel: !!(chips && chips.closest('.panel')), chipsUnderMap: !!sr.querySelector('.map-view > .room-chips'),
                                 visibleChips: Array.from(sr.querySelectorAll('.room-chip')).filter((b) => b.getBoundingClientRect().width > 0).length,
                                 more: !!more && more.getBoundingClientRect().width > 0,
                                 small: window.smallTargets(sr), pageOverflow: document.documentElement.scrollWidth - innerWidth };
                    }""")
                    name = f"layout-{'panel' if panel else 'karte'}-{task}-{width}-{th}.png"
                    page.screenshot(path=str(out_dir / name), full_page=not panel)
                    report["screenshots"].append(name)
                    layout.append({"panel": panel, "width": width, "theme": th, "task": task, **m})
    report["layout"] = layout
    lbad = lambda pred: [(x["panel"], x["width"], x["theme"], x["task"]) for x in layout if not pred(x)]
    wide = lambda x: x["cardW"] >= 900
    check("layout: two columns from 900 px card width, narrow below (48 cases, card width not window)",
          not lbad(lambda x: x["width"] == ("wide" if wide(x) else "narrow")), json.dumps(lbad(lambda x: x["width"] == ("wide" if wide(x) else "narrow"))))
    check("layout: wide = map left (flex), panel right 380 px; narrow = map 320 px above the sheet",
          not lbad(lambda x: (abs(x["panel"]["w"] - 380) <= 1.5 and x["map"]["r"] <= x["panel"]["l"] + 1) if wide(x)
                   else (x["map"]["b"] - 16 <= x["panel"]["t"] + 1 and abs(x["map"]["h"] - 320) <= 1)),
          json.dumps([(x["width"], x["panel"], x["map"]) for x in layout][:2]))
    check("layout: tool bar top right of the map; phone shows the tools button, two columns do not",
          not lbad(lambda x: x["tools"]["t"] - x["map"]["t"] <= 12 and x["map"]["r"] - x["tools"]["r"] <= 12 and x["more"] == (not wide(x))), "")
    check("layout: room chips in the panel, none below the map; Gesamt 3 + more, Raum all 7",
          not lbad(lambda x: x["chipsInPanel"] and not x["chipsUnderMap"] and x["visibleChips"] == (3 if x["task"] == "all" else 7)),
          json.dumps([(x["width"], x["task"], x["visibleChips"]) for x in layout][:6]))
    check("layout: primary label names the task (Alles reinigen / 2 Räume reinigen)",
          not lbad(lambda x: x["start"] == ("Alles reinigen" if x["task"] == "all" else "2 Räume reinigen")), "")
    # Sticky: at the panel's end, or at the card's visible bottom while the card scrolls (phone, long room list).
    check("layout: action bar at the bottom of the panel, sticky at the card's bottom while it scrolls",
          not lbad(lambda x: abs(x["controls"]["b"] - min(x["panel"]["b"], x["card"]["b"])) <= 1.5),
          json.dumps([(x["width"], x["task"], x["controls"]["b"], x["panel"]["b"], x["card"]["b"]) for x in layout
                      if abs(x["controls"]["b"] - min(x["panel"]["b"], x["card"]["b"])) > 1.5][:4]))
    check("layout: every visible button >= 44 px, no horizontal page overflow",
          not lbad(lambda x: not x["small"] and x["pageOverflow"] <= 0), json.dumps([(x["width"], x["small"]) for x in layout if x["small"]][:4]))
    # 0.2.2: HA's real panel structure and the station warning (live findings of 0.2.1).
    ha_panel_checks(page, data, room_pick, check, report, out_dir, ruhe)
    # Left-handed: panel left of the map, tool bar on the left.
    page.set_viewport_size({"width": 1296, "height": 900})
    build("docked", config={"left_handed": True}, panel=True)
    lh = page.evaluate("""() => { const sr = window.card().shadowRoot, p = sr.querySelector('.panel').getBoundingClientRect(),
        m = sr.querySelector('.map-stage').getBoundingClientRect(), t = sr.querySelector('.map-tools').getBoundingClientRect();
        return { panelLeft: p.right <= m.left + 1, toolsLeft: t.left - m.left <= 12 }; }""")
    page.screenshot(path=str(out_dir / "layout-panel-links-1280-light.png"))
    report["screenshots"].append("layout-panel-links-1280-light.png")
    page.set_viewport_size({"width": 406, "height": 900})
    build("docked", config={"left_handed": True})
    page.evaluate("() => window.card()._map._toggleTools(true)")
    lh_narrow = page.evaluate("""() => { const sr = window.card().shadowRoot, m = sr.querySelector('.map-stage').getBoundingClientRect(),
        t = sr.querySelector('.map-tools').getBoundingClientRect(); return { toolsLeft: t.left - m.left <= 12, inside: t.bottom <= m.bottom, small: window.smallTargets(sr) }; }""")
    page.screenshot(path=str(out_dir / "layout-karte-links-werkzeuge-390-light.png"), full_page=True)
    report["screenshots"].append("layout-karte-links-werkzeuge-390-light.png")
    check("layout: left-handed mirrors panel and tool bar (wide and phone, tools folded out inside the map)",
          lh["panelLeft"] and lh["toolsLeft"] and lh_narrow["toolsLeft"] and lh_narrow["inside"] and not lh_narrow["small"],
          json.dumps({"wide": lh, "narrow": lh_narrow}))


def bereich_dialog(k):
    """2. Dialoggeometrie, Drehen, Bestätigung, Einstellungsansicht."""
    page, report, check, out_dir, theme, build, ruhe, open_menu, open_placeholder, open_confirm = (
        k.page, k.report, k.check, k.out_dir, k.theme, k.build, k.ruhe, k.open_menu, k.open_placeholder, k.open_confirm)
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
            ruhe()
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
            ruhe("sr && (() => { const s = sr.querySelector('.sheet'), max = s.scrollHeight - s.clientHeight; return max <= 0 || Math.abs(s.scrollTop - max) <= 1; })()")
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
            ruhe(WANN_DIALOG_ZU)
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
    ruhe()
    page.set_viewport_size({"width": 640, "height": 360})
    ruhe()
    turned = page.evaluate("() => { const r = window.dialog().shadowRoot.querySelector('.sheet').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, H: innerHeight }; }")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; document.getElementById('pad').remove(); window.scrollTo(0, 0); }")
    check("after turning the phone the dialog fits again",
          abs(turned["top"]) <= 1 and abs(turned["bottom"] - turned["H"]) <= 1, json.dumps(turned))

    # Confirmation (CORE-20): 320 px on a desktop; on a phone the M11 bottom sheet (full width, >= 90 % high, at the bottom edge).
    confirm = []
    for w, h in ((1280, 800), (360, 640)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            build("docked")
            open_confirm()
            ruhe()
            r = page.evaluate("() => { const r = window.dialog().shadowRoot.querySelector('.sheet').getBoundingClientRect(); return { width: r.width, height: r.height, bottom: r.bottom, W: innerWidth, H: innerHeight, small: window.smallTargets(window.dialog().shadowRoot) }; }")
            shot = f"dialog-bestaetigung-{w}x{h}-{th}.png"
            page.screenshot(path=str(out_dir / shot))
            report["screenshots"].append(shot)
            page.evaluate("() => window.closeDialogs()")
            confirm.append({"w": w, "theme": th, **r})
    page.evaluate("() => { document.documentElement.style.overflow = ''; }")
    check("confirmation dialog 320 px wide on a desktop, on a phone a full-width bottom sheet >= 90 % high (M11), 44 px buttons",
          all((abs(x["width"] - 320) <= 0.5 if x["w"] > 450 else abs(x["width"] - x["W"]) <= 1 and x["height"] >= 0.9 * x["H"] - 1 and abs(x["bottom"] - x["H"]) <= 1)
              and not x["small"] for x in confirm), json.dumps(confirm))

    # Placeholder view, once per size class, for the eye.
    for w, h in ((390, 844), (1280, 800)):
        page.set_viewport_size({"width": w, "height": h})
        theme("dark")
        build("docked")
        open_placeholder()
        ruhe()
        shot = f"dialog-einstellungen-{w}x{h}-dark.png"
        page.screenshot(path=str(out_dir / shot))
        report["screenshots"].append(shot)
        page.evaluate("() => { window.dialog().close(); }")
        ruhe(WANN_DIALOG_ZU)


def bereich_bewegung(k):
    """3. Bewegung (Öffnungsanimation, reduzierte Bewegung) und Editor-Verdrahtung."""
    page, report, check, build, ruhe, frames, open_menu = k.page, k.report, k.check, k.build, k.ruhe, k.frames, k.open_menu
    # ------------------------------------------------------------------
    # 3. Motion: opening animation, reduced motion, hidden animations
    # ------------------------------------------------------------------
    def animations(config=None):
        build("docked", config=config)
        open_menu()
        frames()
        n = page.evaluate("() => { const sr = window.dialog().shadowRoot; return sr.querySelector('.sheet').getAnimations().length + sr.querySelector('.scrim').getAnimations().length; }")
        page.evaluate("() => window.dialog().close()")
        ruhe(WANN_DIALOG_ZU)
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


def bereich_kartenansicht(k):
    """3b. Kartenansicht: Bildmodus, Zoom, Sperre, Farben, Blase und Kartendialoge, Labormessung."""
    page, data, report, check, out_dir, theme, build, ruhe, shot, map_eval, open_obstacle, open_info, open_floors, cam, svg_size, routing = (
        k.page, k.data, k.report, k.check, k.out_dir, k.theme, k.build, k.ruhe, k.shot, k.map_eval, k.open_obstacle, k.open_info, k.open_floors, k.cam, k.svg_size, k.routing)
    # ------------------------------------------------------------------
    # 3b. Map view (map-view Task 12)
    # ------------------------------------------------------------------
    # Image fallback: overlays on the calibration's pixels.
    routing["data"] = False
    page.evaluate("() => customElements.get('busch-vacuum-card').__internals.FRAME_CACHE.clear()")  # M19 cache would still answer
    page.set_viewport_size({"width": 390, "height": 844})
    theme("light")
    image_data = json.loads(json.dumps(data["docked"]))
    image_data["states"]["camera.robo_map"]["attributes"]["vacuum_position"] = {"x": 1000, "y": 0, "a": 0}
    page.evaluate("(a) => window.buildCard(a)", {"data": image_data, "lang": "de", "config": {}, "panel": False})
    ruhe()
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
    page.evaluate("() => customElements.get('busch-vacuum-card').__internals.FRAME_CACHE.clear()")  # drop the cached empty_map answer

    # Zoom: buttons, keyboard, wheel; lock; motion.
    page.set_viewport_size({"width": 1280, "height": 900})
    build("docked")
    z = map_eval("""const k0 = m._view.a; sr.querySelector('[data-action=map-zoom-in]').click();
        const k1 = m._view.a, z1 = m._zoom, transition = getComputedStyle(m.pan).transitionDuration; m.region.focus();
        m.region.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
        const z2 = m._zoom; sr.querySelector('[data-action=map-fit]').click();
        const s = sr.querySelector('.map-stage').getBoundingClientRect();
        m.stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, clientX: s.left + 40, clientY: s.top + 40, bubbles: true, cancelable: true }));
        return { ratio: k1 / k0, z1, z2, wheel: m._zoom, transition, wheelTransition: getComputedStyle(m.pan).transitionDuration };""")
    ruhe()
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
        page.screenshot(path=str(out_dir / f"karte-{label}-390.png"), full_page=True)
        report["screenshots"].append(f"karte-{label}-390.png")

    # Obstacle bubble and dialog, map info, floors.
    dialogs = []
    for w, h in ((390, 844), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            build("docked")
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
                opener()
                ruhe()
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


def bereich_einstellungen(k):
    """3c. Geräteeinstellungen."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    # ------------------------------------------------------------------
    # 3c. Device settings (device-settings Task 11): overview, every group,
    #     search, forms, confirmations — geometry, touch targets, overflow
    # ------------------------------------------------------------------
    settings_views = [("uebersicht", [])]
    settings_views += [("gruppe-" + g, [(f"[data-group={g}]", None)]) for g in
                       ("cleaning", "mopping", "carpet", "station", "camera", "audio", "dnd", "schedule", "battery", "consumables", "info", "other")]
    settings_views += [
        ("suche", [(".settings-search", "carpet")]),
        ("suche-leer", [(".settings-search", "xyz")]),
        ("dnd-formular", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None)]),
        # DnD without weekdays: the inline error is start = end (first period 12:00–13:00 → start 13:00).
        ("dnd-fehler", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None), ("[data-field=start]", "13:00"), ("[data-action=save]", None)]),
        ("zeitplan-loeschen", [("[data-group=schedule]", None), ("[data-action=schedule-edit]", None), ("[data-action=delete]", None)]),
        ("zeitplan-formular", [("[data-group=schedule]", None), ("[data-action=schedule-edit]", None)]),
        ("sprachpaket-fehler", [("[data-group=audio]", None), ("[data-action=voice-pack]", None), ("[data-action=submit]", None)]),
        ("zubehoer-zuruecksetzen", [("[data-group=consumables]", None), ("[data-part=filter] [data-action=reset]", None)]),
        ("rotation-bestaetigen", [("[data-group=other]", None), ("[data-setting=map_rotation] select", "90")]),
        ("dnd-loeschen", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None), ("[data-action=delete]", None)]),
        ("sprachpaket-bestaetigen", [("[data-group=audio]", None), ("[data-action=voice-pack]", None), ("[data-field=lang_id]", "de2"),
                                     ("[data-field=url]", "https://example.invalid/pack.zip"), ("[data-field=md5]", "0123456789abcdef0123456789abcdef"),
                                     ("[data-field=size]", "1234"), ("[data-action=submit]", None)]),
    ]
    settings_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for label, steps in settings_views:
                build("settings")
                title = page.evaluate(settings_open, steps)
                # The opening animation runs 0.3 s; measure after it settled.
                ruhe()
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
    bad = [x for x in settings_geo if not inside(x) or x["small"] or x["smallFields"] or x["overflowX"] > 1 or str(x["title"]).startswith("missing")]
    check(f"device settings: {len(settings_views)} views x 4 sizes x 2 themes inside the viewport, no sideways overflow, 44 px buttons and fields",
          not bad, json.dumps(bad[:4]))
    by = {x["label"]: x for x in settings_geo if x["w"] == 390 and x["theme"] == "light"}
    check("device settings: titles, rows and states as expected (search hits, inline errors, confirmations narrow)",
          by["uebersicht"]["title"] == "Geräteeinstellungen" and by["gruppe-carpet"]["rows"] == 7 and by["suche"]["rows"] >= 7
          and by["suche-leer"]["rows"] == 0 and by["dnd-fehler"]["errors"] == 1 and by["sprachpaket-fehler"]["errors"] == 4
          and all(by[k]["kind"] == "confirm" for k in ("zeitplan-loeschen", "zubehoer-zuruecksetzen", "rotation-bestaetigen", "dnd-loeschen", "sprachpaket-bestaetigen"))
          and by["gruppe-station"]["title"] == "Station" and by["gruppe-info"]["rows"] >= 8,
          json.dumps({k: {"title": v["title"], "rows": v["rows"], "errors": v["errors"], "kind": v["kind"]} for k, v in by.items()}))


def bereich_station(k):
    """3d. Station."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    # ------------------------------------------------------------------
    # 3d. Station (dock Task 4): dock button, menu, every tab, confirmation,
    #     keyboard — geometry, touch targets, overflow, no service call
    # ------------------------------------------------------------------
    dock_views = [
        ("menue", []),
        ("waschen", [einstellungen]),
        ("trocknen", [einstellungen, "[data-tab=dry]"]),
        ("entleeren", [einstellungen, "[data-tab=empty]"]),
        ("ablassen-bestaetigen", [einstellungen, "[data-station-action=drain]"]),
    ]
    # Size and theme as the full run leaves them after "einstellungen" (so --nur station measures the same).
    page.set_viewport_size({"width": 1280, "height": 800})
    theme("dark")
    build("docked")
    dock_button = page.evaluate("""() => { const b = window.card().shadowRoot.querySelector('.dock'), r = b.getBoundingClientRect();
        return { tag: b.tagName, popup: b.getAttribute('aria-haspopup'), level: b.getAttribute('data-dock'), text: b.textContent,
                 label: b.getAttribute('aria-label'), w: r.width, h: r.height }; }""")
    # 0.2.2: visible "Dock", the station's name (and any warning) in aria-label; the warning's words in the hint bar.
    check("dock button: a 44 px button with menu popup, text and level", dock_button["tag"] == "BUTTON" and dock_button["popup"] == "menu"
          and dock_button["h"] >= 44 and dock_button["w"] >= 44 and dock_button["text"] == "Dock"
          and str(dock_button["label"]).startswith("Station") and dock_button["level"] == "ok", json.dumps(dock_button))
    dock_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for label, steps in dock_views:
                build("docked")
                title = page.evaluate(dock_open, steps)
                ruhe()
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
    page.evaluate(dock_open, [einstellungen])
    ruhe()
    page.evaluate("() => window.dialog().shadowRoot.querySelector('[role=tab]').focus()")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("End")
    keys = page.evaluate("""() => { const sr = window.dialog().shadowRoot; return { active: sr.activeElement ? sr.activeElement.getAttribute('data-tab') : null,
        selected: sr.querySelector('[role=tab][aria-selected=true]').getAttribute('data-tab'), stored: localStorage.getItem('busch-vacuum-card:dock-tab:vacuum.robo') }; }""")
    page.keyboard.press("Escape")
    ruhe("sr && sr.querySelector('.sheet').getAttribute('data-kind') === 'menu'")
    back = page.evaluate("() => window.dialog() ? window.dialog().shadowRoot.querySelector('.sheet').getAttribute('data-kind') : null")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
    check("station keyboard: arrows/End move tab and focus, tab remembered, Escape goes back to the menu",
          keys == {"active": "empty", "selected": "empty", "stored": "empty"} and back == "menu", json.dumps({"keys": keys, "back": back}))


def bereich_shortcuts(k):
    """3e. Shortcuts."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    # ------------------------------------------------------------------
    # 3e. Shortcuts (shortcuts Task 4): button, menu, management, rename,
    #     delete confirmation — synthetic shortcuts, no service call
    # ------------------------------------------------------------------
    short_views = [
        ("menue", []),
        ("verwaltung", ["[data-action=manage]"]),
        ("umbenennen", ["[data-action=manage]", "[data-manage='32'] [data-action=rename]"]),
        ("loeschen", ["[data-action=manage]", "[data-manage='31'] [data-action=delete]"]),
    ]
    # Size and theme as the full run leaves them after "station" (so --nur shortcuts measures the same).
    page.set_viewport_size({"width": 390, "height": 844})
    theme("dark")
    build("shortcuts", config=short_config)
    short_button = page.evaluate("""() => { const b = window.card().shadowRoot.querySelector('[data-action=shortcuts]'); if (!b) return null; const r = b.getBoundingClientRect();
        return { popup: b.getAttribute('aria-haspopup'), text: b.textContent, h: r.height, w: r.width,
                 beforeDock: Array.from(b.parentNode.children).indexOf(b) < Array.from(b.parentNode.children).indexOf(b.parentNode.querySelector('.dock')) }; }""")
    check("shortcuts button: 44 px, menu popup, text, ahead of the station", bool(short_button) and short_button["popup"] == "menu"
          and short_button["h"] >= 44 and "Shortcuts" in short_button["text"] and short_button["beforeDock"], json.dumps(short_button))
    short_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for label, steps in short_views:
                build("shortcuts", config=short_config)
                title = page.evaluate(short_open, steps)
                ruhe()
                g = page.evaluate("""() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
                    const fields = Array.from(sr.querySelectorAll('select, input')).filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44).length;
                    return { kind: sheet.getAttribute('data-kind'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                             overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr), smallFields: fields,
                             entries: Array.from(sr.querySelectorAll('[data-shortcut]')).map((n) => n.getAttribute('data-shortcut')),
                             rows: sr.querySelectorAll('[data-manage]').length }; }""")
                if (w, th) in ((360, "light"), (1280, "dark")):
                    shot(f"shortcuts-{label}-{w}x{h}-{th}.png")
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                short_geo.append({"label": label, "w": w, "h": h, "theme": th, "title": title, **g})
    report["shortcutDialogs"] = short_geo
    bad = [x for x in short_geo if not inside(x) or x["small"] or x["smallFields"] or x["overflowX"] > 1 or str(x["title"]).startswith("missing")]
    check("shortcuts: menu, management, rename and delete x 4 sizes x 2 themes inside the viewport, no sideways overflow, 44 px buttons and fields",
          not bad, json.dumps(bad[:4]))
    by = {x["label"]: x for x in short_geo if x["w"] == 390 and x["theme"] == "light"}
    check("shortcuts: scripts first, shortcuts by index, management rows, rename form, delete confirmation",
          by["menue"]["kind"] == "menu" and by["menue"]["entries"] == ["script:script.abendrunde", "device:30", "device:32", "device:31"]
          and by["verwaltung"]["rows"] == 3 and by["umbenennen"]["kind"] == "editor" and by["loeschen"]["kind"] == "confirm",
          json.dumps({k: {"title": v["title"], "kind": v["kind"], "entries": v["entries"], "rows": v["rows"]} for k, v in by.items()}))


def bereich_aufgaben(k):
    """3f. Aufgaben Raum/Zone/Spot/Ziel."""
    page, report, check, out_dir, theme, build, ruhe, shot, map_eval, cam, grid = (
        k.page, k.report, k.check, k.out_dir, k.theme, k.build, k.ruhe, k.shot, k.map_eval, k.cam, k.grid)
    # ------------------------------------------------------------------
    # 3f. Tasks (clean-tasks): room, zone, spot, go-to with real pointer
    #     events (mouse) and keys; deliberate starts are recorded and
    #     removed, so "no service call without a click" still holds
    # ------------------------------------------------------------------
    def task_build(task, w=390, h=844, th="light", state="docked", config=None):
        page.set_viewport_size({"width": w, "height": h})
        theme(th)
        build(state, config=config)
        page.evaluate("""(t) => { const c = window.card(); c.shadowRoot.querySelector('[data-task=' + t + ']').click();
            c._map.el.scrollIntoView({ block: 'start' }); }""", task)
        ruhe()

    def at(x, y):
        """Client point of a robot-mm point."""
        return map_eval("const p = m.toScreen(m.toImage({ x: %f, y: %f })); return [p.x, p.y];" % (x, y))

    def drag(a, b, steps=6):
        page.mouse.move(a[0], a[1])
        page.mouse.down()
        for i in range(1, steps + 1):
            page.mouse.move(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps)
        page.mouse.up()
        ruhe()

    def task_state():
        return map_eval("""const t = (s) => Array.from(c._taskArea.querySelectorAll(s));
            return { sel: JSON.parse(JSON.stringify(c._selection)), mode: m._mode,
                     start: (sr.querySelector('[data-action=start]') || {}).disabled,
                     hint: (sr.querySelector('#task-hint') || {}).textContent || '',
                     small: window.smallTargets(sr), overflowX: document.documentElement.scrollWidth - innerWidth,
                     chips: Array.from(sr.querySelectorAll('.room-chip[aria-pressed=true]')).map((b) => b.getAttribute('data-room')),
                     list: t('.task-item').map((b) => b.textContent), layer: sr.querySelectorAll('[data-layer=tasks] [data-select]').length };""")

    def task_calls():
        calls = page.evaluate("() => { const c = window.__serviceCalls; window.__serviceCalls = []; return c; }")
        report.setdefault("taskCalls", []).extend(calls)
        return calls

    rooms = cam["rooms"]
    task_build("room")
    for rid in ("5", "3"):
        page.mouse.click(*at(rooms[rid]["x"], rooms[rid]["y"]))
        ruhe()
    room = task_state()
    shot("aufgabe-raum-390-light.png")
    check("tasks room: two taps on the map choose rooms 5 and 3, chips pressed, marks on the map, Start enabled",
          room["mode"] == "pick-room" and room["sel"]["rooms"] == [5, 3] and sorted(room["chips"]) == ["3", "5"]
          and room["layer"] == 2 and room["start"] is False and not room["small"], json.dumps(room))
    page.evaluate("() => window.card().shadowRoot.querySelector('[data-action=start]').click()")
    ruhe(WANN_AUFRUF)
    calls = task_calls()
    check("tasks room: Start = exactly vacuum_clean_segment with segments [5, 3]",
          len(calls) == 1 and calls[0]["service"] == "vacuum_clean_segment" and calls[0]["payload"]["segments"] == [5, 3], json.dumps(calls))

    task_build("zone")
    r5, r3 = rooms["5"], rooms["3"]
    page.mouse.click(*at(r5["x"], r5["y"]))
    ruhe()
    drag(at(r3["x"] - 1500, r3["y"] - 1000), at(r3["x"] + 500, r3["y"] + 800))
    zone_a = task_state()
    before = zone_a["sel"]["zones"][0]
    drag(at((before["x0"] + before["x1"]) / 2, (before["y0"] + before["y1"]) / 2), at((before["x0"] + before["x1"]) / 2 + 600, (before["y0"] + before["y1"]) / 2))
    moved = task_state()["sel"]["zones"][0]
    corner = map_eval("const h = c._zoneHandles(0); return [h.corners[2].x, h.corners[2].y];")
    drag([corner[0] + 16, corner[1] + 10], at(moved["x1"] + 700, moved["y1"] + 700))
    resized = task_state()["sel"]["zones"][0]
    handles = map_eval("""return Array.from(sr.querySelectorAll('[data-layer=tasks] [data-handle=corner]')).map((g) => { const r = g.getBoundingClientRect(); return [r.width, r.height]; });""")
    shot("aufgabe-zone-390-light.png")
    page.evaluate("() => { const b = window.card()._taskArea.querySelector('[data-action=zone-0]'); b.focus(); }")
    page.keyboard.press("ArrowRight")
    ruhe()
    keyed = task_state()
    shot("aufgabe-zone-liste-390-light.png")
    check("tasks zone: tap adds 1.5 m, drag draws a second, area drag moves +600 mm, corner handle 16 px beside the corner scales, key moves 100 mm",
          len(zone_a["sel"]["zones"]) == 2 and abs((before["x1"] - before["x0"]) - 1500) <= 60
          and abs(moved["x0"] - before["x0"] - 600) <= 60 and resized["x1"] > moved["x1"] + 300 and resized["x0"] == moved["x0"]
          and abs(keyed["sel"]["zones"][0]["x0"] - resized["x0"] - 100) <= 1 and keyed["list"][0].startswith("Bereich 1")
          and not keyed["small"] and keyed["overflowX"] <= 0 and len(handles) == 8,
          json.dumps({"a": zone_a["sel"], "moved": moved, "resized": resized, "keyed": keyed["sel"], "list": keyed["list"], "small": keyed["small"], "handles": handles}))
    page.evaluate("() => window.card().shadowRoot.querySelector('[data-action=start]').click()")
    ruhe(WANN_AUFRUF)
    calls = task_calls()
    check("tasks zone: Start = exactly vacuum_clean_zone with two whole-mm rectangles",
          len(calls) == 1 and calls[0]["service"] == "vacuum_clean_zone" and len(calls[0]["payload"]["zone"]) == 2
          and all(isinstance(v, int) for z in calls[0]["payload"]["zone"] for v in z), json.dumps(calls))

    task_build("spot")
    page.mouse.click(*at(r5["x"], r5["y"]))
    ruhe()
    page.mouse.click(*at(r3["x"], r3["y"]))
    ruhe()
    # Left edge of the map, half way down: outside the floor, inside the stage.
    page.mouse.click(*at(grid["size"][0] + 60, grid["size"][1] + grid["size"][5] * grid["size"][6] / 2))
    ruhe()
    spot = task_state()
    outside = map_eval("return (c._taskArea.querySelector('[data-note=outside]') || {}).textContent || '';")
    shot("aufgabe-spot-390-light.png")
    x_at = map_eval("const h = c._spotHandles(1); return [h.remove.x, h.remove.y];")
    page.mouse.click(*x_at)
    ruhe()
    after_x = task_state()
    check("tasks spot: two taps set two points with 1.5 m squares, a tap outside the floor sets none and says why, the x removes one",
          len(spot["sel"]["spots"]) == 2 and spot["layer"] == 2 and "befahrbar" in outside and len(after_x["sel"]["spots"]) == 1 and not spot["small"],
          json.dumps({"spot": spot["sel"], "outside": outside, "after": after_x["sel"]}))
    page.evaluate("() => window.card().shadowRoot.querySelector('[data-action=start]').click()")
    ruhe(WANN_AUFRUF)
    calls = task_calls()
    check("tasks spot: Start = exactly vacuum_clean_spot with one point",
          len(calls) == 1 and calls[0]["service"] == "vacuum_clean_spot" and len(calls[0]["payload"]["points"]) == 1, json.dumps(calls))

    task_build("goto")
    page.mouse.click(*at(r5["x"], r5["y"]))
    ruhe()
    goto = map_eval("""const b = sr.querySelector('.task-bubble'), r = b.getBoundingClientRect(), s = m.stage.getBoundingClientRect();
        const go = sr.querySelector('[data-action=goto-start]').getBoundingClientRect();
        return { sel: c._selection.goto, inside: r.left >= s.left - 1 && r.right <= s.right + 1 && r.bottom <= s.bottom + 1 && r.top >= s.top - 1,
                 lowerHalf: r.top > s.top + s.height / 2, go: [go.width, go.height], text: b.textContent,
                 controls: Array.from(sr.querySelectorAll('.ctl')).map((n) => n.getAttribute('data-action')), small: window.smallTargets(sr) };""")
    shot("aufgabe-goto-390-light.png")
    check("tasks go-to: tap sets the target, bubble 'Hierhin fahren' at the bottom of the map (R23), no Start/Return buttons, 44 px",
          goto["sel"] is not None and goto["inside"] and goto["lowerHalf"] and "Hierhin fahren" in goto["text"]
          and "start" not in goto["controls"] and "return" not in goto["controls"] and goto["go"][1] >= 44 and not goto["small"], json.dumps(goto))
    page.evaluate("() => window.card().shadowRoot.querySelector('[data-action=goto-start]').click()")
    ruhe(WANN_AUFRUF)
    calls = task_calls()
    check("tasks go-to: 'Hierhin fahren' = exactly vacuum_goto { x, y } in whole mm",
          len(calls) == 1 and calls[0]["service"] == "vacuum_goto" and isinstance(calls[0]["payload"]["x"], int), json.dumps(calls))
    task_build("goto")
    page.mouse.click(*at(r5["x"], r5["y"]))
    ruhe()
    page.evaluate("() => window.card().shadowRoot.querySelector('[data-action=goto-start]').focus()")
    page.keyboard.press("Escape")
    ruhe()
    esc = map_eval("return { bubble: !!sr.querySelector('.task-bubble'), sel: c._selection.goto };")
    check("tasks go-to: one Escape closes the target bubble (rule 2, R04)", not esc["bubble"] and esc["sel"] is None, json.dumps(esc))

    # Keyboard: the task radio group moves with arrows; a key on the zone entry moves it (done above).
    build("docked")
    page.evaluate("() => window.card().shadowRoot.querySelector('[data-task=all]').focus()")
    page.keyboard.press("ArrowRight")
    ruhe()
    radio = page.evaluate("""() => { const sr = window.card().shadowRoot; return { checked: sr.querySelector('.task[aria-checked=true]').getAttribute('data-task'),
        focus: sr.activeElement && sr.activeElement.getAttribute('data-task'), mode: window.card()._map._mode }; }""")
    check("tasks keyboard: ArrowRight in the radio group chooses Raum and keeps focus, map in pick-room",
          radio == {"checked": "room", "focus": "room", "mode": "pick-room"}, json.dumps(radio))

    # Matrix: every type with a selection at 360/390/800/1280 x light/dark.
    task_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for t in ("room", "zone", "spot", "goto"):
                build("docked")
                page.evaluate(task_prepare, t)
                ruhe()
                g = page.evaluate("""() => { const c = window.card(), sr = c.shadowRoot, a = c._taskArea.getBoundingClientRect(), k = c.getBoundingClientRect();
                    return { overflowX: document.documentElement.scrollWidth - innerWidth, small: window.smallTargets(sr),
                             areaInside: a.left >= k.left - 1 && a.right <= k.right + 1, layer: sr.querySelectorAll('[data-layer=tasks] [data-select]').length }; }""")
                if (w, th) in ((360, "light"), (1280, "dark")) or (w == 390 and th == "dark"):
                    page.evaluate("() => window.card()._map.el.scrollIntoView({ block: 'start' })")
                    page.screenshot(path=str(out_dir / f"aufgabe-{t}-{w}x{h}-{th}.png"), full_page=True)
                    report["screenshots"].append(f"aufgabe-{t}-{w}x{h}-{th}.png")
                task_geo.append({"task": t, "w": w, "theme": th, **g})
    report["taskMatrix"] = task_geo
    bad = [x for x in task_geo if x["overflowX"] > 0 or x["small"] or not x["areaInside"] or x["layer"] < 1]
    check("tasks matrix: room/zone/spot/go-to x 360/390/800/1280 x light/dark without sideways overflow, 44 px targets, selection drawn",
          not bad, json.dumps(bad[:4]))
    report["taskCallsTotal"] = len(report.get("taskCalls", []))
    page.evaluate("() => { window.__serviceCalls = []; }")


def bereich_verlauf(k):
    """3h. Reinigungsverlauf."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    # ------------------------------------------------------------------
    # 3h. History (history Task 7): list, group open, detail with cleaning and WiFi
    #     map, obstacle photo, re-clean confirmation, cruising list/detail, empty;
    #     keyboard; no service call (the confirmation is only opened)
    # ------------------------------------------------------------------
    hist_views = [
        ("liste", "docked", "history", []),
        ("liste-gruppe", "docked", "history", ["[data-group='1794228271']"]),
        ("detail", "docked", "history", detail_steps),
        ("detail-wlan", "docked", "history", detail_steps + ["[data-tab=wifi]"]),
        ("hindernisfoto", "docked", "history", detail_steps + ["[data-obstacle='2']"]),
        ("bestaetigung", "docked", "history", detail_steps + ["[data-reclean-room='4']", "[data-reclean-room='5']", "[data-reclean-room='9']", "[data-action=reclean]"]),
        ("cruising", "docked", "cruising_history", []),
        ("cruising-detail", "docked", "cruising_history", ["[data-run='1745078136']"]),
        ("leer", "history_empty", "history", []),
    ]
    hist_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for label, state, entry, steps in hist_views:
                build(state)
                title = page.evaluate(hist_open, {"entry": entry, "steps": steps})
                ruhe()
                g = page.evaluate("""() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
                    const c = sr.querySelector('.history-map-canvas'), img = sr.querySelector('.obstacle-photo');
                    return { kind: sheet.getAttribute('data-kind'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                             overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr),
                             runs: sr.querySelectorAll('[data-run]').length, groups: sr.querySelectorAll('[data-group]').length,
                             canvas: c ? { w: c.width, h: c.height, shown: c.getBoundingClientRect().width, alt: c.getAttribute('aria-label') } : null,
                             tabs: Array.from(sr.querySelectorAll('[role=tab]')).map((t) => t.getAttribute('aria-selected')),
                             paths: sr.querySelectorAll('[data-path]').length, markers: sr.querySelectorAll('[data-marker]').length,
                             facts: Object.fromEntries(Array.from(sr.querySelectorAll('[data-fact]')).map((n) => [n.getAttribute('data-fact'), n.textContent])),
                             photo: img ? img.naturalWidth : null, chips: sr.querySelectorAll('[data-reclean-room]').length,
                             empty: !!sr.querySelector('.history-empty'), loading: !!sr.querySelector('[data-load=loading]') }; }""")
                if (w, th) in ((360, "light"), (1280, "dark")) or (w == 390 and th == "dark"):
                    shot(f"verlauf-{label}-{w}x{h}-{th}.png")
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                hist_geo.append({"label": label, "w": w, "h": h, "theme": th, "title": title, **g})
    report["historyDialogs"] = hist_geo
    bad = [x for x in hist_geo if not inside(x) or x["small"] or x["overflowX"] > 1 or str(x["title"]).startswith("missing")]
    check("history: 9 views x 4 sizes x 2 themes inside the viewport, no sideways overflow, 44 px buttons",
          not bad, json.dumps(bad[:4]))
    by = {x["label"]: x for x in hist_geo if x["w"] == 390 and x["theme"] == "light"}
    d = by["detail"]
    check("history: list/groups, detail with painted map, path and obstacle marker, counters from the gzip data, WiFi tab, photo, confirmation, cruising, empty",
          by["liste"]["title"] == "Reinigungsverlauf" and by["liste"]["groups"] >= 10 and by["liste-gruppe"]["runs"] > by["liste"]["runs"]
          and d["canvas"] and d["canvas"]["w"] > 0 and d["canvas"]["shown"] > 200 and d["canvas"]["alt"].startswith("Karte des Laufs vom")
          and d["paths"] == 1 and d["markers"] == 1 and d["facts"].get("startup_method") == "App" and d["facts"].get("mop_wash_count") == "3"
          and not d["loading"] and d["chips"] == 3 and d["tabs"] == ["true", "false"]
          and by["detail-wlan"]["tabs"] == ["false", "true"] and by["detail-wlan"]["canvas"]["alt"].startswith("WLAN-Karte") and by["detail-wlan"]["paths"] == 0
          and by["hindernisfoto"]["photo"] == 320 and by["bestaetigung"]["kind"] == "confirm"
          and by["cruising"]["title"] == "Cruising-Verlauf" and by["cruising"]["runs"] == 1 and by["cruising-detail"]["tabs"] == []
          and by["cruising-detail"]["chips"] == 0 and by["leer"]["empty"] and by["leer"]["runs"] == 0,
          json.dumps({k: {kk: v[kk] for kk in ("title", "runs", "groups", "canvas", "tabs", "paths", "markers", "facts", "photo", "chips", "empty", "kind")} for k, v in by.items()}))
    # Real keyboard: Enter opens a run, → pages to the older one, Escape returns to the list with the focus on that run.
    page.set_viewport_size({"width": 390, "height": 844})
    theme("light")
    build("docked")
    page.evaluate(hist_open, {"entry": "history", "steps": []})
    ruhe()
    page.evaluate("() => window.dialog().shadowRoot.querySelector('[data-run=\"1794047923\"]').focus()")
    page.keyboard.press("Enter")
    ruhe(wann_ansicht("history-detail"))
    first = page.evaluate("() => window.dialog().shadowRoot.querySelector('h1').textContent")
    page.evaluate("() => window.dialog().shadowRoot.querySelector('[data-action=older]').focus()")
    page.keyboard.press("ArrowRight")
    ruhe(wann_ansicht("history-detail") + " && sr.querySelector('h1').textContent !== " + json.dumps(first))
    second = page.evaluate("() => window.dialog().shadowRoot.querySelector('h1').textContent")
    page.keyboard.press("Escape")
    ruhe(wann_ansicht("history"))
    back = page.evaluate("() => { const sr = window.dialog().shadowRoot, a = sr.activeElement; return [sr.querySelector('h1').textContent, a && (a.getAttribute('data-run') || a.getAttribute('data-group'))]; }")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
    check("history keyboard: Enter opens the run, ArrowRight pages to the older one, Escape back to the list with the focus on the run seen last",
          first != second and ":" in first and back[0] == "Reinigungsverlauf" and back[1] is not None,
          json.dumps({"first": first, "second": second, "back": back}))


def bereich_fernsteuerung(k):
    """3i. Fernsteuerung."""
    page, browser, data, report, check, out_dir, theme, build, ruhe, frames, beobachte, shot, camera_route, port, harness, repo_root = (
        k.page, k.browser, k.data, k.report, k.check, k.out_dir, k.theme, k.build, k.ruhe, k.frames, k.beobachte, k.shot, k.camera_route, k.port, k.harness, k.repo_root)
    # ------------------------------------------------------------------
    # 3i. Remote control (remote Task 6): unarmed/armed at 390x844, 844x390 and 1280x800,
    #     light/dark; real pointer input (mouse and two touch points over CDP), keyboard,
    #     stop after release/blur/visibilitychange. Every service call lands in the harness
    #     stub (window.__serviceCalls) -- nothing reaches a device -- and is cleared afterwards.
    # ------------------------------------------------------------------
    remote_geo_js = """() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
        const box = (sel) => { const n = sr.querySelector(sel); if (!n || !n.getClientRects().length) return null; const b = n.getBoundingClientRect();
            return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; };
        const base = sr.querySelector('.remote-map-base'), active = sr.activeElement;
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                 overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr), state: sr.querySelector('.remote').getAttribute('data-state'),
                 speed: box('[data-axis="velocity"]'), turn: box('[data-axis="turn"]'), map: box('.remote-map'), holds: box('.remote-holds'),
                 base: base ? { tag: base.tagName, w: base.width || base.naturalWidth || 0 } : null, robot: box('.remote-robot'),
                 warning: box('.remote-warning'), help: box('.remote-help'), arm: box('[data-action="arm"]'), stop: box('[data-action="stop"]'),
                 knobs: Array.from(sr.querySelectorAll('.remote-knob')).map((k) => { const b = k.getBoundingClientRect(); return Math.abs(b.width - b.height) <= 1; }),
                 focus: active ? (active.getAttribute('data-axis') || active.getAttribute('data-action')) : null }; }"""
    remote_geo = []
    for w, h in ((390, 844), (844, 390), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for armed in (False, True):
                build("docked")
                title = page.evaluate(remote_open, armed)
                ruhe()
                g = page.evaluate(remote_geo_js)
                shot(f"fernsteuerung-{'frei' if armed else 'unscharf'}-{w}x{h}-{th}.png")
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                remote_geo.append({"w": w, "h": h, "theme": th, "armed": armed, "title": title, **g})
    report["remoteDialogs"] = remote_geo
    bad = [x for x in remote_geo if not inside(x) or x["small"] or x["overflowX"] > 1 or x["title"] != "Fernsteuerung"
           or min(x["speed"]["w"], x["speed"]["h"], x["turn"]["w"], x["turn"]["h"]) < 48
           or x["speed"]["bottom"] > x["H"] + 0.5 or x["turn"]["bottom"] > x["H"] + 0.5
           or not x["stop"] or x["stop"]["bottom"] > x["H"] + 0.5 or x["knobs"] != [True, True]]
    check("remote: 3 sizes x 2 themes x unarmed/armed inside the viewport, no sideways overflow, 44 px buttons, sticks >= 48 px, round knobs, sticks and Stop on screen without scrolling",
          not bad, json.dumps(bad[:3]))
    port_ = [x for x in remote_geo if x["w"] == 390]
    land = [x for x in remote_geo if x["w"] == 844]
    desk = [x for x in remote_geo if x["w"] == 1280]
    check("remote layout: portrait map above the sticks (speed left, steering right); phone landscape sticks at the edges around the map; desktop with keyboard help; map copied from the one MapView with a robot marker",
          all(x["map"] and x["map"]["bottom"] <= x["speed"]["top"] + 0.5 and x["speed"]["right"] <= x["turn"]["left"] for x in port_)
          and all(x["map"] and x["speed"]["right"] <= x["map"]["left"] and x["turn"]["left"] >= x["map"]["right"] for x in land)
          and all(x["help"] for x in desk) and all(x["help"] is None for x in land)
          and all(x["warning"] for x in remote_geo)
          and all(x["base"] and x["base"]["w"] > 0 and x["robot"] for x in remote_geo),
          json.dumps([{k: x[k] for k in ("w", "h", "armed", "map", "speed", "turn", "help", "base", "robot")} for x in remote_geo if x["theme"] == "light"]))
    check("remote: opens unarmed with the start button, armed hides it and puts the focus on the speed stick; no call by opening or arming",
          all((x["state"] == "unarmed" and x["arm"]) if not x["armed"] else (x["state"] == "ready" and x["arm"] is None and x["focus"] == "velocity") for x in remote_geo),
          json.dumps([{k: x[k] for k in ("w", "armed", "state", "arm", "focus")} for x in remote_geo]))

    calls = lambda: page.evaluate("() => window.__serviceCalls.map((c) => [c.service, c.payload.velocity, c.payload.rotation, Math.round(c.at)])")
    moves = lambda cs: [c for c in cs if c[0] == "vacuum_remote_control_move_step"]
    centre = lambda sel: page.evaluate("""(sel) => { const b = window.dialog().shadowRoot.querySelector(sel).getBoundingClientRect();
        return [b.left + b.width / 2, b.top + b.height / 2, b.width, b.height]; }""", sel)
    remote = {}
    page.set_viewport_size({"width": 390, "height": 844})
    theme("light")
    build("docked")
    # Unarmed: a real drag sends nothing.
    page.evaluate(remote_open, False)
    ruhe()
    x, y, sw, sh = centre('[data-axis="velocity"]')
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y - sh / 2, steps=5)
    page.wait_for_timeout(400)  # real time on purpose: unarmed, NOTHING may be sent while the stick is held
    page.mouse.up()
    remote["unarmed"] = calls()
    # Armed, mouse: drag up, hold, release.
    page.evaluate(remote_open, True)
    ruhe()
    x, y, sw, sh = centre('[data-axis="velocity"]')
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y - sh / 2, steps=5)
    page.wait_for_timeout(1000)  # real time on purpose: holding the stick, the 200 ms step spacing is measured from the calls
    held = page.evaluate("() => window.dialog().shadowRoot.querySelector('[data-axis=\"velocity\"]').getAttribute('aria-valuetext')")
    page.mouse.up()
    ruhe(WANN_STOPP)
    remote["mouse"] = calls()
    remote["mouseHeld"] = held
    remote["mouseAfter"] = page.evaluate("() => window.dialog().shadowRoot.querySelector('[data-axis=\"velocity\"]').getAttribute('aria-valuetext')")
    # Keyboard: W+D held, then release; blur and visibilitychange while W is held.
    page.evaluate(remote_open, True)
    ruhe()
    page.keyboard.down("w")
    page.keyboard.down("d")
    page.wait_for_timeout(1100)  # real time on purpose: keys held, rate (<= 5 calls/s) and spacing are measured over it
    page.keyboard.up("w")
    page.keyboard.up("d")
    ruhe(WANN_STOPP)
    remote["keys"] = calls()
    page.evaluate(remote_open, True)
    ruhe()
    page.keyboard.down("w")
    page.wait_for_timeout(450)  # real time on purpose: driving while held (a few steps) before control is lost
    page.evaluate("() => window.dispatchEvent(new Event('blur'))")
    ruhe(WANN_STOPP)
    page.keyboard.up("w")
    remote["blur"] = calls()
    page.evaluate(remote_open, True)
    ruhe()
    page.keyboard.down("ArrowUp")
    page.wait_for_timeout(450)  # real time on purpose: driving while held (a few steps) before control is lost
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; }""")
    ruhe(WANN_STOPP)
    page.keyboard.up("ArrowUp")
    remote["hidden"] = calls()
    page.evaluate(remote_open, True)
    ruhe()
    page.keyboard.down("ArrowUp")
    page.wait_for_timeout(450)  # real time on purpose: driving while held (a few steps) before control is lost
    page.keyboard.press("Escape")
    ruhe(WANN_DIALOG_ZU + " && " + WANN_STOPP)
    page.keyboard.up("ArrowUp")
    remote["escape"] = calls()
    remote["escapeOpen"] = page.evaluate("() => !!window.dialog()")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
    # Reduced motion: the knob springs back without a transition.
    page.emulate_media(reduced_motion="reduce")
    page.evaluate(remote_open, False)
    remote["reducedTransition"] = page.evaluate("() => getComputedStyle(window.dialog().shadowRoot.querySelector('.remote-knob')).transitionDuration")
    page.emulate_media(reduced_motion="no-preference")
    remote["normalTransition"] = page.evaluate("() => getComputedStyle(window.dialog().shadowRoot.querySelector('.remote-knob')).transitionDuration")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
    # Two fingers at once: real touch points over CDP (each its own pointerId and capture).
    touch_ctx = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, locale="de-DE", has_touch=True, is_mobile=True)
    tp = touch_ctx.new_page()
    beobachte(tp)
    tp.on("console", lambda m: report["consoleErrors"].append(m.text) if m.type == "error" else None)
    tp.on("pageerror", lambda e: report["pageErrors"].append(str(e)))
    tp.route("**/api/camera_*proxy/**", camera_route)
    tp.goto(f"http://127.0.0.1:{port}/{harness.relative_to(repo_root).as_posix()}")
    tp.wait_for_function("() => !!customElements.get('busch-vacuum-card')", timeout=15000)
    tp.evaluate("(a) => window.buildCard(a)", {"data": data["docked"], "lang": "de", "config": {}, "panel": False})
    ruhe(pg=tp)
    tp.evaluate(remote_open, True)
    ruhe(pg=tp)
    cdp = touch_ctx.new_cdp_session(tp)
    pos = lambda sel: tp.evaluate("""(sel) => { const b = window.dialog().shadowRoot.querySelector(sel).getBoundingClientRect();
        return [b.left + b.width / 2, b.top + b.height / 2, b.width, b.height]; }""", sel)
    vx, vy, _, vh = pos('[data-axis="velocity"]')
    tx, ty, tw, _ = pos('[data-axis="turn"]')
    pts = lambda a, b: [{"x": a[0], "y": a[1], "id": 1}, {"x": b[0], "y": b[1], "id": 2}]
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": pts((vx, vy), (tx, ty))})
    for i in range(1, 6):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": pts((vx, vy - vh * 0.09 * i), (tx + tw * 0.09 * i, ty))})
        frames(1, tp)
    tp.wait_for_timeout(900)  # real time on purpose: both fingers held, speed and steering steps are sent with their spacing
    both = tp.evaluate("() => window.__serviceCalls.map((c) => [c.service, c.payload.velocity, c.payload.rotation])")
    texts = tp.evaluate("() => ['velocity', 'turn'].map((a) => window.dialog().shadowRoot.querySelector('[data-axis=\"' + a + '\"]').getAttribute('aria-valuetext'))")
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    ruhe(WANN_STOPP, pg=tp)
    remote["touch"] = tp.evaluate("() => window.__serviceCalls.map((c) => [c.service, c.payload.velocity, c.payload.rotation, Math.round(c.at)])")
    remote["touchBoth"] = both
    remote["touchTexts"] = texts
    tp.screenshot(path=str(out_dir / "fernsteuerung-zwei-finger-844x390.png"))
    report["screenshots"].append("fernsteuerung-zwei-finger-844x390.png")
    touch_ctx.close()
    report["remote"] = remote

    def gaps_ok(cs):
        ms = moves(cs)
        # The harness answers at once: consecutive moves keep the 200 ms spacing (the stop comes without it).
        ts = [c[3] for c in ms if c[1] or c[2]]
        return all(b - a >= 195 for a, b in zip(ts, ts[1:]))
    def stops_last(cs):
        ms = moves(cs)
        return len(ms) >= 2 and ms[-1][1:3] == [0, 0] and any(c[1] or c[2] for c in ms)
    def rate_ok(cs):
        ts = [c[3] for c in moves(cs)]
        return all(len([t for t in ts if s <= t < s + 1000]) <= 6 for s in ts)  # 5 moves + the stop
    check("remote pointer: unarmed drag sends nothing; armed mouse drag moves forward (aria 'vorwärts 100 %'), release stops and springs back to 'Mitte'",
          remote["unarmed"] == [] and stops_last(remote["mouse"]) and gaps_ok(remote["mouse"]) and remote["mouseHeld"] == "vorwärts 100 %" and remote["mouseAfter"] == "Mitte",
          json.dumps({k: remote[k] for k in ("unarmed", "mouse", "mouseHeld", "mouseAfter")}))
    check("remote two fingers (real touch points): speed and steering in the same step, lifting stops",
          any(c[1] > 0 and c[2] < 0 for c in moves(remote["touchBoth"])) and stops_last(remote["touch"]) and gaps_ok(remote["touch"])
          and texts[0].startswith("vorwärts") and texts[1].startswith("rechts"),
          json.dumps({"both": remote["touchBoth"], "texts": texts, "touch": remote["touch"]}))
    check("remote keyboard: W+D combined (100, -128), <= 5 calls/s with >= 200 ms spacing, last keyup stops; stop after window blur, visibilitychange and Escape (which leaves the view)",
          any(c[1:3] == [100, -128] for c in moves(remote["keys"])) and stops_last(remote["keys"]) and gaps_ok(remote["keys"]) and rate_ok(remote["keys"])
          and all(stops_last(remote[k]) and moves(remote[k])[-1][1:3] == [0, 0] for k in ("blur", "hidden", "escape"))
          and not remote["escapeOpen"],
          json.dumps({k: remote[k] for k in ("keys", "blur", "hidden", "escape", "escapeOpen")}))
    check("remote motion: the knob springs back with a transition, none with prefers-reduced-motion",
          remote["reducedTransition"] in ("0s", "1e-05s") and remote["normalTransition"] == "0.15s",
          json.dumps({"reduced": remote["reducedTransition"], "normal": remote["normalTransition"]}))
    # Only remote calls happened here, all in the stub; the page-wide "no service call" check stays meaningful.
    report["remoteServiceCalls"] = sum(len(moves(remote[k])) for k in ("mouse", "keys", "blur", "hidden", "escape", "touch"))
    page.evaluate("() => { window.__serviceCalls = []; }")


def bereich_reinigung(k):
    """3g. Reinigungseinstellungen."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    # ------------------------------------------------------------------
    # 3g. Cleaning settings (clean-settings Task 6): settings normal/CleanGenius/
    #     Customized, rooms, room page, confirmation, sequence strict/not strict/
    #     tap mode; keyboard and mouse drag on the sequence; no service call
    # ------------------------------------------------------------------
    clean_views = [
        ("einstellungen", "docked", []),
        ("einstellungen-cleangenius", "cleangenius", []),
        ("einstellungen-customized", "customized", []),
        ("raeume", "customized", ["[data-action=rooms]"]),
        ("raumseite", "customized", ["[data-action=rooms]", "[data-room='3']"]),
        ("uebertragen-bestaetigen", "customized", ["[data-action=rooms]", "[data-room='3']", "[data-action=apply-all]"]),
        ("reihenfolge-strikt", "docked", ["[data-action=sequence]"]),
        ("reihenfolge-nicht-strikt", "nonstrict", ["[data-action=sequence]"]),
        ("reihenfolge-antippen", "docked", ["[data-action=sequence]", "[data-action=tap-mode]"]),
    ]
    clean_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for label, state, steps in clean_views:
                build(state)
                title = page.evaluate(clean_open, steps)
                ruhe()
                g = page.evaluate("""() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
                    const fields = Array.from(sr.querySelectorAll('select, input')).filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44).length;
                    return { kind: sheet.getAttribute('data-kind'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                             overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr), smallFields: fields,
                             rows: sr.querySelectorAll('.setting').length, options: sr.querySelectorAll('[role=option]').length,
                             sections: Array.from(sr.querySelectorAll('[data-section]')).map((n) => n.getAttribute('data-section')),
                             locked: sr.querySelectorAll('.setting[data-state=locked]').length }; }""")
                if (w, th) in ((360, "light"), (1280, "dark")) or (w == 390 and th == "dark"):
                    shot(f"reinigung-{label}-{w}x{h}-{th}.png")
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                clean_geo.append({"label": label, "w": w, "h": h, "theme": th, "title": title, **g})
    report["cleanDialogs"] = clean_geo
    bad = [x for x in clean_geo if not inside(x) or x["small"] or x["smallFields"] or x["overflowX"] > 1 or str(x["title"]).startswith("missing")]
    check("clean settings: 9 views x 4 sizes x 2 themes inside the viewport, no sideways overflow, 44 px buttons and fields",
          not bad, json.dumps(bad[:4]))
    by = {x["label"]: x for x in clean_geo if x["w"] == 390 and x["theme"] == "light"}
    check("clean settings: sections, CleanGenius locks, room list/page, confirmation, sequence strict/not strict as expected",
          by["einstellungen"]["title"] == "Reinigungseinstellungen" and by["einstellungen"]["sections"] == ["cleangenius", "basic", "customized", "sequence", "more"]
          and by["einstellungen-cleangenius"]["locked"] >= 4 and by["einstellungen-customized"]["locked"] >= 2
          and by["raumseite"]["title"] == "Salon" and by["raumseite"]["rows"] == 5 and by["uebertragen-bestaetigen"]["kind"] == "confirm"
          and by["reihenfolge-strikt"]["options"] == 7 and by["reihenfolge-nicht-strikt"]["options"] == 2
          and "unordered" in by["reihenfolge-nicht-strikt"]["sections"] and by["reihenfolge-antippen"]["options"] == 0,
          json.dumps({k: {"title": v["title"], "rows": v["rows"], "options": v["options"], "sections": v["sections"], "locked": v["locked"], "kind": v["kind"]} for k, v in by.items()}))
    # Real keyboard and mouse on the sequence (R15/R16): both give the same list.
    page.set_viewport_size({"width": 390, "height": 844})
    theme("light")
    order_js = "() => Array.from(window.dialog().shadowRoot.querySelectorAll('[role=option]')).map((n) => n.getAttribute('data-room'))"
    build("docked")
    page.evaluate(clean_open, ["[data-action=sequence]"])
    ruhe()
    page.evaluate("() => window.dialog().shadowRoot.querySelector('[role=option][data-room=\"1\"]').focus()")
    page.keyboard.press("Space")
    live = page.evaluate("() => window.dialog().shadowRoot.querySelector('[aria-live]').textContent")
    for _ in range(3):
        page.keyboard.press("ArrowUp")
    page.keyboard.press("Space")
    keyed = page.evaluate(order_js)
    focus_kept = page.evaluate("() => { const a = window.dialog().shadowRoot.activeElement; return a ? a.getAttribute('data-room') : null; }")
    page.keyboard.press("Space")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Escape")
    after_escape = page.evaluate(order_js)
    still_open = page.evaluate("() => !!window.dialog() && window.dialog().shadowRoot.querySelector('h1').textContent")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
    build("docked")
    page.evaluate(clean_open, ["[data-action=sequence]"])
    ruhe()
    box = page.evaluate("""() => { const sr = window.dialog().shadowRoot, h = sr.querySelector('[role=option][data-room="1"] .seq-handle').getBoundingClientRect(),
        t = sr.querySelector('[role=option]').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2, top: t.top + 4 }; }""")
    page.mouse.move(box["x"], box["y"])
    page.mouse.down()
    for i in range(1, 6):
        page.mouse.move(box["x"], box["y"] + (box["top"] - box["y"]) * i / 5)
    shot("reinigung-reihenfolge-ziehen-390x844-light.png")
    page.mouse.up()
    ruhe()
    dragged = page.evaluate(order_js)
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
    want = ["1", "3", "5", "7", "6", "9", "4"]
    check("clean settings sequence: Space grabs (announced), arrows move, Space drops, Escape cancels without closing; mouse drag gives the same list",
          keyed == want and dragged == want and focus_kept == "1" and after_escape == want and still_open == "Reinigungsreihenfolge" and "Atelier" in live,
          json.dumps({"keyed": keyed, "dragged": dragged, "focus": focus_kept, "escape": after_escape, "open": still_open, "live": live}))


def bereich_editor(k):
    """3j. Karteneditor."""
    page, report, check, theme, build, ruhe, frames, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.frames, k.shot
    # ------------------------------------------------------------------
    # 3j. Map editor (map-editor Task 13): map management (rename form, delete
    #     confirmation), edit mode per tool with one form per kind, save
    #     confirmation (outside click keeps it), dirty dialog (Escape keeps it,
    #     the sheet shakes), WiFi switch, bubble "Bearbeiten". Edit data are
    #     SYNTHETIC (synthetic_edit_data). Every callService lands in the harness
    #     stub: 0 calls without a confirming click, exactly one backup after it.
    # ------------------------------------------------------------------
    edit_measure = """() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
        const fields = Array.from(sr.querySelectorAll('select, input')).filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44)
          .map((n) => (n.closest('[data-field]') ? n.closest('[data-field]').getAttribute('data-field') : n.tagName) + ' ' + Math.round(n.getBoundingClientRect().height));
        const pressed = sr.querySelector('[data-tool][aria-pressed=true]'), panel = sr.querySelector('[data-panel]');
        const c = window.card(), layer = c._map && c._map._layers.get('editor');
        const stage = sr.querySelector('.map-stage'), sb = stage ? stage.getBoundingClientRect() : null;
        return { kind: sheet.getAttribute('data-kind'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                 overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr), smallFields: fields,
                 tool: pressed ? pressed.getAttribute('data-tool') : null, panel: panel ? panel.getAttribute('data-panel') : null,
                 tools: sr.querySelectorAll('[data-tool]').length, lockedTools: sr.querySelectorAll('[data-tool][disabled]').length,
                 form: !!sr.querySelector('.edit-form') || !!sr.querySelector('[data-panel=rooms] .settings-list'),
                 picked: sr.querySelectorAll('[data-edit-item][aria-pressed=true]').length, maps: sr.querySelectorAll('[data-map]').length,
                 mapInSheet: !!sr.querySelector('.edit-map .map-stage'), stageW: sb ? sb.width : 0, stageH: sb ? sb.height : 0,
                 wifiImage: !!(layer && layer.group.querySelector('image')), legend: !!sr.querySelector('.wifi-legend'),
                 wifiOff: (() => {
                   // Robot (0, 0) and (1000, 0) through the WiFi picture's calibration vs. through the map.
                   const img = layer && layer.group.querySelector('image'); if (!img) return null;
                   const cal = c.hass.states['camera.robo_wifi_map_1'].attributes.calibration_points, m = c._map;
                   return Math.max(...cal.slice(0, 2).map((p) => { const q = img.ownerSVGElement.createSVGPoint(); q.x = p.map.x; q.y = p.map.y;
                     const a = q.matrixTransform(img.getScreenCTM()), b = m.toScreen(m.toImage(p.vacuum)); return Math.hypot(a.x - b.x, a.y - b.y); })); })(),
                 keep: !!sr.querySelector('[data-action=keep]'), confirmBtn: !!sr.querySelector('[data-action=confirm]'),
                 counter: sr.querySelector('[data-counter]') ? sr.querySelector('[data-counter]').getAttribute('data-counter') : null,
                 text: sheet.textContent.replace(/\\s+/g, ' ').slice(0, 400) }; }"""
    page.evaluate("() => { window.__serviceCalls = []; }")
    edit_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for label, state, entry, steps in edit_views:
                build(state)
                title = page.evaluate(edit_open, {"entry": entry, "steps": steps})
                ruhe()
                g = page.evaluate(edit_measure) if not str(title).startswith("missing") else {}
                if (w, th) in ((360, "dark"), (1280, "light"), (390, "light")):
                    shot(f"editor-{label}-{w}x{h}-{th}.png")
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                edit_geo.append({"label": label, "w": w, "h": h, "theme": th, "title": title, **g})
    report["editorDialogs"] = edit_geo
    calls_matrix = page.evaluate("() => window.__serviceCalls.map((c) => c.service)")
    bad = [x for x in edit_geo if str(x["title"]).startswith("missing") or not inside(x) or x["small"] or x["smallFields"] or x["overflowX"] > 1]
    check("map editor: 16 views x 4 sizes x 2 themes inside the viewport, no sideways overflow, buttons and fields >= 44 px",
          not bad, json.dumps([{k: x.get(k) for k in ("label", "w", "theme", "title", "small", "smallFields", "overflowX", "top", "bottom")} for x in bad[:5]]))
    by = {x["label"]: x for x in edit_geo if x["w"] == 390 and x["theme"] == "light"}
    tools = {"raeume": "rooms", "waende": "walls", "zonen": "zones", "linien": "lines", "teppiche": "carpets", "moebel": "furniture", "punkte": "points", "wlan": "wifi"}
    check("map editor: management lists both maps, rename form and delete confirmation; edit mode with the map in the sheet and 8 tools, none locked with edit data",
          by["verwaltung"].get("maps") == 2 and by["verwaltung"].get("title") == "Kartenverwaltung"
          and by["verwaltung-umbenennen"].get("kind") == "editor" and by["verwaltung-loeschen"].get("kind") == "confirm"
          and by["modus"].get("mapInSheet") and by["modus"].get("tools") == 8 and by["modus"].get("lockedTools") == 0
          and by["modus"].get("stageW", 0) > 200 and by["modus"].get("stageH", 0) > 150,
          json.dumps({k: {kk: by[k].get(kk) for kk in ("title", "kind", "maps", "tools", "lockedTools", "mapInSheet", "stageW", "stageH")} for k in ("verwaltung", "verwaltung-umbenennen", "verwaltung-loeschen", "modus")}))
    check("map editor: every tool pressed with its panel and one form per kind (rooms, walls, zones, lines, carpets, furniture, points, router)",
          all(by[v].get("tool") == t and by[v].get("panel") == t and by[v].get("form") for v, t in tools.items()),
          json.dumps({v: {kk: by[v].get(kk) for kk in ("title", "tool", "panel", "form", "picked", "text")} for v in tools}))
    wifi_off = [x.get("wifiOff") for x in edit_geo if x["label"] == "wlan"]
    check("map editor: WiFi map first with picture (on the map within 1.5 px through its own calibration, 8 cases) and legend, switch to the cleaning map removes both",
          all(o is not None and o <= 1.5 for o in wifi_off) and by["wlan"].get("wifiImage") and by["wlan"].get("legend") and not by["wlan-reinigungskarte"].get("wifiImage")
          and not by["wlan-reinigungskarte"].get("legend"),
          json.dumps({"off": wifi_off, **{v: {kk: by[v].get(kk) for kk in ("wifiImage", "legend")} for v in ("wlan", "wlan-reinigungskarte")}}))
    check("map editor: save opens a confirmation (kind confirm); Escape with open changes asks (keep/discard) instead of closing; 0 service calls in all 128 views",
          by["bestaetigung"].get("kind") == "confirm" and by["bestaetigung"].get("confirmBtn") and by["ungespeichert"].get("keep")
          and not calls_matrix, json.dumps({"bestaetigung": by["bestaetigung"].get("text"), "ungespeichert": by["ungespeichert"].get("text"), "calls": calls_matrix}))

    # Real pointer and keyboard: an outside click keeps the confirmation, Escape with changes keeps the
    # dialog and shakes it, the confirming click sends exactly the backup first (the harness never reports
    # "Success", so no map service follows) -- then the stub is emptied.
    page.set_viewport_size({"width": 1280, "height": 800})
    theme("light")
    build("editor")
    page.evaluate(edit_open, {"entry": "edit", "steps": ["[data-tool=zones]", "[data-action=edit-add]"]})
    ruhe()
    page.keyboard.press("Escape")
    frames()  # two frames, not ruhe(): the shake class only lives 400 ms (card timer), read it while it is there
    esc = page.evaluate("""() => { const d = window.dialog(); if (!d) return null; const sr = d.shadowRoot;
        return { open: true, keep: !!sr.querySelector('[data-action=keep]'), shake: sr.querySelector('.sheet').classList.contains('shake') }; }""")
    page.evaluate("() => window.dialog().shadowRoot.querySelector('[data-action=keep]').click()")
    ruhe()
    page.evaluate("() => window.dialog().shadowRoot.querySelector('[data-action=save]').click()")
    ruhe()
    page.mouse.click(12, 12)
    page.wait_for_timeout(350)  # real time on purpose: an outside click must NOT close it (a close would come via popstate / the 300 ms insurance)
    outside = page.evaluate("""() => { const d = window.dialog(); return d ? d.shadowRoot.querySelector('.sheet').getAttribute('data-kind') : null; }""")
    before = page.evaluate("() => window.__serviceCalls.length")
    box = page.evaluate("""() => { const b = window.dialog().shadowRoot.querySelector('[data-action=confirm]').getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }""")
    page.mouse.click(box["x"], box["y"])
    ruhe(WANN_AUFRUF)
    after = page.evaluate("() => window.__serviceCalls.map((c) => [c.service, c.payload])")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; window.__serviceCalls = []; }")
    check("map editor real input: Escape with changes asks and shakes, outside click keeps the confirmation, 0 calls before the click; the confirming click sends vacuum_backup_map first",
          esc and esc["keep"] and esc["shake"] and outside == "confirm" and before == 0
          and len(after) == 1 and after[0][0] == "vacuum_backup_map" and after[0][1].get("entity_id") == "vacuum.robo",
          json.dumps({"escape": esc, "outside": outside, "before": before, "after": after}))

    # Bubble "Bearbeiten" (EDI-06): a real click on a carpet of the card's map, the bubble's action
    # opens the edit mode with the carpet tool.
    bubble = []
    for w, h, th in ((360, 640, "dark"), (390, 844, "light"), (1280, 800, "light"), (1280, 800, "dark")):
        page.set_viewport_size({"width": w, "height": h})
        theme(th)
        build("editor")
        pt = page.evaluate("""() => { const c = window.card(), m = c._map; m.stage.scrollIntoView({ block: 'center' });
            const k = c.hass.states['camera.robo_map'].attributes.carpets[2];
            const s = m.toScreen(m.toImage({ x: (k.x0 + k.x2) / 2, y: (k.y0 + k.y2) / 2 })); return s; }""")
        page.mouse.click(pt["x"], pt["y"])
        ruhe()
        b = page.evaluate("""() => { const c = window.card(), sr = c.shadowRoot, bub = c._map.bubble, r = bub.getBoundingClientRect(), stage = c._map.stage.getBoundingClientRect();
            const act = bub.querySelector('[data-action=object-map-edit]'), ab = act ? act.getBoundingClientRect() : null;
            return { hidden: bub.hidden, layer: bub.getAttribute('data-object-layer'), action: !!act, aw: ab ? ab.width : 0, ah: ab ? ab.height : 0,
                     inside: r.left >= stage.left - 0.5 && r.right <= stage.right + 0.5 && r.top >= stage.top - 0.5 && r.bottom <= stage.bottom + 0.5,
                     small: window.smallTargets(sr), overflow: document.documentElement.scrollWidth - innerWidth }; }""")
        shot(f"editor-blase-{w}x{h}-{th}.png")
        if b["action"]:
            page.evaluate("() => window.card()._map.bubble.querySelector('[data-action=object-map-edit]').click()")
            ruhe()
            b["opened"] = page.evaluate("""() => { const d = window.dialog(); if (!d) return null; const t = d.shadowRoot.querySelector('[data-tool][aria-pressed=true]');
                return [d.shadowRoot.querySelector('.sheet').getAttribute('data-kind'), t && t.getAttribute('data-tool')]; }""")
        page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        bubble.append({"w": w, "theme": th, **b})
    report["editorBubble"] = bubble
    calls_bubble = page.evaluate("() => window.__serviceCalls.length")
    check("map editor bubble: a click on a carpet shows the bubble inside the map with 'Bearbeiten' (>= 44 px), it opens the edit mode in the carpet tool; 0 calls",
          all(not x["hidden"] and x["layer"] in ("carpets", "detected_carpets") and x["action"] and x["aw"] >= 44 and x["ah"] >= 44 and x["inside"]
              and not x["small"] and x["overflow"] <= 0 and x.get("opened") == ["editor", "carpets"] for x in bubble) and calls_bubble == 0,
          json.dumps({"bubble": bubble, "calls": calls_bubble}))


def bereich_sicherung(k):
    """3k. Kartensicherung."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    # ------------------------------------------------------------------
    # 3k. Map backup (map-backup Task 6): list of states, full screen,
    #     restore and backup confirmations, file-URL form, running status.
    #     States and pictures are SYNTHETIC (scenario "backup"); every
    #     callService lands in the harness stub: 0 calls without a
    #     confirming click, exactly one backup after it.
    # ------------------------------------------------------------------
    bak_measure = """() => { const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
        const fields = Array.from(sr.querySelectorAll('select, input:not([type=checkbox])')).filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44)
          .map((n) => n.getAttribute('data-field') + ' ' + Math.round(n.getBoundingClientRect().height));
        const links = Array.from(sr.querySelectorAll('a')).filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && (b.width < 44 || b.height < 44); }).map((n) => n.getAttribute('data-action'));
        const option = sr.querySelector('.backup-option'), ob = option ? option.getBoundingClientRect() : null;
        const img = sr.querySelector('.backup-stage img'), stage = sr.querySelector('.backup-stage'), st = stage ? stage.getBoundingClientRect() : null;
        return { kind: sheet.getAttribute('data-kind'), size: sheet.getAttribute('data-size'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight,
                 overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr).concat(links), smallFields: fields,
                 optionH: ob ? ob.height : null, entries: sr.querySelectorAll('.backup-entry').length,
                 image: img ? { w: img.naturalWidth, complete: img.complete } : null, stageH: st ? st.height : 0, state: sr.querySelector('.backup-state') ? sr.querySelector('.backup-state').textContent : null,
                 confirmBtn: !!sr.querySelector('[data-action=confirm]'), restore: sr.querySelectorAll('[data-action=restore]').length,
                 restoreLocked: sr.querySelectorAll('[data-action=restore][disabled]').length, download: sr.querySelectorAll('[data-action=download]').length,
                 invalid: !!sr.querySelector('[aria-invalid=true]'),
                 text: sheet.textContent.replace(/\\s+/g, ' ').slice(0, 400) }; }"""
    page.evaluate("() => { window.__serviceCalls = []; }")
    bak_geo = []
    for w, h in ((360, 640), (390, 844), (800, 600), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for label, state, steps in bak_views:
                build(state)
                title = page.evaluate(bak_open, {"steps": steps})
                ruhe()
                g = page.evaluate(bak_measure) if not str(title).startswith("missing") else {}
                if (w, th) in ((360, "dark"), (1280, "light"), (390, "light")):
                    shot(f"sicherung-{label}-{w}x{h}-{th}.png")
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
                bak_geo.append({"label": label, "w": w, "h": h, "theme": th, "title": title, **g})
    report["backupDialogs"] = bak_geo
    calls_bak = page.evaluate("() => window.__serviceCalls.map((c) => c.service)")
    inside_b = lambda x: x.get("top", -9) >= -0.5 and x.get("bottom", 9e9) <= x.get("H", 0) + 0.5 and x.get("left", -9) >= -0.5 and x.get("right", 9e9) <= x.get("W", 0) + 0.5
    bad = [x for x in bak_geo if str(x["title"]).startswith("missing") or not inside_b(x) or x["small"] or x["smallFields"] or x["overflowX"] > 1
           or (x.get("optionH") is not None and x["optionH"] < 44)]
    check(f"map backup: {len(bak_views)} views x 4 sizes x 2 themes inside the viewport, no sideways overflow, buttons, links, fields and the option >= 44 px",
          not bad, json.dumps([{k: x.get(k) for k in ("label", "w", "theme", "title", "small", "smallFields", "overflowX", "optionH", "top", "bottom")} for x in bad[:5]]))
    full = [x for x in bak_geo if x["label"] in ("vollbild", "vollbild-aktuell")]
    check("map backup: full screen at every size (size full, sheet = viewport), picture loaded through the recovery route, stage >= 240 px, no load/error note",
          all(x.get("size") == "full" and abs(x["top"]) <= 1 and abs(x["left"]) <= 1 and abs(x["bottom"] - x["H"]) <= 1 and abs(x["right"] - x["W"]) <= 1
              and x.get("image") and x["image"]["w"] > 0 and x["stageH"] >= 240 and x.get("state") is None for x in full),
          json.dumps([{k: x.get(k) for k in ("label", "w", "theme", "size", "top", "bottom", "image", "stageH", "state")} for x in full if not (x.get("image") and x["image"]["w"] > 0)][:4]))
    by = {x["label"]: x for x in bak_geo if x["w"] == 390 and x["theme"] == "light"}
    check("map backup: list with 3 states (restore and download each), restore confirmation (kind confirm, with the option), backup state without option, backup confirmation, form with inline error, running status locks restore, room settings write-back confirmation, replace the temporary map",
          by["liste"].get("entries") == 3 and by["liste"].get("restore") == 3 and by["liste"].get("download") == 3 and by["liste"].get("restoreLocked") == 0
          and by["wiederherstellen"].get("kind") == "confirm" and by["wiederherstellen"].get("optionH") is not None
          and by["wiederherstellen-backup"].get("kind") == "confirm" and by["wiederherstellen-backup"].get("optionH") is None
          and by["sichern"].get("kind") == "confirm" and by["datei"].get("kind") == "editor" and by["datei-fehler"].get("invalid")
          and by["laeuft"].get("restoreLocked") == 3 and "läuft" in by["laeuft"].get("text", "") and not calls_bak
          and by["raeume-zurueck"].get("kind") == "confirm" and by["raeume-zurueck"].get("confirmBtn") and "Atelier" in by["raeume-zurueck"].get("text", "")
          and by["temporaer-ersetzen"].get("kind") == "editor",
          json.dumps({k: {kk: by[k].get(kk) for kk in ("title", "kind", "entries", "restore", "restoreLocked", "download", "optionH", "invalid", "text")} for k in by} | {"calls": calls_bak})[:1500])

    # Real pointer and keyboard: outside click keeps the restore confirmation, 0 calls before; in the full
    # view the arrow key goes to "Aktuelle Karte", the wheel zooms, Escape goes back to the list; the
    # confirming click of "Jetzt sichern" sends exactly vacuum_backup_map (the stub never reports Success).
    page.set_viewport_size({"width": 1280, "height": 800})
    theme("light")
    build("backup")
    page.evaluate(bak_open, {"steps": bak_list + [".backup-entry[data-type=original] [data-action=restore]"]})
    ruhe()
    page.mouse.click(12, 12)
    page.wait_for_timeout(300)  # real time on purpose: an outside click must NOT close the confirmation (a close would come via popstate)
    outside_b = page.evaluate("() => { const d = window.dialog(); return d ? d.shadowRoot.querySelector('.sheet').getAttribute('data-kind') : null; }")
    before_b = page.evaluate("() => window.__serviceCalls.length")
    page.evaluate(bak_open, {"steps": bak_list + [".backup-entry [data-action=view]"]})
    ruhe()
    page.evaluate("() => window.dialog().shadowRoot.querySelector('.backup-stage').focus()")
    page.keyboard.press("ArrowLeft")
    ruhe()
    caption = page.evaluate("() => window.dialog().shadowRoot.querySelector('.backup-caption').textContent")
    stage_box = page.evaluate("() => { const b = window.dialog().shadowRoot.querySelector('.backup-stage').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }")
    page.mouse.move(stage_box["x"], stage_box["y"])
    page.mouse.wheel(0, -400)
    ruhe("sr && /scale\\((?!1\\))/.test(sr.querySelector('.backup-stage img').style.transform)")  # zoomed: a scale other than 1
    zoomed = page.evaluate("() => window.dialog().shadowRoot.querySelector('.backup-stage img').style.transform")
    page.keyboard.press("Escape")
    ruhe(wann_ansicht("backups"))
    back_title = page.evaluate("() => { const d = window.dialog(); return d ? d.shadowRoot.querySelector('h1').textContent : null; }")
    box = page.evaluate("""() => { window.dialog().shadowRoot.querySelector('[data-action=backup-now]').click(); return null; }""")
    ruhe()
    box = page.evaluate("""() => { const b = window.dialog().shadowRoot.querySelector('[data-action=confirm]').getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }""")
    page.mouse.click(box["x"], box["y"])
    page.mouse.click(box["x"], box["y"])
    ruhe(WANN_AUFRUF)
    after_b = page.evaluate("() => window.__serviceCalls.map((c) => [c.service, c.payload])")
    page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; window.__serviceCalls = []; }")
    check("map backup real input: outside click keeps the restore confirmation, 0 calls before; arrow key shows 'Aktuelle Karte', the wheel zooms, Escape back to the list; one double click on 'Sichern' sends exactly vacuum_backup_map { map_id: 3 }",
          outside_b == "confirm" and before_b == 0 and caption == "Aktuelle Karte" and "scale(1)" not in zoomed and back_title == "Kartensicherungen"
          and len(after_b) == 1 and after_b[0][0] == "vacuum_backup_map" and after_b[0][1] == {"entity_id": "vacuum.robo", "map_id": 3},
          json.dumps({"outside": outside_b, "before": before_b, "caption": caption, "zoom": zoomed, "back": back_title, "after": after_b}))


# M21: English option/run words that must not stand in a German UI (raw values of tests/fixtures/voll.json).
ENGLISCHE_WOERTER = ("Mopping after sweeping", "Sweeping", "Turbo", "Wetness level", "Moist", "Room cleaning", "Default mode")
UEB_TEXT_JS = """() => { const t = (r) => (r ? r.innerText || r.textContent || '' : ''); const c = window.card(), d = window.dialog();
    const s = c.shadowRoot.querySelector('.settings-summary');
    return { summary: s ? s.textContent : null, card: t(c.shadowRoot.querySelector('ha-card')), dialog: d ? t(d.shadowRoot.querySelector('.sheet')) : '' }; }"""


def bereich_uebersetzung(k):
    """M21 (harness part): the card with and without HA's translation (localize), German UI.

    "mit": localize answers from the SYNTHETIC tests/fixtures/uebersetzung-de.json; "ohne": HA without the
    integration's texts (localize gives ''). Panel 1280x900, history list and cleaning settings at 390x844,
    light/dark. "ohne" is recorded (report.uebersetzungOhne), the German fallback words follow in E6 (M21 Wörter)."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    rows = []
    for variant, texte in (("mit", k.texte_de), ("ohne", {})):
        for th in THEMES:
            theme(th)
            page.set_viewport_size({"width": 1280, "height": 900})
            build("docked", panel=True, texte=texte)
            panel = page.evaluate(UEB_TEXT_JS)
            shot(f"uebersetzung-{variant}-panel-1280-{th}.png")
            page.set_viewport_size({"width": 390, "height": 844})
            build("docked", texte=texte)
            page.evaluate(hist_open, {"entry": "history", "steps": []})
            ruhe(wann_ansicht("history"))
            verlauf = page.evaluate(UEB_TEXT_JS)
            shot(f"uebersetzung-{variant}-verlauf-390x844-{th}.png")
            build("docked", texte=texte)
            page.evaluate(clean_open, [])
            ruhe(wann_ansicht("clean-settings"))
            reinigung = page.evaluate(UEB_TEXT_JS)
            shot(f"uebersetzung-{variant}-reinigung-390x844-{th}.png")
            page.evaluate("() => window.closeDialogs()")
            alles = panel["card"] + "\n" + verlauf["dialog"] + "\n" + reinigung["dialog"]
            rows.append({"variant": variant, "theme": th, "summary": panel["summary"],
                         "englisch": [w for w in ENGLISCHE_WOERTER if w in alles],
                         "raumreinigung": "Raumreinigung" in verlauf["dialog"]})
    report["uebersetzung"] = rows
    report["uebersetzungOhne"] = [r for r in rows if r["variant"] == "ohne"]
    mit = [r for r in rows if r["variant"] == "mit"]
    check("translation: with localize the summary row shows HA's words (panel 1280, light/dark)",
          all(r["summary"] == "Wischen nach dem Saugen · Maximal · Feuchtigkeitsstufe 26" for r in mit), json.dumps(mit))
    check("translation: with localize no English option or run word in panel, history and cleaning settings",
          all(not r["englisch"] and r["raumreinigung"] for r in mit), json.dumps(mit))


# M15: per state group (picture name, scenario, config, task to choose) at 320/390/1280, light/dark.
ZUSTAENDE = (("roboter-weg", "roboter_weg", None, None), ("kamera-weg", "kamera_weg", None, None),
             ("laedt", "laedt", None, None), ("abruf-fehler", "abruf_fehler", None, None),
             ("konfig-fehler", "docked", {"entity": "light.robo"}, None), ("keine-raeume", "keine_raeume", None, "room"))
ZUSTAND_BREITEN = (320, 390, 1280)
ZUSTAND_JS = """() => { const c = window.card(), sr = c.shadowRoot, vis = (n) => !!n && n.getBoundingClientRect().height > 0;
    const start = sr.querySelector('.ctl[data-action=start]'), offline = sr.querySelector('.message[data-kind=offline]');
    const err = sr.querySelector('.error');
    return { startDisabled: start ? start.disabled : null, startDescribed: start ? start.getAttribute('aria-describedby') : null,
      enabledDrive: Array.from(sr.querySelectorAll('.ctl')).filter((b) => !b.disabled && ['start', 'pause', 'stop', 'return', 'resume'].includes(b.getAttribute('data-action'))).length,
      offline: offline && vis(offline) ? { id: offline.id, role: offline.getAttribute('role'), text: offline.textContent } : null,
      notes: Array.from(sr.querySelectorAll('.map-note')).filter(vis).map((n) => ({ kind: n.dataset.kind, role: n.getAttribute('role'), text: n.textContent })),
      retry: vis(sr.querySelector('[data-action=map-retry]')), busy: sr.querySelector('.map-stage') ? sr.querySelector('.map-stage').getAttribute('aria-busy') : null,
      error: err && vis(err) ? err.textContent : null, chips: sr.querySelectorAll('.room-chip').length,
      pageOverflow: document.documentElement.scrollWidth - innerWidth, small: window.smallTargets(sr) }; }"""
ZUSTAND_SOLL = {
    "roboter-weg": lambda z: bool(z["offline"]) and z["offline"]["role"] == "alert" and z["startDisabled"] is True
    and z["startDescribed"] == z["offline"]["id"] and z["enabledDrive"] == 0,
    "kamera-weg": lambda z: any(n["kind"] == "unavailable" and n["role"] == "alert" for n in z["notes"]),
    "laedt": lambda z: any(n["kind"] == "loading" for n in z["notes"]) and z["busy"] == "true",
    "abruf-fehler": lambda z: any(n["kind"] == "error" and n["role"] == "alert" for n in z["notes"]) and z["retry"],
    "konfig-fehler": lambda z: bool(z["error"] and z["error"].strip()),
    "keine-raeume": lambda z: z["chips"] == 0 and z["startDisabled"] is True,
}


def zustand_route_fuer(held):
    """M15 route (registered after camera_route, so it goes first): holds the answers of the "laedt" frame in
    `held` (let go by zustand_freigeben) and spoils those of the "abruf_fehler" frame; everything else falls back."""
    def zustand_route(route):
        url = route.request.url
        if "v=%d" % ZUSTAND_FRAMES["laedt"] in url:
            held.append(route)
            return None
        if "v=%d" % ZUSTAND_FRAMES["abruf_fehler"] in url:
            # An unusable answer: the card takes the same path as for an HTTP error (data: res.json() fails ->
            # image mode; picture: decode fails -> error note), without a 5xx among the run's bad responses.
            if "/api/camera_map_data_proxy/" in url:
                return route.fulfill(status=200, content_type="application/json", body="{")
            return route.fulfill(status=200, content_type="image/svg+xml", body="kein Bild")
        return route.fallback()
    return zustand_route


def zustand_freigeben(k):
    """Answers every held "laedt" request normally (camera_route), so none fails or stays open."""
    while k.held:
        k.camera_route(k.held.pop())


def zustand_aufbauen(k, szenario, config, task):
    """Builds one M15 state. Held answers of an earlier "laedt" go first; for "laedt" itself the wait is for the
    loading note, not for rest (its requests are held on purpose)."""
    zustand_freigeben(k)
    # M19 frame cache: every width reuses the same frame, so a cached answer would skip the loading state.
    k.page.evaluate("() => customElements.get('busch-vacuum-card').__internals.FRAME_CACHE.clear()")
    k.build(szenario, config=config, warten=szenario != "laedt")
    if task:
        k.page.evaluate("(t) => window.card().shadowRoot.querySelector('.task[data-task=' + t + ']').click()", task)
    if szenario == "laedt":
        k.page.wait_for_function("() => !!window.card().shadowRoot.querySelector('.map-note[data-kind=loading]')", timeout=8000)
        k.frames(2)
    else:
        k.ruhe()


def bereich_zustaende(k):
    """M15: robot gone, camera gone, map loading, map fetch failed, config error, no rooms."""
    page, report, check, theme, shot = k.page, k.report, k.check, k.theme, k.shot
    rows = []
    for label, szenario, config, task in ZUSTAENDE:
        for w in ZUSTAND_BREITEN:
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": 900})
                theme(th)
                zustand_aufbauen(k, szenario, config, task)
                z = page.evaluate(ZUSTAND_JS)
                shot(f"karte-{label}-{w}-{th}.png")
                rows.append(dict(z, label=label, w=w, theme=th))
    zustand_freigeben(k)
    report["zustaende"] = rows
    for label, _, _, _ in ZUSTAENDE:
        mine = [r for r in rows if r["label"] == label]
        check(f"states: {label} shows its hint in the card (320/390/1280, light/dark)",
              all(ZUSTAND_SOLL[label](r) for r in mine), json.dumps([r for r in mine if not ZUSTAND_SOLL[label](r)][:3]))
    check("states: no horizontal overflow, every visible button >= 44 px (6 groups)",
          all(r["pageOverflow"] <= 0 and not r["small"] for r in rows),
          json.dumps([(r["label"], r["w"], r["pageOverflow"], r["small"]) for r in rows if r["pageOverflow"] > 0 or r["small"]][:6]))


def bereich_regeln(k):
    """4. HACS-UI-Regeln 1 und 2 (regeln.py)."""
    page, report, theme, build, ruhe, open_menu, open_placeholder, open_confirm, open_obstacle, open_info, open_floors = (
        k.page, k.report, k.theme, k.build, k.ruhe, k.open_menu, k.open_placeholder, k.open_confirm, k.open_obstacle, k.open_info, k.open_floors)
    # ------------------------------------------------------------------
    # 4. HACS UI rules 1 and 2 (hacs/docs/ui-regeln.md)
    # ------------------------------------------------------------------
    report["uiRegeln"] = {}
    if not REGELN_DA:
        report["uiRegeln"] = {"kein_urteil": "regeln.py nicht gefunden — /work war nicht gemountet"}
    else:
        r = report["uiRegeln"]
        # M22 (#1163): regeln.py waits for rest (ruhe) instead of its fixed 150-400 ms where it can.
        if REGELN_WARTEN:
            warten = functools.partial(ruhe, WANN_KEIN_SCHLIESSEN)
            selbsttest, messe_popup, lauf_breiten = (functools.partial(f, warten=warten) for f in (_SELBSTTEST, _MESSE_POPUP, _LAUF_BREITEN))
        else:
            selbsttest, messe_popup, lauf_breiten = _SELBSTTEST, _MESSE_POPUP, _LAUF_BREITEN
        r["warten"] = "ruhe" if REGELN_WARTEN else "fest (regeln.py ohne warten=)"
        page.set_viewport_size({"width": 620, "height": 1200})
        theme("light")  # as the full run leaves it after "sicherung" (so --nur regeln measures the same)
        build("error")
        r["selbsttest_karte"] = selbsttest(page, "busch-vacuum-card")
        build("docked")
        open_menu()
        ruhe()
        r["selbsttest_dialog"] = selbsttest(page, ".sheet")
        page.evaluate("() => window.closeDialogs()")
        for state in STATES:
            r["regel1_karte_" + state] = lauf_breiten(
                page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
                vor_messung=lambda pg, s=state: build(s))
        r["regel1_karte_panel"] = lauf_breiten(
            page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
            vor_messung=lambda pg: build("cleaning", panel=True))
        # #1002: the new layout at its card widths, normal and panel, Gesamt and Raum.
        room_pick = """() => { const sr = window.card().shadowRoot; sr.querySelector('.task[data-task=room]').click();
            ['3', '5'].forEach((id) => sr.querySelector('.room-chip[data-room="' + id + '"]').click()); }"""
        for label, panel, room in (("karte", False, False), ("panel", True, False), ("karte_raum", False, True), ("panel_raum", True, True)):
            r["regel1_layout_" + label] = lauf_breiten(
                page, breiten=tuple(w + 16 for w in LAYOUT_WIDTHS), messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
                vor_messung=lambda pg, p=panel, rm=room: (build("docked", panel=p),
                                                          page.evaluate(room_pick) if rm else None, ruhe()))
        for label, opener in (("menue", open_menu), ("platzhalter", open_placeholder), ("bestaetigung", open_confirm)):
            r["regel1_dialog_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener: (build("docked"), o(), ruhe()))
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
                vor_messung=lambda pg, o=opener, s=state: (build(s), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            r["regel2_dialog_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ="ansicht"),
                vor_messung=lambda pg, s=state: build(s))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, steps, kind in (("einstellungen", [], "bearbeitung"), ("einstellungen_kamera", [("[data-group=camera]", None)], "bearbeitung"),
                                   ("einstellungen_dnd_formular", [("[data-group=dnd]", None), ("[data-action=dnd-edit]", None)], "bearbeitung"),
                                   ("einstellungen_loeschen", [("[data-group=schedule]", None), ("[data-action=schedule-edit]", None), ("[data-action=delete]", None)], "bestaetigung")):
            opener = lambda st=steps: page.evaluate(settings_open, st)
            r["regel1_dialog_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener: (build("settings"), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            # Rule 2 (one Escape/back closes the popup) applies to the dialog's first view; deeper
            # views go back one level on Escape/back by design (R03/R25), tested in einstellungen.test.js.
            if steps:
                continue
            r["regel2_dialog_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                vor_messung=lambda pg: build("settings"))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, steps, kind in (("dock_menue", [], "ansicht"), ("station", [einstellungen], "bearbeitung"),
                                   ("station_trocknen", [einstellungen, "[data-tab=dry]"], "bearbeitung"),
                                   ("station_bestaetigung", [einstellungen, "[data-station-action=drain]"], "bestaetigung")):
            opener = lambda st=steps: page.evaluate(dock_open, st)
            r["regel1_dialog_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener: (build("docked"), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            if steps:
                continue
            r["regel2_dialog_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                vor_messung=lambda pg: build("docked"))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, steps, kind in (("shortcut_menue", [], "ansicht"), ("shortcut_verwaltung", ["[data-action=manage]"], "bearbeitung"),
                                   ("shortcut_umbenennen", ["[data-action=manage]", "[data-manage='32'] [data-action=rename]"], "bearbeitung"),
                                   ("shortcut_loeschen", ["[data-action=manage]", "[data-manage='31'] [data-action=delete]"], "bestaetigung")):
            opener = lambda st=steps: page.evaluate(short_open, st)
            r["regel1_dialog_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener: (build("shortcuts", config=short_config), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            if steps:
                continue
            r["regel2_dialog_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                vor_messung=lambda pg: build("shortcuts", config=short_config))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, state, steps, kind in (("reinigung", "docked", [], "bearbeitung"), ("reinigung_raumseite", "customized", ["[data-action=rooms]", "[data-room='3']"], "bearbeitung"),
                                          ("reinigung_uebertragen", "customized", ["[data-action=rooms]", "[data-room='3']", "[data-action=apply-all]"], "bestaetigung"),
                                          ("reinigung_reihenfolge", "nonstrict", ["[data-action=sequence]"], "bearbeitung")):
            opener = lambda st=steps: page.evaluate(clean_open, st)
            r["regel1_dialog_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener, s=state: (build(s), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            if steps:
                continue
            r["regel2_dialog_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                vor_messung=lambda pg, s=state: build(s))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, entry, steps, kind in (("verlauf", "history", [], "bearbeitung"), ("verlauf_detail", "history", detail_steps, "bearbeitung"),
                                          ("verlauf_bestaetigung", "history", detail_steps + ["[data-reclean-room='4']", "[data-action=reclean]"], "bestaetigung"),
                                          ("cruising", "cruising_history", [], "bearbeitung")):
            opener = lambda e=entry, st=steps: page.evaluate(hist_open, {"entry": e, "steps": st})
            r["regel1_dialog_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener: (build("docked"), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            if steps:
                continue
            r["regel2_dialog_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                vor_messung=lambda pg: build("docked"))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, arm in (("fernsteuerung", False), ("fernsteuerung_frei", True)):
            r["regel1_dialog_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, a=arm: (build("docked"), page.evaluate(remote_open, a), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        r["regel2_dialog_fernsteuerung"] = lauf_breiten(
            page, breiten=(390, 960), hoehe=900,
            messung=lambda pg: messe_popup(pg, lambda: page.evaluate(remote_open, False), ".sheet", '[data-action="close"]', dialog_typ="bearbeitung"),
            vor_messung=lambda pg: build("docked"))
        page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, state, entry, steps in edit_views:
            opener = lambda e=entry, st=steps: page.evaluate(edit_open, {"entry": e, "steps": st})
            # The edit view carries the map (about 470 px) above its panel and the sheet scrolls; the
            # carpet tool with its detected carpets runs past 2000 px, so it is measured at 2600 px.
            r["regel1_dialog_editor_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2600, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener, s=state: (build(s), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
            if steps:
                continue
            r["regel2_dialog_editor_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ="bearbeitung"),
                vor_messung=lambda pg, s=state: build(s))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        for label, state, steps in bak_views:
            opener = lambda st=steps: page.evaluate(bak_open, {"steps": st})
            r["regel1_dialog_sicherung_" + label] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, ".sheet"),
                vor_messung=lambda pg, o=opener, s=state: (build(s), o(), ruhe()))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        # Regel 2 on the list (a view of kind editor) and the full view (kind menu) as the dialog's first view.
        for label, js, kind in (("sicherung_liste", "c._openDialog(I.backupsView(c, 3))", "bearbeitung"),
                                ("sicherung_vollbild", "c._openDialog(I.backupImageView(c, 3, 1))", "ansicht")):
            opener = lambda js=js: page.evaluate("() => { const c = window.card(), I = customElements.get('busch-vacuum-card').__internals; " + js + "; }")
            r["regel2_dialog_" + label] = lauf_breiten(
                page, breiten=(390, 960), hoehe=900,
                messung=lambda pg, o=opener, k=kind: messe_popup(pg, o, ".sheet", '[data-action="close"]', dialog_typ=k),
                vor_messung=lambda pg: build("backup"))
            page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }")
        r["regel1_karte_shortcuts"] = lauf_breiten(
            page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
            vor_messung=lambda pg: build("shortcuts", config=short_config))
        r["regel1_karte_floors"] = lauf_breiten(
            page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
            vor_messung=lambda pg: build("floors"))
        for t in ("room", "zone", "spot", "goto"):
            # The card scrolls inside itself past the view's height (CORE-13); measured at 2000 px
            # like the dialogs, so the task panel is not counted as "outside".
            r["regel1_karte_aufgabe_" + t] = lauf_breiten(
                page, breiten=WIDTHS, hoehe=2000, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
                vor_messung=lambda pg, t=t: (build("docked"), page.evaluate(task_prepare, t), ruhe()))
        # M15: rule 1 for the six state groups.
        for label, szenario, config, task in ZUSTAENDE:
            r["regel1_zustand_" + label.replace("-", "_")] = lauf_breiten(
                page, breiten=WIDTHS, messung=lambda pg: messe_text(pg, "busch-vacuum-card"),
                vor_messung=lambda pg, s=szenario, c=config, t=task: zustand_aufbauen(k, s, c, t))
        zustand_freigeben(k)
        r["zaehlung"] = zaehle(r)
        report["uiRegelnVerstoesse"] = bewerte(r)


# ---------------------------------------------------------------------------
# Buschcheck Welle 1 und 2 (17.11.2026, #1163): render cases of the measures M2-M47.
# Each area sets its own size, theme, hass extras and network shim and resets them at its end;
# every deliberate service call lands in the harness stub and is emptied again (report "serviceCalls").
# Network faults are made in the page (NETZ_JS answers a synthetic 500 without a real request), so the
# run's badResponses/consoleErrors stay clean.
# ---------------------------------------------------------------------------

# Every hass the harness builds from now on carries `extra` (a guest user, connected false); null resets.
HASS_EXTRA_JS = """(extra) => { if (!window.__makeHassBasis) window.__makeHassBasis = window.makeHass;
    const basis = window.__makeHassBasis;
    window.makeHass = extra ? (...a) => Object.assign(basis(...a), extra) : basis; return true; }"""

# The current card's hass answers services differently (same object as the dialog's): ablehnen (reject with
# `grund`), nte (reject only the n-th call), haengen (never answers), langsam (answers after `ms`).
DIENST_JS = """(a) => { const h = window.card().hass; let n = 0;
    h.callService = (domain, service, payload) => { n++; window.__serviceCalls.push({ domain, service, payload, at: performance.now() });
      if (a.art === 'ablehnen' || (a.art === 'nte' && n === a.n)) return Promise.reject(new Error(a.grund || 'Gerät lehnt ab'));
      if (a.art === 'haengen') return new Promise(() => {});
      if (a.art === 'langsam') return new Promise((r) => setTimeout(r, a.ms || 0));
      return Promise.resolve(); };
    return true; }"""

# Map data requests (camera_map_data_proxy, not &saved=1) with latency and synthetic 500 answers, counted
# (laufend/hoechstens/abrufe in window.__netz); null restores the fetch of RUHE_INIT.
NETZ_JS = """(a) => { if (!window.__fetchBasis) window.__fetchBasis = window.fetch; const basis = window.__fetchBasis;
    const n = window.__netz = { laufend: 0, hoechstens: 0, abrufe: [] };
    if (!a) { window.fetch = basis; return true; }
    window.fetch = function (url, opt) {
      const u = String(url && url.url ? url.url : url);
      if (!/camera_map_data_proxy/.test(u) || /saved=1/.test(u)) return basis.apply(this, arguments);
      const nr = n.abrufe.push(u); n.laufend++; n.hoechstens = Math.max(n.hoechstens, n.laufend);
      const fehler = (a.fehlerFrame && u.includes('v=' + a.fehlerFrame)) || (a.fehlerNr || []).includes(nr);
      const self = this, args = arguments;
      return new Promise((r) => setTimeout(r, a.latenz || 0))
        .then(() => (fehler ? new Response('', { status: 500, statusText: 'synthetisch' }) : basis.apply(self, args)))
        .then((x) => { n.laufend--; return x; }, (e) => { n.laufend--; throw e; }); };
    return true; }"""

# A new frame on both map cameras (data URL and picture carry v=<frame>), as HA sends it.
NEUER_FRAME_JS = """(a) => { const c = window.card(), h = c.hass, st = Object.assign({}, h.states);
    for (const id of ['camera.robo_map', 'camera.robo_map_1']) { const s = st[id]; if (!s) continue;
      st[id] = Object.assign({}, s, { attributes: Object.assign({}, s.attributes, { frame_id: a.frame,
        entity_picture: '/api/camera_proxy/' + id + '?token=testtoken&v=' + a.frame }) }); }
    c.hass = Object.assign({}, h, { states: st }); return true; }"""

FRAME_CACHE_LEEREN = "() => customElements.get('busch-vacuum-card').__internals.FRAME_CACHE.clear()"
DIALOGE_ZU = "() => { window.closeDialogs(); document.documentElement.style.overflow = ''; }"


def hass_extra(k, extra=None):
    k.page.evaluate(HASS_EXTRA_JS, extra)


def dienst(k, art, **mehr):
    k.page.evaluate(DIENST_JS, dict(mehr, art=art))


def dienste_leeren(k):
    """The calls since the last emptying (and empties the stub, so the run stays without service calls)."""
    return k.page.evaluate("() => { const c = window.__serviceCalls.map((x) => [x.domain, x.service]); window.__serviceCalls = []; return c; }")


def rest_aufrufe(k, wo):
    """Calls left in the stub before a case that counts its own (e.g. a late safety stop): noted in report "restAufrufe", not dropped silently."""
    rest = dienste_leeren(k)
    if rest:
        k.report.setdefault("restAufrufe", {}).setdefault(wo, []).extend(rest)


def daten_mit(k, name, aendern):
    """A copy of scenario `name` changed by aendern(states)."""
    d = json.loads(json.dumps(k.data[name]))
    aendern(d["states"])
    return d


def baue_daten(k, data, config=None, panel=False, texte=None, warten=True):
    k.page.evaluate("(a) => window.buildCard(a)", {"data": data, "lang": "de", "config": config or {}, "panel": panel, "texte": texte})
    if warten:
        k.ruhe()


def mit_frame(states, frame):
    for cam_id in ("camera.robo_map", "camera.robo_map_1"):
        if cam_id in states:
            a = states[cam_id]["attributes"]
            a["frame_id"] = frame
            a["entity_picture"] = "/api/camera_proxy/%s?token=testtoken&v=%d" % (cam_id, frame)


DIALOG_BOX_JS = """() => { const d = window.dialog(); if (!d) return { missing: true }; const sr = d.shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
    return { kind: sheet.getAttribute('data-kind'), view: sheet.getAttribute('data-view'), title: (sr.querySelector('h1') || {}).textContent || null,
             top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, W: innerWidth, H: innerHeight,
             overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr),
             text: sheet.textContent.replace(/\\s+/g, ' ').slice(0, 600) }; }"""


# ── M8 · Rechte ────────────────────────────────────────────────────────────
RECHTE_GAST = {"user": {"id": "gast", "name": "Gast", "is_admin": False, "is_owner": False}}
# (picture label, scenario, config, opener, its argument, the counts that must be 0 for a guest and > 0 for an admin)
RECHTE_VIEWS = (
    ("einstellungen-audio", "settings", None, "settings_open", [("[data-group=audio]", None)], ("voicePack",)),
    ("einstellungen-sonstiges", "shortcuts", None, "settings_open", [("[data-group=other]", None)], ("shortcutsManage",)),
    ("zubehoer", "settings", None, "settings_open", [("[data-group=consumables]", None)], ("reset",)),
    ("shortcut-menue", "shortcuts", short_config, "short_open", [], ("manage",)),
    ("kartenverwaltung", "floors", None, "edit_open", {"entry": "maps", "steps": []}, ("mapDelete", "mapEdit")),
    ("sicherungsliste", "backup", None, "bak_open", {"steps": bak_list}, ("restore", "download", "restoreFile")),
)
RECHTE_JS = """() => { const d = window.dialog(), sr = d && d.shadowRoot, c = window.card();
    const n = (sel) => (sr ? sr.querySelectorAll(sel).length : 0);
    return { voicePack: n('[data-action=voice-pack]'), shortcutsManage: n('[data-action=shortcuts-manage]'), manage: n('[data-action=manage]'),
             reset: n('[data-action=reset]'), parts: n('[data-part]'), maps: n('[data-map]'),
             mapDelete: n('[data-map] [data-action=delete]') + n('[data-map] [data-action=edit]'),
             mapEdit: c._map && c._map.tools ? c._map.tools.querySelectorAll('[data-action=map-edit]').length : 0,
             restore: n('[data-action=restore]'), download: n('[data-action=download]'), restoreFile: n('[data-action=restore-file]'),
             entries: n('.backup-entry') }; }"""


def bereich_rechte(k):
    """M8: Nutzer ohne is_admin sieht die sechs folgenreichen Funktionen nirgends; Admin wie bisher."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    openers = {"settings_open": settings_open, "short_open": short_open, "edit_open": edit_open, "bak_open": bak_open}
    rows = []
    for rolle, extra in (("gast", RECHTE_GAST), ("admin", None)):
        hass_extra(k, extra)
        for w, h in ((390, 844), (1280, 800)):
            page.set_viewport_size({"width": w, "height": h})
            theme("light")
            for label, szenario, config, opener, arg, keys in RECHTE_VIEWS:
                build(szenario, config=config)
                title = page.evaluate(openers[opener], arg)
                ruhe()
                g = dict(page.evaluate(RECHTE_JS), box=page.evaluate(DIALOG_BOX_JS))
                shot(f"rechte-{rolle}-{label}-{w}-light.png")
                page.evaluate(DIALOGE_ZU)
                rows.append({"rolle": rolle, "label": label, "w": w, "title": title, "keys": keys,
                             "sum": sum(g[x] for x in keys), **g})
    hass_extra(k, None)
    report["rechte"] = rows
    gast = [r for r in rows if r["rolle"] == "gast"]
    admin = [r for r in rows if r["rolle"] == "admin"]
    missing = [(r["rolle"], r["label"], r["w"], r["title"]) for r in rows if str(r["title"]).startswith("missing")]
    check("M8 rights: a user without is_admin sees none of the six functions (voice pack, shortcut management, consumable reset, "
          "map delete/edit and pen, restore/download/restore from file; 390/1280 light)",
          not missing and all(r["sum"] == 0 for r in gast)
          and all(r["parts"] >= 3 for r in gast if r["label"] == "zubehoer") and all(r["entries"] > 0 for r in gast if r["label"] == "sicherungsliste"),
          json.dumps({"missing": missing, "bad": [(r["label"], r["w"], {x: r[x] for x in r["keys"]}, r["parts"], r["entries"]) for r in gast
                                                 if r["sum"] or (r["label"] == "zubehoer" and r["parts"] < 3)][:6]}))
    check("M8 rights: an admin sees every one of them in the same views (comparison)",
          not missing and all(all(r[x] > 0 for x in r["keys"]) for r in admin),
          json.dumps([(r["label"], r["w"], {x: r[x] for x in r["keys"]}) for r in admin if not all(r[x] > 0 for x in r["keys"])][:6]))
    bad = [(r["rolle"], r["label"], r["w"]) for r in rows if r["box"].get("missing") or not inside(r["box"]) or r["box"]["small"] or r["box"]["overflowX"] > 1]
    check("M8 rights: guest and admin views inside the viewport, no sideways overflow, 44 px buttons", not bad, json.dumps(bad[:6]))


# ── M29 · Adressen ─────────────────────────────────────────────────────────
SPRACHPAKET_SCHRITTE = lambda url: [("[data-group=audio]", None), ("[data-action=voice-pack]", None), ("[data-field=lang_id]", "de2"),
                                    ("[data-field=url]", url), ("[data-field=md5]", "0123456789abcdef0123456789abcdef"),
                                    ("[data-field=size]", "1234"), ("[data-action=submit]", None)]
HOST_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, line = sr.querySelector('[data-part=host]'), strong = line && line.querySelector('strong');
    const ok = sr.querySelector('[data-field=foreign_ok]'), go = sr.querySelector('[data-action=confirm]');
    return { kind: sr.querySelector('.sheet').getAttribute('data-kind'), host: strong ? strong.textContent : null, line: line ? line.textContent : null,
             foreignOk: ok ? { checked: ok.checked, h: ok.getBoundingClientRect().height } : null, confirmDisabled: go ? go.disabled : null,
             errors: Array.from(sr.querySelectorAll('.field-error')).map((e) => e.textContent).filter(Boolean),
             text: sr.querySelector('.sheet').textContent.replace(/\\s+/g, ' ') , origin: location.origin, own: location.host }; }"""
DATEI_FREMD_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, f = sr.querySelector('[data-field=file_url]');
    if (!f) return { error: 'missing file_url' }; const preset = f.value; f.value = 'https://fremd.invalid/karte.mb.tbz2';
    f.dispatchEvent(new Event('input', { bubbles: true })); const s = sr.querySelector('[data-action=submit]');
    if (!s) return { error: 'missing submit', preset }; s.click(); return { preset }; }"""
HAKEN_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, ok = sr.querySelector('[data-field=foreign_ok]'); if (!ok) return null;
    ok.checked = true; ok.dispatchEvent(new Event('change', { bubbles: true })); return true; }"""


def bereich_adressen(k):
    """M29: Sprachpaket nur https oder eigene Instanz, Host hervorgehoben; Datei-URL zu fremdem Host mit zweitem Haken."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    voice, files = [], []
    for w, h in ((360, 640), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for variante, url in (("fremd", "https://pakete.invalid/de.pkg"), ("eigen", "/local/de.pkg"), ("http", "http://example.invalid/x")):
                build("settings")
                title = page.evaluate(settings_open, SPRACHPAKET_SCHRITTE(url))
                ruhe()
                g = page.evaluate(HOST_JS)
                name = f"sprachpaket-bestaetigen-host-{variante}-{w}x{h}-{th}.png" if variante != "http" else f"sprachpaket-http-fehler-{w}x{h}-{th}.png"
                shot(name)
                page.evaluate(DIALOGE_ZU)
                voice.append({"variante": variante, "w": w, "theme": th, "title": title, **(g or {"kind": None, "host": None, "line": None, "errors": [], "own": None})})
            build("backup")
            page.evaluate(bak_open, {"steps": bak_list + ["[data-action=restore-file]"]})
            ruhe()
            filled = page.evaluate(DATEI_FREMD_JS)
            ruhe()
            g = page.evaluate(HOST_JS) or {"kind": None, "host": None, "foreignOk": None, "confirmDisabled": None, "text": "", "origin": None}
            box = page.evaluate(DIALOG_BOX_JS)
            shot(f"sicherung-datei-fremd-{w}x{h}-{th}.png")
            page.evaluate(HAKEN_JS)
            ruhe()
            after = page.evaluate("() => { const b = window.dialog() && window.dialog().shadowRoot.querySelector('[data-action=confirm]'); return b ? b.disabled : null; }")
            page.evaluate(DIALOGE_ZU)
            files.append({"w": w, "theme": th, "filled": filled, "afterTick": after, "box": box, **g})
    calls = dienste_leeren(k)
    report["adressen"] = {"sprachpaket": voice, "datei": files, "calls": calls}
    ok_voice = lambda x: (x["variante"] == "fremd" and x["kind"] == "confirm" and x["host"] == "pakete.invalid" and "fremder Server" in (x["line"] or ""))\
        or (x["variante"] == "eigen" and x["kind"] == "confirm" and x["host"] == x["own"] and "dieses Home Assistant" in (x["line"] or ""))\
        or (x["variante"] == "http" and x["kind"] == "editor" and any("https://" in e for e in x["errors"]))
    check("M29 voice pack: https host of another server confirmed with the host in bold and 'fremder Server', /local/ as this Home Assistant, "
          "http:// of another host an inline error (360x640, 1280x800, light/dark); 0 calls",
          all(ok_voice(x) for x in voice) and not calls,
          json.dumps({"bad": [{kk: x.get(kk) for kk in ("variante", "w", "theme", "title", "kind", "host", "line", "errors")} for x in voice if not ok_voice(x)][:4], "calls": calls}))
    ok_file = lambda x: (x["filled"] or {}).get("preset") == x["origin"] + "/local/" and x["kind"] == "confirm" and x["host"] == "fremd.invalid"\
        and x["foreignOk"] and not x["foreignOk"]["checked"] and x["confirmDisabled"] is True and x["afterTick"] is False\
        and "Home Assistant ruft diese fremde Adresse ab" in x["text"]
    check("M29 restore from file: preset /local/ of this instance; another host needs the second tick (foreign_ok), the button stays locked "
          "until then; host in bold (360x640, 1280x800, light/dark)",
          all(ok_file(x) for x in files),
          json.dumps([{kk: x.get(kk) for kk in ("w", "theme", "filled", "kind", "host", "foreignOk", "confirmDisabled", "afterTick")} for x in files if not ok_file(x)][:4]))
    bad = [(x["w"], x["theme"]) for x in files if x["box"].get("missing") or not inside(x["box"]) or x["box"]["small"] or x["box"]["overflowX"] > 1]
    check("M29 restore from file: confirmation inside the viewport, 44 px buttons", not bad, json.dumps(bad))


# ── M27 · feindliche Namen ─────────────────────────────────────────────────
FEINDLICH_MUSTER = re.compile(r'[<>"]|javascript:|[‏‪-‮]|Sehr langer')
KNOTEN_JS = """() => { const roots = [], c = window.card(), d = window.dialog();
    const walk = (r) => { roots.push(r); r.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) walk(n.shadowRoot); }); };
    walk(c.shadowRoot); if (d) walk(d.shadowRoot);
    const count = { img: 0, svg: 0, script: 0, iframe: 0, object: 0, embed: 0 }, foreign = [];
    for (const r of roots) r.querySelectorAll('*').forEach((n) => {
      const t = n.tagName.toLowerCase(); if (Object.hasOwn(count, t)) count[t]++;
      for (const a of Array.from(n.attributes)) {
        if (/^on/i.test(a.name)) foreign.push(t + '[' + a.name + ']');
        if (['href', 'src', 'xlink:href'].includes(a.name) && /^\\s*javascript:/i.test(a.value)) foreign.push(t + '[' + a.name + ']'); } });
    const text = (r) => Array.from(r.childNodes).filter((n) => n.nodeName !== 'STYLE').map((n) => n.textContent).join(' ');
    return { count, foreign, card: text(c.shadowRoot), dialog: d ? text(d.shadowRoot) : null }; }"""


def entschaerft(obj, namen):
    """The same data with every hostile string replaced by 'Harmlos <n>' (the comparison case)."""
    if isinstance(obj, dict):
        return {key: entschaerft(v, namen) for key, v in obj.items()}
    if isinstance(obj, list):
        return [entschaerft(v, namen) for v in obj]
    if isinstance(obj, str) and FEINDLICH_MUSTER.search(obj):
        namen.append(obj)
        return "Harmlos %d" % len(namen)
    return obj


def bereich_feindlich(k):
    """M27: feindliche Namen (tests/fixtures/feindlich.json) erscheinen wörtlich, ohne Dialog-Ereignis und fremde Knoten."""
    page, report, check, theme, ruhe, shot = k.page, k.report, k.check, k.theme, k.ruhe, k.shot
    fx = json.loads((k.repo_root / "tests" / "fixtures" / "feindlich.json").read_text(encoding="utf-8"))
    feindlich = {key: fx[key] for key in ("states", "entities", "services")}
    namen = []
    harmlos = entschaerft(feindlich, namen)
    vac = feindlich["states"]["vacuum.robo"]["attributes"]
    title = vac["friendly_name"]
    shortcut_names = [s["name"].strip() for s in vac["shortcuts"].values()]
    config = {"scripts": ["script.feindlich"]}
    dialogs = []
    on_dialog = lambda d: (dialogs.append({"type": d.type, "message": d.message}), d.dismiss())
    page.on("dialog", on_dialog)
    rows = []
    try:
        for w in (390, 1280):
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": 844 if w < 450 else 800})
                theme(th)
                for variante, data in (("feindlich", feindlich), ("harmlos", harmlos)):
                    baue_daten(k, data, config=config)
                    karte = page.evaluate(KNOTEN_JS)
                    if variante == "feindlich":
                        shot(f"feindlich-karte-{w}-{th}.png")
                    page.evaluate("() => { const b = window.card().shadowRoot.querySelector('[data-action=shortcuts]'); if (b) b.click(); }")
                    ruhe()
                    menue = page.evaluate(KNOTEN_JS)
                    if variante == "feindlich":
                        shot(f"feindlich-menue-{w}-{th}.png")
                    page.evaluate(DIALOGE_ZU)
                    rows.append({"variante": variante, "w": w, "theme": th, "karte": karte, "menue": menue})
    finally:
        page.remove_listener("dialog", on_dialog)
    calls = dienste_leeren(k)
    report["feindlich"] = {"dialogs": dialogs, "calls": calls,
                           "rows": [{kk: r[kk] for kk in ("variante", "w", "theme")} | {"karte": r["karte"]["count"], "menue": r["menue"]["count"],
                                    "foreign": r["karte"]["foreign"] + r["menue"]["foreign"]} for r in rows]}
    f_rows = [r for r in rows if r["variante"] == "feindlich"]
    paare = [(a, b) for a in f_rows for b in rows if b["variante"] == "harmlos" and (b["w"], b["theme"]) == (a["w"], a["theme"])]
    literal = lambda r: title in r["karte"]["card"] and r["menue"]["dialog"] is not None and all(n in r["menue"]["dialog"] for n in shortcut_names)
    check("M27 hostile names: no dialog event (alert/confirm/prompt) and no foreign node (on* attribute, javascript: URL) in card and shortcut menu (390/1280, light/dark)",
          not dialogs and all(not r["karte"]["foreign"] and not r["menue"]["foreign"] for r in rows),
          json.dumps({"dialogs": dialogs, "foreign": [(r["w"], r["theme"], r["karte"]["foreign"] + r["menue"]["foreign"]) for r in rows if r["karte"]["foreign"] or r["menue"]["foreign"]][:4]}))
    check("M27 hostile names: as many img/svg/script/iframe/object/embed nodes as with harmless names (no node from a name)",
          len(paare) == 4 and all(a["karte"]["count"] == b["karte"]["count"] and a["menue"]["count"] == b["menue"]["count"] for a, b in paare),
          json.dumps([(a["w"], a["theme"], a["karte"]["count"], b["karte"]["count"], a["menue"]["count"], b["menue"]["count"]) for a, b in paare
                      if a["karte"]["count"] != b["karte"]["count"] or a["menue"]["count"] != b["menue"]["count"]][:4]))
    check("M27 hostile names: title and every shortcut name appear literally as text",
          all(literal(r) for r in f_rows), json.dumps([(r["w"], r["theme"], title in r["karte"]["card"]) for r in f_rows if not literal(r)][:4]))


# ── M6, M18, M39 · Netz ────────────────────────────────────────────────────
VERALTET_FRAMES = (990201, 990202)
NETZ_STAND_JS = """() => { const c = window.card(), m = c._map, sr = c.shadowRoot;
    const notes = Array.from(sr.querySelectorAll('.map-note')).filter((n) => n.getBoundingClientRect().height > 0)
      .map((n) => ({ kind: n.getAttribute('data-kind'), role: n.getAttribute('role'), text: n.textContent }));
    return { mode: m ? m.current().mode : null, stale: !!(m && m.el.hasAttribute('data-stale')), notes, stats: m ? JSON.parse(JSON.stringify(m.stats)) : null,
             netz: window.__netz ? { laufend: window.__netz.laufend, hoechstens: window.__netz.hoechstens, abrufe: window.__netz.abrufe.length } : null,
             frames: (window.__frames || []).slice(), pageOverflow: document.documentElement.scrollWidth - innerWidth, small: window.smallTargets(sr) }; }"""
FRAMES_MERKEN_JS = """() => { window.__frames = []; window.card()._map.el.addEventListener('map-frame', (e) => window.__frames.push(e.detail && e.detail.frameId)); return true; }"""
OFFLINE_JS = """() => { const c = window.card(), sr = c.shadowRoot, hint = sr.querySelector('#offline-hint');
    const drive = Array.from(sr.querySelectorAll('.ctl')).filter((b) => ['start', 'pause', 'stop', 'return', 'resume'].includes(b.getAttribute('data-action')));
    return { offline: c.hasAttribute('data-offline'), hint: hint && hint.getBoundingClientRect().height > 0 ? { role: hint.getAttribute('role'), text: hint.textContent } : null,
             drive: drive.map((b) => ({ action: b.getAttribute('data-action'), disabled: b.disabled, why: b.getAttribute('aria-describedby') })),
             pageOverflow: document.documentElement.scrollWidth - innerWidth, small: window.smallTargets(sr) }; }"""
REMOTE_LANGSAM_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, r = sr.querySelector('.remote'), slow = sr.querySelector('.remote-slow');
    return { rtt: r && r.hasAttribute('data-rtt') ? Number(r.getAttribute('data-rtt')) : null,
             slow: slow ? { hidden: slow.hidden, shown: slow.getBoundingClientRect().height > 0, text: slow.textContent, role: slow.getAttribute('role') } : null }; }"""


def bereich_netz(k):
    """M6 karte-veraltet, M18 offline, M39 netz_langsam/netz_fehler/fernsteuerung_langsam."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    out = {}
    # M6: frame A shown, frame B answered with 500 -> the last good map stays, marked stale, with the hint.
    stale = []
    a, b = VERALTET_FRAMES
    for w, th in ((390, "light"), (1280, "dark")):
        page.set_viewport_size({"width": w, "height": 844 if w < 450 else 800})
        theme(th)
        page.evaluate(FRAME_CACHE_LEEREN)
        page.evaluate(NETZ_JS, {"fehlerFrame": b})
        baue_daten(k, daten_mit(k, "docked", lambda st: mit_frame(st, a)))
        ruhe("m && m.current().mode === 'data'")
        vorher = page.evaluate(NETZ_STAND_JS)
        page.evaluate(NEUER_FRAME_JS, {"frame": b})
        try:
            page.wait_for_function("() => { const m = window.card()._map; return !!m && m.el.hasAttribute('data-stale'); }", timeout=8000)
        except PlaywrightTimeout:
            pass
        ruhe("m && m.el.hasAttribute('data-stale')", ms=4000)
        g = page.evaluate(NETZ_STAND_JS)
        shot(f"karte-veraltet-{w}-{th}.png")
        page.evaluate(NETZ_JS, None)
        build("docked")
        stale.append({"w": w, "theme": th, "before": vorher["mode"], **g})
    out["veraltet"] = stale
    ok_stale = lambda x: x["before"] == "data" and x["mode"] == "data" and x["stale"] and any(
        n["kind"] == "stale" and "nicht aktuell" in n["text"] for n in x["notes"]) and x["pageOverflow"] <= 0 and not x["small"]
    check("M6 stale map: frame B answered 500 keeps frame A in data mode, data-stale and the hint 'Karte nicht aktuell' (390 light, 1280 dark)",
          all(ok_stale(x) for x in stale), json.dumps([{kk: x[kk] for kk in ("w", "theme", "before", "mode", "stale", "notes", "stats")} for x in stale if not ok_stale(x)]))

    # M18: hass.connected false -> data-offline, the hint, every drive button locked with the reason, 0 calls (also from the menu).
    offline = []
    hass_extra(k, {"connected": False})
    for w in (390, 1280):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": 900})
            theme(th)
            build("docked")
            g = page.evaluate(OFFLINE_JS)
            shot(f"offline-{w}-{th}.png")
            page.evaluate("""() => { const c = window.card(); c.shadowRoot.querySelectorAll('.ctl').forEach((b) => b.click());
                window.closeDialogs(); c.shadowRoot.querySelector('.menu-button').click();
                const e = window.dialog() && window.dialog().shadowRoot.querySelector('[data-entry=locate]'); if (e) e.click(); }""")
            ruhe()
            page.evaluate(DIALOGE_ZU)
            offline.append({"w": w, "theme": th, "calls": dienste_leeren(k), **g})
    hass_extra(k, None)
    out["offline"] = offline
    ok_off = lambda x: x["offline"] and x["hint"] and x["drive"] and all(d["disabled"] and d["why"] == "offline-hint" for d in x["drive"]) and not x["calls"]
    check("M18 offline: hass.connected false shows the hint, locks every drive button with aria-describedby offline-hint, clicks and Orten send 0 calls (390/1280, light/dark)",
          all(ok_off(x) for x in offline) and all(x["pageOverflow"] <= 0 and not x["small"] for x in offline),
          json.dumps([{kk: x[kk] for kk in ("w", "theme", "offline", "hint", "drive", "calls")} for x in offline if not ok_off(x)][:3]))

    # M39 netz_langsam: latency 1.5 s, a new frame every 0.5 s (10 frames).
    page.set_viewport_size({"width": 1280, "height": 800})
    theme("dark")
    page.evaluate(FRAME_CACHE_LEEREN)
    baue_daten(k, daten_mit(k, "docked", lambda st: mit_frame(st, 990300)))
    ruhe("m && m.current().mode === 'data'")
    page.evaluate(FRAMES_MERKEN_JS)
    page.evaluate(NETZ_JS, {"latenz": 1500})
    page.evaluate("""async (n) => { for (let i = 1; i <= n; i++) {
        const c = window.card(), h = c.hass, st = Object.assign({}, h.states);
        for (const id of ['camera.robo_map', 'camera.robo_map_1']) { const s = st[id]; if (!s) continue;
          st[id] = Object.assign({}, s, { attributes: Object.assign({}, s.attributes, { frame_id: 990300 + i, entity_picture: '/api/camera_proxy/' + id + '?token=testtoken&v=' + (990300 + i) }) }); }
        c.hass = Object.assign({}, h, { states: st });
        await new Promise((r) => setTimeout(r, 500)); } }""", 10)
    try:
        page.wait_for_function("() => window.__netz.laufend === 0 && window.__frames.length >= 2", timeout=10000, polling=100)
    except PlaywrightTimeout:
        pass
    langsam = page.evaluate(NETZ_STAND_JS)
    shot("netz-langsam-1280-dark.png")
    page.evaluate(NETZ_JS, None)
    out["langsam"] = langsam
    s = langsam["stats"] or {}
    check("M39 netz_langsam: latency 1.5 s, frames every 0.5 s -> >= 2 frames applied, at most 1 fetch at a time, fetchMs >= 1500 (median), discarded <= data, no failure (1280 dark)",
          len(langsam["frames"]) >= 2 and langsam["netz"]["hoechstens"] <= 1 and (s.get("fetchMs") or 0) >= 1500
          and s.get("discarded", 1e9) <= s.get("data", -1) and s.get("failures") == 0 and langsam["mode"] == "data",
          json.dumps({kk: langsam[kk] for kk in ("frames", "netz", "stats", "mode")}))

    # M39 netz_fehler: the first data fetch answers 500 -> failures 1, a retry after the backoff, data mode at the end.
    page.evaluate(FRAME_CACHE_LEEREN)
    page.evaluate(NETZ_JS, {"fehlerNr": [1]})
    baue_daten(k, daten_mit(k, "docked", lambda st: mit_frame(st, 990400)), warten=False)
    try:
        page.wait_for_function("""() => { const m = window.card()._map; return !!m && m.stats.retries >= 1 && m.current().mode === 'data'
            && window.__netz.laufend === 0; }""", timeout=10000, polling=100)
    except PlaywrightTimeout:
        pass
    ruhe()
    fehler = page.evaluate(NETZ_STAND_JS)
    shot("netz-fehler-1280-dark.png")
    page.evaluate(NETZ_JS, None)
    build("docked")
    out["fehler"] = fehler
    s = fehler["stats"] or {}
    check("M39 netz_fehler: first fetch 500 -> failures 1, retries >= 1, data mode at the end, no stale hint left (1280 dark)",
          s.get("failures") == 1 and s.get("retries", 0) >= 1 and fehler["mode"] == "data" and not fehler["stale"],
          json.dumps({kk: fehler[kk] for kk in ("stats", "mode", "stale", "notes", "netz")}))

    # M39 fernsteuerung_langsam: every drive step answers after 800 ms -> data-rtt >= 600 and the hint.
    page.set_viewport_size({"width": 390, "height": 844})
    theme("light")
    build("docked")
    page.evaluate(remote_open, True)
    ruhe()
    dienst(k, "langsam", ms=800)
    page.keyboard.down("w")
    try:
        page.wait_for_function("""() => { const r = window.dialog() && window.dialog().shadowRoot.querySelector('.remote');
            return !!r && Number(r.getAttribute('data-rtt')) >= 600; }""", timeout=8000, polling=100)
    except PlaywrightTimeout:
        pass
    k.frames(2)
    remote = page.evaluate(REMOTE_LANGSAM_JS) or {"rtt": None, "slow": None}
    shot("fernsteuerung-langsam-390x844-light.png")
    page.keyboard.up("w")
    ruhe(WANN_STOPP, ms=6000)
    page.evaluate(DIALOGE_ZU)
    page.wait_for_timeout(1200)  # real time on purpose: slow answers and the stop after closing land in the stub before it is emptied
    remote["calls"] = len(dienste_leeren(k))
    out["fernsteuerung"] = remote
    report["netz"] = out
    check("M39 fernsteuerung_langsam: drive steps answered after 800 ms -> data-rtt >= 600 and the visible hint 'Verbindung langsam' (390x844 light)",
          remote["rtt"] is not None and remote["rtt"] >= 600 and remote["slow"] and not remote["slow"]["hidden"] and remote["slow"]["shown"]
          and "langsam" in remote["slow"]["text"], json.dumps(remote))


# ── M20 · Teilfehler beim Speichern ────────────────────────────────────────
TEILFEHLER_JS = """async () => { const c = window.card(), I = customElements.get('busch-vacuum-card').__internals;
    const s = c._editSession || new I.MapEditSession(c);
    const ruf = (i) => ({ service: 'vacuum_set_restricted_zone', data: { walls: [], zones: [], no_mops: [], nr: i } });
    const undo = { text: 'drei Gruppen', calls: [ruf(11), ruf(12), ruf(13)], groups: [1, 2, 3].map((i) => ({ count: 1, calls: [ruf(10 + i)] })) };
    const ok = await s.commit({ card: c, confirmed: true }, [ruf(1), ruf(2), ruf(3)], { undo, backup: false });
    return { ok, error: s.error && s.error.text, undo: s.undo.length, undoCalls: s.undo.length ? s.undo[s.undo.length - 1].calls.length : 0,
             shared: c._editSession === s }; }"""


def bereich_teilfehler(k):
    """M20: drei Gruppen, die dritte scheitert -> „2 von 3 Gruppen gespeichert“ in der Speicherbestätigung."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    rows = []
    rest_aufrufe(k, "teilfehler")
    for w, h in ((360, 640), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            build("editor")
            title = page.evaluate(edit_open, {"entry": "edit", "steps": ["[data-tool=zones]", "[data-action=edit-add]", "[data-action=save]"]})
            ruhe()
            dienst(k, "nte", n=3, grund="Gerät lehnt ab")
            r = page.evaluate(TEILFEHLER_JS)
            ruhe()
            box = page.evaluate(DIALOG_BOX_JS)
            label = page.evaluate("() => { const b = window.dialog() && window.dialog().shadowRoot.querySelector('[data-action=confirm]'); return b ? b.textContent : null; }")
            shot(f"karten-teilfehler-{w}x{h}-{th}.png")
            page.evaluate(DIALOGE_ZU)
            rows.append({"w": w, "theme": th, "title": title, "calls": dienste_leeren(k), "label": label, "box": box, **r})
    report["teilfehler"] = rows
    ok = lambda x: x.get("ok") is False and "2 von 3 Gruppen gespeichert" in (x["error"] or "") and x["undo"] >= 1 and x["undoCalls"] == 2\
        and x["box"].get("kind") == "confirm" and "2 von 3 Gruppen gespeichert" in x["box"].get("text", "") and len(x["calls"]) == 3
    check("M20 partial save: the third of three calls fails -> '2 von 3 Gruppen gespeichert' in the open save confirmation, undo of the two written groups (360x640, 1280x800, light/dark)",
          all(ok(x) for x in rows) and all(not x["box"].get("missing") and inside(x["box"]) and not x["box"]["small"] for x in rows),
          json.dumps([{kk: x.get(kk) for kk in ("w", "theme", "title", "ok", "error", "undo", "undoCalls", "shared", "label", "calls")} for x in rows if not ok(x)][:3]))


# ── M3, M5 · Befehle ───────────────────────────────────────────────────────
MELDUNG_JS = """() => { const sr = window.card().shadowRoot, m = sr.querySelector('.message[data-kind=error]');
    return m ? { role: m.getAttribute('role'), text: m.textContent, dismiss: !!m.querySelector('[data-action=dismiss]'),
                 pageOverflow: document.documentElement.scrollWidth - innerWidth, small: window.smallTargets(sr) } : null; }"""


def bereich_befehle(k):
    """M3/M5: abgelehnter Befehl mit R12-Text, Start bei hängendem Dienst, Kartenwechsel läuft, Hindernis ignorieren scheitert."""
    page, report, check, theme, build, ruhe, shot, open_menu, open_floors, open_obstacle = (
        k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot, k.open_menu, k.open_floors, k.open_obstacle)
    out = {"meldung": []}
    rest_aufrufe(k, "befehle")
    for w in (390, 1280):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": 900})
            theme(th)
            build("docked")
            dienst(k, "ablehnen", grund="Roboter offline")
            open_menu()
            ruhe()
            page.evaluate("() => { const e = window.dialog() && window.dialog().shadowRoot.querySelector('[data-entry=locate]'); if (e) e.click(); }")
            try:
                page.wait_for_function("() => !!window.card().shadowRoot.querySelector('.message[data-kind=error]')", timeout=5000)
            except PlaywrightTimeout:
                pass
            page.evaluate(DIALOGE_ZU)
            ruhe()
            g = page.evaluate(MELDUNG_JS)
            shot(f"karte-meldung-befehlfehler-{w}-{th}.png")
            out["meldung"].append({"w": w, "theme": th, "calls": dienste_leeren(k), "m": g})
    ok_m = lambda x: x["m"] and x["m"]["role"] == "alert" and "Orten" in x["m"]["text"] and "Roboter offline" in x["m"]["text"]\
        and "erneut" in x["m"]["text"] and x["m"]["dismiss"] and x["calls"] == [["vacuum", "locate"]] and x["m"]["pageOverflow"] <= 0 and not x["m"]["small"]
    check("M5 refused command: a refused Orten shows the R12 text (what, reason, try again) as alert in the card, dismissable, one call (390/1280, light/dark)",
          all(ok_m(x) for x in out["meldung"]), json.dumps([x for x in out["meldung"] if not ok_m(x)][:2]))

    # M3: a hanging start keeps the bar busy, a second tap sends nothing.
    page.set_viewport_size({"width": 390, "height": 900})
    theme("light")
    build("docked")
    dienst(k, "haengen")
    # A double tap on the same node, then a tap on whatever start button the bar shows now (as tests/steuerung.test.js M3).
    page.evaluate("() => { const b = window.card().shadowRoot.querySelector('.ctl[data-action=start]'); b.click(); b.click(); }")
    k.frames(2)
    page.evaluate("() => { const b = window.card().shadowRoot.querySelector('.ctl[data-action=start]'); if (b) b.click(); }")
    k.frames(2)
    start = page.evaluate("""() => { const sr = window.card().shadowRoot;
        return { state: sr.querySelector('.state').textContent, actions: Array.from(sr.querySelectorAll('.ctl')).map((x) => x.getAttribute('data-action')) }; }""")
    shot("karte-start-sendet-390-light.png")
    start["calls"] = dienste_leeren(k)
    build("docked")
    out["start"] = start
    check("M3 hanging start: the preview 'Reinigt' stays while the service hangs, a double tap and a further tap send nothing (exactly one call, 390 light)",
          start["state"] == "Reinigt" and len(start["calls"]) == 1, json.dumps(start))

    # M5: floor change running -> the dialog names it ("Wird gewechselt …", aria-busy), a tap sends no second call.
    floors = []
    for w, h in ((360, 640), (1280, 800)):
        page.set_viewport_size({"width": w, "height": h})
        theme("light")
        build("floors", config={"hidden_card_objects": ["map_change_confirmation"]})
        dienst(k, "haengen")
        first = page.evaluate("() => window.card()._map.selectMap(7)")
        open_floors()
        ruhe()
        g = page.evaluate("""() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, t = Array.from(sr.querySelectorAll('.floor')).find((e) => e.getAttribute('data-map') === '7');
            const r = t ? { text: t.textContent, busy: t.getAttribute('aria-busy') } : null; if (t) t.click(); return r; }""")
        k.frames(2)
        box = page.evaluate(DIALOG_BOX_JS)
        shot(f"dialog-stockwerk-wechselt-{w}x{h}-light.png")
        page.evaluate(DIALOGE_ZU)
        floors.append({"w": w, "first": first, "target": g, "box": box, "calls": dienste_leeren(k)})
    build("docked")
    out["stockwerk"] = floors
    ok_f = lambda x: x["first"] is True and x["target"] and "Wird gewechselt" in x["target"]["text"] and x["target"]["busy"] == "true"\
        and [c for c in x["calls"] if c[1] == "vacuum_select_map"] == [["dreame_vacuum", "vacuum_select_map"]]
    check("M5 floor change running: the floor dialog shows 'Wird gewechselt …' with aria-busy, a tap on it sends no second call (360x640, 1280x800 light)",
          all(ok_f(x) for x in floors) and all(not x["box"].get("missing") and inside(x["box"]) and not x["box"]["small"] for x in floors),
          json.dumps([{kk: x[kk] for kk in ("w", "first", "target", "calls")} for x in floors if not ok_f(x)]))

    # M5: ignoring an obstacle refused -> the note in the details names the reason, the button is usable again.
    page.set_viewport_size({"width": 360, "height": 640})
    theme("light")
    build("docked")
    dienst(k, "ablehnen", grund="Gerät offline")
    open_obstacle()
    ruhe()
    page.evaluate("() => { const b = window.dialog() && window.dialog().shadowRoot.querySelector('[data-action=obstacle-ignore]'); if (b) b.click(); }")
    try:
        page.wait_for_function("""() => { const n = window.dialog() && window.dialog().shadowRoot.querySelector('.obstacle-note');
            return !!n && n.textContent.includes('Gerät offline'); }""", timeout=5000)
    except PlaywrightTimeout:
        pass
    ruhe()
    obst = page.evaluate("""() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, n = sr.querySelector('.obstacle-note'), b = sr.querySelector('[data-action=obstacle-ignore]');
        return { note: n ? n.textContent : null, button: b ? !b.disabled : null }; }""") or {"note": None, "button": None}
    obst["box"] = page.evaluate(DIALOG_BOX_JS)
    shot("dialog-hindernis-fehler-360x640-light.png")
    page.evaluate(DIALOGE_ZU)
    obst["calls"] = dienste_leeren(k)
    out["hindernis"] = obst
    report["befehle"] = out
    check("M5 obstacle ignore refused: the details name the reason ('Gerät offline'), the button is usable again (360x640 light)",
          obst["note"] and "Gerät offline" in obst["note"] and obst["button"] is True and len(obst["calls"]) == 1,
          json.dumps({kk: obst[kk] for kk in ("note", "button", "calls")}))


# ── M2 · Aktionsleiste ─────────────────────────────────────────────────────
LEISTE_BREITEN = (320, 360, 390, 1280)
LEISTE_JS = """() => { const sr = window.card().shadowRoot, bar = sr.querySelector('.controls');
    const knoepfe = Array.from(bar.children).filter((b) => b.getBoundingClientRect().width > 0 && b.matches('button, .ctl, .dock'));
    const tops = knoepfe.map((b) => Math.round(b.getBoundingClientRect().top)).sort((a, b) => a - b);
    let rows = 0, last = -1e9; for (const t of tops) { if (t - last > 8) rows++; last = t; }
    return { rows, wrap: bar.hasAttribute('data-wrap'), pageOverflow: document.documentElement.scrollWidth - innerWidth, small: window.smallTargets(sr),
      knoepfe: knoepfe.map((b) => { const t = b.querySelector('.ctl-text') || b;
        return { action: b.getAttribute('data-action') || b.className, text: (t.innerText || t.textContent || '').trim(), label: b.getAttribute('aria-label'),
                 cut: b.scrollWidth - b.clientWidth, cutText: t.scrollWidth - t.clientWidth, overflow: getComputedStyle(t).textOverflow }; }) }; }"""


def bereich_leiste(k):
    """M2: Aktionsleiste reinigend/ruhend/außer Dock bei 320/360/390/1280 hell/dunkel: nie gekürzt, höchstens 2 Reihen."""
    page, report, check, theme, ruhe, shot = k.page, k.report, k.check, k.theme, k.ruhe, k.shot

    def ausser_dock(st):
        st["vacuum.robo"]["state"] = "idle"
        st["vacuum.robo"]["attributes"].update({"docked": False, "charging": False})
    zustaende = (("reinigend", k.data["cleaning"]), ("ruhend", k.data["docked"]), ("ausserdock", daten_mit(k, "docked", ausser_dock)))
    rows = []
    for label, data in zustaende:
        for w in LEISTE_BREITEN:
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": 900})
                theme(th)
                baue_daten(k, data)
                g = page.evaluate(LEISTE_JS)
                shot(f"leiste-{label}-{w}-{th}.png")
                rows.append({"label": label, "w": w, "theme": th, **g})
    report["leiste"] = rows
    gekuerzt = lambda x: [b for b in x["knoepfe"] if "…" in b["text"] or b["cut"] > 0 or b["cutText"] > 0 or b["overflow"] == "ellipsis"]
    check("M2 action bar: no button cut ('…', scrollWidth > clientWidth, text-overflow ellipsis) in cleaning/docked/undocked at 320/360/390/1280, light/dark",
          all(not gekuerzt(x) for x in rows), json.dumps([(x["label"], x["w"], x["theme"], gekuerzt(x)) for x in rows if gekuerzt(x)][:4]))
    check("M2 action bar: at most 2 rows, no sideways page scroll, 44 px buttons",
          all(x["rows"] <= 2 and x["pageOverflow"] <= 0 and not x["small"] for x in rows),
          json.dumps([(x["label"], x["w"], x["theme"], x["rows"], x["pageOverflow"], x["small"]) for x in rows if x["rows"] > 2 or x["pageOverflow"] > 0 or x["small"]][:4]))
    words = lambda label: next((x for x in rows if x["label"] == label and x["w"] == 390 and x["theme"] == "light"), None)
    rein, aus = words("reinigend"), words("ausserdock")
    texte = lambda x: {b["action"]: b["text"] for b in x["knoepfe"]} if x else {}
    labels = lambda x: {b["action"]: b["label"] for b in x["knoepfe"]} if x else {}
    check("M2 action bar words: cleaning 'Pause/Stopp/Dock' (return named 'Zurück zum Dock'), undocked the full 'Zurück zum Dock' (390 light)",
          [texte(rein).get(a) for a in ("pause", "stop", "return")] == ["Pause", "Stopp", "Dock"] and labels(rein).get("return") == "Zurück zum Dock"
          and texte(aus).get("return") == "Zurück zum Dock", json.dumps({"reinigend": texte(rein), "ausserdock": texte(aus)}))


# ── E6: M11, M12, M13, M21 ─────────────────────────────────────────────────
M11_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet'), r = sheet.getBoundingClientRect();
    const acts = sr.querySelector('.actions'), a = acts ? acts.getBoundingClientRect() : null;
    const btns = acts ? Array.from(acts.querySelectorAll('button')).filter((b) => b.getBoundingClientRect().width > 0).map((b) => { const x = b.getBoundingClientRect(); return { w: x.width, h: x.height, t: x.top, b: x.bottom }; }) : [];
    return { kind: sheet.getAttribute('data-kind'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, W: innerWidth, H: innerHeight,
             actions: a ? { t: a.top, b: a.bottom, w: a.width, cw: a.width - parseFloat(getComputedStyle(acts).paddingLeft) - parseFloat(getComputedStyle(acts).paddingRight) } : null, btns, scrollTop: sheet.scrollTop, small: window.smallTargets(sr) }; }"""
M12_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet');
    const titles = Array.from(sr.querySelectorAll('.run-title')).filter((t) => t.getBoundingClientRect().width > 0);
    const lines = (t) => { const r = document.createRange(); r.selectNodeContents(t); const tops = [];
      for (const x of Array.from(r.getClientRects())) { if (x.width < 1) continue; const y = Math.round(x.top); if (!tops.some((v) => Math.abs(v - y) <= 3)) tops.push(y); } return tops.length; };
    return { n: titles.length, xs: titles.map((t) => Math.round(t.getBoundingClientRect().left * 10) / 10), wrapped: titles.filter((t) => lines(t) > 1).map((t) => t.textContent),
             overflowX: sheet.scrollWidth - sheet.clientWidth, small: window.smallTargets(sr) }; }"""
M13_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, rows = Array.from(sr.querySelectorAll('.room-list [data-room]'));
    return { rows: rows.map((b) => { const ch = b.querySelector('.room-chevron'), v = b.querySelector('.room-values');
      return { room: b.getAttribute('data-room'), chevron: !!ch && ch.getBoundingClientRect().width > 0, values: v ? v.textContent : null }; }),
      overflowX: sr.querySelector('.sheet').scrollWidth - sr.querySelector('.sheet').clientWidth, small: window.smallTargets(sr) }; }"""
# M21: "Turbo" is also the German word and "Wetness level" is a setting name, not an option word (both stay in ENGLISCHE_WOERTER for "mit").
M21_ENGLISCH = tuple(w for w in ENGLISCHE_WOERTER if w not in ("Turbo", "Wetness level"))


def bereich_oberflaeche(k):
    """E6: M11 Bestätigung am Handy, M12 Verlaufsliste fluchtet, M13 Räume mit Labels, M21 Wörter ohne Übersetzung."""
    page, report, check, theme, build, ruhe, shot, open_confirm = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot, k.open_confirm
    out = {}
    m11 = []
    for w, h, themes in ((360, 640, THEMES), (390, 844, THEMES), (800, 600, ("light",)), (1280, 800, ("light",))):
        for th in themes:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            build("docked")
            open_confirm()
            ruhe()
            g = page.evaluate(M11_JS)
            shot(f"dialog-bestaetigung-m11-{w}x{h}-{th}.png")
            page.evaluate(DIALOGE_ZU)
            m11.append({"w": w, "h": h, "theme": th, **(g or {"actions": None, "btns": [], "small": ["kein Dialog"]})})
    out["m11"] = m11

    def m11_ok(x):  # full-width buttons = the content box of .actions, inside its padding
        if not x.get("actions") or not x.get("btns"):
            return False
        if x["w"] < 450 or x["h"] < 500:
            return (abs(x["bottom"] - x["H"]) <= 1 and x["height"] >= 0.9 * x["H"] - 1 and x["actions"]["b"] <= x["H"] + 0.5
                    and x["bottom"] - x["actions"]["b"] <= 24 and all(b["h"] >= 48 and b["w"] >= x["actions"]["cw"] - 1 for b in x["btns"]))
        return abs(x["width"] - 320) <= 0.5 and x["top"] >= 12 and all(b["b"] <= x["bottom"] + 0.5 for b in x["btns"])
    check("M11 confirmation: below 450 x 500 a bottom sheet (>= 90 % high) with the full-width 48 px buttons at its bottom, on screen without scrolling; "
          "above 320 px centred (360x640/390x844 light/dark, 800x600, 1280x800)",
          all(m11_ok(x) and not x["small"] for x in m11), json.dumps([x for x in m11 if not m11_ok(x) or x["small"]][:3]))

    m12 = []
    for w, h in ((360, 640), (390, 844), (1280, 800)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            build("docked")
            page.evaluate(hist_open, {"entry": "history", "steps": ["[data-group='1794228271']"]})
            ruhe()
            g = page.evaluate(M12_JS)
            shot(f"verlauf-liste-flucht-{w}x{h}-{th}.png")
            page.evaluate(DIALOGE_ZU)
            m12.append({"w": w, "theme": th, **(g or {"n": 0, "xs": [0], "wrapped": ["kein Dialog"], "overflowX": 0, "small": []})})
    out["m12"] = m12
    ok12 = lambda x: x["n"] > 5 and max(x["xs"]) - min(x["xs"]) <= 1 and not x["wrapped"] and x["overflowX"] <= 1 and not x["small"]
    check("M12 history list with an open group: every title starts at the same x (<= 1 px) and does not wrap (360/390/1280, light/dark)",
          all(ok12(x) for x in m12), json.dumps([{kk: x[kk] for kk in ("w", "theme", "n", "wrapped")} | {"xs": sorted(set(x["xs"]))[:6]} for x in m12 if not ok12(x)][:3]))

    m13 = []
    for th in THEMES:
        page.set_viewport_size({"width": 360, "height": 640})
        theme(th)
        build("customized")
        page.evaluate(clean_open, ["[data-action=rooms]"])
        ruhe()
        g = page.evaluate(M13_JS)
        shot(f"reinigung-raeume-m13-360x640-{th}.png")
        page.evaluate(DIALOGE_ZU)
        m13.append({"theme": th, **(g or {"rows": [], "overflowX": 0, "small": []})})
    out["m13"] = m13
    unlabelled = lambda x: [r for r in x["rows"] if not r["chevron"] or not r["values"]
                            or any(not re.search(r"[A-Za-zÄÖÜäöüß]", part) for part in r["values"].split(" · "))]
    check("M13 Räume einstellen: every room row with a visible chevron, no value without its label (360x640 light/dark)",
          all(x["rows"] and not unlabelled(x) and x["overflowX"] <= 1 and not x["small"] for x in m13),
          json.dumps([(x["theme"], unlabelled(x)[:3], len(x["rows"])) for x in m13 if not x["rows"] or unlabelled(x)]))

    # M21 words: HA without the integration's texts (localize gives '') and German.
    theme("dark")
    page.set_viewport_size({"width": 1296, "height": 900})
    build("docked", panel=True, texte={})
    panel = page.evaluate(UEB_TEXT_JS)
    shot("uebersetzung-leer-layout-panel-all-1280-dark.png")
    page.set_viewport_size({"width": 390, "height": 844})
    build("docked", texte={})
    page.evaluate(hist_open, {"entry": "history", "steps": []})
    ruhe(wann_ansicht("history"))
    verlauf = page.evaluate(UEB_TEXT_JS)
    shot("uebersetzung-leer-verlauf-390x844-dark.png")
    build("docked", texte={})
    page.evaluate(clean_open, [])
    ruhe(wann_ansicht("clean-settings"))
    reinigung = page.evaluate(UEB_TEXT_JS)
    shot("uebersetzung-leer-reinigung-390x844-dark.png")
    page.evaluate(DIALOGE_ZU)
    alles = panel["card"] + "\n" + verlauf["dialog"] + "\n" + reinigung["dialog"]
    out["m21"] = {"summary": panel["summary"], "englisch": [w for w in ENGLISCHE_WOERTER if w in alles]}
    report["oberflaeche"] = out
    check("M21 words: with an empty localize and German no English option or run word in panel 1280 dark, history and cleaning settings",
          not [w for w in M21_ENGLISCH if w in alles] and "Raumreinigung" in verlauf["dialog"], json.dumps(out["m21"]))


# ── E7: M31, M32, M33, M34, M35, M36 ───────────────────────────────────────
FOKUS_JS = """() => { const d = window.dialog(); if (!d) return null; const sr = d.shadowRoot, a = sr.activeElement, sheet = sr.querySelector('.sheet');
    const ring = (n) => { if (!n) return null; const s = getComputedStyle(n); return { style: s.outlineStyle, width: s.outlineWidth, visible: n.matches(':focus-visible') }; };
    const first = d._focusable ? d._focusable()[0] : null;
    return { onSheet: a === sheet, first: !!a && a === first, ring: ring(a),
             ringed: Array.from(sr.querySelectorAll('button')).filter((b) => b.matches(':focus-visible')).length }; }"""
M31_JS = """() => { const sr = window.card().shadowRoot, vis = (n) => !!n && n.getBoundingClientRect().width > 0;
    const chips = Array.from(sr.querySelectorAll('.chip-slot .room-chip')).filter(vis), more = sr.querySelector('[data-action=rooms-more]');
    const chip = chips[0], cs = more ? getComputedStyle(more) : null;
    return { chipLeft: chip ? chip.getBoundingClientRect().left : null, moreLeft: vis(more) ? more.getBoundingClientRect().left : null,
             moreText: more ? more.textContent : null, moreClass: more ? more.className : null, moreDecoration: cs ? cs.textDecorationLine : null,
             moreColor: cs ? cs.color : null, chipColor: chip ? getComputedStyle(chip).color : null,
             pills: Array.from(sr.querySelectorAll('.pill-action')).filter(vis).map((p) => { const s = getComputedStyle(p);
               return { radius: s.borderTopLeftRadius, border: s.borderTopWidth, h: p.getBoundingClientRect().height, icon: !!p.querySelector('ha-icon'), text: p.textContent.trim() }; }),
             small: window.smallTargets(sr), pageOverflow: document.documentElement.scrollWidth - innerWidth }; }"""
M33_JS = """() => { const c = window.card(), sr = c.shadowRoot, m = c._map, cv = sr.querySelector('.map-base');
    if (!m || !cv || cv.tagName !== 'CANVAS') return { error: 'kein Canvas', mode: m ? m.current().mode : null };
    const ctx = cv.getContext('2d'), box = cv.getBoundingClientRect();
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
    const pixel = (x, y) => { const px = Math.floor((x - box.left) / box.width * cv.width), py = Math.floor((y - box.top) / box.height * cv.height);
      if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) return null; const d = ctx.getImageData(px, py, 1, 1).data; return [d[0], d[1], d[2]]; };
    const rooms = c.hass.states['camera.robo_map'].attributes.rooms, areas = [];
    for (const [id, r] of Object.entries(rooms)) { if (r.x === undefined) continue; const s = m.toScreen(m.toImage({ x: r.x, y: r.y })); const p = pixel(s.x, s.y);
      if (p) areas.push({ id, rgb: p, lum: Math.round(lum(p) * 1000) / 1000 }); }
    const parse = (v) => (String(v).match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const labels = Array.from(sr.querySelectorAll('[data-layer=rooms] text[data-role=name]')).filter((t) => t.getBoundingClientRect().width > 0).map((t) => {
      const b = t.getBoundingClientRect(), under = pixel(b.left + b.width / 2, b.top + b.height / 2), fill = parse(getComputedStyle(t).fill);
      if (!under || fill.length < 3) return { text: t.textContent, ratio: null };
      const L = [lum(fill), lum(under)].sort((x, y) => y - x); return { text: t.textContent, ratio: Math.round((L[0] + 0.05) / (L[1] + 0.05) * 100) / 100 }; });
    return { mode: m.current().mode, areas, labels }; }"""
M34_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot, sheet = sr.querySelector('.sheet');
    const box = (sel) => { const n = sr.querySelector(sel); if (!n || !n.getClientRects().length) return null; const r = n.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: r.height }; };
    return { map: box('.edit-map .map-stage') || box('.edit-map'), tools: box('.edit-tools'), save: box('[data-action=save]'), bar: box('.edit-bar'),
             scrollTop: sheet.scrollTop, H: innerHeight, small: window.smallTargets(sr) }; }"""
M36_JS = """() => { const sr = window.card().shadowRoot, m = sr.querySelector('.message[data-kind=error]'); if (!m) return null;
    const lines = (n) => { if (!n) return 0; const r = document.createRange(); r.selectNodeContents(n); const tops = [];
      for (const x of Array.from(r.getClientRects())) { if (x.width < 1) continue; const y = Math.round(x.top); if (!tops.some((v) => Math.abs(v - y) <= 3)) tops.push(y); } return tops.length; };
    const title = m.querySelector('.message-title'), step = m.querySelector('.message-step'), start = sr.querySelector('.ctl[data-action=start]');
    return { title: title ? title.textContent : null, step: step ? step.textContent : null, lines: lines(title) + lines(step),
             startDisabled: start ? start.disabled : null, small: window.smallTargets(sr), pageOverflow: document.documentElement.scrollWidth - innerWidth }; }"""


def bereich_feinschliff(k):
    """E7: M35 Stationsmenü, M32 Fokus beim Öffnen, M36 Fehlerbanner, M31 Zweitaktionen, M33 dunkle Flächen, M34 Karteneditor."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    out = {}
    # M35: station menu by content (<= 360 px from 450 x 500), full screen on a phone; Escape and an outside click close it.
    m35 = []
    for w, h, th in ((1280, 800, "dark"), (360, 640, "light")):
        page.set_viewport_size({"width": w, "height": h})
        theme(th)
        build("docked")
        page.evaluate(dock_open, [])
        ruhe()
        g = page.evaluate(DIALOG_BOX_JS)
        shot(f"station-menu-m35-{w}x{h}-{th}.png")
        page.keyboard.press("Escape")
        ruhe(WANN_DIALOG_ZU, ms=4000)
        esc = page.evaluate("() => !window.dialog()")
        outside = None
        if w >= 450:  # a phone menu is full screen: there is no outside
            page.evaluate(dock_open, [])
            ruhe()
            page.mouse.click(4, 4)
            ruhe(WANN_DIALOG_ZU, ms=4000)
            outside = page.evaluate("() => !window.dialog()")
        page.evaluate(DIALOGE_ZU)
        m35.append({"w": w, "h": h, "theme": th, "escape": esc, "outside": outside, **g})
    out["m35"] = m35
    ok35 = lambda x: not x.get("missing") and x.get("view") == "station-menu" and x["escape"] and (x["w"] < 450 or x["outside"]) and (
        x["width"] <= 360 if x["w"] >= 450 else abs(x["top"]) <= 1 and abs(x["bottom"] - x["H"]) <= 1 and abs(x["left"]) <= 1 and abs(x["right"] - x["W"]) <= 1)
    check("M35 station menu: at 1280 at most 360 px wide and closed by Escape and an outside click; at 360x640 full screen, Escape closes",
          all(ok35(x) and not x.get("small") for x in m35), json.dumps([{kk: x.get(kk) for kk in ("w", "view", "width", "top", "bottom", "escape", "outside", "small")} for x in m35]))

    # M32: opened by a real mouse click -> focus on the sheet, no ring; by keyboard -> ring on the first control.
    page.set_viewport_size({"width": 390, "height": 844})
    theme("light")
    build("docked")
    pt = page.evaluate("() => { const b = window.card().shadowRoot.querySelector('.menu-button').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }")
    page.mouse.click(pt["x"], pt["y"])
    ruhe()
    maus = page.evaluate(FOKUS_JS)
    shot("dialog-fokus-maus-390x844-light.png")
    page.evaluate(DIALOGE_ZU)
    build("docked")
    page.evaluate("() => window.card().shadowRoot.querySelector('.menu-button').focus()")
    page.keyboard.press("Enter")
    ruhe()
    taste = page.evaluate(FOKUS_JS)
    shot("dialog-fokus-taste-390x844-light.png")
    page.evaluate(DIALOGE_ZU)
    out["m32"] = {"maus": maus, "taste": taste}
    check("M32 focus on opening: a real mouse click puts the focus on the sheet without a ring (no ringed button); the keyboard on the first control with a 2 px ring (390x844 light)",
          bool(maus) and maus["onSheet"] and maus["ringed"] == 0 and maus["ring"] and (maus["ring"]["style"] == "none" or maus["ring"]["width"] == "0px")
          and bool(taste) and taste["first"] and taste["ring"] and taste["ring"]["visible"] and taste["ring"]["style"] != "none" and taste["ring"]["width"] == "2px",
          json.dumps(out["m32"]))

    # M36: the error banner in at most 3 lines at 390, start stays usable.
    m36 = []
    for th in THEMES:
        page.set_viewport_size({"width": 390, "height": 900})
        theme(th)
        build("error")
        g = page.evaluate(M36_JS)
        shot(f"karte-error-karte-m36-390-{th}.png")
        m36.append({"theme": th, "m": g})
    out["m36"] = m36
    ok36 = lambda x: x["m"] and x["m"]["title"] and x["m"]["step"] and x["m"]["lines"] <= 3 and x["m"]["startDisabled"] is False and not x["m"]["small"] and x["m"]["pageOverflow"] <= 0
    check("M36 error banner: title and step in at most 3 lines at 390, start stays usable (light/dark)", all(ok36(x) for x in m36), json.dumps(m36))

    # M31: "+ N weitere" flush with the chips' left edge as a text button; the pill for what adds to the map.
    m31 = []
    for w in (390, 1280):
        page.set_viewport_size({"width": w + 16, "height": 900})
        theme("light")
        build("docked", panel=True)
        g = page.evaluate(M31_JS)
        shot(f"zweitaktionen-panel-all-{w}-light.png")
        m31.append({"w": w, "task": "all", **g})
    page.set_viewport_size({"width": 390, "height": 844})
    build("docked")
    page.evaluate("() => window.card().shadowRoot.querySelector('.task[data-task=zone]').click()")
    ruhe()
    zone = page.evaluate(M31_JS)
    shot("zweitaktionen-aufgabe-zone-390-light.png")
    out["m31"] = {"panel": m31, "zone": zone}
    ok31 = lambda x: x["moreLeft"] is not None and x["chipLeft"] is not None and abs(x["moreLeft"] - x["chipLeft"]) <= 1 and "text-action" in (x["moreClass"] or "")\
        and x["moreDecoration"] == "none" and x["moreColor"] == x["chipColor"] and not x["small"] and x["pageOverflow"] <= 0
    pill_ok = bool(zone["pills"]) and all(p["radius"] == "22px" and p["border"] != "0px" and p["h"] >= 44 and p["icon"] and p["text"] for p in zone["pills"])
    check("M31 second actions: '+ N weitere' a text button in text colour without underline, flush with the chips (<= 1 px, panel 390/1280); zone task with the pill "
          "(radius 22 px, border, symbol and words, 44 px)",
          all(ok31(x) for x in m31) and pill_ok, json.dumps(out["m31"])[:1500])

    # M33: dark theme without HA's darkMode flag -> dark room areas (<= 0.13), labels >= 4.5:1.
    m33 = []
    for w in (390, 1280):
        page.set_viewport_size({"width": w, "height": 844 if w < 450 else 800})
        theme("dark")
        build("docked")
        g = page.evaluate(M33_JS)
        shot(f"karte-dunkel-flaechen-{w}-dark.png")
        m33.append({"w": w, **g})
    out["m33"] = m33
    ok33 = lambda x: not x.get("error") and x["areas"] and max(a["lum"] for a in x["areas"]) <= 0.13 and x["labels"]\
        and all(lb["ratio"] is not None and lb["ratio"] >= 4.5 for lb in x["labels"])
    check("M33 dark room areas: dark theme without darkMode flag -> every room area <= 0.13 relative luminance, room labels >= 4.5:1 on their area (390/1280)",
          all(ok33(x) for x in m33), json.dumps(m33)[:1500])

    # M34: map, tool bar and save visible at 390x844 without scrolling.
    page.set_viewport_size({"width": 390, "height": 844})
    theme("light")
    build("editor")
    title = page.evaluate(edit_open, {"entry": "edit", "steps": []})
    ruhe()
    m34 = page.evaluate(M34_JS) or {"map": None, "tools": None, "save": None, "bar": None, "scrollTop": None, "H": 0, "small": []}
    shot("editor-modus-m34-390x844-light.png")
    page.evaluate(DIALOGE_ZU)
    m34["title"] = title
    out["m34"] = m34
    report["feinschliff"] = out
    seen = lambda b: b is not None and b["h"] > 0 and b["t"] >= -0.5 and b["b"] <= m34["H"] + 0.5
    check("M34 map editor: map, tool bar and save visible at 390x844 without scrolling (sheet not scrolled)",
          seen(m34["map"]) and seen(m34["tools"]) and seen(m34["save"]) and m34["scrollTop"] == 0 and m34["tools"]["t"] >= m34["map"]["b"] - 1,
          json.dumps(m34))
    calls = dienste_leeren(k)
    check("E7 cases: 0 service calls", not calls, json.dumps(calls))


# ── E9: M45, M46, M47 ──────────────────────────────────────────────────────
FORCED_JS = """() => { const d = window.dialog(), sr = d && d.shadowRoot; if (!sr) return null;
    const sel = sr.querySelector('[role=tab][aria-selected=true]'), other = sr.querySelector('[role=tab][aria-selected=false]'), a = sr.activeElement;
    const s = (n) => (n ? { bg: getComputedStyle(n).backgroundColor, color: getComputedStyle(n).color } : null);
    return { forced: matchMedia('(forced-colors: active)').matches, selected: s(sel), other: s(other),
             focus: a ? { tab: a.getAttribute('data-tab'), style: getComputedStyle(a).outlineStyle, width: getComputedStyle(a).outlineWidth, visible: a.matches(':focus-visible') } : null }; }"""
M46_JS = """() => { if (!window.dialog()) return null; const sr = window.dialog().shadowRoot;
    return { rows: Array.from(sr.querySelectorAll('[data-group]')).map((b) => { const st = b.querySelector('.group-status'), ch = b.querySelector('.group-chevron'), w = b.querySelector('.group-warn');
      return { group: b.getAttribute('data-group'), status: st ? st.textContent.trim() : '', chevron: !!ch && ch.getBoundingClientRect().width > 0,
               warn: w && w.getBoundingClientRect().width > 0 ? w.textContent : null }; }),
      overflowX: sr.querySelector('.sheet').scrollWidth - sr.querySelector('.sheet').clientWidth, small: window.smallTargets(sr) }; }"""
M47_JS = """() => { const c = window.card(), sr = c.shadowRoot, panel = sr.querySelector('.panel'), slot = sr.querySelector('.history-slot'), ctr = sr.querySelector('.controls');
    const vis = (n) => !!n && n.getBoundingClientRect().height > 0, top = ctr.getBoundingClientRect().top;
    const above = Array.from(panel.children).filter((n) => n !== ctr && vis(n) && n.getBoundingClientRect().bottom <= top + 1);
    const bottom = Math.max(panel.getBoundingClientRect().top, ...above.map((n) => n.getBoundingClientRect().bottom));
    const note = slot && slot.querySelector('.preview-note');
    return { width: c.getAttribute('data-width'), gap: Math.round(top - bottom), slot: vis(slot), runs: slot ? slot.querySelectorAll('.history-run').length : 0,
             empty: slot && slot.querySelector('.history-empty') ? slot.querySelector('.history-empty').textContent : null,
             error: note ? { kind: note.getAttribute('data-kind'), text: note.textContent } : null,
             small: window.smallTargets(sr), pageScroll: document.scrollingElement.scrollHeight - innerHeight }; }"""


def bereich_anzeige(k):
    """E9: M45 Forced Colors, M46 Einstellungsübersicht mit Kurzstatus, M47 Verlaufsvorschau im Desktop-Panel."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    out = {}
    # M45: forced colors: the selected tab in system colours, the keyboard focus with a 2 px ring.
    page.emulate_media(forced_colors="active")
    m45 = []
    try:
        for w, h in ((1280, 800), (390, 844)):
            for th in THEMES:
                page.set_viewport_size({"width": w, "height": h})
                theme(th)
                build("docked")
                shot(f"forced-colors-karte-{w}-{th}.png")
                page.evaluate(dock_open, [einstellungen])
                ruhe()
                page.evaluate("() => { const t = window.dialog() && window.dialog().shadowRoot.querySelector('[role=tab][aria-selected=true]'); if (t) t.focus(); }")
                page.keyboard.press("ArrowRight")
                ruhe()
                g = page.evaluate(FORCED_JS)
                shot(f"forced-colors-station-{w}x{h}-{th}.png")
                page.evaluate("() => { window.closeDialogs(); document.documentElement.style.overflow = ''; try { localStorage.clear(); } catch (e) {} }")
                m45.append({"w": w, "theme": th, "g": g})
    finally:
        page.emulate_media(forced_colors="none")
    out["m45"] = m45
    ok45 = lambda x: x["g"] and x["g"]["forced"] and x["g"]["selected"] and x["g"]["other"] and x["g"]["selected"]["bg"] != x["g"]["other"]["bg"]\
        and x["g"]["focus"] and x["g"]["focus"]["visible"] and x["g"]["focus"]["style"] != "none" and x["g"]["focus"]["width"] == "2px"
    check("M45 forced colors: the selected tab differs from the others in system colours, the keyboard focus has a 2 px ring (1280/390, light/dark)",
          all(ok45(x) for x in m45), json.dumps([x for x in m45 if not ok45(x)][:2]))

    # M46: overview with status, chevron and the wear point on Zubehör.
    page.set_viewport_size({"width": 360, "height": 640})
    theme("light")
    build("settings")
    page.evaluate(settings_open, [])
    ruhe()
    m46 = page.evaluate(M46_JS) or {"rows": [], "overflowX": 0, "small": []}
    shot("einstellungen-uebersicht-verschleiss-360x640-light.png")
    page.evaluate(DIALOGE_ZU)
    out["m46"] = m46
    warn = [r["group"] for r in m46["rows"] if r["warn"]]
    check("M46 settings overview: every group row with status and chevron, Zubehör (filter 21 %) with the wear point and its word (360x640 light)",
          bool(m46["rows"]) and all(r["status"] and r["chevron"] for r in m46["rows"]) and warn == ["consumables"] and m46["overflowX"] <= 1 and not m46["small"],
          json.dumps(m46)[:1500])

    # M47: history preview in the wide panel; at most 120 px empty space above the action bar; empty and error pictured.
    def fehler_sensor(st):
        st["sensor.robo_cleaning_history"]["state"] = "unavailable"
    varianten = (("", k.data["docked"]), ("-leer", k.data["history_empty"]), ("-fehler", daten_mit(k, "docked", fehler_sensor)))
    m47 = []
    for w, h in ((1280, 800), (1600, 900)):
        for th in THEMES:
            page.set_viewport_size({"width": w, "height": h})
            theme(th)
            for suffix, data in varianten:
                baue_daten(k, data, panel=True)
                g = page.evaluate(M47_JS)
                shot(f"panel-verlaufsvorschau{suffix}-{w}x{h}-{th}.png")
                m47.append({"variante": suffix.strip("-") or "laeufe", "w": w, "theme": th, **g})
    out["m47"] = m47
    report["anzeige"] = out
    main_ = [x for x in m47 if x["variante"] == "laeufe"]
    check("M47 panel history preview: wide panel shows the 3 newest runs, at most 120 px empty space above the action bar (1280x800, 1600x900, light/dark)",
          all(x["width"] == "wide" and x["slot"] and x["runs"] == 3 and x["gap"] <= 120 and not x["small"] for x in main_),
          json.dumps([{kk: x[kk] for kk in ("w", "theme", "width", "slot", "runs", "gap", "small")} for x in main_]))
    check("M47 panel history preview: empty sensor shows its text, unavailable sensor the error line (R12), no run rows",
          all(x["empty"] and x["runs"] == 0 for x in m47 if x["variante"] == "leer")
          and all(x["error"] and x["error"]["kind"] == "error" and x["runs"] == 0 for x in m47 if x["variante"] == "fehler"),
          json.dumps([{kk: x[kk] for kk in ("variante", "w", "theme", "empty", "error", "runs")} for x in m47 if x["variante"] != "laeufe"][:4]))


# ── M19 · Bildabrufe des ganzen Laufs ──────────────────────────────────────
M19_BILDABRUFE_VORHER = 795  # report.json of the run before M19 (masterplan M19)


def bereich_abrufe(k):
    """M19: camera_proxy-Bildabrufe des ganzen Laufs gegen 795 vorher (mindestens 80 % weniger); nur über alle Bereiche."""
    report, check = k.report, k.check
    bilder = [u for u in report["requests"] if "/api/camera_proxy/" in u]
    daten = [u for u in report["requests"] if "/api/camera_map_data_proxy/" in u]
    report["abrufe"] = {"bildabrufe": len(bilder), "datenabrufe": len(daten), "vorher": M19_BILDABRUFE_VORHER}
    name = "M19 picture fetches: camera_proxy requests of the whole run at least 80 % below the 795 before (<= 159)"
    if all(n in report["bereiche"] for n, _ in BEREICHE):
        check(name, len(bilder) <= M19_BILDABRUFE_VORHER * 0.2, json.dumps(report["abrufe"]))
    else:
        report["nichtGemessen"].append({"name": name, "grund": "--nur " + ",".join(report["bereiche"]), "detail": json.dumps(report["abrufe"])})

# ---------------------------------------------------------------------------
# Registry (M22): the areas in their run order. A new render case is a function
# bereich_<name>(k) above and one row here; --nur <name,...> runs only those (in
# this order). k carries the shared state, see main(); values one area needs from
# another belong in the shared constants above, not in the other area.
# ---------------------------------------------------------------------------
# ── M16 · Kontrast ─────────────────────────────────────────────────────────
KONTRAST_BREITEN = (320, 360, 390, 480, 800, 1024, 1280, 1600)
# M16: every visible text of the card (map area excluded, M33 measures it) against its composited
# background: 4.5:1, large text (>= 24 px, or >= 18.66 px bold) 3:1; exempt: disabled text and the filled
# primary button of the action bar (HA theme colour, decided 17.11.2026).
KONTRAST_JS = """() => {
    const rgba = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    const over = (f, b) => { const a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; };
    const lum = (c) => { const l = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
    const up = (n) => n.parentElement || (n.getRootNode() && n.getRootNode().host) || null;
    const back = (el) => { const layers = [];
        for (let n = el; n; n = up(n)) { const cs = getComputedStyle(n);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
            const c = rgba(cs.backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
        let b = rgba(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]; if (b[3] < 1) b = over(b, [255, 255, 255, 1]);
        for (let i = layers.length - 1; i >= 0; i--) b = over(layers[i], b);
        return b; };
    const out = [], skipped = [], exempt = [];
    const walk = (root) => { const all = root.querySelectorAll('*');
        for (let i = 0; i < all.length; i++) { const el = all[i]; if (el.shadowRoot) walk(el.shadowRoot);
            let own = ''; for (const t of el.childNodes) if (t.nodeType === 3) own += t.textContent; own = own.trim(); if (!own) continue;
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            if (r.width < 1 || r.height < 1 || cs.visibility !== 'visible' || Number(cs.opacity) === 0) continue;
            if (el.closest('.map-stage')) continue;
            if (el.closest('[disabled], [aria-disabled=true]') || el.matches(':disabled')) continue;
            // User decision 17.11.: the filled primary button keeps HA's theme colour (white on --primary-color, as HA's own buttons).
            if (el.closest('.controls .ctl[data-variant=primary]')) { exempt.push(own.slice(0, 30)); continue; }
            const b = back(el); if (!b) { skipped.push(own.slice(0, 30)); continue; }
            const f = over(rgba(cs.color) || [0, 0, 0, 1], b), L1 = lum(f), L2 = lum(b);
            const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), px = parseFloat(cs.fontSize), w = Number(cs.fontWeight) || 400;
            const need = px >= 24 || (px >= 18.66 && w >= 700) ? 3 : 4.5;
            if (ratio < need) out.push({ text: own.slice(0, 40), ratio: Math.round(ratio * 100) / 100, need, color: cs.color, px }); } };
    walk(window.card().shadowRoot);
    return { bad: out, skipped, exempt };
}"""


def bereich_kontrast(k):
    """M16: Kontrast aller Kartentexte (8 Breiten x hell/dunkel, ruhend und reinigend)."""
    page, report, check, theme, build, shot = k.page, k.report, k.check, k.theme, k.build, k.shot
    rows = []
    for width in KONTRAST_BREITEN:
        for th in THEMES:
            page.set_viewport_size({"width": width + 16, "height": 900})
            theme(th)
            for state in ("docked", "cleaning"):
                build(state)
                rows.append({"w": width, "theme": th, "state": state, **page.evaluate(KONTRAST_JS)})
            shot(f"kontrast-cleaning-{width}-{th}.png")
    report["kontrast"] = rows
    bad = [{"w": r["w"], "theme": r["theme"], "state": r["state"], "bad": r["bad"]} for r in rows if r["bad"]]
    check("M16 contrast: every visible card text outside the map >= 4.5:1 on its background (large text 3:1), disabled exempt, "
          "8 widths x light/dark, docked and cleaning (exempt: disabled, filled primary button in theme colour)", not bad, json.dumps(bad)[:1500])


# ── M10 · Etiketten und Marker ──────────────────────────────────────────────
# M10 step 6: client rectangles (getBoundingClientRect) of the visible room names and number rings
# and of the visible markers; bundled warnings (data-bundled) are hidden and do not count.
M10_LAGEN = ("robot", "charger", "router", "station_status", "predefined_points")
M10_WARNUNGEN = ("obstacles", "stains", "pets", "blocked_rooms")
M10_FINGER = 44  # MAP_PLACE.bundle of the card (2 x TAP.hitPx) in screen px at object_scale 1
M10_JS = """(a) => {
    const sr = window.card().shadowRoot, stage = sr.querySelector('.map-stage'), s = stage.getBoundingClientRect();
    const seen = (n) => { const r = n.getBoundingClientRect(); if (r.width < 0.5 || r.height < 0.5) return null;
        for (let e = n; e && e.nodeType === 1; e = e.parentNode) { if (e.hasAttribute('hidden')) return null;
            const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
            if (e === stage) break; }
        return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const all = (sel) => Array.from(sr.querySelectorAll(sel));
    const L = '.map-layers [data-layer=rooms] [data-symbol=label] ';
    const labels = [];
    for (const n of all(L + 'text[data-role=name]')) { const b = seen(n); if (b) labels.push({ what: 'name ' + n.textContent, b }); }
    for (const n of all(L + '.badge')) { const b = seen(n); if (b) labels.push({ what: 'ring ' + n.textContent, b }); }
    const sel = a.lagen.map((l) => '.map-layers [data-layer=' + l + '] [data-symbol]')
        .concat(a.warnungen.map((l) => '.map-layers [data-layer=' + l + '] [data-symbol]:not([data-bundled])')).join(', ');
    const markers = [];
    for (const n of all(sel)) { const b = seen(n); if (b) markers.push({ what: n.parentNode.getAttribute('data-layer') + ':' + n.getAttribute('data-object'), b,
        count: Number(n.getAttribute('data-count') || 0), warn: a.warnungen.includes(n.parentNode.getAttribute('data-layer')) }); }
    const cut = (x, y) => Math.min(x.r, y.r) - Math.max(x.l, y.l) > 0.01 && Math.min(x.b, y.b) - Math.max(x.t, y.t) > 0.01;
    const r1 = (v) => Math.round(v * 10) / 10, short = (b) => [r1(b.l), r1(b.t), r1(b.r), r1(b.b)];
    const hits = [];
    for (const x of labels) for (const m of markers) if (cut(x.b, m.b)) hits.push(x.what + ' / ' + m.what + ' ' + JSON.stringify([short(x.b), short(m.b)]));
    const out = labels.filter((x) => x.b.l < s.left - 0.5 || x.b.t < s.top - 0.5 || x.b.r > s.right + 0.5 || x.b.b > s.bottom + 0.5)
        .map((x) => x.what + ' ' + JSON.stringify(short(x.b)));
    // Stack = two equal warnings (layer and data-ignored) whose anchors lie closer than a finger (MAP_PLACE.bundle).
    const m = window.card()._map, anchors = {};
    for (const l of a.warnungen) for (const g of all('.map-layers [data-layer=' + l + '] [data-symbol]')) {
        const t = String(g.style.transform).match(/translate\(\s*(-?[\d.e+-]+)px,\s*(-?[\d.e+-]+)px\)/);
        if (t) (anchors[l + '|' + (g.getAttribute('data-ignored') || '')] = anchors[l + '|' + (g.getAttribute('data-ignored') || '')] || []).push(m.toScreen({ x: +t[1], y: +t[2] })); }
    let near = 0;
    for (const list of Object.values(anchors)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
        if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < a.finger) near++;
    const warn = markers.filter((x) => x.warn), crowd = [];
    for (let i = 0; i < warn.length; i++) for (let j = i + 1; j < warn.length; j++) if (cut(warn[i].b, warn[j].b)) crowd.push(warn[i].what + ' / ' + warn[j].what);
    const ring4 = all(L + '.badge').filter((n) => seen(n) && n.textContent.trim() === '4').length;
    return { labels: labels.length, markers: markers.length, hits, out, ring4,
             stacks: markers.filter((m) => m.warn && m.count >= 2).map((m) => m.what + ' x' + m.count),
             near, crowd, warns: warn.map((x) => ({ what: x.what, count: x.count, x: r1((x.b.l + x.b.r) / 2), y: r1((x.b.t + x.b.b) / 2) })),
             counted: all('[data-count]').length, robot: (markers.find((m) => m.what.startsWith('robot:')) || {}).b || null,
             stage: { l: s.left, t: s.top, r: s.right, b: s.bottom } };
}"""


def bereich_etiketten(k):
    """M10 Schritt 6: Rechteckmessung Etiketten gegen Marker in karte-cleaning-* und layout-*, dazu Rand und Zoom."""
    page, report, check, theme, build, ruhe, shot = k.page, k.report, k.check, k.theme, k.build, k.ruhe, k.shot
    arg = {"lagen": list(M10_LAGEN), "warnungen": list(M10_WARNUNGEN), "finger": M10_FINGER}
    rows = []
    # The states of karte-cleaning-<karte|panel>-<320|390|1280>-<theme> (viewport = card width, as bereich_karte) ...
    for panel in (False, True):
        for width in (320, 390, 1280):
            for th in THEMES:
                page.set_viewport_size({"width": width, "height": 900})
                theme(th)
                build("cleaning", panel=panel)
                rows.append({"fall": f"karte-cleaning-{'panel' if panel else 'karte'}-{width}-{th}", **page.evaluate(M10_JS, arg)})
    # ... and of layout-<karte|panel>-<all|room>-<width>-<theme> (card width = viewport - 16, as bereich_layout).
    for panel in (False, True):
        for width in LAYOUT_WIDTHS:
            for th in THEMES:
                page.set_viewport_size({"width": width + 16, "height": 900})
                theme(th)
                build("docked", panel=panel)
                for task in ("all", "room"):
                    if task == "room":
                        page.evaluate(room_pick)
                        ruhe()
                    rows.append({"fall": f"layout-{'panel' if panel else 'karte'}-{task}-{width}-{th}", **page.evaluate(M10_JS, arg)})
    report["etiketten"] = rows
    n = len(rows)
    check(f"M10 label and marker rectangles: no room name or number ring rectangle intersects a marker rectangle "
          f"(karte-cleaning-* and layout-*, {n} cases, visible elements, bundled warnings excluded)",
          n == 60 and all(r["labels"] and r["markers"] and not r["hits"] for r in rows),
          json.dumps([{"fall": r["fall"], "labels": r["labels"], "markers": r["markers"], "hits": r["hits"][:3]}
                      for r in rows if r["hits"] or not r["labels"] or not r["markers"]][:6])[:1500])
    check(f"M10 labels inside the map: every visible room name and number ring lies in .map-stage ({n} cases)",
          all(not r["out"] for r in rows), json.dumps([{"fall": r["fall"], "out": r["out"][:3]} for r in rows if r["out"]][:6])[:1500])
    # Stack where equal warnings lie within a finger; on wide cards the three lie further apart and show singly.
    stapel = lambda r: len(r["stacks"]) == 1 if r["near"] else (not r["stacks"] and not r["counted"] and not r["crowd"])
    gestapelt = sum(1 for r in rows if r["near"])
    check(f"M10 warning stack: where equal warnings lie within {M10_FINGER} px, exactly one visible warning mark with data-count >= 2 "
          f"({gestapelt} of {n} cases); further apart every warning shows singly, no data-count, no two warning marks intersecting",
          gestapelt > 0 and all(stapel(r) for r in rows),
          json.dumps([{"fall": r["fall"], "near": r["near"], "stacks": r["stacks"], "crowd": r["crowd"]} for r in rows if not stapel(r)][:6]))
    check(f"M10 number 4 visible: the number ring 4 is drawn and visible ({n} cases)",
          all(r["ring4"] == 1 for r in rows), json.dumps([{"fall": r["fall"], "ring4": r["ring4"]} for r in rows if r["ring4"] != 1][:6]))

    # karte-m10-rand: a room and the robot on the map's top edge (anchor 2 px below the stage top).
    page.set_viewport_size({"width": 390, "height": 900})
    theme("light")
    build("docked")
    top = page.evaluate("""() => { const m = window.card()._map, s = m.stage.getBoundingClientRect();
        const at = (f) => m.toRobot(m.fromScreen({ x: s.left + s.width * f, y: s.top + 2 }));
        return { room: at(0.35), robot: at(0.7) }; }""")

    def an_den_rand(states):
        for cam_id in ("camera.robo_map", "camera.robo_map_1"):
            if cam_id in states:
                a = states[cam_id]["attributes"]
                a["rooms"]["1"].update({"x": round(top["room"]["x"]), "y": round(top["room"]["y"])})
                a["vacuum_position"] = {"x": round(top["robot"]["x"]), "y": round(top["robot"]["y"]), "a": 0}
    baue_daten(k, daten_mit(k, "docked", an_den_rand))
    rand = page.evaluate(M10_JS, arg)
    shot("karte-m10-rand-390-light.png")
    report["etikettenRand"] = dict(rand, oben=top)
    rb, st = rand["robot"], rand["stage"]
    check("M10 map edge: a room and the robot at the top edge keep name, ring and robot rectangle in .map-stage, nothing intersects (karte-m10-rand, 390 light)",
          rand["labels"] and not rand["out"] and not rand["hits"] and rb is not None
          and rb["t"] >= st["t"] - 0.5 and rb["l"] >= st["l"] - 0.5 and rb["r"] <= st["r"] + 0.5 and rb["b"] <= st["b"] + 0.5,
          json.dumps({kk: rand[kk] for kk in ("labels", "out", "hits", "robot", "stage")})[:1500])

    # karte-m10-zoom: zoom 4 on the warning stack; apart, the warnings show singly (no data-count left).
    build("docked")
    vorher = page.evaluate(M10_JS, arg)
    page.evaluate("""() => { const c = window.card(), m = c._map, sr = c.shadowRoot;
        const head = sr.querySelector('.map-layers [data-count]'), r = head.getBoundingClientRect();
        m._zoomAt(4, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, false); }""")
    ruhe()
    zoom = page.evaluate(M10_JS, arg)
    zoom["zoom"] = page.evaluate("() => window.card()._map._zoom")
    shot("karte-m10-zoom-390-light.png")
    report["etikettenZoom"] = {"vorher": vorher["stacks"], **zoom}
    check("M10 zoom: zoom 4 on the warning stack leaves 0 elements with data-count (karte-m10-zoom, 390 light)",
          len(vorher["stacks"]) == 1 and zoom["zoom"] == 4 and zoom["counted"] == 0,
          json.dumps({"vorher": vorher["stacks"], "zoom": zoom["zoom"], "counted": zoom["counted"], "stacks": zoom["stacks"]}))


BEREICHE = [
    ("karte", bereich_karte),
    ("layout", bereich_layout),
    ("dialog", bereich_dialog),
    ("bewegung", bereich_bewegung),
    ("kartenansicht", bereich_kartenansicht),
    ("einstellungen", bereich_einstellungen),
    ("station", bereich_station),
    ("shortcuts", bereich_shortcuts),
    ("aufgaben", bereich_aufgaben),
    ("verlauf", bereich_verlauf),
    ("fernsteuerung", bereich_fernsteuerung),
    ("reinigung", bereich_reinigung),
    ("editor", bereich_editor),
    ("sicherung", bereich_sicherung),
    # E2 (M21, M15): set their own size and theme; "regeln" sets its state again at its start.
    ("uebersetzung", bereich_uebersetzung),
    ("zustaende", bereich_zustaende),
    ("regeln", bereich_regeln),
    # Buschcheck Welle 1 und 2 (#1163): appended, so every earlier picture and check stays as it was.
    ("rechte", bereich_rechte),
    ("adressen", bereich_adressen),
    ("feindlich", bereich_feindlich),
    ("netz", bereich_netz),
    ("teilfehler", bereich_teilfehler),
    ("befehle", bereich_befehle),
    ("leiste", bereich_leiste),
    ("oberflaeche", bereich_oberflaeche),
    ("feinschliff", bereich_feinschliff),
    ("anzeige", bereich_anzeige),
    ("kontrast", bereich_kontrast),
    ("etiketten", bereich_etiketten),
    # M19 counts the picture fetches of everything before it: keep it last.
    ("abrufe", bereich_abrufe),
]

# Checks that only mean something over ALL areas: under --nur they are listed as not measured, never as passed.
NUR_GESAMT = ("views: every dialog view of the card (VIEW_IDS) opened and pictured, no view without id",)


def argumente(argv):
    """(card file, output dir, chosen areas or None) or an exit code."""
    rest, nur, i = [], None, 0
    while i < len(argv):
        a = argv[i]
        if a == "--nur" or a.startswith("--nur="):
            if a == "--nur":
                if i + 1 >= len(argv):
                    print("render.py: --nur braucht Bereiche, bekannt: " + ", ".join(n for n, _ in BEREICHE), file=sys.stderr)
                    return 2
                wert, i = argv[i + 1], i + 2
            else:
                wert, i = a[len("--nur="):], i + 1
            nur = (nur or []) + [n.strip() for n in wert.split(",") if n.strip()]
            continue
        rest.append(a)
        i += 1
    if len(rest) < 2:
        print(__doc__)
        return 2
    if nur is not None:
        namen = [n for n, _ in BEREICHE]
        unbekannt = [n for n in nur if n not in namen]
        if unbekannt or not nur:
            print("render.py: unbekannter Bereich %s; bekannt: %s" % (", ".join(unbekannt) or "(keiner angegeben)", ", ".join(namen)),
                  file=sys.stderr)
            return 2
    return rest[0], rest[1], nur


def main():
    args = argumente(sys.argv[1:])
    if isinstance(args, int):
        return args
    card_arg, out_arg, nur = args
    laufen = [(n, f) for n, f in BEREICHE if nur is None or n in nur]
    alle = len(laufen) == len(BEREICHE)
    card_file = Path(card_arg).resolve()
    out_dir = Path(out_arg).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    repo_root = card_file.parent.parent
    fixture = json.loads((repo_root / "tests" / "fixtures" / "voll.json").read_text(encoding="utf-8"))
    data = {name: scenario(fixture, name) for name in STATES + ("floors", "settings", "shortcuts", "cleangenius", "customized", "nonstrict", "history_empty", "editor", "backup", "backup_running", "temporary", "station_low") + ZUSTAND_SZENARIEN}
    cam = fixture["states"]["camera.robo_map"]["attributes"]
    grid = synthetic_map_data(cam["rooms"], frame_id=cam["frame_id"])
    svg, svg_size = synthetic_map_svg(cam, grid)
    edit_data = synthetic_edit_data(grid, cam)
    # The WiFi camera's own picture, drawn through ITS calibration (other scale than the map), so the
    # overlay check below proves the card places it by that calibration.
    wifi_cam = fixture["states"]["camera.robo_wifi_map_1"]["attributes"]
    wifi_svg, _ = synthetic_map_svg(wifi_cam, edit_data["wifi_map_data"])
    routing = {"data": True}
    # history: SYNTHETIC run data in the form of map.py get_data for a history map (fields checked
    # read-only on the device 10.11.2026), built from the same anonymised rooms -- never a real run.
    rs = sorted((r for r in cam["rooms"].values() if r.get("x0") is not None), key=lambda r: r["room_id"])
    history_data = dict(grid, history_map=True, map_id=cam["map_id"], completed=True, startup_method=1, cleanup_method=0,
                        mop_wash_count=3, dust_collection_count=1, task_interrupt_reason=None,
                        blocked_segments={"4": [3, 0, 0], "5": [4, 0, 0], "9": [3, 0, 0]},
                        obstacles=[["1", rs[2]["x"], rs[2]["y"], 200, None, 0, 0, "0", None, None, None, None, "Bibliothek", 1, 5, "Blocked by threshold"],
                                   ["2", rs[1]["x"] + 200, rs[1]["y"] + 200, 133, 80, 0, 2, "ab12", None, None, 40, 40, "Salon", 2, None, None]],
                        cleaning_map_data=None, wifi_map_data=dict(grid, wifi_map=True, path=[]))

    ports = []
    httpd = serve(repo_root, ports)
    port = ports[0]
    report = {"cardFile": str(card_file), "bereiche": [n for n, _ in laufen], "nur": [n for n, _ in laufen] if nur is not None else None,
              "requests": [], "badResponses": [], "requestFailures": [],
              "consoleErrors": [], "pageErrors": [], "checks": [], "screenshots": [], "nichtGemessen": [],
              "ruheUeberschritten": [], "bereichSekunden": {}}

    def check(name, passed, detail="", ids=None):
        found = ids if ids is not None else next((v for k, v in RENDER_IDS if name.startswith(k)), [])
        report["checks"].append({"name": name, "pass": bool(passed), "detail": detail, "ids": list(found)})

    # Requests still in flight per page (Playwright sees every one, also SVG <image> and lazy pictures).
    inflight = {}

    def beobachte(pg):
        offen = inflight.setdefault(pg, set())
        pg.on("request", lambda r: offen.add(r))
        pg.on("requestfinished", lambda r: offen.discard(r))
        pg.on("requestfailed", lambda r: offen.discard(r))
        pg.add_init_script(RUHE_INIT)

    token = [0]

    def frames(n=2, pg=None):
        """n animation frames (no fixed time): lets input, events and paint through."""
        (pg or page).evaluate(FRAMES_JS, n)

    def ruhe(wann=None, pg=None, fertig=True, ms=8000):
        """Waits for rest (RUHE_JS) and no request in flight; `wann` is a JS expression that must hold as well
        (in scope: c card, d dialog, sr its shadow root, m the card's MapView). fertig=True jumps running finite
        animations/transitions to their end (final frame as after waiting them out), fertig=False waits them out.
        On timeout the wait is noted in report["ruheUeberschritten"] and the run goes on (the checks decide)."""
        pg = pg or page
        js = RUHE_JS.replace("__WANN__", wann or "true")
        frist = time.monotonic() + ms / 1000
        while True:
            token[0] += 1
            rest = int((frist - time.monotonic()) * 1000)
            try:
                if rest <= 0:
                    raise PlaywrightTimeout("ruhe: frist")
                pg.wait_for_function(js, arg={"token": token[0], "fertig": fertig}, polling="raf", timeout=rest)
            except PlaywrightTimeout:
                report["ruheUeberschritten"].append({"wann": wann, "ms": ms, "offen": sorted(r.url for r in inflight.get(pg, ()))[:5]})
                return False
            if not inflight.get(pg):
                return True
            frames(1, pg)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="de-DE")
        beobachte(page)
        page.on("request", lambda r: report["requests"].append(r.url))
        page.on("response", lambda r: report["badResponses"].append({"url": r.url, "status": r.status})
                if r.status >= 400 else None)
        page.on("requestfailed", lambda r: report["requestFailures"].append({"url": r.url, "error": r.failure}))
        page.on("console", lambda m: report["consoleErrors"].append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["pageErrors"].append(str(e)))

        def camera_route(route):
            url = route.request.url
            if "/api/camera_history_map_proxy/" in url:
                if "data=1" in url:
                    # The integration sends gzip with Content-Encoding (camera.py#L271) and the browser unpacks it;
                    # route.fulfill hands the bytes over undecoded, so the harness sends the JSON plain (tests/attrappe.js
                    # covers the gzip path).
                    return route.fulfill(status=200, content_type="application/json", body=json.dumps(history_data))
                return route.fulfill(status=200, content_type="image/svg+xml", body=svg)
            if "/api/camera_map_obstacle_history_proxy/" in url:
                return route.fulfill(status=200, content_type="image/svg+xml", body=OBSTACLE_PHOTO)
            if "/api/camera_map_data_proxy/" in url and "saved=1" in url:
                # map-editor: the stored map's edit data (walls only come with it, map.py#L8629).
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(edit_data))
            if "/api/camera_map_data_proxy/" in url:
                body = grid if routing["data"] else {"empty_map": True, "size": [0, 0, 0, 0, 1, 1, 0, 0, [0, 0, 0, 0]]}
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
            if "/api/camera_map_obstacle_proxy/" in url:
                return route.fulfill(status=200, content_type="image/svg+xml", body=OBSTACLE_PHOTO)
            if "camera.robo_wifi_map" in url:
                return route.fulfill(status=200, content_type="image/svg+xml", body=wifi_svg)
            return route.fulfill(status=200, content_type="image/svg+xml", body=svg)
        page.route("**/api/camera_*proxy/**", camera_route)
        held = []  # M15: requests of the "laedt" state, answered by zustand_freigeben
        page.route("**/api/camera_*proxy/**", zustand_route_fuer(held))

        mdi = json.loads((HERE / "mdi-pfade.json").read_text(encoding="utf-8"))["pfade"]
        html = PAGE.replace("__SRC__", f"/dist/{card_file.name}").replace("__THEMA__", THEMA_CSS).replace("__MDI__", json.dumps(mdi))
        harness = out_dir / "harness.html"
        harness.write_text(html, encoding="utf-8")
        page.goto(f"http://127.0.0.1:{port}/{harness.relative_to(repo_root).as_posix()}")
        page.wait_for_function("() => !!customElements.get('busch-vacuum-card')", timeout=15000)

        def theme(name):
            page.evaluate("(t) => { document.documentElement.dataset.theme = t; document.documentElement.style.colorScheme = t; }", name)

        def build(state="docked", lang="de", config=None, panel=False, texte=None, warten=True):
            page.evaluate("(a) => window.buildCard(a)",
                          {"data": data[state], "lang": lang, "config": config or {}, "panel": panel, "texte": texte})
            if warten:
                ruhe()

        def open_menu():
            page.evaluate("() => { window.closeDialogs(); window.card().shadowRoot.querySelector('.menu-button').click(); }")

        def open_placeholder():
            # The release has no placeholder view any more: the settings view (kind editor) takes its place here.
            page.evaluate("""() => { window.closeDialogs(); const c = window.card();
                c._openDialog(customElements.get('busch-vacuum-card').__internals.MODULE_VIEWS.settings(c)); }""")

        def open_confirm():
            page.evaluate("() => { window.closeDialogs(); window.card()._confirmMapChange('Obergeschoss mit sehr langem Namen', () => {}); }")

        def shot(name):
            page.screenshot(path=str(out_dir / name))
            report["screenshots"].append(name)

        def map_eval(js):
            return page.evaluate("() => { const c = window.card(), m = c._map, sr = c.shadowRoot; " + js + " }")

        def open_obstacle():
            page.evaluate("""() => { window.closeDialogs(); const m = window.card()._map;
                const o = window.card().hass.states['camera.robo_map'].attributes.obstacles['2'];
                const s = m.toScreen(m.toImage(o)); m._emitTap(s);
                window.card().shadowRoot.querySelector('[data-action=obstacle-details]').click(); }""")

        def open_info():
            page.evaluate("() => { window.closeDialogs(); window.card().shadowRoot.querySelector('[data-action=map-info]').click(); }")

        def open_floors():
            page.evaluate("() => { window.closeDialogs(); window.card().shadowRoot.querySelector('[data-action=map-floors]').click(); }")

        k = SimpleNamespace(page=page, browser=browser, data=data, report=report, check=check, out_dir=out_dir, theme=theme,
                            build=build, ruhe=ruhe, frames=frames, beobachte=beobachte, open_menu=open_menu,
                            open_placeholder=open_placeholder, open_confirm=open_confirm, shot=shot, map_eval=map_eval,
                            open_obstacle=open_obstacle, open_info=open_info, open_floors=open_floors, cam=cam, grid=grid,
                            svg_size=svg_size, routing=routing, camera_route=camera_route, port=port, harness=harness,
                            repo_root=repo_root, held=held,
                            texte_de=json.loads((repo_root / "tests" / "fixtures" / "uebersetzung-de.json").read_text(encoding="utf-8"))["texte"])
        for name, bereich in laufen:
            t0 = time.monotonic()
            bereich(k)
            report["bereichSekunden"][name] = round(time.monotonic() - t0, 1)
        zustand_freigeben(k)

        report["serviceCalls"] = page.evaluate("() => window.__serviceCalls")
        build("docked")
        report["viewIds"] = page.evaluate("() => customElements.get('busch-vacuum-card').__internals.VIEW_IDS")
        report["views"] = {k: v for k, v in sorted(VIEWS_SEEN.items())}
        # M14: real glyphs and named icon-only buttons over every picture of this run.
        missing = page.evaluate("() => Array.from(window.__iconsMissing || []).sort()")
        report["symbole"] = {"fehlend": missing, "bilder": ICON_BUTTONS["pictures"], "symbolknoepfe": ICON_BUTTONS["checked"],
                             "ohneNamen": {b: v[:5] for b, v in sorted(ICON_BUTTONS["unnamed"].items())}}
        check("symbols: every ha-icon name has a glyph (docs/render/mdi-pfade.json)", not missing, json.dumps(missing))
        check("symbols: icon-only button without name: 0 (every picture)", ICON_BUTTONS["pictures"] > 0 and not ICON_BUTTONS["unnamed"],
              "%d icon-only buttons in %d pictures; %s" % (ICON_BUTTONS["checked"], ICON_BUTTONS["pictures"], json.dumps(report["symbole"]["ohneNamen"])[:1400]))
        unseen = [v for v in report["viewIds"] if not VIEWS_SEEN.get(v)]
        unknown = [v for v in VIEWS_SEEN if v not in report["viewIds"]]
        if alle:
            check(NUR_GESAMT[0], report["viewIds"] and not unseen and not unknown, json.dumps({"unseen": unseen, "unknown": unknown}))
        else:
            # --nur: only some areas ran, so "every view" cannot be judged; listed as not measured, not as passed.
            report["nichtGemessen"].append({"name": NUR_GESAMT[0], "grund": "--nur " + ",".join(report["bereiche"]),
                                            "detail": json.dumps({"unseen": unseen, "unknown": unknown})})
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
                       and report.get("uiRegelnVerstoesse", 0) == 0 and (REGELN_DA or "regeln" not in report["bereiche"]))
    (out_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    for entry in report["checks"]:
        print(("  ok   " if entry["pass"] else "  FAIL ") + entry["name"])
        if not entry["pass"]:
            print("         " + entry["detail"][:1500])
    for entry in report["nichtGemessen"]:
        print("  --   " + entry["name"] + " (nicht gemessen: " + entry["grund"] + ")")
    print(f"\n{report['passed']} passed, {report['failed']} failed")
    if report["nichtGemessen"]:
        print(f"{len(report['nichtGemessen'])} nicht gemessen (--nur {','.join(report['bereiche'])})")
    print("Bereiche: " + ", ".join("%s %.1f s" % (n, s) for n, s in report["bereichSekunden"].items()))
    if report["ruheUeberschritten"]:
        print("Ruhe nicht erreicht (Frist): %d mal, zuerst %s" % (len(report["ruheUeberschritten"]), json.dumps(report["ruheUeberschritten"][:3])))
    if "regeln" not in report["bereiche"]:
        print("UI-Regeln: nicht gewählt (--nur)")
    elif REGELN_DA:
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
