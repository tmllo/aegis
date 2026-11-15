# Crew Station redesign (2026-11-15)

Identity kept: warm black, Instrument Serif display, mono labels, status by shape + colour + word.
Goal: cinematic NASA case-study look; overall status readable from 2 m in one second.

## What each reference gives, and where it lands
| Reference | Taken | Lands in |
|---|---|---|
| Cockpit touchscreen (`cockpit-touchscreen-ui.webp`) | glass panels (translucent fill, hairline, top highlight); big light numerals; glowing floor ring under the hero object (the seat render); thin status strip; red-framed physical button block with lamps and "press and hold" | Cabin instruments and console row; Body side panel; floor ring under the body; Cabin emergency block |
| Fuselab cover (`fuselab-astro-kit-project-cover.jpg`) | hollow nodes sitting on a thin orbit | Status markers on the Body orbit ring; nodes on the Cabin gauge rings |
| Fuselab UI (`fuselab-astro-kit-ui-design-2.jpg`) | concentric hairline rings around a centre with items placed on them; 01/02/03 numbered steps with one lit underline; leader + coordinate callouts | Rings around the body (ticks turn with the body); chapter index 01-07 in the Body bar; Cabin air gauge as concentric rings |
| NASA case study (`Screenshot ... 01.23.41.png`) | huge serif headline over a dark cinematic field; small "01 /02" index; small sans subtitle; vertical caption on the right edge | Crew name as the Body headline; section index in the top bar and page heads; vertical disclaimer caption on the right edge of every screen |
| Haze portrait (`Screenshot ... 01.24.11.png`) | warm orange to violet atmospheric colour field | CSS haze behind the body (ember left, violet right) and a matching two-tone fresnel rim on the glass body; faint haze on Cabin |

## Screens
- Body: full-height body as hero; glass shell (two-tone rim), soft additive glow on flagged structures, floor ring.
  Orbit ring with tick marks (rotates with the body turn), leaders that draw in, markers on the ring.
  Tap = camera dives to the structure, the rest dims, focus reticle draws in, glass panel slides in (Esc or Close).
  Bottom bar: chapter index 01-07 (one lit underline) + the one primary action.
- Cabin: hero = air gauge rings (one ring per air reading, limit marks, value node) with big light numerals beside it;
  tanks as glass vessels with limit ticks; dose arc vs career limit; storm forecast as a p_storm timeline over
  watch/warning lines plus a sun disc with the flare positions; model numbers as a light-numeral strip;
  console row: red-framed "Cabin emergency" press-and-hold block + "Replay May 2024".
- Shell: editorial top bar, vertical edge caption, 280 ms fade/rise between routes. Replay restyled to Flight Record tokens.

## Rules kept
All numbers from public/data, public/samples or src/core. Footer keeps every disclaimer and the anatomy credit.
Motion 150-400 ms ease-out, no bounce, off under prefers-reduced-motion. Targets 56 px or more. No new dependencies.
