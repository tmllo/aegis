// Small drawing parts: line icons per node kind, status shapes, line-style swatch.
import type { Status } from '../../data/types';
import type { LKind, LStatus } from './graph';

/** 20 px line icon centred on 0,0. Stroke comes from the parent (currentColor). */
export function KindIcon({ kind }: { kind: LKind }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (kind) {
    case 'device':
      return (
        <g {...p}>
          <rect x={-6} y={-8} width={12} height={16} rx={3} />
          <path d="M-4 0h2l1.5-3 2 6 1.5-3h1" />
        </g>
      );
    case 'dataset':
      return (
        <g {...p}>
          <ellipse cx={0} cy={-5.5} rx={7} ry={2.8} />
          <path d="M-7 -5.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11M-7 0c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
        </g>
      );
    case 'api':
      return (
        <g {...p}>
          <circle r={8} />
          <path d="M-8 0h16M0 -8c3 2.4 3 13.6 0 16M0 -8c-3 2.4-3 13.6 0 16" />
        </g>
      );
    case 'model':
      return (
        <g {...p}>
          <path d="M-8 7h16M-8 7v-14" />
          <path d="M-6 4c4 0 4-9 8-9 2 0 3 1 4 2" />
        </g>
      );
    case 'core':
      return (
        <g {...p}>
          <path d="M0 -8.5l7.4 4.25v8.5L0 8.5l-7.4-4.25v-8.5z" />
          <circle r={2.2} />
        </g>
      );
    case 'surface':
      return (
        <g {...p}>
          <rect x={-8.5} y={-6.5} width={17} height={11.5} rx={1.5} />
          <path d="M-4 8.5h8" />
        </g>
      );
    case 'person':
      return (
        <g {...p}>
          <circle cy={-4} r={3.4} />
          <path d="M-7 8c0-4 3.1-6 7-6s7 2 7 6" />
        </g>
      );
  }
}

/** Status shape: dot = ok, triangle = watch, square = act. Never colour alone. */
export function StatusShape({ status, size = 12 }: { status: Status; size?: number }) {
  const h = size / 2;
  return (
    <svg width={size} height={size} viewBox={`${-h} ${-h} ${size} ${size}`} className={`dca-shape dca-${status}`} aria-hidden>
      {status === 'green' && <circle r={h - 1} />}
      {status === 'amber' && <path d={`M0 ${-h + 0.5}L${h - 0.5} ${h - 1}H${-h + 0.5}z`} />}
      {status === 'red' && <rect x={-h + 1} y={-h + 1} width={size - 2} height={size - 2} />}
    </svg>
  );
}

export const STATUS_WORD: Record<LStatus, string> = {
  live: 'Live',
  simulated: 'Simulated',
  planned: 'Planned',
  'offline-sample': 'Offline sample',
};
export const CREW_WORD: Record<Status, string> = { green: 'Normal', amber: 'Watch', red: 'Act' };

/** The node outline style, drawn as a short line. Offline sample is a hollow double line, planned is dotted. */
export function LineSwatch({ status }: { status: LStatus }) {
  return (
    <svg width={28} height={10} viewBox="0 0 28 10" aria-hidden style={{ flex: 'none' }}>
      {status === 'offline-sample' ? (
        <>
          <line x1={1} y1={2.5} x2={27} y2={2.5} className="dca-stroke dca-st-offline-sample" />
          <line x1={1} y1={7.5} x2={27} y2={7.5} className="dca-stroke dca-st-offline-sample" />
        </>
      ) : (
        <line x1={1} y1={5} x2={27} y2={5} className={`dca-stroke dca-st-${status}`} />
      )}
    </svg>
  );
}

/** Six words or fewer per node kind, for the sheet. */
export const KIND_WHAT: Record<LKind, string> = {
  api: 'Outside data feed',
  core: 'Step inside the app',
  dataset: 'Data file',
  device: 'Body sensor',
  model: 'Build script',
  person: 'Person in the loop',
  surface: 'Screen',
};
