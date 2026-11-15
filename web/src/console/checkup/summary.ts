// Summary of a daily check against the astronaut's own baseline (crew_data.json baselines, personal
// history on this device for the reaction test). Pure; tested in summary.test.ts.
import type { CrewMember, Status } from '../../data/types';
import type { SelfReport } from '../../data/mind';
import type { CheckSession } from './session';

export interface SummaryRow {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  /** "usual 52-64" or a plain note */
  usual: string;
  status: Status | null;
  source: string;
  /** last 14 days from the crew file, oldest first, for a sparkline (empty when there is no history) */
  trend: number[];
  /** metric key to store on the server, or null when it must not be stored (demo values, no reading) */
  store: string | null;
}

const zStatus = (v: number, mean: number, sd: number, lowOnly = false): Status => {
  const z = (v - mean) / sd;
  const off = lowOnly ? -z : Math.abs(z);
  return off >= 3 ? 'red' : off >= 2 ? 'amber' : 'green';
};

export function buildSummary(m: CrewMember, today: string, s: CheckSession, report: SelfReport): SummaryRow[] {
  const series = m.series.filter((r) => r.date <= today).slice(-14);
  const hist = (k: 'hr' | 'mood' | 'sleep_h') => series.map((r) => r[k]).filter((x): x is number => x != null);
  const rows: SummaryRow[] = [];

  const hrB = m.baseline.hr;
  const camOk = s.scan?.bpm != null && s.scan.confidence >= 0.35;
  const hr = camOk ? s.scan!.bpm! : s.band?.hr ?? null;
  rows.push({
    key: 'hr',
    label: 'Heart rate',
    value: hr,
    unit: 'bpm',
    usual: hrB ? `usual ${Math.round(hrB.mean - 2 * hrB.sd)}-${Math.round(hrB.mean + 2 * hrB.sd)}` : 'no baseline yet',
    status: hr != null && hrB ? zStatus(hr, hrB.mean, hrB.sd) : null,
    source: camOk ? 'camera estimate' : s.band ? 'wrist band (simulated)' : 'not measured',
    trend: hist('hr'),
    store: hr != null ? 'vital.hr' : null,
  });
  rows.push({
    key: 'breathing',
    label: 'Breathing',
    value: s.scan?.breathing ?? null,
    unit: '/min',
    usual: 'usual 12-20 at rest',
    status: s.scan?.breathing != null ? (s.scan.breathing < 8 || s.scan.breathing > 25 ? 'amber' : 'green') : null,
    source: s.scan?.breathing != null ? 'camera estimate' : 'not measured',
    trend: [],
    store: s.scan?.breathing != null ? 'vital.resp_rate' : null,
  });
  rows.push({
    key: 'pvt',
    label: 'Reaction time',
    value: s.pvt?.meanMs ?? null,
    unit: 'ms',
    usual: s.pvt?.usual != null ? `usual ${s.pvt.usual}` : 'first tests set her usual',
    status: s.pvt?.status ?? null,
    source: s.pvt ? `reaction test · ${s.pvt.lapses} ${s.pvt.lapses === 1 ? 'lapse' : 'lapses'}` : 'not measured',
    trend: [],
    store: s.pvt ? 'cog.pvt_rt' : null,
  });
  const moodB = m.baseline.mood;
  const mood = report.mood ?? null;
  rows.push({
    key: 'mood',
    label: 'Mood',
    value: mood,
    unit: '/5',
    usual: moodB ? `usual ${moodB.mean.toFixed(1)}` : '',
    status: mood != null && moodB ? zStatus(mood, moodB.mean, moodB.sd, true) : null,
    source: mood != null ? 'check-in' : 'not answered',
    trend: hist('mood'),
    store: null, // already saved by the check-in itself
  });
  const sleepB = m.baseline.sleep_h;
  const lastSleep = series.at(-1)?.sleep_h ?? null;
  rows.push({
    key: 'sleep',
    label: 'Sleep last night',
    value: lastSleep,
    unit: 'h',
    usual: sleepB ? `usual ${sleepB.mean.toFixed(1)}` : '',
    status: lastSleep != null && sleepB ? zStatus(lastSleep, sleepB.mean, sleepB.sd, true) : null,
    source: 'wrist actigraphy (simulated)',
    trend: hist('sleep_h'),
    store: null,
  });
  return rows;
}

export function overall(rows: SummaryRow[]): Status {
  if (rows.some((r) => r.status === 'red')) return 'red';
  if (rows.some((r) => r.status === 'amber')) return 'amber';
  return 'green';
}
