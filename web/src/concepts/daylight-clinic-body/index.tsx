// Daylight Clinic: body surface. A porcelain body on bone-white; status sits inside
// the body where it occurs, each region's lead value sits at its height beside the body,
// and one bottom sheet holds the value against the person's own baseline.
// Every value comes from crew_data.json through core/scoring; positions from docs/body-map.json.
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { ANATOMY_CREDIT, DISCLAIMERS } from '../../components/Footer';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import {
  BONE_LOSS_AMBER_PCT,
  DOSE_CUM_AMBER_FRACTION,
  DOSE_DAY_AMBER_FACTOR,
  contextFor,
  dayIndex,
  statusOn,
  worst,
  type MetricScore,
} from '../../core/scoring';
import { conceptIds, type ConceptMeta } from '../../registry';
import type { MetricKey, Region, Status } from '../../data/types';
import { REGIONS } from '../../data/types';
import {
  BM,
  BODY_H,
  BODY_HALF_FRAC,
  DETAIL_WORD,
  FOV,
  ORDER,
  REGION_NAME,
  SHORT,
  STATUS_WORD,
  daysRunning,
  decimalsOf,
  canRemeasure,
  focusPoint,
  focusRanges,
  homeY,
  hotRadius,
  initials,
  isIllustrative,
  metricBox,
  regionBox,
  type Box,
  type Vec3,
} from './model';
import { PorcelainScene, type BodyState, type Hot, type Pose } from './PorcelainBody';
import { Shape, Sheet, type Detail } from './Sheet';
import './daylight.css';

export const meta: ConceptMeta = {
  title: 'Daylight Clinic Body',
  direction: 'Daylight Clinic',
  surface: 'body',
};

const SELF = 'daylight-clinic-body';
const VIEWS = [
  { id: 'front', label: 'Front', az: 0 },
  { id: 'left', label: 'Left', az: Math.PI / 2 },
  { id: 'back', label: 'Back', az: Math.PI },
  { id: 'right', label: 'Right', az: -Math.PI / 2 },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];
const MAX_ISSUES = 5;
const DOSE_KEYS: MetricKey[] = ['dose_mSv_day', 'dose_mSv_cum'];
/** Row pitch: a 72 px gloved target plus a gap. */
const PITCH = 76;
const ROW_TOP = 52;


interface Issue {
  key: MetricKey;
  status: Status;
  region: Region;
  /** Point on the body; null for whole-body issues, which sit on the ring around the figure. */
  anchor: Vec3 | null;
  /** "126 mmHg" */
  reading: string;
  /** "+2.5 sd", "Above watch", "Over limit" */
  side: string;
}

interface RegionRow {
  region: Region;
  status: Status;
  /** Body height in metres; null for the whole body. */
  m: number | null;
  text: string;
  unit: string;
}

const withUnit = (text: string, unit: string): string => `${text}${unit.startsWith('/') ? '' : ' '}${unit}`;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const firstSentence = (s: string): string => {
  const i = s.indexOf('. ');
  return i < 0 ? s : s.slice(0, i + 1);
};

/** Rows at their body height, pushed apart to stay 72 px targets. null = no height: stacked from the top. */
function stack(ys: (number | null)[], stageH: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => (a.y ?? -Infinity) - (b.y ?? -Infinity));
  const out: number[] = [];
  let prev = ROW_TOP - PITCH;
  for (const o of order) {
    prev = Math.max(o.y ?? ROW_TOP, prev + PITCH, ROW_TOP);
    out[o.i] = prev;
  }
  let next = stageH - 44 + PITCH;
  for (let k = order.length - 1; k >= 0; k--) {
    next = Math.min(out[order[k].i], next - PITCH);
    out[order[k].i] = next;
  }
  return out;
}

function useReducedMotion(): boolean {
  const [r, setR] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return r;
}

function useBox<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }] {
  // Callback ref: the element mounts only after the data has loaded.
  const [el, setEl] = useState<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, [el]);
  return [setEl, box];
}

/* ---------------------------------------------------------------- regions */

interface RegionsProps {
  rows: RegionRow[];
  stageH: number;
  freeH: number;
  /** Right edge of the column, px from the left of the field. */
  right: number;
  width: number;
  selected: Region | null;
  onPick: (r: Region) => void;
}

/** One row per region at its height beside the body: name, lead value, status shape. */
function Regions({ rows, stageH, freeH, right, width, selected, onPick }: RegionsProps) {
  const focused = selected !== null;
  const placed = useMemo(() => {
    const ys = rows.map((r) => (r.m === null ? null : homeY(r.m, stageH)));
    const by = stack(ys, stageH);
    // While a sheet is open the scale is gone: the rows close up into a plain region switch.
    const pitch = Math.min(PITCH, (freeH - ROW_TOP - 44) / Math.max(1, rows.length - 1));
    const rank = by.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    const compact: number[] = [];
    rank.forEach((o, k) => (compact[o.i] = ROW_TOP + k * pitch));
    return { rows: rows.map((r, i) => ({ ...r, y: ys[i], by: focused ? compact[i] : by[i] })), pitch };
  }, [rows, stageH, freeH, focused]);

  if (stageH === 0 || (focused && placed.pitch < 60)) return null;
  const axis = right + 18;
  return (
    <div className="dcb-regions">
      <svg className="dcb-axis" data-off={focused} aria-hidden="true">
        <line x1={axis} x2={axis} y1={homeY(BODY_H, stageH)} y2={homeY(0, stageH)} />
        <line x1={axis - 6} x2={axis + 6} y1={homeY(BODY_H, stageH)} y2={homeY(BODY_H, stageH)} />
        <line x1={axis - 6} x2={axis + 6} y1={homeY(0, stageH)} y2={homeY(0, stageH)} />
        {placed.rows.map(
          (t) =>
            t.y !== null && (
              <polyline key={t.region} points={`${right + 2},${t.by} ${right + 9},${t.by} ${axis},${t.y} ${axis + 14},${t.y}`} />
            ),
        )}
      </svg>
      {placed.rows.map((t) => (
        <button
          key={t.region}
          type="button"
          className="dcb-region"
          data-stacked={width < 270}
          style={{ left: right - width, width, transform: `translateY(${(t.by - 36).toFixed(1)}px)` }}
          aria-pressed={selected === t.region}
          aria-label={`${REGION_NAME[t.region]}, ${withUnit(t.text, t.unit)}, ${STATUS_WORD[t.status]}`}
          onClick={() => onPick(t.region)}
        >
          <span className="dcb-region-text">
            <span className="dcb-region-name">{REGION_NAME[t.region]}</span>
            <span className="dcb-region-val">
              {t.text}
              <i>{t.unit}</i>
            </span>
          </span>
          <Shape status={t.status} size={16} />
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- overlay */

interface OverlayApi {
  frame: (camera: THREE.Camera, w: number, h: number) => void;
}

interface Leader {
  status: Status;
  anchor: Vec3 | null;
  /** Place on the whole-body ring, for issues with no anchor. */
  slot: number;
  /** Where the issue row starts, px in the field. */
  x: number;
  y: number;
}

interface OverlayProps {
  api: React.MutableRefObject<OverlayApi>;
  leaders: Leader[];
  ring: Status;
  selection: { box: Box; title: string; sub: string } | null;
  /** Height of the field left free above the sheet, px. */
  freeH: number;
}

/** Whole-body ring, leader lines and the selection bracket: written through refs each frame. */
function Overlay({ api, leaders, ring, selection, freeH }: OverlayProps) {
  const lines = useRef<(SVGPolylineElement | null)[]>([]);
  const marks = useRef<(SVGGElement | null)[]>([]);
  const halo = useRef<SVGEllipseElement>(null);
  const bracket = useRef<SVGPathElement>(null);
  const bLine = useRef<SVGLineElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  const live = useRef({ leaders, selection, freeH });
  live.current = { leaders, selection, freeH };

  useEffect(() => {
    const v = new THREE.Vector3();
    api.current.frame = (camera, w, h) => {
      const { leaders: list, selection: sel, freeH: free } = live.current;
      const px = (p: Vec3): [number, number] => {
        v.set(p[0], p[1], p[2]).project(camera);
        return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
      };
      // The ring follows the figure, so it frames the whole body in every view and zoom.
      const [cx, cy] = px([0, BODY_H / 2, 0]);
      const tall = px([0, 0, 0])[1] - px([0, BODY_H, 0])[1];
      const rx = tall * 0.25;
      const ry = tall * 0.56;
      const el = halo.current;
      if (el) {
        el.setAttribute('cx', cx.toFixed(1));
        el.setAttribute('cy', cy.toFixed(1));
        el.setAttribute('rx', rx.toFixed(1));
        el.setAttribute('ry', ry.toFixed(1));
      }
      for (let i = 0; i < MAX_ISSUES; i++) {
        const line = lines.current[i];
        const mark = marks.current[i];
        const it = list[i];
        if (!line || !mark || !it) continue;
        let ax: number;
        let ay: number;
        if (it.anchor) [ax, ay] = px(it.anchor);
        else {
          const a = THREE.MathUtils.degToRad(60 - it.slot * 15);
          ax = cx + rx * Math.cos(a);
          ay = cy - ry * Math.sin(a);
        }
        const elbow = Math.min(it.x, Math.max(ax + 24, it.x - 56));
        line.setAttribute('points', `${it.x},${it.y} ${elbow.toFixed(1)},${it.y} ${ax.toFixed(1)},${ay.toFixed(1)}`);
        mark.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)})`);
        line.style.opacity = mark.style.opacity = sel ? '0' : '1';
      }
      const br = bracket.current;
      const bl = bLine.current;
      const co = callout.current;
      if (!br || !bl || !co) return;
      if (!sel) {
        br.style.opacity = bl.style.opacity = co.style.opacity = '0';
        return;
      }
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (let c = 0; c < 8; c++) {
        const [x, y] = px([sel.box[c & 1][0], sel.box[(c >> 1) & 1][1], sel.box[(c >> 2) & 1][2]]);
        x1 = Math.min(x1, x);
        x2 = Math.max(x2, x);
        y1 = Math.min(y1, y);
        y2 = Math.max(y2, y);
      }
      const pad = 12;
      x1 -= pad;
      x2 += pad;
      y1 = Math.max(12, y1 - pad);
      y2 = Math.min(free - 12, y2 + pad);
      const k = Math.min(22, (x2 - x1) / 3, (y2 - y1) / 3);
      br.setAttribute(
        'd',
        `M${x1} ${y1 + k}V${y1}H${x1 + k}M${x2 - k} ${y1}H${x2}V${y1 + k}M${x2} ${y2 - k}V${y2}H${x2 - k}M${x1 + k} ${y2}H${x1}V${y2 - k}`,
      );
      const my = clamp((y1 + y2) / 2, 40, free - 40);
      const lx = x2 + 72;
      bl.setAttribute('x1', String(x2));
      bl.setAttribute('x2', String(lx - 12));
      bl.setAttribute('y1', String(my));
      bl.setAttribute('y2', String(my));
      co.style.transform = `translate(${lx.toFixed(1)}px, ${my.toFixed(1)}px) translateY(-50%)`;
      br.style.opacity = bl.style.opacity = co.style.opacity = '1';
    };
  }, [api]);

  return (
    <>
      <svg className="dcb-halo" data-level={ring} aria-hidden="true">
        <defs>
          <radialGradient id="dcb-halo-fill">
            <stop offset="0.5" stopOpacity="0" />
            <stop offset="1" stopOpacity="0.3" />
          </radialGradient>
        </defs>
        <ellipse ref={halo} fill="url(#dcb-halo-fill)" />
      </svg>
      <svg className="dcb-overlay" aria-hidden="true">
        {Array.from({ length: MAX_ISSUES }, (_, i) => {
          const it = leaders[i];
          return (
            <g key={i} style={{ display: it ? undefined : 'none' }}>
              <polyline className="dcb-leader" ref={(el) => (lines.current[i] = el)} style={{ opacity: 0 }} />
              <g className="dcb-marker" ref={(el) => (marks.current[i] = el)} style={{ opacity: 0 }}>
                {it?.status === 'red' ? (
                  <rect x={-7} y={-7} width={14} height={14} fill="var(--dc-crit)" />
                ) : (
                  <path d="M0 -8.5 8.5 7H-8.5Z" fill="var(--dc-warn)" />
                )}
              </g>
            </g>
          );
        })}
        <path className="dcb-bracket" ref={bracket} style={{ opacity: 0 }} />
        <line className="dcb-bracket-line" ref={bLine} style={{ opacity: 0 }} />
      </svg>
      <div className="dcb-callout" ref={callout} style={{ opacity: 0 }}>
        <span className="dcb-callout-title">{selection?.title}</span>
        <span className="dcb-mono">{selection?.sub}</span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- page */

export default function DaylightClinicBody() {
  const { data, loadState, error } = useMissionData();
  const crew = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);
  const setRegion = useMissionStore((s) => s.setSelectedRegion);
  const reduced = useReducedMotion();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const [view, setView] = useState<ViewId>(() => VIEWS.find((v) => v.id === params.get('view'))?.id ?? 'front');
  const [atPeak, setAtPeak] = useState(params.get('date') === 'peak');
  const [ready, setReady] = useState(false);
  const [flip, setFlip] = useState<'a' | 'b'>('a');

  const [rootRef, root] = useBox<HTMLDivElement>();
  const [fieldRef, field] = useBox<HTMLDivElement>();
  const overlay = useRef<OverlayApi>({ frame: () => {} });

  // Deep link: ?crew=c2&metric=sleep_h&view=left&date=peak
  const linked = useRef(false);
  useEffect(() => {
    if (!data || linked.current) return;
    linked.current = true;
    const c = params.get('crew');
    if (c && data.crew.crew.some((m) => m.id === c)) setCrew(c);
    const m = params.get('metric') as MetricKey | null;
    if (m && m in data.crew.metrics) setMetric(m);
  }, [data, params, setCrew]);

  // The storm day in the file: this person's highest daily dose. A replay, not a view.
  const peakDate = useMemo(() => {
    if (!crew) return '';
    let best = crew.series[0];
    for (const row of crew.series) if ((row.dose_mSv_day ?? -1) > (best?.dose_mSv_day ?? -1)) best = row;
    return best?.date ?? '';
  }, [crew]);
  const date = !data || !crew ? '' : atPeak && peakDate ? peakDate : data.crew.mission.today;

  /** Decimals per metric, from how the file writes the series. */
  const places = useMemo(() => {
    const out = {} as Record<MetricKey, number>;
    if (!data || !crew) return out;
    for (const k of Object.keys(data.crew.metrics) as MetricKey[]) out[k] = decimalsOf(crew.series.map((r) => r[k]));
    return out;
  }, [data, crew]);

  const scored = useMemo(() => {
    if (!data || !crew || !environment || !date) return null;
    const { status, scores } = statusOn(crew, data.crew, date, environment);
    const by = new Map<MetricKey, MetricScore>(scores.map((s) => [s.metric, s]));
    return { status, scores, by, i: dayIndex(crew, date), ctx: contextFor(data.crew, environment) };
  }, [data, crew, environment, date]);

  const issues: Issue[] = useMemo(() => {
    if (!scored || !data) return [];
    return scored.scores
      .filter((s) => s.status !== 'green')
      .sort((a, b) => ORDER[b.status] - ORDER[a.status] || (b.score ?? 0) - (a.score ?? 0))
      .slice(0, MAX_ISSUES)
      .map((s) => {
        const region = data.crew.metrics[s.metric].body_region;
        return {
          key: s.metric,
          status: s.status,
          region,
          anchor: region === 'whole_body' ? null : focusPoint(s.metric),
          reading: withUnit(s.value.toFixed(places[s.metric] ?? 0), data.crew.metrics[s.metric].unit),
          side: s.z !== null ? `${s.z >= 0 ? '+' : '-'}${Math.abs(s.z).toFixed(1)} sd` : s.status === 'red' ? 'Over limit' : 'Above watch',
        };
      });
  }, [scored, data, places]);

  // Order for Prev / Next: whole body, then regions head to feet.
  const flat = useMemo(() => {
    if (!scored) return [] as MetricKey[];
    const order = [...REGIONS].sort((a, b) => {
      if (a === 'whole_body') return -1;
      if (b === 'whole_body') return 1;
      return BM.metrics[BM.contract_regions[b].metrics[0]].anchor[1] - BM.metrics[BM.contract_regions[a].metrics[0]].anchor[1];
    });
    return order.flatMap((r) => BM.contract_regions[r].metrics.filter((k) => scored.by.has(k)));
  }, [scored]);

  const worstIn = useCallback(
    (region: Region): MetricKey | null => {
      if (!scored) return null;
      const keys = BM.contract_regions[region].metrics.filter((k) => scored.by.has(k));
      keys.sort((a, b) => {
        const x = scored.by.get(a)!;
        const y = scored.by.get(b)!;
        return ORDER[y.status] - ORDER[x.status] || (y.score ?? 0) - (x.score ?? 0);
      });
      return keys[0] ?? null;
    },
    [scored],
  );

  const select = useCallback(
    (key: MetricKey | null) => {
      setMetric(key);
      setRegion(key ? BM.metrics[key].region : null);
    },
    [setRegion],
  );
  const pickRegion = useCallback(
    (region: Region) => {
      if (metric && BM.metrics[metric].region === region) return;
      select(worstIn(region));
    },
    [metric, select, worstIn],
  );
  const step = (dir: 1 | -1) => {
    if (!metric || !flat.length) return;
    const i = flat.indexOf(metric);
    select(flat[(i + dir + flat.length) % flat.length]);
  };

  const switchCrew = (id: string) => {
    if (id === crew?.id) return;
    setCrew(id);
    setMetric(null);
    setFlip((f) => (f === 'a' ? 'b' : 'a'));
  };

  const selected = metric && scored?.by.has(metric) ? metric : null;
  const selRegion = selected ? BM.metrics[selected].region : null;

  /* ---- body state: where the status sits */
  const bodyState: BodyState = useMemo(() => {
    const nodeStatus: Record<string, Status> = {};
    const focus: BodyState['focus'] = {};
    const hots: Hot[] = [];
    let skinStatus: Status = 'green';
    for (const it of issues) {
      const bm = BM.metrics[it.key];
      if (it.region === 'whole_body') {
        // Whole-body issues show as the ring around the figure; temperature also tints the skin.
        if (!DOSE_KEYS.includes(it.key)) skinStatus = worst(skinStatus, it.status);
        continue;
      }
      for (const n of bm.structures) nodeStatus[n] = worst(nodeStatus[n] ?? 'green', it.status);
      for (const [node, ranges] of Object.entries(focusRanges(it.key))) {
        if (!focus[node] || ORDER[it.status] > ORDER[focus[node].status]) focus[node] = { ranges, status: it.status };
      }
      // The diffusion is centred on the structure that is drawn, never beside it.
      if (hots.length < 4) hots.push({ pos: focusPoint(it.key), radius: hotRadius(it.key), status: it.status, lit: !selRegion });
    }
    let selectedNodes: string[] | null = null;
    if (selected) {
      selectedNodes = BM.metrics[selected].structures;
      const st = scored!.by.get(selected)!.status;
      for (const [node, ranges] of Object.entries(focusRanges(selected))) focus[node] = { ranges, status: st };
    }
    // The ghost skeleton opens in front of the selected structure.
    let hole: BodyState['hole'] = null;
    if (selected && selRegion !== 'whole_body') {
      const [lo, hi] = metricBox(selected);
      hole = { pos: focusPoint(selected), radius: clamp(0.6 * Math.max(hi[0] - lo[0], hi[1] - lo[1]), 0.07, 0.24) };
    }
    return { nodeStatus, focus, selectedNodes, skinStatus, hots, hole };
  }, [issues, selected, selRegion, scored]);

  const regionBoxes = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r, regionBox(r)])) as Record<Region, Box>, []);

  /* ---- layout: header | regions | body | issues, sheet above the bar */
  const barH = root.h - field.h;
  const sheetH = Math.max(380, Math.round(root.h * 0.36));
  const freeH = field.h - (selected ? sheetH : 0);
  const occlude = selected && field.h ? Math.min(0.6, sheetH / field.h) : 0;
  const cx = field.w / 2;
  const off = BODY_HALF_FRAC * field.h + 64;
  const regionW = clamp(cx - off - 12, 168, 300);
  // Zoomed in, the torso is wider than the home figure: the switch steps aside.
  const regionRight = cx - off - (selected ? clamp(cx - off - regionW - 12, 0, field.h * 0.12) : 0);
  const issuesX = cx + off;
  const issuesW = clamp(field.w - issuesX - 24, 168, 340);

  const az = VIEWS.find((v) => v.id === view)!.az;
  const selBox = useMemo(() => (selected ? metricBox(selected) : null), [selected]);
  const pose: Pose = useMemo(() => ({ box: selBox, azimuth: az, occlude }), [selBox, az, occlude]);

  const onFrame = useCallback((camera: THREE.Camera, w: number, h: number) => overlay.current.frame(camera, w, h), []);
  const onReady = useCallback(() => setReady(true), []);

  /* ---- one row per region: its lead value at its height */
  const regionRows: RegionRow[] = useMemo(() => {
    if (!scored || !data) return [];
    return REGIONS.map((region) => {
      // The flagged metric leads; otherwise the region's first metric in the body map.
      const w = worstIn(region);
      const first = BM.contract_regions[region].metrics.find((k) => scored.by.has(k));
      const k = w && scored.by.get(w)!.status !== 'green' ? w : (first ?? w)!;
      const fix = (key: MetricKey) => scored.by.get(key)!.value.toFixed(places[key] ?? 0);
      // Systolic over diastolic reads as one pressure.
      const pair = (k === 'bp_sys' || k === 'bp_dia') && scored.by.has('bp_sys') && scored.by.has('bp_dia');
      return {
        region,
        status: scored.status[region],
        m: region === 'whole_body' ? null : focusPoint(k)[1],
        text: pair ? `${fix('bp_sys')}/${fix('bp_dia')}` : fix(k),
        unit: data.crew.metrics[k].unit,
      };
    });
  }, [scored, data, worstIn, places]);

  /* ---- issue rows sit at the height of what they point at, so leaders run level */
  const leaders: Leader[] = useMemo(() => {
    const ys = stack(
      issues.map((it) => (it.anchor ? homeY(it.anchor[1], field.h) : null)),
      field.h,
    );
    let slot = 0;
    return issues.map((it, i) => ({ status: it.status, anchor: it.anchor, slot: it.anchor ? 0 : slot++, x: issuesX - 10, y: ys[i] }));
  }, [issues, field.h, issuesX]);

  /* ---- sheet content */
  const detail: Detail | null = useMemo(() => {
    if (!selected || !scored || !data || !crew) return null;
    const s = scored.by.get(selected)!;
    const m = data.crew.metrics[selected];
    const base = crew.baseline[selected];
    const from = Math.max(0, scored.i - 13);
    const trace = crew.series.slice(from, scored.i + 1).map((r) => r[selected]);
    const amber =
      selected === 'dose_mSv_day'
        ? DOSE_DAY_AMBER_FACTOR * scored.ctx.envDosePerDay
        : selected === 'dose_mSv_cum'
          ? DOSE_CUM_AMBER_FRACTION * scored.ctx.careerLimit_mSv
          : selected === 'bone_loss_pct'
            ? BONE_LOSS_AMBER_PCT
            : null;
    return {
      id: `${crew.id}:${selected}:${date}`,
      metric: selected,
      label: m.label,
      regionName: REGION_NAME[m.body_region],
      status: s.status,
      statusWord: DETAIL_WORD[s.status],
      value: s.value,
      unit: m.unit,
      decimals: places[selected] ?? decimalsOf(trace),
      direction: s.z !== null ? (s.z >= 0 ? 'Above' : 'Below') : s.status === 'red' ? 'Over limit' : 'Above watch level',
      delta: s.z !== null ? `${s.z >= 0 ? '+' : '-'}${Math.abs(s.z).toFixed(1)} sd` : '',
      days: daysRunning(crew, data.crew, selected, scored.i, scored.ctx),
      remeasure: canRemeasure(selected),
      band: base ? { mean: base.mean, sd: base.sd, windowMean: s.windowMean } : null,
      limit: !base && amber !== null ? { amber, red: m.absolute_red.max } : null,
      trace,
      explain: firstSentence(m.explain),
      action: s.status === 'green' ? null : m.actions[s.status],
    };
  }, [selected, scored, data, crew, date, places]);

  const selection = useMemo(
    () =>
      selected && selBox && data
        ? {
            box: selBox,
            title: REGION_NAME[BM.metrics[selected].region],
            sub: `${SHORT[selected]}${isIllustrative(selected) ? ' · placement illustrative' : ''}`,
          }
        : null,
    [selected, selBox, data],
  );

  const sibling = conceptIds.find((id) => id.startsWith('daylight-clinic') && id !== SELF);
  const sourceHref = sibling && selected ? `/concepts/${sibling}?metric=${selected}` : null;

  if (loadState === 'error') return <p style={{ padding: 32 }}>{error}</p>;
  if (!data || !crew || !environment || !scored) return <div className="dcb" />;

  const overall = scored.status.overall;
  const day = scored.i + 1;
  const peakDay = peakDate ? dayIndex(crew, peakDate) + 1 : null;
  const foot = [...DISCLAIMERS, `Space weather data: ${data.storm.meta.data_credit}`, `Model: ${data.storm.meta.model}`].join('  ·  ');
  const vars = { '--dcb-bar-h': `${barH}px`, '--dcb-sheet-h': `${sheetH}px` } as React.CSSProperties;

  return (
    <div className="dcb" ref={rootRef} style={vars}>
      <div className="dcb-stage">
        <div className="dcb-field" ref={fieldRef}>
          {!ready && <p className="dcb-mono dcb-loading">Loading anatomy</p>}
          <div className="dcb-canvas" data-flip={flip}>
            <Canvas flat dpr={[1, 2]} camera={{ fov: FOV, near: 0.1, far: 40, position: [0, 0.82, 4.3] }} gl={{ antialias: true, alpha: true }}>
              <Suspense fallback={null}>
                <PorcelainScene state={bodyState} pose={pose} regionBoxes={regionBoxes} reduced={reduced} onPick={pickRegion} onFrame={onFrame} onReady={onReady} />
              </Suspense>
            </Canvas>
          </div>

          <Overlay api={overlay} leaders={leaders} ring={scored.status.whole_body} selection={selection} freeH={freeH} />

          <Regions rows={regionRows} stageH={field.h} freeH={freeH} right={regionRight} width={regionW} selected={selRegion} onPick={pickRegion} />

          <aside className="dcb-issues" data-off={selected !== null} aria-label="Issues" aria-hidden={selected !== null}>
            {issues.length === 0 && field.h > 0 && (
              <div className="dcb-issue dcb-issue-none" style={{ left: issuesX, width: issuesW, transform: `translateY(${ROW_TOP - 36}px)` }}>
                <Shape status="green" size={20} />
                <span className="dcb-issue-main">
                  <span className="dcb-issue-word">Clear</span>
                  <span className="dcb-mono">All regions</span>
                </span>
              </div>
            )}
            {field.h > 0 &&
              issues.map((it, i) => (
                <button
                  key={it.key}
                  type="button"
                  className="dcb-issue"
                  data-compact={issuesW < 280}
                  style={{ left: issuesX, width: issuesW, transform: `translateY(${(leaders[i].y - 36).toFixed(1)}px)` }}
                  tabIndex={selected ? -1 : 0}
                  onClick={() => select(it.key)}
                >
                  <Shape status={it.status} size={20} />
                  <span className="dcb-issue-main">
                    <span className="dcb-issue-word">{SHORT[it.key]}</span>
                    <span className="dcb-mono">{it.side}</span>
                  </span>
                  <span className="dcb-issue-val">{it.reading}</span>
                </button>
              ))}
          </aside>
        </div>

        <header className="dcb-id">
          <div className="dcb-crew" role="group" aria-label="Crew">
            {data.crew.crew.map((c) => {
              const st = statusOn(c, data.crew, date, environment).status.overall;
              return (
                <button
                  key={c.id}
                  type="button"
                  className="dcb-crew-sq"
                  aria-pressed={c.id === crew.id}
                  aria-label={`${c.name}, ${STATUS_WORD[st]}`}
                  onClick={() => switchCrew(c.id)}
                >
                  {initials(c.name)}
                  <Shape status={st} size={12} />
                </button>
              );
            })}
          </div>
          <p className="dcb-name">{crew.name}</p>
          <p className="dcb-mono dcb-role">{crew.role}</p>
          <p className="dcb-overall" aria-live="polite">
            <Shape status={overall} size={44} />
            {STATUS_WORD[overall]}
          </p>
          <p className="dcb-mono dcb-meta">
            <span>
              Day {day} · {data.crew.environments[environment].label}
            </span>
            <span>{date}</span>
            {atPeak && <span className="dcb-replay">Replay day, not today</span>}
          </p>
        </header>
      </div>

      <div className="dcb-bar">
        <div className="dcb-bar-group" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className="dcb-view" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              <span className="dcb-mono">{v.label}</span>
            </button>
          ))}
        </div>
        {peakDay !== null && (
          <>
            <span className="dcb-bar-sep" />
            <div className="dcb-bar-group" role="group" aria-label="Day shown">
              <button type="button" className="dcb-view" data-wide="true" aria-pressed={!atPeak} onClick={() => setAtPeak(false)}>
                <span className="dcb-mono">Today</span>
              </button>
              <button type="button" className="dcb-view" data-wide="true" aria-pressed={atPeak} onClick={() => setAtPeak(true)}>
                <span className="dcb-mono">Dose peak</span>
              </button>
            </div>
          </>
        )}
        <p className="dcb-foot">
          <span>{foot}</span>
          <span>{ANATOMY_CREDIT}</span>
        </p>
      </div>

      <Sheet detail={detail} onClose={() => select(null)} onPrev={() => step(-1)} onNext={() => step(1)} sourceHref={sourceHref} />
    </div>
  );
}
