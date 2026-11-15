# Sleep health: design (backend)

Written 2026-11-15 ~03:55 CET (Tomas + Claude). Package: `server/sleep/`. Rules: `docs/backend/AGENT-RULES.md`.

## Why its own section
Sleep sits on two of NASA's five hazards at once: isolation and confinement (mood, stress) and the closed environment (cabin CO2, temperature, noise, light). On the ISS the crew sees many sunrises a day and work shifts move the sleep window, so the question is not only "how long" but "how regular" and "what in the cabin disturbed it". Today the crew file has one number (`self.sleep_h`); Kenji's red alert is a sleep alert, so this section is also the deeper view of the demo's red case.

## Facts (normalized, same core)
| Fact | Where | Notes |
|---|---|---|
| Sleep session: went to bed, fell asleep (optional), woke, got up | new table `sleep_session (id, subject, bed_t, sleep_t, wake_t, up_t, source, quality, attrs)` | An interval, so not an observation. Sources: check-in (typed), wearable (later), simulated (generator) |
| Sleep quality, restedness | observation `self.sleep_quality` (defined by the Mind lane; reuse, do not redefine) | 1-5 with words |
| Awakenings, nap minutes | observations `sleep.awakenings`, `sleep.nap_min` in `catalog/metrics.d/sleep.yaml` | Self-report or wearable |
| Cabin during the night | already in the store: `cabin.ppco2`, `cabin.temp` on the crew member's habitat (via `located_in`) | No new data needed |
| Duration | `self.sleep_h` (existing). When sessions exist, the engine derives it from them; the simulated series stays as is | One number, one source of truth per night |

## Derived (engine, rebuildable)
- **Sleep debt**: personal need (mean of the first 14 days, like every baseline) minus each night, summed over the last 7 nights.
- **Regularity**: standard deviation of the sleep midpoint over 7 nights (shift work moves it); flag when it drifts from the personal baseline.
- **Window shift**: change of the midpoint versus the previous week (schedule slams).
- **Night environment**: for each session, cabin CO2 and temperature readings inside the interval (descriptive, with the catalog limits).
- **Next-day link**: the following day's mood, stress and resting heart rate next to each night (shown side by side, no causal claim).
- **Alerts**: sleep duration keeps the contract rule (3-day mean vs own baseline). Debt and regularity are display-only until a sourced threshold exists.
- **System tasks** (through the Mind lane's task engine): a red or amber sleep alert creates a wind-down task and a "log tonight's sleep" task, closed by the next session.

## API (for Emile's sleep screen, also linked from the brain region on 01 Body)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/sleep?subject=c2&days=28` | nights: duration, quality, midpoint, awakenings, debt, regularity, cabin CO2 and temperature that night, next-day mood/HR; plus the personal baseline band |
| POST | `/api/sleep/sessions` | `{ subject, bed_t, wake_t, sleep_t?, up_t?, quality? }` from the morning check-in |
| GET | `/api/sleep/summary?subject=c2` | 7-day debt, regularity vs baseline, worst night and why (shortest, most awakenings, highest cabin CO2) |

## Simulated nights for the demo
The generator has durations only. Add simulated bed and wake times consistent with `self.sleep_h` (the session ends at the existing duration), with Kenji's later bedtimes and shorter nights in his red week. Written by `server/sleep/simulate.py` as source `sim_crew` sessions, never mixed with real data.

## Facts to verify before they go on a screen
ISS crew sleep averages (PROJECT_CONTEXT section 10 says about 6 h; verify), the scheduled sleep period on the ISS, light and noise conditions, any NASA standard for crew sleep. Cite each in `catalog/metrics.d/sleep.yaml` (`basis`).
