# e^x design system: Station Glass

One visual language for every surface (Crew Console, Wrist, Ground, Systems). Written 2026-11-15 ~02:40 from the references in `../../docs/design-references/` and the concepts already on `/concepts`. Concepts in `src/concepts/system-*` implement it.

## Summary
| | |
|---|---|
| Direction | A crew display behind glass: deep navy screen set in a dark bezel, light thin numerals, hairlines instead of boxes, colour only for status. |
| References | Cockpit touchscreen (main look), Fuselab Astro Kit (orbital diagram, numbered steps), Linear and Stripe (hierarchy by weight and grey, facts strip, tabular numbers). |
| Memorable element | The orbital Systems view: e^x at the centre, sources and outputs on rings, real events travelling along them. Every other screen stays quiet. |
| Status language | Shape + colour + word, never colour alone. Health and radiation use different words. |

## 1. What each reference gives
| Reference | Take | Leave |
|---|---|---|
| Cockpit touchscreen (`cockpit-touchscreen-ui.webp`) | Navy glass panels in a dark bezel; thin white type; big light numerals; bottom command bar; critical actions as physical-style buttons framed in red | Vehicle terms, logos, the exact layout |
| Fuselab Astro Kit (`fuselab-astro-kit-*.jpg`) | Concentric hairline rings with line icons (Systems view); numbered steps 01-05 with one lit underline (guided flow) | Photo backgrounds, gold on black, tracked capitals |
| Linear, Stripe | Hierarchy from weight and grey level first, size second, colour last; facts strip at the top; small grey labels, strong values | Their brand colours |
| Wide editorial shots (`Screenshot 2026-11-15 ...`) | Scale contrast: one very large value against small quiet text | Serif display type, photography as UI |

## 2. Colour (RGB values; all text passes 4.5:1 on Abyss and Hull)
| Name | Hex | Use |
|---|---|---|
| Bezel | `#0A0B10` | Frame around the screen |
| Abyss | `#050B2E` | Screen background |
| Hull | `#0B1442` | Panels, side columns |
| Glass | `#16215A` | Selected row, pressed state, raised control |
| Hairline | `rgb(110 126 200 / 0.32)` | All dividers and outlines, 1 px |
| Starlight | `#EEF3FF` | Values and primary text |
| Haze | `#9AA8CF` | Labels, secondary text |
| Dust | `#6A76A3` | Tertiary text, axis ticks (large text only) |
| Signal | `#2BDBE3` | The one interactive accent: focus ring, current step, live data on the move. Never decoration |
| Nominal | `#3DDC97` | Health green |
| Caution | `#F5B83D` | Health amber, radiation watch |
| Act | `#FF4D4F` | Health red, radiation warning; critical button frame `#AC2920` |

No gradients as fills. Depth comes from Abyss -> Hull -> Glass steps, not shadows. One soft glow is allowed on the 3D body and on the active orbit node.

## 3. Status words and shapes
| Contract value | Shape | Health word | Radiation word |
|---|---|---|---|
| green / none | circle | Nominal | Quiet |
| amber / watch | triangle | Caution | Watch |
| red / warning | square | Act | Warning |

Shapes are 12 px in rows, 20 px in headers. The word always sits next to the shape. Do not use "Watch" for health.

## 4. Type
Families (bundled): Inter Tight for everything, JetBrains Mono only for units, IDs, timestamps and code paths. Sentence case everywhere; no tracked all-caps labels.

| Role | Size / line | Weight | Family |
|---|---|---|---|
| Hero value (one per screen) | 88 / 88 | 300 | Inter Tight, tabular |
| Key value | 44 / 48 | 300 | Inter Tight, tabular |
| Section title | 28 / 34 | 400 | Inter Tight |
| Row title | 20 / 28 | 400 | Inter Tight |
| Body | 16 / 24 | 400 | Inter Tight, max 60ch |
| Label | 14 / 20 | 400, Haze | Inter Tight |
| Meta | 13 / 18 | 400, Haze | JetBrains Mono |

`font-variant-numeric: tabular-nums` on every number. Units in Mono at 60% of the value size, Haze.

## 5. Space, shape, layout
- Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64. Nothing else.
- Radii: screen 24, panel 12, control 8. A child never has a larger radius than its parent.
- Touch targets: 56 px minimum (gloved hands).
- Frame (1920 x 1080 projector): bezel 10 px; facts strip 76 px; content; command bar 96 px; footer (disclaimers, credits) 13 px Mono, Dust.
- Content grid: 12 columns, 24 px gutters, 48 px outer margin. One focal point per screen, placed on the grid's left two thirds; the right third is the detail column.
- Hairlines over boxes. No card inside a card. Rows, not tiles, wherever data lines up.

## 6. Components
| Component | Rule |
|---|---|
| Facts strip | Label (Haze, 14) above value (Starlight, 20); mission, environment, day, link delay, dose. Never more than 6 facts |
| Crew tile | Initials 28 px in a 72 px square, status shape top right; selected = Glass fill + Signal 2 px bottom edge |
| Metric row | Label, value + unit (right, tabular), 7-day sparkline with personal band (mean +/- 2 sd as a Glass band), status shape. Whole row is the button |
| Step rail | 01-05 numbers in Mono, step name 16 px; current step: Starlight + 2 px Signal underline; done: Haze + check; future: Dust. Horizontal |
| Command button | 56-72 px tall, Glass fill, 1 px Hairline, label names the outcome ("Re-measure", "Send to CMO-DA"). Critical: Abyss fill, 2 px Act frame, square shape icon |
| Link chip | Mono "Earth +11 min" with a 6 px dot: Nominal = link up, Dust = loss of signal |
| Wrist face | 280 px round-cornered square, black, one line of text, status ring; pulses = Signal ring scale 1 -> 1.06 |
| Orbit view | 3 rings (sources, e^x core, outputs) as 1 px Hairline circles; nodes = 40 px line icons; packets = 6 px Signal dots moving along the ring path |
| Charts | Recharts: no grid, 1 px axis in Hairline, ticks in Dust Mono 13, data line Starlight 1.5 px, thresholds dashed in the status colour |

## 7. Motion
| Kind | Duration | Ease |
|---|---|---|
| Press | 100 ms | `cubic-bezier(0.2, 0, 0, 1)`, scale 0.98 |
| State change (colour, shape) | 180 ms | same |
| Panel / step change | 320 ms | `cubic-bezier(0.16, 1, 0.3, 1)`, translate 16 px + opacity |
| Packets on the orbit | 1.2 s per hop | linear |
| Radiation warning | one 600 ms Act frame flash, then steady | ease-out |

Only `transform` and `opacity`. One orchestrated entrance per screen at most. `prefers-reduced-motion`: no movement, state changes as instant swaps, packets shown as a static highlighted path.

## 8. Words
- Labels 1-3 words. Buttons name the outcome. No emojis. No exclamation marks.
- Numbers only from the data files or `src/core`. Never type a figure.
- Mood is a 1-5 scale with words (1 Very low ... 5 Very good), not faces.
- Always visible in the footer: "Simulated crew data, not real astronaut records", "Not medical advice", "NASA does not publish crew self-check thresholds", "Space weather data: NASA CCMC DONKI", anatomy credit.
