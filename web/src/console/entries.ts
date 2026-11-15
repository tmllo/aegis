// Values a crew member typed in on the Crew page (tap a value to edit). Kept in memory and sent to
// the data core when it is up; useConsole merges them into the series so the contract rule in
// core/scoring re-scores the day at once (row, organ tint, status word, alert).
import { create } from 'zustand';
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
