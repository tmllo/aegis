// Mind data access. Server first (Tomas's Mind API, docs/backend/MIND-API.md), local fallback for every
// call so the page works offline. Journal calls carry X-Crew-Member: the journal is private to its owner.
import { useCallback, useEffect, useState } from 'react';
import type { CrewMember } from '../../data/types';
import { getJson, hasServer, postJson } from '../../data/http';
import type { Wellbeing } from './rules';

export interface Activity {
  id: string;
  label: string;
  minutes: number;
  steps: string[];
  source?: string;
  suggested?: boolean;
  because?: string[];
  done_today?: boolean;
}

export interface JournalNote {
  id: string;
  t: string;
  text: string;
}

const base = (): string => import.meta.env.BASE_URL ?? '/';

/** Offline weeks from the crew file (mood 1-5 and sleep hours are in the simulated series). */
export function localWellbeing(m: CrewMember, today: string): Wellbeing {
  const rows = m.series.filter((r) => r.date <= today).slice(-14);
  const half = (a: typeof rows) => {
    const mean = (k: 'mood' | 'sleep_h') => {
      const v = a.map((r) => r[k]).filter((x): x is number => x != null);
      return v.length ? { mean: v.reduce((s, x) => s + x, 0) / v.length, n: v.length } : undefined;
    };
    return { 'self.mood': mean('mood'), 'self.sleep_h': mean('sleep_h') };
  };
  const w1 = half(rows.slice(0, 7));
  const w2 = half(rows.slice(7));
  const change = (k: 'self.mood' | 'self.sleep_h') =>
    w1[k] && w2[k] ? { first: w1[k]!.mean, last: w2[k]!.mean, change: Math.round((w2[k]!.mean - w1[k]!.mean) * 100) / 100 } : undefined;
  return {
    weeks: [
      { from: rows[0]?.date ?? today, to: rows[6]?.date ?? today, scores: w1, checkin_days: Math.min(7, rows.length) },
      { from: rows[7]?.date ?? today, to: today, scores: w2, checkin_days: Math.max(0, rows.length - 7) },
    ],
    trend: { 'self.mood': change('self.mood'), 'self.sleep_h': change('self.sleep_h') },
  };
}

const OFFLINE_ACTIVITIES: Activity[] = [
  { id: 'paced_breathing', label: 'Paced breathing', minutes: 4, steps: ['Breathe in slowly through your nose for a count of four.', 'Breathe out gently for a count of six.', 'Repeat for about four minutes.'], source: 'VA National Center for PTSD, PTSD Coach' },
  { id: 'grounding', label: 'Grounding in the here and now', minutes: 3, steps: ['Press your feet or hands against something solid.', 'Name a few things you can see, hear and feel.', 'Slow your breathing a little.'], source: 'VA National Center for PTSD, PTSD Coach' },
  { id: 'private_call_home', label: 'Call home', minutes: 15, steps: ['Book a private family call for the next free slot.'], source: 'NASA OCHMO TB-016' },
];

export function useMindData(m: CrewMember | null | undefined, today: string | undefined) {
  const subject = m?.id;
  const [online, setOnline] = useState<boolean | null>(null);
  const [wellbeing, setWellbeing] = useState<Wellbeing | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<JournalNote[]>([]);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!subject || !today || !m) return;
    let live = true;
    void (async () => {
      const up = await hasServer();
      if (!live) return;
      setOnline(up);
      if (!up) {
        setWellbeing(localWellbeing(m, today));
        setActivities(OFFLINE_ACTIVITIES);
        return;
      }
      const [w, a, n] = await Promise.allSettled([
        getJson<Wellbeing>(`api/wellbeing?subject=${subject}&days=14`),
        getJson<{ activities: Activity[] }>(`api/activities?subject=${subject}`),
        fetch(`${base()}api/notes?subject=${subject}`, { headers: { 'X-Crew-Member': subject } }).then((r) => (r.ok ? r.json() : { notes: [] })),
      ]);
      if (!live) return;
      setWellbeing(w.status === 'fulfilled' ? w.value : localWellbeing(m, today));
      setActivities(a.status === 'fulfilled' ? a.value.activities : OFFLINE_ACTIVITIES);
      setNotes(n.status === 'fulfilled' ? ((n.value as { notes?: JournalNote[] }).notes ?? []) : []);
    })();
    return () => {
      live = false;
    };
  }, [subject, today, m, rev]);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  const logActivity = useCallback(
    async (id: string) => {
      setActivities((list) => list.map((a) => (a.id === id ? { ...a, done_today: true } : a)));
      if (!subject || !online) return;
      try {
        await postJson(`api/activities/${id}/events`, { subject, t: today });
      } catch {
        /* stays marked on this device */
      }
    },
    [subject, today, online],
  );

  const addNote = useCallback(
    async (text: string) => {
      const local: JournalNote = { id: `local-${Date.now()}`, t: today ?? '', text };
      setNotes((n) => [local, ...n]);
      if (!subject || !online) return;
      try {
        await fetch(`${base()}api/notes?subject=${subject}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Crew-Member': subject },
          body: JSON.stringify({ text, t: today }),
        });
      } catch {
        /* kept on this device */
      }
    },
    [subject, today, online],
  );

  return { online, wellbeing, activities, notes, logActivity, addNote, refresh };
}
