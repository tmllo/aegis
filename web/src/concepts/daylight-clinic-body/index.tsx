// Daylight Clinic: body surface. A porcelain body on bone-white; status sits inside
// the body where it occurs, a height ruler says "where" without the body, and one
// bottom sheet holds the value against the person's own baseline.
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
  DETAIL_WORD,
  FOV,
  ORDER,
  REGION_NAME,
  SHORT,
  STATUS_WORD,
  daysRunning,
  decimalsOf,
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
/** Bottom sheet height, px (mirrored in daylight.css). */
const SHEET_H = 312;
/** Whole-body issues point at the figure as a whole: just above the head, no point marker. */
const WHOLE_ANCHOR: Vec3 = [0, BODY_H + 0.03, 0];

interface Issue {
  key: MetricKey;
  status: Status;
  region: Region;
  anchor: Vec3;
  /** "126 mmHg" */
  reading: string;
  /** "above", "below", "over limit" */
  side: string;
}

interface VitalCell {
  key: MetricKey;
  text: string;
  unit: string;
  status: Status;
}
interface VitalRow {
  region: Region;
  status: Status;
  cells: VitalCell[];
}

const withUnit = (text: string, unit: string): string => `${text}${unit.startsWith('/') ? '' : ' '}${unit}`;

const firstSentence = (s: string): string => {
  const i = s.indexOf('. ');
  return i < 0 ? s : s.slice(0, i + 1);
};

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

function useBox<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }, React.MutableRefObject<T | null>] {
  // Callback ref: the element mounts only after the data has loaded.
  const [el, setEl] = useState<T | null>(null);
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const attach = useCallback((node: T | null) => {
    ref.current = node;
    setEl(node);
  }, []);
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, [el]);
  return [attach, box, ref];
}

/* ------------------------------------------------------------------ ruler */

interface Tick {
  region: Region;
  status: Status;
  /** Body height in metres; null for the whole body (the cap above the ruler). */
  m: number | null;
}

function Ruler({ ticks, stageH, freeH, selected, onPick }: { ticks: Tick[]; stageH: number; freeH: number; selected: Region | null; onPick: (r: Region) => void }) {
  const top = homeY(BODY_H, stageH);
  const floor = homeY(0, stageH);
  const focused = selected !== null;
  const minor: number[] = [];
  for (let cm = 0; cm < BODY_H * 100; cm += 10) minor.push(cm);

  // One fixed height per region. Label, shape and tick share one row, so they cannot drift apart.
  // While a sheet is open the ticks close up into the free height and act as a region switch.
  const placed = useMemo(() => {
    const rows = ticks.map((t) => ({ ...t, y: t.m === null ? Math.max(top - 52, 40) : homeY(t.m, stageH) })).sort((a, b) => a.y - b.y);
    if (focused && rows.length > 1) {
      const y0 = rows[0].y;
      const y1 = rows[rows.length - 1].y;
      const lim = freeH - 48;
      if (y1 > lim) for (const r of rows) r.y = y0 + ((r.y - y0) * (lim - y0)) / (y1 - y0);
    }
    return rows.map((r, i) => {
      const gap = Math.min(i > 0 ? r.y - rows[i - 1].y : Infinity, i < rows.length - 1 ? rows[i + 1].y - r.y : Infinity);
      return { ...r, h: Math.max(44, Math.min(72, gap)) };
    });
  }, [ticks, stageH, top, focused, freeH]);
  const sel = placed.find((t) => t.region === selected);

  if (stageH === 0) return null;
  return (
    <div className="dcb-ruler">
      <span className="dcb-ruler-scale" data-off={focused}>
        <span className="dcb-ruler-line" style={{ top, height: floor - top }} />
        {minor.map((cm) => (
          <span key={cm} className="dcb-ruler-minor" data-major={cm % 50 === 0} style={{ top: homeY(cm / 100, stageH) }} />
        ))}
        <span className="dcb-ruler-minor" data-major="true" style={{ top }} />
        <span className="dcb-mono dcb-ruler-num" style={{ top }}>
          {Math.round(BODY_H * 100)} cm
        </span>
      </span>
      {placed.map((t) => (
        <button
          key={t.region}
          type="button"
          className="dcb-tick"
          style={{ height: t.h, transform: `translateY(${(t.y - t.h / 2).toFixed(1)}px)` }}
          aria-pressed={selected === t.region}
          aria-label={`${REGION_NAME[t.region]}, ${STATUS_WORD[t.status]}`}
          onClick={() => onPick(t.region)}
        >
          <span className="dcb-mono dcb-tick-name">{REGION_NAME[t.region]}</span>
          <Shape status={t.status} size={14} />
          <span className="dcb-tick-mark" data-cap={t.m === null} />
        </button>
      ))}
      <span className="dcb-ruler-marker" data-on={sel !== undefined} style={{ transform: `translateY(${sel ? sel.y : top}px)` }} />
    </div>
  );
}

/* ---------------------------------------------------------------- overlay */

interface OverlayApi {
  frame: (camera: THREE.Camera, w: number, h: number) => void;
}

interface OverlayProps {
  api: React.MutableRefObject<OverlayApi>;
  issues: Issue[];
  /** The issues list; rows are found by [data-issue] so a re-keyed list can never leave a stale ref. */
  listEl: React.MutableRefObject<HTMLElement | null>;
  stageEl: React.MutableRefObject<HTMLDivElement | null>;
  selection: { box: Box; title: string; sub: string } | null;
  /** Height of the stage left free above the sheet, px. */
  freeH: number;
}

/** Leader lines and the selection bracket: one SVG, written through refs each frame. */
function Overlay({ api, issues, listEl, stageEl, selection, freeH }: OverlayProps) {
  const lines = useRef<(SVGPolylineElement | null)[]>([]);
  const marks = useRef<(SVGGElement | null)[]>([]);
  const bracket = useRef<SVGPathElement>(null);
  const bLine = useRef<SVGLineElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  const rows = useRef<({ x: number; y: number } | null)[]>([]);
  const dirty = useRef(true);
  const live = useRef({ issues, selection, freeH });
  live.current = { issues, selection, freeH };

  // Rows are measured inside the frame loop, after React has committed the new list,
  // and again whenever the list or the stage changes size.
  useLayoutEffect(() => {
    dirty.current = true;
    rows.current = [];
  }, [issues]);
  useEffect(() => {
    const mark = () => (dirty.current = true);
    const ro = new ResizeObserver(mark);
    if (listEl.current) ro.observe(listEl.current);
    if (stageEl.current) ro.observe(stageEl.current);
    window.addEventListener('resize', mark);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', mark);
    };
  }, [listEl, stageEl]);

  const measure = useCallback(() => {
    const stage = stageEl.current?.getBoundingClientRect();
    const list = listEl.current;
    if (!stage || !list) return;
    const els = list.querySelectorAll<HTMLElement>('[data-issue]');
    rows.current = live.current.issues.map((it, i) => {
      const el = els[i];
      if (!el || el.dataset.issue !== it.key) return null;
      const r = el.getBoundingClientRect();
      return r.height > 0 ? { x: r.left - stage.left - 12, y: r.top - stage.top + r.height / 2 } : null;
    });
    dirty.current = rows.current.some((r) => r === null);
  }, [listEl, stageEl]);

  useEffect(() => {
    const v = new THREE.Vector3();
    api.current.frame = (camera, w, h) => {
      const { issues: list, selection: sel, freeH: free } = live.current;
      if (dirty.current) measure();
      const px = (p: Vec3): [number, number] => {
        v.set(p[0], p[1], p[2]).project(camera);
        return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
      };
      for (let i = 0; i < MAX_ISSUES; i++) {
        const line = lines.current[i];
        const mark = marks.current[i];
        const it = list[i];
        const row = rows.current[i];
        if (!line || !mark) continue;
        if (!it || !row) {
          // Unmeasured row: no line at all, never a line to the corner of the screen.
          line.style.opacity = mark.style.opacity = '0';
          continue;
        }
        const [ax, ay] = px(it.anchor);
        const elbow = Math.max(ax + 24, row.x - 56);
        line.setAttribute('points', `${row.x},${row.y} ${elbow},${row.y} ${ax},${ay}`);
        mark.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)})`);
        const show = sel ? '0' : '1';
        line.style.opacity = show;
        mark.style.opacity = show;
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
      // The callout line leaves from the bracket's top-right corner, so it always touches ink.
      const my = Math.min(Math.max(y1, 30), free - 40);
      const lx = x2 + 72;
      bl.setAttribute('x1', String(x2));
      bl.setAttribute('x2', String(lx - 12));
      bl.setAttribute('y1', String(my));
      bl.setAttribute('y2', String(my));
      co.style.transform = `translate(${lx.toFixed(1)}px, ${my.toFixed(1)}px) translateY(-50%)`;
      br.style.opacity = bl.style.opacity = co.style.opacity = '1';
    };
  }, [api, measure]);

  return (
    <>
      <svg className="dcb-overlay" aria-hidden="true">
        {Array.from({ length: MAX_ISSUES }, (_, i) => {
          const it = issues[i];
          return (
            <g key={i} style={{ display: it ? undefined : 'none' }}>
              <polyline className="dcb-leader" ref={(el) => (lines.current[i] = el)} />
              <g className="dcb-marker" ref={(el) => (marks.current[i] = el)}>
                {it?.region === 'whole_body' ? (
                  <circle r={5} style={{ fill: 'var(--dc-bone-0)', stroke: 'var(--dc-ink-1)', strokeWidth: 1.5 }} />
                ) : it?.status === 'red' ? (
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
  const [stageRef, stage, stageEl] = useBox<HTMLDivElement>();
  const listEl = useRef<HTMLElement | null>(null);
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
          anchor: region === 'whole_body' ? WHOLE_ANCHOR : BM.metrics[s.metric].anchor,
          reading: withUnit(s.value.toFixed(places[s.metric] ?? 0), data.crew.metrics[s.metric].unit),
          side: s.z !== null ? (s.z >= 0 ? 'above' : 'below') : 'over limit',
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

  /* ---- body state: where the tint sits */
  const bodyState: BodyState = useMemo(() => {
    const nodeStatus: Record<string, Status> = {};
    const focus: BodyState['focus'] = {};
    const hots: Hot[] = [];
    let skinStatus: Status = 'green';
    for (const it of issues) {
      const bm = BM.metrics[it.key];
      if (it.region === 'whole_body') {
        // Dose shows as the halo behind the figure; temperature tints the skin itself.
        if (!DOSE_KEYS.includes(it.key)) skinStatus = worst(skinStatus, it.status);
        continue;
      }
      for (const n of bm.structures) nodeStatus[n] = worst(nodeStatus[n] ?? 'green', it.status);
      for (const [node, ranges] of Object.entries(focusRanges(it.key))) {
        if (!focus[node] || ORDER[it.status] > ORDER[focus[node].status]) focus[node] = { ranges, status: it.status };
      }
      if (hots.length < 4) hots.push({ pos: bm.anchor, radius: hotRadius(it.key), status: it.status, lit: !selRegion || selRegion === it.region });
    }
    let selectedNodes: string[] | null = null;
    if (selected) {
      selectedNodes = BM.metrics[selected].structures;
      const st = scored!.by.get(selected)!.status;
      for (const [node, ranges] of Object.entries(focusRanges(selected))) focus[node] = { ranges, status: st };
    }
    let hole: BodyState['hole'] = null;
    if (selected && selRegion !== 'whole_body') {
      const [a, b] = metricBox(selected);
      hole = {
        pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        radius: Math.min(0.24, Math.max(0.07, 0.6 * Math.max(b[0] - a[0], b[1] - a[1]))),
      };
    }
    return { nodeStatus, focus, selectedNodes, skinStatus, hots, hole };
  }, [issues, selected, selRegion, scored]);

  const haloLevel: Status = useMemo(
    () => issues.filter((i) => DOSE_KEYS.includes(i.key)).reduce<Status>((acc, i) => worst(acc, i.status), 'green'),
    [issues],
  );

  const regionBoxes = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r, regionBox(r)])) as Record<Region, Box>, []);

  /* ---- camera */
  const occlude = selected && stage.h ? Math.min(0.6, SHEET_H / stage.h) : 0;
  const freeH = stage.h - (selected ? SHEET_H : 0);
  const az = VIEWS.find((v) => v.id === view)!.az;
  const selBox = useMemo(() => (selected ? metricBox(selected) : null), [selected]);
  const pose: Pose = useMemo(() => ({ box: selBox, azimuth: az, occlude }), [selBox, az, occlude]);

  const onFrame = useCallback((camera: THREE.Camera, w: number, h: number) => overlay.current.frame(camera, w, h), []);
  const onReady = useCallback(() => setReady(true), []);

  /* ---- ruler ticks */
  const ticks: Tick[] = useMemo(() => {
    if (!scored) return [];
    // One fixed height per region (its first metric in the body map), the same for every crew member.
    return REGIONS.map((region) => ({
      region,
      status: scored.status[region],
      m: region === 'whole_body' ? null : BM.metrics[BM.contract_regions[region].metrics[0]].anchor[1],
    }));
  }, [scored]);

  /* ---- latest vitals, one row per region */
  const vitals: VitalRow[] = useMemo(() => {
    if (!scored || !data) return [];
    const regions = [...new Set(flat.map((k) => BM.metrics[k].region))];
    return regions.map((region) => {
      const cells: VitalCell[] = [];
      for (const k of BM.contract_regions[region].metrics) {
        const s = scored.by.get(k);
        if (!s) continue;
        const unit = data.crew.metrics[k].unit;
        const text = s.value.toFixed(places[k] ?? 0);
        const prev = cells[cells.length - 1];
        // Systolic over diastolic reads as one pressure.
        if (k === 'bp_dia' && prev?.key === 'bp_sys' && prev.unit === unit) {
          prev.text = `${prev.text}/${text}`;
          prev.status = worst(prev.status, s.status);
        } else cells.push({ key: k, text, unit, status: s.status });
      }
      return { region, status: scored.status[region], cells };
    });
  }, [scored, data, flat, places]);

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
    const inBand = s.z !== null && s.status === 'green' && Math.abs(s.z) < 1;
    const direction = inBand ? 'Within band' : s.z !== null ? (s.z >= 0 ? 'Above' : 'Below') : s.status === 'green' ? 'Under limit' : 'Over limit';
    return {
      id: `${crew.id}:${selected}:${date}`,
      metric: selected,
      label: m.label,
      short: SHORT[selected],
      regionName: REGION_NAME[m.body_region],
      status: s.status,
      statusWord: DETAIL_WORD[s.status],
      value: s.value,
      unit: m.unit,
      decimals: places[selected] ?? decimalsOf(trace),
      direction,
      delta: s.z !== null && !inBand ? `${s.z >= 0 ? '+' : '-'}${Math.abs(s.z).toFixed(1)} sd` : '',
      days: daysRunning(crew, data.crew, selected, scored.i, scored.ctx),
      band: base ? { mean: base.mean, sd: base.sd, windowMean: s.windowMean } : null,
      limit: !base && amber !== null ? { amber, red: m.absolute_red.max } : null,
      trace,
      explain: firstSentence(m.explain),
      action: s.status === 'green' ? null : m.actions[s.status],
      illustrative: isIllustrative(selected),
    };
  }, [selected, scored, data, crew, date, places]);

  const selection = useMemo(
    () =>
      selected && selBox && data
        ? {
            box: selBox,
            title: REGION_NAME[BM.metrics[selected].region],
            sub: `${SHORT[selected]}${isIllustrative(selected) ? ' · illustrative' : ''}`,
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
  const foot = [...DISCLAIMERS, `Space weather data: ${data.storm.meta.data_credit}`].join('  ·  ');

  return (
    <div className="dcb" ref={rootRef}>
      <div className="dcb-stage" ref={stageRef}>
        <div className="dcb-halo" data-level={haloLevel} />
        {!ready && <p className="dcb-mono dcb-loading">Loading anatomy</p>}
        <div className="dcb-canvas" data-flip={flip}>
          <Canvas flat dpr={[1, 2]} camera={{ fov: FOV, near: 0.1, far: 40, position: [0, 0.82, 4.3] }} gl={{ antialias: true, alpha: true }}>
            <Suspense fallback={null}>
              <PorcelainScene
                state={bodyState}
                pose={pose}
                regionBoxes={regionBoxes}
                scanKey={crew.id}
                reduced={reduced}
                onPick={pickRegion}
                onFrame={onFrame}
                onReady={onReady}
              />
            </Suspense>
          </Canvas>
        </div>

        <Overlay api={overlay} issues={issues} listEl={listEl} stageEl={stageEl} selection={selection} freeH={freeH} />

        <Ruler ticks={ticks} stageH={stage.h} freeH={freeH} selected={selRegion} onPick={pickRegion} />

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
            Day {day} · {data.crew.environments[environment].label} · {date}
          </p>
          {atPeak && <p className="dcb-mono dcb-replay">Replay day · not today</p>}

          <div className="dcb-vitals" role="group" aria-label="Latest vitals">
            {vitals.map((row) => (
              <button
                key={row.region}
                type="button"
                className="dcb-vital"
                aria-pressed={selRegion === row.region}
                onClick={() => pickRegion(row.region)}
              >
                <Shape status={row.status} size={14} />
                <span className="dcb-mono dcb-vital-name">{REGION_NAME[row.region]}</span>
                <span className="dcb-vital-cells">
                  {row.cells.map((c) => (
                    <span key={c.key} className="dcb-vital-cell" data-status={c.status}>
                      {c.text}
                      <i>{c.unit}</i>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </header>

        <aside className="dcb-issues" aria-label="Issues" ref={listEl}>
          <p className="dcb-mono dcb-issues-head">
            <span>Issues</span>
            <span>{issues.length}</span>
          </p>
          {issues.length === 0 && (
            <div className="dcb-issue dcb-issue-none">
              <Shape status="green" size={20} />
              <span className="dcb-issue-main">
                <span className="dcb-issue-word">Clear</span>
                <span className="dcb-mono">All regions in range</span>
              </span>
            </div>
          )}
          {issues.map((it) => (
            <button key={it.key} type="button" className="dcb-issue" data-issue={it.key} aria-pressed={selected === it.key} onClick={() => select(it.key)}>
              <Shape status={it.status} size={20} />
              <span className="dcb-issue-main">
                <span className="dcb-issue-word">{SHORT[it.key]}</span>
                <span className="dcb-mono">
                  {REGION_NAME[it.region]} · {it.side}
                </span>
              </span>
              <span className="dcb-issue-val">{it.reading}</span>
            </button>
          ))}
        </aside>
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
                <span className="dcb-mono">Day {peakDay} peak</span>
              </button>
            </div>
          </>
        )}
        <p className="dcb-foot">
          <span>{foot}</span>
          <span className="dcb-foot-credit">
            Model: {data.storm.meta.model} · {ANATOMY_CREDIT}
          </span>
        </p>
      </div>

      <Sheet detail={detail} onClose={() => select(null)} onPrev={() => step(-1)} onNext={() => step(1)} sourceHref={sourceHref} />
    </div>
  );
}
