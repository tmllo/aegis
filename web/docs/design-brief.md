# e^x design brief

Source: the five files in `../../design-references/`, `~/.claude/design-references.md`, BUILD-KICKOFF section 5, plus web references (all URLs returned HTTP 200 on 2026-11-15).

How to read the values: hex marked **sampled** was measured from the reference pixels; **proposed** is a token derived for e^x; **by eye** is an estimate. Font names for the references are identified by eye, not confirmed by any source.

## Summary

| Decision | Value |
|---|---|
| Base | Deep navy, never black. Cockpit reference sets the whole app's look |
| Accent | One interactive accent (cyan). Green / amber / red are reserved for status only |
| Type | One sans family, light weight for big numerals, small uppercase labels |
| Memorable element 1 | Translucent body with glowing regions, the centre of the Crew Console |
| Memorable element 2 | Orbital system map (hairline rings, line icons, packets travelling) on Systems |
| Flow pattern | 01 / 02 / 03 numbered steps, one lit underline: Detect, Notify, Verify, Escalate |
| Motion | 120-300 ms ease-out for UI; slow loops only for live data (packets, pulse, alarm) |
| Warm palette | Orange/violet portrait: landing and alarm/solar moments only, never in the working UI |

## 1. Palettes

### 1.1 Core UI (from `cockpit-touchscreen-ui.webp`)

| Token | Hex | Origin | Use |
|---|---|---|---|
| `--bg-0` | `#020838` | sampled (panel base) | App background |
| `--bg-1` | `#070D3D` | sampled | Bottom strip, rails |
| `--bg-2` | `#11194A` | sampled (most common panel tone) | Raised panel, readout strip |
| `--bg-3` | `#243267` | sampled (lit centre of radial glow) | Hover, active tab fill, glow centre |
| `--bezel` | `#101114` | sampled (frame around screens) | Wrist bezel, device frames only |
| `--line` | `#505EAC` | sampled (hairlines, rings) | 1 px borders at 40-60% opacity |
| `--text-1` | `#F8FCFD` | sampled (numerals) | Values, headings |
| `--text-2` | `#7C8CB4` | sampled (status strip text) | Labels, secondary |
| `--text-3` | `#5D5E6A` | sampled | Disabled, planned devices |
| `--accent` | `#2BDBE3` | sampled (trajectory, active icons) | Selection, focus ring, data packets, links |
| `--ok` | `#3DDC97` | proposed (cockpit green readouts, by eye) | Green status |
| `--warn` | `#F5B83D` | proposed | Amber status |
| `--crit` | `#FF4D4F` | proposed, brighter than the sampled `#AC2920` button frame so it holds on navy | Red status, alarm frame |
| `--crit-frame` | `#AC2920` | sampled (emergency button outline) | Outline of hold-to-confirm actions |

Background treatment: a soft radial gradient `--bg-3` to `--bg-0` behind the focal object (body, Sun, system map), flat `--bg-0` elsewhere. No starfield, no photos in the working UI.

Status colours: glow, 1 px ring, numeral tint and a 6-8 px dot. Never large filled blocks. Misses and false alarms in the replay get their own neutral colour (`--text-2` outline) so they do not read as status.

### 1.2 Fuselab Astro Kit (`fuselab-astro-kit-*.jpg`)

| Colour | Hex | Note |
|---|---|---|
| Page | `#141213` | sampled, warm near-black |
| Lower section | `#0F0E0F` | sampled |
| Gold accent | `#937349` | sampled (active step, links, button) |
| Ring hairline | white at about 8-12% | by eye |
| Sky blues | `#0F95CE`, `#035CBD` | sampled from the galaxy render |

Do not adopt this palette (kickoff rule). Take the structure only; redraw it in the navy tokens with `--accent` in place of gold.

### 1.3 Editorial screenshot ("Creating The Feature.")

| Colour | Hex | Note |
|---|---|---|
| Darkened photo field | `#1B1913` to `#2E2F24` | sampled, olive-black overlay about 55-65% |
| Headline | `#FFFFFF` | by eye |
| Sky grey | `#5E6364` | sampled |

### 1.4 Astronaut portrait (warm orange / violet)

| Colour | Hex | Note |
|---|---|---|
| Orange | `#F09F55` | sampled, lower left |
| Amber | `#EEAA50` | sampled |
| Coral | `#E1805A` | sampled |
| Rust | `#8D4921` | sampled, skin shadow |
| Mauve | `#835355` | sampled |
| Dusty violet | `#A6757E` | sampled, lower right haze |

Use as one gradient `#F09F55 -> #E1805A -> #A6757E` at 135 degrees for: landing hero wash, the Sun and flare glow in the replay, and the full-screen SEP banner wash. It is the only warm thing in the product, so it reads as "solar event".

## 2. Type

| Reference | Family (by eye) | Sizes seen (px in a ~780 px wide screen) |
|---|---|---|
| Cockpit | Geometric rounded sans, light to regular | Numerals 44-52 light; units 60% of numeral; titles 18-20; labels 9-10 uppercase; body rows 12-13 |
| Editorial | High-contrast serif close to Playfair Display Bold; sub-copy close to Open Sans | Headline about 150 on a 2096 px frame (7% of width), line-height 1.15; index "01" 32 with "/02" superscript 12 |
| Fuselab page | Avenir-like geometric sans; cover uses a slab serif title | H2 26-28; body 15-16; step labels 11-12 uppercase tracked; step numbers 12 |

e^x scale for 1920x1080 (projector, tablet at arm's length):

| Role | Size / line | Weight | Notes |
|---|---|---|---|
| Hero numeral | 72 / 72 | 300 | One per view (the metric in focus) |
| Numeral | 40 / 44 | 300 | Unit at 55%, `--text-2`, baseline aligned |
| Title | 24 / 28 | 500 | View and panel titles |
| Body | 16 / 24 | 400 | Explanations, max 60-75ch |
| Row | 14 / 20 | 400 | Lists, feed rows |
| Label | 12 / 16 | 500 | Uppercase, tracking 0.04em (not wide-tracked), `--text-2`, 1-3 words |
| Step index | 12 / 16 | 500 | "01", tabular |

- Family: one bundled OFL sans with a true Light weight (Geist or Inter are safe choices; self-host woff2 in `public/fonts`, no runtime request). Fallback stack `ui-sans-serif, system-ui`. This is a recommendation; the scaffold owner decides.
- `font-variant-numeric: tabular-nums` on every number.
- Serif (Playfair Display class): landing headline and the 01 / 02 index only, if at all. Never inside the working UI.
- Hierarchy order: weight and grey level, then size, then colour.

## 3. Spacing and layout

| Item | Value |
|---|---|
| Base unit | 8 px (4 px for optical nudges) |
| Scale | 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Grid | 12 columns, 24 px gutter, 32 px outer margin at 1920 |
| Radius | 2 px controls, 4 px panels, 24 px only on the outer screen frame corner (cockpit signature). Child radius never above parent |
| Borders | 1 px `--line` at 40-60%. Hairlines over boxes; no shadows, no card stacks |
| Touch target | 64 px minimum for primary crew actions (gloves), 48 px absolute floor, 12 px minimum gap between targets |
| Navigation | Bottom icon bar plus thin status strip, as in the cockpit: arms rest low, primary navigation at the bottom edge |
| Top strip | Labelled facts in one row (environment, mission day, link delay, dose), label above value |
| Focal split | Body or map takes 55-60% of width; one detail panel beside it; nothing else competes |

Astronaut ease-of-use rules: one primary action per view; state readable in under 2 seconds from colour plus one numeral; steppers with large minus / plus squares (cockpit audio panel) instead of sliders or typing; destructive or escalating actions are red-framed and press-and-hold.

## 4. Motion language

| Token | Duration | Easing | Use |
|---|---|---|---|
| `press` | 80-120 ms | `cubic-bezier(0.2, 0, 0, 1)` | Tap feedback: scale 0.97, fill to `--bg-3` |
| `state` | 180 ms | `cubic-bezier(0.2, 0, 0, 1)` | Hover, tab underline slide, status colour change |
| `panel` | 240-300 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Detail panel in, step change, ring focus |
| `camera` | 600-800 ms | `cubic-bezier(0.65, 0, 0.35, 1)` | 3D body focus on a region (the one long move, interruptible) |
| `count` | 300-400 ms | ease-out | Numeral roll when a value changes |
| `packet` | 1.2-2.4 s per hop, linear | linear | Data packets on the Systems rings and links; speed encodes link delay |
| `pulse-amber` | 2 s loop | ease-in-out | Region glow opacity 0.55 to 1 |
| `pulse-red` | 1 s loop | ease-in-out | Region glow and alarm frame |
| `stagger` | 30-40 ms per item, max 6 items | as `panel` | First paint of a view only |

Rules: animate `transform` and `opacity` only; never `transition: all`; everything interruptible; green never pulses; no motion on frequent or keyboard-driven actions; `prefers-reduced-motion` drops to opacity or static (packets become static dots, pulses become steady glow).

Micro-interactions worth building: underline that slides between steps 01-04; ring that draws once (stroke-dashoffset, 600 ms) when the Systems view opens; numeral roll on re-measure; region outline that tightens on hover before selection; corner brackets that snap onto the selected body region; packet that changes colour when it carries an amber or red event; hold-to-confirm ring filling over 800 ms.

## 5. Signature elements per reference

| Reference | Take | How in e^x |
|---|---|---|
| Cockpit: radial instrument | Concentric rings, tick brackets, a crosshair centre, readouts placed on the ring | Frame around the 3D body: ring with region readouts at their body height, leader lines to the organ |
| Cockpit: translucent seat renders | Glassy, lit-from-within 3D on navy with a soft floor ring | Body material: translucent shell, fresnel edge, regions glow from inside; selection ring on the floor under the body |
| Cockpit: readout strip | Label above, light numeral, unit smaller, minus / plus squares below | Metric panel and check-in stepper |
| Cockpit: bottom bar | Five line icons, 2 px underline on the active one, status strip to the right | Global navigation between Crew, Radiation, Systems, Ground |
| Cockpit: top facts row | Uppercase label, value below, evenly spaced | Mission header |
| Cockpit: left phase rail | Vertical step list, active one boxed with an accent underline | Guided flow on narrow layouts |
| Cockpit: red-framed button group | Thin red outline groups the emergency actions | Escalate / contact CMO block only |
| Cockpit: globe with cyan arc | One bright path on a quiet object | Link path Earth to craft on Ground; flare-to-craft path in the replay |
| Fuselab: orbital diagram | 5 hairline rings, line icons on rings, mark in the centre, one item lit in the accent | Systems map: e^x core centre; ring 1 adapters, ring 2 devices, ring 3 outputs (crew, wrist, handoff, link queue, Ground); packets travel along rings and spokes from real bus events |
| Fuselab: 01 / 02 / 03 steps | Dim numbers and icons, the active column lit with an underline and a vertical hairline | Detect, Notify, Verify, Escalate; horizontal |
| Fuselab: annotation brackets | Corner brackets and a leader line with a coordinate label on the asteroid | Callout on a body region: brackets, hairline leader, value label |
| Fuselab: side list | Stacked items separated by hairlines, active one with a top rule | Crew switcher and device list |
| Editorial: headline and index | Very large type with one short line under it; "01 /02" index top left; vertical caption on the right edge | Landing only: positioning line large, index for sections, vertical caption for the data credit |
| Portrait: colour wash | Orange to violet haze over a face in a helmet | Landing hero and solar-event moments (section 1.4) |

## 6. Avoid

- Dashboard grids of equal cards; KPI tile rows; more than one focal object per view.
- Pills, chips and badges as decoration; rounded-everything; drop shadows; glassmorphism blur panels.
- Black backgrounds, starfields, nebula photos, gold-on-black, wide-tracked all-caps (kickoff rule on Fuselab).
- Sci-fi noise: scanlines, glitch, fake telemetry, spinning rings that carry no data.
- Status colour used for anything that is not status; more than one accent; gradients in the working UI apart from the radial navy glow.
- Paragraphs in panels; labels over 3 words; text under 12 px.
- Celebration effects, gamified sparkle, emojis, cartoon body, skin-tone or gore anatomy.
- NASA, CSA, ESA or SpaceX logos, names, vehicle terms, or layouts copied one to one.
- Hardcoded numbers in mock-ups; every figure comes from `public/data/*.json` or core.
- Motion over 300 ms on taps; bounce or elastic easing; autoplay loops unrelated to live data.
- Sliders and small close icons (gloves); hover-only information.

## 7. Web references

### Anatomical 3D health UI

| Reference | URL | Take |
|---|---|---|
| BioDigital Human | https://human.biodigital.com/ and https://www.biodigital.com/product/the-biodigital-human | Click a structure to select, the rest fades; labels on leader lines; conditions shown on the body itself. Their page states 14,000+ structures and 600+ conditions |
| Elsevier Complete HeartX (Apple Vision Pro) | https://www.elsevier.com/products/complete-heartx | One organ as hero, lit and translucent, condition shown as change in the organ, minimal chrome around it |
| Siemens Healthineers Cinematic Anatomy | https://www.siemens-healthineers.com/perspectives/cinematic-anatomy | Lighting quality target for translucent tissue; clip and rotate as the only controls |
| Human Reference Atlas exploration UI | https://portal.hubmapconsortium.org/ccf-eui | Body in the centre, filters left, results right; 3D reference organs (CC BY 4.0, allowed by the kickoff) |
| BodyParts3D | https://lifesciencedb.jp/bp3d/ | Allowed model source per kickoff; credit in footer if used |

### System and data-flow maps with motion

| Reference | URL | Take |
|---|---|---|
| Vercel, Life of a request | https://vercel.com/blog/life-of-a-vercel-request-what-happens-when-a-user-presses-enter and https://vercel.com/docs/how-vercel-cdn-works | One request followed through named stages in order; each stage one node, one sentence |
| Magic UI Animated Beam | https://magicui.design/docs/components/animated-beam | Gradient segment travelling along an SVG path between two nodes; technique for packets (reimplement in plain SVG, no new dependency) |
| React Flow animated edges | https://reactflow.dev/examples/edges/animating-edges | A dot moving along an edge with SVG `animateMotion`; reference for the technique only |
| Stripe globe | https://stripe.com/blog/globe | Arcs that draw and fade on a quiet sphere; restraint in colour count |
| GitHub globe | https://github.blog/engineering/how-we-built-the-github-globe/ | Live events as arcs, performance budget thinking for WebGL |
| Linear UI redesign | https://linear.app/now/how-we-redesigned-the-linear-ui | Hierarchy from grey levels, 1 px borders, one accent |

### Fuselab and cockpit context

| Reference | URL | Take |
|---|---|---|
| Fuselab, Astro Kit - NASA | https://fuselabcreative.com/our-projects/astro-kit | Their stated aims: UI "as simple as possible" so the subject stays the focus; gradients and opacity for a glass feel. The page gives no font names or hex values |
| Crew touchscreen accounts | https://www.space.com/spacex-crew-dragon-touchscreen-astronaut-thoughts.html | Glove-compatible touch, primary navigation low on the screen |
| Motion craft | https://emilkowal.ski/ui/great-animations | Ease-out, short, interruptible |

## 8. Open points

- Font family is a recommendation, not yet chosen; the cockpit and Fuselab fonts are identified by eye only.
- `--ok`, `--warn`, `--crit` are proposed and not yet contrast-tested on the real panels or a projector.
- The cockpit reference frames emergency buttons in red on a black hardware console; e^x has no hardware, so that motif is limited to the escalation block.
