# Datasets: astronaut, analog and stand-in health data

Researched: 2026-11-14. "Tested" means the call or download was run on that date and returned the stated result. Live telemetry feeds are covered in `01-realtime-data-apis.md`.

## Summary

| Item | Finding |
|---|---|
| Real astronaut vitals | No public dataset gives astronaut heart rate, blood pressure, SpO2, sleep or mood as raw time series. Individual crew medical data are Privacy Act protected (LSAH) and only reachable by a research request. |
| Best real astronaut data | Inspiration4 blood panels on NASA OSDR: glucose, electrolytes, kidney and liver values (OSD-575) and complete blood count (OSD-569), 4 crew x 7 time points, each with its reference range. Plain CSV, public, no login. Tested. |
| Best spaceflight-like vitals | NASA Life Sciences Portal (NLSP): UTMB head-down-tilt bed-rest "Daily Vitals" (BP, pulse, temperature, respiration, water intake, urine specific gravity, symptoms) and about 100 other open bed-rest datasets. Search and metadata API tested; file download tested only through the web portal. |
| Best stand-ins | PhysioNet open datasets: tilt-table BP + ECG (PRCP), SpO2 + HR + temperature (Non-EEG), glucose + HR + temperature (BIG IDEAs), 24-h HRV + sleep + mood (MMASH). Open licenses (ODC-By, ODbL, CC BY). |
| Analog missions | HERA, CHAPEA, HI-SEAS, Concordia, SIRIUS: no public raw physiological data. Only Mars-500 has a public aggregate file (520 days of crew sleep and activity, via the Wayback Machine). |
| Browser use | OSDR's S3 bucket and the NLSP API send `Access-Control-Allow-Origin: *`, so a web app can fetch them directly. The OSDR search API and PhysioNet do not; fetch those server-side or pre-download. |
| Verdict | Build the demo on (1) Inspiration4 CSVs for real astronaut lab values, (2) UTMB bed-rest daily vitals for a realistic in-mission time series, (3) PhysioNet PRCP and Non-EEG for wearable-style signals, (4) synthetic data for anything else, clearly labelled. |

## 1. Dataset table

### 1a. Real spaceflight crews (NASA OSDR)

| Name | Content | Subjects/n | Access method/API | License | URL |
|---|---|---|---|---|---|
| OSD-575 Inspiration4 serum | Comprehensive metabolic panel (glucose, sodium, potassium, calcium, BUN, creatinine, eGFR, ALT, AST, albumin...) with lab reference ranges; cardiovascular and immune cytokine panels | 4 civilian crew (C001-C004), 7 time points: L-92, L-44, L-3, R+1, R+45, R+82, R+194 | OSDR API; static S3 file (CORS open). Tested | NASA SMD Science Information Policy; cite OSDR | https://osdr.nasa.gov/bio/repo/data/studies/OSD-575 |
| OSD-569 Inspiration4 whole blood | Complete blood count (CBC) with reference ranges; RNA-seq and other omics | Same 4 crew | Same. CBC CSV tested | Same | https://osdr.nasa.gov/bio/repo/data/studies/OSD-569 |
| OSD-570 to OSD-574, OSD-630, OSD-656, OSD-687 | Inspiration4 PBMC, plasma, microbiome swabs, skin, stool, urine inflammation panel, T-cell profiling | Same 4 crew | Same | Same; raw sequence data controlled access | https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/ |
| SOMA data portal | Browser for Space Omics and Medical Atlas (Inspiration4, NASA Twins Study, linked mouse data) | I4 crew; Twins Study 1 astronaut + 1 twin | Web browser only | See portal | https://soma.weill.cornell.edu |
| OSD-530 JAXA Cell-Free Epigenome (CFE) | Plasma cell-free RNA before, during, after flight | 6 astronauts, > 120 days on ISS | OSDR API | NASA SMD policy | https://osdr.nasa.gov/bio/repo/data/studies/OSD-530 |
| OSD-903 / OSD-943 Axiom Ax-1 | Blood RNA-seq and DNA methylation | 2 astronauts, 3 time points | OSDR API | NASA SMD policy | https://osdr.nasa.gov/bio/repo/data/studies/OSD-903 |
| Polaris Dawn, Fram2 | No OSDR study found (search tested: 0 human hits). Health data held in TRISH EXPAND database at Baylor | Polaris Dawn 4 crew | EXPAND: access process not stated publicly (unverified) | n/a | https://www.bcm.edu/academic-centers/space-medicine/expand |
| OSDR Environmental Data App (EDA) | ISS cabin temperature, humidity, CO2 and radiation for Rodent Research mission windows | ISS environment | Web app with tables; API link points to BIOdata API (not tested for EDA) | NASA SMD policy | https://visualization.osdr.nasa.gov/eda/ |

### 1b. NASA Life Sciences Portal (NLSP: LSDA and LSAH)

| Name | Content | Subjects/n | Access method/API | License | URL |
|---|---|---|---|---|---|
| UTMB Bed Rest Campaign 3: Daily Vitals | Systolic and diastolic BP, pulse, body temperature, respiration rate, weight, water intake vs goal, urine specific gravity, symptom complaints, pain score, medication log | 52 enrolled, 23 completed; 60-90 days of 6° head-down tilt; 23 data files | NLSP API (search and metadata tested, no login); files via portal "Download" (API file download not tested) | Not stated; NASA "open-access" | https://nlsp.nasa.gov/explore/data/details/593a6726-8650-551a-8d67-0f03468de92f?dataType=MISSIONS |
| UTMB Bed Rest Campaigns 1, 3, 11 (other datasets) | 107 datasets: clinical labs, actigraphy, aerobic capacity HR/VO2, renal stone, vascular function, DXA, water intake | Campaign 11: 70-day bed rest with exercise | Same | Same | https://www.nasa.gov/hrp/nlsp/ |
| NLSP Standard Measures | Baseline set of health measures from astronauts and analog crews | Not stated | Listed as open-access on the HRP page; record-level access not tested | Not stated | https://nlsp.nasa.gov/resources/standard-measures |
| LSDA legacy summaries | API reports 2,593 dataset records, 2,411 with `availability=Available online`. Includes Apollo heart rate, Shuttle LBNP and stand tests, Mir, NEEMO sleep. Many older ones are scanned figures (TIF), some XLS | Varies | NLSP API | Not stated | https://nlsp.nasa.gov/explore |
| LSDA restricted and LSAH | Individual, attributable crew research and clinical data | All NASA astronauts | Data request form; review board; IRB may apply; Privacy Act | Restricted | https://nlsp.nasa.gov/data-request |

### 1c. Analog missions and bed rest outside NASA

| Name | Content | Subjects/n | Access method/API | License | URL |
|---|---|---|---|---|---|
| Mars-500 (Basner et al. 2013, PNAS) | Daily sleep, wake, rest hours and activity counts per crew member; aggregate, not raw | 6 men, 520 days | Excel via Wayback Machine (original link 404). Tested by second researcher | Not stated; cite paper | http://web.archive.org/web/20140522030117if_/http://www.med.upenn.edu:80/uep/user_documents/PNAS_Basner_et_al.xlsx |
| HERA | Behavioural, mood, cognitive Standard Measures | 4 crew per mission, up to 45 days | LSDA request only | Restricted | https://www.nasa.gov/analogs/hera/ |
| CHAPEA | Physical and behavioural health and performance | 4 crew, 378 days per mission | No public dataset found | n/a | https://www.nasa.gov/humans-in-space/chapea/ |
| HI-SEAS 3-5 | Sleep (wearables), urinary hormones, stress, resting HR | 18 (6 per mission), 8-12 months | On request to author | On request | https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2022.898841/full |
| Concordia, SIRIUS-19/21, Lunar Palace 365 | Papers only; Lunar Palace gut omics public (GSA CRA004621, PRIDE PXD027661) | 6-13 crew | No physiological data public | n/a | https://pmc.ncbi.nlm.nih.gov/articles/PMC10124008/ |
| AGBRESA (DLR/ESA/NASA bed rest) | HRV, BP variability, orthostatic tolerance | 24, 60 days head-down tilt | On request to author | On request | https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2023.1250727/full |
| Zenodo 22116030 graded head-down tilt | Processed ECG/BCG intervals, HR, HRV per tilt segment | n not stated | Zenodo API | CC BY 4.0 | https://doi.org/10.5281/zenodo.22116030 |

### 1d. PhysioNet and other open stand-ins

| Name | Content | Subjects/n | Access method/API | License | URL |
|---|---|---|---|---|---|
| PRCP: Physiologic Response to Changes in Posture | Continuous arterial BP, ECG and tilt angle at 250 Hz; slow tilt, fast tilt, stand-up (models post-flight orthostatic intolerance) | 10 healthy, 55 min each | `wfdb.rdrecord('12726', pn_dir='prcp')`. Tested | ODC-By 1.0 | https://physionet.org/content/prcp/1.0.0/ |
| Non-EEG Neurological Status | SpO2 and HR (1 Hz), skin temperature, EDA, accelerometer; stress and relaxation phases | 20 healthy | `wfdb.rdrecord('Subject1_SpO2HR', pn_dir='noneeg')`. Tested | ODC-By 1.0 | https://physionet.org/content/noneeg/1.0.0/ |
| BIG IDEAs Glycemic Variability and Wearable | Dexcom G6 glucose (mg/dL) plus wrist HR, temperature, EDA, food log; per-subject CSV | 16, 10 days each (pre-diabetic range) | HTTPS CSV. Tested | ODC-By 1.0 | https://physionet.org/content/big-ideas-glycemic-wearable/1.1.3/ |
| MMASH | 24-h RR intervals, activity, sleep quality, anxiety, stress, emotions, cortisol, melatonin | 22 healthy | One 24.6 MB zip | ODbL 1.0 | https://physionet.org/content/mmash/1.0.0/ |
| Wearable Exam Stress | Empatica E4 HR, BVP, skin temperature, EDA during exams | 10 students | HTTPS CSV | ODC-By 1.0 | https://physionet.org/content/wearable-exam-stress/1.0.0/ |
| BUT PPG | Smartphone PPG with BP, SpO2 and glucose labels | 50 | HTTPS / wfdb | CC BY 4.0 | https://physionet.org/content/butppg/2.0.0/ |
| Autonomic Aging | Resting ECG and continuous non-invasive BP | 1,121 per page (1,104 in API summary) | wfdb | ODbL 1.0 | https://physionet.org/content/autonomic-aging-cardiovascular/1.0.0/ |
| Cerebral Vasoregulation in Diabetes | Head-up tilt, Valsalva, sit-to-stand with BP, HR, cerebral flow | 86 (37 diabetic, 49 control) | wfdb | CC BY 4.0 | https://physionet.org/content/cerebral-vasoreg-diabetes/1.0.0/ |
| Sleep-EDF Expanded | Whole-night polysomnography and hypnograms | 197 recordings | wfdb / EDF | ODC-By 1.0 | https://physionet.org/content/sleep-edfx/1.0.0/ |
| Sleep-accel (Apple Watch + PSG) | Wrist accelerometer, HR, labelled sleep stages | 31 | HTTPS | ODC-By 1.0 | https://physionet.org/content/sleep-accel/1.0.0/ (returned HTTP 502 on recheck; retry) |
| BIDMC PPG and Respiration | PPG, respiration, ECG, HR/RR/SpO2 numerics; CSV | 53 ICU patients | HTTPS CSV. Tested | ODC-By 1.0 | https://physionet.org/content/bidmc/1.0.0/ |
| MIT-BIH Arrhythmia | 2-lead ECG with beat labels (arrhythmia examples) | 47 | wfdb. Tested | ODC-By 1.0 | https://physionet.org/content/mitdb/1.0.0/ |
| D1NAMO | ECG, respiration, glucose, food photos | 29 (20 healthy, 9 type 1) | Zenodo | CC BY-SA 4.0 | https://zenodo.org/records/5651217 |
| OhioT1DM | CGM, insulin, activity | Not verified | Data Use Agreement by e-mail | DUA | https://webpages.charlotte.edu/rbunescu/data/ohiot1dm/OhioT1DM-dataset.html |
| MobiVital (UCLA NESL) | Contactless breathing from IR-UWB radar, 50 Hz, 30-s CSV windows (1500 x 254 columns): IMU (cols 1-6), radar I/Q (13-252), reference respiration (253) and pulse waveform (254) | 12 subjects, about 24 h total | 8 sample CSVs on GitHub; full set on Zenodo (handheld.zip 3.3 GB, tripod.zip 5.7 GB); loader `read_parsed_data.m` (MATLAB) or `pandas.read_csv(..., header=None)` | GitHub repo: no license file; Zenodo: CC BY 4.0 | https://github.com/nesl/MobiVital-dataset ; https://zenodo.org/records/15022885 |

### 1e. Other agencies and portals

| Name | Content | Subjects/n | Access method/API | License | URL |
|---|---|---|---|---|---|
| ESA HREDA (replaces Erasmus Experiment Archive) | 169 datasets, mostly physical sciences; human-health sets few (Molecular Muscle; Human Gut Microbiota flagged restricted) | Varies | TAP (ADQL) API, tested; download needs ESA login | Per dataset; retention period for investigators | https://hreda.esac.esa.int/hreda/#/pages/home |
| CSA Bio-Monitor (Astroskin) | Device on ISS measuring ECG, pulse, BP, breathing, skin temperature, SpO2, activity. No open dataset found | n/a | n/a (open.canada.ca blocked scripted search; unverified) | n/a | https://www.asc-csa.gc.ca/eng/sciences/astroskin.asp |
| JAXA Kibo archive (DARTS) | Physical science only; no astronaut health data found | n/a | Web | JAXA terms | https://darts.isas.jaxa.jp/iss/kibo |
| data.nasa.gov "Flight Crew Physiological Data for Crew State Monitoring" | Pilot physiology in a flight simulator (not astronauts) | Pilots | CKAN API; zip files | Not specified | https://data.nasa.gov/dataset/flight-crew-physiological-data-for-crew-state-monitoring |

## 2. Access rules for restricted data

| Repository | Rule | Source |
|---|---|---|
| OSDR (astronaut studies) | "Studies containing data derived from astronauts have publicly accessible processed data, however the sequence data are controlled access restricted." Raw data need an application with board approval. | https://science.nasa.gov/reference/osdr-faq/ ; https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/ |
| OSDR licence | Data "distributed under NASA Science Mission Directorate's Science Information Policy"; cite each study (citation given on the study page). | https://www.nasa.gov/reference/osdr-help-terms-and-conditions/ ; https://science.nasa.gov/researchers/science-data/science-information-policy |
| LSDA (NLSP) | Houses "de-identified human research data from spaceflight and analog missions". Open-access sets download from the portal; the rest by data request. | https://www.nasa.gov/hrp/nlsp/ |
| LSAH | "Uses medical monitoring data for astronaut health surveillance." Not public. Requests are reviewed for merit, attributable data, IRB and consent; Privacy Act of 1974, HIPAA and the Common Rule apply (NASA presentations, 2017-2018, may be dated). | https://www.nasa.gov/hrp/nlsp/ ; https://ntrs.nasa.gov/api/citations/20170009502/downloads/20170009502.pdf ; https://ntrs.nasa.gov/api/citations/20180004918/downloads/20180004918.pdf |
| NASA Twins Study | No OSDR study found by search; browsable in the SOMA portal. Raw access route not confirmed (unverified). | https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/ |

## 3. API example calls (all tested 2026-11-14)

### NASA OSDR

```bash
# 1. Full-text search (JSON, Elasticsearch-style hits). Returned 10 Inspiration4 studies.
curl "https://osdr.nasa.gov/osdr/data/search?term=Inspiration4&type=cgene&size=25"

# 2. Study metadata (ISA-Tab as JSON). Returned HTTP 200.
curl "https://osdr.nasa.gov/osdr/data/osd/meta/575"

# 3. File list for a study. Returned 9 files for OSD-575, each with a remote_url.
curl "https://osdr.nasa.gov/osdr/data/osd/files/575"

# 4. Download a file (prefix remote_url with https://osdr.nasa.gov; redirects to S3). Returned the 28-line CSV.
curl -L "https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv"

# 5. Same file straight from the public S3 bucket (CORS: Access-Control-Allow-Origin *). Best for a browser app.
curl "https://nasa-osdr.s3.amazonaws.com/OSD-575/version-1/Comprehensive_Metabolic_Panel/LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv"

# 6. List a study's files in the bucket (no AWS account needed).
curl "https://nasa-osdr.s3.amazonaws.com/?prefix=OSD-569/&max-keys=50"
#    AWS CLI form from NASA's guide (not run; CLI not installed): aws s3 ls --no-sign-request s3://nasa-osdr/OSD-575/

# 7. BIOdata API (separate service). Returned dataset metadata and file URLs.
curl "https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/OSD-575/files/"
```

Result of call 5 (long format, one row per analyte):

```
ANALYTE,VALUE,RANGE_MIN,RANGE_MAX,UNITS,TEST_TYPE,SUBJECT_ID,SEX,timepoint
GLUCOSE,83,65,99,mg/dL,CMP,C001,M,L-92
SODIUM,141,135,146,mmol/L,CMP,C001,M,L-92
```

Glucose values found (mg/dL): preflight 56-100, R+1 83-103. At R+45 three of four crew read 36-44 mg/dL. The metadata gives no cause; treat as a likely sample-handling artefact (unverified). It is a useful test case for a "recheck before alarm" rule.

### NASA Life Sciences Portal (undocumented API used by the portal itself)

```bash
# Search (no login). Returned 107 UTMB bed-rest datasets.
curl "https://nlsp.nasa.gov/api/v1/search/multi?types=DATASETS,MISSIONS&q=UTMB%20bedrest&page=1&limit=10&sortBy=dateAdded_desc"

# Full record with parameter list and the 23 per-subject data files of "Daily Vitals".
curl "https://nlsp.nasa.gov/api/v1/data/datasets/7153409b-d8a3-5a23-b667-9df8a182dfdc/full"

# Mission record (UTMB Campaign 3 description: 52 enrolled, 23 completed, 60 or 90 days head-down tilt).
curl "https://nlsp.nasa.gov/api/v1/data/missions/593a6726-8650-551a-8d67-0f03468de92f/full"
```

This API is not documented by NASA and may change. File download through the API was not tested; download files with the portal's file explorer.

### PhysioNet (Python, `pip install wfdb`)

```python
import wfdb
# Tilt test: 250 Hz, signals ABP (mmHg), ECG (mV), Angle (degrees), 55 min. Tested.
rec = wfdb.rdrecord('12726', pn_dir='prcp')
# SpO2 + HR at 1 Hz, 2,299 samples. Tested.
spo2 = wfdb.rdrecord('Subject1_SpO2HR', pn_dir='noneeg')
```

```bash
# Plain CSV (glucose study, subject 001). Tested: header "datetime, hr".
curl -sL "https://physionet.org/files/big-ideas-glycemic-wearable/1.1.3/001/HR_001.csv" | head -3
# Bulk download pattern (wget not run here): wget -r -N -c -np https://physionet.org/files/prcp/1.0.0/
```

### ESA HREDA (TAP / ADQL)

```bash
# List tables. Tested: returned the hreda.* schema; v_dataset holds 169 rows.
curl -G "https://hreda.esac.esa.int/hreda-sl-tap/tap/sync" --data-urlencode "REQUEST=doQuery" \
  --data-urlencode "LANG=ADQL" --data-urlencode "FORMAT=csv" \
  --data-urlencode "QUERY=SELECT dataset_unique_acronym, investigation_name, is_forbidden FROM hreda.v_dataset"
```

## 4. Verdict for the demo

| Rank | Dataset | Use in the demo | Usefulness |
|---|---|---|---|
| 1 | OSD-575 / OSD-569 Inspiration4 labs | "Real astronaut" panel: glucose, electrolytes, kidney, blood count over L-92 to R+194, with each lab's own normal range for colour coding | High (real crew, tiny CSV, CORS-open) |
| 2 | UTMB Campaign 3 Daily Vitals (NLSP) | Daily BP, pulse, temperature, water intake and urine specific gravity over 60-90 days of simulated weightlessness: the closest open match to an in-mission self-check log | High (needs one manual download) |
| 3 | PhysioNet PRCP | Animated tilt test: heart rate and BP response to standing, for "landing day" or "Mars surface arrival" | High |
| 4 | PhysioNet Non-EEG and BIG IDEAs | SpO2, HR, temperature and continuous glucose traces for wearable-style charts | Medium-High (not astronauts) |
| 5 | MMASH and Mars-500 (Basner) | Sleep and mood trend screens; Mars-500 gives a 520-day isolation sleep curve | Medium |
| 6 | MobiVital | Only if the team shows contactless breathing-rate sensing; large raw radar files, research-grade | Low for a 48-h demo |
| 7 | HERA, CHAPEA, LSAH, Twins Study, Polaris Dawn | Cite as context; data not obtainable in 48 h | Low |

## 5. Not verified

| Item | Status |
|---|---|
| NLSP file download by API | Not tested (blocked in this session); use the portal. |
| UTMB dataset licence | No licence text found; NASA labels them "open-access". Cite NLSP. |
| TRISH EXPAND access for Polaris Dawn / Fram2 data | Process not public. |
| Twins Study raw data route | Not confirmed. |
| CSA open-data search | Site rejected scripted access. |
| HREDA human datasets downloadable | Download requires ESA login; not tested. |
| Cause of low Inspiration4 R+45 glucose values | Not stated in metadata. |

## Sources (pages read for this file)

| Source | URL |
|---|---|
| OSDR overview (science.nasa.gov) | https://science.nasa.gov/biological-physical/data/osdr/ |
| OSDR FAQ | https://science.nasa.gov/reference/osdr-faq/ |
| OSDR terms and conditions | https://www.nasa.gov/reference/osdr-help-terms-and-conditions/ |
| OSDR on AWS guide | https://www.nasa.gov/reference/osdr-help-getting-started-with-aws-and-osdr-data/ |
| OSDR Inspiration4 release note | https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/ |
| OSDR BIOdata API docs | https://visualization.osdr.nasa.gov/biodata/api/ |
| HRP NLSP page | https://www.nasa.gov/hrp/nlsp/ |
| NLSP data request | https://nlsp.nasa.gov/data-request |
| TRISH EXPAND | https://www.bcm.edu/academic-centers/space-medicine/expand |
| TrialX: how health data is collected in space (vendor blog) | https://trialx.com/how-health-data-is-collected-in-space-missions/ |
| PhysioNet | https://physionet.org/ |
| MobiVital GitHub | https://github.com/nesl/MobiVital-dataset |
| MobiVital Zenodo | https://zenodo.org/records/15022885 |
| NASA HRP risks | https://www.nasa.gov/hrp/risks/ |
