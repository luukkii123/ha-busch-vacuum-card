# Busch Vacuum Card

A robot vacuum card for Home Assistant: one card, **`busch-vacuum-card`**.
It aims to offer every function of the Dreame Vacuum Card that ships with
[Tasshack/dreame-vacuum][dreame] — status, control, cleaning tasks, dock,
device settings, history, remote control, map editing — built only on the
integration's public entities, attributes and services and styled like the
other Busch cards.

> **Work in progress.** Version 0.1.0 is a scaffold and not released yet.
> This README grows with each module.

![The card while cleaning](docs/render/baseline/core-0.1.0/karte-cleaning-karte-480-dark.png)
![The main menu on a phone](docs/render/baseline/core-0.1.0/dialog-menu-360x640-light.png)

## Requirements

- Home Assistant 2026.9.3 or newer
- A robot vacuum (`vacuum.*`); Dreame devices through
  [Tasshack/dreame-vacuum][dreame] 2.0 or newer get the full feature set

## Installation

HACS → three dots → *Custom repositories* → this repository, category
*Dashboard*. Then add the card from the card picker (*Busch vacuum*).

## Basic usage

Add the card from the card picker (*Busch vacuum*) and choose your robot
vacuum. That is all it needs: the card finds the device's other entities
(sensors, selects, switches, buttons, map cameras) by itself and shows only
what your device can do.

What you get with the core module:

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
| `hidden_card_objects` | none | Parts to hide: `title`, `state`, `menu`, `status`, `task_type`, `controls`, `action_buttons`, `animations`, `shortcuts`, `cruising_history`, `error_message`, `warning_message`, `info_message`, `low_water_message`, `map_change_confirmation`, `progress_bar`, `dock_status_indicator`. |

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
