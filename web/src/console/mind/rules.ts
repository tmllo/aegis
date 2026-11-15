// Mind triage: deterministic rules decide how she is doing and where it goes. The advisor (advisor.ts)
// only explains; it may never change the level or the route. Inputs: the server's wellbeing summary
// (/api/wellbeing: weekly means, trend, alerts against her own baseline) and today's check-in.
// Anchors: NASA OCHMO TB-016 behavioural health (private psychological conferences, family contact),
// MTB-009 circadian desynchrony (sleep), team rules in docs/research/3-health-science/03 (yellow on
// 2 readings in 72 h or a 7-day trend -> next private conference; any red -> crew medical officer now).
import type { Status } from '../../data/types';

export type ScoreKey = 'self.mood' | 'self.stress' | 'self.energy' | 'self.social' | 'self.sleep_quality' | 'self.sleep_h';

export interface Wellbeing {
  weeks: { from: string; to: string; scores: Partial<Record<ScoreKey, { mean: number; n: number }>>; checkin_days: number }[];
  trend: Partial<Record<ScoreKey, { first: number; last: number; change: number }>>;
  checkin_streak?: number;
  alerts?: { metric: string; t: string; severity: 'amber' | 'red'; message: string }[];
}

/** Today's 1-5 answers; stress is high-side (5 = overwhelmed), the others low-side. */
export type Today = Partial<Record<'self.mood' | 'self.stress' | 'self.energy' | 'self.social' | 'self.sleep_quality', number>>;

export type Route = 'self-care' | 'private-conference' | 'crew-medical-officer';

export interface MindRead {
  status: Status;
  /** one word for the page */
  word: 'Steady' | 'Strained' | 'Reach out';
  /** short plain reasons, most important first (empty when steady) */
  reasons: string[];
  route: Route;
}

const LABEL: Record<ScoreKey, string> = {
  'self.mood': 'Mood',
  'self.stress': 'Stress',
  'self.energy': 'Energy',
  'self.social': 'Feeling connected',
  'self.sleep_quality': 'Sleep quality',
  'self.sleep_h': 'Sleep',
};

/** A week-on-week move this large on a 1-5 scale counts as a drop (about half a step). */
export const DROP = 0.5;

export function assess(w: Wellbeing | null, today: Today = {}): MindRead {
  const reasons: string[] = [];
  let red = false;
  let amber = false;

  // today's answers at the ends of the scale
  if ((today['self.mood'] ?? 3) <= 1) { red = true; reasons.push('Mood very low today'); }
  if ((today['self.stress'] ?? 3) >= 5) { red = true; reasons.push('Stress overwhelming today'); }
  if ((today['self.mood'] ?? 3) === 2) { amber = true; reasons.push('Mood low today'); }
  if ((today['self.stress'] ?? 3) === 4) { amber = true; reasons.push('Stress high today'); }
  if ((today['self.social'] ?? 3) <= 1) { amber = true; reasons.push('Feeling cut off today'); }

  // the server's alerts are already scored against her own baseline
  const days = new Map<ScoreKey, number>();
  for (const a of w?.alerts ?? []) {
    const k = a.metric as ScoreKey;
    if (!(k in LABEL)) continue;
    if (a.severity === 'red') red = true;
    else amber = true;
    days.set(k, (days.get(k) ?? 0) + 1);
  }
  for (const [k, n] of days) reasons.push(`${LABEL[k]} ${k === 'self.stress' ? 'above' : 'below'} her usual on ${n} ${n === 1 ? 'day' : 'days'}`);

  // week-on-week trend
  const tr = w?.trend ?? {};
  const fell = (k: ScoreKey) => (tr[k]?.change ?? 0) <= -DROP;
  if (fell('self.mood')) { amber = true; reasons.push(`Mood down ${Math.abs(tr['self.mood']!.change).toFixed(1)} this week`); }
  if ((tr['self.stress']?.change ?? 0) >= DROP) { amber = true; reasons.push(`Stress up ${tr['self.stress']!.change.toFixed(1)} this week`); }
  if (fell('self.social')) { amber = true; reasons.push('Feeling less connected this week'); }
  const sleepH = w?.weeks.at(-1)?.scores['self.sleep_h']?.mean;
  if (sleepH != null && sleepH < 6) { amber = true; reasons.push(`Sleep ${sleepH.toFixed(1)} h a night this week`); }

  const unique = [...new Set(reasons)];
  if (red) return { status: 'red', word: 'Reach out', reasons: unique, route: 'crew-medical-officer' };
  if (amber) return { status: 'amber', word: 'Strained', reasons: unique, route: 'private-conference' };
  return { status: 'green', word: 'Steady', reasons: [], route: 'self-care' };
}

/** Plain routing text, with the one-way signal delay to the ground. */
export function routeText(route: Route, delay: string): string {
  if (route === 'crew-medical-officer') return `Tell the crew medical officer now. The ground psychologist gets a report next (signal delay ${delay}).`;
  if (route === 'private-conference') return `Raise it at the next private conference with the ground psychologist (signal delay ${delay}).`;
  return 'Keep the routine. Nothing to raise today.';
}
