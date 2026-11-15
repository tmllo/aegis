// A normalized reading. Shaped after a FHIR R4 Observation so any device adapter,
// the replay of crew_data.json and the manual check-in all produce the same thing.
// LOINC codes are optional and are only set where a code has been verified.

export interface Observation {
  /** Who it is about: the crew id from crew_data.json (FHIR subject). */
  subject: string;
  /** Metric key from crew_data.json `metrics`, or a device channel name (FHIR code). */
  metric: string;
  /** null = a missed measurement. */
  value: number | null;
  unit: string;
  /** ISO 8601 UTC time, or a YYYY-MM-DD date for daily series (FHIR effectiveDateTime). */
  time: string;
  /** Adapter or dataset that produced it, for example 'replay:crew_data.json' (FHIR device/performer). */
  source: string;
  loinc?: string;
}

/** The same reading as a minimal FHIR R4 Observation resource. */
export interface FhirObservation {
  resourceType: 'Observation';
  status: 'final';
  code: { text: string; coding?: { system: 'http://loinc.org'; code: string }[] };
  subject: { reference: string };
  effectiveDateTime: string;
  valueQuantity?: { value: number; unit: string };
  dataAbsentReason?: { text: string };
  device: { display: string };
}

export function toFhir(o: Observation): FhirObservation {
  return {
    resourceType: 'Observation',
    status: 'final',
    code: {
      text: o.metric,
      ...(o.loinc ? { coding: [{ system: 'http://loinc.org' as const, code: o.loinc }] } : {}),
    },
    subject: { reference: `Patient/${o.subject}` },
    effectiveDateTime: o.time,
    ...(o.value === null
      ? { dataAbsentReason: { text: 'not measured' } }
      : { valueQuantity: { value: o.value, unit: o.unit } }),
    device: { display: o.source },
  };
}

/** Turns one crew member's daily series into Observations (one per metric per day). */
export function seriesToObservations(
  subject: string,
  series: readonly ({ date: string } & Record<string, number | null | string>)[],
  units: Readonly<Record<string, { unit: string }>>,
  source = 'replay:crew_data.json',
): Observation[] {
  const out: Observation[] = [];
  for (const row of series) {
    for (const metric of Object.keys(units)) {
      const v = row[metric];
      out.push({
        subject,
        metric,
        value: typeof v === 'number' ? v : null,
        unit: units[metric].unit,
        time: row.date,
        source,
      });
    }
  }
  return out;
}
