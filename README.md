# Busch Vacuum Card

A robot vacuum card for Home Assistant: one card, **`busch-vacuum-card`**.
It aims to offer every function of the Dreame Vacuum Card that ships with
[Tasshack/dreame-vacuum][dreame] — status, control, cleaning tasks, dock,
device settings, history, remote control, map editing — built only on the
integration's public entities, attributes and services and styled like the
other Busch cards.

> **Work in progress.** Version 0.1.0 is a scaffold and not released yet.
> This README grows with each module.

## Requirements

- Home Assistant 2026.9.3 or newer
- A robot vacuum (`vacuum.*`); Dreame devices through
  [Tasshack/dreame-vacuum][dreame] 2.0 or newer get the full feature set

## Installation

HACS → three dots → *Custom repositories* → this repository, category
*Dashboard*. Then add the card from the card picker (*Busch vacuum*).

## Configuration

```yaml
type: custom:busch-vacuum-card
entity: vacuum.my_robot
```

| Option | Description |
| --- | --- |
| `entity` | The robot vacuum. Required. Related entities (map camera, sensors, selects, switches, buttons) are found through its device. |

## License

MIT — see [LICENSE](LICENSE).

[dreame]: https://github.com/Tasshack/dreame-vacuum
