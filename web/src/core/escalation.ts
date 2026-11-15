// Escalation: one case per drifting metric, walked through four steps.
//
//   01 Detect  -> 02 Notify -> 03 Verify -> 04 Escalate
//
// Rules (BUILD-KICKOFF section 4):
//   amber: notify, then re-measure. A confirmed amber is flagged for the next
//          private medical conference. A re-measure back in range clears it.
//   red or a raw value outside absolute_red: never waits for a repeat.
//          Crew medical officer now, and a report to the flight surgeon is queued.
//   green: self-care, no case.
//
// Pure functions, no React. OWNER: core builder. Signatures are frozen
// (src/state uses them); the bodies work and the core builder adds tests,
// and may refine the wording in escalationPlan.

import type { EnvironmentId, MetricKey, Region, Severity, Status } from '../data/types';
import type { MetricScore } from './scoring';
import { LINK_PROFILES, formatDelay } from './link';

export const CASE_STEPS = ['detect', 'notify', 'verify', 'escalate'] as const;
export type CaseStep = (typeof CASE_STEPS)[number] | 'closed';
/** Words for the numbered steps. */
export const CASE_STEP_LABEL: Record<(typeof CASE_STEPS)[number], string> = {
  detect: 'Detect',
  notify: 'Notify',
  verify: 'Verify',
  escalate: 'Escalate',
};

/** How a case ended, or where it stands once it has been escalated. */
export type CaseOutcome =
  /** The re-measure came back inside the personal band. */
  | 'cleared'
  /** Confirmed amber: flagged for the next private medical conference. */
  | 'conference_flag'
  /** Red: crew medical officer now, report to the flight surgeon queued. */
  | 'cmo_now';

export interface Remeasure {
  value: number;
  at: number;
  /** Status of the re-measured value under the same rule. */
  status: Status;
  z: number | null;
}

export interface CaseHistoryEntry {
  step: CaseStep;
  at: number;
  note: string;
}

export interface EscalationCase {
  /** `${subject}:${metric}:${date}`: one case per person, metric and day. */
  id: string;
  subject: string;
  metric: MetricKey;
  region: Region;
  /** Severity now. A re-measure can raise amber to red. */
  severity: Severity;
  /** Mission date of the reading (YYYY-MM-DD). */
  date: string;
  /** The reading that opened the case. */
  value: number;
  windowMean: number | null;
  z: number | null;
  outsideAbsolute: boolean;
  step: CaseStep;
  /** Amber waits for a re-measure; red and absolute-limit values do not. */
  verifyRequired: boolean;
  remeasure: Remeasure | null;
  outcome: CaseOutcome | null;
  /** Plain-language record of what the crew did, for the handoff. */
  actionsTaken: string[];
  /** Link bundle ids sent for this case. */
  reportIds: string[];
  /** CMO-DA handoff bundle id, once one is built. */
  handoffId: string | null;
  openedAt: number;
  closedAt: number | null;
  history: CaseHistoryEntry[];
}

export type CaseEvent =
  | { type: 'notify' }
  | { type: 'start_verify' }
  | { type: 'remeasure'; value: number; status: Status; z: number | null }
  | { type: 'escalate' }
  | { type: 'close' };

export const caseId = (subject: string, metric: MetricKey, date: string): string => `${subject}:${metric}:${date}`;

/** Amber on the personal band waits for a repeat. Red and absolute-limit values never do. */
export const needsVerify = (severity: Severity, outsideAbsolute: boolean): boolean =>
  severity === 'amber' && !outsideAbsolute;

/** Opens a case at step 01 from a non-green score. */
export function openCase(
  input: { subject: string; region: Region; date: string; score: MetricScore & { status: Severity } },
  at: number,
): EscalationCase {
  const { subject, region, date, score } = input;
  return {
    id: caseId(subject, score.metric, date),
    subject,
    metric: score.metric,
    region,
    severity: score.status,
    date,
    value: score.value,
    windowMean: score.windowMean,
    z: score.z,
    outsideAbsolute: score.outsideAbsolute,
    step: 'detect',
    verifyRequired: needsVerify(score.status, score.outsideAbsolute),
    remeasure: null,
    outcome: null,
    actionsTaken: [],
    reportIds: [],
    handoffId: null,
    openedAt: at,
    closedAt: null,
    history: [{ step: 'detect', at, note: 'Drift detected' }],
  };
}

const move = (c: EscalationCase, step: CaseStep, at: number, note: string, patch: Partial<EscalationCase> = {}): EscalationCase => ({
  ...c,
  ...patch,
  step,
  history: [...c.history, { step, at, note }],
});

/**
 * The case state machine. An event that is not allowed in the current step
 * returns the same object, so callers can compare by identity.
 *
 *   detect   --notify-------> notify
 *   notify   --start_verify-> verify     (amber only)
 *   notify   --escalate-----> escalate   (red / absolute limit only: no repeat needed)
 *   verify   --remeasure----> closed     (back in range: cleared)
 *                          -> escalate   (still amber: conference flag; red: CMO now)
 *   escalate --close--------> closed
 */
export function transition(c: EscalationCase, event: CaseEvent, at: number): EscalationCase {
  switch (event.type) {
    case 'notify':
      return c.step === 'detect' ? move(c, 'notify', at, 'Crew member notified') : c;
    case 'start_verify':
      return c.step === 'notify' && c.verifyRequired ? move(c, 'verify', at, 'Re-measure requested') : c;
    case 'remeasure': {
      if (c.step !== 'verify') return c;
      const remeasure: Remeasure = { value: event.value, at, status: event.status, z: event.z };
      const actionsTaken = [...c.actionsTaken, 'Re-measured'];
      if (event.status === 'green') {
        return move(c, 'closed', at, 'Re-measure back in range', { remeasure, actionsTaken, outcome: 'cleared', closedAt: at });
      }
      const outcome: CaseOutcome = event.status === 'red' ? 'cmo_now' : 'conference_flag';
      return move(c, 'escalate', at, event.status === 'red' ? 'Re-measure red' : 'Amber confirmed', {
        remeasure,
        actionsTaken,
        severity: event.status,
        outcome,
      });
    }
    case 'escalate':
      return c.step === 'notify' && !c.verifyRequired
        ? move(c, 'escalate', at, 'Escalated without a repeat', { outcome: 'cmo_now' })
        : c;
    case 'close':
      return c.step === 'escalate' ? move(c, 'closed', at, 'Closed', { closedAt: at }) : c;
  }
}

/** Index 0-3 of the lit step for NumberedSteps; a closed case shows its last step. */
export function stepIndex(c: Pick<EscalationCase, 'step' | 'history'>): number {
  const step = c.step === 'closed' ? c.history.filter((h) => h.step !== 'closed').at(-1)?.step ?? 'detect' : c.step;
  return Math.max(0, CASE_STEPS.indexOf(step as (typeof CASE_STEPS)[number]));
}

export const isOpen = (c: Pick<EscalationCase, 'step'>): boolean => c.step !== 'closed';

export interface EscalationPlan {
  status: Status;
  /** Who is told: 1-3 words. */
  who: string;
  /** One sentence: what happens. */
  text: string;
  /** true when a report to the flight surgeon is queued on the link. */
  reportQueued: boolean;
  /** 'arrives in ~11 min (example)', or null when nothing is sent. */
  arrival: string | null;
}

/** 'arrives in ~1.3 s', 'arrives in ~11 min (example)', 'arrives at once'. */
export function arrivalText(environment: EnvironmentId): string {
  const p = LINK_PROFILES[environment];
  if (p.oneWayDelay_s === 0) return 'arrives at once';
  return `arrives in ~${formatDelay(p.oneWayDelay_s)}${p.example ? ' (example)' : ''}`;
}

/** Status x environment -> who is told and how long the report takes. */
export function escalationPlan(status: Status, environment: EnvironmentId): EscalationPlan {
  if (status === 'green') {
    return { status, who: 'Self-care', text: 'No action needed. Keep the daily check-in.', reportQueued: false, arrival: null };
  }
  if (status === 'amber') {
    return {
      status,
      who: 'Medical conference',
      text: 'Self-care now. If the re-measure confirms it, it is flagged for the next private medical conference.',
      reportQueued: false,
      arrival: null,
    };
  }
  const arrival = arrivalText(environment);
  return {
    status,
    who: 'Crew medical officer',
    text: `Crew medical officer now. Report to the flight surgeon ${arrival}.`,
    reportQueued: true,
    arrival,
  };
}
