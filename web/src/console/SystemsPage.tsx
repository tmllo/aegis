// Systems HUD over the orbit network: one line of five nodes, Sensors -> e^x -> Crew -> Wrist
// -> Ground. Tap a node for what it does and its live counts; its sources (docs/lineage.json)
// are one tap deeper. Server live or offline comes from data/http.
import { useEffect, useState } from 'react';
import lineage from '../../docs/lineage.json';
import { useCabin } from '../data/cabin';
import { hasServer } from '../data/http';
import type { Status } from '../data/types';
import { fmt, rowOf, STATUS_WORD } from './model';
import { Icon, KV, Mark, Panel } from './ui';
import { useConsole } from './useConsole';

interface LNode {
  id: string;
  label: string;
  kind: string;
  status: string;
  layer: number;
  source?: string;
}
const NODES = (lineage as { nodes: LNode[] }).nodes;

const GROUPS: { id: string; name: string; does: string; pick: (n: LNode) => boolean }[] = [
  { id: 'sensors', name: 'Sensors', does: 'Read the crew and the cabin', pick: (n) => n.kind === 'device' || n.id === 'crew' },
  { id: 'core', name: 'e^x', does: 'Score each reading against her own baseline', pick: (n) => n.kind === 'core' && !['core_handoff', 'core_link'].includes(n.id) },
  { id: 'crew', name: 'Crew', does: 'Show status, issue and the one action', pick: (n) => n.id === 'sf_console' || n.id === 'sf_radiation' || n.id === 'sf_systems' },
  { id: 'wrist', name: 'Wrist', does: 'A glance and a buzz on the wrist', pick: (n) => n.id === 'sf_wrist' },
  { id: 'ground', name: 'Ground', does: 'Queue and send to the flight surgeon', pick: (n) => ['sf_ground', 'core_link', 'core_handoff', 'person_surgeon', 'ext_cmo_da', 'person_cmo'].includes(n.id) },
];

const ST: Record<string, Status | null> = { live: 'green', simulated: 'amber', 'offline-sample': 'amber', planned: null };

export default function SystemsPage() {
  const { cd, views, cv, seat } = useConsole();
  const { cabin } = useCabin();
  const [server, setServer] = useState<boolean | null>(null);
  const [sel, setSel] = useState('core');
  const [deep, setDeep] = useState(false);
  useEffect(() => {
    void hasServer().then(setServer);
  }, []);
  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const hr = rowOf(cd, cv.m, cv.scores, 'hr');
  const checks = views.reduce((n, v) => n + v.scores.length, 0);
  const flagged = views.reduce((n, v) => n + v.scores.filter((s) => s.status !== 'green').length, 0);
  const devices = NODES.filter((n) => n.kind === 'device');
  const value: Record<string, { big: string; sub: string; status: Status | null; kv: [string, string][] }> = {
    sensors: { big: String(devices.length), sub: 'devices', status: 'green', kv: [['Live', String(devices.filter((d) => d.status === 'live').length)], ['Planned', String(devices.filter((d) => d.status === 'planned').length)], ['Cabin feed', cabin ? (cabin.origin === 'server' ? 'Live' : 'Recorded') : 'None']] },
    core: { big: String(checks), sub: 'checks today', status: flagged ? 'amber' : 'green', kv: [['Flagged', String(flagged)], ['Crew scored', String(views.length)], ['Rule', 'Own baseline, 3-day mean']] },
    crew: { big: String(views.length), sub: 'aboard', status: views.reduce<Status>((w, v) => (v.overall === 'red' || w === 'red' ? 'red' : v.overall === 'amber' || w === 'amber' ? 'amber' : 'green'), 'green'), kv: views.map((v) => [seat[v.m.id], STATUS_WORD[v.overall]]) },
    wrist: { big: fmt(hr.value, hr.digits), sub: `${hr.unit} · ${seat[cv.m.id]}`, status: hr.status, kv: [['Pulse', `${fmt(hr.value, hr.digits)} ${hr.unit}`], ['Usual', `${fmt(hr.mean, hr.digits)} ${hr.unit}`]] },
    ground: { big: cabin ? (cabin.signal ? 'Up' : 'Down') : '--', sub: 'link', status: cabin?.signal ? 'green' : 'amber', kv: [['Link', cabin ? (cabin.signal ? 'Up' : 'Down') : 'No data'], ['Server', server == null ? 'Checking' : server ? 'Live' : 'Offline'], ['Queue', 'Offline safe']] },
  };
  const g = GROUPS.find((x) => x.id === sel)!;
  const v = value[sel];
  const sources = NODES.filter(g.pick);

  return (
    <>
      <Panel label="Nodes" icon="systems" aside={server == null ? '' : server ? 'Server live' : 'Server offline'} className="sy-left">
        <div className="steps">
          {GROUPS.map((x, i) => (
            <button key={x.id} type="button" className="step" data-status={value[x.id].status ?? undefined} aria-pressed={sel === x.id} onClick={() => { setSel(x.id); setDeep(false); }}>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <Mark s={value[x.id].status} />
              <span className="step-t">
                {x.name}
                <small>{value[x.id].sub}</small>
              </span>
              <span className="step-v">{value[x.id].big}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel label={g.name} icon="flow" aside={`${sources.length} sources`} className="sy-right">
        {!deep ? (
          <>
            <p style={{ fontSize: 20, fontWeight: 300, lineHeight: 1.35 }}>{g.does}</p>
            <div className="big gap">
              <b>{v.big}</b>
              <small>{v.sub}</small>
            </div>
            <dl className="kvs gap">
              {v.kv.map(([k, val]) => (
                <KV key={k} k={k} v={val} />
              ))}
            </dl>
            <button type="button" className="btn mt-auto" onClick={() => setDeep(true)}>
              Sources ({sources.length})
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cx-back" onClick={() => setDeep(false)}>
              <Icon name="back" size={16} />
              Back
            </button>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Kind</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((n) => (
                  <tr key={n.id} data-status={ST[n.status] ?? undefined}>
                    <td>{n.label}</td>
                    <td>{n.kind}</td>
                    <td className="sc">
                      <Mark s={ST[n.status] ?? null} size={10} />
                      {n.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <div className="strip" style={{ gridTemplateColumns: '1fr', left: 396, right: 476, height: 230 }}>
        <Panel label="Data flow" icon="flow" aside="Sensors to ground">
          <div className="flow" style={{ marginTop: 14 }}>
            <i className="flow-line" />
            {GROUPS.map((x) => (
              <button key={x.id} type="button" className="flow-node" aria-pressed={sel === x.id} onClick={() => { setSel(x.id); setDeep(false); }}>
                <span className="flow-dot">
                  <b>{value[x.id].big}</b>
                </span>
                <span className="flow-name">{x.name}</span>
                <span className="flow-sub">{value[x.id].sub}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
