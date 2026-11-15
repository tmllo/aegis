// Station state: what the crew did in this session (check-ins, XP, acknowledged alerts),
// the radiation alarm, and the guided demo. Data files stay read-only in data/store.
import { create } from 'zustand';
import type { MetricKey } from '../data/types';

export type SystemId = 'brain' | 'heart' | 'blood' | 'bones' | 'whole_body';

export interface CheckinRecord {
  at: number;
  values: Partial<Record<MetricKey, number>>;
  /** status before -> after, for the summary and the toast */
  before: 'green' | 'amber' | 'red';
  after: 'green' | 'amber' | 'red';
  xp: number;
}

/** Countermeasure loop for one flagged reading: detected -> countermeasure -> re-measure -> outcome. */
export interface Plan {
  startedAt: number;
  stage: 'started' | 'resolved' | 'escalated';
  /** status when the countermeasure started */
  from: 'green' | 'amber' | 'red';
}

/** Extra readings the health check captures that are not in crew_data.json (session only). */
export interface Extras {
  stress?: number;
  energy?: number;
  pvtMs?: number;
  pvtLapses?: number;
  pvtStatus?: 'green' | 'amber' | 'red';
  pvtUsual?: number | null;
  scanBpm?: number;
  scanBreathing?: number | null;
  scanConf?: number;
}

export type AlarmPhase = 'off' | 'warning' | 'sheltered' | 'arrived';

export interface Alarm {
  phase: AlarmPhase;
  /** flare that raised the warning, for the banner */
  flare?: string;
  p?: number;
  /** hours of warning before the particles arrived (set at 'arrived') */
  leadH?: number;
  /** replay clock time the warning fired (ms) */
  firedAt?: number;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'green' | 'amber' | 'red' | 'info';
}

interface StationState {
  /** crew id -> today's entries typed in by the crew */
  entries: Record<string, Partial<Record<MetricKey, number>>>;
  checkins: Record<string, CheckinRecord | undefined>;
  /** crew id -> XP and streak (seeded from the series so the numbers look lived-in) */
  xp: Record<string, number>;
  streak: Record<string, number>;
  /** surgeon calls sent this session, by crew id */
  surgeon: Record<string, number>;
  /** key `${crewId}:${metric}` */
  plans: Record<string, Plan>;
  extras: Record<string, Extras>;
  alarm: Alarm;
  toasts: Toast[];
  sound: boolean;
  demoStep: number | null;

  saveCheckin: (crewId: string, rec: CheckinRecord, extras?: Extras) => void;
  startPlan: (crewId: string, metric: string, from: Plan['from']) => void;
  settlePlan: (crewId: string, metric: string, stage: Plan['stage']) => void;
  seed: (xp: Record<string, number>, streak: Record<string, number>) => void;
  callSurgeon: (crewId: string) => void;
  setAlarm: (a: Alarm) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dropToast: (id: number) => void;
  setSound: (on: boolean) => void;
  setDemoStep: (n: number | null) => void;
}

let tid = 1;

export const useStation = create<StationState>((set) => ({
  entries: {},
  checkins: {},
  xp: {},
  streak: {},
  surgeon: {},
  plans: {},
  extras: {},
  alarm: { phase: 'off' },
  toasts: [],
  sound: true,
  demoStep: null,

  startPlan: (crewId, metric, from) => set((s) => ({ plans: { ...s.plans, [`${crewId}:${metric}`]: { startedAt: Date.now(), stage: 'started', from } } })),
  settlePlan: (crewId, metric, stage) =>
    set((s) => {
      const k = `${crewId}:${metric}`;
      return s.plans[k] ? { plans: { ...s.plans, [k]: { ...s.plans[k], stage } } } : s;
    }),
  saveCheckin: (crewId, rec, extras) =>
    set((s) => ({
      extras: extras ? { ...s.extras, [crewId]: { ...s.extras[crewId], ...extras } } : s.extras,
      entries: { ...s.entries, [crewId]: { ...s.entries[crewId], ...rec.values } },
      checkins: { ...s.checkins, [crewId]: rec },
      xp: { ...s.xp, [crewId]: (s.xp[crewId] ?? 0) + rec.xp },
      streak: { ...s.streak, [crewId]: s.checkins[crewId] ? s.streak[crewId] ?? 1 : (s.streak[crewId] ?? 0) + 1 },
    })),
  seed: (xp, streak) => set((s) => (Object.keys(s.xp).length ? s : { xp, streak })),
  callSurgeon: (crewId) => set((s) => ({ surgeon: { ...s.surgeon, [crewId]: Date.now() } })),
  setAlarm: (alarm) => set({ alarm }),
  toast: (t) => {
    const id = tid++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 5200);
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setSound: (sound) => set({ sound }),
  setDemoStep: (demoStep) => set({ demoStep }),
}));
