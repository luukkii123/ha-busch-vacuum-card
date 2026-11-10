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
| `removeLayer(id)`, `refresh(id?)` | Ebene entfernen; neu zeichnen (ohne id: alle), danach auch die Raum-Chips |
| `hitTest(clientPoint)` | `{ kind: 'room'\|'object'\|'floor'\|'outside', id, layer, object, robot, image }`; Ebenen mit `hit` von oben nach unten zuerst |
| `roomAt(p)` / `passable(p)` | Raum-ID oder `null` (Datenmodus exakt, Bildmodus Rechteck + nächster Mittelpunkt); begehbar `true/false` nur im Datenmodus, sonst `null` (`clean-tasks` sperrt nur bei `false`) |
| `setMode(mode, options)` | `view`, `pick-room`, `pick-point`, `draw-rect`, `drag`; unbekannt → Ausnahme. `pick-room` nimmt `{ selected(), order(), fallbackRooms() }`: die eigenen Raum-Chips zeigen dann Auswahl und Reihenfolge des Moduls, ohne Kartenbild die Räume aus `fallbackRooms()` (clean-tasks: `vacuum.rooms`) |
| `showLoupe(clientPoint)` / `hideLoupe()` | Lupe (in `draw-rect`/`drag` beim Ziehen automatisch) |
| `selectMap(mapId)` | über core `_confirmMapChange` → `dreame_vacuum.vacuum_select_map`; `false`, wenn gesperrt (Aufgabe läuft), unbekannt oder schon aktiv |
| `config(index)` | Kartenoptionen gemischt mit `map_config.map_<index>`; `hidden_objects` addieren sich |
| `visible(name)` | `hidden_objects` (Karte + je Karte) |
| `roomChips({ rooms, selected, order, onToggle })` | die eine Raum-Chip-Liste (Element); Pfeile/Home/End, `aria-pressed`, Reihenfolge-Badge; ein Chip-Tipp löst dasselbe `map-room-tap` aus wie die Fläche (`source: 'chip'`) |

Ereignisse (`CustomEvent` auf `this._map.el`, `bubbles`): `map-tap`
(`{ client, robot, hit, passable, mode }`), `map-room-tap` (`{ room, source,
mode }`, in `view` und `pick-room`; vom Chip zusätzlich `shift`/`toggle` für
Umschalt- bzw. Strg/Cmd-Klick, R02), `map-object-tap` (`{ id, layer, object,
robot }`, in `view`), `map-long-press`, `map-drag` (`{ phase: start|move|end|cancel,
mode, start, robot }`, in `draw-rect`/`drag`), `map-changed` (`{ index,
mapId }`), `map-frame` (`{ frameId, mode }`). Gesperrt (`data-locked="true"`)
löst die Karte keine Ereignisse aus und bewegt sich nicht; Raum-Chips bleiben
bedienbar. Ein Modul entfernt seine Ebene und setzt `view` zurück, wenn es
seinen Modus verlässt.

## Einstellungen (Modul device-settings)

Eine Tabelle, eine Zeile, ein Schreibweg — auch für `dock` und
`clean-settings` (R08):

| Teil | Vertrag |
| --- | --- |
| `SETTINGS[key]` | aus `SETTING_KEYS` (Gruppe → Steuerung → Schlüssel, alle switch/select/number/time von v2.0.3; `station` = dock, `clean` = clean-settings) plus `SETTING_EXTRA` (Grenzen, `wire`, `confirm`, `pick`, `replacedBy`) und `SETTING_NEEDS` (Sperren aus `PROPERTY_AVAILABILITY`) |
| `settingState(card, model, key)` | `{ present, value, known, source: 'attr'\|'entity', options, min, max, locked, reason, busy, note }`; Wert: Attribut → aktivierte Entität → unbekannt |
| `settingRow(card, model, key)` | Zeile oder `null`; Schalter `role=switch` mit Wort, unbekannt = Ein/Aus, Auswahl, Zahl (Grenzen inline), Zeit `HH:MM` |
| `writeSetting(card, key, value)` | genau ein `vacuum_set_property`; optimistisch, bestätigt nur über den Gerätewert, sonst nach `OPTIMISTIC_HOLD_MS` Hinweis; Dienstfehler R12; Doppeltipp ignoriert |
| `callAction(card, key, value, { track, label, done })` | `vacuum_call_action`; belegt bis zur Antwort des Dienstes |
| `MODULE_VIEWS` | Menü-Einträge mit eigener Ansicht; ein Modul trägt sich hier ein |
| `GROUP_HEAD`/`GROUP_EXTRAS` | Inhalt einer Gruppe vor/nach ihren Zeilen (DnD, Zeitpläne, Zubehör, Geräteinfo, Audio, Verweis Station) |

- Texte: `hass.localize('component.dreame_vacuum.entity.<plattform>.<key>.name')`
  nach `loadBackendTranslation('entity', 'dreame_vacuum')`, sonst `set_<key>`
  im Wörterbuch, sonst der Schlüssel in Worten.
- **Wochentage (Zeitpläne):** `repeats` ist positionsweise von links ab
  Sonntag (Zeichen d = `Date#getDay` d; App-Beispiel Mo + Mi = `"0101000"`,
  live mit Nutzer-OK zurückgeschrieben, Attribut gleich). Intern ein Bitfeld
  `WEEKDAY_BIT(d) = 1 << d`.
- **Nicht stören:** ohne Wochentage (die Dreame-App hat keine); bearbeitet
  werden nur vorhandene Zeiträume (ein/aus, Beginn, Ende), `id`, `wk`, `ss`
  bleiben, `en` als Boolean wie `set_dnd_tasks`. Hinzufügen/Löschen nur, wenn
  das Gerät schon mehrere meldet: das X40 lehnte einen zweiten Zeitraum live
  ab („Property not updated: DND_TASK“).
- **Zeitpläne:** nur die Rohzeichenkette aller Einträge ist schreibbar
  (`scheduleValue`); verlustbehaftet (Flag 2 → 1, Felder nach dem neunten,
  Wiederholungs-Kennung `1`, live belegt) — die Ansicht sagt das. Löschen über
  `vacuum_call_action delete_scheduled_task` (device.py#L4394), das auch den
  letzten Eintrag löscht. Neue Einträge übernehmen Karte/Saugstufe/Wasser
  eines vorhandenen (Codes undokumentiert, nichts geraten).
- **Kameralicht automatisch:** `vacuum_set_property { key:
  camera_light_brightness, value: 40, params: [101] }` (an) bzw. `value: 40`
  (aus); der Schalter der Integration selbst hat keinen Schreibweg
  (switch.py#L612–L629).
- Entwürfe (DnD, Zeitplan, Sprachpaket) liegen in `card._drafts` und überleben
  Verlassen und Dienstfehler.

## Station (Modul dock)

- Dock-Schlüssel stehen in `SETTINGS` (Gruppe `station`) mit `tab`
  (`STATION_TABS` wash/dry/empty, `STATION_TAB_OF`); Zeilen nur über
  `settingRow`, Sperrgründe über `SETTING_NEEDS`/`SETTING_LOCKS`
  (types.py#L2101–L2245: `selfClean`, `smartWash`, `cleanGenius`,
  `notByTime`, `byTime`, `notDrying`, `autoDrying`, `autoEmpty`).
- Aktionen: eine Tabelle `STATION_ACTIONS` (`key`, `value`, `needs`, `when`,
  `tab`, `menu`, `confirm`), ein Knopf `stationActionItem` für Dock-Menü und
  Station-Ansicht (R01), ein Aufruf `runStationAction` → `callAction`
  (`vacuum_call_action`, Fehlertext `aktionFehler`). `start_draining` ohne
  `value` lässt ab, mit `'1'` leert es den Frischwassertank (device.py#L5567).
- `can()`: `wash`/`dry`/`self_repair` = `self_wash_base`, `dust_bag_dry`,
  `empty` = `auto_empty_base`, `drain` = `drainage`, `empty_tank` =
  `water_tank_draining`, `station_cleaning`, `recleaning` = `auto_recleaning`
  + `map` (wie die `exists_fn` der Knöpfe, button.py#L196–L296), jeweils plus
  `vacuum_call_action`; nie die Knopf-Entität (kann deaktiviert sein).
- `stationStatus(model)` → `[{ key, level, label, text, icon }]`, Probleme
  zuerst; Stufe wie `dockStatus` (Attribut vor Sensor), Text in HA-Worten,
  wenn der Sensor dasselbe sagt. Geräteinfo (ALL-12) nennt daraus die Probleme.
- Letzter Reiter: `localStorage` `busch-vacuum-card:dock-tab:<entity>`; ohne
  Speicher erster Reiter.

## Shortcuts (Modul shortcuts)

- Eine Liste `shortcutEntries(hass, model, scripts)` → `{ kind: 'script'|'device',
  id, name, icon, running, mapId }`: Scripts der Konfiguration (fehlende
  ausgelassen, der Editor nennt sie), dann Attribut `shortcuts` nach `index`.
  Menü und Verwaltung lesen nur diese Liste; ein Startweg `startShortcut`
  (`vacuum_start_shortcut { entity_id, shortcut_id }` bzw. `script.turn_on`),
  nie `vacuum.stop`/`pause` davor (TASK-07).
- `can('shortcuts')` = Fähigkeit + `vacuum_start_shortcut`; `can('shortcut_manage')`
  zusätzlich `vacuum_rename_shortcut` und `vacuum_delete_shortcut`.
- Sperren: Start bei `draining` (device.py#L5281; Selbstreparatur meldet nur
  der Dienst), Umbenennen während einer Aufgabe (device.py#L6321), Löschen
  solange der Shortcut läuft. Neu laden = `vacuum_call_action reload_shortcuts`,
  auch ohne Shortcuts über Geräteeinstellungen → Sonstiges erreichbar.
- Live hat das X40 keine Shortcuts: Tests und Render mit synthetischen
  Einträgen in der Datenform der Quelle (device.py#L11076, types.py#L5099).

## Aufgaben (Modul clean-tasks)

- Ein Auswahlmodell `card._selection = { rooms, zones, spots, goto }` in
  Roboter-mm (nur im Speicher, R21; Wiederholungen `card._repeats` ebenso).
  Karte (Ebene `tasks`, z 58), Raum-Chips, Listen und Knöpfe lesen und
  schreiben nur dieses Modell (R08). Typwechsel setzt den Kartenmodus
  (`room` → `pick-room`, `zone` → `draw-rect`, `spot`/`goto` → `pick-point`)
  und legt/entfernt die Ebene; `map-changed` leert die Auswahl mit Hinweis.
- Reine Funktionen (über `__internals`): `taskPayload(model, task, selection,
  repeats)` → `{ domain, service, data }` ohne `entity_id`; `taskReady(model,
  task, selection, { passable, grid })` → `{ ok, reason }` (Wörterbuchschlüssel,
  R12). Gesperrt wird nur, was die Integration ablehnen würde: Ablassen/
  Selbstreparatur, Raum ohne gespeicherte Karte, leere Auswahl, Zonenseite
  ≤ 2 × `grid_size` (Kartendaten, sonst 50 mm), Zone mit allen neun
  Stichpunkten `passable === false`, Punkt `passable === false`, Go-To im
  Umkreis 2 × `grid_size` des Roboters nur ohne Fähigkeit `cruising`.
  `passable === null` (Bildmodus) sperrt nie; dann meldet der Dienst.
- Start `card._startTask()`: genau ein Dienst über `_call` (optimistisch,
  `OPTIMISTIC_HOLD_MS`), solange `_pending` läuft, kein zweiter. Fehler →
  `.task-error` (role alert) mit dem Text der Integration, Auswahl bleibt.
  Customized Cleaning (Attribut `customized_cleaning: true`) schickt
  `repeats`/`suction_level`/`water_volume` als Listen aus den Raumattributen
  der Kamera; Badges zeigen bei Fähigkeit `customized_cleaning` die
  gespeicherte `cleaning_sequence`, sonst die Tipp-Reihenfolge.
- Ende (`card._checkEnd`): nur für Aufgaben, die die Karte selbst gestartet
  hat (`card._run`). Nach aktiv → nicht aktiv: eigenes Stopp/Zurück → bleibt;
  sonst neuester Eintrag von `sensor.*_cleaning_history` seit dem Start
  (Zeitstempel ≥ Start − 60 s); `completed: true` → Gesamt + leere Auswahl,
  sonst bleibt; bis der Eintrag kommt, bleibt der Typ. Ohne Verlaufssensor
  → zurücksetzen. Laufende Aufgabe: Ebene zeigt `active_segments/areas/
  points/cruise_points` gestrichelt statt der Auswahl.
- Zone: Griffe und × sind Bildschirmmarken (Trefferradius `HANDLE_PX` 22 =
  44-px-Ziel); × sitzt neben der Ecke, die auf dem Bildschirm oben rechts
  liegt. Knopf/Taste und Ziehen rasten auf dieselbe Kartenachse
  (`card._zoneStep(dir, mm)`), daher gleiche Ergebnisse. Untergrenze
  3 × `grid_size`. Teppich/Möbel-Tipp: kleinster sichtbarer Umriss unter dem
  Punkt (`outlineAt`). Spot und Go-To nutzen dieselben Pfeilwege.
- „Spot hier“ hängt über `addObstacleAction('spot', …)` im Hindernis-Dialog;
  Go-To startet nur über die Zielblase (`.task-bubble` unten in der Karte),
  ohne Aktionsknöpfe (CORE-08). `vacuum_follow_path` ist nicht Teil der
  Referenz und wird nicht angeboten.
- Wiederholungen: lokaler Stepper (`shortcut:`-Notiz), bis `clean-settings`
  die geteilte Zeile SET-02 bringt.

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
und 143 Bilder. Einstellungen (device-settings): Übersicht, alle 12 Gruppen, Suche
(Treffer/leer), DnD- und Zeitplan-Formular, Inline-Fehler (DnD, Sprachpaket), drei
Bestätigungen bei 360×640, 390×844, 800×600, 1280×800 hell/dunkel (Lage, kein
Seitenüberlauf, Knöpfe und Felder ≥ 44 px), Regel 1 für vier Einstellungsansichten,
Regel 2 für die erste Ebene (tiefere Ebenen gehen mit Escape/Zurück eine Ebene
zurück, Node-Test).

Grenzen: `ha-card`, `ha-icon` und `ha-form` sind Attrappen; belegt sind
Verdrahtung, Maße und erzeugte Konfiguration, nicht die Darstellung der
echten HA-Selektoren. Die Abnahme mit `karten-alle.sh` und E2E läuft einmal
am Ende aller Module.

## Geprüft

**10.11.2026 · 0.1.0, Modul clean-tasks (#882, Tasks 1–8, nicht getaggt)**

1. `node --check` grün; `node --test` 374/374 (54 Tests `tests/aufgaben.test.js`,
   core-Test „Karten-Art“ auf „Start gesperrt mit Grund“ umgestellt).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 48/48, UI-Regeln 0 (Regel 1 zusätzlich je Aufgabenart mit
   Auswahl, gemessen bei 2000 px Höhe, weil die Karte über der Sichthöhe in
   sich scrollt, CORE-13), 0 Konsolen-/Seitenfehler, 0 Fremdanfragen,
   0 Dienstaufrufe ohne Klick (die gewollten Starts je Art werden geprüft und
   entfernt). Echte Mauszeiger-Ereignisse: Raum per Tipp, Zone per Tipp,
   Ziehen, Verschieben, Eckgriff 16 px neben der Ecke, Pfeiltaste; Spot,
   Tipp außerhalb, ×; Go-To mit Zielblase unten, Escape schließt sie;
   Pfeiltaste in der Aufgabenwahl. Matrix 4 Arten × 360/390/800/1280 ×
   hell/dunkel ohne Seitenüberlauf, Touchziele ≥ 44 px. Der Lauf fand zwei
   Fehler: kleine Zone am Handy griff beim Ziehen in der Mitte eine Ecke
   (jetzt gewinnt das Nähere), Zielblase brach die Koordinaten um (Text jetzt
   „Ziel“); Bilder gesichtet: Raum-Chips in Zone/Spot/Go-To ausgeblendet.
4. Live nur lesend: `get_services` hat `vacuum_clean_segment/zone/spot`
   (`repeats`, `suction_level`, `water_volume`) und `vacuum_goto` (`x`, `y`);
   X40 mit Fähigkeit `cruising` (Go-To nativ) und `customized_cleaning`
   (Badges = `cleaning_sequence` [3, 5, 7, 1, 6, 9, 4]), Attribut
   `customized_cleaning: false` (Stepper sichtbar), `predefined_points` leer,
   Verlaufseinträge mit `timestamp`/`completed`. **Keine Starts** — jeder
   Start fährt den Roboter und wartet auf Nutzer-OK.

**10.11.2026 · 0.1.0, Module dock und shortcuts (#882, je Tasks 1–4, nicht getaggt)**

1. `node --check` grün; `node --test` 320/320 (25 Tests `tests/station.test.js`,
   15 `tests/shortcuts.test.js`, Korrektur Zeitplan/DnD in `einstellungen.test.js`).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 37/37 Prüfungen, UI-Regeln 0 Verstöße, 0 Konsolen-/Seitenfehler,
   0 Fremdanfragen, 0 Dienstaufrufe ohne Klick. Gefunden und behoben: die
   Station-Ansicht wurde mit 19 Statuswerten über 2000 px lang (Regel 1) — jetzt
   nur Probleme offen, der Rest eingeklappt; in der Shortcut-Verwaltung stand
   der Starten-Eintrag als Spalte und schnitt lange Namen links ab, lange Namen
   im Menü wurden abgeschnitten (jetzt Zeile bzw. Umbruch); Symbol von „Neu
   laden“ stand hinter dem Text. Bilder gesichtet. Grenze: Shortcuts nur
   synthetisch (live keine).
4. Live lesend (`GET /api/states`): echte Attribute des X40 in der Karte —
   Station: alle `can()`-Werte, 16 Zeilen mit gleichen Werten, Sperren
   Wassertemperatur/Selbstreinigungszeit, 19 Statuswerte in Ordnung;
   Shortcuts: Fähigkeit da, `shortcuts: {}`, kein Knopf (richtig), Verwalten über
   Geräteeinstellungen → Sonstiges. Keine Aktion, kein Start, keine Schreibprobe.
5. Live-Schreibproben mit Nutzer-OK (Koordinator, 10.11.2026): Kindersicherung
   1→0 geht; Zeitplan `1-1-14:51-0101000-1-0-0-146-0` zurückgeschrieben →
   Attribut gleich (Wochentage positionsweise ab Sonntag belegt); zweiter
   DnD-Zeitraum vom Gerät abgelehnt → Karte bearbeitet nur vorhandene.

**10.11.2026 · 0.1.0, Modul device-settings (#882, Tasks 1–11, nicht getaggt)**

1. `node --check` grün; `node --test` 277/277 (72 neue Tests, davon 63 in
   `tests/einstellungen.test.js`, 9 Datenschutzprüfungen der Testquelltexte).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 30/30 Prüfungen, UI-Regeln 0 Verstöße (2780 Textelemente),
   0 Konsolen-/Seitenfehler, 0 Fremdanfragen, 0 Dienstaufrufe ohne Klick.
   Gefunden und behoben: Sonntag brach bei 360 px allein in eine zweite Zeile
   (Tage jetzt gleich breit in einer Zeile ab 320 px). Bilder gesichtet.
   Grenze: ohne echtes HA zeigen die Bilder die Rückfallnamen (Schlüssel in
   Worten); in HA kommen die Namen aus der Übersetzung der Integration.
4. Live lesend (`GET /api/states`, `config/entity_registry/list`,
   `get_services`; 215 Registereinträge, 38 deaktiviert): 65 von 65 lesbaren
   Einstellungszeilen zeigen den Wert des Geräts; 9 live „unbekannt“, weil die
   Entität nicht verfügbar ist (KI-Unterpunkte bei ausgeschalteter
   KI-Erkennung, Kameralicht) — die Karte zeigt dort ebenfalls „unbekannt“.
   Keine Schreibprobe ausgeführt (warten auf Nutzer-OK).

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
