// Flight Record, chapter 04: the body the reading belongs to. A flat plate
// figure with the five contract regions. Status colours come from core/scoring
// through the caller; this file only says where each region is drawn.
import type { Region, RegionStatus, Status } from '../../data/types';

const TONE: Record<Status, string> = { green: 'var(--c-ok)', amber: 'var(--c-warn)', red: 'var(--c-crit)' };

/** Right half of the outline; the left half is its mirror. */
const HALF =
  'M50 6C56 6 60 11 60 18C60 24 58 28 55 31L55 36C60 38 68 39 72 43C76 47 77 54 78 62L81 104C82 110 84 116 83 121C82 124 79 123 78 119L74 100L71 64L70 84C69 92 68 98 70 108C72 122 72 136 70 150C69 158 68 164 68 172L67 204C68 208 71 210 71 212L58 212C58 200 58 180 57 166C56 156 55 140 54 130L50 118';

const ANCHOR: Record<Region, { x: number; y: number }> = {
  brain: { x: 57, y: 16 },
  heart: { x: 60, y: 57 },
  blood: { x: 54, y: 96 },
  bones: { x: 63, y: 150 },
  whole_body: { x: 80, y: 82 },
};

/** Tap zones, drawn in this order (later ones sit on top). */
const ZONES: { region: Region; x: number; y: number; w: number; h: number }[] = [
  { region: 'whole_body', x: 4, y: 36, w: 92, h: 86 },
  { region: 'brain', x: 22, y: 0, w: 56, h: 36 },
  { region: 'heart', x: 34, y: 38, w: 32, h: 36 },
  { region: 'blood', x: 34, y: 76, w: 32, h: 40 },
  { region: 'bones', x: 22, y: 118, w: 56, h: 100 },
];

export const regionWord = (r: Region): string => {
  const w = r.replace('_', ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
};

interface Props {
  height: number;
  regions: RegionStatus;
  /** Region of the followed reading and that reading's own status. */
  active: Region;
  tone: Status;
  onPick?: (r: Region) => void;
  /** Small glyph for the trace: no label, no tap zones. */
  mini?: boolean;
  x?: number;
  y?: number;
}

export function Figure({ height, regions, active, tone, onPick, mini = false, x, y }: Props) {
  const vbW = mini ? 76 : 200;
  const vbX = mini ? 12 : 0;
  const width = (height * vbW) / 220;
  const unit = 220 / height;
  const look = (r: Region) => {
    const on = r === active;
    const st = on ? tone : regions[r];
    const flagged = st !== 'green';
    return {
      on,
      stroke: on || flagged ? TONE[st] : 'var(--paper-3)',
      opacity: on ? 1 : flagged ? 0.75 : 0.55,
      width: (on ? 2.2 : 1.1) * (mini ? 1.6 : 1),
    };
  };
  const body = look('whole_body');
  const brain = look('brain');
  const heart = look('heart');
  const blood = look('blood');
  const bones = look('bones');
  const a = ANCHOR[active];
  const fs = 15 * unit;

  return (
    <svg
      className="fr-fig"
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`${vbX} 0 ${vbW} 220`}
      role={mini ? undefined : 'group'}
      aria-label={mini ? undefined : `Body, ${regionWord(active)} lit`}
      aria-hidden={mini || undefined}
    >
      {/* whole body: the outline itself */}
      <g fill="none" stroke={body.stroke} strokeWidth={body.width} opacity={body.opacity} strokeLinejoin="round">
        <path d={HALF} />
        <path d={HALF} transform="translate(100 0) scale(-1 1)" />
      </g>
      {body.on && (
        <g fill="none" stroke={body.stroke} strokeWidth={0.8 * (mini ? 1.6 : 1)} opacity={0.45} strokeDasharray="1 4" strokeLinecap="round">
          <path d={HALF} transform="translate(-5 -4) scale(1.1 1.03)" />
          <path d={HALF} transform="translate(105 -4) scale(-1.1 1.03)" />
        </g>
      )}

      {/* bones: spine, pelvis, long bones of the leg */}
      <g fill="none" stroke={bones.stroke} strokeWidth={bones.width} opacity={bones.opacity} strokeLinecap="round">
        <path d="M50 38V108" strokeDasharray="3 2.6" />
        <path d="M37 112C42 106 58 106 63 112" />
        <path d="M61 120L63 156M63 164L62.5 202M39 120L37 156M37 164L37.5 202" />
      </g>

      {/* blood: aorta and the main arteries */}
      <g fill="none" stroke={blood.stroke} strokeWidth={blood.width * 0.9} opacity={blood.opacity} strokeLinecap="round" strokeLinejoin="round">
        <path d="M54 64C54 80 54 92 54 104C54 110 58 116 59 124L60 150" />
        <path d="M54 104C53 110 47 116 45 124L42 150" />
        <path d="M54 48C60 46 68 48 72 54L76 92" />
        <path d="M52 48C44 46 34 48 29 54L25 92" />
        <path d="M52 44L52 34" />
      </g>

      {/* heart */}
      <path
        d="M54 50C57 47 62 49 62 54C62 59 57 63 54 66C50 63 47 59 47 55C47 50 51 48 54 50Z"
        fill={heart.on ? heart.stroke : 'var(--ink-0)'}
        fillOpacity={heart.on ? 0.3 : 1}
        stroke={heart.stroke}
        strokeWidth={heart.width}
        opacity={heart.opacity}
      />

      {/* brain */}
      <path
        d="M50 8C55 8 58 12 58 16C58 21 55 24 50 24C45 24 42 21 42 16C42 12 45 8 50 8ZM50 9V23M45.5 13.5C47 15 47 17 45.5 18.5M54.5 13.5C53 15 53 17 54.5 18.5"
        fill={brain.on ? brain.stroke : 'none'}
        fillOpacity={brain.on ? 0.3 : 0}
        stroke={brain.stroke}
        strokeWidth={brain.width * 0.85}
        opacity={brain.opacity}
      />

      {!mini && (
        <>
          <g className="fr-fig-lead" key={active}>
            <circle cx={a.x} cy={a.y} r={2.6} fill={TONE[tone]} />
            <path d={`M${a.x + 4} ${a.y}H108`} stroke="var(--paper-2)" strokeWidth={0.9 * unit} fill="none" />
            <text x={113} y={a.y + fs * 0.34} fontSize={fs} fill="var(--paper)">
              {regionWord(active)}
            </text>
          </g>
          {onPick &&
            ZONES.map((z) => (
              <rect key={z.region} className="fr-hit" x={z.x} y={z.y} width={z.w} height={z.h} onClick={() => onPick(z.region)}>
                <title>{regionWord(z.region)}</title>
              </rect>
            ))}
        </>
      )}
    </svg>
  );
}
