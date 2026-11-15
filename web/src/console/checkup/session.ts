// Today's daily-check session, shared with the rest of the app: the Crew page reads it to show what was
// just measured (heart from the camera, breathing, reaction time) until the next data refresh.
import { create } from 'zustand';

export interface CheckSession {
  subject: string | null;
  date: string | null;
  scan: { bpm: number | null; breathing: number | null; confidence: number } | null;
  band: { hr: number } | null;
  pvt: { meanMs: number; lapses: number; status: 'green' | 'amber' | 'red'; usual: number | null } | null;
  savedAt: string | null;
  sentAt: string | null;
}

interface Store extends CheckSession {
  begin: (subject: string, date: string) => void;
  set: (patch: Partial<CheckSession>) => void;
}

const empty: CheckSession = { subject: null, date: null, scan: null, band: null, pvt: null, savedAt: null, sentAt: null };

export const useCheckSession = create<Store>((set, get) => ({
  ...empty,
  begin: (subject, date) => {
    if (get().subject === subject && get().date === date) return;
    set({ ...empty, subject, date });
  },
  set: (patch) => set(patch),
}));
