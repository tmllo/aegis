# EVA API (for Emile's suit screen)

Server: `uvicorn server.api.app:app --port 8000`. Call `GET /api/health` first. With no server, read `server/out/eva/moon_traverse_storm.json` and `mars_traverse_storm.json` (see the end).
Status: PROPOSED (`contracts/CHANGELOG.md`). `storm_forecast.json` and `crew_data.json` do not change.

Examples below are real responses from `TestClient` with `AEGIS_DB=":memory:"` and `AEGIS_REFRESH=0`. The clock on a sim is the mission day at noon UTC (`2026-11-14T12:00:00Z` today), not the server clock, so the same query always returns the same frames.

**Honesty**
- `quality` is always `simulated`. Heart rate starts from the member's simulated baseline in `crew_data.json`. SpO2 is a demo trace, not a sensor. There is no real astronaut physiology in this lane.
- Suit pressure is 4.3 psi, the NASA EMU operating pressure, and it does not move. `o2_pct` is remaining tank, not the gas mix in the suit. 100 is a full tank. The 16.8 V pack is the EMU battery; the 7-hour drain and the 700 L tank are working values.
- Quiet dose is the habitat `assumed_dose_mSv_day` in `subjects.yaml`, divided by 24 and multiplied by 1000. Moon 58.33 µSv/h is 1.4 mSv/day (Zhang et al. 2020). Mars 27.08 µSv/h is 0.65 mSv/day (Hassler et al. 2014). `storm=1` multiplies that rate by 30 from 40% of the way through. 30 is hand-set so the gauge jumps. It is not a measured solar particle event.
- The same task costs less heart rate on the Moon than on Mars, because the walking part of the rise is multiplied by gravity (0.166 g and 0.38 g). The suit part of the rise stays.
- Alert colours follow the EVA contract's mapping of NASA-STD-3001 Volume 2 Table 10.3-1. The numeric cutoffs in `server/catalog/eva.yaml` are working values, not a copied table cell. Every alert has a plain `action`.
- Habitat pins and waypoint bearings are working values (a south-pole Moon site, Jezero on Mars). Bearing does not change while you walk toward a waypoint. `sunlit` stays true: an EVA is planned in daylight.

**Colours** (not a field in the JSON; map them from `alerts[].level` and `status`)

| level | colour | what `status` becomes |
|---|---|---|
| emergency | flashing red | `abort` |
| warning | red | `warning` |
| caution | yellow | `caution` |
| advisory | blue | stays `nominal` |
| (no alert) | green | `nominal` |

**Conventions**
- `subject` is a simulated crew id: `c1`, `c2`, `c3`. Anything else is **404**.
- `site` is `moon` or `mars`. `profile` is `walk`, `traverse`, `sample` or `emergency`. `storm` is `0` or `1`.
- Defaults: `subject=c1`, `site=moon`, `profile=traverse`, `minutes=60`, `step_s=5`, `storm=0`.
- `minutes` is 1–240, `step_s` is 1–60. Frames run from `t_s` 0 through the last step that lands on `minutes * 60`. A 60-minute run at 5 s is 721 frames. More than 5000 frames is **422**.
- The seed is `subject|site|profile`. Two calls with the same query match, including the storm. `storm` does not change the walk, the heart rate or the tank. It changes dose, alerts and status.
- `alerts_by_level` counts each alert code once, at the worst level it reached. It does not count every frame.
- Errors you generate: `{"detail": "reason"}` with 404 (unknown crew subject) or 422 (bad site, profile, storm, too many frames, or an assess field that is not on a frame). A query outside the numeric bounds gives FastAPI's standard 422 with a list in `detail`.

| Method | Path | What |
|---|---|---|
| GET | `/api/eva/sites` | Moon and Mars: gravity, dose, temperature, sol, light delay, habitat, three waypoints |
| GET | `/api/eva/sim?subject=c1&site=moon&profile=traverse&minutes=60&step_s=5&storm=1` | one EVA, frame by frame |
| POST | `/api/eva/assess` | the same rules on one snapshot (`bio`, `suit`, `env` any subset) |

---

## GET /api/eva/sites
```json
{"sites": [
  {"id": "moon", "label": "Moon", "gravity_g": 0.166, "dose_uSv_h": 58.33,
   "ext_temp_c": {"min": -180, "max": 120}, "sol_hours": 708.7,
   "light_delay_s": {"min": 1.25, "max": 1.35},
   "habitat": {"name": "Artemis Base Camp", "lat": -89.5, "lon": 0.0},
   "waypoints": [
     {"id": "m1", "name": "Ridge", "distance_m": 180, "bearing_deg": 40, "task": "Inspect the ridge"},
     {"id": "m2", "name": "Crater rim", "distance_m": 420, "bearing_deg": 110, "task": "Photograph the rim"},
     {"id": "m3", "name": "Sample trench", "distance_m": 700, "bearing_deg": 200, "task": "Collect a regolith sample"}]},
  {"id": "mars", "label": "Mars", "gravity_g": 0.38, "dose_uSv_h": 27.08,
   "ext_temp_c": {"min": -125, "max": 20}, "sol_hours": 24.66,
   "light_delay_s": {"min": 240, "max": 1440},
   "habitat": {"name": "Jezero Base", "lat": 18.4, "lon": 77.5},
   "waypoints": [
     {"id": "a1", "name": "Fan edge", "distance_m": 220, "bearing_deg": 25, "task": "Walk the delta fan"},
     {"id": "a2", "name": "Outcrop", "distance_m": 480, "bearing_deg": 95, "task": "Photograph the outcrop"},
     {"id": "a3", "name": "Cache", "distance_m": 760, "bearing_deg": 160, "task": "Collect a core sample"}]}],
 "quality": "simulated",
 "sources": [
  {"id": "eva_sim", "credit": "Simulated suit and crew physiology. Not real astronaut data. Not medical advice."},
  {"id": "nasa_emu", "credit": "Suit pressure 4.3 psi and the 16.8 V battery: NASA EMU public facts. Drain time and tank size are working values."},
  {"id": "nasa_std_3001", "credit": "Alert colours follow the EVA contract mapping of NASA-STD-3001 Volume 2 Table 10.3-1 (https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf). Numeric cutoffs in eva.yaml are working values."},
  {"id": "habitat_dose", "credit": "Quiet surface dose is the habitat assumed_dose_mSv_day in subjects.yaml, as uSv/h. Moon 1.4 mSv/day is Zhang et al. 2020 (Sci Adv, doi:10.1126/sciadv.aaz1334). Mars 0.65 mSv/day is Hassler et al. 2014 (Science, doi:10.1126/science.1244797)."},
  {"id": "crew_baseline", "credit": "Resting heart rate is the simulated crew baseline in crew_data.json (first 14 mission days). Not a real astronaut."}]}
```
Every EVA response carries this same `quality` and `sources` list.

## GET /api/eva/sim?subject=c1&site=moon&profile=traverse&minutes=60&step_s=5&storm=1
Ana Silva (`c1`), Moon traverse, storm on. 721 frames. The storm starts at `t_s` 1440 (40% of the hour) and the status becomes `abort`.
```json
{"subject": "c1", "site": "moon", "profile": "traverse", "storm": 1,
 "start": "2026-11-14T12:00:00Z", "step_s": 5, "quality": "simulated",
 "sources": ["...same list as /api/eva/sites..."],
 "frames": [
  {"t_s": 0, "activity": 0.543, "distance_m": 0.0, "waypoint_id": "m1",
   "nav": {"target": "Ridge", "distance_m": 180.0, "bearing_deg": 40},
   "bio": {"hr_bpm": 77, "spo2_pct": 98.0, "resp_rate_bpm": 21, "core_temp_c": 37.27, "metabolic_w": 238},
   "suit": {"o2_pct": 100.0, "o2_time_left_min": 1023.0, "ppco2_mmHg": 3.8, "pressure_psi": 4.3,
            "coolant_c": 17.2, "battery_v": 16.8, "battery_pct": 100.0, "scrubber": "NOMINAL"},
   "env": {"dose_uSv_h": 58.33, "dose_cum_uSv": 0.0, "ext_temp_c": 63.8, "gravity_g": 0.166, "sunlit": true},
   "alerts": [], "status": "nominal"},
  "... 287 frames of the same walk ...",
  {"t_s": 1440, "activity": 0.464, "distance_m": 551.2, "waypoint_id": "m3",
   "nav": {"target": "Sample trench", "distance_m": 148.8, "bearing_deg": 200},
   "bio": {"hr_bpm": 74, "spo2_pct": 98.0, "resp_rate_bpm": 19, "core_temp_c": 37.21, "metabolic_w": 221},
   "suit": {"o2_pct": 97.6, "o2_time_left_min": 1075.9, "ppco2_mmHg": 3.97, "pressure_psi": 4.3,
            "coolant_c": 17.0, "battery_v": 16.64, "battery_pct": 94.3, "scrubber": "NOMINAL"},
   "env": {"dose_uSv_h": 1749.9, "dose_cum_uSv": 23.33, "ext_temp_c": 54.2, "gravity_g": 0.166, "sunlit": true},
   "alerts": [{"level": "emergency", "code": "ABORT_TO_HABITAT",
               "text": "Solar particle event. Dose rate is 1749.9 uSv/h.",
               "action": "ABORT TO HABITAT"}],
   "status": "abort"},
  "... through t_s 3600 ..."],
 "summary": {"duration_min": 60, "max_hr": 81, "o2_used_pct": 6.0, "dose_total_uSv": 1073.27,
             "alerts_by_level": {"advisory": 0, "caution": 0, "warning": 0, "emergency": 1},
             "verdict": "Abort. Return to the habitat now."}}
```
`storm=0` on the same walk keeps every `activity` and `o2_pct` and ends near 58 µSv, status `nominal`.

`profile=emergency` (no storm) plants the failure. Scrubber is `NOMINAL`, then `DEGRADED` at 15 min, then `FAULT` at 35 min. A 60-minute Moon run ends at warning, not abort:
```json
{"suit": {"o2_pct": 17.5, "o2_time_left_min": 9.7, "ppco2_mmHg": 15.93, "pressure_psi": 4.3,
          "coolant_c": 31.5, "battery_v": 16.4, "battery_pct": 85.7, "scrubber": "FAULT"},
 "status": "warning",
 "alerts": [
  {"level": "warning", "code": "PPCO2_HIGH", "text": "Helmet CO2 is 15.9 mmHg.", "action": "Stop the task and return to the habitat."},
  {"level": "warning", "code": "O2_LOW", "text": "Oxygen remaining is 17.5%.", "action": "Stop the task and return to the habitat."},
  {"level": "warning", "code": "COOLANT_HOT", "text": "Coolant is 31.5 C.", "action": "Stop the task and return to the habitat."},
  {"level": "warning", "code": "SCRUBBER", "text": "CO2 scrubber has failed.", "action": "Stop the task and return to the habitat."}]}
```
Summary for that run: `max_hr` 81, `o2_used_pct` 82.5, `dose_total_uSv` 58.33, four warning codes, verdict `Warning. End the EVA and return to the habitat.`

`profile=sample` is the high-effort one. Kenji (`c2`) on Mars, first frame of a burst: heart rate 93, metabolic rate 361 W, dose 27.08 µSv/h, gravity 0.38. The same walk on the Moon stays a few beats lower.

`GET /api/eva/sim?subject=nope` → `404 {"detail": "unknown crew subject 'nope'; known: ['c1', 'c2', 'c3']"}`.
`GET /api/eva/sim?site=iss` → `422 {"detail": "site must be one of ['moon', 'mars']; got 'iss'"}`.
`GET /api/eva/sim?minutes=240&step_s=1` → `422 {"detail": "too many frames: 14401 > 5000"}`.

## POST /api/eva/assess
Body: `subject`, `site`, and any subset of `bio`, `suit`, `env` using the frame field names. Missing fields stay at a rested walk. Same rules as the sim, so a slider and a playback frame agree.
```json
POST /api/eva/assess
{"subject": "c1", "site": "moon", "suit": {"ppco2_mmHg": 18, "o2_pct": 8}}

{"status": "abort",
 "alerts": [
  {"level": "warning", "code": "PPCO2_HIGH", "text": "Helmet CO2 is 18.0 mmHg.",
   "action": "Stop the task and return to the habitat."},
  {"level": "emergency", "code": "O2_LOW", "text": "Oxygen remaining is 8.0%.",
   "action": "Abort the EVA and return to the habitat now."}],
 "quality": "simulated",
 "sources": ["...same list as /api/eva/sites..."]}
```
An empty suit (`{"subject": "c1", "site": "moon"}`) is `{"status": "nominal", "alerts": []}`. A field that is not on a frame, such as `suit.gloves`, is 422.

Codes you can see: `HR_HIGH`, `PPCO2_HIGH`, `O2_LOW`, `COOLANT_HOT`, `BATTERY_LOW`, `SCRUBBER`, `ABORT_TO_HABITAT`. Scrubber values are `NOMINAL`, `DEGRADED`, `FAULT`.

## Where this differs from the issue
The frame, the summary and the three routes match the contract. These are the extras and the readings that the issue left open:
- `GET /api/eva/sim` also returns `storm` (0 or 1).
- `POST /api/eva/assess` also returns `quality` and `sources`, same as the other two routes.
- `sources` is a list of `{id, credit}`.
- `status` is `nominal | caution | warning | abort`. An emergency alert is `abort`. An advisory alert leaves `status` at `nominal`; colour it from `alerts[].level`.
- Colours are the table above. They are not repeated on each alert.
- `o2_pct` is remaining tank. `spo2_pct` is a demo trace.
- `start` is the mission day at 12:00:00Z, so a replay matches.
- `alerts_by_level` counts codes, once each, at their worst level.

## Offline copy
`python -m server.build` writes:
- `server/out/eva/moon_traverse_storm.json`
- `server/out/eva/mars_traverse_storm.json`

Each file is the `GET /api/eva/sim` body for `c1`, `profile=traverse`, `minutes=60`, `step_s=5`, `storm=1`. Copy them next to the app if the suit screen has to play with no server. They are generated, like the other files in `server/out/`.
