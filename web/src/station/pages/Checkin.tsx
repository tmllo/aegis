// Daily check-in: four short steps, each value scored live against the astronaut's own baseline,
// then a summary of what changed. Saving updates every screen at once (body colours, overview, queue).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MetricKey, Status } from '../../data/types';
import { buildView, firstName, fmtV, MOOD_WORD, seatOf, useStationData, WORD, SYSTEMS, RANK } from '../model';
import { useStation } from '../state';
import { Chip, cue, Dot, Icon } from '../ui';

interface Field {
  k: MetricKey;
  step: number;
  min: number;
  max: number;
  hint: string;
}

const STEPS: { title: string; sub: string; fields: Field[] }[] = [
  {
    title: 'Sleep & mood',
    sub: 'From your wrist actigraph, or your best estimate.',
    fields: [
      { k: 'sleep_h', step: 0.25, min: 2, max: 11, hint: 'Hours asleep last night' },
      { k: 'mood', step: 1, min: 1, max: 5, hint: 'How do you feel right now?' },
    ],
  },
  {
    title: 'Heart',
    sub: 'Seated, after 5 minutes of rest. Cuff at heart level.',
    fields: [
      { k: 'hr', step: 1, min: 35, max: 140, hint: 'Resting heart rate' },
      { k: 'bp_sys', step: 1, min: 80, max: 180, hint: 'Upper number' },
      { k: 'bp_dia', step: 1, min: 40, max: 120, hint: 'Lower number' },
    ],
  },
  {
    title: 'Body',
    sub: 'Forehead thermometer and a finger-prick glucose strip.',
    fields: [
      { k: 'temp', step: 0.1, min: 35, max: 40, hint: 'Body temperature' },
      { k: 'glucose', step: 1, min: 50, max: 250, hint: 'Fasting blood sugar' },
    ],
  },
  {
    title: 'Exercise',
    sub: 'Treadmill, bike and resistance device, total today.',
    fields: [{ k: 'exercise_min', step: 5, min: 0, max: 240, hint: 'Minutes of exercise' }],
  },
];

const FACES = ['', '😣', '🙁', '😐', '🙂', '😄'];

export default function Checkin() {
  const { data, views, env } = useStationData();
  const { id } = useParams();
  const nav = useNavigate();
  const save = useStation((s) => s.saveCheckin);
  const toast = useStation((s) => s.toast);
  const sound = useStation((s) => s.sound);
  const xp = useStation((s) => s.xp);
  const streak = useStation((s) => s.streak);
  const v = views.find((x) => x.m.id === id);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Partial<Record<MetricKey, number>>>({});

  // prefill with today's logged value (or the last one), so a check-in is a review, not a form
  useEffect(() => {
    if (!v || !data) return;
    const d: Partial<Record<MetricKey, number>> = {};
    for (const s of STEPS)
      for (const f of s.fields) {
        for (let i = v.m.series.length - 1; i >= 0; i--) {
          const val = v.m.series[i][f.k];
          if (val != null) {
            d[f.k] = val;
            break;
          }
        }
      }
    setDraft(d);
    setStep(0);
  }, [v?.m.id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => (v && data ? buildView(data.crew, data.crew.crew.find((m) => m.id === v.m.id)!, draft, env, true) : null), [v, data, draft, env]);

  if (!data) return null;
  if (!v || !preview) return <PickCrew />;

  const raw = data.crew.crew.find((m) => m.id === v.m.id)!;
  const before = buildView(data.crew, raw, undefined, env, false);
  const last = step === STEPS.length;
  const gained = 50 + (preview.overall === 'green' ? 25 : 0);

  const set = (k: MetricKey, val: number) => setDraft((d) => ({ ...d, [k]: Math.round(val * 100) / 100 }));
  const finish = () => {
    save(v.m.id, { at: Date.now(), values: draft, before: before.overall, after: preview.overall, xp: gained });
    cue('chime', sound);
    const changed = before.overall !== preview.overall;
    toast({
      tone: preview.overall === 'green' ? 'green' : preview.overall,
      title: `${firstName(v.m)} checked in · +${gained} XP`,
      body: changed ? `Status ${WORD[before.overall]} → ${WORD[preview.overall]}. Every screen is updated.` : `Status stays ${WORD[preview.overall]}. Readings logged against the personal baseline.`,
    });
    const worst = SYSTEMS.map((s) => s.id).sort((a, b) => RANK[preview.status[b]] - RANK[preview.status[a]])[0];
    nav(`/crew/${v.m.id}${preview.overall !== 'green' ? `?s=${worst}` : ''}`);
  };

  return (
    <div className="st-page st-checkin">
      <div className="st-ci-head">
        <div>
          <p className="st-cap">
            Daily check-in · {seatOf(v.m)} · {v.m.name}
          </p>
          <h2>{last ? 'Review and send' : STEPS[step].title}</h2>
          <p className="st-muted">{last ? 'Each value is compared with your own usual range, then sent to the flight surgeon with your log.' : STEPS[step].sub}</p>
        </div>
        <div className="st-ci-game">
          <span>
            <Icon.flame /> {streak[v.m.id] ?? 0}-day streak
          </span>
          <span>
            <Icon.star /> {xp[v.m.id] ?? 0} XP
          </span>
          <span className="st-ci-live">
            Live status <Chip s={preview.overall} solid={preview.overall !== 'green'} />
          </span>
        </div>
      </div>

      <ol className="st-steps">
        {[...STEPS.map((s) => s.title), 'Review'].map((t, i) => (
          <li key={t} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} onClick={() => setStep(i)}>
            <i>{i < step ? '✓' : i + 1}</i>
            {t}
          </li>
        ))}
      </ol>

      {!last ? (
        <div className="st-ci-fields">
          {STEPS[step].fields.map((f) => {
            const r = preview.rows[f.k];
            const val = draft[f.k] ?? f.min;
            const meta = data.crew.metrics[f.k];
            return (
              <div key={f.k} className={`st-field is-${r.status}`}>
                <div className="st-field-h">
                  <div>
                    <b>{meta.label}</b>
                    <span>{f.hint}</span>
                  </div>
                  <Chip s={r.status} />
                </div>
                {f.k === 'mood' ? (
                  <div className="st-moods">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} className={val === n ? 'is-on' : ''} onClick={() => (cue('tick', sound), set('mood', n))}>
                        <span>{FACES[n]}</span>
                        {MOOD_WORD[n]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="st-stepper">
                    <button onClick={() => (cue('tick', sound), set(f.k, Math.max(f.min, val - f.step)))} aria-label="Less">
                      −
                    </button>
                    <div className="st-stepper-v">
                      <b>{fmtV(f.k, val)}</b>
                      <small>{meta.unit}</small>
                    </div>
                    <button onClick={() => (cue('tick', sound), set(f.k, Math.min(f.max, val + f.step)))} aria-label="More">
                      +
                    </button>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={val} onChange={(e) => set(f.k, Number(e.target.value))} />
                  </div>
                )}
                <p className="st-field-foot">
                  {r.mean != null ? (
                    <>
                      Your usual {r.lo!.toFixed(f.step < 1 ? 1 : 0)}–{r.hi!.toFixed(f.step < 1 ? 1 : 0)} {meta.unit === '1-5' ? '' : meta.unit}
                      {r.z != null && <> · 3-day average {r.z >= 0 ? '+' : '−'}{Math.abs(r.z).toFixed(1)}σ</>}
                    </>
                  ) : (
                    <>Safe range {meta.absolute_red.min}–{meta.absolute_red.max}</>
                  )}
                  {r.status !== 'green' && r.action && <span className={`is-${r.status}`}> · {r.action}</span>}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <Review before={before.status} after={preview.status} rows={STEPS.flatMap((s) => s.fields.map((f) => f.k)).map((k) => ({ k, label: data.crew.metrics[k].label, unit: data.crew.metrics[k].unit, val: draft[k] ?? null, was: raw.series.find((r) => r.date === data.crew.mission.today)?.[k] ?? null, status: preview.rows[k].status }))} gained={gained} />
      )}

      <div className="st-ci-nav">
        <button className="st-btn is-ghost" onClick={() => (step ? setStep(step - 1) : nav(-1))}>
          {step ? '← Back' : 'Cancel'}
        </button>
        {!last ? (
          <button className="st-btn is-primary is-xl" onClick={() => (cue('tick', sound), setStep(step + 1))}>
            Next <Icon.arrow />
          </button>
        ) : (
          <button className="st-btn is-white is-xl" onClick={finish}>
            Save & send to surgeon · +{gained} XP
          </button>
        )}
      </div>
    </div>
  );
}

function Review({ before, after, rows, gained }: { before: Record<string, Status>; after: Record<string, Status>; rows: { k: MetricKey; label: string; unit: string; val: number | null; was: number | null; status: Status }[]; gained: number }) {
  return (
    <div className="st-review">
      <div className="st-review-sys">
        {SYSTEMS.map((s) => (
          <div key={s.id} className={`is-${after[s.id]}`}>
            <span>{s.name}</span>
            <p>
              <Dot s={before[s.id] as Status} /> {WORD[before[s.id] as Status]}
              {before[s.id] !== after[s.id] && (
                <>
                  {' '}
                  → <Dot s={after[s.id] as Status} /> <b>{WORD[after[s.id] as Status]}</b>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
      <table className="st-review-t">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={`is-${r.status}`}>
              <td>{r.label}</td>
              <td className="st-num">
                {r.k === 'mood' && r.val != null ? `${r.val} · ${MOOD_WORD[r.val]}` : fmtV(r.k, r.val)} <small>{r.unit === '1-5' ? '' : r.unit}</small>
              </td>
              <td>
                <Chip s={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="st-reward">
        <Icon.star />
        <div>
          <b>+{gained} XP</b>
          <span>{gained > 50 ? 'Mission-ready bonus: all systems nominal' : 'Logged. Consistent readings make your baseline sharper.'}</span>
        </div>
      </div>
    </div>
  );
}

function PickCrew() {
  const { views } = useStationData();
  const nav = useNavigate();
  return (
    <div className="st-page st-checkin">
      <div className="st-ci-head">
        <div>
          <p className="st-cap">Daily check-in</p>
          <h2>Who is checking in?</h2>
          <p className="st-muted">About a minute: sleep, mood, heart, body, exercise.</p>
        </div>
      </div>
      <div className="st-pick">
        {views.map((v) => (
          <button key={v.m.id} className={`st-pickcard is-${v.overall}`} onClick={() => nav(`/checkin/${v.m.id}`)}>
            <div className="st-avatar is-big">{seatOf(v.m)}</div>
            <b>{v.m.name}</b>
            <span>{v.m.role}</span>
            {v.checkedIn ? <em className="st-done">✓ Done today</em> : <em>Due today</em>}
          </button>
        ))}
      </div>
    </div>
  );
}
