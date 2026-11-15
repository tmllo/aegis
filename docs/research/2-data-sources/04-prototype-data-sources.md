# 04 Prototype data sources: real-time input for a browser demo

Captured: 2026-11-14 (day 1 of the 48 h hackathon). Scope: how to get live or realistic health data into a browser prototype on Earth, and how to label it in a standard format.
Marking: **[unverified]** = could not confirm from a primary source today; **[3rd-party]** = only a secondary or vendor source was found.

## Summary

| # | Finding |
|---|---|
| 1 | **Best live input: a Bluetooth chest strap read with Web Bluetooth.** Standard Heart Rate Service (0x180D), no account, no cost, about 50 lines of JS. Gives heart rate and, on good straps, beat-to-beat (RR) intervals for HRV. Works in Chrome, Edge and Opera only; not in Safari, Firefox or any iOS browser. |
| 2 | **Fallback with no hardware: the webcam.** `vitallens.js` estimates heart rate, HRV and breathing rate from the face. Its local methods (POS, CHROM, G) need no API key. Label the result "wellness estimate": accuracy drops with motion, poor light and darker skin tones. |
| 3 | **Everything else should be synthetic or typed in.** Use a seeded generator built on published spaceflight physiology for blood pressure, glucose, temperature, sleep, mood and radiation. The challenge explicitly allows keyboard and mouse input. |
| 4 | **Skip cloud wearable APIs for this build.** All need OAuth and a server. Most deliver data only after the device syncs, not live. The legacy Fitbit Web API was turned off on 2 Nov 2026. The Google Health API uses Restricted scopes that need a review. Garmin, Oura, Withings and WHOOP each add approval or membership gates. |
| 5 | **Store every reading as a FHIR R4 Observation with a LOINC code** (table in section 4). This is cheap to do, and it supports the "Validity" and "real-world" arguments to judges. |
| 6 | **Two demo rules.** Show no face or likeness of anyone under 18 in the camera demo. Disclose any AI-generated code or media (Space Apps "SI" rule). See `05-prior-art-and-judging.md`. |

Recommended stack:
- Web Bluetooth HR strap (live)
- vitallens.js camera (backup)
- MobiVital replay: recorded breathing and pulse waveforms, used when no hardware works on stage
- manual entry form
- synthetic crew generator (all other indicators)

Every reading is tagged `source` and `synthetic`.

---

## 1. Source comparison

| Source | Real-time? | Platform | Auth / cost | Effort for 48 h | Recommended? | Sources |
|---|---|---|---|---|---|---|
| **Web Bluetooth: Heart Rate Service 0x180D** (chest straps such as Polar H10/H7; Garmin watches in "broadcast HR" mode) | Yes. Notifications are streamed live; about 1 per second is typical **[unverified per device]** | Chrome 56+ / Edge 79+ / Opera desktop, Chrome Android. Not Safari, Firefox or any iOS browser. Linux and older Windows need a Chrome flag **[3rd-party]** | None. Free. Needs HTTPS (localhost is fine) and a user click | Low (half a day) | **Yes, primary live input** | [caniuse](https://caniuse.com/web-bluetooth), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API), [web-hr-monitor 2026](https://www.guyrutenberg.com/2026/04/04/web-hr-monitor-heart-rate-and-hrv-in-the-browser/), [Garmin broadcast manual](https://www8.garmin.com/manuals/webhelp/GUID-BC69665A-98C5-4953-BD19-F5EB5A26A4D0/EN-US/GUID-D8D363C2-0690-48D4-95E2-A3557E7D53C2.html) |
| **Web Bluetooth: other health GATT services** (Blood Pressure 0x1810, Health Thermometer 0x1809, Glucose 0x1808, Pulse Oximeter 0x1822) | Per measurement | Same as above | None. None of these UUIDs is on the Web Bluetooth blocklist | Medium. Many consumer devices use their own protocols instead of these services **[unverified per model]** | Optional, only if a compliant device is in hand | [Zephyr UUID list](https://docs.zephyrproject.org/latest/doxygen/html/group__bt__uuid.html), [GATT blocklist](https://github.com/WebBluetoothCG/registries/blob/master/gatt_blocklist.txt) |
| **Apple Watch** | Not as a standard BLE sensor. Third-party apps can re-broadcast HR **[3rd-party]** | watchOS / iOS | App purchase | Medium | No | [Garmin forum](https://forums.garmin.com/sports-fitness/cycling/f/edge-830/166054/can-i-use-my-apple-watch-as-a-heart-rate-monitor-with-my-edge-830), [HeartBLE](https://apps.apple.com/app/id6758879454) |
| **Fitbit Web API (legacy)** | n/a | REST | Support ended 30 Sep 2026. Endpoints were turned off 2 Nov 2026 and now return HTTP 410 | n/a | **No (shut down)** | [Google Health API: About](https://developers.google.com/health/about) |
| **Google Health API** (Fitbit successor) | Webhooks (heart rate is a trigger type since 14 Apr 2026). Intraday data available | REST `health.googleapis.com/v4` | Google OAuth. All scopes are "Restricted", so a privacy and security review is required. In Oct 2026 Google said it was "not onboarding new projects"; that notice was later removed with no reopening announced **[3rd-party]** | High | No | [About](https://developers.google.com/health/about), [Release notes](https://developers.google.com/health/release-notes), [Sahha 29 Oct 2026](https://sahha.ai/blog/fitbit-api-sunset-migration/) |
| **Google Health Connect** | On-device only | Android app only; no web API | Android permissions | High (needs an Android app) | No | [Android Health Connect FAQ](https://developer.android.com/health-and-fitness/guides/health-connect/develop/frequently-asked-questions) |
| **Apple HealthKit** | On-device only | iOS/watchOS app only; no web or REST API **[3rd-party]** | Apple developer account, HealthKit entitlement | High (needs an iOS app) | No | [Apple HealthKit docs](https://developer.apple.com/documentation/healthkit), [Momentum](https://www.themomentum.ai/blog/what-you-can-and-cant-do-with-apple-healthkit-data) |
| **Oura API v2** | Batch, after the ring syncs. Webhooks exist for summaries such as daily sleep; `heartrate` is reportedly not a webhook type **[3rd-party]** | REST | OAuth2 only (personal access tokens deprecated Dec 2025). Apps are limited to 10 users before Oura approval **[3rd-party]** | Medium to high | No (only to show one real night of sleep, if a team member owns a ring) | [Terra on Oura limits](https://tryterra.co/blog/oura-api-ai-apps-access-permissions-commercial-restrictions), [Hookdeck Oura webhooks](https://hookdeck.com/webhooks/platforms/guide-to-oura-webhooks-features-and-best-practices) |
| **Withings Public API** | Webhook after device sync. Blood pressure is notification `appli=16` | REST | "Start for Free" plan: 10 users, webhooks included. Withings+ membership is required for Withings accounts created after 12 Oct 2026. Callback URL cannot be localhost **[3rd-party]** | Medium to high | Optional, only with an existing Withings cuff and account | [Withings plans](https://static.withings.com/content/api/plans/plans.html), [Withings notifications](https://developer.withings.com/developer-guide/v3/data-api/keep-user-data-up-to-date) |
| **Polar AccessLink v3** | After sync. Continuous HR comes as 5-min samples. One webhook per client | REST | Any registered Polar Flow user can create a client; OAuth2 per end user | Medium | No (read the Polar strap live via Web Bluetooth instead) | [Polar AccessLink](https://www.polar.com/accesslink-api) |
| **Garmin Connect Developer Program** | Starter tier: push only. Enterprise: push or ping/pull. Personal key: pull only, own data | REST | Business application required. Program was paused about 7 months and reopened Oct 2026 **[3rd-party]**. Personal API key, no approval step (new in Oct 2026) | High | No (use Garmin watch HR broadcast over BLE) | [Garmin program overview](https://developer.garmin.com/gc-developer-program/overview), [the5krunner 22 Oct 2026](https://the5krunner.com/2026/10/22/garmin-personal-api/) |
| **WHOOP API v2** | Webhooks for new data. WHOOP states continuous HR is **not** available via the API; the strap can broadcast HR over BLE | REST | OAuth. API is free but requires a WHOOP membership | Medium | No (use BLE broadcast if a strap is available) | [WHOOP support](https://developer.whoop.com/docs/developing/support), [v1 to v2 migration](https://developer.whoop.com/docs/developing/v1-v2-migration) |
| **Dexcom API v3 sandbox** (CGM glucose) | Batch; simulated users | REST | Free sandbox for any registered developer, OAuth. Production needs a commercial partnership | Medium | Optional (a "real API" glucose feed with simulated data) | [Dexcom sandbox data](https://developer.dexcom.com/docs/dexcom/sandbox-data), [Scopes and access](https://developer.dexcom.com/docs/dexcom/scopes-access) |
| **Camera rPPG: vitallens.js** | Yes (live webcam) | Browser and Node.js | Local POS/CHROM/G: no key. VitalLens API method: free key on registration; quota **[unverified]** | Low to medium | **Yes, backup live input** | [vitallens.js](https://github.com/Rouast-Labs/vitallens.js), [vitallens (PyPI)](https://pypi.org/project/vitallens/) |
| **Camera rPPG: pyVHR, rPPG-Toolbox, open-rppg** | Offline (Python) | Python | Free / open source | High for a browser demo | No (research and benchmarking only) | [pyVHR paper](https://peerj.com/articles/cs-929), [rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox), [open-rppg](https://pypi.org/project/open-rppg/) |
| **MediaPipe Face Landmarker** | Yes | Browser (`@mediapipe/tasks-vision`) | Free | Low to medium | Optional: fatigue cues such as eye-closure blendshapes, **not** mood diagnosis | [MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) |
| **Face "emotion" models** (for example the Human library) | Yes | Browser | Free | Low | No for scoring mood; at most a prompt to self-report | [Barrett et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6640856/), [vladmandic/face-api](https://github.com/vladmandic/face-api) |
| **MobiVital dataset (replayed)** (UWB radar + IMU, with chest-band respiration and finger-clip pulse ground truth; 12 subjects) | Simulated live: replay the 50 Hz rows on a timer (section 6) | Browser JS after a one-off CSV-to-JSON step | Free. Zenodo copy is CC BY 4.0 (9.0 GB). GitHub repo states no license; it holds a sample plus 8 CSVs of about 8 MB each | Low to medium | **Yes, as a "real recorded signal" stream** for breathing and pulse waveforms | [GitHub](https://github.com/nesl/MobiVital-dataset), [Zenodo](https://zenodo.org/records/15022885), [paper arXiv:2503.11064](https://arxiv.org/abs/2503.11064) |
| **Synthea** | No (encounter-level records) | Java 17+ CLI | Free, Apache 2.0 | Medium | Optional (one sample FHIR bundle only) | [Synthea](https://github.com/synthetichealth/synthea) |
| **Custom synthetic crew generator** (section 5) | Yes (simulated clock) | Browser JS | Free | Low to medium | **Yes, for all non-live indicators** | Parameters cited in section 5 |
| **Manual entry** (forms, sliders, uploaded images) | Yes | Browser | Free | Low | **Yes** (explicitly allowed by the challenge) | `00-challenge-brief.md` |

---

## 2. Web Bluetooth implementation notes

| Item | Detail | Source |
|---|---|---|
| Secure context | Page must be HTTPS; `http://localhost` works for development | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API), [Rutenberg 2026](https://www.guyrutenberg.com/2026/04/04/web-hr-monitor-heart-rate-and-hrv-in-the-browser/) |
| User gesture | `navigator.bluetooth.requestDevice()` needs transient activation (a button click) | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) |
| Embedding | Blocked in cross-origin iframes unless `Permissions-Policy: bluetooth` allows it. Run the demo as a top-level page | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) |
| Workers | Not available in Web Workers | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) |
| Measurement format | Characteristic 0x2A37 (notify). Byte 0 holds flags; bit 0 = 0 means HR is uint8, bit 0 = 1 means uint16 | [Adafruit HRS driver](https://github.com/adafruit/Adafruit_CircuitPython_BLE_Heart_Rate/blob/master/adafruit_ble_heart_rate.py) |
| RR intervals | Optional field, present when flags bit 4 is set. Units are 1/1024 s, so ms = value * 1000 / 1024 **[3rd-party; check the SIG spec]** | [Redback docs](https://redback-operations.github.io/redback-documentation/docs/project-1/iot/codebase-documentation/drivers/Heart-rate-sensor), [Adafruit guide](https://learn.adafruit.com/circuitpython-ble-heart-rate-monitor-gizmo/heart-rate-service) |
| Fake RR warning | Some straps synthesise RR as 60000/HR, which makes HRV invalid. Detect and flag this | [Rutenberg 2026](https://www.guyrutenberg.com/2026/04/04/web-hr-monitor-heart-rate-and-hrv-in-the-browser/) |
| Polar ECG | Raw ECG uses Polar's own PMD service, not 0x180D. Not needed for this demo | [Polar BLE SDK](https://github.com/polarofficial/polar-ble-sdk) |

Minimal reader (Chrome/Edge):

```js
async function connectHR(onBeat) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  const server = await device.gatt.connect();
  const svc = await server.getPrimaryService('heart_rate');          // 0x180D
  const ch = await svc.getCharacteristic('heart_rate_measurement');  // 0x2A37
  ch.addEventListener('characteristicvaluechanged', e => {
    const v = e.target.value, flags = v.getUint8(0);
    let i = 1;
    const hr = (flags & 0x01) ? v.getUint16(i, true) : v.getUint8(i);
    i += (flags & 0x01) ? 2 : 1;
    if (flags & 0x08) i += 2;                                          // skip energy expended
    const rr = [];
    if (flags & 0x10) for (; i + 1 < v.byteLength; i += 2) rr.push(v.getUint16(i, true) * 1000 / 1024);
    onBeat({ hr, rr, ts: Date.now() });
  });
  await ch.startNotifications();
  return device;
}
```

---

## 3. Camera-based vitals: caveats to state in the UI and pitch

| Caveat | Evidence | Source |
|---|---|---|
| Wellness use only | vitallens.js states its estimates are for general wellness, not medical use | [vitallens.js](https://github.com/Rouast-Labs/vitallens.js) |
| Skin-tone bias | Public rPPG datasets are skewed toward lighter skin, which leaves accuracy gaps; newer neural models reduce but do not remove them (npj Digital Medicine, Oct 2025) | [Bondarenko et al. 2025](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12491395/), [VitalVideo preprint](https://arxiv.org/pdf/2404.05003v1.pdf) |
| Motion and lighting | Lighting changes caused by motion can swamp the pulse signal | [Emergent Mind summary](https://www.emergentmind.com/topics/remote-photoplethysmography-rppg) **[3rd-party]** |
| Breathing rate needs time | vitallens.js needs at least 10 s of video for respiratory rate | [vitallens on jsDelivr](https://www.jsdelivr.com/package/npm/vitallens) |
| Face emotion is not mood | Facial movements do not reliably map to emotions, so use a self-report scale (PHQ-2 or a slider) | [Barrett et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6640856/) |
| Local file pages | Chrome may block video processing on `file://`, so serve the page over localhost | [vitallens.js](https://github.com/Rouast-Labs/vitallens.js) |

Design implication: show camera vitals with a confidence badge, and cross-check against the strap when both are connected. Large disagreement means "re-measure".

---

## 4. Interoperability: FHIR R4 Observation + LOINC

All vital-sign Observations use `category = vital-signs` (FHIR R4 Vital Signs profile). The blood pressure panel carries no value of its own: systolic and diastolic are recorded as `component` entries.

| Indicator | LOINC | LOINC display | UCUM unit | FHIR category | Notes | Source |
|---|---|---|---|---|---|---|
| Vital signs panel | 85353-1 | Vital signs, weight, height, head circumference, oxygen saturation and BMI panel | none | vital-signs | Optional grouping | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Heart rate | 8867-4 | Heart rate | /min | vital-signs | Source: BLE strap or camera | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Blood pressure panel | 85354-9 | Blood pressure panel with all children optional | none | vital-signs | Holds the two components below | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Systolic BP | 8480-6 | Systolic blood pressure | mm[Hg] | (component) | | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Diastolic BP | 8462-4 | Diastolic blood pressure | mm[Hg] | (component) | | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Body temperature | 8310-5 | Body temperature | Cel | vital-signs | | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Oxygen saturation | 2708-6 (+ 59408-5 for pulse oximetry) | Oxygen saturation in arterial blood (by pulse oximetry) | % | vital-signs | US Core pulse-ox profile coding differs by version | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html), [US Core pulse ox](https://www.hl7.org/fhir/us/core/STU7/StructureDefinition-us-core-pulse-oximetry.html) |
| Respiratory rate | 9279-1 | Respiratory rate | /min | vital-signs | Source: camera rPPG | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Body weight | 29463-7 | Body weight | kg | vital-signs | In space this is measured by a mass device, not a scale | [FHIR R4 vitals](https://hl7.org/fhir/R4/observation-vitalsigns.html) |
| Blood glucose (fingerstick) | 41653-7 | Glucose [Mass/volume] in Capillary blood by Glucometer | mg/dL | laboratory | Use 2339-0 (blood, unspecified method) if the method is unknown | [findacode 41653-7](https://www.findacode.com/loinc/41653-7--glucose-bldc-glucomtr-mcnc.html), [findacode 2339-0](https://www.findacode.com/loinc/2339-0--glucose-bld-mcnc.html) |
| Sleep duration | 93832-4 | Sleep duration | h | survey / activity | Used in the HL7 Personal Health Record IG (trial use) | [HL7 PHR sleep value set](https://build.fhir.org/ig/HL7/personal-health-record-format-ig/ValueSet-pcd-sleep-observation-code.html) |
| HRV (SDNN) | 80404-7 | R-R interval.standard deviation (Heart rate variability) | ms | vital-signs | No LOINC for RMSSD was found; use a local code | [findacode 80404-7](https://www.findacode.com/loinc/80404-7--r-r-intervalstandard-deviation-heart-rate-variability.html) |
| Mood screen (weekly) | 55758-7 | PHQ-2 total score [Reported] | {score} (0-6) | survey | Validated 2-item screen | [findacode 55758-7](https://www.findacode.com/loinc/55758-7--patient-health-questionnaire-2-item-phq-2-total-score-reported.html) |
| Depression scale | 44261-6 | PHQ-9 total score [Reported] | {score} (0-27) | survey | Escalation step after a positive PHQ-2 | [findacode 44261-6](https://www.findacode.com/loinc/44261-6--phq-9-total-score-reported.html) |
| Daily mood slider (1-5) | none found | local code, e.g. `astro-health#mood-daily` | {score} | survey | **[unverified]** No suitable LOINC for a 1-5 mood slider was found | n/a |
| Pain | 72514-3 | Pain severity 0-10 verbal numeric rating [Score] - Reported | {score} | vital-signs | | [findacode 72514-3](https://findacode.com/loinc/72514-3--pain-severity-0-10-score-reported.html) |
| Radiation dose, cabin CO2 | none | local codes | mSv, mm[Hg] | (environment) | Model these as environment data, not patient Observations | n/a |

Example Observation (blood pressure, components):

```json
{
  "resourceType": "Observation",
  "status": "final",
  "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
  "code": { "coding": [{ "system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure panel" }] },
  "subject": { "reference": "Patient/crew-1" },
  "effectiveDateTime": "2026-11-14T07:30:00Z",
  "device": { "display": "manual entry" },
  "component": [
    { "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6" }] }, "valueQuantity": { "value": 112, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" } },
    { "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4" }] }, "valueQuantity": { "value": 71, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" } }
  ],
  "meta": { "tag": [{ "system": "astro-health", "code": "synthetic" }] }
}
```

---

## 5. Synthetic astronaut vitals generator

### 5.1 Model parameters (grounded where a source exists)

| Signal | Generator rule | Spaceflight effect to model | Source |
|---|---|---|---|
| Heart rate | Baseline + circadian sine (low during sleep) + activity bumps + Gaussian noise. Circadian amplitude is a free parameter | In-flight HR **unchanged** vs preflight in long-duration ISS crew | [Norsk et al. 2015, J Physiol](https://pmc.ncbi.nlm.nih.gov/articles/PMC4324706/) |
| Blood pressure | Baseline minus a flight offset, plus a nightly dip | 24-h systolic **-8 +/- 2 mmHg**, diastolic **-9 +/- 2 mmHg**, MAP -10 +/- 3 mmHg in flight; nightly dip (8 +/- 3 mmHg) preserved; cardiac output +41%, vascular resistance -39% | [Norsk et al. 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4324706/), [ScienceDaily](https://www.sciencedaily.com/releases/2015/01/150114101638.htm) |
| Core body temperature | 37.0 C + circadian sine + slow rise over mission days | At rest: **+1.01 C** on the ISS vs baseline, rising gradually and peaking only after months (about 2.5 months per a news summary). Peak during exercise: +1.39 C, above 40 C in some crew. Recovery after landing is slow | [Stahn et al. 2017, Sci Rep](https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078/), [Sci.News](https://www.sci.news/space/weightlessness-body-temperature-05609.html) |
| Sleep | Nightly duration ~ Normal(mean 6.1 h, sd tuned) against an 8.5 h scheduled window | ISS mean **6.09 h** (shuttle 5.96 h) against 8.5 h scheduled; only 24% of ISS sleep episodes reached 7 h or more | [Barger et al. 2014 (EurekAlert release)](https://www.eurekalert.org/news-releases/595450) |
| Mood (1-5) and PHQ-2 | Daily value drifts down with accumulated sleep debt and isolation day count; weekly PHQ-2 | No numeric spaceflight parameter verified here | [NASA HRP hazards](https://www.nasa.gov/hrp/hazards/) |
| Glucose | Meal-driven curve (rise after meals, fall overnight) + noise | No verified spaceflight-specific parameter; take normal ranges from the thresholds document | n/a |
| Radiation dose | Constant daily dose + rare solar-particle-event spikes | ISS about 80-160 mSv per 6 months, about 0.44-0.88 mSv/day **[3rd-party; NASA report not retrieved]** | [SIDC: radiation in space](https://www.sidc.be/article/radiation-space) |
| Comm delay | Setting-dependent constant | Mars: up to 44 min round trip (about 4-24 min one way). Moon: about 1.3 s one way (light time, computed) | [NASA HRP IWS 2025: comm delay](https://ntrs.nasa.gov/citations/20250000703) |

Scenario injections, so the demo can show detection and guidance:

| Scenario | What changes |
|---|---|
| `launch_fluid_shift` (days 1-3) | BP drops toward the flight offset; headache and congestion symptoms appear |
| `sleep_debt` | 3+ nights under 6 h; mood falls; resting HR up slightly |
| `fever` | Temperature +1.5 C above that crew member's baseline; HR up |
| `hypoglycemia` | Glucose falls after a skipped meal |
| `solar_particle_event` | Dose spike; prompt to move to the shelter |
| `landing_orthostatic` | HR rises and BP falls on standing |

### 5.2 Record schema (one record per reading)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AstroVitalsReading",
  "type": "object",
  "required": ["schema_version", "crew_id", "ts", "source", "synthetic"],
  "properties": {
    "schema_version": { "const": "1.0" },
    "crew_id":   { "type": "string", "examples": ["crew-1"] },
    "ts":        { "type": "string", "format": "date-time" },
    "mission": {
      "type": "object",
      "properties": {
        "setting":      { "enum": ["iss", "transit", "lunar_surface", "mars_surface", "rover"] },
        "met_day":      { "type": "integer", "description": "mission elapsed day" },
        "comm_delay_s": { "type": "number", "description": "one-way delay to ground" }
      }
    },
    "source":    { "enum": ["ble_hrs", "camera_rppg", "manual", "synthetic", "replay_mobivital", "device_api"] },
    "synthetic": { "type": "boolean" },
    "confidence":{ "type": "number", "minimum": 0, "maximum": 1 },
    "scenario":  { "type": ["string", "null"], "examples": ["sleep_debt"] },
    "vitals": {
      "type": "object",
      "properties": {
        "hr_bpm":          { "type": "number", "x-loinc": "8867-4" },
        "rr_ms":           { "type": "array", "items": { "type": "number" } },
        "hrv_sdnn_ms":     { "type": "number", "x-loinc": "80404-7" },
        "sbp_mmHg":        { "type": "number", "x-loinc": "8480-6" },
        "dbp_mmHg":        { "type": "number", "x-loinc": "8462-4" },
        "spo2_pct":        { "type": "number", "x-loinc": "2708-6" },
        "resp_rate_min":   { "type": "number", "x-loinc": "9279-1" },
        "temp_C":          { "type": "number", "x-loinc": "8310-5" },
        "glucose_mg_dL":   { "type": "number", "x-loinc": "41653-7" }
      }
    },
    "daily": {
      "type": "object",
      "properties": {
        "sleep_h":         { "type": "number", "x-loinc": "93832-4" },
        "mood_1_5":        { "type": "integer", "minimum": 1, "maximum": 5 },
        "phq2_0_6":        { "type": "integer", "minimum": 0, "maximum": 6, "x-loinc": "55758-7" },
        "pain_0_10":       { "type": "integer", "minimum": 0, "maximum": 10, "x-loinc": "72514-3" },
        "weight_kg":       { "type": "number", "x-loinc": "29463-7" },
        "symptoms":        { "type": "array", "items": { "type": "string" } }
      }
    },
    "env": {
      "type": "object",
      "properties": {
        "dose_mSv_day":    { "type": "number" },
        "cabin_ppco2_mmHg":{ "type": "number" }
      }
    }
  }
}
```

Generator rules:
- Seed the RNG so the demo replays the same story every time.
- Run a simulated clock (for example 1 mission day = 60 s).
- Emit one record per minute for HR and temperature, and one per day for sleep, mood and weight.
- Map each record into FHIR Observations (section 4) for the "export to flight surgeon" button.
- Never mix synthetic and live values without the `synthetic` flag. The UI should show a "SIM" badge.

---

## 6. Replaying MobiVital as a live feed

Purpose: a stream of real recorded human breathing and pulse waveforms that runs offline and never fails on stage. The datasets document covers the full dataset description; this section covers replay only.

| Item | Detail | Source |
|---|---|---|
| File shape | No header row. 1500 rows x 254 columns = 30 s at 50 Hz (checked locally on `sample.csv`, 2026-11-14) | [README](https://github.com/nesl/MobiVital-dataset) |
| Columns to use | Col 253 = respiration ground truth (chest band). Col 254 = blood pulse ground truth (finger clip). Cols 1-6 = IMU. Cols 13-252 = UWB radar I/Q (range bins from 0.30 m in 0.0514 m steps; target near bin 26) | [README](https://github.com/nesl/MobiVital-dataset) |
| Files available without the 9 GB download | `sample.csv` + 8 session CSVs (about 8 MB each) in the GitHub repo. Name pattern such as `231026_userI_tripod_01_5.csv` (date, user, setup, index; the README does not define it) | [GitHub file list](https://github.com/nesl/MobiVital-dataset) |
| Sanity check | On `sample.csv`, a naive peak detector gave about 63 pulses/min and about 21 breaths/min. These are rough figures, for plausibility only | Local check (this research) |
| Conditions | Seated, relaxed, normal breathing, 1.5 m from a tripod or handheld radar | [README](https://github.com/nesl/MobiVital-dataset) |
| Use limits | The README says the data is not intended for medical or healthcare inference; IRB-approved and anonymised. Credit the dataset (CC BY 4.0 on Zenodo) in the Space Apps "References" field | [README](https://github.com/nesl/MobiVital-dataset), [Zenodo](https://zenodo.org/records/15022885) |

Replay recipe:

| Step | Action |
|---|---|
| 1 | Offline (Python, once): read 2-8 CSVs and keep only cols 253-254 (optionally one radar bin near 26). Downsample to 25 Hz and write `mobivital_replay.json` as `{fs, segments:[{id, resp:[...], pulse:[...]}]}`. This makes the file under 1 MB instead of about 64 MB |
| 2 | Browser: load the JSON. Every 40 ms, push the next sample into a ring buffer. Draw the waveform strips on a canvas |
| 3 | Every 2 s, run peak detection over a sliding window (30 s for breathing, 10 s for pulse). Emit `{hr_bpm, resp_rate_min, source:"replay_mobivital", synthetic:false, confidence}` in the section 5.2 schema |
| 4 | Join segments end to end, with a short crossfade, to make a long stream. Label it "recorded Earth subject, replay" in the UI |
| 5 | Optional: add the spaceflight offsets from section 5.1, for example a gradual temperature rise. Once modified, set `synthetic:true` |

---

## 7. Unverified items to re-check if they matter

| Item | Status |
|---|---|
| VitalLens API free-tier quota | Not published in the sources found |
| Oura: `heartrate` not a webhook type; 10-user limit | Third-party sources only |
| Garmin program reopening (Oct 2026), personal API key | Third-party report (the5krunner); Garmin overview page confirms the tiers and the personal key |
| Google Health API onboarding status for new projects | Notice seen 13 Oct 2026, then removed; no reopening announced |
| RR-interval unit (1/1024 s) | Consistent across developer guides; SIG spec PDF not retrieved |
| Stahn 2017 "2.5 months" time course | +1.01 C at rest is confirmed in the paper; the 2.5-month figure comes from a news summary |
| ISS dose 80-160 mSv per 6 months | Secondary source; NASA 2017 report not retrieved |
| Polar H10 / Garmin broadcast notification rate (~1 Hz) | Typical behaviour; not confirmed per device |
| MobiVital GitHub repo license | No license file in the repo; the Zenodo copy is CC BY 4.0 |
