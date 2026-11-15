// Systems HUD over the orbit network: one line, Sensors -> Cabin -> e^x -> Crew HUD ->
// Escalation. Tap a node for what it does and its live counts; its sources (docs/lineage.json)
// are one tap deeper. Sensors are simulated; the cabin is the recorded ISS snapshot.
import { useEffect, useState } from 'react';
import lineage from '../../docs/lineage.json';
import { useCabin } from '../data/cabin';
import { hasServer } from '../data/http';
import type { Status } from '../data/types';
import { LINK_DELAY, PLACEMENTS, STATUS_WORD } from './model';
import { Icon, KV, Mark, Panel } from './ui';
import { useConsole } from './useConsole';

interface LNode {
  id: string;
  label: string;
  kind: string;
  status: string;
}
const NODES = (lineage as { nodes: LNode[] }).nodes;
const ST: Record<string, Status | null> = { live: 'green', simulated: 'amber', 'offline-sample': 'amber', planned: null };

const GROUPS: { id: string; name: string; does: string; pick: (n: LNode) => boolean }[] = [
  { id: 'sensors', name: 'Sensors', does: 'Suit, head, wrist, pocket, lab and self-report (simulated), plus the recorded ISS cabin', pick: (n) => n.kind === 'device' || n.id === 'crew' || n.id === 'ad_manual' || n.id === 'api_isslive' },
  { id: 'core', name: 'e^x', does: 'Score each reading against her own baseline', pick: (n) => n.kind === 'core' && !['core_handoff', 'core_link'].includes(n.id) },
  { id: 'hud', name: 'Crew', does: 'Show status, the issue and the one action', pick: (n) => ['sf_console', 'sf_radiation', 'sf_systems', 'sf_wrist'].includes(n.id) },
  { id: 'esc', name: 'Ground', does: 'Queue a report for the flight surgeon', pick: (n) => ['core_escalation', 'core_link', 'core_handoff', 'person_surgeon', 'ext_cmo_da', 'person_cmo'].includes(n.id) },
];

export default function SystemsPage() {
  const { cd, views } = useConsole();
  const { cabin } = useCabin();
  const [server, setServer] = useState<boolean | null>(null);
  const [sel, setSel] = useState('core');
  const [deep, setDeep] = useState(false);
  useEffect(() => {
    void hasServer().then(setServer);
  }, []);
  if (!cd) return <p className="cx-error cx-wait">Loading</p>;

  const checks = views.reduce((n, v) => n + v.scores.length, 0);
  const flagged = views.reduce((n, v) => n + v.scores.filter((s) => s.status !== 'green').length, 0);
  const worst = views.reduce<Status>((w, v) => (v.overall === 'red' || w === 'red' ? 'red' : v.overall === 'amber' || w === 'amber' ? 'amber' : 'green'), 'green');
  const delay = LINK_DELAY[cd.mission.environment] ?? 'unknown';
  const value: Record<string, { big: string; sub: string; status: Status | null; kv: [string, string][] }> = {
    sensors: { big: String(PLACEMENTS.length), sub: 'sources', status: 'green', kv: PLACEMENTS.map((p) => [p.name, p.reads]) },
    core: { big: String(checks), sub: 'checks today', status: flagged ? 'amber' : 'green', kv: [['Flagged', String(flagged)], ['Crew scored', String(views.length)], ['Rule', 'Own baseline, 3-day mean'], ['Server', server == null ? 'Checking' : server ? 'Live' : 'Offline']] },
    hud: { big: String(views.length), sub: 'crew', status: worst, kv: views.map((v) => [v.m.role, STATUS_WORD[v.overall]]) },
    esc: { big: String(flagged), sub: 'in queue', status: flagged ? 'amber' : 'green', kv: [['Report arrives in', `~${delay}`], ['Site', cd.environments[cd.mission.environment]?.label ?? '']] },
  };
  const g = GROUPS.find((x) => x.id === sel)!;
  const v = value[sel];
  const sources = NODES.filter(g.pick);

  return (
    <>
      <Panel label="Sensors" icon="systems" aside="Simulated" className="sy-left">
        <div className="steps">
          {PLACEMENTS.map((p, i) => (
            <button key={p.id} type="button" className="step" aria-pressed={sel === 'sensors'} onClick={() => { setSel('sensors'); setDeep(false); }}>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <Mark s={p.id === 'cabin' ? (cabin ? 'green' : null) : 'green'} />
              <span className="step-t">
                {p.name}
                <small>{p.cls}</small>
              </span>
              <span className="step-v" style={{ fontSize: 12, whiteSpace: 'normal', maxWidth: 150 }}>
                {p.reads}
              </span>
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
        <Panel label="Data flow" icon="flow" aside={`Report arrives in ~${delay}`}>
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
