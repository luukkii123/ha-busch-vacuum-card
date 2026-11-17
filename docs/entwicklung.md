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
- Kein Neuaufbau unter Finger oder Tastatur (M4): Knöpfe der Aktionsleiste
  bleiben je `data-action` dieselben Knoten (`BuschUI.action({ node })`), eine
  neue Knopfmenge wartet auf das Ende einer Geste auf `.controls`. Der Dialog
  verschiebt Neuaufbauten aus `hass`, solange ein Feld (`input`, `select`,
  `textarea`) den Fokus hat, eine Geste oder IME-Komposition läuft; der Fokus
  kommt über einen stabilen Schlüssel (`focusKey`) samt Cursor zurück,
  `dialog.stats.renders` zählt. `settingsWatch` beobachtet nur Sauger und
  Einstellungs-Entitäten (Sensoren nur bei Zubehör/Geräteinfo, die Kamera nur
  bei Raumansichten). Umbenennen (Shortcut, Karte) und Hindernis-Details
  beobachten nichts und aktualisieren sich über `update` an Ort und Stelle.
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
  `tests/datenschutz.test.js` prüft das bei jedem Lauf. Muster (IP, MAC, Token)
  stehen im Test; Namen, Domain, Grundriss und Kartendaten nur in einer privaten
  Sperrliste außerhalb des Repos (`BVC_SPERRLISTE`, HMAC-SHA-256). Ohne Variable
  werden diese Fälle sichtbar übersprungen (GitHub, fremde Klone); ist sie gesetzt
  und die Datei fehlt, ist der Lauf rot.

## Layout 0.2 (#1002)

- Konzept: freigegebene Artboards Desktop 1280×800 und Handy 390×844 (12.11.2026).
- `data-width` am Host aus einem ResizeObserver auf der **Karte** (nie das Fenster):
  `wide` ab `WIDE_MIN` 900 px, zurück erst unter 880 px (`WIDE_SLACK`); vor der
  ersten Messung `narrow`. `data-map` am Host, wenn eine Kartenkamera da ist.
- DOM: `.layout` = `.lead` (`.top` + `.stats`), `.map-slot`, `.panel` (`.handle`,
  `.messages`, `.station-slot`, `.task-area`, `.controls`). Breit: Raster
  `"map lead" "map panel"`, Panel 380 px (Linkshänder gespiegelt), normale Karte
  mit eigener Höhe 520–780 px. Schmal: Karte 320 px randlos, Panel als Blatt mit
  Griff (16 px über der Karte), Aktionsleiste `position: sticky` unten.
- Raum-Chips: `MapView.chipHost` = `.chip-slot` im Panel (im Bearbeitungsmodus
  wieder unter der Karte im Dialog); `chipLimit` klappt sie in der Ansicht auf
  drei (Reihenfolge = Reinigungsfolge), „+ N weitere“ öffnet; Tastatur nur über
  sichtbare Chips.
- Werkzeugleiste: eine Gruppe oben rechts (Zoom +/−, Einpassen | Bearbeiten,
  Karten, Info), schmal Einpassen + `map-more` (klappt eine zweite Spalte auf,
  Escape schließt); Stockwerk-Chip `.map-floor` oben links; Hinweis-Chip
  `.map-hint` (`setHint`, ohne Zeiger-Ereignisse) unten links.
- Kontrast: Reihenfolge als Ring (Zahl in Textfarbe auf Kartenfarbe), Links in
  Textfarbe unterstrichen; Hex nur als Fallback hinter HA-Variablen.

## Karte (Modul map-view)

- **Datenmodus ist Standard** (Spike 10.11.2026, Spec map-view „Entscheidung
  Spike“): `/api/camera_map_data_proxy/<camera.*_map>?token=…&v=<frame_id>`,
  nur bei neuem `frame_id`; exakter Raum-Treffertest über das Gitter
  (`decodeMapData`, `roomAtGrid`, `passableGrid`). Rückfall Bildmodus
  (`entity_picture`, `roomAtRects`: Rechteck + nächster Mittelpunkt).
  Raum-Chips sind in beiden Modi die Grundlösung.
- **Abrufzustand (M6, Buschcheck 17.11.2026):** höchstens ein Datenabruf je
  Karte gleichzeitig (Single-Flight); ein neuer Frame wird nur `wanted`, eine
  Antwort neuer als die angezeigte wird angewandt, danach folgt der neueste
  gewünschte Frame. `map-frame` feuert genau einmal je angewandtem Frame. Ein
  Stockwerkwechsel bricht den laufenden Abruf per `AbortController` ab. Ein
  Fehler lässt den letzten guten Stand stehen (`data-stale` an `.map-view`,
  Hinweis `karteVeraltet`) und wiederholt denselben Frame nach 2/5/15/60 s
  (±20 %); ein neuer Frame setzt den Backoff zurück. 4xx außer 408/429 gilt
  als endgültig (der Proxy hat für diese Karte keine Daten): kein Wiederholen,
  ohne Stand Bildmodus wie bisher. Bildmodus: jedes dekodierte Bild, das
  neuer ist als das angezeigte, erscheint; überholte `<img>` bekommen
  `src=''`. Fehlgeschlagene `loadEditData`/`loadSettingTexts` werden nicht
  gemerkt. Tests: `tests/netz.test.js`.
- **Frame-Cache (M19):** `FRAME_CACHE` auf Modulebene, je Kamera höchstens 2
  Frames, Schlüssel `<map_index>:<frame_id>` (ohne Token); alle Karten der
  Seite und `loadEditData` (aktive, nicht gespeicherte Karte) teilen einen
  laufenden Abruf, ein Fehler verlässt den Cache sofort. `stats.data` zählt
  gestartete Abrufe, `stats.cacheHits` geteilte. Im Datenmodus kommt das
  Kartenbild nur als Absicherung: sofort ohne Datenweg, nach einem
  fehlgeschlagenen Abruf oder wenn schon ein Bild gezeigt wird, sonst erst nach
  600 ms ohne Daten (`MAP_HEDGE_MS`).
- **Verbindung (M18):** bei `hass.connected === false` trägt der Host
  `data-offline`, die Meldungen zeigen `offlineHinweis` (`id="offline-hint"`),
  die Aktionsknöpfe sind mit `aria-describedby="offline-hint"` gesperrt, und
  `trackWrite`, `_call` und `_startTask` schreiben nichts (kein optimistischer
  Zustand). Zentral sperrt `callDevice` jeden Dienst offline (Ablehnung mit
  `code: 'offline'`, R12-Text des Aufrufers), damit auch Wege ohne eigenen
  Guard (Hindernis ignorieren, Reinigungsfolgen, Shortcuts) nichts senden;
  einzige Ausnahme ist der Stopp-Schritt der Fernsteuerung (`stopAttempt`). Zurück online: offene Einstellungen, die das Gerät inzwischen
  meldet, gelten als bestätigt; ein wartender Kartenabruf läuft sofort
  (`MapView.retryNow`). Grund: HAs WebSocket-Bibliothek lehnt
  `sendMessagePromise` bei getrennter Verbindung sofort ab (`sendMessage`
  wirft `ERR_CONNECTION_LOST`) und bricht laufende Befehle beim Trennen ab —
  **außer** nach einem `suspend()` (Tab im Hintergrund): beim ersten
  Wiederverbinden danach stellt sie Nachrichten in `_queuedMessages` und sendet
  sie verspätet. Quelle: home-assistant-js-websocket `lib/connection.ts`
  (`sendMessage`, `sendMessagePromise`, `_handleClose`, `_setSocket`), gelesen
  am 17.11.2026. Ohne Sperre käme ein Start also im ungünstigsten Fall erst
  nach der Rückkehr an.
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
| `writeSetting(card, key, value)` | genau ein `vacuum_set_property`; optimistisch, bestätigt nur über den Gerätewert, sonst `OPTIMISTIC_HOLD_MS` nach der Dienstantwort (Deckel `SENDING_CAP_MS` 15 s) Hinweis „noch nicht bestätigt“, den eine späte Bestätigung löscht (M3); Dienstfehler R12; Doppeltipp ignoriert |
| `callAction(card, key, value, { track, label, done })` | `vacuum_call_action`; belegt bis zur Antwort des Dienstes |
| `callDevice(hass, domain, service, data)` | M5: einziger Aufruf von `hass.callService` (Regeltest in `tests/geruest.test.js`); immer ein Promise, `notifyOnError = false`, weil die Karte den R12-Text selbst zeigt. Orten, Warnung löschen und Kartenwechsel laufen über `trackWrite` (`CARD_WRITES`, Fehlertext in den Meldungen der Karte); der Kartenwechsel (`changeMap`) ist belegt, bis die Kartenkamera den Zielindex meldet |
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
- Start `card._startTask()`: genau ein Dienst über `_call` (optimistisch;
  `sending` bis zur Dienstantwort, höchstens `SENDING_CAP_MS`, dann
  `OPTIMISTIC_HOLD_MS`, M3), solange `_pending` läuft, kein zweiter. Fehler →
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

## Reinigungseinstellungen (Modul clean-settings)

- Knopf „Einstellungen“ (`[data-action=clean-settings]`) in `.task-head`
  neben der Aufgabenwahl, nur mit `vacuum_set_property` und nicht während
  geplanter, Shortcut- oder CleanGenius-Aufgaben (SET-01). Dialog
  `cleanSettingsView` mit Abschnitten `cleangenius`, `basic`, `customized`,
  `sequence`, `more` (`[data-section]`, leere entfallen).
- Globale Zeilen sind Einträge der `SETTINGS`-Gruppe `clean` (auch
  `mop_pressure`), also `settingRow`/`writeSetting` aus device-settings. Neu
  in der Tabelle: `max` als Funktion (`wetness_level` 1–15 mit
  `mop_clean_frequency`), `shownIf` (`cleangenius_mode`), `emptyReason`
  (`cleangenius`), Sperren `customized`, `customizedMode`, `savedMap`.
- `repeatsRow(card, { hint })`: die eine Wiederholungen-Zeile (Aufgabenwahl
  und Dialog), Wert `card._repeats`.
- Je Raum: `roomFields(model)` (Felder mit Fähigkeit), `CODE_TABLES`,
  `roomPayload(model, room, change)` → Daten für `vacuum_set_custom_cleaning`
  oder `null` (Wert unbekannt/außerhalb). Schreiben über `trackWrite`
  (`room:<id>`, `mop:<id>`), bestätigt durch die Kamera-`rooms`. `ROOM_KEYS`
  ordnet jeden Raumschlüssel der Integration `clean-settings` oder
  `map-editor` zu.
- Reihenfolge: `sequenceModel(model, rooms)` → `{ strict, ordered,
  unordered }`, `moveRoom(list, id, to)` als einzige Verschiebung (Ziehen,
  Knöpfe, Tastatur, Antipp-Modus). Entwurf `card._drafts.get('sequence')` bis
  das Gerät dieselbe Liste meldet. Menü: `MODULE_VIEWS.cleaning_sequence`.
- Bewusst: Raumwahl und Antipp-Modus im Dialog (Liste/Knöpfe), nicht über die
  Karte — der modale Dialog liegt mit Scrim davor (R04).

## Verlauf (Modul history)

- Menü: `MODULE_VIEWS.history` / `.cruising_history` → `historyView(card,
  name)`; `HISTORY_KINDS` nennt Sensor und Kamera-Attribut. `can('history')`
  = Sensor, `can('cruising_history')` = Fähigkeit `cruising` + Sensor;
  `hidden_card_objects: cruising_history` filtert weiter im core-Menü.
- Reine Funktionen (über `__internals`): `historyRuns(stateObj)` (nach
  `timestamp`, Stufe `interrupted`/`notice`/`done`, Gruppe über
  `multiple_cleaning_time` ab zwei Läufen), `historySums(runs, hass)`
  (m²/ft² nach `unit_system.length`), `historyUrl(camera, run, { kind, data,
  wifi })` (Zuordnung über `v=` aus dem **aktuellen** Attribut, Token wechselt
  mit), `recleanState(model, run, { newest, load, mapId })`.
- Liste: Gruppen zu, Antippen/`+`/`−` öffnet; Summenzeile; Leerzustand.
  Neuberechnung nur bei neuem Sensorobjekt; `watch` nur Sensor (+ Kamera im
  Detail). Rückkehr aus dem Detail: gleiche Scrollposition, Fokus auf dem
  zuletzt gesehenen Lauf (R14, nur in der Sitzung).
- Detail `historyDetail`: eine Unterseite, Blättern ändert nur den Lauf
  (←/→, Älter/Neuer), Zurück = Liste. **Ein Abruf je Lauf und Ansicht:**
  `&data=1` (gzip-JSON, der Browser entpackt über `Content-Encoding`) trägt
  Zähler, Startmethode, `blocked_segments`, `obstacles`, `path`, `map_id` und
  die eingebettete `wifi_map_data` — Reinigungs- und WLAN-Karte kommen aus
  demselben Abruf. `AbortController` beim Blättern und Schließen; nichts wird
  vorgeladen.
- Karte: Datenmodus (Spike) — `decodeMapData` + `paintMapPixels` mit den
  Farben der einen `MapView` (`card._map._colors`), einmal je Lauf/Karte in
  ein behaltenes Canvas; Pfad und Hindernismarker als SVG darüber
  (`gridAffine`). Bildmodus (`info=0` + `cleaning=1`/`wifi=1`) nur, wenn das
  JSON keine Karte trägt — dann gilt die R24-Ausnahme wie map-view. Keine
  zweite `MapView`; Zoom über die Breite der Bühne (+/−/Einpassen).
- Hindernisse alter Läufe: Liste + Marker, Foto nur bei `picture_status` 2
  über `camera_map_obstacle_history_proxy` (`history_index` = `index` der
  Lauf-URL); kein Ignorieren (wirkt nur auf die aktuelle Karte).
- „Nochmal reinigen“ (Text = Stationsaktion „Nachreinigen“): alle blockierten
  Räume → `STATION_ACTIONS` `start_recleaning`; Teilauswahl → `taskPayload`
  Raum (`vacuum_clean_segment`, neuer Lauf, Hinweis im Bestätigungstext).
- Live-Datenform 10.11.2026 lesend geprüft (ein Lauf, `data=1`, PNG
  Reinigung/WLAN): Felder wie oben, `cleaning_map_data` beim X40 leer
  (Rückfall: Hauptkarte des JSON), Hindernisse des Laufs nur blockierte Räume
  (kein Foto am Gerät — Fotoweg nur synthetisch belegt). Rohdaten privat,
  danach gelöscht; Größe/Lauflängen als scrypt-Werte in
  `tests/datenschutz.test.js`.

## Fernsteuerung (Modul remote)

- Ein Schreibweg (R08): Regler, Halte-Knöpfe und Tasten rufen nur
  `view.remote.input(quelle, { v, t } | null)` (v vorwärts, t links positiv,
  je −1…1, Quellen addiert); `remoteValue(axis, raw, mods)` bildet ab
  (Totzone 0,15, Grenzen in `REMOTE`: vorwärts 100, rückwärts −100,
  Drehen ±128; Umschalt halbiert Tempo, Strg Drehen, Präzision beides).
- `RemoteSender` ist der einzige Weg zum Gerät:
  `dreame_vacuum.vacuum_remote_control_move_step { entity_id, velocity,
  rotation }` ohne `prompt`; ein Aufruf gleichzeitig, ≥ 200 ms Abstand,
  neuester Wert; Stopp `{0,0}` mit Vorrang und einmal nach 300 ms; Fehler
  oder 2 s ohne Antwort → Zustand `error`, Stopp-Versuch, keine Bewegung
  mehr. Ein Stopp ohne vorige Bewegung sendet nichts.
- Dialog: Ansichten mit `leave()` hören jedes Verlassen zuerst (×, Zurück,
  Escape, Zurück-Geste, Schließen), Ansichten mit `update(hass)` zeichnen
  sich selbst nach. Die Fernsteuerung hat `watch: []` und baut ihr DOM
  einmal je Öffnen — ein gehaltener Regler verliert seinen Zeiger nie durch
  ein Update.
- Karte: keine zweite `MapView`. Bildmodus: dasselbe `entity_picture` wie die
  Hauptkarte (Browser-Cache); Datenmodus: Kopie des gemalten Canvas, neu bei
  `map-frame` — `toImage` bildet dort in Gitter-Pixel ab, das
  `entity_picture` passte nicht. Marker in % von `_size`, nur `transform`.
- Annahme bis Live-Lauf 2: positive `rotation` = links (gegen den
  Uhrzeigersinn); als `shortcut:` im Code markiert.

## Kartenbearbeitung (Modul map-editor)

- **Sicherheitsrahmen.** Genau ein Schreibweg: `mapWrite(card, grant,
  service, data)` wirft ohne Grant; einen Grant erzeugt nur
  `confirmGrant(card)`, und das steht genau einmal im Code — im
  Bestätigungsklick von `mapConfirm` (Checkpoint-B-Test prüft alle Aufrufer
  im Quelltext; einzige Ausnahme ohne Bestätigung: `requestMap`, nicht
  zerstörend). Kein `hidden_card_objects`-Schalter schaltet die Bestätigung
  ab. `MapEditSession` je Bearbeitung: die **erste** Speicherung ruft zuerst
  `vacuum_backup_map { map_id }` (nur mit Fähigkeit `backup_map`) und erst
  nach `map_backup_status` „Success“ den Kartendienst; Fehler oder 60 s ohne
  Ende → 0 Kartendienste, Text der Integration, Erneut behält den Entwurf.
  Spätere Speicherungen derselben Sitzung sichern nicht neu. `undo[]` hält je
  Speicherung die Ausgangslisten; Rückgängig sendet sie bestätigt mit
  demselben Dienst (ohne Sicherung); nicht umkehrbare Aktionen (Teilen,
  Zusammenführen, Löschen) verweisen auf Wiederherstellen in der
  Kartensicherung (eigenes Modul, noch nicht gebaut). Gesperrt während Aufgabe (Dienste in
  `EDIT_TASK_LOCKED`), temporärer Karte, laufender Sicherung/
  Wiederherstellung. Nur die aktive Karte (`map_id` =
  `card._map.current().mapId`), sonst „Zu <Karte> wechseln“ über
  `selectMap` (CORE-20).
- **Dirty-Schutz.** Der Bearbeitungsdialog (`kind: 'editor'`) hat `guard`:
  mit offenen Änderungen halten Escape, Schließen, Zurück-Geste, Fertig,
  Werkzeug-, Aufgaben- und Kartenwechsel an, das Blatt wackelt (`.shake`) und
  `dirtyChoice` bietet Weiter bearbeiten / Verwerfen / Speichern. Bestätigung
  und Formulare schließen nie per Außenklick (R04).
- **Registry.** `EDIT_TOOLS[name] = { icon, lists, panel, enter?, draw?,
  hit?, onMap? }` für rooms, walls, zones, lines, carpets, furniture, points,
  wifi; ein Werkzeug erscheint nur mit `panel` und wenn `editCaps` es zeigt
  (Fähigkeit + Dienst + Attribut; Wände/Teppiche/Möbel brauchen die
  Bearbeitungsdaten, sonst gesperrt mit Grund). `EDIT_GROUPS[group] =
  { service, lists, data | calls, check? }` bildet Listen auf genau einen
  Dienst ab; `MapEditor` hält `base` (Dienst-Werteordnung) und `draft`,
  Sammel-Speichern = eine Bestätigung, je geänderter Gruppe ein Aufruf in
  fester Reihenfolge (`groupCalls`), Zeilen „<Art>: n neu, n geändert, n
  gelöscht“ bzw. je Raum/Objekt (`EDIT_LINES`).
- **Schreibwege kurz.** Jeder Objektdienst **ersetzt die ganze Liste**:
  `vacuum_set_restricted_zone` immer mit `walls`/`zones`/`no_mops`,
  `vacuum_set_threshold` immer mit allen drei Schwellenlisten (Geräte nur mit
  `virtual_thresholds` → nur `vacuum_set_virtual_threshold`, nie beide),
  `vacuum_set_curtain`, `vacuum_set_carpet_area` (eigene Teppiche, Typ im 7.
  Wert; `vacuum_set_carpet_type`/`vacuum_set_custom_carpet_cleaning` nur für
  geänderte), `vacuum_set_furniture` (11 Werte), `vacuum_set_predefined_points`,
  `vacuum_set_walls { walls, doors, map_id }`, `vacuum_set_router_position
  { x, y }`; Räume: `vacuum_rename_segment` je Raum, `vacuum_set_segment_type`,
  `vacuum_set_hidden_segments`, `vacuum_set_floor_material` (alle Räume),
  `vacuum_split_segments`, `vacuum_merge_segments`; Verwaltung:
  `vacuum_rename_map`, `vacuum_delete_map`, `vacuum_select_map` (core),
  temporäre Karte speichern/verwerfen/ersetzen, `start_mapping`. Die Tabelle
  der Spec ist je Zeile mit Dienst und Datenform getestet (Checkpoint C).
- **Bearbeitungsdaten.** `loadEditData` holt beim Betreten einmal
  `/api/camera_map_data_proxy/<kamera>?…&saved=1&index=<n>&v=<frame_id>`
  (Wände kommen nur mit der gespeicherten Karte), neu nur bei neuem
  `frame_id`; ein fremdes neues `frame_id` während offener Änderungen zeigt
  einen Hinweis und gleicht vor dem Speichern ab.
- **Schnellbearbeitung** (EDI-06): die Blase eines Teppichs/Möbels trägt
  „Bearbeiten“ im Aktionsplatz und öffnet denselben Modus mit dem Objekt im
  passenden Werkzeug. **WLAN** (EDI-07): Umschalter Reinigungs-/WLAN-Karte
  (WLAN-Kamera kalibriert über der Karte), Legende mit Stufennamen, Router
  nur auf befahrbarer Fläche.
- **Grenzen ohne öffentlichen Schreibweg** (ehrlich angezeigt/begrenzt):
  `low_lying_areas` nur Anzeige — `vacuum_set_low_lying_area` lehnt in
  Integration 2.0.3 jede Änderung ab (Entscheidung: als Integrationsgrenze
  vermerkt, nachrüsten, sobald die Integration es kann); Drehen von
  Zonen/Rampen nicht möglich, ein vorhandener 5. Wert wird nur durchgereicht;
  Wände/Türen nur verschieben/zurücksetzen, nicht anlegen/löschen (Anzahl je
  Raum bleibt, sonst Speichern gesperrt); Zusammenführen nur zwei Räume je
  Schritt. WLAN-Überlagerung und Teppich-Vorlieben (`carpet_cleanset_v3`)
  sind nur synthetisch belegt (X40 ohne `carpet_cleanset_v3`; die
  Deckung des WLAN-Bilds über der Karte ist am echten Gerät nicht geprüft).
- Ausblenden: `hidden_card_objects: map_editor` blendet Stift,
  Kartenwerkzeug, Menüeintrag `maps` und die Schnellbearbeitung aus.

## Kartensicherung (Modul map-backup)

- **Stände** (BAK-01): `recoveryEntries(hass, model, mapId)` liest nur
  Kamera-Attribute (kein Abruf): `recovery_map_list` der gespeicherten
  Kamera `camera.*_map_N` (per `map_index` der Karte `maps[]`), neueste
  zuerst (types.py#L5072); Position `i` ↔ Nummer `k = Länge − i` — dieselbe
  Nummer erwartet `vacuum_restore_map` (`recovery_map_list[k − 1]`,
  device.py#L7033) und steht in Schlüssel „…: Map<k> (<Typ>)“ und URL
  (`index=k`) von `recovery_map_picture`/`_file`. Ohne Liste (aktive Kamera
  `camera.*_map`) nur aus den Schlüsseln. Typ (`original`/`edited`/`backup`)
  aus dem übersetzten Text, angezeigt wird der Text der Integration (R26).
- **Status** (ALL-13): `recoveryStatus` für `map_backup_status` und
  `map_recovery_status` (idle/running/success/failed/unknown);
  `can('map_recovery')` = Attribut `map_recovery_status` + Dienst
  `vacuum_restore_map`; Sperren über `MapEditSession.lock` (R08):
  Sicherung/Wiederherstellung läuft, Aufgabe (`vacuum_restore_map(_from_file)`
  in `EDIT_TASK_LOCKED`), temporäre Karte. Während `map_recovery_status`
  Running ruhen Editor, Aufgabenwahl und Start.
- **Ansichten:** „Kartensicherungen“ (`backupsView`, kind editor) je Karte aus
  der Kartenverwaltung und dem Bearbeitungsmodus; beobachtet die Kameras der
  Karte nur, solange sie offen ist (`backupWatch`, R20). Vollbild
  `backupImageView` mit der Dialog-Option `size: 'full'` (Vollbild bei jeder
  Breite, kind menu): „Aktuelle Karte“ zuerst, Bild erst beim Anzeigen
  (`decode()`, Cache bis zum Schließen), Zoom über `ImageZoom` mit
  `zoomAround`/`clampPan` der Karte (R08).
- **Schreibwege** — alle über `mapConfirm` + `MapEditSession.commit` (der
  einzige Grant, Checkpoint B):

  | Aktion | Dienst + Daten |
  | --- | --- |
  | Jetzt sichern | `vacuum_backup_map { entity_id, map_id }` über `MapEditSession.backup` (Warten auf `map_backup_status`, 60 s) |
  | Wiederherstellen | `vacuum_restore_map { entity_id, recovery_map_index: k, map_id }`, Ende über `map_recovery_status` (120 s) |
  | Aus Datei-URL | `vacuum_restore_map_from_file { entity_id, file_url, map_id }`, ebenso |
  | Herunterladen | Link auf `recovery_map_file` (`&file=1`, `.mb.tbz2`, lesend) |

  `map_id` ist immer `maps[].id` der Liste (live 3); die Karte muss aktiv
  sein (sonst „Zu <Karte> wechseln“, CORE-20), weil das Gerät sonst selbst
  wechselt.
- **Rückweg vor dem Wiederherstellen:** „Aktuellen Stand vorher sichern“
  vorausgewählt ohne Backup-Eintrag, sonst nicht vorausgewählt mit Hinweis
  „kann die Sicherung vom <Datum> ersetzen“; beim Backup-Stand selbst keine
  Sicherung davor. Fehler mit eigenen R12-Texten (Gerät, Zeitlimit
  „Ergebnis unbekannt“, `cloud_required`).
- **Bewusst anders als der Plan:** „Jetzt sichern“ fragt auch ohne
  vorhandenen Backup-Eintrag kurz nach (Plan: „sofort“) — sonst bräuchte es
  einen zweiten Grant-Weg neben dem Bestätigungsklick.
- **Sperre bei Lauf/Pause (Live-Test 12.11.2026):** die Integration lehnt
  `restore_map` ab, solange `started` (device.py#L7017) — auch pausiert im
  Dock. `MapEditSession.lock` gibt für `vacuum_restore_map(_from_file)` dann
  `wiederherstellenSperreLaeuft` (`robotBusy`: `started`/`paused` true oder
  Zustand cleaning/paused/returning); `mapConfirm` kennt `blocked`, das den
  Bestätigungsknopf mit Grund sperrt, wenn die Sperre bei offener Bestätigung
  aufkommt.
- **Raumeinstellungen (Live-Test 12.11.2026):** ein Restore setzt die
  Customized-Cleaning-Werte aller Räume auf Standard und berechnet die
  Raumgrenzen neu. `roomSnapshot(model)` merkt vor dem Restore je Raum die
  vollständigen Daten (`roomPayload`: `segment_id`, `suction_level`,
  `wetness_level`/`water_volume`, `repeats`, `cleaning_mode`,
  `cleaning_route` … je Fähigkeit; Räume mit unbekanntem Wert ausgelassen) in
  `card._restoreNote.rooms`; danach bietet die Liste „Raumeinstellungen
  wiederherstellen“ (`roomRestoreView`): ein `vacuum_set_custom_cleaning` je
  Raum nacheinander, Halt beim ersten Fehler, „Erneut versuchen“ nur für den
  Rest, gesperrt über `roomLock`. Die Werte leben nur im Speicher der Seite.
- **Netz und Rennen (M20, Buschcheck 17.11.2026):** `_awaitStatus` nimmt als
  zweites Signal eine geänderte Liste der Stände (`recoveryEntries`: Nummer,
  Typ, Datum, Bild-URL mit `v=`): ist der Dienst beantwortet, der Status
  unverändert „Success“ und die Liste anders als beim Start, ist der Lauf
  fertig (sonst wie bisher bis zum Zeitlimit). Die Karte füttert wartende
  Sitzungen auch bei Updates nur gespeicherter Kameras (`_feedWaits`).
  Teilfehler: `commit` zählt geschriebene Aufrufe; mit `undo.groups`
  (`saveConfirm` je Gruppe `{ count, calls }`) meldet `kartenTeilFehler`
  „{n} von {m} Gruppen gespeichert …“ und das Undo nimmt die geschriebenen
  Gruppen zurück. Eigener Frame: statt „der nächste Frame ist unserer“ merkt
  `saveConfirm` die geänderten Listen mit ihrem alten Stand (`expect`); ein
  neuer Frame, in dem alle noch alt sind, gilt als fremd (`foreign`), der
  erste, in dem eine davon den alten Stand verlassen hat, als eigener
  (tolerant gegen Normalisierung durch das Gerät). Rückgängig sowie Teilen und
  Zusammenlegen von Räumen behalten `ownSave`. Tests: `tests/netz.test.js`.
- **Grenzen:** kein Hochladen aus dem Browser (kein Dienst; daher Datei-URL);
  wie viele Backup-Stände das Gerät hält, ist offen.

## Ansichten und Inventar (Release)

- Jede Dialogansicht trägt eine `id` (`__internals.VIEW_IDS`, 42), der Dialog
  setzt `data-view` am Blatt. `tests/dialog.test.js` vergleicht die ids im
  Quelltext mit `VIEW_IDS`; `render.py` zeichnet bei jedem Bild die offenen
  ids auf (`viewIds`/`views` im Bericht, Prüfung „views:“). Eine neue Ansicht
  ohne Bild im Render-Lauf ist rot.
- Testnamen beginnen mit ihren Inventar-IDs (`EDI-03 …`, mehrere
  `CORE-01/CORE-02 …`), Render-Prüfungen tragen `ids` (`RENDER_IDS` in
  `render.py`); Entscheidungen, die einen Punkt anders erfüllen, stehen in
  `tests/inventar-entscheidungen.json`. `hacs/scripts/vacuum-inventar-pruefen.py`
  prüft die Abdeckung (Exit 1 bei ID ohne grünen Test, rotem Test, unbekannter
  ID, Ansicht ohne Bild).

## Prüfung

Syntax und Node-Tests (im Container, die Share ist FUSE):

```bash
REPO=/pfad/zu/ha-busch-vacuum-card
LABELS='--label aicli.project=hacs --label aicli.todo=882 --label aicli.lifecycle=test'
docker run --rm --name test-hacs-t882-node $LABELS \
  --label "aicli.session=Claude · HACS · <Sitzung>" --label aicli.cleanup-after=<JJJJ-MM-TTThh:mmZ> \
  -v "$REPO:/vac:ro" -w /vac node:22-alpine \
  sh -c 'node --check dist/busch-vacuum-card.js && node --test tests/*.test.js'
```

Mit privater Sperrliste (lokal Pflicht, `scripts/karten-alle.sh` setzt sie selbst):
`-v "$BVC_SPERRLISTE:/privat/s.json:ro" -e BVC_SPERRLISTE=/privat/s.json` ergänzen.

Jeder `docker run` braucht (Hook-Pflicht seit 10.11.2026, Regeln in
`docs/docker-stack-regeln.md` der Projektebene) den Namen
`test-hacs-t<todo>-<zweck>` und die fünf Labels `aicli.project`,
`aicli.todo`, `aicli.session` (Sitzungsname), `aicli.lifecycle=test` und
`aicli.cleanup-after` (UTC-Zeitpunkt, ab dem der Container weg sein darf).
`--rm` entfernt ihn nach dem Lauf; übrig gebliebene mit `docker ps -a
--filter label=aicli.todo=882` prüfen.

UI-Regeln (HACS-Ebene):

```bash
python3 /pfad/zu/hacs/scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card
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
docker run --rm --name test-hacs-t882-render $LABELS \
  --label "aicli.session=Claude · HACS · <Sitzung>" --label aicli.cleanup-after=<JJJJ-MM-TTThh:mmZ> \
  -v "$REPO:/cards:ro" \
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
Kartenbearbeitung (map-editor): `&saved=1` beantwortet der Harness mit
**synthetischen** Bearbeitungsdaten (`synthetic_edit_data`: Wände = Kanten der
verfremdeten Raumrechtecke, erfundene Türen/Möbel/Zielpunkte, Teppiche aus den
Fixture-Rechtecken, WLAN-Gitter), die WLAN-Kamera mit einem eigenen Bild durch
ihre Kalibrierung. 16 Ansichten (Verwaltung, Umbenennen, Löschen, Modus, je
Werkzeug ein Formular, Teilen, WLAN-/Reinigungskarte, Bestätigung,
Ungespeichert) × 360/390/800/1280 × hell/dunkel; echte Eingabe (Escape mit
Änderungen fragt und wackelt, Außenklick lässt die Bestätigung offen, erst der
bestätigende Klick sendet `vacuum_backup_map`), Blase „Bearbeiten“ per
Mausklick auf einen Teppich; Regel 1 je Ansicht (bei 2600 px Höhe: Karte über
dem Werkzeug, das Blatt scrollt), Regel 2 für Verwaltung und Modus.
Kartensicherung (map-backup): drei **synthetische** Stände (Original,
Bearbeitet, Backup) der Karte 3; `/api/camera_recovery_map_proxy/**` liefert
das synthetische Kartenbild. 9 Ansichten (Liste, Vollbild, Vollbild „Aktuelle
Karte“, Wiederherstellen mit/ohne Vorab-Sicherung, Jetzt sichern, Datei-URL,
Datei-URL mit Inline-Fehler, Wiederherstellung läuft) × 360/390/800/1280 ×
hell/dunkel; echte Eingabe (Außenklick lässt die Bestätigung offen, Pfeiltaste,
Mausrad, Escape, Doppelklick auf „Sichern“ sendet genau ein
`vacuum_backup_map`); Regel 1 je Ansicht, Regel 2 für Liste und Vollbild.

Grenzen: `ha-card`, `ha-icon` und `ha-form` sind Attrappen; belegt sind
Verdrahtung, Maße und erzeugte Konfiguration, nicht die Darstellung der
echten HA-Selektoren.

Abnahme vor einem Tag (einmal, mit hartem Zeitlimit; Node-Tests und
`render.py` in einem Container, Ergebnis unter `hacs/artifacts/e2e/<lauf>/`):

```bash
HACS=/pfad/zu/hacs
KARTEN_TODO=882 KARTEN_ZWECK=abnahme timeout 4500 bash "$HACS/scripts/karten-alle.sh" --repo ha-busch-vacuum-card
python3 "$HACS/scripts/vacuum-inventar-pruefen.py" --lauf "$HACS/artifacts/e2e/<lauf-id>"
```

## Geprüft

**12.11.2026 · 0.2.2, Befunde der Live-Prüfung von 0.2.1 (#1002, Tag `v0.2.2`)** — Panel Mode nimmt genau die Höhe unter HAs Kopf (100dvh − `--header-height` − Safe Areas − Versatz), das Blatt scrollt am Handy selbst, die Aktionsleiste bleibt sichtbar; Stationswarnung nur in der Hinweisleiste, Aktionsleiste „Dock“ (breit) bzw. Symbol (schmal), Primärknopf kürzt nie; Auswahlwerkzeuge 13 px unter der 14-px-Zählzeile.

1. Je Befund zuerst rote Node-Tests (`tests/aufbau.test.js`), danach grün; `node --check` grün; `node --test` 622/622.
2. Render-Harness bildet HAs Panel-Ansicht nach (fester Kopf, kein Elter mit fester Höhe, Seite darf scrollen); neue Fälle `ha_panel_checks` einmal gezielt gegen v0.2.1: 5/6 rot (Seite scrollte 295 px, „Alles reinigen“ um 76 px gekürzt, Dock mit Warntext, Werkzeuge 16 px).
3. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße (mit R3.6).
4. Abnahmelauf `karten-20261112-195711-ee008e` grün: Node 622, render 87/87 (2255 s, 391 Bilder), UI-Regeln 0, 0 Seiten-/Konsolenfehler, 0 Dienstaufrufe, 0 Fremdanfragen; Inventar 88 IDs, 42/42 Ansichten. Vorlauf `karten-20261112-191711-dc095f` brach nur an einer veralteten Prüferwartung (Dock-Text) ab, zählt nicht.

**12.11.2026 · 0.2.1, Kartenwähler ohne Live-Vorschau (#1011, Tag `v0.2.1`)** — Beschreibung ein Satz mit Verb; `getStubConfig` merkt die Vorgabe je Entitätsregister (ein Durchlauf über `hass.states`). Layout von 0.2.0 unverändert.

1. `node --check` grün; neue Tests `tests/kartenwaehler.test.js` (preview false, ein Satz Beschreibung de/en, höchstens ein Durchlauf je Register, kein Netz) zuerst rot, danach grün.
2. `python3 scripts/ui-regeln-pruefen.py`: 0 Verstöße, mit der neuen Prüfung R3.6 (Kartenwähler-Vertrag), die vorher für dieses Repo rot war.
3. Einziger Abnahmelauf `karten-alle.sh` für alle fünf geänderten Kartenrepos (Lauf `karten-20261112-175558-77c23e`): 2/2 Schritte grün, Node 618 Tests grün, 385 Bilder.
4. Eintrag in `docs/stand.md` der Projektverwaltung, Block 12.11.2026 (#1011).

**12.11.2026 · 0.2.0, Layout nach Designkonzept (#1002, Tag `v0.2.0`)**

1. `node --check` grün; `node --test` 615/615 (24 neue Tests, jeweils zuerst rot).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. Ein Abnahmelauf `KARTEN_TODO=1002 KARTEN_ZWECK=abnahme timeout 3000 karten-alle.sh
   --repo ha-busch-vacuum-card`, Lauf `karten-20261112-171344-95f557` grün: Node
   615/615, `render.py` 81/81 (2279 s, 385 Bilder, neu Abschnitt Layout 360–1600 px
   Karte/Panel hell/dunkel Gesamt/Raum, Linkshänder), UI-Regeln 0 Verstöße, 0 Seiten-/
   Konsolenfehler, 0 Fremdanfragen, 0 Dienstaufrufe; `vacuum-inventar-pruefen.py`:
   88 IDs grün, 42/42 Ansichten im Bild, 0 Befunde. Bilder mit den Artboards
   verglichen (Abweichungen: Reihenfolge als Ring statt gefülltem Badge und Links in
   Textfarbe wegen 4.5:1; Gesamt als Chips statt Textzeile; Einstellungszeile
   zweizeilig mit Titel; Touchziele 44 statt 36–40 px). Auswahl in
   `docs/render/baseline/release-0.2.0/`. Nur synthetische Daten.
4. Dieser Eintrag und der Block in `hacs/docs/stand.md`.

**12.11.2026 · 0.1.1, Patch: Titel = Gerätename (#882, Tag `v0.1.1`)**

Befund der Livepruefung von 0.1.0: `friendly_name` von `vacuum.x40_ultra` ist
„X40 Ultra  X40 Ultra“ (HA fügt Geräte- und Entitätsname zusammen), der Titel
zeigte ihn doppelt. Jetzt: `title` aus der Konfiguration, sonst Gerätename aus
dem Register (`name_by_user`, sonst `name`), sonst `friendly_name`, sonst
Entitäts-ID. Dialogtitel und Editor-Vorschau nutzen keinen Gerätenamen
(Dialoge: feste Übersetzungen; Vorschau = dieselbe Karte).

1. `node --check` grün; `node --test` 591/591 (neuer Test CORE-03 zuerst rot).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. Ein Abnahmelauf `KARTEN_TODO=882 KARTEN_ZWECK=abnahme timeout 3000 karten-alle.sh
   --repo ha-busch-vacuum-card`, Lauf `karten-20261112-151711-cad157` grün: Node
   591/591, `render.py` 73/73 (2172 s, 335 Bilder), UI-Regeln 0 Verstöße;
   `vacuum-inventar-pruefen.py`: 88 IDs grün, 42/42 Ansichten im Bild, 0 Befunde.
   Bilder stichprobenartig gesichtet, kein Befund. Nur synthetische Daten.
4. Dieser Eintrag und der Block in `hacs/docs/stand.md`.

**12.11.2026 · 0.1.0, Release (#882, alle elf Module, Tag `v0.1.0`)**

1. `node --check` grün; `node --test` 590/590 (Testnamen mit Inventar-IDs).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. Ein Abnahmelauf `KARTEN_TODO=882 KARTEN_ZWECK=abnahme karten-alle.sh --repo
   ha-busch-vacuum-card`, Lauf `karten-20261112-142341-133312` grün: Node 590/590,
   `render.py` 73/73 (2166 s, 335 Bilder), UI-Regeln 0 Verstöße (11 328 Textelemente
   geprüft), 0 Konsolen-/Seitenfehler, 0 Fremdanfragen, 0 Dienstaufrufe ohne
   bestätigten Klick; alle 42 Ansichten (`VIEW_IDS`) geöffnet und im Bild.
   `vacuum-inventar-pruefen.py` auf dem Lauf: 88 IDs grün, 0 Befunde. Der Lauf davor
   (`karten-20261112-140952-45302e`) brach im Testskript ab (fehlendes Szenario
   `temporary`), kein Befund an der Karte — zählt nicht.
   Bilder gesichtet (Karte Handy/Panel hell/dunkel, Einstellungen, Station,
   Kartenbearbeitung, Sicherungen, Raumeinstellungen zurückschreiben, temporäre
   Karte ersetzen, Sprachpaket bestätigen): kein Befund; Titel langer Dialoge
   werden bei 360/390 px in der core-Titelzeile gekürzt (bekannt). Auswahl in
   `docs/render/baseline/release-0.1.0/`. Nur synthetische Daten.
4. Dieser Eintrag und der Block in `hacs/docs/stand.md`.

**12.11.2026 · 0.1.0, Modul map-backup (#882, Tasks 1–6 ohne Live-Läufe (a)/(b), nicht getaggt)**

1. `node --check` grün; `node --test` 579/579 (15 Tests `tests/kartensicherung.test.js`).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 72/72 (4 neu), UI-Regeln 0 (Regel 1 für 9 Sicherungsansichten,
   Regel 2 für Liste und Vollbild), 0 Konsolen-/Seitenfehler, 0 Fremdanfragen,
   0 Dienstaufrufe ohne bestätigten Klick (72 Sicherungsansichten); der
   bestätigende Doppelklick auf „Sichern“ sendet genau ein `vacuum_backup_map
   { entity_id, map_id: 3 }`. Vollbild bei jeder Breite bildschirmfüllend, Bild
   über die Recovery-Route geladen, Bühne ≥ 240 px; Liste mit 3 Ständen je
   Ansehen/Wiederherstellen/Herunterladen ≥ 44 px; beim Backup-Stand keine
   Vorab-Sicherung; während `map_recovery_status` Running alle
   „Wiederherstellen“ gesperrt mit Grund. Bilder gesichtet (Liste, Vollbild,
   Bestätigungen, Formular mit Fehler, läuft; 360 dunkel, 390/1280 hell): kein
   Befund. Grenze: der Titel „Aus Datei-URL wiederherstellen“ wird bei 390 px in
   der core-Titelzeile gekürzt (Knopf und Text darunter vollständig). Nur
   synthetische Daten, kein Grundriss.
4. Live lesend (11.11.2026, nur `GET /api/states` und eine Stand-Vorschau samt
   Rohdatei, privat unter `claude-work`): eine Karte (`maps[].id` 3,
   `map_index` 1), zwei Stände (Nr. 2 Bearbeitete Karte, Nr. 1 Originalkarte),
   Nummer `k` und Typ wie in der Karte, beide Status Idle.
5. **Live-Läufe (a) Backup und (b) Wiederherstellen dieses Backups: wartet auf
   Nutzer-OK** (Ablauf im Plan map-backup, Task 6). Kein Kartendienst gegen das
   Gerät aufgerufen; Anzahl der Backup-Plätze bleibt bis Lauf (a) offen.

**10.11.2026 · 0.1.0, Modul map-editor (#882, Tasks 1–13 ohne Live-Kartenänderung, nicht getaggt)**

1. `node --check` grün; `node --test` 563/563 (66 Tests `tests/karteneditor.test.js`,
   davon 5 aus den Befunden dieses Laufs).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 68/68 (7 neu), UI-Regeln 0 (Regel 1 für 16 Editor-Ansichten,
   Regel 2 für Verwaltung und Modus), 0 Konsolen-/Seitenfehler, 0
   Fremdanfragen, 0 Dienstaufrufe ohne bestätigten Klick (128 Ansichten);
   der eine bestätigte Klick sendet zuerst `vacuum_backup_map`, danach
   geleert. Matrix 16 Ansichten × 360/390/800/1280 × hell/dunkel im Bild,
   ohne Seitenüberlauf, Knöpfe und Felder ≥ 44 px; Werkzeuge mit Formular je
   Art; WLAN-Bild über seine eigene Kalibrierung deckungsgleich (< 0,01 px);
   Blase „Bearbeiten“ per Mausklick ≥ 44 px, öffnet das Teppich-Werkzeug.
   Nur synthetische Daten, kein Grundriss. Der Lauf fand: leere Kartenblase
   als Balken über der Karte im Dialog (`[hidden]` fehlte in den
   Dialog-Stilen), Symbole rechts vom Text in Werkzeugleiste, Formularen,
   Verwaltung und Blase, gewählter Listeneintrag nur über `aria-pressed`
   erkennbar, Wandliste mit allen Wänden (live 56) — jetzt ab 13 Wänden
   raumweise, die auf der Karte gewählte Wand zeigt ihren Raum —, Tastenhilfe
   des Routers sprach von „Wand oder Tür“, ein einzelnes Kartensymbol brach
   allein um, „1 ungespeicherte Änderungen“ — behoben und in den Bildern
   nachgesehen. Grenze: Titel „Ungespeicherte Änderungen“ wird im 320 px
   breiten Bestätigungsdialog gekürzt (core-Titelzeile, Text darunter
   vollständig).
4. Live lesend (Koordinator, nur `GET /api/states` und
   `camera_map_data_proxy &saved=1`): Fähigkeiten walls, cruising, wifi_map,
   segment_visibility, floor_material, floor_direction_cleaning,
   carpet_recognition, curtains, pet_furniture, extended_furnitures,
   backup_map, carpet_shape vorhanden; carpet_type, floor_mats,
   carpet_cleanset_v3, map_v2, virtual_thresholds fehlen. Attribute
   `furnitures`/`predefined_points`/`virtual_thresholds`/`low_lying_areas` =
   None. Bearbeitungsdaten: Wände je 11 Werte (7 Räume, 56 Wände), Türen
   17 × 11, Teppiche 3 × 15, gelöschte 2 × 9, erkannte 6 × 18, Möbel []
   (`furniture_version` 4), `station_segment` und Raumnachbarn vorhanden;
   `editData` liest sie vollständig (Zählung stimmt).
5. **Live-Kartenänderung: wartet auf Nutzer-OK** (Ablauf im Plan map-editor,
   Task 13 „Live-Lauf 1“: Sicherung, eine No-Go-Zone, Rückgängig,
   Listenvergleich). Kein Kartendienst gegen das Gerät aufgerufen.

**10.11.2026 · 0.1.0, Modul remote (#882, Tasks 1–6, nicht getaggt; Live-Teil Task 7 offen)**

1. `node --check` grün; `node --test` 494/494 (58 Tests `tests/fernsteuerung.test.js`).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 61/61, UI-Regeln 0 (Regel 1 unscharf/freigegeben, Regel 2),
   0 Konsolen-/Seitenfehler, 0 Fremdanfragen. Fernsteuerung bei 390×844,
   844×390, 1280×800 × hell/dunkel × unscharf/freigegeben: im Bild, kein
   Seitenüberlauf, Knöpfe ≥ 44 px, Regler ≥ 48 px und mit Stopp ohne Scrollen
   sichtbar, Karte aus der einen MapView mit Marker. Echte Zeiger: Maus-Ziehen
   (unscharf 0 Aufrufe), zwei Touch-Punkte über CDP gleichzeitig, Tastatur
   W+D, Stopp nach Loslassen/blur/visibilitychange/Escape, Abstand ≥ 200 ms
   und ≤ 5/s aus Zeitstempeln. 39 Aufrufe nur in der Attrappe, danach geleert.
   Der Lauf fand: entfernte Dialoge ließen ihre Tastenzuhörer aktiv (mehrere
   Sender je Taste — jetzt `leave` auch in `disconnectedCallback`), ovaler
   Lenkknopf im Querformat, Stopp unter dem Bildrand, Marker am Kartenrand
   abgeschnitten, `display` hob `hidden` der Aktionsknöpfe auf — behoben und
   in den Bildern nachgesehen.
4. Live: **nicht ausgeführt** (Roboter darf nicht bewegt werden); kein
   Aufruf von `vacuum_remote_control_move_step`. Ablauf des ersten
   Kalibrierlaufs im Plan remote, Task 7.

**10.11.2026 · 0.1.0, Modul history (#882, Tasks 1–7, nicht getaggt)**

1. `node --check` grün; `node --test` 435/435 (27 Tests `tests/verlauf.test.js`,
   2 neue in `tests/datenschutz.test.js`).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 54/54, UI-Regeln 0 (Regel 1 Liste, Detail, Bestätigung,
   Cruising; Regel 2 Liste und Cruising als erste Ebene), 0 Konsolen-/
   Seitenfehler, 0 Fremdanfragen, 0 Dienstaufrufe. 9 Ansichten (Liste,
   Gruppe offen, Detail, WLAN-Karte, Hindernisfoto, Bestätigung, Cruising,
   Cruising-Detail, leer) × 360/390/800/1280 × hell/dunkel ohne Überlauf,
   Knöpfe ≥ 44 px; echte Tastatur (Enter, →, Escape mit Fokus zurück). Der
   Lauf fand: `route.fulfill` entpackt gzip nicht (Harness liefert das JSON
   jetzt ungepackt, der gzip-Weg ist in der Attrappe belegt), Symbole rechts
   vom Text in Erneut/Neuer, Startmethode ohne HA-Übersetzung als „app“ —
   behoben und in den Bildern nachgesehen.
4. Live lesend (Nutzer-OK): `/api/states` (Sensorattribute wie `voll.json`,
   30 Läufe, Kamera-URLs mit `v=`), einmal `data=1` sowie PNG Reinigung/WLAN
   des neuesten Laufs; kein Hindernis mit Foto am Gerät, daher kein
   Hindernisfoto-Abruf. Rohdaten gelöscht. „Nochmal reinigen“ live nicht
   ausgelöst (fährt den Roboter).

**10.11.2026 · 0.1.0, Modul clean-settings (#882, Tasks 1–6, nicht getaggt)**

1. `node --check` grün; `node --test` 405/405 (26 Tests `tests/reinigung.test.js`,
   dazu Raum-Symbol-Ebene in `tests/karte.test.js`, Stationsbestätigungen und
   „Zurück zum Dock“ in `tests/station.test.js`, rAF-Drossel in
   `tests/aufgaben.test.js`).
2. `python3 scripts/ui-regeln-pruefen.py --repo ha-busch-vacuum-card`: 0 Verstöße.
3. `render.py`: 51/51, UI-Regeln 0 (Regel 1 für Einstellungen, Raumseite,
   Übertragen-Bestätigung, Reihenfolge; Regel 2 für die erste Ebene),
   0 Konsolen-/Seitenfehler, 0 Fremdanfragen, 0 Dienstaufrufe. 9 Ansichten
   (Einstellungen normal/CleanGenius/Customized, Räume, Raumseite,
   Bestätigung, Reihenfolge strikt/nicht strikt/Antippen) × 360/390/800/1280 ×
   hell/dunkel ohne Seitenüberlauf, Knöpfe und Felder ≥ 44 px. Echte Tastatur
   (Leertaste greift mit Ansage, Pfeile, Leertaste legt ab, Escape bricht ab
   ohne zu schließen) und echtes Mausziehen ergeben dieselbe Liste. Der Lauf
   fand: `NodeList.find` fehlt im Browser (Attrappe liefert Arrays) — jetzt
   `Array.from`; Raumnamen brachen bei 360 px mitten im Wort, der
   Einstellungsknopf quetschte die Aufgabenarten, Symbole standen rechts vom
   Text — behoben und in den Bildern nachgesehen.
4. Live nur lesend (`/api/states`, `/api/services`): Werte und `_list` der
   Grundzeilen wie `voll.json`; Fähigkeiten `cleaning_sequence_v2`,
   `segment_slow_clean_route`, `custom_cleaning_mode`, `wetness_level`,
   `cleaning_route`, ohne `auto_change_mop`/`mop_pressure`/`mop_temperature`;
   Kamera-`rooms` mit Codes als Zahlen (Route 1–2, Modus 0/2) und `order`
   1–7 = `cleaning_sequence` [3, 5, 7, 1, 6, 9, 4]. `services.yaml` nennt
   `cleaning_route` nicht, das Schema (vacuum.py#L677) nimmt es. **Keine
   Schreibprobe** — Raumwert hin/zurück und Reihenfolge tauschen/zurück
   warten auf Nutzer-OK.

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
