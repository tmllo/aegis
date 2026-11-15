// Reaction test, after the Psychomotor Vigilance Test (PVT) that ISS crews use to track fatigue:
// a dot appears after a random wait, tap as fast as you can. Standard PVT scoring: mean reaction time,
// lapses (> 500 ms), false starts (a tap before the dot). Short version: about one minute.
// Pure scoring here (tested in reaction.test.ts); the hook is useReactionTest.ts.

export const LAPSE_MS = 500;
export const MIN_VALID_MS = 100; // faster than this is anticipation, not reaction

export interface PvtResult {
  trials: number;
  meanMs: number | null;
  medianMs: number | null;
  lapses: number;
  falseStarts: number;
}

export function score(rts: number[], falseStarts = 0): PvtResult {
  const valid = rts.filter((r) => r >= MIN_VALID_MS);
  const early = rts.length - valid.length;
  const sorted = [...valid].sort((a, b) => a - b);
  const mean = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
  const median = sorted.length ? Math.round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  return { trials: valid.length, meanMs: mean, medianMs: median, lapses: valid.filter((r) => r > LAPSE_MS).length, falseStarts: falseStarts + early };
}

/** Compare against the person's own previous results (needs 3+). */
export function againstBaseline(meanMs: number, history: number[]): { status: 'green' | 'amber' | 'red'; usual: number | null } {
  if (history.length < 3) return { status: 'green', usual: null };
  const m = history.reduce((a, b) => a + b, 0) / history.length;
  const sd = Math.max(25, Math.sqrt(history.reduce((a, b) => a + (b - m) ** 2, 0) / history.length));
  const z = (meanMs - m) / sd;
  return { status: z >= 3 ? 'red' : z >= 2 ? 'amber' : 'green', usual: Math.round(m) };
}

/** Random wait before the next dot, ms (PVT uses 2-10 s; the short version uses 1.5-4 s). */
export const nextWait = (rand = Math.random) => 1500 + Math.round(rand() * 2500);
