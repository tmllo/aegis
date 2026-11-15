# Orbit layer: real station orbits on Emile's Earth (design)

Written 2026-11-15 ~04:30 CET (Tomas + Claude). Package: `server/orbit/`. Rules: `docs/backend/AGENT-RULES.md`.

## What and why
Emile's Earth (`web/src/console/World.tsx`, `Globe.tsx`) draws a stylised orbit ring (`ORBIT_TILT`, `onOrbit(a)`) with the crew pin on it. Replace it with the **real orbit** of the ISS (and Tiangong for context), and colour it by what matters for crew health:
- **Sunlit / eclipse** along the track: about one sunrise per 92-minute orbit, so roughly 16 a day. This links to the sleep section (circadian disruption).
- **South Atlantic Anomaly passes**: the region where trapped protons raise the dose rate. This links to the radiation section (dose spikes on SAA passes).
- **Data age**: orbit elements age; the track says how old they are.

## Data (all real, offline copies in the repo)
| Source | What | Offline copy | Credit |
|---|---|---|---|
| CelesTrak GP (`https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json`) | Orbital elements for ISS (NORAD 25544), Tiangong (48274) and other stations | `docs/research/samples/celestrak_iss_gp.json` (ISS, epoch 14 Nov), `data/orbits/celestrak/*.tle` (8 groups, about 16,000 objects, epoch about 9 Nov, from Tomas's gods-eye-view cache; `index.json` lists them) | "CelesTrak (celestrak.org), Dr. T.S. Kelso" (US-government-origin data, no licence, citation requested) |

## Every satellite group, each one a toggle
The gods-eye-view project (MIT, Bilawal Sidhu) cached eight CelesTrak groups; all are in `data/orbits/celestrak/`:

| Group | Objects | Layer on the globe | Default |
|---|---|---|---|
| `stations` | 15 | Crewed stations and modules (ISS, Tiangong): full track with sunlit and SAA colouring, computed by the server | on |
| `visual` | 156 | Brightest satellites (the ones visible to the eye) | off |
| `gps-ops`, `galileo`, `glo-ops` | 32 + 32 + 26 | Navigation (GPS, Galileo, GLONASS) | off |
| `geo` | 568 | Geostationary ring (weather and comms) | off |
| `starlink` | 10,621 | Starlink | off |
| `active` | 15,883 | Every active satellite (includes all of the above) | off |

Normalized storage: one row per satellite, one membership row per group, one element set per satellite:
- `orbit_object (norad, name, intl_designator)`, `orbit_group (id, label, kind, default_on, credit)`, `orbit_membership (norad, group_id)`, `orbit_elements (norad, epoch, line1, line2, source, quality, fetched_at)`.
- A satellite in both `starlink` and `active` is stored once. Turning on two overlapping layers never draws it twice: the app dedupes by `norad`.
- Group labels, kinds (`crewed`, `navigation`, `comms`, `observation`, `scenery`) and defaults live in `server/catalog/orbit.yaml`, so a new group is one catalog entry plus one fetch.

Who computes what:
- **Stations (health layer):** the server propagates them and returns tracks with `sunlit` and `in_saa` (`/api/orbit`).
- **Every other layer (thousands of points):** the server sends element sets only; the app propagates them in a Web Worker with satellite.js (about once a second is plenty for dots) and draws them as one instanced points mesh per layer. That keeps the server light and the toggles instant once loaded.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/orbit/groups` | `[{ id, label, kind, objects, default_on, elements_age_h, quality, credit }]`: the toggle list |
| GET | `/api/orbit/elements?group=starlink` | `{ group, elements_age_h, quality, sats: [{ norad, name, line1, line2 }] }`, gzip-compressed (Starlink is about 1.7 MB raw). Fetched the first time a layer is switched on |

Offline: the server reads `data/orbits/celestrak/` when CelesTrak can't be reached, `quality: "recorded"`. For a static build with no server, a view writes `server/out/orbits/stations.json` for Emile to copy into `web/public/samples/`; the big layers only appear when the server is running.

Live refresh: CelesTrak updates elements a few times a day and asks clients not to download the same group more often than it changes, so cadence 6 h per group.

## Normalized design
- `server/catalog/sources.d/orbit.yaml`: source `celestrak` (cadence 6 h, fallback the two files above, credit).
- `server/catalog/subjects.d/orbit.yaml`: `tiangong` (kind habitat, real, `norad: 48274`). Add `norad: 25544` to `iss` via a REQUESTS.md entry (base file), or keep a `norad_ids` map in `server/catalog/orbit.yaml`.
- `server/orbit/schema.sql`: the four tables in the groups section. Elements are facts; positions are derived, never stored. Stations link to subjects (`iss` = NORAD 25544, `tiangong` = 48274) through `server/catalog/orbit.yaml`.
- `server/adapters/celestrak.py` (`ADAPTER`, `ORDER`): live GP JSON or TLE text into `orbit_elements`; falls back to the newest recorded copy (`quality: "recorded"`).
- `server/orbit/engine.py`: SGP4 propagation (`sgp4` package, approved), sub-satellite point (lat, lon, altitude), sunlit vs eclipse (Sun position + cylindrical Earth shadow, stated as an approximation), SAA membership (a sourced approximate boundary at ISS altitude, `basis` in the catalog), per-day counts (sunrises, SAA passes and minutes).
- `server/orbit/api.py`:

| Method | Path | Returns |
|---|---|---|
| GET | `/api/orbit?subject=iss&minutes=180&step_s=30&at=` | `{ subject, name, epoch, elements_age_h, quality, points: [{ t, lat, lon, alt_km, sunlit, in_saa }], now: {...}, next: { sunrise, sunset, saa_entry } }` |
| GET | `/api/orbit/elements?subject=iss` | `{ line1, line2, epoch, quality }` for one object (smooth per-frame motion with satellite.js) |
| GET | `/api/orbit/day?subject=iss&date=` | `{ sunrises, sunsets, saa_passes, saa_minutes, eclipse_minutes }` for the sleep and radiation sections |

Globe mapping for Emile: his `ll(lat, lon, r)` already turns latitude and longitude into a point on his sphere. Track points go straight in (`r` slightly above 1 for altitude). Colour by `sunlit` and `in_saa`.

## Honesty
Positions from week-old elements drift (the ISS reboosts and drag changes its orbit), so every response carries `elements_age_h` and the screen shows it. The SAA boundary and the eclipse model are approximations, labelled as such. The crew in the demo are simulated and live on a simulated Moon base; the ISS track is "the real station right now", the same framing as the Cabin screen.
