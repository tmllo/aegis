# Health indicators, spaceflight changes and alert thresholds

Researched: 2026-11-14. Every figure below was read from the linked source on that date. Sources are listed as short labels in the tables, with the full links in the Sources section at the end.

## Summary

| Item | Finding |
|---|---|
| Scope | 15 indicators the self-assessment tool can track: vitals, sleep, mood, body mass, bone, vision, radiation, hydration, cabin CO2 and symptoms. |
| Governing standards | NASA-STD-3001 Volume 1 Rev C (approved 2023-09-15) and Volume 2 Rev F (approved 2026-07-14). Note: the OCHMO technical briefs still cite Vol 2 Rev D or E. The requirements quoted here were re-checked in Rev F. |
| Hard NASA limits (use as red lines) | Career radiation < 600 mSv [V1 4030]. Cabin CO2 1-hour average <= 3 mmHg [V2 6004]. Bone mineral density in flight >= 95% of preflight (hip, spine) and >= 90% (femoral neck) [V1 4027]. Drinking water >= 2.5 L per crew member per day [V2 6109]. |
| Biggest spaceflight shifts | 24-h blood pressure 8-10 mmHg lower in flight. Core temperature about +1 °C at rest. Sleep about 6 h a night. Body mass -2 to -5% in month 1. Bone -1 to 1.5% per month without countermeasures. About 70% of long-duration crew show at least one sign of SANS (eye changes). |
| Where numbers are not NASA's | Most green/yellow/red cut-offs are terrestrial clinical ranges (MedlinePlus, AHA/ACC 2025, ADA-style glucose bands, PHQ-9) or team proposals. Each cell says which. NASA does not publish crew self-check thresholds. |
| Not verified | Orion/ISS radiation alarm values; any NASA body-mass % limit; a NASA urine colour chart; a formal rule for reporting vision change; whether a glucose meter is in the current ISS medical kit (only the older CHeCS requirement list and the i-STAT analyser are documented). |
| Disclaimer for the app | NASA's briefs state they are "not to deliver direct medical care recommendations or guidance for individuals". The tool must say the same. |

### How to read the threshold cells

| Tag | Meaning |
|---|---|
| [NASA] | Value taken from NASA-STD-3001 or an OCHMO technical brief. |
| [Clin] | Terrestrial clinical reference range (NIH MedlinePlus, AHA/ACC, PHQ-9 paper). |
| [Team] | Proposed by the team for the prototype, anchored on the cited values. Needs a flight surgeon's review before any real use. |
| (unverified) | Could not be confirmed in a public source. |

## Master table

| Indicator | Normal range (Earth) | Change in spaceflight | How measured in space | Green / Yellow / Red | Escalate to ground when | Countermeasure | Source |
|---|---|---|---|---|---|---|---|
| Heart rate (resting) | 60-100 bpm; trained athletes 40-60 bpm [Clin] | In flight: heart rate unchanged; stroke volume +35% and cardiac output +41% (n=8, 3-6 months ISS). After landing: heart rate rises on standing (orthostatic intolerance). | ECG / pulse in medical kit; CSA Bio-Monitor shirt (ECG, pulse); commercial wearables (Garmin, BioButton, Polar H10) on private missions. | G: 50-100 bpm at rest [Team]<br>Y: 40-49 or 101-120 bpm, or > 20 bpm above own baseline [Team]<br>R: < 40 or > 120 bpm at rest, or any rate with chest pain, fainting or irregular beat [Team] | Red value, or Yellow on 2 readings 30 min apart, or palpitations/irregular rhythm [Team] | Aerobic exercise (CEVIS cycle, T2 treadmill); fluid loading before landing | [MP-PULSE], [NORSK], [BIOMON], [TRIALX] |
| Blood pressure | Normal < 120/80; elevated 120-129/< 80; stage 1 130-139 or 80-89; stage 2 >= 140/90; severe > 180/120 [Clin] | 24-h ambulatory BP 8-10 mmHg lower in flight; systemic vascular resistance -39%; night-time dip kept. Plasma volume about -15% within 2 days, causing dizziness on return to gravity. | BP cuffs in Medical Diagnostics Pack; Bio-Monitor; ambulatory monitors in research. | G: 90/60 to < 120/80 [Clin]<br>Y: 120-139 / 80-89, or < 90/60 without symptoms [Clin/Team]<br>R: >= 140/90 on repeat, or > 180/120 once, or < 90/60 with dizziness/fainting [Clin/Team] | Any Red. > 180/120 or BP with headache, vision change or chest pain: immediately [Clin] | Exercise; salt-water fluid loading (24-48 oz before deorbit); compression garments (lower leg about 55 mmHg) | [MP-BP], [AHA2025], [AHA-PT], [NORSK], [TB-019], [CHECS], [BIOMON] |
| Oxygen saturation (SpO2) | 95-100%. Readings can be 2-4 points off [Clin] | ISS cabin 14.7 psia, 21% O2 (sea-level equivalent), so no change expected. Exploration cabins run at lower pressure; NASA allows inspired O2 down to 127 mmHg with a monitoring plan; 1-h floor 122 mmHg. | Fingertip pulse oximeter; Bio-Monitor (SpO2). | G: >= 95% [Clin]<br>Y: 93-94% [Team]<br>R: <= 92% contact provider; <= 88% immediate [Clin] | <= 92% on repeat, any value with breathlessness, blue lips, chest pain. <= 88%: immediately, put on O2 mask [Clin/NASA] | Check cabin O2/CO2 first; O2 mask (crew trained to don at hypoxia symptoms) | [MP-OX], [TB-003], [V2], [BIOMON] |
| Body temperature | 36.1-37.2 °C (97-99 °F); fever > 38.0 °C; hypothermia < 35 °C [Clin] | Resting core temperature about +1.0 °C after 2.5 months; exercise peak +1.4 °C, above 40 °C in some (n=11, ISS). | Bio-Monitor (skin temperature); research core-temperature sensor (heat-flux); clinical thermometer in kit (unverified). | G: 36.1-37.5 °C [Clin + Team allowance for the +1 °C shift]<br>Y: 37.6-37.9 °C, or 35.0-36.0 °C [Team]<br>R: >= 38.0 °C, or < 35.0 °C, or > 39 °C during exercise [Clin/Team] | Fever >= 38.0 °C, or any fever with rash, cough or confusion (immune changes) [Team] | Cooling, hydration, stop exercise; avoid heavy work above 38.0 °C core | [MP-TEMP], [MP-HYPOTH], [STAHN] |
| Blood glucose | Fasting 70-99 mg/dL; prediabetes 100-125; diabetes >= 126 fasting or >= 200 random; low < 70; severe < 54 [Clin] | Insulin resistance index rose in flight in all 8 crew of a 6-month study (more in men). Inspiration4 crew values are in OSD-575 (see 02-datasets.md). | Blood analyser (i-STAT on ISS; CHeCS list includes blood glucose); commercial glucose monitors used on private missions. | G: fasting 70-99 [Clin]<br>Y: fasting 100-125, or 54-69 [Clin]<br>R: fasting >= 126 (repeat), random >= 200, or < 54, or low with confusion [Clin] | Red value; < 70 with symptoms after treatment (15 g fast sugar) [Team] | Meet energy needs (EER); resistance + aerobic exercise; regular meals | [MP-GLU], [MP-HYPO], [HUGHSON], [NASA-TM-2010], [TRIALX] |
| Sleep duration and quality | Adults need 7-9 h [NASA brief citing AASM/NSF] | About 6 h a night (ISS 6.09 h, shuttle 5.96 h; actigraphy, 85 astronauts) despite 8.5 h scheduled. 75% of ISS crew used sleep medication. Circadian misalignment common. | Wrist actigraphy (Actiwatch); sleep log; questionnaires (sleepiness scale). | G: >= 7 h [NASA/Clin]<br>Y: 6-7 h, or 1 night < 6 h [Team]<br>R: < 6 h for 3 nights in a row, or < 5 h once before a critical task (EVA, docking) [Team] | Red, or medication use on > 3 nights a week, or reaction-time drop [Team] | Sleep hygiene (cool, dark, quiet; no caffeine 6-12 h before; no vigorous exercise within 2 h); timed bright light after waking; melatonin per flight surgeon | [TB-041], [MTB-009], [BARGER] |
| Mood and behaviour | PHQ-9: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe [Clin] | Common in flight: stress, depression, anxiety, relationship problems, grief. Drivers: sleep, workload, CO2, hypoxia, food. | Private psychological conferences (PPC); monthly WinSCAT cognitive test vs preflight baseline; questionnaires (EXPAND app on Polaris Dawn). | G: PHQ-9 0-4 [Clin]<br>Y: 5-9, or 2 weeks of low mood [Clin/Team]<br>R: >= 10, or any thought of self-harm (item 9), or WinSCAT below own baseline [Clin/Team] | Red: next PPC with behavioural health team; self-harm thoughts: immediately [Team] | PPCs, family conferences, care packages, team-skills training, sleep and workload management | [PHQ9], [TB-016], [V1], [TRIALX] |
| Body mass and nutrition | Stable weight; energy need from EER equation (activity factor 1.25) [NASA] | -2 to -5% in month 1, then stable. ISS crew study: -2.8% (SLAMMD) to -4.4% (BMMD). Intake about 80% of WHO estimate. | SLAMMD (applies a known force, mass = F/a); tablet food-intake log sent weekly to dietitians. | G: loss <= 2% and intake >= 90% of EER [Team]<br>Y: 2-5% loss in month 1, or intake 80-90% [Team on NASA-reported range]<br>R: > 5% loss, or still falling after day 30 with intake < 80% [Team] | Red, or 2 weeks of intake < 80% of EER [Team] | Eat to EER (average 3,035 kcal/day standard; +200 kcal per EVA hour); food variety; weekly dietitian review | [V2], [SMITH], [ZWART], [SLAMMD], [TB-013], [FAQ] |
| Bone mineral density | Healthy T-score >= -1.0 [NASA brief] | -1 to 1.5% per month at hip, spine, legs without countermeasures (meta-analysis: legs -0.8%/month). No loss detectable under 90 days. Recovery takes longer than the loss. | DXA before and after flight (not in flight). In-flight: exercise logs; bone markers in research only. | G: hip/spine >= 95%, femoral neck >= 90% of preflight; vitamin D >= 35 ng/mL [NASA]<br>Y: hip/spine 90-95%, neck 85-90%, or vitamin D 20-34, or > 1 week missed exercise [Team]<br>R: below Yellow, T <= -2.0, any fracture, new back/hip pain [NASA/Team] | Any value under [V1 4027] limits; fracture; kidney-stone pain [NASA/Team] | ARED resistance exercise (up to 600 lbf); vitamin D 25 µg (1,000 IU)/day; adequate calories; bisphosphonate studied, not routine | [V1], [V2], [MTB-013], [EVID-BONE], [STAV] |
| Vision / SANS | 20/20 corrected acuity; no optic disc swelling | About 70% of long-duration crew show >= 1 sign; 18% clinically concerning. Choroidal folds about 25%, globe flattening about 25%, hyperopic (far-sighted) shift +0.5 to +2.0 D. All corrected to 20/20 after flight. | OCT, fundoscopy, ultrasound, visual acuity, Amsler grid, tonometry; "Eye Weeks" at flight day 30, 90 and 30 days before return. | G: no new blur, Amsler grid normal [Team]<br>Y: new near-vision blur, 1-line acuity drop, shift >= 0.5 D [Team on Mader 2011]<br>R: Amsler distortion, headache + vision change, OCT retina +19.4 µm or more, Frisén grade >= 1 [NASA values] | Any Yellow or Red; do not wait for the next Eye Week (unverified as a formal rule) | Spare glasses (3 pairs of varying power); lower body negative pressure and thigh cuffs under study | [MTB-001], [LEE2020], [MADER] |
| Radiation dose | US average about 6.2 mSv per year (620 millirem), half from natural background [NRC] | ISS about 0.5-0.6 mSv/day; 50-100 mSv per 6 months. Mars mission estimate 625-1,650 mSv, above the 600 mSv limit. | Crew Passive Dosimeter (each crew member); Crew Active Dosimeter (since 2020, live display); REM / ISS-HERA (Timepix) in 6 modules; TEPC. | G: career < 400 mSv and < 1.0 mSv/day [Team]<br>Y: 400-540 mSv, or 1.0-1.3 mSv/day, or caution alert [Team; 1.3 mSv/day is NASA design rate]<br>R: >= 540 mSv (90% of limit), > 1.3 mSv/day sustained, shelter alert, nausea after solar event [Team] | Any solar particle event, shelter recommendation, projected career > 600 mSv [NASA/Team] | Shelter in most-shielded area; stow mass around crew; delay or end EVA | [V1], [TB-020], [SIMONSEN], [GEORGE], [SRAG], [ARTEMIS2], [NRC] |
| Hydration and urine | Urine 2-2.5 L/day; urine specific gravity < 1.020 (athletes) [Clin] | Urine volume -47% early and -39% late in flight. Actual ISS intake about 2.0-2.3 L/day. Kidney stone: 43 events in 29 crew since 2016 (none in flight for US crew); 2nd most likely ISS evacuation cause (model). | Fluid log; urine volume; urinalysis (CHeCS list includes specific gravity). | G: intake >= 2.5 L/day, pale urine [NASA/Team]<br>Y: 2.0-2.5 L/day, urine colour 4-5, urine 1.5-2 L/day [Team]<br>R: < 1.5 L/day intake or urine, colour >= 6, flank pain, blood in urine [Team; 1.5 L/day risk point NASA] | Red; any suspected stone [Team] | Drink >= 2.5 L/day to make 2.5-3 L urine; potassium citrate per flight surgeon; avoid excess calcium | [V2], [TB-027], [EVID-RENAL], [MTB-003], [MCKENZIE], [USG] |
| Cabin CO2 and symptoms | Indoor air on Earth 0.6-0.76 mmHg | ISS held at or below 3 mmHg 24-h average since 2016; ISS range 1-9 mmHg. 19 of 49 astronauts reported headaches. Headaches at 2.8-4.5 mmHg; fatigue, nausea above 4.5 mmHg. | Cabin analysers (Major Constituent Analyzer on ISS); crew symptom report. | G: <= 2.5 mmHg (headache risk < 1%) [NASA]<br>Y: 2.5-3.0 mmHg, or headache [NASA/Team]<br>R: > 3.0 mmHg 1-h average [NASA limit], or > 4.5 mmHg, or headache + fatigue/nausea [NASA] | Any reading > 3 mmHg or symptomatic crew [Team on NASA limit] | Increase ventilation / CO2 scrubbing; move to a well-ventilated module; analgesics for headache | [TB-004], [V2], [TRIALX] |
| Headache and space adaptation sickness | No symptoms | Space adaptation sickness in 70-90% of crew, onset in days 3-7, motion sickness lasts about 3 days. Headache in up to 90% in the first days. Back pain 52% in days 2-5. | Symptom questionnaire. | G: none [Team]<br>Y: symptoms in first 3 days of flight [NASA-reported pattern]<br>R: vomiting with no fluid intake, symptoms > 3 days, headache with vision change [Team] | Red; vomiting with dehydration risk [Team] | Promethazine (up to 90% response) per flight surgeon; sleep, hydration, analgesics | [MTB-004], [TB-044] |
| Orthostatic tolerance (landing or surface arrival) | No dizziness on standing | Intravascular volume about -15%; in bed-rest about 50% of women were presyncopal within 10 min of 30° tilt. | Stand test: HR and BP lying vs standing. | G: no symptoms [Team]<br>Y: light-headed, HR rise > 30 bpm on standing [Team]<br>R: fainting, BP drop with symptoms [Team] | Any Red [Team] | Fluid loading (24-48 oz salt water); compression garments; cooling garments | [TB-019] |

## Countermeasures by HRP risk (feeds the "guidance" screen)

| HRP risk (name as listed by NASA) | Countermeasure | Dose / schedule | Source |
|---|---|---|---|
| Reduced cardiorespiratory and musculoskeletal fitness | ARED (resistance), T2 (treadmill), CEVIS (cycle) | Average 2 h a day; NASA FAQ says 2.5 h scheduled | [EX-NASA], [FAQ] |
| Spaceflight-induced bone changes | ARED loading; vitamin D; energy intake | ARED up to 600 lbf; vitamin D 25 µg/day; 1,000 IU daily if blood level >= 35 ng/mL | [MTB-013], [V2] |
| Cardiovascular adaptations | Aerobic exercise; fluid loading and salt before landing; compression and cooling garments | 24-48 oz salt-water before deorbit; reentry fluid load >= 1 L | [TB-019], [V2] |
| Inadequate food and nutrition | Individual energy target (EER); daily intake log; dietitian review | Standard average 3,035 kcal/day; +200 kcal per EVA hour; log sent weekly | [V2], [FAQ] |
| Inadequate sleep and irregular schedules | Sleep hygiene; light timing; melatonin or hypnotic per flight surgeon; sleep class every 3 years | No caffeine 6-12 h before sleep; bright light 1-2 h after waking; avoid bright light 1-2 h before bed | [MTB-009], [TB-041] |
| Behavioral changes and psychiatric disorders | PPCs, family conferences, care packages, monthly WinSCAT, team training | PPC frequency set by behavioural health provider [V1 6010] | [TB-016], [V1] |
| SANS | Spare glasses of increasing power; research on lower body negative pressure, thigh cuffs, B vitamins | 3 pairs of lenses per crew member | [MTB-001] |
| Radiation-induced cancers (and acute effects) | Dosimetry, shelter, EVA planning | Shelter on alert; +10 cm water-equivalent storm shelter design | [TB-020], [SRAG] |
| Hypoxia | Cabin O2 control; O2 masks | Don mask at any hypoxia symptom | [TB-003] |
| Renal stones (urinary health) | Hydration; potassium citrate | >= 2.5 L water/day | [MTB-003], [EVID-RENAL] |

## Escalation logic (team proposal)

| Rule | Action | Basis |
|---|---|---|
| Any Red value | Notify crew medical officer now; send to flight surgeon at the next contact; immediate contact for chest pain, BP > 180/120, SpO2 <= 88%, self-harm thoughts, suspected stone. | [Team] on [Clin] values |
| Yellow on 2 readings within 72 h, or a steady trend for 7 days | Flag for the next private medical conference (PMC). | [Team]. PMC schedule set by flight surgeon [V1 6002]. |
| NASA limit crossed (radiation, CO2, bone, water) | Always report to ground, even without symptoms. | [NASA] limits in [V1], [V2] |
| Communication delay (Moon, Mars) | Show the crew-side action first (what to do now), then queue the ground report. | [Team]. V1 6002 rationale allows other modalities when there are communication delays. |

## Suggested measurement schedule

| When | What | Basis |
|---|---|---|
| Daily | Sleep hours, mood check (2 questions), fluid intake, symptoms (headache, nausea, vision), food log | [MTB-009], [TB-027], [FAQ] |
| Weekly | Resting HR and BP, body mass, full PHQ-9 | [Team] |
| Monthly | Cognitive test (WinSCAT in current practice) | [TB-016] |
| Flight day 30, 90, return minus 30 | Eye Week: OCT, fundoscopy, ultrasound, acuity, Amsler grid | [MTB-001] |
| Continuous | Radiation dose rate (crew dosimeter), cabin CO2 | [SRAG], [TB-004] |

## Not verified

| Item | Status |
|---|---|
| Numeric caution and shelter dose-rate thresholds on Orion and ISS | Not public. |
| A NASA body-mass % limit | None found in Vol 1 Rev C or Vol 2 Rev F. |
| A NASA urine colour or specific-gravity self-check | None found; the colour and USG rows use athlete studies. |
| A formal rule for when crew must report vision change | None found; NASA tests at Eye Weeks and "as clinically indicated". |
| Glucose meter in today's ISS kit | Not confirmed. The 2004 CHeCS requirement list includes blood glucose, and the i-STAT analyser is documented on ISS (NASA/TM-2010-215845). |
| TrialX article | Vendor blog, used only for device examples on private missions. |

## Sources

| Label | Source | Link |
|---|---|---|
| V1 | NASA-STD-3001 Volume 1 Rev C (2023-09-15) | https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf |
| V2 | NASA-STD-3001 Volume 2 Rev F (2026-07-14) | https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf |
| STDS | OCHMO standards page | https://www.nasa.gov/ochmo/human-spaceflight-and-aviation-standards |
| TB index | OCHMO technical briefs list | https://www.nasa.gov/ochmo/hsa-standards/ochmo-technical-briefs/ |
| TB-003 | Habitable Atmosphere, Rev A (11/30/2023) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf |
| TB-004 | Carbon Dioxide, Rev D (10-Mar-26) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf |
| TB-013 | Food and Nutrition, Rev E (12/07/2023) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-013-food-and-nutrition.pdf |
| TB-016 | Behavioral Health and Performance, Rev B (10/24/2023) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf |
| TB-019 | Orthostatic Intolerance, Rev B (12/01/2023) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-019-orthostatic-intolerance.pdf |
| TB-020 | Radiation Protection, Rev G (06/06/2025) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf |
| TB-027 | Water, Rev C (11/29/2023) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-027-water.pdf |
| TB-041 | Sleep Accommodations, Rev B (10/23/2023) | https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-041-sleep-accommodations.pdf |
| TB-044 | Medical Operations, Rev C (08/13/2025) | https://www.nasa.gov/wp-content/uploads/2025/08/ochmo-tb-044-medical-operations.pdf |
| MTB-001 | SANS (02/21/2024) | https://www.nasa.gov/wp-content/uploads/2024/02/ochmo-mtb-001-sans.pdf |
| MTB-003 | Urinary Health, Rev A (Mar 2026) | https://www.nasa.gov/wp-content/uploads/2025/01/ochmo-mtb-003-urinary-health.pdf |
| MTB-004 | Space Adaptation Sickness, Rev A (09/25/2025) | https://www.nasa.gov/wp-content/uploads/2025/09/ochmo-mtb-004-space-adaptation-sickness-sas.pdf |
| MTB-009 | Circadian Desynchrony, Rev C (4-Mar-26) | https://www.nasa.gov/wp-content/uploads/2026/03/ochmo-mtb-009-circadian-desynchrony.pdf |
| MTB-013 | Bone Loss, Rev D (11-Feb-26) | https://www.nasa.gov/wp-content/uploads/2026/02/ochmo-mtb-013-bone-loss.pdf |
| HRP-RISKS | NASA HRP risk list | https://www.nasa.gov/hrp/risks/ |
| EVID-BONE | HRP Evidence Report, bone (2017) | https://ntrs.nasa.gov/api/citations/20170004597/downloads/20170004597.pdf |
| EVID-RENAL | HRP Evidence Report, renal stone (2017) | https://ntrs.nasa.gov/api/citations/20170004709/downloads/20170004709.pdf |
| NASA-TM-2010 | Portable Diagnostics Technology Assessment, Part 2 (CHeCS assay list, i-STAT) | https://ntrs.nasa.gov/api/citations/20100011008/downloads/20100011008.pdf |
| CHECS | NASA intern report on the ISS Crew Health Care System (Medical Diagnostics Pack: BP cuffs, stethoscope, tonometer), 2011 | https://ntrs.nasa.gov/api/citations/20110011351/downloads/20110011351.pdf |
| EX-NASA | NASA: Counteracting Bone and Muscle Loss (2 h/day) | https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/ |
| FAQ | NASA: The Real Story About Astronaut Health Care (2.5 h, food log) | https://www.nasa.gov/missions/station/faq-the-real-story-about-astronaut-health-care-in-space/ |
| BIOMON | CSA Bio-Monitor (sensor list) | https://www.asc-csa.gc.ca/eng/sciences/astroskin.asp |
| SLAMMD | NASA image note on SLAMMD | https://www.nasa.gov/image-detail/gmt147_12_51_michael-barratt_a-few-crew-shots/ |
| SRAG | NASA Space Radiation Analysis Group, dosimeters and SPE actions | https://srag.jsc.nasa.gov/spaceradiation/how/how.cfm |
| ARTEMIS2 | NASA: protecting Artemis II astronauts (radiation) | https://science.nasa.gov/missions/artemis/artemis-2/to-protect-artemis-ii-astronauts-nasa-experts-keep-eyes-on-sun/ |
| SIMONSEN | NASA HQ radiation slides 2024 (ISS 0.6 mSv/day, Mars estimate) | https://ntrs.nasa.gov/api/citations/20240009831/downloads/NAS%20BPS%20Simonsen%20v4%20strives.pdf |
| GEORGE | NASA SRAG seminar 2025 (ISS 0.5 mGy/day, Mars profiles) | https://ntrs.nasa.gov/api/citations/20250002757/downloads/Slides_Seminar_2025.pdf |
| NORSK | Norsk et al. 2015, J Physiol (BP -8 to 10 mmHg, n=8) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4324706/ |
| STAHN | Stahn et al. 2017, Sci Rep (core temp +1 °C) | https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078/ |
| HUGHSON | Hughson et al. 2016, Am J Physiol (insulin resistance, n=8) | https://pubmed.ncbi.nlm.nih.gov/26747504/ |
| BARGER | Barger et al. 2014, Lancet Neurol (sleep 6 h) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/ |
| SMITH | Smith, Heer, Zwart, NASA (body mass -2 to 5%) | https://ntrs.nasa.gov/api/citations/20140013313/downloads/20140013313.pdf |
| ZWART | Zwart et al. 2014, Aviat Space Environ Med (SLAMMD vs BMMD) | https://doi.org/10.3357/ASEM.3979.2014 |
| STAV | Stavnichuk et al. 2020, npj Microgravity (bone meta-analysis) | https://pmc.ncbi.nlm.nih.gov/articles/PMC7200725/ |
| LEE2020 | Lee et al. 2020, npj Microgravity (SANS review) | https://www.nature.com/articles/s41526-020-0097-9 |
| MADER | Mader et al. 2011, Ophthalmology (hyperopic shift) | https://pubmed.ncbi.nlm.nih.gov/21849212/ |
| PHQ9 | Kroenke et al. 2001, J Gen Intern Med (PHQ-9 bands) | https://pmc.ncbi.nlm.nih.gov/articles/PMC1495268/ |
| MP-PULSE | MedlinePlus: Pulse (60-100 bpm) | https://medlineplus.gov/ency/article/003399.htm |
| MP-VITALS | MedlinePlus: Vital signs | https://medlineplus.gov/ency/article/002341.htm |
| MP-BP | MedlinePlus: High blood pressure (categories) | https://medlineplus.gov/ency/article/000468.htm |
| AHA2025 | 2025 AHA/ACC High Blood Pressure Guideline (publisher blocks scripts; opens in browser) | https://doi.org/10.1161/HYP.0000000000000249 |
| AHA-PT | Pharmacy Times summary of AHA/ACC 2025 (severe hypertension > 180/120) | https://www.pharmacytimes.com/view/new-2025-hypertension-management-guidelines-include-key-updates |
| MP-OX | MedlinePlus: Pulse oximetry (95-100%, <= 92%, <= 88%) | https://medlineplus.gov/lab-tests/pulse-oximetry/ |
| MP-TEMP | MedlinePlus: Normal body temperature | https://medlineplus.gov/ency/article/001982.htm |
| MP-HYPOTH | MedlinePlus: Hypothermia (< 35 °C) | https://medlineplus.gov/ency/article/000038.htm |
| MP-GLU | MedlinePlus: Blood sugar test | https://medlineplus.gov/ency/article/003482.htm |
| MP-HYPO | MedlinePlus: Low blood sugar (< 70, < 54) | https://medlineplus.gov/ency/article/000386.htm |
| MCKENZIE | McKenzie et al. 2015, J Athl Train (urine colour) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4741257/ |
| USG | Hydration biomarker cut-offs (USG < 1.020) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4912946/ |
| TRIALX | TrialX blog: how health data is collected in space (vendor source) | https://trialx.com/how-health-data-is-collected-in-space-missions/ |
| NRC | US NRC: doses in our daily lives (620 millirem per year) | https://www.nrc.gov/about-nrc/radiation/around-us/doses-daily-lives.html |

[V1]: https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf
[V2]: https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf
[TB-003]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf
[TB-004]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf
[TB-013]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-013-food-and-nutrition.pdf
[TB-016]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf
[TB-019]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-019-orthostatic-intolerance.pdf
[TB-020]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf
[TB-027]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-027-water.pdf
[TB-041]: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-041-sleep-accommodations.pdf
[TB-044]: https://www.nasa.gov/wp-content/uploads/2025/08/ochmo-tb-044-medical-operations.pdf
[MTB-001]: https://www.nasa.gov/wp-content/uploads/2024/02/ochmo-mtb-001-sans.pdf
[MTB-003]: https://www.nasa.gov/wp-content/uploads/2025/01/ochmo-mtb-003-urinary-health.pdf
[MTB-004]: https://www.nasa.gov/wp-content/uploads/2025/09/ochmo-mtb-004-space-adaptation-sickness-sas.pdf
[MTB-009]: https://www.nasa.gov/wp-content/uploads/2026/03/ochmo-mtb-009-circadian-desynchrony.pdf
[MTB-013]: https://www.nasa.gov/wp-content/uploads/2026/02/ochmo-mtb-013-bone-loss.pdf
[EVID-BONE]: https://ntrs.nasa.gov/api/citations/20170004597/downloads/20170004597.pdf
[EVID-RENAL]: https://ntrs.nasa.gov/api/citations/20170004709/downloads/20170004709.pdf
[NASA-TM-2010]: https://ntrs.nasa.gov/api/citations/20100011008/downloads/20100011008.pdf
[CHECS]: https://ntrs.nasa.gov/api/citations/20110011351/downloads/20110011351.pdf
[EX-NASA]: https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/
[FAQ]: https://www.nasa.gov/missions/station/faq-the-real-story-about-astronaut-health-care-in-space/
[BIOMON]: https://www.asc-csa.gc.ca/eng/sciences/astroskin.asp
[SLAMMD]: https://www.nasa.gov/image-detail/gmt147_12_51_michael-barratt_a-few-crew-shots/
[SRAG]: https://srag.jsc.nasa.gov/spaceradiation/how/how.cfm
[ARTEMIS2]: https://science.nasa.gov/missions/artemis/artemis-2/to-protect-artemis-ii-astronauts-nasa-experts-keep-eyes-on-sun/
[SIMONSEN]: https://ntrs.nasa.gov/api/citations/20240009831/downloads/NAS%20BPS%20Simonsen%20v4%20strives.pdf
[GEORGE]: https://ntrs.nasa.gov/api/citations/20250002757/downloads/Slides_Seminar_2025.pdf
[NORSK]: https://pmc.ncbi.nlm.nih.gov/articles/PMC4324706/
[STAHN]: https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078/
[HUGHSON]: https://pubmed.ncbi.nlm.nih.gov/26747504/
[BARGER]: https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/
[SMITH]: https://ntrs.nasa.gov/api/citations/20140013313/downloads/20140013313.pdf
[ZWART]: https://doi.org/10.3357/ASEM.3979.2014
[STAV]: https://pmc.ncbi.nlm.nih.gov/articles/PMC7200725/
[LEE2020]: https://www.nature.com/articles/s41526-020-0097-9
[MADER]: https://pubmed.ncbi.nlm.nih.gov/21849212/
[PHQ9]: https://pmc.ncbi.nlm.nih.gov/articles/PMC1495268/
[MP-PULSE]: https://medlineplus.gov/ency/article/003399.htm
[MP-BP]: https://medlineplus.gov/ency/article/000468.htm
[AHA2025]: https://doi.org/10.1161/HYP.0000000000000249
[AHA-PT]: https://www.pharmacytimes.com/view/new-2025-hypertension-management-guidelines-include-key-updates
[MP-OX]: https://medlineplus.gov/lab-tests/pulse-oximetry/
[MP-TEMP]: https://medlineplus.gov/ency/article/001982.htm
[MP-HYPOTH]: https://medlineplus.gov/ency/article/000038.htm
[MP-GLU]: https://medlineplus.gov/ency/article/003482.htm
[MP-HYPO]: https://medlineplus.gov/ency/article/000386.htm
[MCKENZIE]: https://pmc.ncbi.nlm.nih.gov/articles/PMC4741257/
[USG]: https://pmc.ncbi.nlm.nih.gov/articles/PMC4912946/
[TRIALX]: https://trialx.com/how-health-data-is-collected-in-space-missions/
[NRC]: https://www.nrc.gov/about-nrc/radiation/around-us/doses-daily-lives.html
