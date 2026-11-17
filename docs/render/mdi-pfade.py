#!/usr/bin/env python3
"""M14: erzeugt docs/render/mdi-pfade.json (MDI-Pfade nur der benutzten Symbole) für den ha-icon-Stub
im Renderharness, ohne Netz zur Laufzeit. Quelle: mdi.js aus dem Paket @mdi/js (Pictogrammers Free
License, Symbole Apache 2.0), einmal als Daten geladen und nur per Regex gelesen, nie ausgeführt.

    python3 -I docs/render/mdi-pfade.py <package/mdi.js> <repo> <repo>/docs/render/mdi-pfade.json

Namen: alle mdi:-Namen in dist/busch-vacuum-card.js und tests/fixtures/*.json, dazu die
zusammengesetzten Akkusymbole. tests/symbole.test.js meldet fehlende Namen.
"""
import json, re, sys
from pathlib import Path
mdi_js, repo, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
src = mdi_js.read_text(encoding="utf-8")
version = re.search(r"Material Design Icons v([\d.]+)", src).group(1)
paths = dict(re.findall(r'export var (mdi\w+) = "([^"]+)";', src))
def camel(name):  # mdi:battery-charging-50 -> mdiBatteryCharging50
    return "mdi" + "".join(p[:1].upper() + p[1:] for p in name.split(":", 1)[1].split("-"))
names = set()
for f in [repo / "dist" / "busch-vacuum-card.js", *sorted((repo / "tests" / "fixtures").glob("*.json"))]:
    names |= {n for n in re.findall(r"mdi:[a-z0-9-]+", f.read_text(encoding="utf-8")) if not n.endswith("-")}
names |= {f"mdi:battery-{t}" for t in range(10, 100, 10)} | {f"mdi:battery-charging-{t}" for t in range(10, 101, 10)}
table, missing = {}, []
for n in sorted(names):
    p = paths.get(camel(n))
    if p: table[n] = p
    else: missing.append(n)
out.write_text(json.dumps({"quelle": f"@mdi/js {version} (Pictogrammers Free License, Symbole Apache 2.0)",
                           "erzeugt": "aus den mdi:-Namen in dist/busch-vacuum-card.js und tests/fixtures/*.json",
                           "pfade": table}, indent=0, ensure_ascii=False, sort_keys=False) + "\n", encoding="utf-8")
print(len(table), "Symbole; fehlend:", missing)
