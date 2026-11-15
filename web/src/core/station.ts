// Headless station runner: the whole e^x loop with no browser and no React,
// so the same rules could run on a station-class server next to the UI.
//
//   Observation -> series -> scoring -> case -> wrist / link / handoff
//
// OWNER: core builder. This file is an interface stub: the types are frozen,
// createStation is a TODO. The UI does not use it (the UI runs the same core
// functions through src/state); it exists for the headless test and the
// "Server-ready" flight-readiness check.

import type { CrewData, CrewMember, EnvironmentId, MetricKey, RegionStatus } from '../data/types';
import type { Bus, CoreEvents } from './bus';
import type { EscalationCase } from './escalation';
import type { HandoffBundle } from './handoff';
import type { LinkBundle, LosWindow } from './link';
import type { Observation } from './observation';

export interface StationOptions {
  data: CrewData;
  environment?: EnvironmentId;
  /** Station time at start, ms since the epoch. */
  now?: number;
  /** Events go here. Default: a private bus. */
  bus?: Bus<CoreEvents>;
}

export interface StationSnapshot {
  now: number;
  environment: EnvironmentId;
  crew: CrewMember[];
  statuses: Record<string, RegionStatus>;
  cases: EscalationCase[];
  bundles: LinkBundle[];
  losWindows: LosWindow[];
  handoffs: HandoffBundle[];
}

export interface Station {
  /** Feeds one reading in (from any device adapter). */
  ingest(observation: Observation): void;
  /** Saves a check-in for today and re-scores the crew member. */
  checkIn(subject: string, values: Partial<Record<MetricKey, number>>): void;
  /** Moves a case one event forward (see core/escalation.ts). */
  notify(caseId: string): void;
  remeasure(caseId: string, value: number): void;
  escalate(caseId: string): void;
  handoff(caseId: string): HandoffBundle | null;
  setEnvironment(environment: EnvironmentId): void;
  /** Advances station time and delivers link bundles that are due. */
  advance(ms: number): void;
  snapshot(): StationSnapshot;
  readonly bus: Bus<CoreEvents>;
}

/**
 * TODO(core builder): build the runner from core/scoring, core/escalation,
 * core/link and core/handoff. Mirror the behaviour of src/state/store.ts and
 * cover it with station.test.ts (the demo path, headless).
 */
export function createStation(_options: StationOptions): Station {
  throw new Error('core/station: createStation is not implemented yet');
}
