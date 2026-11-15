// The guided demo as data: six beats, each one sentence built from the mission files (crew_data
// and storm_forecast), plus where the app should be while it is on screen. Pure: no React, no
// store. The player (Demo.tsx) applies a beat with the router and the existing store setters.
import { doseSummary, replayEvents } from '../../core/radiation';
import type { CrewData, CrewMember, EnvironmentId, MetricKey, StormForecast } from '../../data/types';
import { crewView, fmt, LINK_DELAY, METRIC_TARGET, rowOf, type CrewView, type Row } from '../model';

export interface Trend {
  label: string;
  unit: string;
  values: (number | null)[];
  /** Personal usual (baseline mean), when the metric has one. */
  usual: number | null;
  digits: number;
  status: 'green' | 'amber' | 'red';
}

export interface Beat {
  id: 'today' | 'link' | 'action' | 'setting' | 'storm' | 'dose';
  /** 1-3 words, shown small. */
  title: string;
  /** The one sentence on screen. */
  caption: string;
  /** Router address while this beat shows (path + search). */
  to: string;
  /** Crew member to select; null leaves the selection. */
  crew: string | null;
  /** Mission setting for this beat. */
  env: EnvironmentId;
  /** Two trend lines for the correlation beat. */
  trends?: [Trend, Trend];
  seconds: number;
}

/** Plain names for the sentence (the vitals list keeps its own short labels). */
const PLAIN: Partial<Record<MetricKey, string>> = {
  hr: 'heart rate',
  bp_sys: 'blood pressure',
  bp_dia: 'blood pressure',
  glucose: 'blood sugar',
  temp: 'body temperature',
  sleep_h: 'sleep',
  mood: 'mood',
  exercise_min: 'exercise',
  bone_loss_pct: 'bone loss',
  dose_mSv_day: 'radiation',
};
const SETTING: Record<EnvironmentId, string> = { iss: 'on the ISS', moon: 'on the Moon', transit: 'on the way to Mars', mars: 'on Mars' };
const name = (k: MetricKey) => PLAIN[k] ?? k;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const val = (r: Row) => `${fmt(r.value, r.digits)}${r.unit === '/5' ? ' of 5' : r.unit ? ` ${r.unit}` : ''}`;

function pearson(a: (number | null)[], b: (number | null)[]): number {
  const p = a.map((x, i) => [x, b[i]] as const).filter((q): q is readonly [number, number] => q[0] != null && q[1] != null);
  if (p.length < 4) return 0;
  const ma = p.reduce((s, q) => s + q[0], 0) / p.length;
  const mb = p.reduce((s, q) => s + q[1], 0) / p.length;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (const [x, y] of p) {
    sab += (x - ma) * (y - mb);
    saa += (x - ma) ** 2;
    sbb += (y - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

const WINDOW = 14;
const LINKABLE: MetricKey[] = ['mood', 'sleep_h', 'hr', 'bp_sys', 'exercise_min', 'glucose', 'temp'];

/** The metric that moved most with `k` over the last 14 days for this crew member. */
export function strongestLink(m: CrewMember, today: string, k: MetricKey): { k: MetricKey; r: number } | null {
  const end = m.series.findIndex((r) => r.date === today);
  if (end < 0) return null;
  const rows = m.series.slice(Math.max(0, end - WINDOW + 1), end + 1);
  const a = rows.map((r) => r[k] ?? null);
  let best: { k: MetricKey; r: number } | null = null;
  for (const o of LINKABLE) {
    if (o === k || (k.startsWith('bp') && o.startsWith('bp'))) continue;
    const r = pearson(a, rows.map((x) => x[o] ?? null));
    if (!best || Math.abs(r) > Math.abs(best.r)) best = { k: o, r };
  }
  return best && Math.abs(best.r) >= 0.3 ? best : null;
}

function trendOf(cd: CrewData, v: CrewView, k: MetricKey): Trend {
  const r = rowOf(cd, v.m, v.scores, k);
  const end = v.m.series.findIndex((x) => x.date === cd.mission.today);
  const rows = v.m.series.slice(Math.max(0, end - WINDOW + 1), end + 1);
  return { label: cap(name(k)), unit: r.unit, values: rows.map((x) => x[k] ?? null), usual: r.mean, digits: r.digits, status: r.status };
}

const firstLast = (t: Trend, days: number) => {
  const v = t.values.slice(-days).filter((x): x is number => x != null);
  return v.length >= 2 ? { from: v[0], to: v[v.length - 1] } : null;
};

/** Builds the six beats. `seat` maps crew id to its designation (CDR, FE, MS1). */
export function buildBeats(cd0: CrewData, storm: StormForecast, seat: Record<string, string>): Beat[] {
  const home = cd0.mission.environment;
  const cd = cd0;
  const views = cd.crew.map((m) => crewView(cd, m));
  const red = views.find((v) => v.overall === 'red') ?? null;
  const amber = views.find((v) => v.overall === 'amber') ?? null;
  const lead = red ?? amber ?? views[0];
  const s = (v: CrewView) => seat[v.m.id] ?? v.m.role;
  const issueRow = (v: CrewView) => (v.issue ? rowOf(cd, v.m, v.scores, v.issue.metric) : null);

  // 1. today
  const say = (v: CrewView, word: string) => {
    const r = issueRow(v);
    return r ? `${s(v)} ${word}: ${name(r.k)} ${val(r)}${r.mean != null ? `, usual ${fmt(r.mean, r.digits)}` : ''}` : `${s(v)} ${word}`;
  };
  const parts = [red && say(red, 'needs action'), amber && say(amber, 'is on watch')].filter(Boolean) as string[];
  const today: Beat = {
    id: 'today',
    title: 'Crew today',
    caption: parts.length ? `${parts.join('. ')}. Each reading is compared with that person's own usual.` : 'Every crew reading is inside that person’s own usual range today.',
    to: '/',
    crew: lead.m.id,
    env: home,
    seconds: 12,
  };

  // 2. what moved together
  const k = lead.issue?.metric ?? 'sleep_h';
  const link = strongestLink(lead.m, cd.mission.today, k);
  const ta = trendOf(cd, lead, k);
  const tb = trendOf(cd, lead, link?.k ?? 'mood');
  const da = firstLast(ta, 6);
  const db = firstLast(tb, 6);
  const moved = (t: Trend, d: { from: number; to: number } | null) =>
    d ? `${t.label.toLowerCase()} went from ${fmt(d.from, t.digits)} to ${fmt(d.to, t.digits)}${t.unit === '/5' ? ' of 5' : t.unit ? ` ${t.unit}` : ''}` : `${t.label.toLowerCase()} changed`;
  const linkBeat: Beat = {
    id: 'link',
    title: 'What moved together',
    caption: `In six days ${s(lead)}'s ${moved(ta, da)}, and ${moved(tb, db)} with it. Seeing both together is the early sign.`,
    to: METRIC_TARGET[k] ? `/?t=${METRIC_TARGET[k]}&k=${k}` : '/',
    crew: lead.m.id,
    env: home,
    trends: [ta, tb],
    seconds: 14,
  };

  // 3. action and escalation
  const action: Beat = {
    id: 'action',
    title: 'What the crew does',
    caption: `The crew measures again. If it is still out of range, a summary goes to the flight surgeon and arrives in about ${LINK_DELAY[home]}.`,
    to: '/?p=handoff',
    crew: lead.m.id,
    env: home,
    seconds: 11,
  };

  // 4. the mission setting changes the numbers
  const far: EnvironmentId = home === 'transit' ? 'mars' : 'transit';
  const setting: Beat = {
    id: 'setting',
    title: 'Further from Earth',
    caption: `Same crew ${SETTING[far]}: daily radiation goes from ${cd.environments[home].dose_mSv_day} to ${cd.environments[far].dose_mSv_day} mSv, and a message to Earth takes ${LINK_DELAY[far]} instead of ${LINK_DELAY[home]}.`,
    to: '/',
    crew: lead.m.id,
    env: far,
    seconds: 12,
  };

  // 5. a real space-weather event: the first verified warning of the May 2024 storm
  const hit = replayEvents(storm).find((e) => e.alert_level === 'warning' && e.actual_storm && e.lead_time_h != null);
  const day = hit?.storm_onset_time ? new Date(hit.storm_onset_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'May 2024';
  const at = hit ? new Date(Date.parse(hit.peak_time) - 40 * 60000).toISOString().replace('.000Z', 'Z') : null;
  const stormBeat: Beat = {
    id: 'storm',
    title: 'A solar storm',
    caption: hit
      ? `A real storm, ${day}: the e^x model warned ${Math.round(hit.lead_time_h!)} hours before its radiation arrived. The crew gets one instruction: go to the shelter.`
      : 'The forecast watches every solar flare and warns before a radiation storm arrives.',
    to: `/environment?mode=replay${at ? `&at=${at}&play=1` : ''}`,
    crew: lead.m.id,
    env: home,
    seconds: 14,
  };

  // 6. what it adds up to in the body
  const d = doseSummary(lead.m, cd, home);
  const dose: Beat = {
    id: 'dose',
    title: 'The running total',
    caption:
      d.cumulative_mSv != null && d.fraction != null
        ? `Radiation adds up: in this simulated mission ${s(lead)} has used ${(d.fraction * 100).toFixed(1)} % of NASA's ${d.careerLimit_mSv} mSv career limit. Bone marrow, eyes, brain and skin are watched first.`
        : 'Radiation adds up over the mission and is tracked against the career limit.',
    to: '/environment',
    crew: lead.m.id,
    env: home,
    seconds: 12,
  };

  return [today, linkBeat, action, setting, stormBeat, dose];
}
