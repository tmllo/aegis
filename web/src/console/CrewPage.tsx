// Crew (home): the Earth hero with its orbit track and network mesh, the selected crew member
// on the right, and a strip of cards: lead vital, today's actions, today's flags, storm risk.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sortedEvents, doseSummary } from '../core/radiation';
import { StormChart } from './StormChart';
import { fmt, METRIC_TARGET, rowOf, SHORT, STATUS_WORD } from './model';
import { Arc, Band, Icon, KV, Mark, Num, Panel, RotateDial, statusWord } from './ui';
import { useConsole } from './useConsole';
import { useHud } from './hud';

const PAGE = 3;

export default function CrewPage() {
  const { data, cd, views, seat, cv, setCrew, day } = useConsole();
  const nav = useNavigate();
  const { yaw, setYaw } = useHud();
  const [page, setPage] = useState(0);

  const flags = useMemo(
    () =>
      cd
        ? views.flatMap((v) =>
            v.scores
              .filter((s) => s.status !== 'green')
              .map((s) => ({ v, s, r: rowOf(cd, v.m, v.scores, s.metric) })),
          )
        : [],
    [cd, views],
  );
  const events = useMemo(() => (data ? sortedEvents(data.storm).slice(-48) : []), [data]);

  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const issue = cv.issue ? rowOf(cd, cv.m, cv.scores, cv.issue.metric) : null;
  const lead = issue ?? rowOf(cd, cv.m, cv.scores, 'hr');
  const dose = doseSummary(cv.m, cd, cd.mission.environment);
  const latest = events.at(-1);
  const pages = Math.max(1, Math.ceil(flags.length / PAGE));
  const shown = flags.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <>
      {/* selected crew member */}
      <Panel label={`${seat[cv.m.id]} · ${cv.m.role}`} icon="crew" aside={`Day ${day}`} className="crew-card">
        <div className="state" data-status={cv.overall} style={{ marginTop: 0 }}>
          <Mark s={cv.overall} size={14} />
          <b style={{ fontSize: 26, fontWeight: 300 }}>{STATUS_WORD[cv.overall]}</b>
        </div>
        {issue ? (
          <>
            <span className="label gap">Top issue · {issue.label}</span>
            <div className="big" style={{ marginTop: 6 }}>
              <b>
                <Num v={issue.value} d={issue.digits} />
              </b>
              <small>{issue.unit}</small>
            </div>
            <Band g={issue} />
          </>
        ) : (
          <span className="label gap">All readings in range</span>
        )}
        <dl className="kvs gap">
          <KV k="Usual" v={issue?.mean != null ? `${fmt(issue.mean, issue.digits)} ${issue.unit}` : '--'} />
          <KV k="Days running" v={issue ? issue.running : 0} status={issue?.status} />
          <KV k="Dose today" v={dose.daily_mSv != null ? `${dose.daily_mSv.toFixed(2)} mSv` : '--'} />
          <KV k="Mission dose" v={dose.cumulative_mSv != null ? `${dose.cumulative_mSv.toFixed(1)} mSv` : '--'} />
          <KV k="Of career limit" v={dose.fraction != null ? `${(dose.fraction * 100).toFixed(1)} %` : '--'} />
        </dl>
        <button type="button" className="btn btn-primary mt-auto" onClick={() => nav(issue && METRIC_TARGET[issue.k] ? `/vitals?t=${METRIC_TARGET[issue.k]}&k=${issue.k}` : '/vitals')}>
          Open vitals
        </button>
      </Panel>

      <RotateDial deg={(yaw * 180) / Math.PI} onChange={(d) => setYaw((d * Math.PI) / 180)} style={{ right: 470, top: 560 }} />

      <div className="strip" style={{ gridTemplateColumns: '300px 340px 520px 1fr' }}>
        <Panel label="Lead vital" icon="dial" aside={seat[cv.m.id]}>
          <div className="row2" style={{ alignItems: 'center' }}>
            <Arc g={lead} size={150} label={lead.label} />
            <dl className="kvs" style={{ flex: 1 }}>
              {(['hr', 'bp_sys', 'sleep_h'] as const).map((k) => {
                const r = rowOf(cd, cv.m, cv.scores, k);
                return <KV key={k} k={SHORT[k]} v={`${fmt(r.value, r.digits)}`} status={r.status} />;
              })}
            </dl>
          </div>
        </Panel>

        <Panel label="Today" icon="list" aside={`${flags.length} actions`}>
          <div className="steps">
            {flags.slice(0, 3).map((f, i) => (
              <button key={`${f.v.m.id}-${f.s.metric}`} type="button" className="step" data-status={f.s.status} onClick={() => setCrew(f.v.m.id)}>
                <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
                <Mark s={f.s.status} />
                <span className="step-t">
                  {f.s.status === 'red' ? 'Call surgeon' : 'Re-measure'}
                  <small>
                    {seat[f.v.m.id]} · {SHORT[f.s.metric]}
                  </small>
                </span>
                <span className="step-v">
                  <em>{STATUS_WORD[f.s.status]}</em>
                </span>
              </button>
            ))}
            {!flags.length && <p className="note">Nothing due</p>}
          </div>
        </Panel>

        <Panel label="Flags" icon="alert" aside={`${flags.length} open`}>
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Crew</th>
                <th>Metric</th>
                <th className="num">Value</th>
                <th className="num">z</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={`${f.v.m.id}-${f.s.metric}`} data-status={f.s.status} onClick={() => setCrew(f.v.m.id)}>
                  <td className="sc">
                    <Mark s={f.s.status} size={10} /> F-{String(page * PAGE + i + 1).padStart(3, '0')}
                  </td>
                  <td>{seat[f.v.m.id]}</td>
                  <td>{SHORT[f.s.metric]}</td>
                  <td className="num sc">
                    {fmt(f.r.value, f.r.digits)} {f.r.unit}
                  </td>
                  <td className="num">{f.s.z == null ? '--' : f.s.z.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <span>
              {flags.length ? page * PAGE + 1 : 0}-{Math.min(flags.length, page * PAGE + PAGE)} of {flags.length}
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              Page {String(page + 1).padStart(2, '0')} of {pages}
              <button type="button" aria-label="Previous page" onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <Icon name="back" size={14} />
              </button>
              <button type="button" aria-label="Next page" style={{ transform: 'scaleX(-1)' }} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>
                <Icon name="back" size={14} />
              </button>
            </span>
          </div>
        </Panel>

        <Panel label="Storm probability" icon="chart" aside={latest ? `${latest.flare_class} · ${statusWord(latest.alert_level === 'none' ? 'green' : latest.alert_level === 'watch' ? 'amber' : 'red')}` : ''}>
          <StormChart events={events} meta={data.storm.meta} height={150} />
        </Panel>
      </div>
    </>
  );
}
