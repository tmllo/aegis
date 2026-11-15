// Small drawn parts: status shapes and the line icon per node kind.
import type { MetricKey, Region, Status } from '../../data/types';
import type { LNode } from './graph';

/** Shape coding: dot = steady, triangle = watch, square = act. Colour is never the only cue. */
export function Shape({ status, size = 12 }: { status: Status; size?: number }) {
  const cls = `cga-shape cga-shape-${status}`;
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      {status === 'green' && <circle cx="6" cy="6" r="4.5" />}
      {status === 'amber' && <path d="M6 1 L11.5 11 L0.5 11 Z" />}
      {status === 'red' && <rect x="1" y="1" width="10" height="10" />}
    </svg>
  );
}

export const STATUS_WORD: Record<Status, string> = { green: 'Steady', amber: 'Watch', red: 'Act' };

const ICON: Record<LNode['kind'], string> = {
  person: 'M8 7.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M2.8 14c.4-2.8 2.5-4.4 5.2-4.4s4.8 1.6 5.2 4.4',
  device: 'M4.5 2.5h7v11h-7z M1.5 8h3 M11.5 8h3 M6.5 6l1 2.4 1-2.4',
  api: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z M1.5 8h13 M8 1.5c2.2 2 2.2 11 0 13 M8 1.5c-2.2 2-2.2 11 0 13',
  dataset: 'M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3 M5.5 8h5 M5.5 10.5h5',
  model: 'M5.5 4 2 8l3.5 4 M10.5 4 14 8l-3.5 4 M9 3 7 13',
  core: 'M4.5 4.5h7v7h-7z M6.5 1.5v3 M9.5 1.5v3 M6.5 11.5v3 M9.5 11.5v3 M1.5 6.5h3 M1.5 9.5h3 M11.5 6.5h3 M11.5 9.5h3',
  surface: 'M1.5 3h13v8.5h-13z M5.5 14h5 M8 11.5V14',
};

export function KindIcon({ kind, size = 16 }: { kind: LNode['kind']; size?: number }) {
  return (
    <svg className="cga-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d={ICON[kind]} />
    </svg>
  );
}

/** "Cmdr. Ana Silva" -> "AS": words ending in a full stop are titles. */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => w && !w.endsWith('.'))
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** "Radiation dose (mission total)" is too long for a glance; the two dose rows get short names. */
const SHORT: Partial<Record<MetricKey, string>> = { dose_mSv_day: 'Dose, daily', dose_mSv_cum: 'Dose, mission' };
/** Rail name of a metric: the file's label without its bracketed note (the unit column already says it). */
export const shortLabel = (key: MetricKey, label: string): string => SHORT[key] ?? label.replace(/\s*\(.*?\)\s*/g, ' ').trim();

/** "Cmdr. Ana Silva" -> "Ana Silva": the role line already carries the title. */
export const plainName = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => w && !w.endsWith('.'))
    .join(' ');

/** Lets a file name such as prepare_model_flares.py break after an underscore. */
export const breakable = (label: string): string => label.replace(/_/g, '_​');

/** Corner glyph per lineage status: solid = live, half = simulated, hollow = planned, slashed = offline sample. */
export function StatusGlyph({ status, size = 10 }: { status: LNode['status']; size?: number }) {
  return (
    <svg className={`cga-glyph cga-glyph-${status}`} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      {status === 'live' && <rect x="1" y="1" width="8" height="8" className="cga-glyph-fill" />}
      {status === 'simulated' && <path d="M1 1h4v8H1z" className="cga-glyph-fill" />}
      {status === 'offline-sample' && <path d="M1.5 8.5l7-7" />}
      <rect x="1" y="1" width="8" height="8" />
    </svg>
  );
}

export const REGION_WORD: Record<Region, string> = {
  brain: 'Brain',
  heart: 'Heart',
  blood: 'Blood',
  bones: 'Bones',
  whole_body: 'Whole body',
};

const BODY_OUTLINE =
  'M35.5 24 L35.5 28.5 C35.5 31.5 32 32.6 27.5 33.4 C19.5 34.8 16.4 39.5 15.4 46.5 L11.2 85 C10.6 90.6 15.8 91.4 16.8 86.4 ' +
  'L21.8 55 L23.4 51 L24.4 78 C22.4 88 21.8 96 22.2 104 L25.2 167 C25.4 173.4 33 173.4 33.2 167 L37.6 109 Q40 105 42.4 109 ' +
  'L46.8 167 C47 173.4 54.6 173.4 54.8 167 L57.8 104 C58.2 96 57.6 88 55.6 78 L56.6 51 L58.2 55 L63.2 86.4 ' +
  'C64.2 91.4 69.4 90.6 68.8 85 L64.6 46.5 C63.6 39.5 60.5 34.8 52.5 33.4 C48 32.6 44.5 31.5 44.5 28.5 L44.5 24';

/**
 * Line figure with the five contract regions. With `only`, one region is lit and
 * the rest stay as quiet guides; without it every region that is not green lights.
 */
export function BodyFigure({
  status, only, height = 164, className = '',
}: {
  status: Record<Region, Status>;
  only?: Region;
  height?: number;
  className?: string;
}) {
  const cls = (r: Region): string => {
    const lit = only ? only === r : status[r] !== 'green';
    return `cga-body-part cga-body-${r} ${lit ? `is-lit cga-st-${status[r]}` : ''}`;
  };
  return (
    <svg className={`cga-body ${className}`} height={height} width={(height * 80) / 180} viewBox="0 0 80 180" aria-hidden="true">
      <g className={cls('whole_body')}>
        <ellipse className="cga-body-aura" cx="40" cy="92" rx="37" ry="86" />
        <ellipse cx="40" cy="13.5" rx="8.6" ry="10.6" />
        <path d={BODY_OUTLINE} />
      </g>
      <g className={cls('bones')}>
        <path d="M27.5 92 Q40 101 52.5 92 M29.5 104 L29.2 134 L29.4 164 M50.5 104 L50.8 134 L50.6 164" />
        <circle cx="29.2" cy="134" r="1.6" />
        <circle cx="50.8" cy="134" r="1.6" />
      </g>
      <g className={cls('blood')}>
        <path d="M40 30 V88 M40 40 L21 46.5 L14.6 80 M40 40 L59 46.5 L65.4 80" />
      </g>
      <g className={cls('heart')}>
        <path className="cga-body-solid" d="M44.2 47.4 c1.8 -2.8 6.6 -1 5 3 l-5 6.4 l-5 -6.4 c-1.6 -4 3.2 -5.8 5 -3 Z" />
      </g>
      <g className={cls('brain')}>
        <ellipse className="cga-body-solid" cx="40" cy="11" rx="5.6" ry="5" />
      </g>
    </svg>
  );
}
