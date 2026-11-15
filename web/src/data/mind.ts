// Mind layer: self-report, private journal, habits and to-dos (docs/backend/NEXT.md section 2).
// Stored on this device (localStorage) so the demo works with no server. Writes that the ground
// server will take are also queued as API calls in the exact shapes of NEXT.md 2.4 and flushed
// when /api/health answers. Journal text is private: it is never queued for the server.
import { create } from 'zustand';
import { hasServer, postJson } from './http';

export type ScaleKey = 'mood' | 'stress' | 'energy' | 'sleep_quality' | 'social';

/** 1-5 scales, a word on every step (no emojis). stress is high-side, the others low-side. */
export const SCALES: { key: ScaleKey; label: string; words: [string, string, string, string, string] }[] = [
  { key: 'mood', label: 'Mood', words: ['Very low', 'Low', 'Okay', 'Good', 'Great'] },
  { key: 'stress', label: 'Stress', words: ['None', 'Low', 'Some', 'High', 'Very high'] },
  { key: 'energy', label: 'Energy', words: ['Drained', 'Low', 'Okay', 'Good', 'High'] },
  { key: 'sleep_quality', label: 'Sleep', words: ['Very poor', 'Poor', 'Fair', 'Good', 'Great'] },
  { key: 'social', label: 'Social', words: ['Isolated', 'Distant', 'Okay', 'Connected', 'Close'] },
];

export type SelfReport = Partial<Record<ScaleKey, number>>;

export interface Note {
  id: string;
  subject: string;
  t: string;
  text: string;
  private: true;
}

export interface Task {
  id: string;
  subject: string;
  kind: 'habit' | 'todo';
  label: string;
  /** self = made by the astronaut, routine = default habit, system = from an alert. */
  origin: 'self' | 'routine' | 'system';
  metric?: string;
  created: string;
}

export interface TaskEvent {
  task_id: string;
  /** Day the task was done (YYYY-MM-DD, mission clock). */
  date: string;
  status: 'done' | 'skipped';
}

/** A call for Tomas's server, kept until it answers (NEXT.md 2.4). */
interface Pending {
  path: string;
  body: unknown;
}

/** Default habits until the server's routines.yaml exists (labels only, no numbers). */
export const ROUTINES = ['Check-in', 'Exercise block', 'Sleep window', 'Hydration', 'Journal line', 'Call home'];

interface MindState {
  /** subject -> date -> report */
  reports: Record<string, Record<string, SelfReport>>;
  notes: Note[];
  tasks: Task[];
  events: TaskEvent[];
  queue: Pending[];
  setScore: (subject: string, date: string, key: ScaleKey, value: number) => void;
  addNote: (subject: string, text: string) => void;
  addTodo: (subject: string, label: string) => void;
  toggle: (subject: string, taskId: string, date: string) => void;
  flush: () => Promise<void>;
}

const KEY = 'ex-mind-v1';

function load(): Pick<MindState, 'reports' | 'notes' | 'tasks' | 'events' | 'queue'> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { reports: {}, notes: [], tasks: [], events: [], queue: [], ...JSON.parse(raw) };
  } catch {
    /* private window or blocked storage: start empty */
  }
  return { reports: {}, notes: [], tasks: [], events: [], queue: [] };
}

function save(s: MindState) {
  try {
    const { reports, notes, tasks, events, queue } = s;
    localStorage.setItem(KEY, JSON.stringify({ reports, notes, tasks, events, queue }));
  } catch {
    /* storage full or blocked: keep in memory */
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);
const routineId = (subject: string, label: string) => `routine-${subject}-${label.toLowerCase().replace(/\s+/g, '-')}`;

export const useMind = create<MindState>((set, get) => ({
  ...load(),
  setScore: (subject, date, key, value) => {
    set((s) => ({
      reports: { ...s.reports, [subject]: { ...s.reports[subject], [date]: { ...s.reports[subject]?.[date], [key]: value } } },
      queue: [...s.queue, { path: 'api/observations', body: { subject, metric: `self.${key}`, t: `${date}T12:00:00Z`, value } }],
    }));
    save(get());
    void get().flush();
  },
  addNote: (subject, text) => {
    if (!text.trim()) return;
    // private: stays on this device, never queued for the ground
    set((s) => ({ notes: [{ id: uid(), subject, t: new Date().toISOString(), text: text.trim(), private: true as const }, ...s.notes] }));
    save(get());
  },
  addTodo: (subject, label) => {
    if (!label.trim()) return;
    const task: Task = { id: uid(), subject, kind: 'todo', label: label.trim(), origin: 'self', created: new Date().toISOString() };
    set((s) => ({ tasks: [...s.tasks, task], queue: [...s.queue, { path: 'api/tasks', body: task }] }));
    save(get());
    void get().flush();
  },
  toggle: (subject, taskId, date) => {
    const on = get().events.some((e) => e.task_id === taskId && e.date === date && e.status === 'done');
    set((s) => ({
      events: on ? s.events.filter((e) => !(e.task_id === taskId && e.date === date)) : [...s.events, { task_id: taskId, date, status: 'done' }],
      queue: on ? s.queue : [...s.queue, { path: `api/tasks/${taskId}/events`, body: { subject, t: `${date}T12:00:00Z`, status: 'done' } }],
    }));
    save(get());
    void get().flush();
  },
  flush: async () => {
    const q = get().queue;
    if (!q.length || !(await hasServer())) return;
    const left: Pending[] = [];
    for (const p of q) {
      try {
        await postJson(p.path, p.body);
      } catch {
        left.push(p);
      }
    }
    set({ queue: left });
    save(get());
  },
}));

/** The routine habits for a subject plus their own to-dos. */
export function tasksFor(tasks: Task[], subject: string): Task[] {
  const routine: Task[] = ROUTINES.map((label) => ({ id: routineId(subject, label), subject, kind: 'habit', label, origin: 'routine', created: '' }));
  return [...routine, ...tasks.filter((t) => t.subject === subject)];
}

export const isDone = (events: TaskEvent[], taskId: string, date: string) => events.some((e) => e.task_id === taskId && e.date === date && e.status === 'done');

/** Days in a row, ending on `date`, with a self-report saved. */
export function streak(reports: Record<string, SelfReport> | undefined, date: string): number {
  if (!reports) return 0;
  let n = 0;
  const d = new Date(`${date}T00:00:00Z`);
  while (reports[d.toISOString().slice(0, 10)] && Object.keys(reports[d.toISOString().slice(0, 10)]).length) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
