// Flight Record, chapter 04: small drawn parts. The body figure is the e^x kit
// model (aegis-body.glb) seen from the front and printed as six plates, one per
// layer, so a region can take its status colour without WebGL.
// Anatomy: BodyParts3D 4.0 (c) Database Center for Life Science, CC BY 4.0, via human-atlas (MIT).
import { Component, type CSSProperties, type ReactNode } from 'react';
import type { Region, RegionStatus, Status } from '../../data/types';
import { REGIONS } from '../../data/types';
import { DASH, type NodeStatus } from './model';
import shellUrl from './body/shell.png';
import bonesUrl from './body/bones.png';
import loadUrl from './body/load.png';
import bloodUrl from './body/blood.png';
import heartUrl from './body/heart.png';
import brainUrl from './body/brain.png';

export const TONE: Record<Status, string> = { green: 'var(--c-ok)', amber: 'var(--c-warn)', red: 'var(--c-crit)' };
export const STATUS_LABEL: Record<Status, string> = { green: 'In range', amber: 'Watch', red: 'Act now' };
export const REGION_NAME: Record<Region, string> = {
  brain: 'Brain',
  heart: 'Heart',
  blood: 'Blood',
  bones: 'Bones',
  whole_body: 'Whole body',
};

/** Status shape: dot, triangle, square. Colour is never the only signal. */
export function Shape({ status, size = 12 }: { status: Status; size?: number }) {
  const c = TONE[status];
  return (
    <svg className="fr-shape" width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      {status === 'green' && <circle cx="5" cy="5" r="4" fill={c} />}
      {status === 'amber' && <path d="M5 0.8 9.6 9.2H0.4Z" fill={c} />}
      {status === 'red' && <rect x="1" y="1" width="8" height="8" fill={c} />}
    </svg>
  );
}

export function Swatch({ status, w = 28 }: { status: NodeStatus; w?: number }) {
  const dim = status === 'planned' || status === 'offline-sample';
  return (
    <svg className="fr-swatch" width={w} height="8" aria-hidden>
      <line x1="0" y1="4" x2={w} y2="4" stroke={dim ? 'var(--paper-2)' : 'var(--paper)'} strokeWidth="1.5" strokeDasharray={DASH[status]} />
    </svg>
  );
}

/* ----------------------------------------------------------------------- body */

// Plate geometry, measured on the printed plates (366 x 914 px, front view).
const PLATE = { w: 366, h: 914 };
const LAYER: { id: string; url: string; region: Region | null }[] = [
  { id: 'shell', url: shellUrl, region: 'whole_body' },
  { id: 'bones', url: bonesUrl, region: null },
  { id: 'load', url: loadUrl, region: 'bones' },
  { id: 'blood', url: bloodUrl, region: 'blood' },
  { id: 'heart', url: heartUrl, region: 'heart' },
  { id: 'brain', url: brainUrl, region: 'brain' },
];
/** Where each region's leader lands on the plate, as fractions of width and height. */
const ANCHOR: Record<Region, [number, number]> = {
  brain: [0.43, 0.066],
  heart: [0.47, 0.246],
  blood: [0.46, 0.4],
  bones: [0.33, 0.6],
  whole_body: [0.3, 0.86],
};
/** Tap zones on the figure, top to bottom, as fractions of height. Larger than the organ drawn. */
const ZONE: [Region, number, number][] = [
  ['brain', 0, 0.15],
  ['heart', 0.15, 0.32],
  ['blood', 0.32, 0.52],
  ['bones', 0.52, 1],
];

const plate = (url: string): CSSProperties => ({ WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` });

/** The figure alone: every region in its own status, the followed one lit. */
export function Figure({ regions, lit, litStatus }: { regions: RegionStatus; lit: Region | null; litStatus: Status }) {
  return (
    <div className="fr-figure" aria-hidden>
      {LAYER.map((l) => {
        const on = l.region !== null && l.region === lit;
        const st: Status = on ? litStatus : l.region ? regions[l.region] : 'green';
        return (
          <i
            key={l.id}
            data-layer={l.id}
            data-on={on}
            data-status={l.region ? st : undefined}
            style={{ ...plate(l.url), ...(st !== 'green' ? { backgroundColor: TONE[st] } : null) }}
          />
        );
      })}
    </div>
  );
}

interface BodyProps {
  regions: RegionStatus;
  lit: Region | null;
  litStatus: Status;
  onPick: (r: Region) => void;
}

/** Body with a region list: the list rows and the figure zones are the same five targets. */
export function Body({ regions, lit, litStatus, onPick }: BodyProps) {
  const statusOf = (r: Region): Status => (r === lit ? litStatus : regions[r]);
  return (
    <div className="fr-body">
      <div className="fr-regions">
        {REGIONS.map((r) => (
          <button key={r} aria-pressed={r === lit} onClick={() => onPick(r)}>
            <Shape status={statusOf(r)} />
            <span>
              <b>{REGION_NAME[r]}</b>
              <em>{STATUS_LABEL[statusOf(r)]}</em>
            </span>
          </button>
        ))}
      </div>
      <div className="fr-plate" style={{ aspectRatio: `${PLATE.w} / ${PLATE.h}` }}>
        <Figure regions={regions} lit={lit} litStatus={litStatus} />
        <svg className="fr-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {REGIONS.map((r, i) => {
            const [ax, ay] = ANCHOR[r];
            const y = ((i + 0.5) / REGIONS.length) * 100;
            const on = r === lit;
            return (
              <polyline
                key={r}
                points={`-60,${y} -8,${y} ${ax * 100},${ay * 100}`}
                fill="none"
                vectorEffect="non-scaling-stroke"
                stroke={on ? TONE[litStatus] : 'var(--rule)'}
                strokeWidth={on ? 1.5 : 1}
              />
            );
          })}
        </svg>
        {lit && (
          <span
            className="fr-pin"
            data-status={litStatus}
            style={{ left: `${ANCHOR[lit][0] * 100}%`, top: `${ANCHOR[lit][1] * 100}%`, color: TONE[litStatus] }}
          />
        )}
        {ZONE.map(([r, a, b]) => (
          <button
            key={r}
            className="fr-zone"
            aria-label={`${REGION_NAME[r]}: ${STATUS_LABEL[statusOf(r)]}`}
            style={{ top: `${a * 100}%`, height: `${(b - a) * 100}%` }}
            onClick={() => onPick(r)}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- strip */

export interface StripPoint {
  v: number | null;
  status: Status;
}
interface StripProps {
  points: StripPoint[];
  /** Shaded band the value is read against (own baseline), if the metric has one. */
  band: [number, number] | null;
  /** Labelled horizontal lines (model thresholds). */
  lines?: { v: number; label: string }[];
  status: Status;
}

/** The followed reading over its last days, on the person's own band. */
export function Strip({ points, band, lines = [], status }: StripProps) {
  const W = 320;
  const H = 84;
  const vals = points.map((p) => p.v).filter((v): v is number => v !== null);
  if (!vals.length) return <svg className="fr-strip" viewBox={`0 0 ${W} ${H}`} />;
  const all = [...vals, ...(band ?? []), ...lines.map((l) => l.v)];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.14;
  lo -= pad;
  hi += pad;
  const x = (i: number) => 6 + (i / Math.max(1, points.length - 1)) * (W - 12);
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const d = points
    .map((p, i) => (p.v === null ? null : `${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`))
    .reduce<string>((acc, pt, i, arr) => (pt ? `${acc}${acc && arr[i - 1] ? 'L' : 'M'}${pt} ` : acc), '');
  const last = points.length - 1;
  return (
    <svg className="fr-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Last readings on own baseline">
      {band && <rect x="0" y={y(band[1])} width={W} height={Math.max(1, y(band[0]) - y(band[1]))} fill="var(--band)" />}
      {band && <line x1="0" x2={W} y1={y((band[0] + band[1]) / 2)} y2={y((band[0] + band[1]) / 2)} stroke="var(--rule)" />}
      {lines.map((l) => (
        <g key={l.label}>
          <line x1="0" x2={W} y1={y(l.v)} y2={y(l.v)} stroke="var(--paper-2)" strokeDasharray="2 4" />
          <text x={W} y={y(l.v) - 5} textAnchor="end">
            {l.label}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--paper)" strokeWidth="1.5" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.v !== null && p.status !== 'green' && i !== last ? <circle key={i} cx={x(i)} cy={y(p.v)} r="3" fill={TONE[p.status]} /> : null,
      )}
      {points[last]?.v != null && (
        <circle cx={x(last)} cy={y(points[last].v as number)} r="5" fill={status === 'green' ? 'var(--paper)' : TONE[status]} stroke="var(--ink-0)" strokeWidth="2" />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------- error boundary */

/** A bad state shows a message and a way back, never a blank screen. */
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fr fr-fail">
        <div>
          <p className="fr-label">Flight Record</p>
          <h1>This view could not be drawn.</h1>
          <p>{this.state.error.message}</p>
          <a href={typeof window === 'undefined' ? '.' : window.location.pathname}>Reset view</a>
        </div>
      </div>
    );
  }
}
