// A tiny typed event store. Every Observation, flag, alert and report goes
// through a bus so the Systems surface can draw the live data flow.
// No React here: use subscribe/getSnapshot with useSyncExternalStore in the UI.

import type { Observation } from './observation';
import type { MetricKey, Severity, Status } from '../data/types';

/** Event name -> payload. Extend by declaring a wider map and calling createBus<YourMap>(). */
export interface CoreEvents {
  observation: Observation;
  flag: { subject: string; metric: MetricKey; severity: Severity; z: number | null; time: string };
  status: { subject: string; overall: Status; time: string };
  alert: { level: 'watch' | 'warning'; message: string; time: string };
  report: { id: string; subject: string; bytes: number; queuedAt: string; arrivesAt: string | null };
  device: { id: string; status: 'connected' | 'disconnected' | 'error' };
  /** A check-in was saved for a crew member (values keyed by metric). */
  checkin: { subject: string; date: string; metrics: MetricKey[]; source: string; time: string };
  /** An escalation case moved to a new step (see core/escalation.ts). */
  case: { id: string; subject: string; metric: MetricKey; severity: Severity; step: string; outcome: string | null; time: string };
  /** A bundle changed state on the comm link (see core/link.ts). */
  link: { id: string; kind: string; status: 'queued' | 'in_flight' | 'delivered'; bytes: number; time: string };
  /** A CMO-DA case bundle was built (see core/handoff.ts). */
  handoff: { id: string; subject: string; bytes: number; time: string };
  /** The wrist was asked to pulse. */
  wrist: { id: string; subject: string | null; pattern: 'single' | 'double' | 'continuous'; reason: string; time: string };
  /** The environment switch changed. */
  environment: { environment: string; time: string };
}

export interface BusRecord<E, K extends keyof E = keyof E> {
  /** Monotonic sequence number, unique per bus. */
  seq: number;
  type: K;
  payload: E[K];
  /** Milliseconds since epoch when it was emitted. */
  at: number;
}

export type AnyRecord<E> = { [K in keyof E]: BusRecord<E, K> }[keyof E];

export interface Bus<E> {
  emit<K extends keyof E>(type: K, payload: E[K]): BusRecord<E, K>;
  /** Listen to one event type. Returns an unsubscribe function. */
  on<K extends keyof E>(type: K, fn: (rec: BusRecord<E, K>) => void): () => void;
  /** Listen to everything. Returns an unsubscribe function. */
  onAny(fn: (rec: AnyRecord<E>) => void): () => void;
  /** Recent events, oldest first. The array identity changes only when an event is emitted. */
  getSnapshot(): readonly AnyRecord<E>[];
  /** For useSyncExternalStore: called after every emit and clear. */
  subscribe(fn: () => void): () => void;
  count(type?: keyof E): number;
  clear(): void;
}

export function createBus<E = CoreEvents>(opts: { capacity?: number; now?: () => number } = {}): Bus<E> {
  const capacity = opts.capacity ?? 500;
  const now = opts.now ?? Date.now;
  let seq = 0;
  let history: AnyRecord<E>[] = [];
  const counts = new Map<keyof E, number>();
  const typed = new Map<keyof E, Set<(rec: never) => void>>();
  const any = new Set<(rec: AnyRecord<E>) => void>();
  const watchers = new Set<() => void>();

  return {
    emit(type, payload) {
      const rec = { seq: ++seq, type, payload, at: now() };
      const next = history.length >= capacity ? history.slice(history.length - capacity + 1) : history.slice();
      next.push(rec as unknown as AnyRecord<E>);
      history = next;
      counts.set(type, (counts.get(type) ?? 0) + 1);
      typed.get(type)?.forEach((fn) => (fn as (r: typeof rec) => void)(rec));
      any.forEach((fn) => fn(rec as unknown as AnyRecord<E>));
      watchers.forEach((fn) => fn());
      return rec;
    },
    on(type, fn) {
      let set = typed.get(type);
      if (!set) typed.set(type, (set = new Set()));
      set.add(fn as (rec: never) => void);
      return () => void set.delete(fn as (rec: never) => void);
    },
    onAny(fn) {
      any.add(fn);
      return () => void any.delete(fn);
    },
    getSnapshot: () => history,
    subscribe(fn) {
      watchers.add(fn);
      return () => void watchers.delete(fn);
    },
    count(type) {
      if (type !== undefined) return counts.get(type) ?? 0;
      let total = 0;
      counts.forEach((n) => (total += n));
      return total;
    },
    clear() {
      history = [];
      counts.clear();
      watchers.forEach((fn) => fn());
    },
  };
}

/** The app-wide bus. */
export const bus: Bus<CoreEvents> = createBus<CoreEvents>();
