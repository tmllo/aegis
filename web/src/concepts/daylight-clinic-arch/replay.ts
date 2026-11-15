// Replay engine for the map: walks the mission day by day, turns every row of
// crew_data.json into Observations, scores them with core/scoring, publishes
// everything on a core bus and reports which lineage edges each event travels.
// Counts on the nodes are sums of these real events; nothing is invented.
import { createBus, type Bus, type CoreEvents } from '../../core/bus';
import { seriesToObservations } from '../../core/observation';
import { contextFor, regionStatus, scoreDay } from '../../core/scoring';
import type { EnvironmentId, FlareEvent, MissionData, Severity, Status } from '../../data/types';
import { edgeIndex } from './graph';

export type Tone = 'neutral' | 'amber' | 'red';
/** One packet journey: consecutive lineage edges, drawn hop after hop. */
export interface Journey {
  hops: number[];
  tone: Tone;
  /** Edge index whose arrival starts this journey (a branch), or -1 to start at once. */
  after: number;
}

const chain = (...ids: string[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const e = edgeIndex(ids[i], ids[i + 1]);
    if (e >= 0) out.push(e);
  }
  return out;
};

// Routes through the graph. Every hop is an edge that exists in lineage.json;
// a hop that is missing from a regenerated file is simply left out.
const R = {
  obs: chain('ds_crew_data', 'ad_loader', 'ad_replay', 'core_observation', 'core_bus', 'core_scoring'),
  flagConsole: chain('core_scoring', 'core_bus', 'sf_console'),
  wrist: chain('core_bus', 'sf_wrist'),
  systems: chain('core_bus', 'sf_systems'),
  escalate: chain('core_scoring', 'core_escalation'),
  handoff: chain('core_escalation', 'core_handoff', 'sf_console'),
  cmo: chain('core_escalation', 'person_cmo'),
  ground: chain('core_escalation', 'core_link', 'sf_ground', 'person_surgeon'),
  storm: chain('ds_storm_forecast', 'core_radiation', 'core_bus', 'sf_radiation'),
  stormEscalate: chain('core_radiation', 'core_escalation'),
  stormHandoff: chain('core_radiation', 'core_handoff'),
};
const last = (a: number[]) => (a.length ? a[a.length - 1] : -1);

export interface DayFlag {
  crew: string;
  status: Status;
}

export interface Replay {
  bus: Bus<CoreEvents>;
  dates: string[];
  /** Worst crew status per day, from core scoring (for the day strip). */
  dayStatus: Status[];
  /** Days with a watch or warning flare. */
  dayAlert: ('none' | 'watch' | 'warning')[];
  counts: Map<string, number>;
  /** Test flares whose peak falls inside the mission window. Zero means the storm half stays silent. */
  flaresInWindow: number;
  /** Applies one mission day. Returns the packet journeys to draw. */
  step: (day: number) => Journey[];
  reset: () => void;
}

const ORDER: Record<Status, number> = { green: 0, amber: 1, red: 2 };

export function createReplay(data: MissionData, environment: EnvironmentId): Replay {
  const bus = createBus<CoreEvents>({ capacity: 60 });
  const { crew: file, storm } = data;
  const ctx = contextFor(file, environment);
  const longest = file.crew.reduce((a, c) => (c.series.length > a.series.length ? c : a), file.crew[0]);
  const dates = longest.series.map((r) => r.date);
  const dayOf = new Map(dates.map((d, i) => [d, i]));

  const flares: FlareEvent[][] = dates.map(() => []);
  for (const e of storm.events) {
    const i = dayOf.get(e.peak_time.slice(0, 10));
    if (i !== undefined && e.split === 'test') flares[i].push(e);
  }

  // Scores for every crew member and day, computed once with the contract rule.
  const scored = file.crew.map((m) => m.series.map((_, i) => scoreDay(m, file.metrics, i, ctx)));
  const dayStatus: Status[] = dates.map((_, d) =>
    file.crew.reduce<Status>((acc, _m, ci) => {
      const s = scored[ci][d] ? regionStatus(scored[ci][d], file.metrics).overall : 'green';
      return ORDER[s] > ORDER[acc] ? s : acc;
    }, 'green'),
  );
  const dayAlert = flares.map((list) =>
    list.some((e) => e.alert_level === 'warning') ? 'warning' : list.some((e) => e.alert_level === 'watch') ? 'watch' : 'none',
  );

  const counts = new Map<string, number>();
  const add = (n: number, ...ids: string[]) => ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + n));

  function step(day: number): Journey[] {
    const out: Journey[] = [];
    file.crew.forEach((m, ci) => {
      const row = m.series[day];
      if (!row) return;
      let n = 0;
      for (const o of seriesToObservations(m.id, [row], file.metrics)) {
        if (o.value === null) continue;
        bus.emit('observation', o);
        n += 1;
      }
      if (!n) return;
      const scores = scored[ci][day];
      const flagged = scores.filter((s) => s.status !== 'green');
      const overall = regionStatus(scores, file.metrics).overall;
      const tone: Tone = overall === 'green' ? 'neutral' : overall;
      add(n, 'ds_crew_data', 'ad_loader', 'ad_replay', 'core_observation', 'core_bus', 'core_scoring', 'sf_console', 'sf_systems');
      out.push({ hops: R.obs, tone, after: -1 });
      bus.emit('status', { subject: m.id, overall, time: row.date });
      if (!flagged.length) return;

      for (const s of flagged) {
        bus.emit('flag', { subject: m.id, metric: s.metric, severity: s.status as Severity, z: s.z, time: row.date });
      }
      const f = flagged.length;
      add(f, 'core_bus', 'sf_console', 'sf_wrist', 'sf_systems', 'core_escalation');
      add(1, 'core_handoff');
      out.push({ hops: R.flagConsole, tone, after: last(R.obs) });
      out.push({ hops: R.wrist, tone, after: R.flagConsole[0] ?? -1 });
      out.push({ hops: R.escalate, tone, after: last(R.obs) });
      out.push({ hops: R.handoff, tone, after: last(R.escalate) });
      if (overall === 'red') {
        // The report is the day's flagged scores; its size is the size of that JSON.
        const body = JSON.stringify({ subject: m.id, date: row.date, flags: flagged });
        bus.emit('report', { id: `${m.id}-${row.date}`, subject: m.id, bytes: body.length, queuedAt: row.date, arrivesAt: null });
        add(1, 'person_cmo', 'core_link', 'sf_ground', 'person_surgeon', 'sf_systems');
        out.push({ hops: R.cmo, tone, after: last(R.escalate) });
        out.push({ hops: R.ground, tone, after: last(R.escalate) });
      }
    });

    for (const e of flares[day]) {
      const tone: Tone = e.alert_level === 'warning' ? 'red' : e.alert_level === 'watch' ? 'amber' : 'neutral';
      add(1, 'ds_storm_forecast', 'core_radiation', 'core_bus', 'sf_radiation', 'sf_systems');
      out.push({ hops: R.storm, tone, after: -1 });
      if (e.alert_level === 'none') continue;
      bus.emit('alert', { level: e.alert_level, message: `${e.flare_class} p_storm ${e.p_storm}`, time: e.peak_time });
      add(1, 'core_escalation', 'sf_wrist');
      out.push({ hops: R.stormEscalate, tone, after: R.storm[0] ?? -1 });
      out.push({ hops: R.wrist, tone, after: R.storm[1] ?? -1 });
      if (e.alert_level === 'warning') {
        add(1, 'core_handoff');
        out.push({ hops: R.stormHandoff, tone, after: R.storm[0] ?? -1 });
      }
    }
    out.push({ hops: R.systems, tone: 'neutral', after: -1 });
    return out;
  }

  return {
    bus,
    dates,
    dayStatus,
    dayAlert,
    counts,
    flaresInWindow: flares.reduce((a, l) => a + l.length, 0),
    step,
    reset() {
      bus.clear();
      counts.clear();
    },
  };
}
