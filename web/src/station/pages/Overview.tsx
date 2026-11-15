// "Today on board": the whole crew, the action queue, radiation and cabin air on one screen.
// Every card is a door to the screen that handles it.
import { useNavigate } from 'react-router-dom';
import { useCabin } from '../../data/cabin';
import type { Status } from '../../data/types';
import { CW_LABEL, DUTY_LABEL, LEVEL_STATUS, LEVEL_WORD, SYSTEMS, WORD, dutyOf, firstName, fmtV, issueLine, seatOf, useStationData, worstOf } from '../model';
import { CWChip } from '../health';
import { useStation } from '../state';
import { Card, Chip, Dot, Icon, Ring, Spark, STATUS_COLOR } from '../ui';

export default function Overview() {
  const { data, views, sw, doses, queue, env } = useStationData();
  const alarm = useStation((s) => s.alarm);
  const alarmOn = alarm.phase === 'warning' || alarm.phase === 'sheltered';
  const xp = useStation((s) => s.xp);
  const streak = useStation((s) => s.streak);
  const { cabin } = useCabin();
  const nav = useNavigate();
  if (!data) return null;

  const counts = { red: views.filter((v) => v.overall === 'red').length, amber: views.filter((v) => v.overall === 'amber').length };
  const done = views.filter((v) => v.checkedIn).length;
  const cabinStatus: Status = cabin ? cabin.readings.reduce<Status>((a, r) => worstOf(a, r.status ?? 'green'), 'green') : 'green';
  const summary = [
    counts.red ? `${counts.red} on hold for the flight surgeon` : null,
    counts.amber ? `${counts.amber} to re-check` : null,
    !counts.red && !counts.amber ? 'Everyone inside their own baseline' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const cleared = views.filter((v) => dutyOf(v.cw, alarmOn) === 'cleared').length;
  const maxCum = Math.max(...doses.map((d) => d.d.cumulative_mSv ?? 0));
  const limit = data.crew.career_limit_mSv;

  return (
    <div className="st-page st-overview">
      <section className="st-hero">
        <div>
          <p className="st-cap">Crew health · today</p>
          <h2>
            <span className={`st-ready is-${cleared === views.length ? 'green' : cleared === 0 ? 'red' : 'amber'}`}>
              {cleared}/{views.length}
            </span>
            <span className="st-hero-line">
              crew cleared for EVA. {summary}. Space weather {sw ? LEVEL_WORD[sw.level].toLowerCase() : '—'}, cabin air {cabinStatus === 'green' ? 'in range' : WORD[cabinStatus].toLowerCase()}.
            </span>
          </h2>
          <div className="st-cwcount">
            {(['warning', 'caution', 'advisory'] as const).map((c) => {
              const n = views.reduce((a, v) => a + Object.values(v.rows).filter((r) => r.cw === c && r.k !== 'bp_dia').length, 0);
              return (
                <span key={c} className={`st-cw is-${n ? c : 'nominal'}`}>
                  <i />
                  <b>
                    {n} {CW_LABEL[c]}
                    {n === 1 ? '' : 's'}
                  </b>
                </span>
              );
            })}
          </div>
        </div>
        <div className="st-hero-stats">
          <div>
            <b>
              {done}/{views.length}
            </b>
            <span>health checks today</span>
          </div>
          <div>
            <b>{queue.filter((q) => q.tone === 'red' || q.tone === 'amber').length}</b>
            <span>open countermeasures</span>
          </div>
          <div>
            <b>{sw ? `${Math.round(sw.p * 100)}%` : '—'}</b>
            <span>storm chance, 72 h</span>
          </div>
        </div>
      </section>

      <div className="st-ov-grid">
        <div className="st-crewcards">
          {views.map((v) => {
            const issue = v.issue;
            const spark = issue ? issue.history.map((h) => h.v) : v.rows.hr.history.map((h) => h.v);
            return (
              <article key={v.m.id} className={`st-crewcard is-${v.overall} cw-${v.cw}`} onClick={() => nav(`/crew/${v.m.id}`)}>
                <header>
                  <div className="st-avatar">
                    {seatOf(v.m)}
                    <Dot s={v.overall} pulse size={12} />
                  </div>
                  <div>
                    <h3>{v.m.name}</h3>
                    <p>
                      {v.m.role} · {v.m.age}
                    </p>
                  </div>
                </header>
                <div className="st-crewcard-cw">
                  <CWChip cw={alarmOn ? 'emergency' : v.cw} />
                  <span className={`st-duty is-${dutyOf(v.cw, alarmOn)}`}>{DUTY_LABEL[dutyOf(v.cw, alarmOn)]}</span>
                </div>
                <p className="st-crewcard-issue">{issue ? issueLine(issue) : v.drifts[0] ? `${v.drifts[0].label} drifting ${v.drifts[0].z! >= 0 ? 'up' : 'down'} ${Math.abs(v.drifts[0].z!).toFixed(1)}σ · watching the trend` : 'All readings within their own usual range.'}</p>
                {issue?.action && <p className="st-crewcard-act">→ {issue.action}</p>}
                <div className="st-sysmatrix">
                  {SYSTEMS.map((s) => (
                    <span
                      key={s.id}
                      className={`is-${v.sys[s.id]}`}
                      title={`${s.name}: ${CW_LABEL[v.sys[s.id]]}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        nav(`/crew/${v.m.id}?s=${s.id}`);
                      }}
                    >
                      <i />
                      {s.short}
                    </span>
                  ))}
                </div>
                <footer>
                  <div className="st-mini">
                    <Spark values={spark} s={issue?.status ?? 'green'} w={100} h={28} />
                    <span>{issue ? `${issue.label}, 4 weeks` : 'Heart rate, 4 weeks'}</span>
                  </div>
                  <div className="st-mini-stats">
                    <span title="Check-in streak">
                      <Icon.flame /> {streak[v.m.id] ?? 0}
                    </span>
                    <span title="XP">
                      <Icon.star /> {xp[v.m.id] ?? 0}
                    </span>
                  </div>
                  {v.checkedIn ? (
                    <span className="st-done">✓ Checked in</span>
                  ) : (
                    <button
                      className="st-btn is-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        nav(`/checkin/${v.m.id}`);
                      }}
                    >
                      Check in
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        <Card title="Countermeasure queue" right={<span className="st-muted">{queue.length} items</span>} className="st-queue">
          <ol>
            {queue.slice(0, 7).map((q) => (
              <li key={q.id} className={`is-${q.tone} cw-${q.cw ?? 'info'}`} onClick={() => nav(q.to)}>
                <i />
                <div>
                  <p className="st-q-who">
                    {q.cw && <b className={`st-q-cw is-${q.cw}`}>{CW_LABEL[q.cw]}</b>} {q.who}
                  </p>
                  <p className="st-q-title">{q.title}</p>
                  {q.detail && <p className="st-q-detail">{q.detail}</p>}
                </div>
                <span className="st-q-cta">
                  {q.cta} <Icon.arrow />
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Radiation exposure" right={sw && <Chip s={LEVEL_STATUS[sw.level]}>{LEVEL_WORD[sw.level]}</Chip>} className="st-radcard" onClick={() => nav('/radiation')}>
          <div className="st-radcard-body">
            <Ring value={maxCum / limit} color={maxCum / limit > 0.5 ? STATUS_COLOR.amber : '#5eead4'} size={118}>
              <b>{((maxCum / limit) * 100).toFixed(1)}%</b>
              <span>of career limit</span>
            </Ring>
            <dl>
              <div>
                <dt>Dose rate here</dt>
                <dd>
                  {data.crew.environments[env].dose_mSv_day} <small>mSv/day</small>
                </dd>
              </div>
              <div>
                <dt>Highest mission dose</dt>
                <dd>
                  {maxCum.toFixed(1)} <small>/ {limit} mSv</small>
                </dd>
              </div>
              <div>
                <dt>Latest flare</dt>
                <dd>
                  {sw?.latest?.flare_class ?? '—'} <small>{sw?.latest?.source_location ?? ''}</small>
                </dd>
              </div>
            </dl>
          </div>
          <p className="st-card-link">
            Forecast, dose per crew, May 2024 replay <Icon.arrow />
          </p>
        </Card>

        <Card title="Cabin air · feeds Neuro & sleep" right={<Chip s={cabinStatus}>{cabinStatus === 'green' ? 'In range' : WORD[cabinStatus]}</Chip>} className="st-cabcard">
          <div className="st-cab">
            {(cabin?.readings ?? [])
              .filter((r) => r.value != null)
              .slice(0, 4)
              .map((r) => (
                <div key={r.metric.key}>
                  <Dot s={r.status ?? 'green'} size={7} />
                  <b>
                    {r.value!.toFixed(r.metric.digits)} <small>{r.metric.unit}</small>
                  </b>
                  <span>{r.metric.short || r.metric.label}</span>
                </div>
              ))}
          </div>
          <p className="st-muted st-small">Recorded ISS Live! snapshot · NASA ECLSS telemetry</p>
        </Card>

        <Card title="Crew dose" className="st-dosecard" onClick={() => nav('/radiation')}>
          <div className="st-dosebars">
            {doses.map(({ v, d }) => (
              <div key={v.m.id}>
                <span>
                  {seatOf(v.m)} · {firstName(v.m)}
                </span>
                <div className="st-bar">
                  <i style={{ width: `${((d.cumulative_mSv ?? 0) / limit) * 100}%` }} />
                </div>
                <b>{fmtV('dose_mSv_cum', d.cumulative_mSv)} mSv</b>
              </div>
            ))}
          </div>
          <p className="st-muted st-small">
            NASA career limit {limit} mSv · at {data.crew.environments[env].dose_mSv_day} mSv/day, about {Math.round(doses[0]?.d.daysToLimit ?? 0)} days left
          </p>
        </Card>
      </div>
    </div>
  );
}
