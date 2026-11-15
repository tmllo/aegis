# e^x Crew UX constraints

Research for the Crew Console concepts. Every figure has a source link (all opened 2026-11-15). "Derived" = our own arithmetic, not a quoted requirement.

## Summary
| Topic | Design number |
|---|---|
| Touch target | 15 mm bare hand, 20 mm gloved, 3 mm gap |
| Text height | 0.25 deg minimum, 0.4 deg for labels and critical values |
| Feedback | 0.1 s tap echo, 1.0 s new view |
| Workload | Bedford 3 or less nominal, usability score 85 or higher |
| Alerts | Personal baseline, 2 or more signals, few and trusted |

## 1. NASA-STD-3001 Vol 2 (Rev C, 2022): display and control requirements
Source for all rows: [NASA-STD-3001 Vol 2 Rev C PDF](https://www.nasa.gov/wp-content/uploads/2020/10/2022-04-08_nasa-std-3001_vol_2_rev_c_final.pdf). The standard gives no touch target size in mm; see section 2.
| Requirement | Number | For e^x |
|---|---|---|
| Character height [V2 10049], label height [V2 10066] | 0.25 deg minimum, 0.4 deg preferred and required for labels (0.25 deg = 10 pt at 32 in) | Derived at 60 cm: about 14 px floor, about 22 px for labels and values |
| Character contrast [V2 10049] | 0.2 Weber minimum, with ambient light | Use the stricter 4.5:1 below |
| Display contrast, viewing angle [V2 10048] | Ambient contrast 10; legible at +/-45 deg | Readable off-axis, no thin grey on navy |
| Response time [V2 10022] | 0.1 s input echo; 0.5 s popup; 1.0 s new display; progress shown within 1.0 s | Press state within 100 ms; body-to-panel under 1 s |
| Usability [V2 10001] | NASA-modified SUS 85 or higher | Test target for the pick |
| Cognitive workload [V2 5007] | Bedford 3 or less nominal, 6 or less off-nominal | One decision per screen |
| Design-induced errors [V2 10002] | 0% catastrophic; 5% per user; 10% per step ([OCHMO brief](https://www.nasa.gov/sites/default/files/atoms/files/usability_workload_error_technical_brief_ochmo.pdf)) | Confirm step on escalation, undo elsewhere |
| Suited controls [V2 10081] | Gloved speed and accuracy comparable to unsuited; more haptic feedback | Larger targets plus Wrist pulse |

## 2. Touch, gloves, vibration, microgravity
| Finding | Number | Source |
|---|---|---|
| MIL-STD-1472 touch zone, bare hand | 15 mm square, 3 mm separation | [Springer chapter, 2016](https://link.springer.com/chapter/10.1007/978-3-319-40406-6_7) |
| Same, gloved (military cockpits) | 20 mm square | [Same chapter](https://link.springer.com/chapter/10.1007/978-3-319-40406-6_7) |
| Web floor / enhanced target | 24 px / 44 px (CSS) | [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) |
| Text contrast | 4.5:1 normal, 3:1 large | [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |
| Colour never the only cue | Shape, icon or text as well | [WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) |
| Reading under vibration (Orion-like display, 3.8 G) | No effect at 0.15 and 0.3 g; errors and time worse at 0.5 and 0.7 g with 10 pt type | [NASA Ames, NTRS 20150000242](https://ntrs.nasa.gov/citations/20150000242) |
| Fine motor skill on a touchscreen in orbit | 7 astronauts: worse in the first week on orbit and the first month after landing; no deficit after adapting | [Holden et al. 2022](https://pubmed.ncbi.nlm.nih.gov/35609944/) |
| Crew Dragon | Crew and SpaceX refined how a touch registers to avoid mistaken touches; fixed minimum button size for gloves; navigation at the bottom (arms raised); tested on a vibration table in helmets | [Space.com](https://www.space.com/spacex-crew-dragon-touchscreen-astronaut-thoughts.html), [Adobe interview](https://blog.adobe.com/en/publish/2022/01/20/ux-in-space-the-role-of-human-centered-design-in-space-exploration) |

Derived pixel sizes: 15 mm = 57 px and 20 mm = 76 px at 96 px per inch; on a tablet (about 132 px per inch) 78 px and 104 px. Use 72 px minimum, 96 px for primary and emergency controls, 12 px gaps, then measure on the real screen.

## 3. Crew medical workflow
| Fact | Number | Source |
|---|---|---|
| Private medical communication | Routine schedule set by the flight surgeon [V1 6002] | [NASA medical operations](https://www.nasa.gov/reference/6-0-medical-operations/) |
| Private medical conference | Weekly; details stay with the surgeon | [NASA flight surgeons](https://www.nasa.gov/directorates/esdmd/hhp/flight-surgeons) |
| Length | 15 minutes per crew member (one surgeon's account) | [The DO interview](https://thedo.osteopathic.org/2018/09/space-medicine-qa-nasa-do-on-his-upcoming-antarctica-iss-missions/) |

Consequence: e^x has about 15 minutes a week of surgeon attention to feed. Health detail is private by default: the crew overview shows status only; values open for the owner and the crew medical officer.

## 4. Cognitive load in isolation
| Finding | Number | Source |
|---|---|---|
| Sleep on the ISS | About 6 h (6.09 h) against 8.5 h scheduled; 75% used sleep medication at some point | [PBS on Barger et al. 2014](https://www.pbs.org/newshour/science/ten-year-astronaut-sleep-study-reveals-widespread-use-sleeping-pills-space) |
| Mars-500, 520 days | Sleep time +8.4% (0.59 h per day), activity fell; most crew had sleep, vigilance or timing disturbances | [Basner et al. 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3574912) |
| Alarm fatigue | 88.8% of 12,671 arrhythmia alarms false; 2.5 million alarms in one month | [UNC / UCSF study](https://nursing.unc.edu/news/modern-monitoring-systems-contribute-to-alarm-fatigue-in-hospitals) |

Consequence: the user is often short on sleep and less vigilant. Fewer, trusted alerts beat complete ones (this is why e^x uses the 3-day rule).

## 5. Health-app patterns worth borrowing
| App | Pattern | Number | Source |
|---|---|---|---|
| Apple Vitals | Own "typical range"; alert only when several signals agree | 7 nights to set the range; notify at 2 or more outliers | [Apple guide](https://support.apple.com/guide/watch/apd15aa7ed96), [Apple 120142](https://support.apple.com/120142) |
| Whoop | One number, three colours, one line of advice | Green 67-100%, yellow 34-66%, red 0-33% | [Whoop 101](https://developer.whoop.com/docs/whoop-101) |
| Oura | Score, then contributors, each with a word rating | 85-100 optimal, 70-84 good, 60-69 fair, 0-59 pay attention | [Oura support](https://support.ouraring.com/hc/en-us/articles/360057791533) |

Borrow: value shown inside the person's own band; region first, numbers second; a word next to every colour. Leave out: streaks, badges, composite "scores" that e^x cannot source from its data.

## 6. Ten rules for the concepts
| # | Rule |
|---|---|
| 1 | Body first: the body is the navigation. Tap a region to get its vitals; no menu needed to find a problem. |
| 2 | One primary action per screen, same place every time (bottom edge), maximum 3 taps from overview to action. |
| 3 | Touch targets at least 15 mm (72 px); primary and emergency controls 20 mm (96 px); 3 mm (12 px) gaps. Body regions get hit areas larger than the organ drawn. |
| 4 | Status by shape and word as well as colour: green dot, amber triangle, red square, each with a 1-word label. |
| 5 | Text never under 0.25 deg (about 14 px); labels and critical values at 0.4 deg or more (about 22 px and up); contrast 4.5:1 or better. |
| 6 | Every tap answers within 0.1 s; every new view within 1.0 s; anything slower shows progress. |
| 7 | Each value sits on the person's own baseline band, with direction and days running. No bare numbers. |
| 8 | Alert rarely: only confirmed drifts interrupt; green stays quiet; one alert states where, what, and the next step. |
| 9 | No precision gestures: no hover, drag, pinch or long-press required. Body rotation is optional and has button equivalents. Escalation needs a confirm; everything else can be undone. |
| 10 | Private by default and offline always: overview shows status only, values for the owner and crew medical officer; the amber path ends in "flag for next medical conference". |
