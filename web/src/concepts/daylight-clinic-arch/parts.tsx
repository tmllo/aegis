// Small drawing parts: line icons per node kind, body-region glyphs, status shapes, line-style swatch, plain names.
import type { Region, Status } from '../../data/types';
import type { LKind, LNode, LStatus } from './graph';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** 16 px glyph for a body region, centred on 0,0. */
export function RegionIcon({ region }: { region: Region }) {
  switch (region) {
    case 'brain':
      return (
        <g {...P}>
          <path d="M0 -6.5c-2.6-1-5.4.6-5.2 3.2-1.8 1.4-1.4 4.4.8 5 .2 2.6 3 3.6 4.4 2.3 1.4 1.3 4.2.3 4.4-2.3 2.2-.6 2.6-3.6.8-5 .2-2.6-2.6-4.2-5.2-3.2z" />
          <path d="M0 -6.5v10.5" />
        </g>
      );
    case 'heart':
      return (
        <g {...P}>
          <path d="M0 6.5C-8.5 1-7-6-3-6c1.6 0 2.6 1 3 2 .4-1 1.4-2 3-2 4 0 5.500 7-3 12.500z" />
        </g>
      );
    case 'blood':
      return (
        <g {...P}>
          <path d="M0 -7.500C3 -3.500 5.200 -.5 5.200 2.300a5.200 5.200 0 0 1-10.400 0C-5.200 -.5-3 -3.500 0 -7.500z" />
        </g>
      );
    case 'bones':
      return (
        <g {...P}>
          <path d="M-3.200 3.200l6.400-6.400" />
          <path d="M3.200 -3.200c-1-2.400 1.800-4.200 3-2.200 2 1.200.2 4-2.200 3M-3.200 3.200c1 2.400-1.800 4.200-3 2.200-2-1.200-.2-4 2.200-3" />
        </g>
      );
    case 'whole_body':
      return (
        <g {...P}>
          <circle cy={-5.5} r={1.9} />
          <path d="M0 -3.200v5.400M-4.500 -1.200h9M0 2.200l-3 5.300M0 2.200l3 5.300" />
        </g>
      );
  }
}

/** 20 px line icon centred on 0,0. Stroke comes from the parent (currentColor). */
export function KindIcon({ kind, region }: { kind: LKind; region?: Region }) {
  const p = P;
  switch (kind) {
    case 'body':
      return region ? <RegionIcon region={region} /> : null;
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
      <StatusMark status={status} size={size} />
    </svg>
  );
}

/** The same shape as bare SVG, for use inside the map. */
export function StatusMark({ status, size = 12 }: { status: Status; size?: number }) {
  const h = size / 2;
  if (status === 'green') return <circle r={h - 1} />;
  if (status === 'amber') return <path d={`M0 ${-h + 0.5}L${h - 0.5} ${h - 1}H${-h + 0.5}z`} />;
  return <rect x={-h + 1} y={-h + 1} width={size - 2} height={size - 2} />;
}

// "live" in lineage.json means real data or a real working path; the app makes no live request.
export const STATUS_WORD: Record<LStatus, string> = {
  live: 'Real',
  simulated: 'Simulated',
  planned: 'Planned',
  'offline-sample': 'Offline sample',
};
export const CREW_WORD: Record<Status, string> = { green: 'Normal', amber: 'Watch', red: 'Act' };
export const KIND_WORD: Record<LKind, string> = {
  api: 'Feed',
  core: 'Core',
  dataset: 'File',
  device: 'Device',
  model: 'Pipeline',
  person: 'Person',
  surface: 'Screen',
  body: 'Body region',
};

/** Plain names for nodes whose lineage label is a file or class name. Display only. */
const PLAIN: Record<string, string> = {
  dev_ble_strap: 'Heart strap',
  dev_dosimeter: 'Dosimeter',
  ds_crew_data: 'Crew file',
  ds_real_crew: 'Lab file',
  ds_storm_forecast: 'Storm file',
  ml_fetch_donki: 'Flare fetch',
  ml_real_crew: 'Lab parser',
  ml_prepare: 'Flare prep',
  ml_model_v1: 'Storm model',
  ml_export: 'Forecast export',
  ad_replay: 'Replay',
  ad_manual: 'Check-in',
  ad_ble_hr: 'Bluetooth HR',
  ad_spaceweather: 'Weather snapshot',
  api_iswa_hapi: 'iSWA dose',
  person_cmo: 'Medical officer',
  core_handoff: 'Handoff',
};
export const plainName = (n: LNode): string => PLAIN[n.id] ?? n.label;

/** The node outline style, drawn as a short line. */
export function LineSwatch({ status }: { status: LStatus }) {
  return (
    <svg width={28} height={8} viewBox="0 0 28 8" aria-hidden>
      <line x1={1} y1={4} x2={27} y2={4} className={`dca-stroke dca-st-${status}`} />
    </svg>
  );
}
