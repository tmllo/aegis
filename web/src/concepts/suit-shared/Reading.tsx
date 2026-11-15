// One sensor, one tap deep: the number, its status, her band, one reference number, one action.
// The instruction text sits one more tap deeper, in the confirm. Styled per concept via .rd-*.
import { useState } from 'react';
import { BaselineBar, StatusMark, STATUS_VAR, statusWord, usualText } from './bits';
import { Confirm } from './Confirm';
import './shared.css';
import { fmt, SENSOR_NAME, type SensorId, type SuitData } from './suitData';

export function Reading({ s, id, onClose }: { s: SuitData; id: SensorId; onClose: () => void }) {
  const st = s.sensors[id];
  const p = st.primary;
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="rd">
      <div className="rd-head">
        <h2 className="rd-title">{SENSOR_NAME[id]}</h2>
        <button type="button" className="rd-close" onClick={onClose}>
          Close
        </button>
      </div>
      {p && (
        <>
          <div className="rd-num">
            <span style={{ color: p.status && p.status !== 'green' ? STATUS_VAR[p.status] : undefined }}>{fmt(p.value, p.digits)}</span>
            <small>{p.value != null ? p.unit : ''}</small>
          </div>
          <div className="rd-state">
            <StatusMark status={p.status} size={16} />
            <b>{statusWord(p.status)}</b>
            <span>{p.short}</span>
          </div>
          <BaselineBar r={p} className="rd-bar" />
          <p className="rd-usual">{usualText(p)}</p>
        </>
      )}
      <button type="button" className="rd-go" data-done={done || undefined} onClick={() => (done ? setDone(false) : setAsking(true))}>
        {done ? 'Logged' : st.action.label}
      </button>
      <Confirm
        open={asking}
        eyebrow={SENSOR_NAME[id]}
        title={st.action.label}
        body={st.action.detail}
        confirm="Done"
        onConfirm={() => {
          setDone(true);
          setAsking(false);
        }}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
