# Real-time data feeds for the astronaut health tool

Challenge: Create Health Monitoring Software for Astronauts on Space Missions (NASA Space Apps 2026).
Verified: 2026-11-14, about 17:45 to 18:05 UTC. Every "Verified" cell below is the result of a live request made in that window, unless it says "docs only". Raw responses are in `../samples/` (index in section 8).

## Summary

| Point | Detail |
|---|---|
| No public vitals feed | No public real-time feed of astronaut vital signs exists. Crew medical data is private under the Privacy Act of 1974 and reaches only flight surgeons and approved researchers (section 5). The app must use **simulated vitals**. |
| Live and usable today | **ISS Live! telemetry** (cabin pressure, ppO2, ppCO2, cabin temperature, water and urine tanks), **NOAA SWPC JSON** (GOES proton flux, X-ray flares, Kp, NOAA R/S/G scales, alerts), **NASA DONKI** (flares, SEP, CME, storms), **CCMC iSWA HAPI** (GOES data, Curiosity RAD dose on Mars to 2026-11-12, LRO CRaTER lunar dose to 2026-10-07), **wheretheiss.at** (ISS position), **corquaid** and **Launch Library 2** (who is in space). |
| Stale or broken | open-notify (crew list from 2024, ISS position wrong by thousands of km), api.nasa.gov DONKI `FLR` (HTTP 404), legacy DONKI host `kauai.ccmc.gsfc.nasa.gov` (timeout), SWPC `products/solar-wind/*` (HTTP 404, moved), ISS Daily Summary Report (discontinued July 2024), NASA RadLab ISS dose data (ends 2024-11-04), Artemis II (flight ended 2026-04-10; archive only). |
| Recommended design | Two layers: (1) a **live environment layer** from ISS Live! and SWPC that drives context and alerts; (2) a **simulated crew vitals layer** with fictional crew, which the self-assessment and escalation logic reads. |

---

## 1. ISS cabin and life support: ISS Live! (Lightstreamer)

NASA streams a public subset of ISS telemetry from Mission Control (Johnson Space Center) through a Lightstreamer broker, republished on a public Lightstreamer server ([Lightstreamer customer story](https://lightstreamer.com/customer-story/how-nasa-is-using-lightstreamer/)). The same story names the ETHOS console data (cabin pressure, temperature, urine and water recovery) as part of the public feed.

### 1.1 The feed

| Name | What it gives | Health relevance | Endpoint | Auth/cost | Format | Verified status 2026-11-14 |
|---|---|---|---|---|---|---|
| ISS Live! (adapter set `ISSLIVE`) | About 300 public telemetry items: life support (ETHOS), power, attitude, docking, robotics, time ([PUI dictionary, 298 items](https://github.com/Lightstreamer/Lightstreamer-example-ISSLive-client-javascript/blob/master/src/assets/PUIList.xml); [ISS Mimic list, 337 items](https://github.com/ISS-Mimic/Mimic/blob/main/Telemetry/ISS_Public_Telemetry.xlsx)) | Cabin air (O2, CO2, N2, pressure), temperature, water and urine systems: the closed environment that drives crew health | Server `https://push.lightstreamer.com`, adapter set `ISSLIVE`, mode `MERGE` ([Lightstreamer ISSLive example](https://github.com/Lightstreamer/Lightstreamer-example-ISSLive-client-javascript)) | None, free | Lightstreamer TLCP over WebSocket (via SDK); fields `Value`, `TimeStamp`, `Status.Class`, `Status.Indicator`, `CalibratedData` | **Live.** Connected `WS-STREAMING`, subscribed to 17 items, all returned values (`../samples/isslive_lightstreamer_eclss_snapshot.json`). |

### 1.2 Items relevant to crew health

Descriptions and dictionary units come from the [ISSLive PUI dictionary](https://github.com/Lightstreamer/Lightstreamer-example-ISSLive-client-javascript/blob/master/src/assets/PUIList.xml) and the [ISS Mimic spreadsheet](https://github.com/ISS-Mimic/Mimic/blob/main/Telemetry/ISS_Public_Telemetry.xlsx). "Observed" is our snapshot at 17:54 UTC. "Last update" is decoded from `TimeStamp` (see 1.4).

| Item ID | Description | Dictionary unit | Observed (`CalibratedData`) | Unit as observed (our inference) | Last update (UTC) | Health relevance |
|---|---|---|---|---|---|---|
| `USLAB000058` | Cabin pressure (US Lab) | PSI | 758.55 | mmHg (about 1 atm) | 14 Nov 17:53 | Leak or depressurisation; hypoxia risk |
| `AIRLOCK000054` | Airlock pressure | PSI | 758.86 | mmHg | 14 Nov 17:48 | EVA preparation context |
| `USLAB000059` | Cabin temperature (CCAA inlet) | CNT | 24.0 | degrees C | 14 Nov 17:53 | Thermal comfort, sleep quality |
| `USLAB000053` | Lab ppO2 | PSIA | 165.85 | mmHg | 2 Nov 14:51 (stale) | Hypoxia or hyperoxia |
| `USLAB000054` | Lab ppN2 | PSIA | 577.62 | mmHg | 2 Nov 15:01 (stale) | Atmosphere composition |
| `USLAB000055` | Lab ppCO2 | PSIA | 2.44 | mmHg | 2 Nov 15:01 (stale) | Headache, cognition; NASA limit is a 1-hour average of 3 mmHg or less ([NASA OCHMO CO2 brief](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf)) |
| `NODE3000001` | Node 3 ppO2 | PSIA | 150.67 | mmHg | 2 Nov 14:51 (stale) | As Lab ppO2 |
| `NODE3000002` | Node 3 ppN2 | PSIA | 593.87 | mmHg | 3 Nov 04:34 (stale) | Atmosphere composition |
| `NODE3000003` | Node 3 ppCO2 | PSIA | 2.95 | mmHg | 3 Nov 04:34 (stale) | As Lab ppCO2 (near the 3 mmHg limit) |
| `NODE3000004` | Urine Processor state | enum | STANDBY | enum | 14 Nov 05:42 | Water recovery status |
| `NODE3000005` | Urine tank quantity | PCT | 34.0 | percent | 14 Nov 17:27 | Toilet and water recovery availability |
| `NODE3000006` | Water Processor state | enum | STANDBY | enum | 14 Nov 09:37 | Drinking water production |
| `NODE3000008` | Waste water tank quantity | PCT | 65.7 | percent | 14 Nov 17:53 | Water system load |
| `NODE3000009` | Clean water tank quantity | PCT | 62.4 | percent | 14 Nov 17:53 | Drinking water reserve (hydration) |
| `NODE3000010` | Oxygen Generator state | enum | PROCESS | enum | 3 Nov 04:34 (stale) | O2 supply |
| `NODE3000011` | O2 production rate | LBM/D | -59.46 | unclear (negative value) | 3 Nov 04:34 (stale) | Do not use; value is not plausible |
| `TIME_000001` | Station GMT | ms | `318/17:54:02` | day-of-year/time | 14 Nov 17:54 | Signal check (see 1.4) |

Not in the public list: humidity, radiation dose, and any crew biomedical item. We searched both dictionaries for "humid", "dew", "radiation", "dose", "heart" and "medical" and found none.

Unit check: Lab ppO2 + ppN2 + ppCO2 = 745.9, close to the 758.55 cabin pressure. This supports reading the values as mmHg, not PSIA as the dictionaries state.

### 1.3 Client libraries and examples

| Name | Language | Version / licence | Notes | Link |
|---|---|---|---|---|
| `lightstreamer-client-web` | Browser JS | 9.2.3, Apache-2.0 | UMD build on unpkg; `data-lightstreamer-ns` sets a namespace | [README](https://unpkg.com/lightstreamer-client-web@9.2.3/README.md) |
| `lightstreamer-client-node` | Node.js | 9.2.2, Apache-2.0 | Used for our live test | [npm registry](https://registry.npmjs.org/lightstreamer-client-node) |
| `lightstreamer-client-lib` | Python | 2.2.3 | Used by ISS Mimic `iss_telemetry.py` | [PyPI](https://pypi.org/project/lightstreamer-client-lib/) |
| `py-iss-telemetry` | Python | 1.2 | Third-party wrapper for the ISSLIVE stream | [PyPI](https://pypi.org/project/py-iss-telemetry/) |
| Lightstreamer ISSLive example | TypeScript | Apache-2.0 | Official demo; live at demos.lightstreamer.com | [GitHub](https://github.com/Lightstreamer/Lightstreamer-example-ISSLive-client-javascript), [live demo](https://demos.lightstreamer.com/ISSLive/) |
| ISS Mimic | Python, JS | MIT; updated 2026-10-15 | Full item list with descriptions; web dashboard; signal-status logic | [GitHub](https://github.com/ISS-Mimic/Mimic), [dashboard](https://iss-mimic.github.io/Mimic/dashboard.html) |
| pISSStream | Swift | BSD-3-Clause | Urine tank level (`NODE3000005`) in the macOS menu bar | [GitHub](https://github.com/Jaennaet/pISSStream) |

### 1.4 How to use in our app

- Show a "Station environment" panel: cabin pressure, ppO2, ppCO2, temperature, clean water level. Colour each value by its threshold. Example: ppCO2 above 3 mmHg turns amber and asks the crew member to log headache and concentration ([NASA OCHMO CO2 brief](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf)).
- `TimeStamp` encoding (observed): day-of-year x 24 + UTC hours. Example: `7649.90` = day 318 (14 Nov), 17:54 UTC, which matches `TIME_000001` `CalibratedData` `318/17:54:02`.
- Signal check: ISS Mimic treats `Status.Class == "24"` on `TIME_000001` as "Signal Acquired", and any other value as signal lost ([ISS Mimic index.html, AOS logic](https://github.com/ISS-Mimic/Mimic/blob/main/docs/index.html)).
- Always show data age. Several items had not changed for 11 to 12 days at test time.

Browser snippet (same API as our tested Node script; per the [client README](https://unpkg.com/lightstreamer-client-web@9.2.3/README.md)):

```html
<script src="https://unpkg.com/lightstreamer-client-web@9.2.3/lightstreamer.min.js" data-lightstreamer-ns="Ls"></script>
<script>
  const ITEMS = ["USLAB000058","USLAB000059","USLAB000053","USLAB000055",
                 "NODE3000003","NODE3000005","NODE3000009","TIME_000001"];
  const client = new Ls.LightstreamerClient("https://push.lightstreamer.com", "ISSLIVE");
  const sub = new Ls.Subscription("MERGE", ITEMS, ["Value","TimeStamp","Status.Class","CalibratedData"]);
  sub.setRequestedSnapshot("yes");
  sub.addListener({
    onItemUpdate: u => console.log(u.getItemName(), u.getValue("CalibratedData"),
                                   issTime(u.getValue("TimeStamp")).toISOString())
  });
  client.subscribe(sub);
  client.connect();

  // TimeStamp = day-of-year * 24 + UTC hours (observed 2026-11-14)
  function issTime(ts, year = new Date().getUTCFullYear()) {
    return new Date(Date.UTC(year, 0, 0) + parseFloat(ts) * 3600 * 1000);
  }
</script>
```

### 1.5 Caveats

| Caveat | Detail |
|---|---|
| Not an SLA service | The public server is Lightstreamer's demo server. The example README says it can feed local clients "as per now, and for the foreseeable future"; the adapter set cannot be installed locally ([README](https://github.com/Lightstreamer/Lightstreamer-example-ISSLive-client-javascript)). Keep a recorded fallback (our snapshot) for the demo. |
| Units | Dictionary units (PSIA, PSI, CNT) do not match observed values (mmHg, degrees C). Label units from observation and say so. |
| Stale values | MERGE mode sends a value only when it changes. ppO2, ppN2, ppCO2 and oxygen generator items were 11 to 12 days old. |
| Signal gaps | Loss of signal happens when the station has no ground link; values then freeze. |

---

## 2. Space weather (live): radiation storms, flares, geomagnetic activity

### 2.1 Feeds

| Name | What it gives | Health relevance | Endpoint | Auth/cost | Format | Verified status 2026-11-14 |
|---|---|---|---|---|---|---|
| NOAA SWPC NOAA Scales | Current R (radio), S (radiation), G (geomagnetic) levels plus 3-day probabilities | **S level is the best single "radiation light"**; S3 and above affect astronauts on EVA ([NOAA scales](https://www.spaceweather.gov/noaa-scales-explanation)) | `https://services.swpc.noaa.gov/products/noaa-scales.json` | None, free | JSON object; key `"0"` = now, `"1"`-`"3"` = next days | **Live.** R0, S0, G0 at 17:47 UTC; S1+ probability 5 % per day |
| SWPC GOES integral protons | Proton flux at >=1, 5, 10, 30, 50, 60, 100, 500 MeV, 5-minute steps | >=10 MeV flux defines the S scale (S1 = 10 pfu) | `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json` (also `-1-day`, `-3-day`, `-7-day`) | None, free | JSON array `{time_tag, satellite, flux, energy}` | **Live.** Last point 17:40 UTC; >=10 MeV max over 6 h = 0.29 pfu (below S1) |
| SWPC GOES proton fluence | Daily integral fluence, 7 days | Cumulative exposure trend | `https://services.swpc.noaa.gov/json/goes/primary/integral-proton-fluence-7-day.json` | None, free | JSON array | **Live** |
| SWPC X-ray flares | Latest flare and 7-day list (class, begin, peak, end) | Large flares can precede solar particle events; early warning | `https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json`, `.../xray-flares-7-day.json` | None, free | JSON | **Live.** Latest flare peaked C4.4 at 06:06 UTC |
| SWPC X-ray flux | 1-minute GOES X-ray flux | R scale (M1, X1 etc.) | `https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json` | None, free | JSON | **Live.** Last point 17:46 UTC |
| SWPC planetary Kp | 3-hour Kp for 7 days; 1-minute estimated Kp; forecast | G scale. NOAA lists no biological effects for G storms; use as context | `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json`, `https://services.swpc.noaa.gov/json/planetary_k_index_1m.json`, `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json` | None, free | JSON array of objects | **Live.** Kp 1.67 at 12:00 UTC; forecast to 17 Nov |
| SWPC alerts | Text watches, warnings, alerts | Human-readable event messages for the crew feed | `https://services.swpc.noaa.gov/products/alerts.json` | None, free | JSON `{product_id, issue_datetime, message}` | **Live.** 69 messages; 2 MeV electron alert running since 8 Nov |
| SWPC real-time solar wind | 1-minute solar wind plasma and magnetic field; summary values | CME arrival warning (indirect) | `https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json`, `.../rtsw_mag_1m.json`, `https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json` | None, free | JSON (full files 1.5 to 2.6 MB) | **Live.** 412 km/s at 17:44 UTC |
| NASA DONKI (CCMC, direct) | Event catalogue: `FLR`, `SEP`, `CME`, `GST`, `IPS`, `notifications` | `SEP` = solar energetic particle events (radiation); notifications = expert space weather bulletins | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/{TYPE}?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` ([DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/), [API docs](https://ccmc.gsfc.nasa.gov/DONKI/api/)) | None, free; header `X-Rate-Limit-Remaining: 119` | JSON | **Live.** FLR 13, CME 89, GST 1, IPS 2, SEP 0 (15 Oct to 14 Nov); notifications 8 |
| NASA DONKI via api.nasa.gov | Same catalogue through the NASA API gateway | As above | `https://api.nasa.gov/DONKI/{TYPE}?startDate=..&endDate=..&api_key=DEMO_KEY` | `DEMO_KEY` or free key ([api.nasa.gov](https://api.nasa.gov/)) | JSON | **Partly broken.** `GST` and `notifications` 200; `FLR` 404; APOD 500 at test time |
| CCMC iSWA HAPI | 327 datasets incl. GOES protons (`goesp_part_flux_P5M`), Kp (`NOAA_KP_P3H`), Dst | Same data as SWPC in one standard API ([HAPI spec](https://github.com/hapi-server/data-specification)) | `https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi/{catalog,info,data}` ([iSWA](https://ccmc.gsfc.nasa.gov/tools/ISWA/)) | None, free | HAPI JSON / CSV | **Live.** GOES protons to 17:45 UTC |
| GFZ Potsdam Kp | Official definitive and nowcast Kp | Second Kp source | `https://kp.gfz.de/app/json/?start=..Z&end=..Z&index=Kp` ([GFZ Kp](https://kp.gfz.de/en/data)) | None; CC BY 4.0 | JSON | **Live.** Values to 15:00 UTC, status "pre" (preliminary) |

### 2.2 Thresholds to use (NOAA Space Weather Scales)

Source: [NOAA SWPC, Space Weather Scales](https://www.spaceweather.gov/noaa-scales-explanation).

| Level | Measure | Biological effect (NOAA wording, shortened) | Suggested app action |
|---|---|---|---|
| S1 | >=10 MeV flux 10 | None listed | Show "minor radiation storm" notice |
| S2 | 10^2 | Elevated risk for high-flying aircraft at high latitude | Log dosimeter reading |
| S3 | 10^3 | "Radiation hazard avoidance recommended for astronauts on EVA" | Advise against EVA; prompt shelter check |
| S4 | 10^4 | "Unavoidable radiation hazard to astronauts on EVA" | Shelter prompt; notify flight surgeon |
| S5 | 10^5 | "Unavoidable high radiation hazard to astronauts on EVA" | As S4, highest priority |
| R1 to R5 | X-ray class M1, M5, X1, X10, X20 | Radio blackout; no biological effect | Comms delay notice |
| G1 to G5 | Kp 5, 6, 7, 8, 9 | No biological effect listed | Context only |

### 2.3 Example requests

```bash
curl -s https://services.swpc.noaa.gov/products/noaa-scales.json
curl -s https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json
curl -s "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/SEP?startDate=2026-09-20&endDate=2026-11-14"
curl -s "https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi/data?id=goesp_part_flux_P5M&time.min=2026-11-14T15:00:00Z&time.max=2026-11-14T17:00:00Z&format=csv"
```

```js
const scales = await fetch("https://services.swpc.noaa.gov/products/noaa-scales.json").then(r => r.json());
const sNow = Number(scales["0"].S.Scale);                       // 0..5
const p = await fetch("https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json").then(r => r.json());
const p10 = p.filter(x => x.energy === ">=10 MeV").at(-1);      // {time_tag, flux (pfu)}
```

### 2.4 How to use in our app

- A "Radiation weather" tile: S level from `noaa-scales.json`, the >=10 MeV proton curve, the latest flare, and DONKI SEP events. When S3 or higher, show an EVA advisory and add "radiation exposure" to the escalation rules.
- Poll SWPC once per minute at most; responses carry `cache-control: max-age=60`. CORS is open (`access-control-allow-origin: *`), so the browser can call it directly.
- GOES data describes geostationary orbit, not the inside of the ISS. Label it "space weather near Earth", not "crew dose".

### 2.5 Caveats

| Caveat | Detail |
|---|---|
| Moved products | `https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json` and `mag-1-day.json` return 404. Use `/json/rtsw/` (directory listing at `https://services.swpc.noaa.gov/json/rtsw/`). |
| Format change | `noaa-planetary-k-index.json` now returns objects (`time_tag`, `Kp`, `a_running`, `station_count`), not a list of lists. Old tutorials break. |
| Which GOES | Protons and X-rays come from GOES-18; electrons, magnetometer and SUVI from GOES-19 (`../samples/swpc_goes_instrument_sources.json`). |
| Web domain | `www.swpc.noaa.gov` pages redirect to `www.spaceweather.gov`. The data host is still `services.swpc.noaa.gov` ([SWPC data access](https://www.spaceweather.gov/content/data-access)). |
| DONKI range | The direct DONKI service rejects ranges over 60 days ("Date range cannot exceed 60 days"). |
| DONKI via api.nasa.gov | The gateway calls `/DONKI-API/get/FLR/` with a trailing slash, which returns 404. The same path without the slash works directly: `https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=..&endDate=..`. |
| DEMO_KEY | Docs: 30 requests per hour and 50 per day per IP ([api.nasa.gov authentication](https://api.nasa.gov/assets/html/authentication.html)). Observed header today: `x-ratelimit-limit: 10`. Prefer the direct CCMC host, which needs no key. |
| Legacy host | `https://kauai.ccmc.gsfc.nasa.gov/DONKI/` timed out. CCMC says to replace `kauai.ccmc.gsfc.nasa.gov` with `ccmc.gsfc.nasa.gov` ([DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/)). |

---

## 3. Measured radiation dose (crew and mission relevant)

### 3.1 Feeds and archives

| Name | What it gives | Health relevance | Endpoint | Auth/cost | Format | Verified status 2026-11-14 |
|---|---|---|---|---|---|---|
| Curiosity RAD (Mars surface) via iSWA HAPI | Dose rate in silicon (raw, RTG-corrected) and tissue-equivalent plastic, about every 17 min | Measured dose on Mars; benchmark for a "Mars base" mode | `https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi/data?id=msl_rad_dosimetry&time.min=..&time.max=..&format=csv` | None, free | HAPI CSV / JSON; units uGy/day | **Near-real-time.** Data 2011-11-20 to **2026-11-12 16:19 UTC** (about 2 days behind). Tissue dose 178 to 201 uGy/day (mean 187), 8 to 12 Nov |
| LRO CRaTER (lunar orbit) via iSWA HAPI | GCR + SEP dose rates, silicon-to-water corrected; micro-dosimeter with 30-day running sum | Dose near the Moon; benchmark for lunar missions | `...hapi/data?id=CRaTER_micro&...` and `id=CRaTER` | None, free | HAPI CSV; units cGy/day (x 10,000 = uGy/day) | **Lagging.** Data to **2026-10-07** (about 5 weeks behind). Micro-dosimeter 0.014 to 0.026 cGy/day (140 to 265 uGy/day), 1 to 7 Oct |
| NASA OSDR RadLab API | Dose rates from ISS and other detectors (DosTel, TEPC, Liulin, REM, Timepix and others) | Real ISS dose history for realistic simulation | `https://visualization.osdr.nasa.gov/radlab/api/?spacecraft=ISS&...&format=json` ([docs](https://visualization.osdr.nasa.gov/radlab/gui/data-api)) | None, free | CSV, TSV, JSON, HTML | **Archive.** API 200. Latest ISS data **2024-11-04** (DosTel1, DosTel2); BioSentinel to 2025-11-13. Docs page returned HTTP 500 at test time |
| Curiosity RAD archive (PDS) | Full RAD data products | Research-grade Mars dose | [PDS PPI MSL RAD](https://pds-ppi.igpp.ucla.edu/archive1/MSLRAD_1002/DOCUMENT/RAD_RDR_SIS.HTM) | None, free | PDS files | Docs only |
| MARIE (Mars Odyssey) | Mars orbit radiation, 2001 to 2003 | Historic Mars-orbit dose | [PDS PPI ODMA_0002](https://pds-ppi.igpp.ucla.edu/volume/ODMA_0002/AAREADME.HTM) | None, free | PDS files | Archive only; ended 2003 |
| ISS-RAD | Charged particle and neutron detector inside ISS | ISS crew-area dose | No public feed found; results in papers ([PubMed 37945093](https://pubmed.ncbi.nlm.nih.gov/37945093/)) | n/a | n/a | No public real-time data |
| Artemis I (MARE, Orion sensors) | Dose inside Orion around the Moon (2022) | Dose varies by a factor of 4 with shielding position | [Nature, 2024](https://doi.org/10.1038/s41586-024-07927-7) | n/a | Paper | Published results only |
| Artemis II crew dosimeters (CAD, HERA) | Crew-worn active dosimeters, April 2026 | Real crew dose on a lunar flight | Data go to the NASA Life Sciences Data Archive after flight ([FierceSensors](https://www.fiercesensors.com/sensors/artemis-crew-back-home-nasa-studies-radiation-future-flights)) | Request-based ([NLSP](https://nlsp.nasa.gov/)) | n/a | No public feed |
| CSA radiation monitoring | CANS neutron spectrometer (in development), bubble detectors, Radi-N2 | Neutrons are about 30 % of ISS radiation | [CSA, 2026-02-26](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), [Radi-N2](https://www.asc-csa.gc.ca/eng/sciences/radi-n2.asp) | n/a | n/a | No public data feed mentioned |

### 3.2 Reference limit

| Limit | Value | Source |
|---|---|---|
| Career effective dose limit (NASA) | Below 600 mSv, same for all ages and sexes | [NASA OCHMO radiation protection brief](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf) |

### 3.3 Example request

```bash
curl -s "https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi/info?id=msl_rad_dosimetry"
curl -s "https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi/data?id=msl_rad_dosimetry&time.min=2026-11-08T00:00:00Z&time.max=2026-11-13T00:00:00Z&format=csv"
```

### 3.4 How to use in our app

- Mission setting switch (station, lunar, Mars) changes the radiation baseline: CRaTER for the Moon, Curiosity RAD for Mars, RadLab history for the ISS.
- Simulated personal dosimeter: baseline from the matching feed, plus a jump when the live S level rises. Track a running mission total against the 600 mSv career limit. Absorbed dose (Gy) is not effective dose (Sv); label simulated values as estimates.
- iSWA HAPI allows browser calls (CORS `*`). RadLab sends no CORS header, so call it from a small server or pre-download a slice.

---

## 4. ISS position, people in space, mission trajectory

### 4.1 Feeds

| Name | What it gives | Health relevance | Endpoint | Auth/cost | Format | Verified status 2026-11-14 |
|---|---|---|---|---|---|---|
| Where The ISS At | ISS latitude, longitude, altitude, velocity, day or night; TLE | Day and night cycle (sleep and light); South Atlantic Anomaly passes (radiation) can be derived from position | `https://api.wheretheiss.at/v1/satellites/25544` ([docs](https://wheretheiss.at/w/developer)) | None, free; header limit 350 per 5 min (docs: about 1 per second) | JSON | **Live and correct.** lat -40.74, lon -89.55 at 17:52:12 UTC |
| CelesTrak GP | Official ISS orbital elements | Compute position offline | `https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON` ([docs](https://celestrak.org/NORAD/documentation/gp-data-formats.php)) | None, free | JSON, TLE, CSV and others | **Live.** Epoch 2026-11-14 04:10 UTC |
| corquaid ISS APIs | People in space (name, agency, craft, launch time, ISS yes/no, expedition); ISS docked spacecraft | Real crew roster and mission day count | `https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json` ([GitHub](https://github.com/corquaid/international-space-station-APIs)) | None, free; MIT | Static JSON (GitHub Pages) | **Live and current.** 10 people: 7 on ISS (Expedition 75), 3 on Shenzhou 23; last release 2026-10-15 |
| Launch Library 2 | Astronauts with `in_space=true` | Same roster, more detail | `https://ll.thespacedevs.com/2.3.0/astronauts/?in_space=true&mode=list` ([docs](https://ll.thespacedevs.com/docs/)) | Free tier 15 requests per hour (from `api-throttle` endpoint) | JSON | **Live.** 12 results incl. 2 non-human entries (filter `type.name != "Non-Human"`) |
| Open Notify astros | People in space | n/a | `http://api.open-notify.org/astros.json` | None | JSON | **Stale.** Lists the 2024 crew (e.g. Wilmore, Williams); repo last pushed 2021-06-03 ([GitHub](https://github.com/open-notify/Open-Notify-API)) |
| Open Notify ISS now | ISS position | n/a | `http://api.open-notify.org/iss-now.json` | None | JSON | **Wrong.** lat 47.90, lon 12.24 at 17:52:15 UTC, while SGP4 from the CelesTrak TLE gives lat -40.5, lon -89.4 |
| Artemis II AROW and ephemeris | Orion trajectory, April 2026 (CCSDS OEM 2.0, EME2000, km and km/s) | Earth-Moon distance, comms delay and radiation-belt timing for a lunar scenario | [NASA tracking page](https://www.nasa.gov/missions/artemis/artemis-2/track-nasas-artemis-ii-mission-in-real-time/), [ZIP](https://www.nasa.gov/wp-content/uploads/2026/03/all-artemis-ii-oem-files.zip) | None, free | ZIP of OEM text files | **Archive only.** Launch 2026-04-01 ([Spaceflight Now](https://spaceflightnow.com/2026/04/02/artemis-2-crew-blasts-off-on-historic-moon-mission/)); splashdown 2026-04-10 ([NY1](https://ny1.com/nyc/all-boroughs/space/2026/04/10/artemis-ii-orion-splashdown-day-10)). Last OEM vector 2026-04-10 23:53 UTC. Tracking page lists no crew health or radiation data |
| ISS On-Orbit Status Report blog | Daily crew activity summaries (exercise, medical exams) | Was a source of real crew task names | [NASA blog](https://www.nasa.gov/blogs/stationreport/) | n/a | RSS | **Discontinued.** Last post "ISS Daily Summary Report Discontinued", 2024-07-27 |

### 4.2 How to use in our app

- Use the real ISS roster for context only (for example "7 people aboard, Expedition 75"). Never attach simulated vitals to real named astronauts; use fictional crew for all health data.
- Use the ISS position for an orbit widget and a "day or night" indicator (about 16 orbits per day affects the sleep and light schedule).
- Use the Artemis II OEM file to replay a lunar mission: distance from Earth gives communication delay, which decides between "self-treat" and "ask the flight surgeon now".

### 4.3 Caveats

| Caveat | Detail |
|---|---|
| CelesTrak policy | Data updates every 2 hours. Since 2026-03-26 CelesTrak allows one download per update; repeats return HTTP 403, and more than 50 errors in 2 hours can block the IP ([CelesTrak](https://celestrak.org/NORAD/documentation/gp-data-formats.php)). Cache the file. |
| Open Notify | HTTP only (the HTTPS certificate does not match), so browsers block it on an HTTPS page. Data is stale. Do not use. |
| CORS | wheretheiss.at and corquaid send `access-control-allow-origin: *`. |

---

## 5. Astronaut biomedical data: no public real-time feed

### 5.1 Finding

No public real-time or near-real-time feed of astronaut vital signs (heart rate, blood pressure, glucose, temperature, sleep, mood) exists. NASA treats private medical communication between crew and ground medical staff as private under the Privacy Act of 1974 ([NASA-STD-3001 Vol. 1, section 6.2.2](https://www.nasa.gov/reference/6-0-medical-operations/)). Medical records are covered by NASA Privacy Act system of records 10HIMS ([NASA SORNs](https://www.nasa.gov/nasa-privacy-act-system-of-records-notices-sorns/)). None of the public ISS Live! items is biomedical (section 1.2).

### 5.2 How crew health data is collected and who sees it

| Data / activity | How it works | Who sees it | Public? | Source |
|---|---|---|---|---|
| Private Medical Conference (PMC) | Weekly private check-in with each ISS crew member, one at a time: sleep, eating, how they feel | Flight surgeons | No | [NASA podcast, ep. 377 (2025-03-21)](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/mission-control-crew-health-consoles/); [NASA-STD-3001 6.2.1](https://www.nasa.gov/reference/6-0-medical-operations/) |
| Private Psychological Conference (PPC) | Routine private behavioural health sessions | Behavioural health provider | No | [NASA-STD-3001 6.3.2](https://www.nasa.gov/reference/6-0-medical-operations/) |
| EVA medical clearance | Ground medical staff clear each crew member before each EVA | Flight surgeon | No | [NASA-STD-3001 6.4](https://www.nasa.gov/reference/6-0-medical-operations/) |
| CSA Bio-Monitor (Hexoskin-based smart shirt) | Heart rate and ECG, blood pressure, breathing rate and volume, skin temperature, SpO2, activity; data recorded, then sent through the station's communication system | Ground scientists | No | [CSA Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp) |
| Wearables, ultrasound, BP and glucose monitors | Smartwatches, BioButton, Butterfly iQ ultrasound; some data streams to mission control, the rest is stored and downlinked in batches | Mission control medical teams; archived to LSDA, ESA, TRISH | No (controlled research access) | [TrialX, 2025-04-24](https://trialx.com/how-health-data-is-collected-in-space-missions/) |
| Medical and research archives | LSAH holds medical data, LSDA holds research data. "Individual astronaut data are not downloadable": potentially attributable to a person and protected by the Privacy Act; access needs a reviewed data request | Approved researchers | Request only | [NASA LSAH, "Accessing NASA Astronaut Medical and Research Data" (2017, NTRS)](https://ntrs.nasa.gov/api/citations/20170009502/downloads/20170009502.pdf); [NASA Life Sciences Portal](https://nlsp.nasa.gov/) |
| Commercial crew data (TRISH EXPAND) | Omics, wearable sleep and activity, cognitive tests | Researchers with IRB approval and privacy board review | Request only | [BCM EXPAND FAQ](https://www.bcm.edu/academic-centers/space-medicine/expand/expand-database-biorepository-faq) |
| Inspiration4 open data (NASA OSDR) | De-identified biospecimen and omics data, 2021 mission | Public | Yes, but not real-time and not vitals | [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569); API tested: `https://osdr.nasa.gov/osdr/data/osd/meta/569` (200) |

Note on the TrialX article: it says transmissions use NASA's Deep Space Network. That network serves the Moon, Mars and beyond; ISS missions use NASA's Near Space Network ([NASA, communicating with missions](https://www.nasa.gov/communicating-with-missions/)).

### 5.3 Justification for simulated data (for the pitch)

| Point | Basis |
|---|---|
| Real crew vitals are private by law and by NASA standard | Privacy Act of 1974; NASA-STD-3001 6.2.2 and 6.3.2.2 ([NASA](https://www.nasa.gov/reference/6-0-medical-operations/)) |
| Even researchers get only reviewed access; individual data is not downloadable | [NASA LSAH (2017, NTRS)](https://ntrs.nasa.gov/api/citations/20170009502/downloads/20170009502.pdf), [EXPAND FAQ](https://www.bcm.edu/academic-centers/space-medicine/expand/expand-database-biorepository-faq) |
| The challenge expects astronauts to enter values themselves | Challenge brief: keyboard, clicks, camera, ultrasound images, values such as mg/dL (`00-challenge-brief.md`) |
| Our approach mirrors real practice | Self-measurement on board, routine private review by flight surgeons, escalation when needed ([NASA podcast ep. 377](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/mission-control-crew-health-consoles/)) |

---

## 6. Do not use (stale, broken or moved)

| Endpoint | Problem found 2026-11-14 | Use instead |
|---|---|---|
| `http://api.open-notify.org/astros.json` | 2024 crew list | corquaid `people-in-space.json` |
| `http://api.open-notify.org/iss-now.json` | Position wrong (Europe instead of south-east Pacific) | `api.wheretheiss.at` |
| `https://api.nasa.gov/DONKI/FLR` | HTTP 404 | `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR` |
| `https://kauai.ccmc.gsfc.nasa.gov/DONKI/...` | Connection timeout | `ccmc.gsfc.nasa.gov` |
| `https://services.swpc.noaa.gov/products/solar-wind/*.json` | HTTP 404 | `/json/rtsw/rtsw_wind_1m.json`, `/json/rtsw/rtsw_mag_1m.json` |
| ISS Daily Summary Report (NASA blog) | Discontinued July 2024 | None |
| Curiosity REMS weather (`https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json`) | Works, but latest sol is 2026-08-25 and the feed says "outreach purposes only" | Context only |

---

## 7. Overall plan for the app

| Layer | Source | Refresh | Called from |
|---|---|---|---|
| Station environment | ISS Live! (Lightstreamer) | Push (live) | Browser |
| Radiation weather | SWPC scales, GOES protons, flares, alerts | 1 min | Browser (CORS open) |
| Space weather events | DONKI direct (SEP, FLR, notifications) | 15 to 60 min | Browser (CORS open) |
| Lunar and Mars dose baseline | iSWA HAPI (CRaTER, MSL RAD) | Daily | Browser (CORS open) |
| ISS position, day or night | wheretheiss.at | 5 to 10 s | Browser (CORS open) |
| Crew roster (context only) | corquaid | Daily | Browser |
| Crew vitals | **Simulated** (fictional crew) | Per check-in | App |
| Offline fallback | `../samples/` snapshots | n/a | App |

Example escalation rules that link the live layers to simulated vitals:

| Trigger | App response |
|---|---|
| Live S level of S3 or higher | EVA advisory; dose check-in; notify flight surgeon |
| ppCO2 above 3 mmHg, plus a self-reported headache | Ask the crew member to rest in a well-ventilated module; flag to the crew medical officer |
| Cabin pressure falling | Emergency banner; vitals check-in skipped |
| ISS Live! signal lost | Show "data frozen since" time; keep self-assessment working |

---

## 8. Samples folder index

All files are in `../samples/`, fetched 2026-11-14 between 17:48 and 18:05 UTC.

| File | Content |
|---|---|
| `isslive_lightstreamer_eclss_snapshot.json` | ISS Live! snapshot of 17 life-support items (section 1.2) |
| `swpc_noaa_scales.json` | NOAA R/S/G scales now and 3-day outlook |
| `swpc_goes_integral_protons_6hour.json`, `swpc_goes_integral_protons_1day.json` | GOES integral proton flux |
| `swpc_goes_differential_protons_6hour.json`, `swpc_goes_integral_proton_fluence_7day.json` | Differential protons; daily fluence |
| `swpc_goes_xrays_6hour.json`, `swpc_goes_xray_flares_latest.json`, `swpc_goes_xray_flares_7day.json` | X-ray flux and flares |
| `swpc_planetary_k_index.json`, `swpc_planetary_k_index_1m.json`, `swpc_kp_forecast.json`, `swpc_kyoto_dst.json` | Geomagnetic indices |
| `swpc_alerts.json` | SWPC alert texts |
| `swpc_rtsw_wind_1m_first20.json`, `swpc_summary_solar_wind_speed.json`, `swpc_summary_solar_wind_mag_field.json` | Solar wind (first 20 rows of a 2.6 MB file) |
| `swpc_goes_instrument_sources.json`, `swpc_json_index.html`, `swpc_products_index.html` | Which GOES is primary; SWPC directory listings |
| `donki_ccmc_FLR.json`, `donki_ccmc_SEP.json`, `donki_ccmc_CME.json`, `donki_ccmc_GST.json`, `donki_ccmc_IPS.json`, `donki_ccmc_notifications.json` | DONKI direct (15 Oct to 14 Nov; notifications 7 to 14 Nov) |
| `donki_FLR_via_apinasa_404.json` | The 404 error from api.nasa.gov |
| `iswa_hapi_catalog.json`, `iswa_hapi_goesp_part_flux_info.json`, `iswa_hapi_goesp_part_flux_last2h.csv` | iSWA HAPI catalogue and GOES protons |
| `iswa_hapi_msl_rad_dosimetry_info.json`, `iswa_hapi_msl_rad_dosimetry_2026-11.csv` | Curiosity RAD dose, 8 to 12 Nov 2026 |
| `iswa_hapi_crater_micro_2026-10.csv` | LRO CRaTER micro-dosimeter, 1 to 7 Oct 2026 |
| `radlab_iss_dostel_sample.json`, `radlab_biosentinel_sample.json` | RadLab ISS DosTel (2022 example window) and BioSentinel (2025-11-13) |
| `gfz_kp_last2days.json` | GFZ Kp |
| `wheretheiss_25544.json`, `wheretheiss_25544_tles.json`, `celestrak_iss_gp.json` | ISS position and elements |
| `opennotify_astros.json`, `opennotify_iss_now.json` | Stale and wrong Open Notify responses (evidence) |
| `corquaid_people_in_space.json`, `ll2_astronauts_in_space.json` | People in space |
| `artemis2_oem_2026-04-10_head.txt` | First 40 lines of the final Artemis II CCSDS OEM file |
| `msl_rems_weather_latest5.json` | Curiosity REMS weather, 5 latest sols |
| `osdr_meta_OSD-569.json` | NASA OSDR metadata, Inspiration4 study |
| `nasa_stationreport_feed.xml` | RSS showing the Daily Summary Report was discontinued |
