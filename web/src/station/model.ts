// Everything the station screens show, derived from the data files (data/) with the
// contract scoring rule (core/scoring) plus what the crew entered this session (state).
import { useMemo } from 'react';
import { contextFor, dayIndex, scoreDay, regionStatus, type MetricScore } from '../core/scoring';
import { doseSummary, sortedEvents } from '../core/radiation';
import { alarmClass, type AlarmPhase } from '../core/alarm';
import { useMissionData, useMissionStore } from '../data/store';
import type { CrewData, CrewMember, EnvironmentId, FlareEvent, MetricKey, RegionStatus, Status, StormForecast } from '../data/types';
import { useStation, type SystemId } from './state';

export const BRAND = 'e^x';
export const TAGLINE = 'Crew health & radiation early warning';

/** Plain status words on every screen (Emile, 15 Nov): no class codes on the main path. */
export const WORD: Record<Status, string> = { green: 'OK', amber: 'Act today', red: 'Act now' };

/* Caution & warning classes, after NASA-STD-3001 Vol 2 (Table 10.3-1): the class says who acts.
   Advisory is our own early band (1.5σ drift) so a trend shows before it becomes a caution. */
export type CW = 'nominal' | 'advisory' | 'caution' | 'warning' | 'emergency';
export const CW_RANK: Record<CW, number> = { nominal: 0, advisory: 1, caution: 2, warning: 3, emergency: 4 };
/** Plain words for the caution & warning classes (docs/ARCHITECTURE.md section 3 keeps the NASA names). */
export const CW_LABEL: Record<CW, string> = { nominal: 'OK', advisory: 'Watch', caution: 'Act today', warning: 'Act now', emergency: 'Shelter now' };
export const CW_OWNER: Record<CW, string> = {
  nominal: 'No action',
  advisory: 'Crew · self-care, keep logging',
  caution: 'Crew re-checks · in daily surgeon report',
  warning: 'Flight surgeon · review now',
  emergency: 'All crew · immediate action',
};
export const ADVISORY_Z = 1.5;
export const worstCW = (...c: CW[]): CW => c.reduce<CW>((a, b) => (CW_RANK[b] > CW_RANK[a] ? b : a), 'nominal');
export function cwOf(status: Status, score: number | null): CW {
  if (status === 'red') return 'warning';
  if (status === 'amber') return 'caution';
  return score != null && score >= ADVISORY_Z ? 'advisory' : 'nominal';
}

/* Fit for duty: the operational consequence of the health state (team working rule, not a NASA rule). */
export type Duty = 'cleared' | 'restricted' | 'hold' | 'shelter';
export const DUTY_LABEL: Record<Duty, string> = { cleared: 'Cleared for EVA', restricted: 'Re-check before EVA', hold: 'Hold: no EVA or safety-critical tasks', shelter: 'In storm shelter' };
export const dutyOf = (cw: CW, alarm: boolean): Duty => (alarm ? 'shelter' : cw === 'warning' || cw === 'emergency' ? 'hold' : cw === 'caution' ? 'restricted' : 'cleared');
export const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };
export const worstOf = (...s: Status[]): Status => s.reduce<Status>((a, b) => (RANK[b] > RANK[a] ? b : a), 'green');

export type Hazard = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'environment';
export const HAZARD_LABEL: Record<Hazard, string> = {
  radiation: 'Space radiation',
  isolation: 'Isolation & confinement',
  distance: 'Distance from Earth',
  gravity: 'Altered gravity',
  environment: 'Hostile closed environment',
};

export interface SystemDef {
  id: SystemId;
  name: string;
  short: string;
  sub: string;
  metrics: MetricKey[];
  hazards: Hazard[];
  /** what this system means for the mission, one line */
  why: string;
}

// The five body systems are the spine of the app: every reading, cause and action hangs off one of them.
export const SYSTEMS: SystemDef[] = [
  { id: 'heart', name: 'Cardiovascular', short: 'Cardio', sub: 'Heart rate, blood pressure', metrics: ['bp_sys', 'bp_dia', 'hr'], hazards: ['gravity', 'environment'], why: 'Fluids shift headward in low gravity; the heart and vessels adapt and can struggle on return or during EVA.' },
  { id: 'brain', name: 'Neuro & sleep', short: 'Neuro', sub: 'Sleep, mood, alertness', metrics: ['sleep_h', 'mood'], hazards: ['isolation', 'distance', 'environment'], why: 'Short sleep and low mood erode attention and reaction time: the first line of mission safety.' },
  { id: 'bones', name: 'Musculoskeletal', short: 'Bone', sub: 'Exercise, bone loss', metrics: ['exercise_min', 'bone_loss_pct'], hazards: ['gravity'], why: 'Without load, weight-bearing bone loses about 1% a month; exercise is the only countermeasure.' },
  { id: 'blood', name: 'Blood & metabolic', short: 'Blood', sub: 'Blood sugar, immune markers', metrics: ['glucose'], hazards: ['environment', 'radiation'], why: 'Diet, stress hormones and radiation shift metabolism and immune cells; labs catch what vitals miss.' },
  { id: 'whole_body', name: 'Radiation & thermal', short: 'Exposure', sub: 'Dose, body temperature', metrics: ['dose_mSv_day', 'dose_mSv_cum', 'temp'], hazards: ['radiation', 'environment'], why: 'Dose adds up for a career; a fever in a closed habitat can spread to the crew.' },
];
export const SYSTEM_BY_ID = Object.fromEntries(SYSTEMS.map((s) => [s.id, s])) as Record<SystemId, SystemDef>;

export const SHORT: Record<MetricKey, string> = {
  hr: 'Heart rate',
  bp_sys: 'Systolic BP',
  bp_dia: 'Diastolic BP',
  glucose: 'Blood sugar',
  temp: 'Body temp',
  sleep_h: 'Sleep',
  mood: 'Mood',
  exercise_min: 'Exercise',
  bone_loss_pct: 'Est. bone loss',
  dose_mSv_day: 'Dose today',
  dose_mSv_cum: 'Mission dose',
};

export const digits = (k: MetricKey): number =>
  k === 'temp' || k === 'sleep_h' || k === 'bone_loss_pct' ? 1 : k === 'dose_mSv_day' ? 2 : k === 'dose_mSv_cum' ? 1 : 0;

// sleep reads as hours:minutes everywhere (5.4 h -> 5:24 h), never as a decimal
const hmm = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
export const fmtV = (k: MetricKey, v: number | null | undefined): string => (v == null ? '—' : k === 'sleep_h' ? hmm(v) : v.toFixed(digits(k)));

export const MOOD_WORD = ['', 'Very low', 'Low', 'Okay', 'Good', 'Great'];

/** Display name of the seat: the full role in sentence case (Emile: no CDR/FE/MS abbreviations). */
export const seatOf = (m: CrewMember) => m.role.charAt(0).toUpperCase() + m.role.slice(1).toLowerCase();
export const surname = (m: CrewMember) => m.name.split(' ').slice(-1)[0];
/** Display first names after famous astronauts (Emile, 16 Nov). crew_data.json is Tomas's export and
 *  stays unchanged; this only changes what the screens say. */
const FIRST: Record<string, string> = { c1: 'Sally', c2: 'Neil', c3: 'Yuri' };
export const firstName = (m: CrewMember) => FIRST[m.id] ?? m.name.replace(/^\S+\.\s/, '').split(' ')[0];
export const initials = (m: CrewMember) =>
  m.name
    .replace(/^\S+\.\s/, '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);

export interface MetricRow {
  k: MetricKey;
  label: string;
  unit: string;
  value: number | null;
  status: Status;
  cw: CW;
  z: number | null;
  /** directional score: -z for low-side-only metrics, |z| otherwise */
  score: number | null;
  mean: number | null;
  lo: number | null;
  hi: number | null;
  /** last 28 days, oldest first */
  history: { date: string; v: number | null; flag: Status | null }[];
  /** consecutive flagged days up to today */
  running: number;
  action: string | null;
  entered: boolean;
}

export interface CrewView {
  m: CrewMember;
  status: RegionStatus;
  overall: Status;
  scores: MetricScore[];
  rows: Record<MetricKey, MetricRow>;
  /** the single most important issue */
  issue: MetricRow | null;
  issues: MetricRow[];
  /** advisories: drifting but not yet a caution */
  drifts: MetricRow[];
  cw: CW;
  sys: Record<SystemId, CW>;
  checkedIn: boolean;
}

/** Values typed in today replace the series value, so they are scored like any reading. */
export function withEntries(cd: CrewData, m: CrewMember, day: Partial<Record<MetricKey, number>> | undefined): CrewMember {
  if (!day || !Object.keys(day).length) return m;
  return { ...m, series: m.series.map((r) => (r.date === cd.mission.today ? { ...r, ...day } : r)) };
}

export function buildView(cd: CrewData, raw: CrewMember, entries: Partial<Record<MetricKey, number>> | undefined, env: EnvironmentId, checkedIn: boolean): CrewView {
  const m = withEntries(cd, raw, entries);
  const i = dayIndex(m, cd.mission.today);
  const scores = i < 0 ? [] : scoreDay(m, cd.metrics, i, contextFor(cd, env));
  const status = regionStatus(scores, cd.metrics);
  const rows = {} as Record<MetricKey, MetricRow>;
  for (const k of Object.keys(cd.metrics) as MetricKey[]) {
    const meta = cd.metrics[k];
    const s = scores.find((x) => x.metric === k);
    const b = m.baseline[k];
    const st: Status = s?.status ?? 'green';
    const flagBy = new Map(m.flags.filter((f) => f.metric === k).map((f) => [f.date, f.severity as Status]));
    // a check-in today overrides the file's flag for today
    if (entries && k in entries) flagBy.set(cd.mission.today, st === 'green' ? (null as unknown as Status) : st);
    let running = 0;
    for (let j = i; j >= 0 && flagBy.get(m.series[j].date); j--) running++;
    const hist = i >= 0 ? m.series.slice(Math.max(0, i - 27), i + 1) : [];
    rows[k] = {
      k,
      label: SHORT[k],
      unit: meta.unit,
      value: i >= 0 ? m.series[i][k] : null,
      status: st,
      cw: cwOf(st, s?.score ?? null),
      z: s?.z ?? null,
      score: s?.score ?? null,
      mean: b?.mean ?? null,
      lo: b ? b.mean - 2 * b.sd : null,
      hi: b ? b.mean + 2 * b.sd : null,
      history: hist.map((r) => ({ date: r.date, v: r[k], flag: flagBy.get(r.date) ?? null })),
      running,
      action: st === 'green' ? null : meta.actions[st],
      entered: !!entries && k in entries,
    };
  }
  const issues = Object.values(rows)
    .filter((r) => r.status !== 'green')
    .sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  // the paired BP reading counts once
  const dedup = issues.filter((r, idx) => !(r.k === 'bp_dia' && issues.slice(0, idx).some((x) => x.k === 'bp_sys')));
  const sys = {} as Record<SystemId, CW>;
  for (const d of SYSTEMS) sys[d.id] = worstCW(...d.metrics.map((k) => rows[k].cw));
  const drifts = Object.values(rows).filter((r) => r.cw === 'advisory');
  const cw = worstCW(...Object.values(sys));
  return { m, status, overall: status.overall, scores, rows, issue: dedup[0] ?? null, issues: dedup, drifts, cw, sys, checkedIn };
}

/** One sentence for a row in trouble: "Sleep 5.4 h, below your usual for 4 days". No sigma on screen. */
export function issueLine(r: MetricRow): string {
  const val = `${r.label} ${fmtV(r.k, r.value)}${r.unit === '1-5' ? '/5' : ` ${r.unit}`}`;
  if (r.z == null) return `${val}, outside the safe range`;
  const dir = r.z >= 0 ? 'above' : 'below';
  return `${val}, ${dir} your usual${r.running > 1 ? ` for ${r.running} days` : ' today'}`;
}

export function systemStatus(v: CrewView, s: SystemId): Status {
  return v.status[s];
}

/* ------------------------------------------------------------------ space weather */

export interface SpaceWeather {
  latest: FlareEvent | null;
  /** highest alert among flares in the last horizon hours before the newest flare */
  level: 'none' | 'watch' | 'warning';
  p: number;
  recent: FlareEvent[];
}

export function spaceWeather(storm: StormForecast): SpaceWeather {
  const ev = sortedEvents(storm);
  const latest = ev[ev.length - 1] ?? null;
  if (!latest) return { latest: null, level: 'none', p: 0, recent: [] };
  const cutoff = Date.parse(latest.peak_time) - storm.meta.horizon_hours * 3600e3;
  const win = ev.filter((e) => Date.parse(e.peak_time) >= cutoff);
  const top = win.reduce((a, b) => (b.p_storm > a.p_storm ? b : a), latest);
  return { latest, level: top.alert_level, p: top.p_storm, recent: ev.slice(-12).reverse() };
}

export const LEVEL_WORD = { none: 'Quiet', watch: 'Watch', warning: 'Warning' } as const;
export const LEVEL_STATUS: Record<'none' | 'watch' | 'warning', Status> = { none: 'green', watch: 'amber', warning: 'red' };

/* ------------------------------------------------------------------ action queue */

export interface QueueItem {
  id: string;
  cw?: CW;
  tone: Status | 'info';
  who: string;
  title: string;
  detail: string;
  cta: string;
  to: string;
}

export function actionQueue(views: CrewView[], sw: SpaceWeather | null, phase: AlarmPhase): QueueItem[] {
  const out: QueueItem[] = [];
  // Safety rule (docs/ARCHITECTURE.md): the forecast raises Warning; only the measured arrival raises Emergency.
  const cls = alarmClass(phase);
  if (cls === 'warning') out.push({ id: 'alarm', cw: cls, tone: 'red', who: 'All crew', title: 'Storm forecast', detail: 'Suspend EVA. Move to the storm shelter as a precaution.', cta: 'Open radiation', to: '/radiation' });
  if (cls === 'emergency') out.push({ id: 'alarm', cw: cls, tone: 'red', who: 'All crew', title: 'Storm in progress', detail: 'Particles have arrived. All crew stay in the shelter.', cta: 'Open radiation', to: '/radiation' });
  for (const v of views) {
    for (const r of v.issues) {
      out.push({
        id: `${v.m.id}-${r.k}`,
        cw: r.cw,
        tone: r.status,
        who: `${seatOf(v.m)} · ${firstName(v.m)}`,
        title: issueLine(r),
        detail: r.action ?? '',
        cta: r.status === 'red' ? 'Open and contact surgeon' : 'Open countermeasure',
        to: `/body/${v.m.id}?s=${metricSystem(r.k)}`,
      });
    }
  }
  for (const v of views)
    for (const r of v.drifts)
      out.push({ id: `${v.m.id}-${r.k}-adv`, cw: 'advisory', tone: 'info', who: `${seatOf(v.m)} · ${firstName(v.m)}`, title: `${r.label} drifting ${r.z! >= 0 ? 'up' : 'down'}`, detail: 'Not a caution yet. Keep logging; the trend is being watched.', cta: 'Open trend', to: `/body/${v.m.id}?s=${metricSystem(r.k)}` });
  for (const v of views) {
    if (!v.checkedIn) out.push({ id: `${v.m.id}-checkin`, tone: 'info', who: `${seatOf(v.m)} · ${firstName(v.m)}`, title: 'Daily check-in due', detail: 'Sleep, mood and vitals: about a minute.', cta: 'Start check-in', to: `/check/${v.m.id}` });
  }
  if (sw && sw.level !== 'none' && !cls)
    out.push({ id: 'sw', tone: LEVEL_STATUS[sw.level], who: 'Space weather', title: `${LEVEL_WORD[sw.level]}: storm chance ${Math.round(sw.p * 100)}%`, detail: 'Keep EVA plans flexible and check the forecast again.', cta: 'Open radiation', to: '/radiation' });
  const order = { red: 0, amber: 1, info: 2, green: 3 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export const METRIC_SYSTEM: Record<MetricKey, SystemId> = {
  hr: 'heart',
  bp_sys: 'heart',
  bp_dia: 'heart',
  glucose: 'blood',
  temp: 'whole_body',
  sleep_h: 'brain',
  mood: 'brain',
  exercise_min: 'bones',
  bone_loss_pct: 'bones',
  dose_mSv_day: 'whole_body',
  dose_mSv_cum: 'whole_body',
};
export const metricSystem = (k: MetricKey) => METRIC_SYSTEM[k];

/* ------------------------------------------------------------------ the hook */

export function useStationData() {
  const { data, loadState, error } = useMissionData();
  const env = useMissionStore((s) => s.environment) ?? data?.crew.mission.environment ?? 'iss';
  const setEnv = useMissionStore((s) => s.setEnvironment);
  const entries = useStation((s) => s.entries);
  const checkins = useStation((s) => s.checkins);
  const alarm = useStation((s) => s.alarm);
  const views = useMemo(
    () => (data ? data.crew.crew.map((m) => buildView(data.crew, m, entries[m.id], env, !!checkins[m.id])) : []),
    [data, entries, env, checkins],
  );
  const sw = useMemo(() => (data ? spaceWeather(data.storm) : null), [data]);
  const day = data ? Math.round((Date.parse(data.crew.mission.today) - Date.parse(data.crew.mission.start_date)) / 864e5) + 1 : 0;
  const doses = useMemo(() => (data ? views.map((v) => ({ v, d: doseSummary(v.m, data.crew, env) })) : []), [data, views, env]);
  const queue = useMemo(() => actionQueue(views, sw, alarm.phase), [views, sw, alarm.phase]);
  return { data, loadState, error, env, setEnv, views, sw, day, doses, queue };
}

export const fmtDay = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const PLACE: Record<EnvironmentId, string> = { iss: 'Low Earth orbit', moon: 'Lunar surface', transit: 'Deep space', mars: 'Mars surface' };
export const LINK_DELAY: Record<EnvironmentId, string> = { iss: '< 1 s', moon: '1.3 s', transit: '3–20 min', mars: '4–24 min' };
