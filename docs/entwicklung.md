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
keine Dienstaufrufe. Ergebnis: `report.json` und 77 Bilder.

Grenzen: `ha-card`, `ha-icon` und `ha-form` sind Attrappen; belegt sind
Verdrahtung, Maße und erzeugte Konfiguration, nicht die Darstellung der
echten HA-Selektoren. Die Abnahme mit `karten-alle.sh` und E2E läuft einmal
am Ende aller Module.

## Geprüft

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
