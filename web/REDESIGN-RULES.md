# Frontend redesign rules (15 Nov, tonight)

For Emile and his Claude Code. Read `../docs/ARCHITECTURE.md` first: it is the system these rules protect.

**The redesign is a restyle, not a restructure.** Change how screens look and are laid out. Do not change how data flows or how alerts are decided.

**Freeze at 21:30** (move it only if Tomas and Emile both agree). After the freeze: fixes only, no new screens, then merge into `main`.

## 1. Frozen: do not change

| Path or thing | Why |
|---|---|
| `src/data/` | The only code that loads files or calls the network |
| `src/core/` (scoring, radiation, cabin, alarm) | Pure logic, locked by tests. The golden test fails if scoring changes |
| `public/data/*.json` | Tomas's exports. Read-only for the app |
| `../contracts/` shapes | The interface with the backend. Need a field? Write it in `../contracts/CHANGELOG.md` and tell Tomas |
| The five C&W classes and their thresholds | Defined in `docs/ARCHITECTURE.md`, section 3 |
| The safety rule | Emergency comes only from a measured event. A model forecast raises Warning, never Emergency |
| Footer disclaimers and credits | Simulated crew data, not medical advice, data credits, anatomy credit |
| Dependencies | No new packages without asking Tomas |

## 2. Free: change as much as you like

Layout, components, CSS, typography, navigation, 3D scene, motion, sound, copy.

## 3. Scope

The demo screens only, all in `src/station/`: **Overview** (`/`), **Crew health** (`/crew`), **Check-in** (`/checkin`), **Radiation** (`/radiation`), and the **guided Demo**.
Every other screen or lane (console, concepts, globe lab, EVA, mind, organs) stays out of the navigation. Hide it, don't delete it.

Design references, in this order:
1. `docs/crew-ux.md`, section 6: the 10 crew UX rules. The ones that matter most tonight:
   - Status by shape and word as well as colour (green dot, amber triangle, red square, each with a 1-word label).
   - One primary action per screen, always in the same place.
   - Touch targets at least 72 px, primary and emergency controls 96 px.
   - Text never under 14 px; labels and critical values 22 px or more; contrast 4.5:1 or better.
   - Every value sits on the person's own baseline band. No bare numbers.
2. `docs/REDESIGN.md`: the visual identity (warm black, Instrument Serif display, mono labels).
3. Readable from the back of a room on a 1920×1080 projector.

## 4. Task 1, before any restyling: fix the alarm class

The storm model's warning currently raises **Emergency**, and the measured particle arrival raises nothing. Both break the safety rule. `src/core/alarm.ts` already has the correct mapping (`alarmClass`, `alarmActive`), locked by `alarm.test.ts`.

1. `src/station/state.ts`: import `AlarmPhase` from `../core/alarm` instead of declaring it again.
2. `src/station/model.ts`:
   - `actionQueue(views, sw, stationAlarm: boolean)` becomes `actionQueue(views, sw, phase: AlarmPhase)`.
   - At line 246, use `const cls = alarmClass(phase)`. If it is `'warning'`: title "Storm forecast", detail "Suspend EVA. Move to the storm shelter as a precaution." If it is `'emergency'`: title "Storm in progress", detail "Particles have arrived. All crew stay in the shelter." Set `cw: cls`.
   - At line 304, pass `alarm.phase` instead of the boolean.
3. `src/station/pages/Radiation.tsx`, replay effect around line 241: when `e.onset` is reached, also call `setAlarm({ ...alarm, phase: 'arrived' })` (keep `flare`, `p`, `firedAt`; set the lead hours if the state has a field for it). A storm that arrives with no warning (the "Storm missed" branch) also sets `phase: 'arrived'`: a measured storm is an Emergency whether or not we predicted it.
4. Replace the `alarm.phase === 'warning' || alarm.phase === 'sheltered'` checks with `alarmActive(alarm.phase)` in `StationApp.tsx`, `Overview.tsx`, `CrewHealth.tsx` and `model.ts`, so the shelter overlay stays up after arrival. The Shelter overlay should show Warning wording before arrival and Emergency wording after.
5. `src/station/Demo.tsx`, line 33: "Press play. The model never saw 2024. Watch the shelter warning go out hours ahead, then the emergency when the particles actually arrive."

Done when `bash scripts/check-all.sh` is green. Its "Emergency only from a measured event" check fails until this task is finished; that is intended.

## 5. Before every commit

```
bash scripts/check-all.sh --quick     # while working
bash scripts/check-all.sh             # before every push (includes the offline build)
```

It checks: typecheck, unit tests, no network calls outside `src/data`, `src/core` stays pure, `public/data` untouched, no hand-written `'emergency'`, offline build.
Optional, if Playwright is installed: `node scripts/check-ui.mjs http://127.0.0.1:5630` clicks every control and fails on console errors or external requests (its route list is from the older console app; update it to the station routes if you use it).

## 6. Definition of done

- The guided Demo runs all 7 beats with no dead end, on the offline build, in under 2 minutes.
- `bash scripts/check-all.sh` is green.
- Every screen passes a 2-metre test: overall status readable in one second from across the room.
- `mission-console` is merged into `main` and pushed. Judges open `main`.
