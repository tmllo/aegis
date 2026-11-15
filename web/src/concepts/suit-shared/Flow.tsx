// Systems view: sensors -> e^x core -> crew / wrist / ground, with data moving.
// Two layouts: 'lanes' (left to right) and 'rings' (orbits round the core).
import type { Status } from '../../data/types';
import { fmt, SENSORS, SENSOR_NAME, type SensorId, type SuitData } from './suitData';
import { STATUS_VAR, statusWord } from './bits';

interface Node {
  id: string;
  name: string;
  value: string;
  sub: string;
  status: Status | null;
  x: number;
  y: number;
  sensor?: SensorId;
}

const W = 1200;
const H = 640;

function mark(status: Status | null, x: number, y: number, r = 8) {
  const c = status ? STATUS_VAR[status] : 'currentColor';
  if (status === 'amber') return <path d={`M${x} ${y - r} L${x + r} ${y + r * 0.8} H${x - r} Z`} fill={c} />;
  if (status === 'red') return <rect x={x - r * 0.8} y={y - r * 0.8} width={r * 1.6} height={r * 1.6} fill={c} />;
  if (status === 'green') return <circle cx={x} cy={y} r={r * 0.8} fill={c} />;
  return <circle cx={x} cy={y} r={r * 0.7} fill="none" stroke={c} strokeDasharray="2 2" />;
}

export function Flow({
  s,
  layout,
  onSensor,
  className = '',
}: {
  s: SuitData;
  layout: 'lanes' | 'rings';
  onSensor: (id: SensorId) => void;
  className?: string;
}) {
  const wristHr = s.sensors.wrist.readings.find((r) => r.key === 'hr');
  const inputs: Omit<Node, 'x' | 'y'>[] = SENSORS.map((id) => {
    const p = s.sensors[id].primary;
    return {
      id,
      sensor: id,
      name: SENSOR_NAME[id],
      value: p ? `${fmt(p.value, p.digits)} ${p.value == null ? '' : p.unit}` : 'No feed',
      sub: p?.short ?? '',
      status: s.sensors[id].status,
    };
  });
  const outputs: Omit<Node, 'x' | 'y'>[] = [
    { id: 'out-crew', name: 'Crew', value: statusWord(s.overall), sub: 'Overall', status: s.overall },
    {
      id: 'out-wrist',
      name: 'Wrist',
      value: wristHr ? `${fmt(wristHr.value, wristHr.digits)} ${wristHr.unit}` : 'No feed',
      sub: 'Pulse',
      status: wristHr?.status ?? null,
    },
    {
      id: 'out-ground',
      name: 'Ground',
      value: s.cabin ? (s.cabin.signal ? 'Link up' : 'No link') : 'No feed',
      sub: s.cabin ? (s.cabin.origin === 'server' ? 'Live' : 'Recorded') : '',
      status: s.cabin ? (s.cabin.signal ? 'green' : 'amber') : null,
    },
  ];
  const core = { x: W / 2, y: H / 2 };

  let ins: Node[];
  let outs: Node[];
  let pathIn: (n: Node) => string;
  let pathOut: (n: Node) => string;

  if (layout === 'lanes') {
    ins = inputs.map((n, i) => ({ ...n, x: 40, y: 50 + i * 140 }));
    outs = outputs.map((n, i) => ({ ...n, x: 880, y: 110 + i * 160 }));
    pathIn = (n) => `M${n.x + 280} ${n.y + 50} C${n.x + 400} ${n.y + 50} ${core.x - 230} ${core.y} ${core.x - 110} ${core.y}`;
    pathOut = (n) => `M${core.x + 110} ${core.y} C${core.x + 230} ${core.y} ${n.x - 120} ${n.y + 50} ${n.x} ${n.y + 50}`;
  } else {
    const R = 270;
    const at = (deg: number) => ({ x: core.x + R * Math.cos((deg * Math.PI) / 180), y: core.y + R * Math.sin((deg * Math.PI) / 180) });
    ins = inputs.map((n, i) => ({ ...n, ...at(225 - i * 30) }));
    outs = outputs.map((n, i) => ({ ...n, ...at(-35 + i * 35) }));
    pathIn = (n) => `M${n.x} ${n.y} Q${(n.x + core.x) / 2} ${core.y + (n.y - core.y) * 0.25} ${core.x - 62} ${core.y}`;
    pathOut = (n) => `M${core.x + 62} ${core.y} Q${(n.x + core.x) / 2} ${core.y + (n.y - core.y) * 0.25} ${n.x} ${n.y}`;
  }

  const packets = (d: string, color: string, i: number, n = 2) =>
    Array.from({ length: n }, (_, k) => (
      <circle key={k} r="5" fill={color} className="flow-packet">
        <animateMotion dur="2.6s" repeatCount="indefinite" begin={`-${(i * 0.45 + k * 1.3).toFixed(2)}s`} path={d} />
      </circle>
    ));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`flow flow-${layout} ${className}`} role="img" aria-label="Sensors to e^x core to crew, wrist and ground">
      {layout === 'rings' && (
        <g className="flow-rings" fill="none">
          {[62, 150, 270, 300].map((r) => (
            <circle key={r} cx={core.x} cy={core.y} r={r} />
          ))}
        </g>
      )}
      {ins.map((n, i) => (
        <g key={`p${n.id}`}>
          <path d={pathIn(n)} className="flow-line" fill="none" />
          {packets(pathIn(n), n.status ? STATUS_VAR[n.status] : 'currentColor', i)}
        </g>
      ))}
      {outs.map((n, i) => (
        <g key={`q${n.id}`}>
          <path d={pathOut(n)} className="flow-line" fill="none" />
          {packets(pathOut(n), 'rgb(var(--accent))', i + 4)}
        </g>
      ))}

      {/* core */}
      <g className="flow-core">
        {layout === 'lanes' ? (
          <rect x={core.x - 110} y={core.y - 110} width="220" height="220" rx="28" />
        ) : (
          <circle cx={core.x} cy={core.y} r="62" />
        )}
        <text x={core.x} y={core.y - 12} textAnchor="middle" className="flow-core-name">
          e^x core
        </text>
        <text x={core.x} y={core.y + 26} textAnchor="middle" className="flow-core-sub">
          {s.scores.length} checks
        </text>
        {layout === 'lanes' && (
          <text x={core.x} y={core.y + 58} textAnchor="middle" className="flow-core-sub">
            {s.flagsToday} flagged
          </text>
        )}
      </g>

      {[...ins, ...outs].map((n) => {
        const isIn = !!n.sensor;
        const press = n.sensor ? () => onSensor(n.sensor!) : undefined;
        if (layout === 'lanes') {
          return (
            <g
              key={n.id}
              className={`flow-node ${isIn ? 'flow-in' : 'flow-out'}`}
              transform={`translate(${n.x} ${n.y})`}
              onClick={press}
              role={press ? 'button' : undefined}
              tabIndex={press ? 0 : undefined}
              onKeyDown={press ? (e) => (e.key === 'Enter' || e.key === ' ') && press() : undefined}
            >
              <rect width="280" height="100" rx="14" />
              {mark(n.status, 30, 34)}
              <text x="50" y="40" className="flow-name">
                {n.name}
              </text>
              <text x="24" y="80" className="flow-value">
                {n.value}
              </text>
              <text x="256" y="40" textAnchor="end" className="flow-sub">
                {n.sub}
              </text>
            </g>
          );
        }
        const left = isIn;
        return (
          <g
            key={n.id}
            className={`flow-node ${isIn ? 'flow-in' : 'flow-out'}`}
            transform={`translate(${n.x} ${n.y})`}
            onClick={press}
            role={press ? 'button' : undefined}
            tabIndex={press ? 0 : undefined}
            onKeyDown={press ? (e) => (e.key === 'Enter' || e.key === ' ') && press() : undefined}
          >
            <circle r="34" className="flow-hit" />
            <circle r="16" className="flow-dot" />
            {mark(n.status, 0, 0, 7)}
            <text x={left ? -40 : 40} y="-6" textAnchor={left ? 'end' : 'start'} className="flow-name">
              {n.name}
            </text>
            <text x={left ? -40 : 40} y="26" textAnchor={left ? 'end' : 'start'} className="flow-value">
              {n.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
