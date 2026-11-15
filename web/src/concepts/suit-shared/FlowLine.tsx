// Systems in one line: Sensors -> e^x -> Crew -> Wrist -> Ground, with data moving along it.
// Tap a node to see what it does. Styled per concept via .fl-*.
import { useState } from 'react';
import { StatusMark, statusWord } from './bits';
import { fmt, SENSORS, type SuitData } from './suitData';
import type { Status } from '../../data/types';
import './shared.css';

interface Node {
  id: string;
  name: string;
  value: string;
  status: Status | null;
  does: string;
}

export function FlowLine({ s, className = '' }: { s: SuitData; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const hr = s.sensors.wrist.readings.find((r) => r.key === 'hr');
  const worstSensor = SENSORS.map((id) => s.sensors[id].status).reduce<Status | null>(
    (w, x) => (x === 'red' || w === 'red' ? 'red' : x === 'amber' || w === 'amber' ? 'amber' : x ?? w),
    null,
  );
  const nodes: Node[] = [
    { id: 'sensors', name: 'Sensors', value: `${SENSORS.length} on suit`, status: worstSensor, does: 'Read Ana' },
    { id: 'core', name: 'e^x', value: `${s.scores.length} checks`, status: s.overall, does: 'Compare to her usual' },
    { id: 'crew', name: 'Crew', value: statusWord(s.overall), status: s.overall, does: 'This screen' },
    { id: 'wrist', name: 'Wrist', value: hr ? `${fmt(hr.value, hr.digits)} ${hr.unit}` : 'No feed', status: hr?.status ?? null, does: 'Glance on her wrist' },
    {
      id: 'ground',
      name: 'Ground',
      value: s.cabin ? (s.cabin.signal ? 'Link up' : 'No link') : 'No feed',
      status: s.cabin ? (s.cabin.signal ? 'green' : 'amber') : null,
      does: s.cabin?.origin === 'sample' ? 'Flight surgeon, recorded feed' : 'Flight surgeon',
    },
  ];
  const sel = nodes.find((n) => n.id === open);
  return (
    <div className={`fl ${className}`}>
      <div className="fl-row">
        <div className="fl-line" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <span key={k} className="fl-pk flow-packet" style={{ animationDelay: `-${k}s` }} />
          ))}
        </div>
        {nodes.map((n) => (
          <button key={n.id} type="button" className="fl-node" aria-pressed={open === n.id} onClick={() => setOpen(open === n.id ? null : n.id)}>
            <span className="fl-dot">
              <StatusMark status={n.status} size={14} />
            </span>
            <span className="fl-name">{n.name}</span>
            <span className="fl-value">{n.value}</span>
          </button>
        ))}
      </div>
      <p className="fl-does" aria-live="polite">
        {sel ? sel.does : ' '}
      </p>
    </div>
  );
}
