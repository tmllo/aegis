// CMO-DA handoff: the case bundle (JSON) and a plain-language summary.
// The summary is a deterministic template. No generative AI in alerts,
// scoring or this file.
//
// Pure functions, no React. OWNER: core builder. Signatures are frozen
// (src/state uses them); the bodies work and the core builder adds tests
// and may enrich the bundle (keep `schema` in step with any shape change).

import type { CrewData, CrewMember, EnvironmentId, MetricKey, Region, Severity } from '../data/types';
import type { EscalationCase } from './escalation';
import { byteSize } from './link';
import { toFhir, type FhirObservation } from './observation';

/** Fixed wording (BUILD-KICKOFF section 4). */
export const HANDOFF_LABEL = "Prepared for an onboard AI medical assistant such as NASA's CMO-DA";
export const HANDOFF_SCHEMA = 'ex.handoff.v1';
/** Days of the drifting metric included in the bundle. */
export const HANDOFF_SERIES_DAYS = 14;

export interface HandoffBundle {
  id: string;
  schema: typeof HANDOFF_SCHEMA;
  label: typeof HANDOFF_LABEL;
  /** ISO 8601 station time. */
  createdAt: string;
  caseId: string;
  crew: { id: string; name: string; role: string; age: number };
  mission: { name: string; environment: EnvironmentId; environmentLabel: string; day: number; date: string };
  finding: {
    metric: MetricKey;
    label: string;
    unit: string;
    region: Region;
    severity: Severity;
    value: number;
    /** 3-day mean used for the score; null on absolute bands. */
    windowMean: number | null;
    /** Personal baseline; null for dose and bone loss. */
    baseline: { mean: number; sd: number } | null;
    z: number | null;
    outsideAbsolute: boolean;
    absoluteRed: { min: number; max: number };
    /** Consecutive days the stored flags name this metric, ending on the case date. */
    daysRunning: number;
  };
  remeasure: { value: number; status: string; z: number | null; at: string } | null;
  actionsTaken: string[];
  advice: string;
  radiation: { dose_mSv_day: number | null; dose_mSv_cum: number | null; careerLimit_mSv: number; fractionOfLimit: number | null };
  /** The metric's recent days as FHIR Observations. */
  observations: FhirObservation[];
  /** Plain-language summary, built from the fields above. */
  summary: string;
  simulated: boolean;
}

/** Mission day number of a date (start_date = day 1). */
export function missionDay(startDate: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Consecutive days, ending on `date`, on which the member's flags name `metric`. */
export function daysRunning(member: Pick<CrewMember, 'flags'>, metric: MetricKey, date: string): number {
  const days = new Set(member.flags.filter((f) => f.metric === metric).map((f) => f.date));
  let n = 0;
  let t = Date.parse(`${date}T00:00:00Z`);
  while (days.has(new Date(t).toISOString().slice(0, 10))) {
    n += 1;
    t -= 86_400_000;
  }
  return n;
}

const num = (v: number, digits = 2): string => String(Number(v.toFixed(digits)));

/** The readable summary. Same input, same text. */
export function summarize(b: Omit<HandoffBundle, 'summary'>): string {
  const f = b.finding;
  const lines: string[] = [];
  lines.push(`${b.crew.name}, ${b.crew.role}, age ${b.crew.age}. ${b.mission.environmentLabel}, mission day ${b.mission.day}.`);
  let what = `${f.label}: ${num(f.value)} ${f.unit} (${f.severity}).`;
  if (f.baseline && f.z !== null && f.windowMean !== null) {
    const side = f.z >= 0 ? 'above' : 'below';
    what += ` 3-day mean ${num(f.windowMean, 1)} ${f.unit}, ${num(Math.abs(f.z), 1)} sd ${side} own baseline of ${num(f.baseline.mean, 1)} ${f.unit}.`;
  }
  if (f.outsideAbsolute) what += ` Outside the absolute limit (${num(f.absoluteRed.min)} to ${num(f.absoluteRed.max)} ${f.unit}).`;
  if (f.daysRunning > 1) what += ` Flagged ${f.daysRunning} days running.`;
  lines.push(what);
  lines.push(
    b.remeasure
      ? `Re-measured: ${num(b.remeasure.value)} ${f.unit} (${b.remeasure.status}).`
      : 'Not re-measured.',
  );
  if (b.actionsTaken.length) lines.push(`Actions taken: ${b.actionsTaken.join('; ')}.`);
  lines.push(`Advice shown to the crew member: ${b.advice}`);
  const r = b.radiation;
  if (r.dose_mSv_cum !== null && r.fractionOfLimit !== null) {
    lines.push(
      `Radiation: ${num(r.dose_mSv_cum, 1)} mSv cumulative, ${num(r.fractionOfLimit * 100, 1)}% of the ${num(r.careerLimit_mSv)} mSv career limit.`,
    );
  }
  if (b.simulated) lines.push('Simulated crew data, not real astronaut records. Not medical advice.');
  return lines.join('\n');
}

/**
 * Builds the case bundle for one escalation case.
 * `member` is the live crew member (series and flags as the station has them now).
 */
export function buildHandoff(input: {
  id: string;
  case: EscalationCase;
  member: CrewMember;
  data: CrewData;
  environment: EnvironmentId;
  now: number;
}): HandoffBundle {
  const { id, case: c, member, data, environment, now } = input;
  const meta = data.metrics[c.metric];
  const base = member.baseline[c.metric] ?? null;
  const upTo = member.series.findIndex((r) => r.date === c.date);
  const rows = member.series.slice(0, upTo < 0 ? member.series.length : upTo + 1);
  const last = rows[rows.length - 1];
  const cum = last?.dose_mSv_cum ?? null;
  const value = c.remeasure?.value ?? c.value;

  const core: Omit<HandoffBundle, 'summary'> = {
    id,
    schema: HANDOFF_SCHEMA,
    label: HANDOFF_LABEL,
    createdAt: new Date(now).toISOString(),
    caseId: c.id,
    crew: { id: member.id, name: member.name, role: member.role, age: member.age },
    mission: {
      name: data.mission.name,
      environment,
      environmentLabel: data.environments[environment].label,
      day: missionDay(data.mission.start_date, c.date),
      date: c.date,
    },
    finding: {
      metric: c.metric,
      label: meta.label,
      unit: meta.unit,
      region: c.region,
      severity: c.severity,
      value: c.value,
      windowMean: c.windowMean,
      baseline: base ? { mean: base.mean, sd: base.sd } : null,
      z: c.z,
      outsideAbsolute: c.outsideAbsolute,
      absoluteRed: { ...meta.absolute_red },
      daysRunning: daysRunning(member, c.metric, c.date),
    },
    remeasure: c.remeasure
      ? { value: c.remeasure.value, status: c.remeasure.status, z: c.remeasure.z, at: new Date(c.remeasure.at).toISOString() }
      : null,
    actionsTaken: [...c.actionsTaken],
    advice: meta.actions[c.severity],
    radiation: {
      dose_mSv_day: last?.dose_mSv_day ?? null,
      dose_mSv_cum: cum,
      careerLimit_mSv: data.career_limit_mSv,
      fractionOfLimit: cum === null ? null : cum / data.career_limit_mSv,
    },
    observations: rows.slice(-HANDOFF_SERIES_DAYS).map((r, i, all) =>
      toFhir({
        subject: member.id,
        metric: c.metric,
        value: i === all.length - 1 ? value : r[c.metric],
        unit: meta.unit,
        time: r.date,
        source: 'e^x Crew Station',
      }),
    ),
    simulated: data.meta.simulated,
  };
  return { ...core, summary: summarize(core) };
}

/** Size of the bundle on the downlink, bytes. */
export const handoffBytes = (bundle: HandoffBundle): number => byteSize(bundle);
