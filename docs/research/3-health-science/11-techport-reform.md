# NASA TechPort: REFORM wearable diagnostics (project 118362)

Source (user-supplied): https://techport.nasa.gov/projects/118362. Read via the public TechPort API on 2026-11-14; raw record in `../samples/techport_118362.json`.

## Summary
| Item | Detail |
|---|---|
| Project | REFORM: REconfigurable antennas FOR wearable space Medical diagnostics |
| Lead | Ohio State University (Columbus, OH), NASA Space Technology Research Grants (STMD) |
| Dates / status | 2021-08-16 to 2025-08-15, Completed (record updated 2026-05-06) |
| Maturity | TRL 2 at start, 2 current, 3 target: lab concept, not flown |
| Destinations | Moon and cislunar, Mars |
| Taxonomy | TX06.3.1 Medical Diagnosis and Prognosis |
| What it does | Fabric with conformal "into-body" antennas that switch between 4 modes to monitor **muscle atrophy, bone loss and body fluid distribution**, worn before, during and after missions |
| Library / outcomes | None published on the record |
| Value for us | NASA-funded evidence that the three hardest-to-track spaceflight changes (muscle, bone, fluid shift) are a recognised gap, and that NASA wants devices that "provide real-time feedback to the crew". |

## NASA's stated requirements for crew medical devices (from the REFORM description)
| Requirement | Our app's answer |
|---|---|
| Reduced resource and logistical needs | Runs on existing tablet/laptop; no new hardware |
| Reusable, autonomous, accurate | Works offline; rules run on board; shows data quality and confidence per reading |
| Low size, weight and power | Software only |
| Real-time feedback to the crew | Live status per indicator with next action |

## How to use this in the build
| Move | Reason |
|---|---|
| Add three "slow" body-map layers: muscle, bone, fluid shift | Directly named by REFORM as gaps; other teams mostly show only vitals |
| Feed them from simulated weekly readings ("REFORM-class sensor, TRL 3, future") and real proxies today: body mass, calf circumference, bone density targets from 03 | Honest about maturity; still grounded in NASA work |
| Quote the "real-time feedback to the crew" requirement in the pitch | A NASA source stating the exact need the challenge asks for |

## TechPort API notes
| Call | Result |
|---|---|
| `GET https://techport.nasa.gov/api/projects/118362` | Works, no key, about 11 KB JSON |
| `GET https://techport.nasa.gov/api/projects/search?searchQuery=...` | Returns 75-85 MB per query (the query barely filters) and timed out; do not call from the app. Use the TechPort website search, then fetch single projects by ID. |
| Related area to browse | TX06.3.1 Medical Diagnosis and Prognosis on https://techport.nasa.gov |
