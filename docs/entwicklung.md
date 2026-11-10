# Entwicklung und Prüfung

## Aufbau

- `dist/busch-vacuum-card.js` ist Quelltext und Auslieferung in einem: reine
  Custom Elements, kein Lit, kein Bundler, kein npm, keine Unterressourcen
  (HACS liefert für Dashboard-Karten genau eine Datei aus).
- Am Anfang steht der gemeinsame Busch-UI-Block (`BEGIN/END BUSCH SHARED UI`),
  wörtlich gleich gehalten über `hacs/scripts/sync-shared-ui.py`; nie von Hand
  ändern.
- Danach in dieser Reihenfolge: Wörterbuch `TEXTE_BUSCH_VACUUM_CARD` (alle
  sichtbaren Texte DE/EN, Labels/Helfer des Editors), Konfiguration
  (`normalizeConfig`, `SCHEMA_BUSCH_VACUUM_CARD`, `EDITOR_DEFAULTS`,
  `HIDDEN_OBJECTS`), Sprache/Uhrzeit (`clockText`, `firstWeekday` nach
  `hass.locale`), Gerätemodell (`findRelated`, `VacuumModel.can()` — die
  einzige Stelle, die Fähigkeiten abfragt), Status/Steuerung, Aufgabenwahl,
  Meldungen, Menü, Stile, Dialog `busch-vacuum-dialog`, Karte, Editor.
- Erkennung: über `hass.entities` (Register im Frontend) alle Entitäten mit
  der `device_id` des Saugers, abgelegt nach `<domain>.<translation_key>`,
  je Raum und je Kartenkamera. Ohne Register Rückfall über das Präfix der
  Entitäts-ID. Deaktivierte Entitäten fehlen dort; ihre Werte kommen aus den
  Attributen des Saugers.
- Neubau nur, wenn sich eine beobachtete Entität, die Sprache oder das
  Register ändert (`watchSnapshot`); fremde Updates zeichnen nichts neu.
- Dialog nach Lightcards 0.11.0: unter 450 × 500 px Vollbild, sonst zentriert
  (höchstens 560 px, Bestätigung 320 px); Kopf sticky; Seite gesperrt;
  Escape/Zurück über eigene Verlaufseinträge; Fokusfalle. Außenklick schließt
  nur das flüchtige Menü (R04).
- Theme-Haken `--bvc-accent-color`, `--bvc-warning-color`, `--bvc-error-color`,
  `--bvc-success-color`, `--bvc-info-color`: nur gelesen, nie auf `:host`
  gesetzt (sonst würde ein Theme sie nicht erreichen); im HACS-Prüfer als
  `THEME_HAKEN` eingetragen.
- Für Tests exportiert `BuschVacuumCard.__internals` Wörterbuch, Schema,
  `normalizeConfig`, `findRelated`, `VacuumModel`, Stile, `clockText`,
  `firstWeekday`.
- Fixtures `tests/fixtures/*.json` sind aus dem echten Gerät abgeleitet und
  anonymisiert (Namen, Seriennummer, Netzwerk, Grundriss ersetzt);
  `tests/datenschutz.test.js` prüft das bei jedem Lauf.

## Karte (Modul map-view)

- **Datenmodus ist Standard** (Spike 10.11.2026, Spec map-view „Entscheidung
  Spike“): `/api/camera_map_data_proxy/<camera.*_map>?token=…&v=<frame_id>`,
  nur bei neuem `frame_id`; exakter Raum-Treffertest über das Gitter
  (`decodeMapData`, `roomAtGrid`, `passableGrid`). Rückfall Bildmodus
  (`entity_picture`, `roomAtRects`: Rechteck + nächster Mittelpunkt).
  Raum-Chips sind in beiden Modi die Grundlösung.
- Testdaten nur synthetisch (`tests/kartendaten.js` aus den verfremdeten
  Raumrechtecken); echte Kartendaten schließt `tests/datenschutz.test.js` aus.

- Darstellung (MAP-05/09): Datenmodus malt die Karte selbst in ein Canvas
  (`paintMapPixels`, ein Pixel je Gitterzelle, `image-rendering: pixelated`),
  nur bei neuem Frame, anderem Farbschema oder `map_display`;
  `map_display: floor_plan` = alle Räume ein Ton mit Konturen.
  `color_scheme` `auto` (folgt `hass.themes.darkMode`), `light`, `dark`,
  `grey`; `override_colors` (auch `dark: {…}`) setzt `--bvc-map-*` inline an
  `.map-view`. `icon_set` `busch` (eigene SVG-Formen) oder `material` (`mdi:`).
- **R24-Ausnahme Bildmodus** (nur Rückfall, wenn die Kartendaten fehlen):
  Grund: das Bild rendert die Integration; Räume, Wände und eingebrannte
  Objekte (Pfad, Hindernisse, Teppiche des Bilds) lassen sich darin weder
  umfärben noch einzeln ausblenden, `floor_plan` geht nicht, `passable` ist
  `null`, der Raum-Treffertest nimmt Rechteck + nächsten Mittelpunkt.
  `color_scheme` wirkt nur als `grey` (CSS-Filter). Risiko: an Raumgrenzen
  kann ein Tipp den Nachbarraum treffen, ausgeblendete Objekte bleiben im
  Bild sichtbar. Ersatz: Raum-Chips sind in jedem Modus der exakte Weg
  (R15/R22); die eigenen Ebenen bleiben ausblendbar; Tests
  „Datenmodus nicht verfügbar → Bildmodus“ und „color_scheme …“ in
  `tests/karte.test.js`.

### Kartenvertrag (für alle späteren Module)

`this._map` der Karte ist eine `MapView` (eine je Karte, nie bei fremden
Updates neu gebaut). Koordinaten in Modulen immer in **Roboter-mm**;
umgerechnet wird nur hier.

| Aufruf | Ergebnis |
| --- | --- |
| `current()` | `{ camera, mapId, index, name, calibration, rooms, objects, frameId, updatedAt, mode }`; `calibration` ist die affine Matrix Roboter-mm → Bild-px (`{a,b,c,d,e,f}` wie CSS `matrix()`) oder `null`; `objects` = Attribute der Kartenkamera; `mode` `'data'` mit Kartendaten, sonst `'image'` |
| `toImage(p)` / `toRobot(p)` | Roboter-mm ↔ Bild-px, `null` ohne Kalibrierung |
| `toScreen(p)` / `fromScreen(p)` | Bild-px ↔ Client-px inkl. Zoom, Verschieben, `map_config` rotation/scale/crop |
| `addLayer(id, { z, render(group, ctx), hit(point, ctx) })` | SVG-Gruppe in Bild-px; `render` beim Anlegen, bei neuer Kalibrierung/neuem Frame und bei `refresh(id)`; `hit` bekommt Roboter-mm und liefert `{ id, object }` oder nichts. `ctx` = `current()` plus `toImage`, `svgNode`, `data`, `model` |
| `removeLayer(id)`, `refresh(id?)` | Ebene entfernen; neu zeichnen (ohne id: alle) |
| `hitTest(clientPoint)` | `{ kind: 'room'\|'object'\|'floor'\|'outside', id, layer, object, robot, image }`; Ebenen mit `hit` von oben nach unten zuerst |
| `roomAt(p)` / `passable(p)` | Raum-ID oder `null` (Datenmodus exakt, Bildmodus Rechteck + nächster Mittelpunkt); begehbar `true/false` nur im Datenmodus, sonst `null` (`clean-tasks` sperrt nur bei `false`) |
| `setMode(mode, options)` | `view`, `pick-room`, `pick-point`, `draw-rect`, `drag`; unbekannt → Ausnahme |
| `showLoupe(clientPoint)` / `hideLoupe()` | Lupe (in `draw-rect`/`drag` beim Ziehen automatisch) |
| `selectMap(mapId)` | über core `_confirmMapChange` → `dreame_vacuum.vacuum_select_map`; `false`, wenn gesperrt (Aufgabe läuft), unbekannt oder schon aktiv |
| `config(index)` | Kartenoptionen gemischt mit `map_config.map_<index>`; `hidden_objects` addieren sich |
| `visible(name)` | `hidden_objects` (Karte + je Karte) |
| `roomChips({ rooms, selected, order, onToggle })` | die eine Raum-Chip-Liste (Element); Pfeile/Home/End, `aria-pressed`, Reihenfolge-Badge; ein Chip-Tipp löst dasselbe `map-room-tap` aus wie die Fläche (`source: 'chip'`) |

Ereignisse (`CustomEvent` auf `this._map.el`, `bubbles`): `map-tap`
(`{ client, robot, hit, passable, mode }`), `map-room-tap` (`{ room, source,
mode }`, in `view` und `pick-room`), `map-object-tap` (`{ id, layer, object,
robot }`, in `view`), `map-long-press`, `map-drag` (`{ phase: start|move|end|cancel,
mode, start, robot }`, in `draw-rect`/`drag`), `map-changed` (`{ index,
mapId }`), `map-frame` (`{ frameId, mode }`). Gesperrt (`data-locked="true"`)
löst die Karte keine Ereignisse aus und bewegt sich nicht; Raum-Chips bleiben
bedienbar. Ein Modul entfernt seine Ebene und setzt `view` zurück, wenn es
seinen Modus verlässt.

## Prüfung

Syntax und Node-Tests (im Container, die Share ist FUSE):

```bash
REPO=/pfad/zu/ha-busch-vacuum-card
docker run --rm --name test-hacs-t882-node -v "$REPO:/vac:ro" -w /vac node:22-alpine \
  sh -c 'node --check dist/busch-vacuum-card.js && node --test tests/*.test.js'
```

UI-Regeln (HACS-Ebene):

```bash
cd /pfad/zu/hacs
python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card
```

Browser: `docs/render/render.py` lädt die Datei über HTTP in Chromium, mit
der Fixture `voll` (Zustände docked, cleaning, error daraus abgeleitet).
Die Prüfseite wird ins Ausgabeverzeichnis geschrieben und muss im
ausgelieferten Repo liegen; deshalb läuft der Renderer gegen eine Kopie
außerhalb der Share:

```bash
REPO=/pfad/zu/ha-busch-vacuum-card
HACS=/pfad/zu/hacs
W=/pfad/zu/arbeitskopie   # nicht auf der FUSE-Share
rm -rf "$W/repo" && mkdir -p "$W/repo" && cp -r "$REPO/dist" "$REPO/tests" "$REPO/docs" "$W/repo/"
docker run --rm --name test-hacs-t882-render -v "$REPO:/cards:ro" \
  -v "$HACS/docs/render:/work:ro" -v "$W/repo:/out" --entrypoint bash \
  mcr.microsoft.com/playwright/python:v1.62.0-noble -c \
  'pip install -q --break-system-packages playwright==1.62.0 >/dev/null 2>&1; \
   python3 /cards/docs/render/render.py /out/dist/busch-vacuum-card.js /out/docs/render/ergebnis'
```

Er prüft: 320/390/480/960/1280 px × hell/dunkel × Karte/Panel × docked/
cleaning/error (Inhalt, Knöpfe je Zustand, kein Seitenüberlauf, Touchziele
≥ 44 px, Panel ohne Rand/Radius/Schatten in voller Höhe), Dialog bei
360×640, 360×480, 640×360, 800×600, 1280×800 (Lage, Vollbild/zentriert,
Scrollen bis zum Ende mit bündigem Kopf, Seitensperre und Freigabe, Drehen),
Bestätigungsdialog, Animation/`prefers-reduced-motion`/`animations`
ausgeblendet, Editor-Verdrahtung, HACS-Regeln 1 und 2 (über
`hacs/docs/render/regeln.py` unter `/work`) und 0 Konsolen-/Seitenfehler,
keine Dienstaufrufe. Karte (map-view): Playwright beantwortet
`/api/camera_proxy`, `/api/camera_map_data_proxy` und
`/api/camera_map_obstacle_proxy` mit einem **synthetischen** Kartenbild
(SVG) und synthetischen Kartendaten aus den verfremdeten Raumrechtecken
(gleiche Regel wie `tests/kartendaten.js`); geprüft werden Datenmodus und
Bild-Rückfall, Roboter auf seiner Position (±1,5 px) bzw. auf dem
Kalibrierpunkt, Zoom-Knöpfe/Taste/Mausrad, Sperre (`pan-y`), Bewegung,
Hindernis-Blase und -Dialog, Karteninfo, Stockwerkswahl (Regeln 1/2),
keine Fremdanfragen und eine Labor-Zeitmessung. Ergebnis: `report.json`
und 99 Bilder.

Grenzen: `ha-card`, `ha-icon` und `ha-form` sind Attrappen; belegt sind
Verdrahtung, Maße und erzeugte Konfiguration, nicht die Darstellung der
echten HA-Selektoren. Die Abnahme mit `karten-alle.sh` und E2E läuft einmal
am Ende aller Module.

## Geprüft

**10.11.2026 · 0.1.0, Modul map-view (#882, Tasks 1–12, nicht getaggt)**

1. `node --check dist/busch-vacuum-card.js` grün; `node --test` 205/205
   (71 neue Tests, davon 64 in `tests/karte.test.js`).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 28/28 Prüfungen, UI-Regeln 0 Verstöße (1990 Textelemente),
   0 Konsolen-/Seitenfehler, 0 Fremdanfragen, 0 Dienstaufrufe. Gefunden und
   behoben: Roboter lag während des Übergangs bis 40 px neben seiner Position
   (Übergang jetzt nur bei Knopf/Taste/Chip), Karte wurde in langen
   Fehlerzuständen auf 84 px gequetscht, unsichtbare Begründungstexte zählten
   als Überlauf (jetzt `hidden` als `aria-describedby`-Ziel), reduzierte
   Bewegung verlor gegen die spezifischere Übergangsregel, Hindernis-Blase
   deckte die Zoom-Knöpfe. Bilder gesichtet.
   Labor (keine Feldwerte, R20): Roboter-Update Median 1,1 ms (Desktop),
   5,2 ms bei 4-facher CPU-Drossel; Zoom per Rad ohne lange Tasks > 50 ms.
4. Live lesend (Nutzerfreigabe 10.11.: `GET /api/states/camera.*_map`,
   Kartenbild, `camera_map_data_proxy`; keine Dienstaufrufe): Kartendaten
   25 461 B gzip, Gitter 333 × 295 à 50 mm; mit den Funktionen der Karte
   treffen alle 7 Raum-Mittelpunkte ihre Raum-ID (Gitter und Rechteck),
   Gitter × 4 + Versatz = `calibration_points` mit 0 px Abweichung, Roboter
   hin/zurück 0 mm, Hindernisse nur Typ 200 (gesperrte Räume),
   `picture_status` „Disabled“; Browserlauf mit echten Attributen, Bild und
   Daten: Overlays deckungsgleich in Daten- und Bildmodus, 0 Fehler.
   Screenshots und Rohdaten nur privat (Grundriss), nicht im Repo.


**09.11.2026 · 0.1.0, Modul core (#882, Tasks 1–8, nicht getaggt)**

1. `node --check dist/busch-vacuum-card.js` grün; `node --test` 134/134.
2. `python3 scripts/ui-regeln-pruefen.py`: 0 Verstöße (alle Repos).
3. `render.py`: 18/18 Prüfungen, UI-Regeln 0 Verstöße (840 Textelemente
   geprüft), 0 Konsolen-/Seitenfehler, 0 Fremdanfragen, 0 Dienstaufrufe.
   Der Lauf fand zwei Fehler, die die Node-Attrappe nicht sehen konnte:
   `_focusable()` nutzte `.filter` auf einer NodeList (Dialog ging im Browser
   gar nicht auf) und die Stufe einer Meldung überlappte den umbrechenden
   Text; beide behoben. Bilder gesichtet: Aufgabenarten wurden bei 320/390 px
   abgeschnitten, brechen jetzt um.
4. Live lesend gegen das echte Gerät (nur `GET /api/states`,
   `config/entity_registry/list`, `get_services`; keine Dienstaufrufe):
   Erkennung gleich der Fixture `voll` — 170 Entitäten, je Domain gleich,
   89 Geräteschlüssel, 7 Räume × 11, Karten 1/1/1/0, alle `can()`-Werte
   gleich; 215 Registereinträge, davon 45 deaktiviert.
