# 05 Prior art and judging

Captured: 2026-11-14. Scope: how Space Apps 2026 is judged, what has been built before (Space Apps entries, NASA, CSA, ESA, TRISH, commercial flights), and what would make this entry stand out.
Marking: **[unverified]** = not confirmed from a primary source; **[3rd-party]** = secondary or vendor source only; **[inference]** = our own reading of the evidence.

## Summary

| # | Finding |
|---|---|
| 1 | **Five criteria, each scored 1-5 at every judging level:** Impact, Creativity, Validity, Relevance, Presentation. Relevance explicitly rewards NASA data used as a core component, not as decoration. Eligibility for a Global Award requires at least one NASA data source or resource. |
| 2 | **Hard limits.** Demo is a video of 30 s or less, or at most 7 slides. Submit by Sun 15 Nov 2026, 23:59 local time of the Local Event. Links must be public with no login. Content must be in English. AI ("SI") use must be disclosed, and AI images and video need a visible watermark. No likeness of anyone under 18. Teams have at most 6 members. |
| 3 | **Few astronaut-health entries have won Space Apps.** Found: one Global Winner (Canaria, 2016, earpiece hardware) and one 2025 Best Use of Science winner on space biology (SpaceGenes+, a visualisation dashboard). Nominees from 2018-2022 were sensors or AI disease prediction. None found was a crew self-assessment and triage tool. |
| 4 | **The agencies have the sensors but not the crew-facing layer.** Bio-Monitor, Everywear and the BioButton/Garmin kits on commercial flights already exist. The open problem, named by NASA (Earth-Independent Medical Operations, clinical decision support), TRISH (HERMES) and CSA (Health Beyond, decision-support studies), is helping a non-physician crew interpret data and decide what to do. |
| 5 | **Positioning that fits the judging.** Present the tool as the crew-facing layer of Earth-independent medical operations: a routine self-check, a body-map status view, guidance, and delay-aware escalation (crew vs flight surgeon). Ground it in NASA HRP risks and published flight data, export FHIR, and demo it live with a real sensor. |

---

## 1. Space Apps 2026 judging criteria

Source: [Judging & Awards Guide (2026 edition; page shows the 2026 dates)](https://www.spaceappschallenge.org/resources/judging-awards-guide).

| Criterion | Official definition (condensed) | Score-5 bar (condensed) | Implication for this build |
|---|---|---|---|
| Impact | Addresses a minor or major problem; reach ranges from a select few to a broad audience | Significant problem, extensive reach, "could change the world" | Pitch the Earth spillover as well: remote and isolated care (the CSA frames this explicitly), polar stations, commercial crews |
| Creativity | Original, or a meaningful improvement on existing ideas | Groundbreaking approach never attempted before | Delay-aware escalation, a body map tied to the HRP hazards, a gamified routine. These are not in the prior art found (section 5) |
| Validity | Grounded in science; technically feasible; usability counts | Scientifically sound, fully developed, highly usable | Published thresholds with citations; FHIR/LOINC; confidence labels; a working live sensor path |
| Relevance | Fully addresses the challenge; **NASA data integrated as a core component** | NASA data integral to success and well executed | Drive thresholds, baselines and scenarios from NASA HRP and NASA Life Sciences data (see the data documents), and say so on screen |
| Presentation | Clear, well-structured storytelling; judges score the demo and the full project | Polished, compelling, clearly articulated | Script the 30 s video around one crew scenario. The guide asks teams to give this criterion "equal attention" |

Judging timeline (same source):

| Phase | Date |
|---|---|
| Hackathon / submission deadline | 14-15 Nov 2026; submit by 15 Nov, 23:59 local |
| Global Nominees announced | 3 Dec 2026 |
| Global Finalists and Honorable Mentions | 17 Dec 2026 |
| Global Winners announced | 26 Jan 2027 |

## 2. Submission rules that shape the build

Source: [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) and [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide).

| Rule | Detail | Build consequence |
|---|---|---|
| Demo format | Video of 30 s or less (English subtitles if spoken in another language) **or** at most 7 slides including title and intro. Projects over the limits are not eligible for Global Judging | Decide video vs slides early; one teammate owns it |
| Public links | Demo and final project must open with no login, permission or registration. Test in a private window | Host a static build (for example GitHub Pages) with a no-hardware mode (synthetic + MobiVital replay) |
| NASA data | At least one NASA data source or resource is required for Global Award eligibility | List the NASA sources in the "NASA Data" field |
| References | All external code, text, images and data must be listed, even open-source ones | Credit MobiVital (CC BY 4.0), vitallens.js, MediaPipe, LOINC |
| SI (AI) disclosure | Allowed as a tool, but not to come up with the idea. Images and video: visible watermark. Code and data: acknowledge in text and metadata. Generated content may not use NASA branding | Add an "AI use" note in the README and code headers |
| Minors | No images, video, audio or likeness of persons under 18 | The camera demo uses an adult team member only |
| Team | Max 6 members, all registered to the same Local Event | n/a |
| Deadline | Click "Submit for Judging" before Sun 15 Nov, 23:59 local time | Freeze features by mid-afternoon on day 2 |

## 3. Global award categories and fit

Source: [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide).

| Award | Definition | Fit for a crew health tool |
|---|---|---|
| Best Use of Science | Best and most valid use of the scientific method | High (cite flight physiology; validate camera vs strap) |
| Best Use of Data | Makes space data accessible or applies it uniquely | Medium-High (NASA human research data turned into crew guidance) |
| Best Use of Technology | Most innovative use of technology | Medium-High (live Web Bluetooth + camera vitals + FHIR) |
| Galactic Impact | Most potential to improve life on Earth or the universe | Medium-High (remote care on Earth) |
| Best Mission Concept | Most plausible concept and design | High (fits NASA EIMO and the CSA Health Beyond direction) |
| Most Inspirational | "Captures our hearts" | Medium |
| Best Storytelling | Communicates the potential of open data through storytelling | Medium (scenario-driven video) |
| Global Connection | Connects people around the world through technology | Low-Medium |
| Art & Technology | Combines technical and creative skills | Medium (animated body map) |
| Local Impact | Greatest potential for the local community | Low-Medium |

---

## 4. Past Space Apps entries related to astronaut health

| Year | Team / project | What it was | Result | Source |
|---|---|---|---|---|
| 2014-2015 | Challenge "Fit as a MOoSE" | Citizen-science tool linking ISS astronaut health and exercise to options on Earth, using existing NASA databases | Challenge (no winner info checked) | [2015 challenge page](https://2015.spaceappschallenge.org/challenge/fit-moose-metabolic-observations-space-explorers/) |
| 2016 | Canaria (London) | 3-D printed earpiece plus patch: heart rate, blood oxygen and cabin CO2 | **Global Winner, Best Use of Hardware** | [2016 project](https://2016.spaceappschallenge.org/challenges/space-station/rock-it-space-fashion-and-design/projects/canaria), [digital.gov](https://digital.gov/2016/06/27/nasa-space-apps-challenge-2016-global-winners) |
| 2018 | Otter Space, "Martian Health" | Wrist sensor (radiation, O2, temperature, BP) that alerts and sends coordinates to the nearest shelter | Global Nominee | [Team page](https://2018.spaceappschallenge.org/challenges/can-you-build/make-sense-out-mars/teams/otter-space) |
| 2018 | Spacemed, "Space Health System" | Vital signs and biomechanics analysis of astronaut activity | Global Nominee | [Project page](https://2018.spaceappschallenge.org/challenges/can-you-build/make-sense-out-mars/teams/spacemed-1/project) |
| 2020 | Morpheus Sleeptech (challenge: Sleep Shift Scheduling Tool) | Sleep wristband (temperature, HR, SpO2) with AI suggestions for sleep, diet and exercise | Global Nominee | [Team page](https://2020.spaceappschallenge.org/challenges/sustain/sleep-shift-scheduling-tool/teams/morpheus-sleeptech) |
| 2022 | Skylab | Deep-learning and NLP disease prediction for astronauts using NASA GeneLab data | Global Nominee | [Team page](https://2022.spaceappschallenge.org/challenges/2022-challenges/science-legacy/teams/skylab) |
| 2025 | SpaceGenes+ | Interactive visualisation of how radiation and microgravity together affect genes such as TP53 and ATM | **Global Winner, Best Use of Science** | [2025 Global Winners](https://www.spaceappschallenge.org/2025/meet-the-2025-global-winners/) |

Patterns **[inference]**:
- Past entries were either new hardware or AI prediction. The one health-adjacent 2025 winner was praised for "thoughtful design and data visualization" that makes complex science accessible.
- No past entry found combined a self-assessment routine, guidance, and escalation to the ground. That combination is what the 2026 brief asks for.

---

## 5. Agency and research prior art

| Org | Program / tool | What it does | Status / date | Lesson for us | Source |
|---|---|---|---|---|---|
| CSA | **Bio-Monitor** (Astroskin smart shirt + headband, by Carré Technologies / Hexoskin) | Measures pulse and ECG, blood pressure, breathing rate and volume, skin temperature, SpO2 and activity. Crew view vitals on a tablet app during a session; data goes to Earth afterwards via a base unit | Launched Dec 2018 | Sensing is solved; the downlink is batch, so interpretation sits on the ground | [CSA Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/astroskin.asp) |
| CSA | **Deep-space health technology concept studies** | Decision support concepts: Carré "Space Medicine Decision Support System" (tracks crew health, guides the Crew Medical Officer, arrhythmia AI); Lunar Medical hybrid AI DSS (for use if the CMO is incapacitated); Thales crew state assessment (acute coronary syndrome, hypovigilance). Each about CAD 100k | Phase 1 concept studies, early 2019 | Validates our concept: crew-facing decision support for non-physicians | [CSA contracts page](https://asc-csa.gc.ca/eng/funding-programs/programs/stdp/contracts-awarded-for-the-development-of-health-technologies-for-deep-space-missions.asp) |
| CSA | **Health Beyond / Connected Care Medical Module (C2M2)** | A deployable integrated medical system for crews off-planet and remote communities on Earth. Round 1: five firms at CAD 2M each (late 2022). Round 2 RFP up to CAD 3M | Ongoing; 2025-26 status not confirmed | CSA states "medical autonomy is more than a luxury – it is a necessity" | [CSA remote healthcare](https://www.asc-csa.gc.ca/eng/health/remote-healthcare-in-space-and-on-earth.asp), [SpaceQ round 2](https://spaceq.ca/csa-moves-forward-with-round-2-of-the-connected-care-medical-module-initiative/) |
| CSA / MDA | "MDA health autonomy", "AstroNotes" | **Not found.** MDA appears only in a non-medical CSA Autonomy Software Framework award. No CSA product called "AstroNotes" was found | n/a | Do not cite these names in the pitch | [SpaceQ on CSA awards](https://spaceq.ca/the-canadian-space-agency-awards-1-5m-for-human-spaceflight-technology-and-medical-study/) |
| ESA | **Space Medicine Team** (European Astronaut Centre, Cologne) | Doctors, biomedical engineers, exercise physiologists, psychologists, IT staff. Prepares for missions beyond LEO | Active | Multidisciplinary framing: physical and behavioural health | [ESA Space Medicine](https://www.esa.int/About_Us/EAC/Space_Medicine) |
| ESA / CNES | **Everywear** | ISS tablet app collecting wearable data: smartshirt (ECG, activity), e-Tact patch (temperature, orientation), tonometer (arterial stiffness). ESA doctors used the data to advise the crew | Proxima mission, ended 2 Jun 2017 | A precedent for a crew-held app aggregating wearables | [ESA: A patch of health](https://www.esa.int/articles/a-patch-of-health) |
| ESA | Tempus Pro at landings | Portable vital-signs monitor; data shared live with EAC via satellite | Used at landings | Ground link plus escalation | [ESA telemedicine](https://www.esa.int/Applications/Connectivity_and_Secure_Communications/Telemedicine_via_satellite_improves_care_at_astronaut_landings) |
| NASA HRP | **Exploration Medical Capability (ExMC) / Earth-Independent Medical Operations (EIMO)** | Exploration crews will need to detect, diagnose, treat and prevent medical events on their own; a clinical decision support system (CDSS) is central | Research and tech demos. The nasa.gov ExMC page returned 404 on 2026-11-14; NTRS documents remain | Our tool is a small, crew-facing slice of EIMO | [NTRS: EIMO](https://ntrs.nasa.gov/citations/20230015500), [NTRS: AsMA 2025 AI panel](https://ntrs.nasa.gov/citations/20240012663), [NTRS: Gateway medical ConOps](https://ntrs.nasa.gov/api/citations/20200001341/downloads/20200001341.pdf) |
| NASA HRP | **Crew Health and Performance (CHP) system** | Artemis III/IV system model (2023). CHP-IDA integrates CHP data. CHP-IDSP (2025) is a back-end that acquires, processes, stores and distributes CHP data "for both crew and ground users" | Development | Use the term "CHP" and "crew and ground users" in the pitch | [NTRS: Artemis CHP model](https://ntrs.nasa.gov/citations/20240001381), [NTRS: CHP-IDSP](https://ntrs.nasa.gov/citations/20250004859) |
| NASA HRP | **Spaceflight Standard Measures** (Research Operations and Integration) | A minimal core set of measurements collected consistently from ISS crew | Ongoing | Justifies a short, fixed daily routine | [NASA ROI](https://www.nasa.gov/hrp/research-operations-integration/) |
| NASA | **NASA Life Sciences Portal** (LSDA, Lifetime Surveillance of Astronaut Health) | De-identified human research data from spaceflight and analogs since 1961, including bed-rest fluid-shift studies | Active | Candidate NASA data source for the Relevance criterion | [NASA Life Sciences Portal](https://www.nasa.gov/hrp/nlsp/) |
| TRISH (Baylor, Caltech, MIT; funded by NASA) | **EXPAND** and **HERMES** | EXPAND collects biomedical data from commercial flights. HERMES is a data platform aiming "to provide astronauts with the health information they need to make informed medical decisions on distant missions" | Developing | HERMES is the closest institutional analogue to our tool | [NASA: TRISH](https://www.nasa.gov/hrp/the-translational-research-institute-for-space-health-trish/) |
| TRISH / Empatica | EmbracePlus smartwatch | Medical-grade watch for vitals and sleep-wake; prototype partly TRISH-funded; under consideration at NASA JSC **[3rd-party]** | Research use | Off-the-shelf wearables are the realistic sensor path | [Tech Briefs](https://www.techbriefs.com/component/content/article/50798-medical-grade-smartwatch-can-monitor-astronauts-patients) |
| Commercial flights (via TrialX, which built EXPAND) | Polaris Dawn, Fram2 kit | Garmin watches (HR, activity, sleep); BioButton patch (HRV, temperature, respiratory rate, posture); EXPAND iPad app with 30+ in-flight surveys (cognition, emotional well-being, sleep); Butterfly iQ handheld ultrasound; BP and glucose monitors. Live vitals go to mission control; stored data is downlinked in batches | 2024-2025 missions **[3rd-party; vendor article]** | Our input set (vitals + surveys + ultrasound images) matches what flies today | [TrialX article](https://trialx.com/how-health-data-is-collected-in-space-missions/) |
| Medplum (FHIR platform) | Mock TRISH dashboard | Artemis crew vitals plus cabin environment (CO2, O2, radiation); full stack run on a Raspberry Pi 4 at about 1-1.5 W | Mock, Aug 2023 (RFP bid) | FHIR on low-power hardware is credible | [Medplum blog](https://medplum.com/blog/medplum-for-nasa-and-trish) |

---

## 6. Gap analysis: what exists vs where this entry can stand out

| Capability | Exists in prior art | Gap this tool can fill **[inference]** |
|---|---|---|
| Wearable sensing | Many systems (Bio-Monitor, Everywear, BioButton, Garmin) | Do not build hardware; read off-the-shelf BLE sensors live |
| Research and ground data platforms | CHP-IDA/IDSP, EXPAND, LSDA | A crew-facing view for non-physicians, rather than a researcher or ground view |
| Decision support | Concept studies (CSA 2019), EIMO CDSS research, HERMES in development | A working, explainable prototype: a rule per indicator, cited thresholds, a "why" panel |
| Escalation | Ground-centric on the ISS | Delay-aware routing: Moon about 1.3 s one way; Mars up to 44 min round trip ([NTRS](https://ntrs.nasa.gov/citations/20250000703)). Act now locally vs queue for the flight surgeon |
| Routine and engagement | Fixed standard measures; surveys on iPad | Scheduled prompts, streaks and gamification, as suggested in the brief |
| Behavioural health | Surveys (EXPAND) | Self-report mood + PHQ-2 linked to sleep debt, never face-emotion scoring |

## 7. What differentiates a winning entry: checklist

| Criterion | Do this | Why |
|---|---|---|
| Relevance | Map each indicator to a NASA HRP hazard and use at least one NASA dataset visibly (baselines or scenarios) | Score-5 bar requires NASA data to be integral; Global Award eligibility requires it |
| Validity | Cite every threshold; show the confidence of camera readings; export FHIR/LOINC; state "decision support, not diagnosis" | "Grounded in scientific principles", usability counts |
| Creativity | Delay-aware escalation; animated body map with per-organ hazard status; scenario replay | Not found in past Space Apps entries or agency tools above |
| Impact | One slide or line on Earth use: remote and Indigenous communities (CSA framing), polar and offshore crews | Impact bar: broad reach |
| Presentation | 30 s video: problem (5 s), live strap and camera reading (10 s), alert and guidance with escalation (10 s), Earth impact (5 s). Watermark any AI visuals | Judges score both the demo and the full project; limits are strict |
| Robustness | Offline/no-hardware mode (synthetic + MobiVital replay) so judges can open the link and see it work | Public, login-free link rule |

## 8. Not found or unverified

| Item | Status |
|---|---|
| CSA "AstroNotes" | No source found |
| "MDA health autonomy" program | No source found; MDA holds only a non-medical CSA autonomy software award |
| nasa.gov ExMC page | Returns 404 (2026-11-14); cited via NTRS instead |
| C2M2 round 2 winners and 2025-26 status | Not confirmed |
| Polaris Dawn / Fram2 kit details | Vendor (TrialX) article only |
| Full Space Apps winner lists for 2017-2024 | Not reviewed in full; there may be other health-related winners |
