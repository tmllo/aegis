// Comm-link simulator: one-way delay by environment, loss-of-signal (LOS)
// windows and a store-and-forward queue (DTN-style bundles). Pure functions,
// no React, no timers: the caller owns the clock and passes `now` in.
//
// OWNER: core builder. The signatures below are frozen (src/state uses them).
// The bodies work; the core builder adds tests and may refine the internals.
//
// Times are station time in milliseconds since the epoch.

import type { EnvironmentId } from '../data/types';

export interface LinkProfile {
  environment: EnvironmentId;
  /** One-way signal delay to Earth, seconds. */
  oneWayDelay_s: number;
  /** true = an example value inside a range that changes with planetary distance. */
  example: boolean;
  /** Short note for the UI, for example 'light time'. */
  note: string;
}

/**
 * Delays are physics and mission geometry, not file data, so they live here.
 * ISS: relayed, treated as immediate. Moon: about 1.3 s light time.
 * Mars: 3 to 22 minutes one way depending on the distance; transit uses an
 * 11 minute example and the surface the 22 minute maximum (BUILD-KICKOFF section 3).
 */
export const LINK_PROFILES: Record<EnvironmentId, LinkProfile> = {
  iss: { environment: 'iss', oneWayDelay_s: 0, example: false, note: 'relay, near real time' },
  moon: { environment: 'moon', oneWayDelay_s: 1.3, example: false, note: 'light time' },
  transit: { environment: 'transit', oneWayDelay_s: 11 * 60, example: true, note: 'example distance' },
  mars: { environment: 'mars', oneWayDelay_s: 22 * 60, example: true, note: 'maximum distance' },
};

export const oneWayDelayMs = (environment: EnvironmentId): number => LINK_PROFILES[environment].oneWayDelay_s * 1000;

/** '0 s', '1.3 s', '45 s', '11 min', '1 h 5 min'. No tilde: the caller adds '~' or '(example)'. */
export function formatDelay(seconds: number): string {
  if (seconds < 60) return `${Number(seconds.toFixed(1))} s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** A loss-of-signal window. `end: null` = open ended (a blackout switched on by hand). */
export interface LosWindow {
  id: string;
  start: number;
  end: number | null;
  reason: string;
}

export type BundleKind = 'case_report' | 'conference_flag' | 'handoff' | 'daily_report' | 'radiation_alert';
export type BundleStatus = 'queued' | 'in_flight' | 'delivered';

/** One store-and-forward bundle on its way to the ground. */
export interface LinkBundle {
  id: string;
  kind: BundleKind;
  /** Crew id it is about, or null for a station-wide bundle. */
  subject: string | null;
  /** Escalation case it belongs to, if any. */
  caseId: string | null;
  /** One line for the Ground list. */
  summary: string;
  /** What is sent. Its JSON size is `bytes`. */
  payload: unknown;
  bytes: number;
  /** Environment at the time of sending: fixes the delay of this bundle. */
  environment: EnvironmentId;
  createdAt: number;
  /** When it leaves the station: createdAt, or the end of the LOS window. null = held by an open-ended LOS. */
  sentAt: number | null;
  /** sentAt + one-way delay. null while held. */
  arrivesAt: number | null;
  /** Set when the clock passes arrivesAt. */
  deliveredAt: number | null;
  status: BundleStatus;
}

export type NewBundle = Pick<LinkBundle, 'id' | 'kind' | 'subject' | 'caseId' | 'summary' | 'payload'>;

/** UTF-8 size of the JSON form of a payload, in bytes. */
export function byteSize(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload) ?? '').length;
}

/** The LOS window covering time t, or null when the link is up. */
export function losAt(windows: readonly LosWindow[], t: number): LosWindow | null {
  return windows.find((w) => t >= w.start && (w.end === null || t < w.end)) ?? null;
}

/**
 * Earliest time at or after t when the link is up. Chained and overlapping
 * windows are followed to their end. null = held by an open-ended window.
 */
export function nextTransmitTime(windows: readonly LosWindow[], t: number): number | null {
  let at = t;
  for (let guard = 0; guard <= windows.length; guard++) {
    const w = losAt(windows, at);
    if (!w) return at;
    if (w.end === null) return null;
    at = w.end;
  }
  return at;
}

/**
 * Puts a new bundle on the queue. It leaves at once when the link is up,
 * otherwise at the end of the LOS window, and never before a bundle queued
 * earlier (delivery stays in order).
 */
export function scheduleBundle(
  input: NewBundle,
  environment: EnvironmentId,
  windows: readonly LosWindow[],
  now: number,
  queue: readonly LinkBundle[] = [],
): LinkBundle {
  const sentAt = departure(now, windows, queue);
  return {
    ...input,
    bytes: byteSize(input.payload),
    environment,
    createdAt: now,
    sentAt,
    arrivesAt: sentAt === null ? null : sentAt + oneWayDelayMs(environment),
    deliveredAt: null,
    status: sentAt !== null && sentAt <= now ? 'in_flight' : 'queued',
  };
}

function departure(earliest: number, windows: readonly LosWindow[], before: readonly LinkBundle[]): number | null {
  // In order: a bundle cannot leave before one queued ahead of it.
  let floor = earliest;
  for (const b of before) {
    if (b.sentAt === null) return null;
    if (b.sentAt > floor) floor = b.sentAt;
  }
  return nextTransmitTime(windows, floor);
}

/**
 * Moves the queue to time `now`: bundles that have left become in_flight,
 * bundles whose arrival time has passed become delivered. Bundles still
 * waiting are re-planned against the current windows (a blackout switched on
 * or off changes when they leave). A bundle already in flight keeps its
 * arrival time: the signal has left.
 * Returns the same array when nothing changed.
 */
export function advanceLink(
  bundles: readonly LinkBundle[],
  windows: readonly LosWindow[],
  now: number,
): { bundles: readonly LinkBundle[]; changed: LinkBundle[] } {
  const changed: LinkBundle[] = [];
  const out: LinkBundle[] = [];
  for (const b of bundles) {
    let next = b;
    if (next.status === 'queued') {
      const sentAt = departure(next.createdAt, windows, out);
      const arrivesAt = sentAt === null ? null : sentAt + oneWayDelayMs(next.environment);
      if (sentAt !== next.sentAt || arrivesAt !== next.arrivesAt) next = { ...next, sentAt, arrivesAt };
      if (sentAt !== null && sentAt <= now) next = { ...next, status: 'in_flight' };
    }
    if (next.status === 'in_flight' && next.arrivesAt !== null && next.arrivesAt <= now) {
      next = { ...next, status: 'delivered', deliveredAt: next.arrivesAt };
    }
    if (next.status !== b.status) changed.push(next);
    out.push(next);
  }
  const same = out.every((b, i) => b === bundles[i]);
  return { bundles: same ? bundles : out, changed };
}

/** Milliseconds until a bundle arrives, 0 when delivered, null while held by an open-ended LOS. */
export function timeToArrival(bundle: LinkBundle, now: number): number | null {
  if (bundle.status === 'delivered') return 0;
  return bundle.arrivesAt === null ? null : Math.max(0, bundle.arrivesAt - now);
}

/** Closes an open-ended window at time t (switching a blackout off). */
export function closeWindow(windows: readonly LosWindow[], id: string, t: number): LosWindow[] {
  return windows.map((w) => (w.id === id && w.end === null ? { ...w, end: Math.max(t, w.start) } : w));
}
