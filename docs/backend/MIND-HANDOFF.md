# Mind lane handoff (2026-11-15)

State: everything below is on `main` (branch lane/mind). Gates green: build 4x identical, rejected=0; 109 tests pass.

## Done
- Mind layer (`server/mind/`), activities (`server/catalog/activities.yaml`, `GET /api/activities`,
  `POST /api/activities/{id}/events`). Docs: `MIND-API.md` (for Emile), `MIND-DESIGN.md` (internals).
- Aligned with Emile's `origin/crew-station` 84818bb (`web/src/data/mind.ts`, `console/MindPage.tsx`). His calls all
  replay with 0 failures (tests `test_replay_emile_*`, `test_scale_words_equal_emile_scales`, `test_mind_app_compat.py`).

## Mismatches found vs Emile's app and what we changed (server side only)
1. mind.ts:159 posts every score at `${date}T12:00:00Z`: a still-low check-in closed c3's alert. Fixed: a self-report
   alert closes only when the newest reading (>= evidence_t, so a same-t correction counts) is no longer flagged.
2. mind.ts:14-15 SCALES energy/sleep words differed from ours; server words now equal his.
3. mind.ts:173 sends its own task id + extra fields; mind.ts:131 routine ids `routine-c1-check-in` etc. Already handled
   by 487c51d (client ids kept, `aliases` in routines.yaml).
4. Same-day same-t re-rating: latest live check-in of a day now replaces (not averaged).
Not ours to fix (tell Emile): mind.ts:177 untick sends nothing (server keeps done; he can POST status "skipped" same t);
his app never calls /api/notes (journal local only, fine) or /api/activities yet.

## Reviewer bugs fixed in the last commit
Same-t correction closes; one open system task per metric (no pile-up); activity logged once per activity per day;
activity logs hidden from GET /api/tasks; no tasks for stale alerts.

## Left to do
- Nothing blocking. Optional: REQUESTS.md row (self.mood scale words in base metrics.yaml).
- Final section 8 report to the human was not written in full; this file + MIND-API.md cover it.
