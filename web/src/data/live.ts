// Small reads and writes against the e^x server (proxied at /api). Each returns null when the
// server does not answer, so every screen falls back to the static files.
import { getJson, hasServer, postJson } from './http';

export interface SourceState {
  quality: string;
  rows: number;
  at: string;
}

export async function getSources(): Promise<Record<string, SourceState> | null> {
  if (!(await hasServer())) return null;
  return getJson<{ sources?: Record<string, SourceState> }>('api/health', 3000).then((h) => h.sources ?? null, () => null);
}

export async function refreshSources(): Promise<boolean> {
  if (!(await hasServer())) return false;
  return postJson('api/refresh', {}).then(() => true, () => false);
}

export interface Assessment {
  severity: 'amber' | 'red';
  message: string;
  action: string;
}

export interface MeasureReply {
  assessment: Assessment | null;
  opened_tasks: string[];
  closed_tasks: string[];
}

/** One reading from the (simulated) Bio-Monitor. */
export async function postMeasure(subject: string, metric: string, t: string, value: number): Promise<MeasureReply | null> {
  if (!(await hasServer())) return null;
  return postJson<MeasureReply>('api/observations', { subject, metric, t, value }).catch(() => null);
}

/** Weekly means of the five self-report scores (private conference summary). */
export async function getWeek(subject: string): Promise<Record<string, number> | null> {
  if (!(await hasServer())) return null;
  return getJson<{ weeks?: { scores: Record<string, { mean: number | null }> }[] }>(`api/wellbeing?subject=${encodeURIComponent(subject)}&days=7`).then(
    (w) => {
      const last = w.weeks?.at(-1)?.scores ?? {};
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(last)) if (v.mean != null) out[k.replace('self.', '')] = v.mean;
      return out;
    },
    () => null,
  );
}

export interface Activity {
  id: string;
  label: string;
  minutes?: number;
}

/** The server's first suggested self-help activity (the ones that help an open alert come first). */
export async function getActivity(subject: string, date: string): Promise<Activity | null> {
  if (!(await hasServer())) return null;
  return getJson<{ activities?: Activity[] }>(`api/activities?subject=${encodeURIComponent(subject)}&date=${date}`).then((a) => a.activities?.[0] ?? null, () => null);
}

export async function logActivity(id: string, subject: string): Promise<boolean> {
  if (!(await hasServer())) return false;
  return postJson(`api/activities/${encodeURIComponent(id)}/events`, { subject }).then(() => true, () => false);
}
