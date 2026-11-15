// "Today on board": the whole crew, the action queue, radiation and cabin air on one screen.
// Every card is a door to the screen that handles it.
import { useNavigate } from 'react-router-dom';
import { useCabin } from '../../data/cabin';
import type { Status } from '../../data/types';
import { LEVEL_STATUS, LEVEL_WORD, SYSTEMS, WORD, firstName, fmtV, issueLine, seatOf, useStationData, worstOf } from '../model';
import { useStation } from '../state';
import { Card, Chip, Dot, Icon, Ring, Spark, STATUS_COLOR } from '../ui';

export default function Overview() {
  const { data, views, sw, doses, queue, env } = useStationData();
  const xp = useStation((s) => s.xp);
  const streak = useStation((s) => s.streak);
  const { cabin } = useCabin();
  const nav = useNavigate();
  if (!data) return null;

  const counts = { red: views.filter((v) => v.overall === 'red').length, amber: views.filter((v) => v.overall === 'amber').length };
  const done = views.filter((v) => v.checkedIn).length;
  const cabinStatus: Status = cabin ? cabin.readings.reduce<Status>((a, r) => worstOf(a, r.status ?? 'green'), 'green') : 'green';
  const station: Status = worstOf(...views.map((v) => v.overall), sw ? LEVEL_STATUS[sw.level] : 'green', cabinStatus);
  const summary = [
    counts.red ? `${counts.red} crew member${counts.red > 1 ? 's' : ''} need${counts.red > 1 ? '' : 's'} action` : null,
    counts.amber ? `${counts.amber} to watch` : null,
    !counts.red && !counts.amber ? 'All crew within their own baselines' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const maxCum = Math.max(...doses.map((d) => d.d.cumulative_mSv ?? 0));
  const limit = data.crew.career_limit_mSv;

  return (
    <div className="st-page st-overview">
      <section className="st-hero">
        <div>
          <p className="st-cap">Today on board</p>
          <h2>
            <span className={`st-word is-${station}`}>{WORD[station]}</span>
            <span className="st-hero-line">
              {summary}. Space weather {sw ? LEVEL_WORD[sw.level].toLowerCase() : '—'}. Cabin air {cabinStatus === 'green' ? 'in range' : WORD[cabinStatus].toLowerCase()}.
            </span>
          </h2>
        </div>
        <div className="st-hero-stats">
          <div>
            <b>
              {done}/{views.length}
            </b>
            <span>check-ins today</span>
          </div>
          <div>
            <b>{queue.filter((q) => q.tone === 'red' || q.tone === 'amber').length}</b>
            <span>open actions</span>
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
              <article key={v.m.id} className={`st-crewcard is-${v.overall}`} onClick={() => nav(`/crew/${v.m.id}`)}>
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
                  <Chip s={v.overall} solid={v.overall !== 'green'} />
                </header>
                <p className="st-crewcard-issue">{issue ? issueLine(issue) : 'All readings within their own usual range.'}</p>
                {issue?.action && <p className="st-crewcard-act">→ {issue.action}</p>}
                <div className="st-sysrow">
                  {SYSTEMS.map((s) => (
                    <span key={s.id} className={`st-sys is-${v.status[s.id]}`} title={`${s.name}: ${WORD[v.status[s.id]]}`}>
                      <Dot s={v.status[s.id]} size={8} />
                      {s.id === 'whole_body' ? 'Body' : s.name.split(' ')[0]}
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

        <Card title="Action queue" right={<span className="st-muted">{queue.length} items</span>} className="st-queue">
          <ol>
            {queue.slice(0, 7).map((q) => (
              <li key={q.id} className={`is-${q.tone}`} onClick={() => nav(q.to)}>
                <i />
                <div>
                  <p className="st-q-who">{q.who}</p>
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

        <Card title="Radiation" right={sw && <Chip s={LEVEL_STATUS[sw.level]}>{LEVEL_WORD[sw.level]}</Chip>} className="st-radcard" onClick={() => nav('/radiation')}>
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

        <Card title="Cabin air" right={<Chip s={cabinStatus}>{cabinStatus === 'green' ? 'In range' : WORD[cabinStatus]}</Chip>} className="st-cabcard">
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
