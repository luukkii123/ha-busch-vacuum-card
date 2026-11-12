# Busch Vacuum Card

A robot vacuum card for Home Assistant: one card, **`busch-vacuum-card`**.
It offers the functions of the Dreame Vacuum Card for
[Tasshack/dreame-vacuum][dreame] — status, control, cleaning tasks, station,
device and cleaning settings, shortcuts, history, remote control, map editing
and map backups — built only on the integration's public entities, attributes
and services and styled like the other Busch cards.

Version 0.1.0 is the first release. It was checked live on one robot (Dreame
X40 Ultra); see [Known limits](#known-limits) for what is not confirmed on a
real robot yet.

![The card while cleaning](docs/render/baseline/core-0.1.0/karte-cleaning-karte-480-dark.png)
![The main menu on a phone](docs/render/baseline/core-0.1.0/dialog-menu-360x640-light.png)

## Requirements

- Home Assistant 2026.9.3 or newer
- A robot vacuum (`vacuum.*`); Dreame devices through
  [Tasshack/dreame-vacuum][dreame] get the full feature set (checked with
  version 2.0.3). Other vacuums get status, controls and what their entities
  offer.
- For map backups and restore: the integration's cloud login.

## Installation

HACS → three dots → *Custom repositories* → `https://github.com/luukkii123/ha-busch-vacuum-card`,
category *Dashboard* → download. HACS registers the resource
`/hacsfiles/ha-busch-vacuum-card/busch-vacuum-card.js` itself; reload the
browser afterwards. Then add the card from the card picker (*Busch vacuum*).

## Basic usage

Add the card from the card picker (*Busch vacuum*) and choose your robot
vacuum. That is all it needs: the card finds the device's other entities
(sensors, selects, switches, buttons, map cameras) by itself and shows only
what your device can do.

On the card:

- **Head:** name and state (in Home Assistant's language), cleaned area,
  cleaning time and battery (charging, low, charging to resume).
- **Live map** (when the device has a map camera): the current map with
  robot, station, room names with cleaning order, carpets, no-go and no-mop
  zones, virtual walls, thresholds, obstacles and more. Zoom and move with
  fingers, mouse wheel, keys (`+`, `-`, `0`, arrows) or the buttons on the
  map; a room chip below the map brings its room into view. Tap an obstacle
  for its details, photo and *Ignore*. *Map info* shows size, scale and
  calibration and picks robot coordinates. With several floors, *Choose
  floor* changes the map after a confirmation.
- **Task type:** All, Room, Zone, Spot, Go to (see *Tasks* below). Locked
  while a task runs; the map then shows the running targets, and the card
  says whether the task is scheduled or a shortcut.
- **Controls:** Clean, Pause, Resume, Stop, Return — depending on the state.
  The station status sits next to them and turns orange or red with a
  written reason.
- **Messages:** errors, warnings, info and low water; dismiss a message until
  it changes; clear a warning when the device allows it.
- **Menu:** Locate, plus the views your device supports (history, cruising
  history, accessories with a badge below 30 %, cleaning sequence, remote
  control, map management, device settings).
- Works in the normal dashboard and in a **panel view** (edge to edge, full
  height), with light and dark themes, in German and English.

## Configuration

Everything can be set in the visual editor; YAML is optional.

```yaml
type: custom:busch-vacuum-card
entity: vacuum.my_robot
```

| Option | Default | Description |
| --- | --- | --- |
| `entity` | — | The robot vacuum. Required. |
| `title` | device name | Heading of the card. |
| `scripts` | none | Scripts the shortcut menu offers ahead of the device shortcuts. |
| `full_height` | `false` | Fill the visible height below the Home Assistant header. |
| `aspect_ratio` | none | Fixed shape, e.g. `16:9`, `4/3` or `1.5` (not with `full_height` or in a panel). |
| `max_height_offset` | `0` | Pixels taken off the largest card height. |
| `left_handed` | `false` | Action buttons on the left, station status on the right. |
| `locked` | `auto` | When the map starts locked: `auto` (touch devices outside a panel), `only_touch`, `never`, `always`. |
| `touch_lock` | `200` | Hold time in ms (100–400) to toggle the lock. |
| `disable_haptic` | `false` | No vibration on taps. |
| `hidden_card_objects` | none | Parts to hide: `title`, `state`, `menu`, `status`, `task_type`, `controls`, `action_buttons`, `animations`, `shortcuts`, `cruising_history`, `error_message`, `warning_message`, `info_message`, `low_water_message`, `map_change_confirmation`, `progress_bar`, `dock_status_indicator`, `map_editor`. |

Hiding `map_change_confirmation` changes maps without asking first.

### Map

| Option | Default | Description |
| --- | --- | --- |
| `map_display` | `standard` | `standard` (rooms in their own colours) or `floor_plan` (one tone with outlines). |
| `color_scheme` | `auto` | `auto` (follows the light/dark theme), `light`, `dark`, `grey`. |
| `icon_set` | `busch` | `busch` (own icons) or `material` (`mdi:` icons). |
| `hidden_objects` | none | Map objects to hide: `rooms`, `cleaning_settings`, `blocked_rooms`, `robot`, `charger`, `station_status`, `router`, `path`, `carpets`, `detected_carpets`, `deleted_carpets`, `furnitures`, `no_go_areas`, `no_mopping_areas`, `virtual_walls`, `passable_thresholds`, `impassable_thresholds`, `ramps`, `curtains`, `predefined_points`, `obstacles`, `stains`, `pets`. |
| `override_colors` | none | Own colours for `floor`, `wall`, `room`, `carpet`, `no_go`, `no_mop`, `virtual_wall`, `path`, `robot`, `charger`; the same keys under `dark:` apply in the dark scheme. |
| `map_config` | none | Per floor, keyed `map_<index>` (the floor's index in `maps`): `rotation` (0/90/180/270, display only), `scale`, `opacity`, `object_scale`, `object_opacity`, `font_size` (12), `crop` (`top`/`right`/`bottom`/`left` in percent), `background_image` and `overlay_image` (`url`, `x0`, `y0`, `x1`, `y1` in robot millimetres from *Map info*), `hidden_objects`. |

```yaml
type: custom:busch-vacuum-card
entity: vacuum.my_robot
color_scheme: grey
override_colors:
  robot: "#2e7d32"
  dark:
    floor: "#1f2a33"
map_config:
  map_1:
    rotation: 90
    font_size: 14
```

The map uses the integration's map data when available (exact room taps,
own colours); otherwise it shows the integration's map picture, where only
`grey` changes its colours and objects drawn into the picture stay visible.

## Device settings

The menu entry *Device settings* opens every setting of the device in groups
— cleaning, mopping, carpet, station, camera and AI, audio, do not disturb,
schedules, battery, consumables, device info, other — with a search over all
of them. Each row reads the vacuum's attribute or, where the integration
offers none, the entity's state (also for entities that stay disabled, as
long as the vacuum reports the value); a value the device does not report is
shown as *unknown*, never guessed. Changes go through the integration's
services (`dreame_vacuum.vacuum_set_property`, `vacuum_call_action`,
`vacuum_reset_consumable`, `vacuum_install_voice_pack`) and count as done
only once the device reports the new value.

- **Do not disturb:** the period's start and end, on/off — like the Dreame
  app, without weekdays. Adding and deleting periods only on devices that
  already report several (the X40 accepts one).
- **Schedules:** time, days (none = once), on/off, delete with confirmation.
  The integration hands schedules out only parsed, so saving rewrites all of
  them from what it reports; details of the Dreame app beyond that are lost.
  New schedules copy the cleaning settings of an existing one — create the
  first schedule in the Dreame app.
- **Consumables** (also its own menu entry): remaining percent and time per
  part, reset with confirmation (only below 100 %), totals.
- **Voice pack:** install a pack from its URL, MD5 checksum and size (the
  integration has no catalogue).
- **Camera light, automatic:** set through the brightness setting the way the
  integration's own switch describes it (brightness 101).
- Map rotation and map selection ask before they change the robot's map.

## Station

The station button next to the controls shows the station's state (colour
and text) and opens a menu with what the station can do right now: wash the
mop (pause/resume while washing), start or stop drying, dry the dust bag (if
the station has it), empty now, return to the station (only while away) and
*Station settings*. Hide the button with `hidden_card_objects:
dock_status_indicator`; the settings stay reachable through *Device settings
→ Station*.

*Station settings* lists every station value (problems open on top, the rest
folded away), the settings in the tabs *Washing*, *Drying* and *Emptying*
(only the tabs the station has; the last tab is remembered per browser) and
*Maintenance*: drain water, empty the water tank, self-repair (these three
ask first), clean the station and re-clean. A setting the integration does
not allow right now says why (for example the water temperature while smart
mop washing chooses it). Every action goes through
`dreame_vacuum.vacuum_call_action`, every setting through
`vacuum_set_property`, so disabled station entities stay usable.

## Tasks

Choose the task type above the buttons; the map follows it.

- **All** cleans every room with the saved settings and order (`vacuum.start`).
- **Room:** tap rooms on the map or their chips below it (Ctrl/Cmd+click
  toggles, Shift+click picks a range), *Select all* or *Clear selection*
  (with *Undo* for 5 s). The badges show the order. Robots with Customized
  Cleaning (e.g. X40) clean in their saved cleaning sequence, not in the
  tapped order — the card says so and sends each room's own settings.
- **Zone:** tap the map (1.5 × 1.5 m), drag a rectangle, tap a carpet or a
  piece of furniture for its outline, or use *Add area*. Drag an area to move
  it, drag a corner to resize it, × removes it. Without dragging: the area
  list below the map with arrow buttons (100 mm, Shift 500 mm), *Width ±*,
  *Height ±*, *Remove*, and keys (arrows move, Alt+arrows resize, Delete
  removes, Escape deselects).
- **Spot:** each tap sets a point cleaned 1.5 × 1.5 m around it; *Point at
  robot position*, arrow buttons and keys as for areas. *Spot here* in an
  obstacle's details sets a point there without starting.
- **Go to:** tap a target or a saved target point; the bubble *Go here* at
  the bottom of the map starts it (there is no Clean button for this type).
  Without tapping: *Target at map centre*, arrows, Enter jumps to *Go here*.
  Robots without native cruising reach the target as a small zone cleaning
  with briefly switched settings; the card says so.
- **Repeats** 1–3 for room (without Customized Cleaning), zone and spot. The
  value is not remembered on purpose: a remembered 3× would clean three times
  unnoticed.

Start calls exactly one service: `dreame_vacuum.vacuum_clean_segment`,
`vacuum_clean_zone`, `vacuum_clean_spot` or `vacuum_goto`, in whole robot
millimetres. Targets the integration would refuse cannot be started, and the
card says why (nothing chosen, outside the floor, area too small, station
draining, rooms without a saved map, target next to the robot). A service
error shows its reason and keeps your selection. After a task ends by
itself the card goes back to *All*; after your own Stop it keeps the
selection. Patrols along several points (`vacuum_follow_path`) are not part
of the reference card and not offered.

## Cleaning settings

*Settings* next to the task types opens the cleaning settings with what the
robot allows right now; a locked row says why (task running, CleanGenius,
Customized Cleaning, no saved map). The button is hidden while a scheduled,
shortcut or CleanGenius task runs, and with `hidden_card_objects: task_type`.

- **CleanGenius** on/off and its mode (mode only while CleanGenius is on).
  While CleanGenius cleans, it picks the values per room itself.
- **Basics:** cleaning mode, suction, mop pad humidity, wetness (1–32),
  water volume, route and mop pressure — each a row of the device settings
  (`dreame_vacuum.vacuum_set_property`, the value counts once the robot reports
  it) — and *Repeats* 1–3, the same row as in the task panel.
- **Customized Cleaning:** the switch and *Room settings*: rooms in cleaning
  order with their values; a room's page has exactly the fields the robot
  takes (suction, wetness or water, passes, mode, route or mopping route, mop
  pressure/temperature, mop type A/B/C with auto mop change). Each change
  sends that room with all its values (`vacuum_set_custom_cleaning`, mop type
  `vacuum_set_mop_type` without `map_id`). *Apply to all rooms* asks first,
  then writes room by room and stops at the first error.
- **Cleaning sequence** (also in the menu): drag the grip (touch: hold
  300 ms), use ↑/↓/*Move to the top*, the keyboard (Space grabs and drops,
  arrows move, Escape cancels) or *Tap in order*. *Save* sends the list once
  (`vacuum_set_cleaning_sequence`); an unsaved draft stays until you discard
  it. Robots with a strict sequence (X40) always give every room a place;
  others can leave rooms without order or turn the sequence off (with Undo).
- *More cleaning settings* opens *Device settings → Cleaning*.

## Shortcuts

The *Shortcuts* button (ahead of the station button) appears once there is
something to start: scripts from the option `scripts` (listed first) and the
shortcuts saved on the device (in the order of the Dreame app). A tap starts
the entry at once — `script.turn_on` or `dreame_vacuum.vacuum_start_shortcut`
— also while a task is running; the card never stops or pauses that task
first, the robot decides. While the station drains water no shortcut starts.

*Manage* (also under *Device settings → Other*) lists the device's shortcuts
to start, rename and delete (with confirmation), and *Reload* fetches them
from the device again. Shortcuts are created and edited (rooms, order,
settings) only in the Dreame app; the integration offers no service for that.
Hide the button with `hidden_card_objects: shortcuts`. A configured script
that Home Assistant does not know is left out, and the editor names it.

## History

*Cleaning history* in the menu lists the last runs the integration keeps (up
to 30, loaded from the Dreame cloud — without a cloud connection the list is
empty): newest first, date and time as Home Assistant shows them, status,
area and duration in your units, and a status mark with symbol and word —
*Done*, *Notice* (blocked rooms or an interrupt reason) or *Interrupted*. A
cleaning and its re-cleaning form one group with their sums (tap or `+`/`−`
to open it); the line on top sums area, time and count.

A run opens its details: area, duration, suction, mop/water tank, cleaning
type, interrupt reason, pet, and — once the run's data has loaded — start
method, emptying and mop-wash counts; blocked rooms with their reason; the
map of the run (cleaning map, or the WiFi map when the robot recorded one)
with its path, zoom buttons and the run's obstacles (photo and download when
the robot reported one; old obstacles cannot be ignored). *Newer*/*Older* or
←/→ turn the pages; Back returns to the list where you left it. Only the
open run is fetched, once (`/api/camera_history_map_proxy/…&data=1`).

For the newest run with blocked rooms, *Re-clean* lets you pick the rooms:
all of them start the robot's own re-cleaning (`start_recleaning`, the same
as the station action); a part starts a new room cleaning of just those
rooms (it appears as a new run). Both ask first and name the rooms; locked
while a task runs or when the run was on another map.

*Cruising history* (robots with cruising) works the same with duration,
cruising type and map, without area sums or re-cleaning. Hide its menu entry
with `hidden_card_objects: cruising_history`.

## Remote control

*Remote control* in the menu (robots with the integration's
`vacuum_remote_control_move_step` service) drives the robot by hand, for
example out from under a bed.

> **Safety:** every input moves the robot. The view opens **unarmed**; only
> *Start control* lets the sticks and keys through, anew on every opening.
> Reversing has no collision guard. Letting go stops at once — so do losing
> the window focus, switching tabs, leaving the view, a service error, no
> answer within 2 s and a lost connection. If the connection is lost, the
> stop may not arrive: stop the robot with its button or in the Dreame app.

- Two sticks, usable at the same time with two fingers: speed (vertical) and
  steering (horizontal), a dead zone in the middle; on phones held sideways
  they sit at the screen edges around the map. Left-handed (`left_handed`)
  swaps them.
- Hold buttons ▲ ▼ and turn left/right drive at 50 % while pressed; *Stop*
  stops. *Precision* halves speed and turning.
- Keyboard: `W`/`↑` forward, `S`/`↓` back, `A`/`←` left, `D`/`→` right
  (combinable), `Shift` slower, `Ctrl` slower turning (`Ctrl+W`/`Ctrl+S`
  stay with the browser), `Space` stop, `Escape` stop and back.
- The live map shows the robot's position and heading; *Resume* (a paused or
  started task) and *Return to dock* (when not docked) appear by state.
- At most one call is under way; the next follows its answer, at least
  200 ms later (≤ 5 per second), always with the newest value. Limits: forward
  100, backward −100, turning ±128.
- **Not calibrated yet:** these limits are conservative values from the
  integration's service description. Top speed, turning direction and the
  stop after letting go have not been measured on a robot yet.

## Map editing

Robots whose integration offers the map services get a pen on the map
(*Edit map*) and a *Map management* entry (multi-floor maps).

- **Map management:** every saved map with a preview; switch, rename or
  delete a map, start a new mapping run, save/discard/replace a temporary
  map, ask the robot for a fresh map.
- **Edit mode:** the map moves into the dialog with a tool bar — rooms
  (name, type, visibility, floor; split and merge two rooms), walls and doors
  (move, reset), no-go/no-mop zones and ramps, virtual walls, thresholds and
  curtains, carpets (own and detected ones: shape, type, cleaning, hide),
  furniture, target points (cruising) and the router on the WiFi map. Draw
  and drag on the map, or type the coordinates in millimetres; the arrow keys
  move the chosen object. Tools appear only when your device supports them.
- A tap on a carpet or a piece of furniture opens its bubble with *Edit*,
  which jumps straight into the right tool.

> **Safety:** nothing changes on the robot without your confirmation. *Save*
> first lists what changes (for example "No-go zones: 1 new, 0 changed,
> 0 deleted") and the map; only *Confirm* sends it, and a click beside the
> dialog does not. Before the **first** change of an editing session the card
> backs up the map on the robot (`vacuum_backup_map`) and waits until the
> backup has succeeded — if it fails, nothing is changed. Leaving with
> unsaved changes asks first. Nothing can be edited while a task runs or a
> temporary map is open.

- **Undo:** after saving, *Undo* sends the previous state back (again with
  a confirmation). Splitting, merging and deleting cannot be undone this
  way — the backup made before the first change is the way back: restore it
  under *Backups* (below).
- **Limits of the integration:** low-lying areas are shown, not edited;
  zones and ramps cannot be rotated; walls and doors can be moved, not added
  or removed; merging takes two rooms at a time.
- Hide all map editing (pen, map management, *Edit* in the bubble) with
  `hidden_card_objects: map_editor`.

## Map backups

The states the robot and the cloud keep of a map — *Original map* (first
mapping), *Edited map* and *Backup map* — open from *Backups*: in every row of
*Map management* and in the edit mode (for the active map). It appears only
when the map has states or your device can back up or restore.

- **List:** type (symbol and name), date and number of each state, the status
  of backup and restore.
- **Full screen:** *View* shows a state with zoom (buttons, wheel, two
  fingers, double tap, `+`/`-`/`0`), previous/next (also the arrow keys) and
  the *Current map* first to compare. A state is fetched from the cloud only
  when you open it.
- **Back up now:** makes a backup of the active map in the cloud after a short
  confirmation; when a backup exists it may replace it (the confirmation says
  so).
- **Restore:** replaces the stored map (rooms, names, zones, carpets,
  furniture, order, room settings) with the chosen state — only after a
  confirmation that names map, state and consequence; a click beside it does
  not. *Back up the current state first* is preselected when there is no
  backup yet; restoring the backup state itself makes no backup before (it
  could replace exactly that state). Only for the active map, and only while
  the robot neither runs nor is paused — also not paused in the station (the
  integration refuses it then; stop the task first). While a restore runs,
  editing, choosing a task and further restores are locked.
- **Room settings after a restore:** the device resets the cleaning settings
  of every room (suction, wetness, passes, mode, route) to its defaults and
  recalculates the room borders. The confirmation says so. The card remembers
  each room's values before the restore and then offers *Restore room
  settings*: after a confirmation with the remembered values it writes them
  back room by room (`vacuum_set_custom_cleaning`), stops at the first error
  and names the rooms done. The card keeps these values only while the page
  stays open.
- **Download:** the raw map file (`.mb.tbz2`). It contains your floor plan —
  do not share it.
- **Advanced — restore from file URL:** a map file at a URL Home Assistant can
  reach (for example `/local/…` with the full address); the integration
  offers no upload from the browser. Same confirmation as above.
- Restoring needs the integration's cloud login; without it the card says so
  and the list stays viewable.
- Backup and restore were run on a real robot through the integration's
  services; the card's own buttons for them, the write-back of the room
  settings and how many backups a device keeps per map are not confirmed on
  a real robot yet.

## Known limits

Checked live on one robot, a Dreame X40 Ultra with integration 2.0.3: status,
map, history and every setting read and compared with the device; written
back were the child lock, one schedule, one map backup, one room rename (and
back) and one restore. Other models show what their attributes and entities
report.

**Not confirmed on a real robot yet** (tested with synthetic data against the
integration's services):

- Remote control: top speed, turning direction and the stop after letting go
  (shipped with conservative limits, not calibrated).
- Starting each task type from the card (room, zone, spot, go to), *Re-clean*
  from the history, changing the map, ignoring an obstacle.
- Station actions (wash, dry, empty, drain, self-repair, station cleaning) and
  the remaining device and cleaning settings that were not written live.
- Shortcuts, furniture, target points and several floors: the checked robot
  reports none, so these are tested with synthetic data only.
- Map editing: saving a change (for example a no-go zone) and *Undo*.
- Map backups: *Back up now* and *Restore* from the card, *Restore room
  settings*, and how many backups a device keeps.
- Installing a voice pack and resetting a consumable.

**Limits of the integration** (no public way to do more):

- Low-lying areas are shown, not edited; zones and ramps cannot be rotated;
  walls and doors can be moved and reset, not added or removed; merging takes
  two rooms at a time.
- Schedules are saved from what the integration reports; a new schedule needs
  an existing one (create the first one in the Dreame app). Do not disturb has
  no weekdays; the X40 takes one period.
- Shortcuts are created and edited only in the Dreame app.
- A map file cannot be uploaded from the browser (restore from a file URL
  instead). A restore resets the room settings (see above) and is refused
  while the robot runs or is paused.

## Theming

The card follows your Home Assistant theme. These optional theme variables
change its colours only:

| Variable | Used for | Falls back to |
| --- | --- | --- |
| `bvc-accent-color` | chosen task type, progress bar | `primary-color` |
| `bvc-warning-color` | warnings, station warning, accessory badge | `warning-color` |
| `bvc-error-color` | errors, station error, low battery | `error-color` |
| `bvc-success-color` | battery charging | `success-color` |
| `bvc-info-color` | info messages | `info-color` |

```yaml
my_theme:
  bvc-accent-color: "#2e7d32"
```

## License

MIT — see [LICENSE](LICENSE).

[dreame]: https://github.com/Tasshack/dreame-vacuum
