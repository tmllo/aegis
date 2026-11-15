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
| CelesTrak GP (`https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json`) | Orbital elements for ISS (NORAD 25544), Tiangong (48274) and other stations | `docs/research/samples/celestrak_iss_gp.json` (ISS, epoch 14 Nov), `docs/research/samples/celestrak_stations_tle_2026-11-09.json` (all stations, TLE text, from Tomas's gods-eye-view cache) | "CelesTrak (celestrak.org), Dr. T.S. Kelso" (US-government-origin data, no licence, citation requested) |

The gods-eye-view project (MIT, Bilawal Sidhu) also caches GPS, Galileo, GEO, Starlink and the brightest satellites. Not needed for crew health; leave them out unless Emile wants scenery.

## Normalized design
- `server/catalog/sources.d/orbit.yaml`: source `celestrak` (cadence 6 h, fallback the two files above, credit).
- `server/catalog/subjects.d/orbit.yaml`: `tiangong` (kind habitat, real, `norad: 48274`). Add `norad: 25544` to `iss` via a REQUESTS.md entry (base file), or keep a `norad_ids` map in `server/catalog/orbit.yaml`.
- `server/orbit/schema.sql`: table `orbit_elements (subject, epoch, line1, line2, source, quality, fetched_at)`, key `(subject, epoch)`. Elements are facts; positions are derived, never stored.
- `server/adapters/celestrak.py` (`ADAPTER`, `ORDER`): live GP JSON or TLE text into `orbit_elements`; falls back to the newest recorded copy (`quality: "recorded"`).
- `server/orbit/engine.py`: SGP4 propagation (`sgp4` package, approved), sub-satellite point (lat, lon, altitude), sunlit vs eclipse (Sun position + cylindrical Earth shadow, stated as an approximation), SAA membership (a sourced approximate boundary at ISS altitude, `basis` in the catalog), per-day counts (sunrises, SAA passes and minutes).
- `server/orbit/api.py`:

| Method | Path | Returns |
|---|---|---|
| GET | `/api/orbit?subject=iss&minutes=180&step_s=30&at=` | `{ subject, name, epoch, elements_age_h, quality, points: [{ t, lat, lon, alt_km, sunlit, in_saa }], now: {...}, next: { sunrise, sunset, saa_entry } }` |
| GET | `/api/orbit/elements?subject=iss` | `{ line1, line2, epoch, quality }` so the globe can propagate every frame itself with satellite.js if Emile wants smooth motion |
| GET | `/api/orbit/day?subject=iss&date=` | `{ sunrises, sunsets, saa_passes, saa_minutes, eclipse_minutes }` for the sleep and radiation sections |

Globe mapping for Emile: his `ll(lat, lon, r)` already turns latitude and longitude into a point on his sphere. Track points go straight in (`r` slightly above 1 for altitude). Colour by `sunlit` and `in_saa`.

## Honesty
Positions from week-old elements drift (the ISS reboosts and drag changes its orbit), so every response carries `elements_age_h` and the screen shows it. The SAA boundary and the eclipse model are approximations, labelled as such. The crew in the demo are simulated and live on a simulated Moon base; the ISS track is "the real station right now", the same framing as the Cabin screen.
