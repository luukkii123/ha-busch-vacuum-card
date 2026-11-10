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
- **Task type:** All, Room, Zone, Spot, Go to (choosing rooms, zones and
  points on the map follows in a later update). Locked while a task runs; the
  card shows whether the running task is scheduled or a shortcut.
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
