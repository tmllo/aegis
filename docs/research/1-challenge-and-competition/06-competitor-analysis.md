# 06 Competitor analysis: other teams on the same challenge

Captured: 2026-11-14 (day 1). Purpose: learn from other teams' approaches. **Not** to copy code, text or design.
Method: watched the YouTube video (frames + captions); read repos read-only with `gh api` (README, file tree, key source files); read `nasa/spaceapps` discussions with `gh api graphql`. Nothing was cloned, starred, forked or posted.
Marking: **[README]** = taken from the team's own README, not checked by running the app; **[code]** = seen in source; **[inference]** = our reading.

## Summary

| # | Finding |
|---|---|
| 1 | **The field is crowded and strong.** A GitHub search on 14 Nov found 50+ repos for this challenge updated that day. At least 8 are mature: offline PWA, body map, personal baselines, comm-delay-aware escalation, cited thresholds, AI-use statements ([search](https://github.com/search?q=astronaut+health+space+apps+2026&type=repositories&s=updated&o=desc)). |
| 2 | **What we planned as differentiators is now table stakes.** Body map, green/amber/red, delay-aware escalation (crew vs flight surgeon), "how to measure" guides, streaks, offline-first and flight-surgeon reports appear in almost every strong entry (see Common patterns). |
| 3 | **Real gaps remain.** Few teams use a live sensor (only AEGIS: Bluetooth HR; ARGUS: webcam pulse). Only one uses real NASA mission data as a time series (Paean: Curiosity RAD and JPL Horizons). Nobody we found shows validation against real human spaceflight data. Only Pulsar measures detector accuracy (on synthetic data). |
| 4 | **Rules matter.** GO Team: working before Sat 14 Nov 9:00 local time "can lead to disqualification" ([#1871](https://github.com/nasa/spaceapps/discussions/1871)). AURA (first commit 2 Nov) and the Cairo video (uploaded 7 Nov) predate the event. The HRP pages on the Resources tab satisfy the NASA-data rule ([#1994](https://github.com/nasa/spaceapps/discussions/1994#discussioncomment-19602738)). AI images and video need a visible watermark ([#2163](https://github.com/nasa/spaceapps/discussions/2163)). |
| 5 | **Mentor advice: go deep, not broad.** "A polished, focused solution will typically stand out more than a platform with many partially developed features" ([#2138](https://github.com/nasa/spaceapps/discussions/2138)). Our edge should be one scenario that is real end to end (live sensor + real NASA data + verified thresholds), not more features. |

---

## 1. Sources the user gave

### 1.1 AstroVitals (Cairo team, YouTube video)

Source: [YouTube DigGu8ddsPM](https://www.youtube.com/watch?v=DigGu8ddsPM), "Create health monitoring software for astronauts on space missions - NASA space apps challenges Cairo", 1:31, uploaded 2026-11-07.

| Item | Finding |
|---|---|
| Approach | "Hybrid smart system that runs offline first inside the spacecraft while securely syncing with mission control" (0:28-0:36). Pitch-only concept video |
| Features | Daily real-time metrics: heart rate, oxygen, CO2, radiation (0:39-0:45). Weekly checks: bone density and muscle mass (0:45-0:50). "AI predictive analytics" comparing pre-flight baselines with in-flight telemetry (1:00-1:09) |
| UI | All frames are AI-generated images, not screenshots. Shown: holographic body with a bone-density colour gradient on the spine and hips; panels for heart rate, respiration, SpO2 98%, ambient CO2, dosimetry "150 mSv", muscle-atrophy index (front/back muscle figures), fluid-shift monitor, hydration (0:53-1:20). Status bar: "Systems stability 99.2% (nominal)", "LocalFlux (offline) active", "Predictive analytics active" (0:33) |
| Colour coding | "Intuitive color-coded scoring system" (1:12) |
| Data sources | None named |
| Input | Not shown; implies automatic telemetry |
| Escalation | "Warns astronauts early and guides them with immediate medical countermeasures" (1:14-1:19). No crew-vs-ground rule shown |
| Stack | Not shown |
| Strengths | Strong cinematic story opening ("Just imagine being millions of miles away..."); clear problem framing in 30 s; weekly vs daily measurement split is a good idea |
| Weaknesses | No working software visible. AI imagery has garbled text ("AstroViteals", 1:20). NASA insignia on AI images, with no visible AI watermark, conflicts with the SI rules ([#2163](https://github.com/nasa/spaceapps/discussions/2163)). Uploaded 7 Nov, before the hackathon ([#1871](https://github.com/nasa/spaceapps/discussions/1871)). "AI predictive analytics" is not explained |

Lesson: the story opening works. The rest shows what judges cannot score: no real UI, no sources, no logic.

### 1.2 AURA-EIMO (Lima, Peru)

Source: [quirocode/aura-space-health-monitor](https://github.com/quirocode/aura-space-health-monitor), live at [quirocode.github.io/aura-space-health-monitor](https://quirocode.github.io/aura-space-health-monitor/) (HTTP 200 on 14 Nov). All commits are dated 2 Nov 2026 ([commits](https://github.com/quirocode/aura-space-health-monitor/commits)).

| Item | Finding |
|---|---|
| Approach | "Dark cockpit" clinical console for EIMO. Four workspaces: surveillance + body hologram; live diagnosis (ECG + POCUS); 30/60/90-day digital twin; EVA helmet HUD ([README](https://github.com/quirocode/aura-space-health-monitor/blob/main/README.md)). UI is in Spanish |
| Data sources | 100% synthetic: 180-day timeline per environment (Earth, 0 g, Moon, Mars), with fluid shift, bone and muscle loss, ONSD, the third-quarter effect and solar-storm injection ([simulationEngine.ts](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/services/simulationEngine.ts)) [code]. Radiation baselines cite Zeitlin 2013, Hassler 2014 and Zhang 2020 ([clinicalThresholds.ts](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/config/clinicalThresholds.ts)). A ~50 KB citation registry ([nasaScientificRegistry.ts](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/data/nasaScientificRegistry.ts)) |
| Input | Timeline scrubber, environment selector, voice commands (Web Speech), webcam rPPG with a simulated fallback ([ContactlessRppgScanner.tsx](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/components/biometrics/ContactlessRppgScanner.tsx)), ultrasound image upload. No manual vitals form found [code] |
| UI highlights | Clickable SVG anatomy with 8 regions (brain, eyes, heart, lungs, kidneys, muscles, bones, immune), coloured cyan/amber/rose ([HumanAnatomyFigure.tsx](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/components/HumanAnatomyFigure.tsx)). 60 fps ECG/PPG canvas with an R-peak beep. Procedural POCUS optic-nerve scan. Digital twin with ±1σ cones. EVA HUD. Built-in "pitch deck" walkthrough |
| Escalation | 3 levels: self-care / notify crew-CMO / contact flight surgeon ([AlertsPanel.tsx](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/components/AlertsPanel.tsx)). Level is **fixed per alert type** (e.g. ONSD ≥ 5.8 mm goes to the flight surgeon), not changed by distance; comm delay is shown only as a label [code]. Store-and-forward packet queue with P1-P3 priority ([DeepSpaceStoreForwardQueue.tsx](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/components/telemetry/DeepSpaceStoreForwardQueue.tsx)) |
| Gamification | Streak and XP panel with hard-coded start values (14 days, 840 XP) ([GamificationPanel.tsx](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/components/GamificationPanel.tsx)) |
| Stack | React 19, TypeScript, Vite, Tailwind 4, Canvas/SVG, Web Audio, Web Speech, IndexedDB, PWA, GitHub Pages |
| Strengths | Breadth; region-by-region rules with citations; environment-dependent thresholds; offline storage; Earth spinoff (Andes/Amazon) |
| Gaps | Feature overload (the mentors advise the opposite, [#2138](https://github.com/nasa/spaceapps/discussions/2138)). No real data and no manual entry. "AI" ultrasound is procedural, with a fixed "CONFIDENCE 96.4%" label (overclaims). Escalation ignores distance. Spanish UI, but submissions must be in English. Built 12 days before the event (disqualification risk, [#1871](https://github.com/nasa/spaceapps/discussions/1871)) |

---

## 2. Shortlist from GitHub search (repos updated Nov 2026)

Search used: `gh search repos` for "astronaut health", "crew health", "astronaut vitals", "space apps 2026" and similar, updated ≥ 2026-10-01. The ten most complete entries follow, ranked by depth. All descriptions are **[README]** unless marked.

| Team / repo | Approach (one line) | Data sources | Input | UI highlights | Escalation logic | Stack | Strengths | Gaps | URL |
|---|---|---|---|---|---|---|---|---|---|
| CrewCheck (PaulBurgEth) | "Who acts now": astronaut, CMO or Earth. Rules decide, a forecast warns, AI only explains | NASA HRP pages; simulated suit stream "modelled on" CSA Bio-Monitor; MSL RAD rate | Simulated suit + 1-min, 5-field check-in | 3 columns Sense / Decide / Act; body zones; "Play story" 40 s guided demo; Earth "envelope" travel view; 4-person crew view | Matrix of status × distance (ISS/Moon vs Mars); agent workflow Watch-Flag-Plan-Act-Verify, never diagnoses; "did it work?" follow-up | Plain JS, GitHub Pages | Clearest escalation model; AI fenced off by a test; story mode | Synthetic only; no live sensor | [repo](https://github.com/PaulBurgEth/crewcheck), [demo](https://paulburgeth.github.io/crewcheck/) |
| Pulsar (Quantum Astronauts, Sydney) | Collect, evaluate, act, hand over; EWMA drift on personal baselines | Seeded 180-day synthetic mission with 4 injected events; NASA PVT (NTRS 20090029851); delay paper NTRS 20220013418 | Check-in with steppers, chips; reaction test | Cartoon "health astronaut" whose parts light up; routine card (due/overdue); EWMA ±2 SD trends | Nominal / Watch / Act + red flags "call flight surgeon now"; ECDSA-signed handover packet for store-and-forward | Zero-dependency PWA, WebCrypto | Only team reporting detector validation (4/4 injected events); "honest status" (No data / Learning) | Validation on synthetic data only; no real sensor | [repo](https://github.com/quantum-astronauts/pulsar), [app](https://quantum-astronauts.github.io/pulsar/app/) |
| VIGIL (Pandanauts) | Crew console: what is my status, why it matters, what to do now | Seeded simulation; NASA-STD-3001 radiation limits; MSL RAD rates; Mars Relay delay | Keyboard log forms; imaging log | Overview, Vitals (30-day chart with band and baseline), 8-system Body Map, Triage, Routine, Downlink, Sources | 4-step protocols: confirm, assess, act, escalate. LEO: ground-guided; Mars: crew first, then downlink brief | TypeScript, Vercel | A test fails if a threshold cites a missing source; never names drugs; 7-slide deck | Synthetic only | [repo](https://github.com/Kuraam/vigil), [app](https://vigil-pandas.vercel.app) |
| Paean (n1seko) | Mars-crew console built around flight-surgeon "standing orders" | **Real NASA data:** JPL Horizons ephemeris (live delay, 11 min 05 s on Sol 214); 274,998 Curiosity RAD readings via OSDR RadLab, including the Sept 2017 SPE | Daily 2-min check-in + 5-tap reaction test; keyboard shortcuts | 6-system body figure + status rail; 14-sol trend + 7-sol forecast with two paths (act / no act); orbit view; readiness score | Standing order per reading (crew can act alone or not); "Escalate to Earth" in SBAR format, showing Houston's stale view | Plain HTML/JS, inline SVG, no network | Best use of real NASA data found; sharp demo script | Vitals fictional; one mission only | [repo](https://github.com/n1seko/paean), [demo](https://n1seko.github.io/paean/) |
| ARGUS (Dark Star) | Three verdict layers: Personal, Space, Earth; counts concerns caught only by the personal baseline | NOAA GOES proton flux (live); NASA-STD-3001; HRA anatomy; simulated crew | **Webcam pulse (POS)**, PVT-B reaction test, guided vitals entry, check-in | 3D clickable body; "layer lens" switch; mission-day time travel; separate flight-surgeon view; role sign-in (PIN) | Delay-aware Earth link ("arrives in 11 min, demo 11 s"); shelter advisory | TypeScript PWA | FHIR-style export with LOINC/UCUM; every number labelled verified / partial / demo | PIN login on the demo may clash with "no login" rule; complex | [repo](https://github.com/FeyruzSultanli/argus-crew-health), [demo](https://feyruzsultanli.github.io/argus-crew-health/) |
| AEGIS (hooweisiong) | Calm, astronaut-facing readiness console; measure, interpret, act, escalate | Self-measurements; radiation dose | **Web Bluetooth HR (0x180D) with RMSSD**, Apple Health export, local JSON bridge, guided check-in | Light warm theme, 3 status colours, 6-system body map, wearable portal | 4-level ladder: self-care, CMO, flight surgeon, emergency; flight-surgeon button always visible; copyable summary with one-way delay | Plain JS, no build | Only entry with a live wearable path; restrained design | Windows .bat launchers; NASA use is HRP/CSA/ESA/JAXA reference pages only, no NASA dataset | [repo](https://github.com/hooweisiong/aegis-crew-health), [demo](https://hooweisiong.github.io/aegis-crew-health/) |
| Strelka (justinecua) | Daily 2-min check-in judged against **your** normal | 180-day made-up Mars transit; NASA HRP hazards | Form for 10 indicators with a per-field "how to measure" guide; baseline from pre-flight values or first 7 check-ins | Today / Check-in / Body / History; grid or list view; light and dark | 4 answers: all good, keep an eye, tell crew medic, get help now; delay-aware ("start onboard steps first") | JS + Vite, Electron desktop, Docker | Plain language; editable history | Synthetic; first commit 13 Nov 22:31 UTC (check vs local start) | [repo](https://github.com/justinecua/strelka-space-apps-2026) |
| VITAL (InfinityCrew1) | Personal-baseline z-scores across 5 domains, with live space weather | **Live NASA DONKI** (flares, SEP, storms), NOAA SWPC, ISS position, NASA Image Library | Check-ins, pulse counter, reaction test, mood tap | Body map; storm-readiness score; box-breathing coach; PDF/CSV export | "When to call a flight surgeon" per body area | Plain JS PWA; optional Anthropic API key | Live NASA feed tied to crew advice | DONKI moved on 30 Sep 2026 to `ccmc.gsfc.nasa.gov/DONKI-API` ([#2150](https://github.com/nasa/spaceapps/discussions/2150)); their `nasa.js` still calls `api.nasa.gov/DONKI/` ([nasa.js](https://github.com/InfinityCrew1/vital-crew-health/blob/main/nasa.js)) [code], so the live tab may fail | [repo](https://github.com/InfinityCrew1/vital-crew-health), [demo](https://infinitycrew1.github.io/vital-crew-health/) |
| AstroSelf (Bursa) | Visual self-assessment that works with no Earth link | **Inspiration4 blood values** (OSDR); live space weather; simulated 30 days | Daily check-in of the 6 brief indicators + vision change | Rotatable 3D body; organ panel (function, hazards, trend, when to notify FS); "Today / +30 days" toggle | Emergency mode on every screen: 6 offline checklists and "Earth reply in X min" countdown | JS PWA, English and Turkish | Real human spaceflight data used for comparison | Mixes many features | [repo](https://github.com/smileeclk/astro-health), [demo](https://senadogann.github.io/astro-health/) |
| CREWGUARD Sentinel (wael-sktch) | Evidence workflow: trust, personalize, interpret, act | OSDR v3 metadata with SHA-256; fictional profiles | Manual context: sleep, minutes since exercise, cabin CO2 | Counterfactual "what if" panel; ranked "next measurement" list | No diagnosis; recommends what to measure next; local queue only | JS PWA | Signal-quality gate before interpretation; good idea: rank the next measurement | Very cautious, few health outputs; text-heavy | [repo](https://github.com/wael-sktch/crewguard-sentinel) |

Other entries seen (less complete or README only): [DiastiMed RESOLVE](https://github.com/athena-kanellatou/diastimed-resolve) (evidence-collection planner that replans when equipment changes); [CrewSignal](https://github.com/miraflowwer/spaceapps-2026-crewsignal) (web + Tauri desktop + Expo mobile from one TypeScript core); [AstraHealth](https://github.com/NotSilverAsh/astrahealth) (Next.js + Postgres crew dashboard with environment monitoring); [Astro Vital](https://github.com/MehdiCherkane/space-health-monitor) (fixed adult ranges, worst-status rule; plans only); [astronaut-health-api](https://github.com/rapadura-cosmica-nasa/astronaut-health-api) (Java/Spring risk engine); [Crew Health Ops](https://github.com/edmundzen/crew-health-ops) (3D monitor with NASA RadLab data, README of one line).

---

## 3. NASA Space Apps discussions relevant to this challenge

| Topic | What was said | Who | Source |
|---|---|---|---|
| Resources tab | Teams asked when resources would appear; a participant answered "Friday 13-11-2026" and "no working allowed before hackathon" | Participants | [#1772](https://github.com/nasa/spaceapps/discussions/1772) |
| Working ahead | "Teams should not start their projects until the start of the official November 14-15 hackathon (Saturday, 9am local time...). Working ahead ... can lead to disqualification." | GO Team (Nick-GO-Team) | [#1871](https://github.com/nasa/spaceapps/discussions/1871) |
| NASA data rule | The challenge's Resources-tab pages "fulfill the requirement ... It doesn't strictly have to be a dataset." Third-party data allowed and encouraged if referenced | GO Team (Nick-GO-Team) | [#1994](https://github.com/nasa/spaceapps/discussions/1994#discussioncomment-19602738) |
| Simulated data | "Using dummy data or a mock API is completely fine"; judges expect progress, not a finished product | Participant/mentor answer | [#1787](https://github.com/nasa/spaceapps/discussions/1787) |
| No official dataset | Community answers point to OSDR, NLSP and Inspiration4 (OSD-569/570/575) | Community | [#2010](https://github.com/nasa/spaceapps/discussions/2010), [#2025](https://github.com/nasa/spaceapps/discussions/2025), [#2162](https://github.com/nasa/spaceapps/discussions/2162) |
| Scope | Focus on one problem; present the broad platform as a roadmap | Community mentors | [#2138](https://github.com/nasa/spaceapps/discussions/2138) |
| SI (AI) images | Visible watermark on every AI image and video; a credits page alone is not enough (refers to GO Team #1849) | Community, citing GO Team | [#2163](https://github.com/nasa/spaceapps/discussions/2163) |
| DONKI API moved | Old `api.nasa.gov/DONKI/...` errors; new base `https://ccmc.gsfc.nasa.gov/DONKI-API/get/` | SME + community | [#2150](https://github.com/nasa/spaceapps/discussions/2150) |
| Real astronaut names | Allowed for context; do not invent health records for real people | Community | [#2172](https://github.com/nasa/spaceapps/discussions/2172) |
| Deadlines | Platform deadline is 15 Nov 23:59 local; a Local Event may set an earlier judging cutoff, so treat the local one as real | Community | [#2177](https://github.com/nasa/spaceapps/discussions/2177) |
| Hypoxia resources | NASA hypoxia risk page and Evidence Report (NTRS 20150021491) | Community | [#2145](https://github.com/nasa/spaceapps/discussions/2145) |
| Sensor data types | ECG gives raw waveform and derived HR/HRV; no sample astronaut sensor data is provided | Community | [#2118](https://github.com/nasa/spaceapps/discussions/2118) |

Team page "Space Labs" ([link](https://www.spaceappschallenge.org/2026/find-a-team/space-labs/)), read in Chrome on 14 Nov: team name **ASTRA - Astronaut Self-health Tracking & Risk Assessment**, Universal Event (online). Aim: "track key health indicators, detect potential issues early, and make informed decisions". Skills sought: AI/ML, data analysis, design, human factors, space weather, web development. Project tab is empty ("Check back later"), so no approach to assess yet; recruiting via a public WhatsApp link.

---

## 4. Common patterns

| Pattern | Seen in | Share of the 12 entries reviewed in detail | Implication |
|---|---|---|---|
| Offline-first PWA / no backend | Video (claimed), AURA, CrewCheck, Pulsar, VIGIL, Paean, ARGUS, AEGIS, Strelka, VITAL, AstroSelf, CREWGUARD | 12 / 12 | Table stakes; do it, do not pitch it as new |
| Clickable body map with status colours | AURA, CrewCheck, Pulsar, VIGIL, Paean, ARGUS, AEGIS, Strelka, VITAL, AstroSelf, video | 11 / 12 | Table stakes (the brief suggests it) |
| Green / amber / red (or nominal / watch / act) | All | 12 / 12 | Table stakes |
| Delay-aware escalation (crew vs flight surgeon) | CrewCheck, VIGIL, Paean, ARGUS, Strelka, AstroSelf, Pulsar; AURA shows delay only | 8 / 12 | Common; only CrewCheck uses a full status × distance matrix |
| Personal baseline rather than fixed ranges | Pulsar, ARGUS, Strelka, VITAL, AstroSelf, AEGIS, CrewCheck, CREWGUARD, video | 9 / 12 | Common; Pulsar (EWMA) and ARGUS (layer lens) explain it best |
| Environment selector (ISS / Moon / Mars) | AURA, CrewCheck, Pulsar, ARGUS, AstroSelf, VITAL | 6 / 12 | Common |
| "How to measure" guide | Pulsar, Strelka, VITAL, AstroSelf, AURA | 5 / 12 | Common |
| Streaks / XP | AURA, CrewCheck, Pulsar, VIGIL | 4 / 12 | Common, shallow |
| Reaction-time (PVT) test | AURA, Pulsar, Paean, ARGUS, VITAL | 5 / 12 | Common |
| Synthetic seeded mission (180 days) | Almost all | 11 / 12 | Universal; none has real astronaut vitals (NASA does not publish them) |
| Live space weather (DONKI / NOAA) | VITAL, ARGUS, AstroSelf | 3 / 12 | Moderate |
| Real NASA time series as core data | Paean (RAD, Horizons); AstroSelf (Inspiration4) | 2 / 12 | **Rare** |
| Live physiological sensor | AEGIS (Bluetooth HR); ARGUS (webcam pulse); AURA (webcam, simulated fallback) | 2-3 / 12 | **Rare** |
| FHIR / LOINC export | ARGUS | 1 / 12 | **Rare** |
| Measured detection accuracy | Pulsar (synthetic only) | 1 / 12 | **Rare** |
| Sources screen and AI-use statement | VIGIL, Pulsar, CrewCheck, VITAL, Paean, ARGUS | 6 / 12 | Strong teams all do it |

---

## 5. Where we can differentiate

| Gap in the field | Our move | Reasoning / source |
|---|---|---|
| Nearly all data is synthetic; judges score "NASA data as a core component" | Drive one scenario from a **real NASA series**: e.g. Inspiration4 (OSD-575) blood markers, or MSL RAD dose via RadLab, shown on screen as "real NASA data" | Only Paean and AstroSelf do this ([Paean](https://github.com/n1seko/paean), [AstroSelf](https://github.com/smileeclk/astro-health)); Relevance criterion in `05-prior-art-and-judging.md` |
| Live sensing is rare | **Live Web Bluetooth HR + RR (HRV)** on stage, with the webcam (vitallens.js) as a backup and replay as a last resort | Only AEGIS has Bluetooth ([AEGIS](https://github.com/hooweisiong/aegis-crew-health)); plan in `04-prototype-data-sources.md` |
| Escalation mostly depends on status or a fixed type, not on distance | Make the **status × distance matrix** the core visual, with one sentence per cell; keep it simple (CrewCheck is the bar to beat) | [CrewCheck](https://github.com/PaulBurgEth/crewcheck); AURA ignores distance ([AlertsPanel.tsx](https://github.com/quirocode/aura-space-health-monitor/blob/main/src/components/AlertsPanel.tsx)) |
| Overclaiming ("AI 96.4% confidence", predictive analytics without method) | Show **uncertainty and data quality** next to every verdict (signal quality, "learning" state); no fake confidence | Pulsar "honest status" and CREWGUARD trust gate are well received ideas ([Pulsar](https://github.com/quantum-astronauts/pulsar), [CREWGUARD](https://github.com/wael-sktch/crewguard-sentinel)) |
| Almost no measured accuracy | Report a small **validation**: inject known events into the synthetic mission and show hits, misses and delay; if possible check thresholds against a public dataset | Only Pulsar reports numbers ([Pulsar](https://github.com/quantum-astronauts/pulsar)); Validity criterion |
| Standards export rare | **FHIR R4 Observation + LOINC** export for the flight-surgeon packet | Only ARGUS ([ARGUS](https://github.com/FeyruzSultanli/argus-crew-health)); table in `04-prototype-data-sources.md` |
| Feature sprawl (AURA, AstroSelf, VITAL) | **One deep scenario** end to end (e.g. a solar particle event, or sleep loss leading to an HR drift) and the rest as a roadmap slide | Mentor advice [#2138](https://github.com/nasa/spaceapps/discussions/2138); 30 s / 7-slide limit |
| Pitch videos built from AI imagery | Use **real screen recordings**; any AI visual gets a visible "SI-generated" watermark; no NASA insignia on generated media | Cairo video ([YouTube](https://www.youtube.com/watch?v=DigGu8ddsPM)); [#2163](https://github.com/nasa/spaceapps/discussions/2163) |
| Eligibility risk from early work | Keep our repo's first commit after Sat 14 Nov 9:00 local; prior research notes are fine, but no project code before then | [#1871](https://github.com/nasa/spaceapps/discussions/1871) |
| DONKI users may hit the old endpoint | If we show space weather, use `https://ccmc.gsfc.nasa.gov/DONKI-API/get/` and cache a fallback | [#2150](https://github.com/nasa/spaceapps/discussions/2150) |
| Weekly vs daily measurements rarely separated (only the video and Pulsar's routine card) | Routine schedule: daily (HR, sleep, mood), every 2nd day (BP), weekly (mass, glucose), shown as due / overdue | Video 0:39-0:50 ([YouTube](https://www.youtube.com/watch?v=DigGu8ddsPM)); [Pulsar](https://github.com/quantum-astronauts/pulsar); brief asks for routine prompts (`00-challenge-brief.md`) |

Note: these are ideas learned from others' approaches. Do not reuse their code, text, names or visuals; most repos are MIT, but originality is a scored criterion (Creativity).
