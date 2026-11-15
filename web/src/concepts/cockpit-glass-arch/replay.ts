// Replay engine: walks the rows of crew_data.json and the test events of
// storm_forecast.json through core scoring, emits real bus events, and moves
// one packet per event group along the lineage edges. Packets are plain SVG
// circles moved in one requestAnimationFrame loop (no React state per frame).
import { contextFor, regionStatus, scoreDay } from '../../core/scoring';
import type { Bus, CoreEvents } from '../../core/bus';
import type { CrewMember, EnvironmentId, FlareEvent, MissionData } from '../../data/types';
import { BUS_ID, EDGE, lengthOf, pointAt, type Layout, type Pt } from './graph';

export type Sev = 'neutral' | 'amber' | 'red';
type Chain = 'crew' | 'storm';

interface Spec {
  edges: string[];
  sev: Sev;
  weight: number;
  /** Runs when the packet reaches the bus rail: the real bus emit. */
  onBus?: () => void;
  forks?: Spec[];
}

interface Packet {
  el: SVGCircleElement;
  spec: Spec;
  hop: number;
  /** Start point when the packet first has to ride the rail to its edge. */
  lead: Pt | null;
  t: number;
}

/** BUILD-KICKOFF section 4: the storm replay uses test events in this window only. */
export const STORM_WINDOW: [string, string] = ['2024-05-05', '2024-05-20'];
const DAY_MS = 2600;

export interface ReplayOptions {
  layer: SVGGElement;
  getLayout: () => Layout | null;
  data: MissionData;
  environment: EnvironmentId;
  bus: Bus<CoreEvents>;
  /** First day shown, and the day the loop returns to after the last one. */
  startDay: number;
  loopFrom: number;
  reduced: boolean;
  onStorm: (e: FlareEvent) => void;
  onDay: (index: number, date: string) => void;
  onArrive: (node: string, weight: number) => void;
  onReset: () => void;
}

export interface Replay {
  setPlaying: (on: boolean) => void;
  destroy: () => void;
}

const valid = (s: Spec): boolean => s.edges.length > 0 && s.edges.every((k) => EDGE[k]);
const prune = (s: Spec): Spec => ({ ...s, forks: s.forks?.filter(valid).map(prune) });

export function createReplay(o: ReplayOptions): Replay {
  const { data, bus } = o;
  const crew = data.crew.crew;
  const days = crew[0]?.series.length ?? 0;
  const ctx = contextFor(data.crew, o.environment);
  const storm = data.storm.events
    .filter((e) => e.split === 'test' && e.peak_time.slice(0, 10) >= STORM_WINDOW[0] && e.peak_time.slice(0, 10) <= STORM_WINDOW[1])
    .sort((a, b) => a.peak_time.localeCompare(b.peak_time));

  let packets: Packet[] = [];
  let pending: { at: number; run: () => void }[] = [];
  let clock = 0;
  let nextDay = 0;
  const clampDay = (d: number): number => Math.min(Math.max(0, d), Math.max(0, days - 1));
  let day = clampDay(o.startDay);
  // Open on the first flare that raised a watch or warning, so the storm chain shows colour at once.
  let stormAt = Math.max(0, storm.findIndex((e) => e.alert_level !== 'none'));
  let playing = true;
  let raf = 0;
  let last = performance.now();

  const spawn = (input: Spec, chain: Chain, from: Pt | null = null) => {
    const spec = prune(input);
    if (!valid(spec)) return;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('r', '3.5');
    el.setAttribute('class', `cga-pkt cga-pkt-${spec.sev}`);
    el.dataset.chain = chain;
    el.style.opacity = '0';
    o.layer.appendChild(el);
    if (!from) o.onArrive(EDGE[spec.edges[0]].from, spec.weight);
    packets.push({ el, spec, hop: 0, lead: from, t: 0 });
  };

  const crewDay = (m: CrewMember, i: number) => {
    const scores = scoreDay(m, data.crew.metrics, i, ctx);
    if (!scores.length) return;
    const date = m.series[i].date;
    const status = regionStatus(scores, data.crew.metrics);
    const flagged = scores.filter((s) => s.status !== 'green');
    const sev: Sev = status.overall === 'green' ? 'neutral' : status.overall;
    const escalate: Spec[] =
      sev === 'neutral'
        ? []
        : [
            {
              edges: ['core_scoring>core_escalation'],
              sev,
              weight: 1,
              forks: [
                {
                  edges: ['core_escalation>core_bus'],
                  sev,
                  weight: 1,
                  onBus: () => {
                    const body = JSON.stringify({ subject: m.id, date, flags: flagged });
                    bus.emit('report', { id: `${m.id}-${date}`, subject: m.id, bytes: body.length, queuedAt: date, arrivesAt: null });
                  },
                },
                { edges: ['core_escalation>core_link', 'core_link>sf_ground', 'sf_ground>person_surgeon'], sev, weight: 1 },
                { edges: ['core_escalation>core_handoff', 'core_handoff>sf_console'], sev, weight: 1 },
                ...(sev === 'red' ? [{ edges: ['core_escalation>person_cmo'], sev, weight: 1 } as Spec] : []),
              ],
            },
          ];
    spawn(
      {
        edges: ['ds_crew_data>ad_loader', 'ad_loader>ad_replay', 'ad_replay>core_observation', 'core_observation>core_bus', 'core_bus>core_scoring'],
        sev: 'neutral',
        weight: scores.length,
        onBus: () => {
          for (const s of scores) {
            bus.emit('observation', {
              subject: m.id,
              metric: s.metric,
              value: s.value,
              unit: data.crew.metrics[s.metric].unit,
              time: date,
              source: 'replay:crew_data.json',
            });
          }
        },
        forks: [
          {
            edges: ['core_scoring>core_bus'],
            sev,
            weight: flagged.length + 1,
            onBus: () => {
              for (const s of flagged) {
                bus.emit('flag', { subject: m.id, metric: s.metric, severity: s.status === 'red' ? 'red' : 'amber', z: s.z, time: date });
              }
              bus.emit('status', { subject: m.id, overall: status.overall, time: date });
            },
            forks: [
              { edges: ['core_bus>sf_console'], sev, weight: flagged.length + 1 },
              ...(flagged.length
                ? [
                    { edges: ['core_bus>sf_wrist'], sev, weight: 1 } as Spec,
                    { edges: ['core_bus>sf_systems'], sev, weight: flagged.length } as Spec,
                  ]
                : []),
            ],
          },
          ...escalate,
        ],
      },
      'crew',
    );
  };

  const stormEvent = (e: FlareEvent) => {
    const sev: Sev = e.alert_level === 'warning' ? 'red' : e.alert_level === 'watch' ? 'amber' : 'neutral';
    const level = e.alert_level;
    o.onStorm(e);
    spawn(
      {
        edges: ['ds_storm_forecast>core_radiation'],
        // The alert level is already in the file, so the packet carries its colour from the start.
        sev,
        weight: 1,
        forks:
          level === 'none'
            ? []
            : [
                {
                  edges: ['core_radiation>core_bus'],
                  sev,
                  weight: 1,
                  onBus: () => bus.emit('alert', { level, message: `${e.flare_class} p ${e.p_storm}`, time: e.peak_time }),
                  forks: [
                    { edges: ['core_bus>sf_radiation'], sev, weight: 1 },
                    { edges: ['core_bus>sf_systems'], sev, weight: 1 },
                  ],
                },
                ...(level === 'warning'
                  ? [{ edges: ['core_radiation>core_escalation', 'core_escalation>core_link', 'core_link>sf_ground', 'sf_ground>person_surgeon'], sev, weight: 1 } as Spec]
                  : []),
              ],
      },
      'storm',
    );
  };

  const tick = () => {
    if (!days) return;
    if (day >= days) {
      // Wrap: nothing from the last pass may land in the new counts.
      day = clampDay(o.loopFrom);
      packets.forEach((p) => p.el.remove());
      packets = [];
      pending = [];
      bus.clear();
      o.onReset();
    }
    const i = day;
    o.onDay(i, crew[0].series[i].date);
    crew.forEach((m, k) => pending.push({ at: clock + k * 380, run: () => crewDay(m, i) }));
    if (storm.length) {
      const e = storm[stormAt % storm.length];
      stormAt += 1;
      pending.push({ at: clock + 1150, run: () => stormEvent(e) });
    }
    day += 1;
  };

  /** Geometry of the current hop: the lead-in along the rail, or the edge itself. */
  const hopPts = (p: Packet, layout: Layout): Pt[] | null => {
    const edge = layout.pts[p.spec.edges[p.hop]];
    if (!edge) return null;
    return p.lead ? [p.lead, edge[0]] : edge;
  };

  const frame = (now: number) => {
    const dt = Math.min(250, now - last);
    last = now;
    raf = requestAnimationFrame(frame);
    const layout = o.getLayout();
    if (!playing || !layout) return;
    clock += dt;
    if (clock >= nextDay) {
      nextDay = clock + DAY_MS;
      tick();
    }
    if (pending.length) {
      const due = pending.filter((p) => p.at <= clock);
      pending = pending.filter((p) => p.at > clock);
      due.forEach((p) => p.run());
    }
    const alive: Packet[] = [];
    for (const p of packets) {
      const pts = hopPts(p, layout);
      if (!pts) {
        p.el.remove();
        continue;
      }
      const len = lengthOf(pts);
      // 0.5 to 1.5 s per hop, linear; the short ride along the rail is quicker.
      const dur = p.lead ? Math.min(700, Math.max(140, len * 3)) : len < 12 ? 60 : Math.min(1500, Math.max(520, len * 5));
      p.t += dt / dur;
      if (p.t >= 1) {
        if (p.lead) {
          p.lead = null;
          p.t = 0;
        } else {
          const e = EDGE[p.spec.edges[p.hop]];
          o.onArrive(e.to, p.spec.weight);
          if (e.to === BUS_ID) p.spec.onBus?.();
          const end = pts[pts.length - 1];
          p.hop += 1;
          p.t = 0;
          if (p.hop >= p.spec.edges.length) {
            p.el.remove();
            for (const f of p.spec.forks ?? []) {
              const first = layout.pts[f.edges[0]]?.[0];
              // A fork leaving the rail at another height first rides the rail there.
              const ride = first && e.to === BUS_ID && Math.abs(first[1] - end[1]) > 1 ? end : null;
              spawn(f, p.el.dataset.chain as Chain, ride);
            }
            continue;
          }
          const nextStart = layout.pts[p.spec.edges[p.hop]]?.[0];
          if (nextStart && e.to === BUS_ID && Math.abs(nextStart[1] - end[1]) > 1) p.lead = end;
        }
      }
      const cur = hopPts(p, layout);
      if (cur) {
        const [x, y] = pointAt(cur, o.reduced ? 0.5 : p.t);
        p.el.setAttribute('cx', x.toFixed(1));
        p.el.setAttribute('cy', y.toFixed(1));
        p.el.style.opacity = '';
      }
      alive.push(p);
    }
    // Forks spawned during this pass were pushed onto `packets`; keep them.
    const fresh = packets.filter((p) => !alive.includes(p) && p.el.isConnected);
    packets = [...alive, ...fresh];
  };

  raf = requestAnimationFrame(frame);

  return {
    setPlaying(on) {
      playing = on;
    },
    destroy() {
      cancelAnimationFrame(raf);
      packets.forEach((p) => p.el.remove());
      packets = [];
      pending = [];
    },
  };
}
