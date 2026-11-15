# AEGIS: where space radiation goes in the body (organ dose and cancer-risk data)

Compiled 15 Nov 2026 for the `radiation_organs` lane. Every number has a source. Anything not read straight from a source is marked **HAND-SET** (a working value we chose) or **DERIVED** (our arithmetic on cited numbers).

## The physics in three lines (what the heat map shows)
1. **GCR (cosmic rays) is almost uniform through the body.** On Artemis I, inside Orion, the Helga phantom's GCR-phase absorbed dose was 9.38 mGy on the front skin, 9.44 in the lungs, 9.42 in the stomach, 10.07 in the uterus, 9.56 at the spine and 10.17 on the back skin. That is a spread of under 8% [S3]. The internal rate was 0.379 ± 0.010 mGy/day; with Q = 3.1 that is 1.18 mSv/day [S4]. Shielding barely helps: for ISS GCR, calculations cited in [S6] give *more* absorbed dose behind thicker shielding (85 µGy/day behind ~20 g/cm² Al versus 100 µGy/day behind ~35 g/cm²) because of secondaries.
2. **Solar storms (SPE protons) are soft, so they pile up in surface organs.** Skin, breast, eye lens, salivary glands and thyroid get the most, and deep organs (marrow, gonads, bladder) get the least. Inside Orion, for an Oct 1989-like event, skin got 494 mSv versus 155 mSv in red marrow (whole-body phantom) [S4]. With thin shielding the gap is far bigger: skin/BFO is about 43× in a 0.4 g/cm² suit and about 4.6× in a 10 g/cm² shelter for the Aug 1972 event [S5].
3. **The body shields itself, and so does a shelter.** On the ISS EVA phantom, skin dose was about 20× the deep-organ dose, and the dose drops about 10× within the first 8 mm of tissue [S1, S2]. Extra mass cuts SPE dose hard: the AstroRad vest cut effective dose 58–61% for an Aug 1972-like event and 37–39% for Oct 1989 [S4]. A 10 g/cm² Al shelter meets the 30-day limits for Aug 1972 [S5].

## Table A: per-organ numbers
Columns:
- **w_T**: ICRP 103 tissue weighting factor [S7].
- **D_rel**: ICRP 103 relative detriment, the organ's share of total cancer + heritable harm per Sv, sex- and age-averaged [S8].
- **Trapped H/E**: Artemis I inner Van Allen belt transit, organ dose equivalent ÷ effective dose (1.61 mSv), Helga unvested [S4]. DERIVED ratio.
- **SPE in hull**: NASA dose equivalent (mSv) inside Orion (median shielding ~24.8 g/cm² Al at Helga's seat) for an Aug 1972-like and an Oct 1989-like SPE. Whole-body XCAT female phantom, the values in parentheses in Table 1 of [S4]. Hull = no vest. Vest = with the AstroRad vest.
- **Oct89 H/E**: organ dose ÷ effective dose (219.0 mSv). DERIVED.
- **+5 g/cm² water factor**: dose behind 10 cm ÷ 5 cm of water for the Oct 1989 event (CAM/CAF model, absorbed dose) [S9]. Used as the **HAND-SET** "storm shelter" multiplier on top of the hull value. It is an approximation: behind ~25 g/cm² the spectrum is already hardened, so this probably *overstates* the shelter benefit. Organs with no S9 value use the nearest proxy (named).
- **Shelter est.**: Oct89 hull × factor. DERIVED, label as estimate.

| id | organ | w_T | D_rel | trapped H/E | Aug72 hull | Aug72 vest | Oct89 hull | Oct89 vest | Oct89 H/E | +5 g water factor (source organ) | Oct89 shelter est. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| skin | Skin | 0.01 | 0.007 | 1.31 | 708.4 | 508.0 | 494.4 | 382.4 | 2.26 | 0.36 (skin) | 180 |
| eye_lens | Eye lens | – (limit organ) | – | 1.12 | 235.7 | 229.3 | 234.0 | 228.2 | 1.07 | 0.38 (eye) | 88 |
| brain | Brain | 0.01 | in remainder* | 0.73 | 143.0 | 140.1 | 184.3 | 180.6 | 0.84 | 0.48 (BFO proxy) | 89 |
| salivary | Salivary glands | 0.01 | in remainder* | 1.07 | 223.2 | 194.7 | 224.1 | 202.2 | 1.02 | 0.39 (thyroid proxy) | 88 |
| thyroid | Thyroid | 0.04 | 0.022 | 0.99 | 158.6 | 114.3 | 189.5 | 163.5 | 0.87 | 0.39 (thyroid) | 75 |
| oesophagus | Oesophagus | 0.04 | 0.023 | 0.76 | 84.5 | 48.3 | 149.8 | 111.9 | 0.68 | 0.41 (oesophagus) | 62 |
| breast | Breast | 0.12 | 0.139 | 1.57 | 520.3 | 129.7 | 404.6 | 181.3 | 1.85 | 0.41 (breast, CAF) | 164 |
| lung | Lungs | 0.12 | 0.157 | 1.09 | 245.0 | 95.5 | 254.5 | 153.5 | 1.16 | 0.48 (lung) | 122 |
| heart | Heart (circulatory limit) | – | – | 0.86 | 93.2 | 40.7 | 153.2 | 106.2 | 0.70 | 0.48 (BFO proxy) | 74 |
| liver | Liver | 0.04 | 0.046 | 0.93 | 120.9 | 43.2 | 168.7 | 105.2 | 0.77 | 0.56 (liver) | 95 |
| stomach | Stomach | 0.12 | 0.118 | 0.95 | 122.2 | 43.2 | 167.4 | 106.1 | 0.76 | 0.57 (stomach) | 96 |
| colon | Colon | 0.12 | 0.083 | 0.99 | 136.2 | 49.3 | 176.1 | 109.0 | 0.80 | 0.52 (intestine) | 92 |
| bladder | Bladder | 0.04 | 0.029 | 0.86 | 82.7 | 33.5 | 136.0 | 95.6 | 0.62 | 0.53 (bladder) | 72 |
| gonads | Gonads | 0.08 | 0.044 (heritable) | 0.79 | 52.7 | 26.2 | 115.9 | 86.6 | 0.53 | 0.55 (ovary, CAF) | 64 |
| red_marrow | Red bone marrow (BFO) | 0.12 | 0.107 | 0.78 | 105.9 | 64.6 | 154.6 | 116.8 | 0.71 | 0.48 (BFO) | 75 |
| bone_surface | Bone surface | 0.01 | 0.009 | 0.71 | 172.9 | 151.8 | 195.8 | 176.7 | 0.89 | 0.48 (BFO proxy) | 95 |
| kidney | Kidney (remainder) | in remainder | in remainder* | 0.71 | 97.4 | 40.5 | 154.1 | 100.5 | 0.70 | 0.53 (kidney) | 81 |
| pancreas | Pancreas (remainder) | in remainder | in remainder* | 0.77 | 59.5 | 27.3 | 130.8 | 91.5 | 0.60 | 0.50 (pancreas) | 65 |
| spleen | Spleen (remainder) | in remainder | in remainder* | 0.81 | 135.3 | 49.5 | 179.4 | 110.7 | 0.82 | 0.48 (BFO proxy) | 87 |
| **effective** | Total NASA effective dose | | | 1.00 (1.61 mSv) | **204.2** | **85.3** | **219.0** | **138.2** | 1.00 | | |

\*ICRP "other solid" cancers carry D_rel 0.198 (113.5 per 10,000 per Sv) [S8]. The engine uses two remainder groups. For **risk**, `remainder` (other solid) takes the mean dose of brain, salivary, heart, kidney, pancreas and spleen. For **effective dose**, the ICRP remainder w_T 0.12 takes the mean of heart, kidney, pancreas and spleen, because brain and salivary already have their own w_T of 0.01. These are working choices.
Torso-phantom (ATOM) values without parentheses also exist in [S4] (e.g. Oct89 skin 552.1, marrow 136.8, effective 233.5). We use whole-body because the app shows a whole body.

### Cancer-risk share of an Oct 1989-like storm inside the hull (DERIVED)
share_T = H_T × D_rel,T / Σ, over organs with a D_rel. Remainder is excluded here; the engine includes it.

breast 31.8 %, lung 22.6 %, stomach 11.2 %, red marrow 9.4 %, colon 8.3 %, liver 4.4 %, gonads (heritable) 2.9 %, thyroid 2.4 %, bladder 2.2 %, skin 2.0 %, oesophagus 1.9 %, bone surface 1.0 %.

For uniform GCR the share is just D_rel normalised: lung 20.0, breast 17.7, stomach 15.1, marrow 13.6, colon 10.6, liver 5.9, gonads 5.6, bladder 3.7, oesophagus 2.9, thyroid 2.8, bone surface 1.1, skin 0.9 %. So **for GCR, lung, breast, stomach, marrow and colon carry ~77% of the risk. In a solar storm, breast and lung jump because they sit near the surface.** Breast applies to female crew; for a male crew member the engine sets breast D_rel to 0 and renormalises (HAND-SET simplification, since ICRP D_rel is sex-averaged).

## Table B: shielding stages for the particle visual (Aug 1972 SPE, aluminium) [S5, Table 5]
Dose equivalent in cSv (1 cSv = 10 mSv). Stage thicknesses from the paper text: space suit 0.4, pressure vessel 1, equipment room 5, shelter 10 g/cm².

| stage | g/cm² Al | skin | lens | BFO | skin/BFO |
|---|---|---|---|---|---|
| space suit (EVA) | 0.4 | 9350 | 3830 | 217 | 43 |
| pressure vessel | 1 | 3560 | 2140 | 180 | 20 |
| equipment room | 5 | 427 | 367 | 65 | 6.6 |
| storm shelter | 10 | 110 | 101 | 24 | 4.6 |
| Orion cabin (different model, [S4], whole-body, mSv→cSv) | ~24.8 | 70.8 | 23.6 | 10.6 | 6.7 |

- A shelter of 10 g/cm² Al meets the 30-day limits. Polyethylene of equal mass cuts further: shelter BFO 16 versus 24 cSv (Table 6) [S5].
- For **GCR**, the visual should show particles passing through almost unattenuated, which is the honest message [S3, S6].

Oct 1989 versus thickness, water, CAM male, absorbed dose cGy [S9] (for a second slider):

| organ | 0.5 cm | 2 cm | 5 cm | 10 cm |
|---|---|---|---|---|
| eye | 599 | 253 | 93 | 35 |
| skin | 721 | 298 | 96 | 35 |
| BFO | 80 | 55 | 31 | 15 |
| thyroid | 361 | 160 | 66 | 26 |
| lung | 53 | 40 | 25 | 12 |
| oesophagus | 207 | 107 | 51 | 21 |
| stomach | 27 | 21 | 14 | 8 |
| bladder | 42 | 28 | 17 | 9 |

## Table C: limits (NASA-STD-3001 Vol 1 Rev C, Table 4.8-1 and §4.8.2) [S10]
| organ | 30-day | 1-year | career |
|---|---|---|---|
| Lens | 1,000 mGy-Eq | 2,000 mGy-Eq | 4,000 mGy-Eq |
| Skin | 1,500 mGy-Eq | 3,000 mGy-Eq | 6,000 mGy-Eq |
| Blood-forming organs | 250 mGy-Eq | 500 mGy-Eq | n/a |
| Circulatory (heart) | 250 mGy-Eq | 500 mGy-Eq | 1,000 mGy-Eq |
| CNS (brain, at hippocampus) | 500 mGy | 1,000 mGy | 1,500 mGy |
| CNS, heavy ions Z ≥ 10 | – | 100 mGy | 250 mGy |
| **Effective (cancer)** | – | – | **600 mSv** (keeps REID below 3% for all ages and sexes) |

- Design-reference storm: the vehicle must keep effective dose from an Oct 1989-spectrum SPE below 250 mSv [V1 4031] [S10, S11].
- The unvested Orion whole-body phantom reached 219.0 mSv for Oct 1989, 36.5% of the career limit in one event [S4].
- **Caveat (label in UI):** limits are in mGy-Eq (RBE-weighted absorbed dose); our organ values are NASA dose equivalent (mSv, NASA Q). Comparing them is an approximation. Proton RBE = 1.5 for these limits [S12].

## Risk conversion (label "estimate")
- NASA anchor: 600 mSv effective ≈ 3% REID (35-year-old female model parameters, conservative for everyone) [S10]. That gives **REID ≈ 0.005% per mSv**. This is a DERIVED linear scaling, not NSCR-2012.
- ICRP 103 nominal cancer risk is about 5.5% per Sv (whole population, incidence-based, detriment-adjusted) [S7, S8]. Show it only as context.
- Organ risk_pct = REID_total × share_T. DERIVED.

## Background dose rates (already in the repo, HAND-SET)
`server/catalog/subjects.yaml` gives effective mSv/day: iss 0.5, moon 1.4, transit 1.8, mars 0.65. For comparison:
- Artemis I cruise: 1.18 mSv/day dose equivalent inside Orion, scaling to ~2.01 mSv/day effective at solar minimum and ~0.615 at solar maximum (Badhwar-O'Neill 2020) [S4].
- ISS MATROSHKA EVA phantom: effective 0.59 ± 0.04 mSv/day; IVA about 25% lower [S1, S2].
- **ISS profile (HAND-SET):** inside ISS, 40% of dose equivalent uses the trapped-proton profile (Table A col 5) and 60% uses the uniform GCR profile. Outside ISS, MTR-DOSTEL saw trapped ≈ 60% of dose equivalent [S6]; inside it is lower.

## Sources
- [S1] Reitz G. et al. 2009, *Astronaut's organ doses inferred from measurements in a human phantom outside the ISS*, Radiat. Res. 171:225–235, https://doi.org/10.1667/rr1559.1. Skin/deep-organ ratio ≈ 20, Q up ×1.7.
- [S2] Reitz G., *MATROSHKA – a research platform for reducing radiation risk in space*, https://three.jsc.nasa.gov/articles/PhantomsReitz.pdf. Skin ≈ 1 mGy/d, organs 0.2–0.3 mGy/d, E = 0.59 ± 0.04 mSv/d, 10× drop in the first 8 mm.
- [S3] Artemis I MARE/HERA team (DLR, NASA et al.) 2024, *Space radiation measurements during the Artemis I lunar mission*, Nature, https://doi.org/10.1038/s41586-024-07927-7. Table 1: https://www.nature.com/articles/s41586-024-07927-7/tables/1.
- [S4] Houri J.M., Berger T. et al. 2026, *First evaluation of wearable radiation protection for human deep space exploration, as flown on Artemis I*, Sci. Adv. 12, eadz1892, https://doi.org/10.1126/sciadv.adz1892. Table 1 gives per-organ inner-belt, Aug 1972 and Oct 1989 values with and without the vest; 0.379 mGy/d GCR, Q 3.1.
- [S5] Wilson J.W. et al. 1997, *Exposures to Solar Particle Events in Deep Space Missions*, NASA TP-3668, https://www.cs.odu.edu/~mln/ltrs-pdfs/NASA-97-tp3668.pdf. Tables 5–6.
- [S6] Labrenz J. et al. 2015, *Matroshka DOSTEL measurements onboard the ISS*, J. Space Weather Space Clim., https://www.swsc-journal.org/articles/swsc/full_html/2015/01/swsc150028/swsc150028.html.
- [S7] ICRP Publication 103 (2007) tissue weighting factors, as tabulated at https://en.wikipedia.org/wiki/Effective_dose_(radiation). Also listed in Reitz 2018 EURADOS slides: https://eurados.sckcen.be/sites/eurados/files/uploads/Actions/Winter%20schools/AM2018/07-Reitz-2018-Winter-School.pdf.
- [S8] ICRP 103 Table A.4.1 values reproduced in Breckow 2020, *Do we really need the "detriment" for radiation protection?*, https://pmc.ncbi.nlm.nih.gov/articles/PMC7368864/ (Tables 1–2: D_rel, R_I, lethality).
- [S9] Simonsen L.C., Atwell W., Nealy J.E., Cucinotta F.A. 1992, *Radiation dose to critical body organs for October 1989 proton event*, NASA TP-3237, https://ntrs.nasa.gov/citations/19930003688. Tables 4–7.
- [S10] NASA-STD-3001 Vol 1 Rev C (2023), §4.8, https://standards.nasa.gov/sites/default/files/standards/NASA/C/nasa-std-3001-vol-1-rev-c-signature.pdf.
- [S11] Space Medicine Foundation quick reference (restates V1 4031), https://spacemedicinefoundation.org/reference/quick-reference/.
- [S12] Townsend L.W. et al., *Estimates of Radiation Exposures to Crews on Missions in Cis-Lunar Space from the October 1989 SPEs* (ICES), https://hdl.handle.net/2346/74193. Proton RBE 1.5; ~20 g/cm² Al shelter adequate. Fetch was blocked (403); the content came from a search snippet.

## Gaps (say so if a judge asks)
- No NSCR-2012 (Cucinotta 2013, NASA/TP-2013-217375) organ-by-organ REID table was retrieved. Risk shares use ICRP 103 population detriment, not NASA's sex- and age-specific model.
- The shelter factor comes from water-slab ratios (S9), not a transport run behind 25 g/cm² + shelter. Label it an estimate.
- Organ positions on our body model are approximate. They are not from a voxel phantom.
- Our storm model predicts *whether* a ≥10 MeV proton storm follows a flare, not its size. The organ doses use the Aug 1972 and Oct 1989 reference spectra (worst cases). "Expected dose" = p_storm × reference dose is an illustrative estimate, not a forecast of dose.
- Moon/Mars surface GCR profiles reuse the uniform GCR profile, with each site's own rate from subjects.yaml.
