# e^x build kickoff (for the build session)

Written 2026-11-15 ~01:30 CET. Deadline: **Sun 15 Nov 23:59 local**. Read this whole file, then the files in "Read first", then start Phase 0.

## 0. Read first (in this order)
1. `../THESIS.md` (one page: positioning, proof, demo). `../THESIS-DETAILS.md` sections 4, 5, 8, 11 for numbers, rules and allowed claims.
2. `CLAUDE.md`, `PROJECT_CONTEXT.md`, `web/CLAUDE.md`, `web/PROMPTS.md` (E0-E7 = the original screen plan; this file extends it), `contracts/DATA_CONTRACT.md`.
3. Data: `web/public/data/crew_data.json` (simulated crew, Tomas) and `web/public/data/storm_forecast.json` (real DONKI model output, 1,528 held-out test flares). Look at both before designing.
4. Skills to load when relevant: `impeccable` (UI), `r3f-best-practices` + `three-best-practices` (3D body, Sun), `dataviz` (every chart), `run` (verify in the real app).

## 1. What we are building
**e^x Crew Station**: one offline web app (installable PWA, static build) that acts as the health system on board a spacecraft. One codebase, four linked surfaces, so it presents as a platform but ships as one file tree:

| Surface | Who uses it | What it shows |
|---|---|---|
| **Crew Console** (main, tablet/laptop) | Each astronaut | Crew overview -> 3D body -> metric panel -> check-in -> action -> re-measure -> escalation; radiation module; May 2024 replay |
| **Wrist** (simulated watch face, docked on screen) | Astronaut away from the screen | Urgency only: 1 pulse = check in, 2 = amber confirmed, continuous = radiation warning or red. Real vibration via `navigator.vibrate` where supported (Android Chrome), visual pulse everywhere |
| **Ground** (flight surgeon view) | Mission control on Earth | Reports arriving *after* the one-way light delay, link status, what the crew already did |
| **Systems** (architecture + flight readiness) | Judges | Live data-flow diagram, connected devices, flight-readiness checks, comm-link simulator |

Why one web app and not native or a backend platform: runs offline from a static folder (a USB stick, a container, an onboard server), no install, one deploy link for judges, and the same build can sit on an ISS-class server (HPE Spaceborne Computer-2) next to NASA's CMO-DA.

Positioning line (use on the landing and the Systems screen): **"CMO-DA answers when the crew asks. e^x tells them when to ask."** CMO-DA = Crew Medical Officer Digital Assistant, NASA JSC's offline AI medic (built with Google, tested with Red Hat on a ground copy of Spaceborne Computer-2, not yet flown).

## 2. Architecture (code)
Layers, strictly one-way. The core is pure TypeScript with no React, so it is testable and could run headless on a station server.

```
devices/      adapters: each turns a source into normalized Observations
  DeviceAdapter interface: id, label, kind, channels[], status, connect(), disconnect(), onObservation(cb)
  ReplayAdapter            crew_data.json series (the simulated crew, default)
  ManualCheckInAdapter     the daily check-in form
  WebBluetoothHRAdapter    REAL: standard Bluetooth Heart Rate Service (GATT 0x180D, char 0x2A37); any chest strap or watch broadcasting HR; Chrome only, behind a "Connect strap" button
  SimBioMonitorAdapter     simulated CSA Bio-Monitor channels (HR, BP, temp, SpO2, breathing, activity)
  SimDosimeterAdapter      simulated personal dosimeter (dose rate from the environment, storm spikes)
  registry                 also lists PLANNED devices with channel mapping and "not connected": CSA Bio-Monitor (Astroskin garment), wrist actigraphy (Actiwatch class), ESA T-Mini/Thermolab temperature, crew dosimeters
core/
  observation.ts   Observation = { subject, metric, value, unit, time, source, loinc? }  (FHIR Observation-shaped; LOINC codes only where verified)
  scoring.ts       personal-baseline rule (section 4), absolute limits, low-side-only, dose and bone bands
  escalation.ts    status x environment -> who is told, one-way delay, report queue
  link.ts          comm-link simulator: delay by environment, loss-of-signal windows, store-and-forward queue (DTN-style bundles), bytes per report
  handoff.ts       builds the CMO-DA case bundle (JSON) + a plain-language summary (deterministic template)
  radiation.ts     forecast feed, alert levels, replay timeline, per-storm lead time
  bus.ts           small event store; every Observation, flag, alert, report goes through it (the Systems screen visualizes it live)
ui/            React screens per surface, reading only from core/bus
```

Data rule (hard): every number shown comes from the two JSON files, from core computations on them, or from a device. Nothing hardcoded that lives in the JSON. The app must survive Tomas regenerating both files with no code change.

## 3. Flight readiness (the "it would work in space" proof)
Build these as real tests, and show their live results on the Systems screen:

| Check | How | Shown as |
|---|---|---|
| Fully offline | Service worker precaches everything; fonts, body model, sounds bundled; zero runtime external requests. Playwright test with `context.setOffline(true)` walks the whole demo path | "Offline: pass" + request count = 0 |
| Small footprint | Bundle size budget (report gzip size), memory after replay | Budget bars |
| Rule parity with ml | Vitest golden test: the TS scoring reproduces today's `status` of every crew member in `crew_data.json` | "Rule parity with Tomas's Python: pass" |
| Link delay and loss | `link.ts` unit tests: report sent during loss of signal is queued and delivered after it, in order, with the right delay per environment | Link simulator panel (ISS ~0 s, Moon ~1.3 s light time, Mars transit example 11 min, up to 22 min; toggle a blackout) |
| Downlink budget | Size of one CMO-DA case bundle and one daily report in bytes | "Report: X KB" |
| Server-ready | `Containerfile` serving the static build (unprivileged nginx or `npx serve`), runnable with Podman, same stack family as CMO-DA (Red Hat). Podman and Docker are NOT installed on this Mac: write the file and the README steps; ask Emile before installing anything | README "Run on a station server" |
| Device swap | Adapter contract test: any adapter that emits valid Observations drives the same UI | "Devices: 3 live, 4 planned" |

Do not claim flight certification, radiation-hardened hardware, or that it ran on the ISS. Say "built to run offline on station-class hardware".

## 4. Behaviour rules
- **Alert rule:** personal baseline = first 14 days (from the file's `baseline`). Live score = z of the **3-day mean** (today + previous 2 days), amber at 2, red at 3; low side only for `sleep_h`, `mood`, `exercise_min`; raw value outside `absolute_red` = red at once; dose and bone loss use absolute bands only (see THESIS-DETAILS section 8). Reason: on 6,000 simulated missions the one-day rule raised 4.8 alerts per astronaut-month vs 1.7 for the 3-day rule (`../analysis/alert_testbench_results.json`). Tomas made this the contract rule on 2026-11-15 (`DATA_CONTRACT.md` client-side section, `ml/crew_flags.py`, CHANGELOG): implement it exactly as written there. Historical `flags` and `status` are displayed as the file gives them.
- **Verify step:** amber -> "re-measure" prompt; confirmed amber escalates to the next medical conference flag. Red or absolute-limit values never wait for a repeat.
- **Escalation:** green self-care; amber self-care + flag for next private medical conference; red = crew medical officer now + report to flight surgeon queued, "arrives in ~X" from `link.ts`.
- **CMO-DA handoff:** button on any amber/red: produces the case bundle (who, what drifted, values vs own normal, days running, what was re-measured, actions taken, radiation context) as JSON plus a readable summary. Label it "Prepared for an onboard AI medical assistant such as NASA's CMO-DA". No generative AI in alerts or scoring. A live local model is out of scope unless Emile asks (none is installed).
- **Radiation:** dose gauge vs `career_limit_mSv`; forecast feed from `storm_forecast.events` sorted by `peak_time`; model card from `meta` (quote headline numbers only from `meta.metrics_test`, never recompute them). Replay uses `split == "test"` events 2024-05-05 -> 2024-05-20 only. Lead time in the replay = from the first warning flare's `peak_time` to that storm's `storm_onset_time`, labelled "from flare peak". Banner: "SEP LIKELY: SUSPEND EVA, CREW TO SHELTER (mission rule)". Say "particles arrive", never "storm hits". Show misses and false alarms in their own colour.
- **Environment switch** (ISS / Moon / Mars transit / Mars surface): changes dose rate (from `environments`), the link delay, and the escalation text.

## 5. Design
- **Visual reference: `../design-references/cockpit-touchscreen-ui.webp`** (open it). A spacecraft cockpit touchscreen: deep navy-blue panels, thin white type, small uppercase labels, large light numerals, translucent glass-like 3D renders, a thin status strip and icon bar along the bottom, physical-style emergency buttons framed in red. Match that feel and quality. Use it as style only: no SpaceX names, logos, layouts copied one to one, or vehicle terms.
- **Second reference: `../design-references/fuselab-astro-kit-*.jpg`** (Fuselab Creative's Astro Kit, a public NASA-data website, 2017). It is a marketing site, not a crew tool, so take only two things: (1) the **orbital diagram**: concentric hairline rings with thin line icons placed on them around a central mark. Use it on the Systems screen: e^x core in the centre, devices and outputs on the rings, data packets travelling along them. This is the app's one memorable element. (2) **Numbered steps with one active underline** (01 / 02 / 03, the current one lit): use for the guided flow Detect -> Notify -> Verify -> Escalate. Leave out its photo backgrounds, gold-on-black look and tracked all-caps labels.
- Also read `~/.claude/design-references.md` (Emile's design references, taste rules, QA checklist) before Phase 0.
- Mission-control calm: deep navy (not black), big light numerals, one accent per status (green / amber / red), generous space, legible on a 1920x1080 projector from the back of a room. Motion only where it means something (status change, alarm, packets moving on the Systems diagram, replay).
- 3D body: clinical and premium (translucent body, glowing regions `brain`, `heart`, `blood`, `bones`, `whole_body` aura). Primitives are fine; if a model is used, BodyParts3D or Human Reference Atlas (CC BY 4.0, credit in footer). Never Z-Anatomy.
- Replay Sun: stylised, flares placed by lat/lon (west on the right as seen from Earth), so the Parker spiral is visible.
- Systems screen: an animated architecture diagram (sensors -> adapters -> e^x core -> crew / wrist / CMO-DA handoff / link queue -> Ground) driven by real bus events, next to the flight-readiness results.
- **No emojis anywhere** (mood is a 1-5 numbered scale with words). No NASA, CSA or ESA logos. Low text, clear labels.
- Footer always: "Simulated crew data, not real astronaut records" · "Not medical advice" · "NASA does not publish crew self-check thresholds" · "Space weather data: NASA CCMC DONKI" · model credit.

## 6. Demo path (what must work perfectly)
1. Crew Console: Moon base, Ana amber, Kenji red, Léa green.
2. Ana -> body -> heart amber -> panel: systolic BP vs her own band, explanation, action -> re-measure -> Wrist pulses.
3. Hand off to CMO-DA: case bundle appears; Ground view receives the report after the delay.
4. Switch to Mars transit: same red now reads "report arrives in ~11 min (example)".
5. Radiation -> replay May 2024: warning fires about 39 h before the 10 May particles; one false warning (15 May X2.9, eastern limb) shown.
6. Systems: offline pass, devices, link simulator, numbers (16/17 storms, 1 false alarm a month, 3.8 h median, from `meta`).
Then record the 30 s video (problem 5 s, steps 2-3 10 s, replay 10 s, numbers 5 s).

## 7. Plan and cut lines
| Phase | Target time | Output | Gate |
|---|---|---|---|
| 0 Concept | by 03:00 | Scaffold (Vite + React + TS + Tailwind + R3F + drei + Recharts), types from the contract, loader, `core/` skeleton with tests, one styled Crew Console screen with real data | **Show Emile 2-3 visual concepts of the Crew Console (screenshots, real data) with a short plan: colours, type, spacing, the one memorable element. Wait for his pick before building the rest** |
| 1 Parallel build | by 12:00 | Body + panel + check-in + verify; radiation + replay; Systems + devices + link; Wrist + Ground | Each part has passing tests and a screenshot |
| 2 Integrate | by 16:00 | Demo path end to end, offline Playwright test passing, flight-readiness panel live | Run the demo path in a real browser |
| 3 Polish + ship | by 20:00 | Projector polish, sounds, footer, README (run, AI use, references), Containerfile, deploy | Test the deployed link in a private window |
| 4 Record | by 22:00 | 30 s video | Emile approves |

Cut in this order if late: Ground view -> Containerfile -> Web Bluetooth -> Wrist vibration (keep visual) -> Systems diagram animation (keep static diagram + checks). Never cut: demo steps 1, 2, 5, offline build, disclaimers.

Parallel work (ultracode): after Phase 0, fix the `core/` interfaces and the bus event types first, then give each agent its own folder (`ui/body`, `ui/radiation`, `ui/systems`, `devices/`, `ui/wrist+ground`) so nobody edits the same file. Integrate on one branch; run the full test suite and the offline Playwright test after each merge.

## 8. Repo and shipping rules
- The product is **e^x** everywhere in the UI, README and video. Repo docs still say AEGIS (old name): ignore that name, and rename it in `web/CLAUDE.md` only.
- Work only in `web/`. Never edit `ml/` or `contracts/` except adding entries to `contracts/CHANGELOG.md`.
- Commit small and often. Never add "Co-Authored-By: Claude" or "Generated with Claude Code" lines. Push to GitHub only when Emile says "push" (the repo is Tomas's).
- Deploy: Cloudflare Pages on Emile's **personal** account (`~/.config/cloudflare-personal`), never the MonsterClip account. Ask before the first deploy.
- Ask before adding any dependency beyond the stack above.
- README must include: how to run offline, AI-use disclosure, every data source, library and asset with licence.
- Claims: only those in THESIS-DETAILS section 11. Never "NASA thresholds", never "beats NOAA", never "superstorm" for the radiation part.

## 9. State of Tomas's data (as of commit 10c6792, 2026-11-15 00:59)
- 3-day rule is in the contract and the crew file; `python ml/validate_contracts.py` passes.
- The simulated storm dose is on 5 Sep 2026, the one real GOES >10 MeV storm in the mission window (the model's single warning miss; watch caught it). The radiation screen can tie the two: the crew's dosimeter spike and the real flare on the same day.
- Today's demo statuses: Ana heart amber (systolic BP), Kenji brain red (sleep), Léa green.
- He may still regenerate files: read every date and value from the files; never hardcode them. Run `git pull` in `` before starting.
