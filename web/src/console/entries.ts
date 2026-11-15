// Values a crew member typed in (tap a number on Crew or in an organ panel). Kept in memory and
// sent to the data core when it is up; useConsole merges them into the series so the contract rule
// in core/scoring re-scores the day at once (row, organ tint, status word, alert).
import { create } from 'zustand';
import { postMeasure } from '../data/live';
import type { MetricKey } from '../data/types';

type Day = Partial<Record<MetricKey, number>>;

interface Entries {
  /** member id -> date -> metric -> value */
  byMember: Record<string, Record<string, Day>>;
  put: (id: string, date: string, k: MetricKey, v: number) => void;
}

export const useEntries = create<Entries>((set) => ({
  byMember: {},
  put: (id, date, k, v) =>
    set((s) => ({ byMember: { ...s.byMember, [id]: { ...s.byMember[id], [date]: { ...s.byMember[id]?.[date], [k]: v } } } })),
}));

/** Data-core metric names for the readings the server measures. */
export const VITAL: Partial<Record<MetricKey, string>> = { bp_sys: 'vital.bp_sys', bp_dia: 'vital.bp_dia', hr: 'vital.hr', temp: 'vital.temp', glucose: 'vital.glucose' };

/** Store a typed value (re-scores at once) and post it to the data core when it is up. */
export function saveEntry(id: string, date: string, k: MetricKey, v: number) {
  useEntries.getState().put(id, date, k, v);
  const metric = VITAL[k];
  if (metric) void postMeasure(id, metric, `${date}T${new Date().toISOString().slice(11, 19)}Z`, v);
}
