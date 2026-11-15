# OSDR study catalog: human studies for the health monitor

Source search (user-supplied): https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study
Queried via the OSDR search API on 2026-11-14. Raw list: `../samples/osdr_human_studies_2026-11-14.json`.

## Summary
| Item | Result |
|---|---|
| Studies in OSDR (cgene / alsda) | 577 / 85 |
| Human (Homo sapiens) studies | 116 (cgene) + 7 (alsda), 4 overlap |
| ESA source | Filter works only in the web UI. The API rejects `type=esa` ("Invalid type"). ESA's own archive (HREDA) is covered in `02-datasets.md`. |
| Directly usable as health-indicator values | OSD-575, OSD-569, OSD-656 (Inspiration4 clinical labs). Everything else is omics or cell/tissue research. |
| Best use of the rest | Evidence behind the body map: "why this organ is at risk", with a study link per body part. |

## Tier 1: real crew clinical values (load into the app)
| Study | Content | Body-map use | URL |
|---|---|---|---|
| OSD-575 | Inspiration4 metabolic panel (glucose, electrolytes, kidney, liver) + cardiac/immune cytokines, with lab reference ranges | Blood, kidneys, liver, heart | https://osdr.nasa.gov/bio/repo/data/studies/OSD-575 |
| OSD-569 | Inspiration4 complete blood count + omics | Blood, immune system | https://osdr.nasa.gov/bio/repo/data/studies/OSD-569 |
| OSD-656 | Inspiration4 urine inflammation panel | Kidneys, inflammation | https://osdr.nasa.gov/bio/repo/data/studies/OSD-656 |

## Tier 2: astronaut molecular studies (evidence, not live values)
| Study | Topic | Body-map use | URL |
|---|---|---|---|
| OSD-53 | Spaceflight gene expression in astronauts | Immune | https://osdr.nasa.gov/bio/repo/data/studies/OSD-53 |
| OSD-174 | Hair follicles of ISS astronauts | Skin/hair, whole body | https://osdr.nasa.gov/bio/repo/data/studies/OSD-174 |
| OSD-316 | Antibody (IgM) repertoire after long flight | Immune | https://osdr.nasa.gov/bio/repo/data/studies/OSD-316 |
| OSD-353 | Plasma proteome, real missions and analogs | Blood | https://osdr.nasa.gov/bio/repo/data/studies/OSD-353 |
| OSD-359 | Exhaled breath proteome after long flights | Lungs | https://osdr.nasa.gov/bio/repo/data/studies/OSD-359 |
| OSD-483 / OSD-484 | Astronaut plasma vesicles; effect on heart cells | Heart | https://osdr.nasa.gov/bio/repo/data/studies/OSD-484 |
| OSD-530 | JAXA cell-free RNA, 6 astronauts > 120 days | Whole body | https://osdr.nasa.gov/bio/repo/data/studies/OSD-530 |
| OSD-570 / 571 / 574 / 687 | Inspiration4 immune cells, plasma, skin, T-cells | Immune, skin | https://osdr.nasa.gov/bio/repo/data/studies/OSD-571 |
| OSD-903 / OSD-943 | Axiom astronauts, immune transcriptome and methylation | Immune | https://osdr.nasa.gov/bio/repo/data/studies/OSD-903 |

## Tier 3: Earth analogs
| Study | Analog | Body-map use | URL |
|---|---|---|---|
| OSD-140 | Mars-520 isolation, epigenetics | Behavioral health | https://osdr.nasa.gov/bio/repo/data/studies/OSD-140 |
| OSD-51, OSD-195, OSD-198 | Bed rest (and hypoxia), skeletal muscle | Muscle | https://osdr.nasa.gov/bio/repo/data/studies/OSD-195 |
| OSD-942 / OSD-946 | Bed rest with exercise countermeasure | Muscle (shows exercise works) | https://osdr.nasa.gov/bio/repo/data/studies/OSD-942 |
| OSD-172 / OSD-188 | Parabolic flight / sounding rocket, T cells | Immune | https://osdr.nasa.gov/bio/repo/data/studies/OSD-172 |

## Tier 4: lab studies on organ risks
| Risk | Studies | Body-map use |
|---|---|---|
| Eyes (SANS) | OSD-815, 816, 817, 818 | Eyes |
| Heart | OSD-258 (heart cells in flight), OSD-52 / 577 / 635 (blood vessels) | Heart, vessels |
| Muscle | OSD-684, OSD-781, OSD-937 (muscle chips) | Muscle |
| Brain | OSD-941, 999, 1000, 1008 (brain organoids, radiation) | Brain |
| Radiation (blood, skin, gut, lungs) | OSD-71, 157, 285, 317, 410, 992, 993, 1010, 1012, 1014 | Radiation layer |

## API calls used
```
curl "https://osdr.nasa.gov/osdr/data/search?term=&type=cgene&ffield=organism&fvalue=Homo%20sapiens&size=200"
curl "https://osdr.nasa.gov/osdr/data/search?term=&type=alsda&ffield=organism&fvalue=Homo%20sapiens&size=200"
```
The search API has no CORS header (see `02-datasets.md`), so call it server-side or use the saved JSON. Data use: NASA SMD Science Information Policy; cite each study.
