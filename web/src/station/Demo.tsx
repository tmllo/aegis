// Guided demo: the 90-second pitch path as six beats. Each beat opens the right screen; the card says
// what to point at. Arrow keys move between beats, Esc closes. Built from the live data, nothing scripted.
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CW_RANK, SYSTEMS, RANK, issueLine, useStationData } from './model';
import { roleOf } from './ds';
import { useStation } from './state';

interface Beat {
  to: string;
  title: string;
  say: string;
}

export function useBeats(): Beat[] {
  const { data, views } = useStationData();
  return useMemo(() => {
    if (!data) return [];
    const byRank = [...views].sort((a, b) => RANK[b.overall] - RANK[a.overall]);
    const red = byRank.find((v) => v.overall === 'red');
    const amber = byRank.find((v) => v.overall === 'amber');
    const mt = data.storm.meta.metrics_test;
    const sysOfCW = (v: (typeof views)[number]) => SYSTEMS.map((s) => s.id).sort((a, b) => CW_RANK[v.sys[b]] - CW_RANK[v.sys[a]])[0];
    const cleared = views.filter((v) => v.cw === 'nominal' || v.cw === 'advisory').length;
    const beats: Beat[] = [
      { to: '/', title: 'Crew health today', say: `${cleared} of ${views.length} crew cleared for EVA. Every reading is judged against that astronaut's own baseline, and every alert uses NASA's caution & warning classes, which say who has to act.` },
    ];
    if (amber) beats.push({ to: `/body/${amber.m.id}?s=${sysOfCW(amber)}`, title: `${roleOf(amber.m)} · caution`, say: `${amber.issue ? issueLine(amber.issue) : ''}. Fine by textbook ranges, flagged because it is not normal for this astronaut. Countermeasure loop: act, re-measure, close.` });
    if (red) beats.push({ to: `/body/${red.m.id}?s=${sysOfCW(red)}`, title: `${roleOf(red.m)} · warning`, say: `${red.issue ? issueLine(red.issue) : ''}. A warning puts them on hold for safety-critical tasks and opens a line to the flight surgeon.` });
    beats.push({ to: `/check/${(red ?? byRank[0]).m.id}`, title: 'Daily health check', say: 'About a minute: sleep and mind, a camera pulse scan, vitals, and a 30-second reaction test. Saving re-scores everything and closes the countermeasure loop.' });
    if (data.real) beats.push({ to: `/body/${(byRank[byRank.length - 1] ?? byRank[0]).m.id}?s=blood`, title: 'Proof on real NASA data', say: `On the published Inspiration4 blood panels, a personal baseline flags ${data.real.flags.filter((f) => f.kind === 'inside_lab_far_from_baseline').length} shifts that standard lab ranges call normal.` });
    beats.push({ to: '/radiation', title: 'Radiation early warning', say: `Radiation is the hazard that can't be felt. Trained on ${Number(data.storm.meta.train_period[1].slice(0, 4)) - Number(data.storm.meta.train_period[0].slice(0, 4)) + 1} years of NASA DONKI data, scored once on unseen 2024–2026: ${Math.round(mt.hit_rate * mt.n_storms)} of ${mt.n_storms} storms warned, about ${mt.false_alarms_per_month.toFixed(0)} false alarm a month.` });
    beats.push({ to: '/radiation#replay', title: 'May 2024 superstorm', say: 'Press play. The model never saw 2024. Watch the shelter warning go out hours ahead, then the emergency when the particles actually arrive.' });
    return beats;
  }, [data, views]);
}

export function Demo() {
  const step = useStation((s) => s.demoStep);
  const set = useStation((s) => s.setDemoStep);
  const beats = useBeats();
  const nav = useNavigate();
  const beat = step != null ? beats[step] : null;

  useEffect(() => {
    if (!beat) return;
    nav(beat.to);
  }, [beat, nav]);

  useEffect(() => {
    if (step == null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') set(Math.min(beats.length - 1, step + 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') set(Math.max(0, step - 1));
      if (e.key === 'Escape') set(null);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [step, beats.length, set]);

  if (!beat || step == null) return null;
  return (
    <div className="st-demo">
      <div className="st-demo-n">
        {beats.map((_, i) => (
          <i key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} onClick={() => set(i)} />
        ))}
      </div>
      <div className="st-demo-t">
        <b>
          {step + 1} · {beat.title}
        </b>
        <p>{beat.say}</p>
      </div>
      <div className="st-demo-a">
        <button className="st-btn is-ghost is-small" onClick={() => (step ? set(step - 1) : set(null))}>
          {step ? '←' : 'Close'}
        </button>
        {step < beats.length - 1 ? (
          <button className="st-btn is-primary is-small" onClick={() => set(step + 1)}>
            Next →
          </button>
        ) : (
          <button className="st-btn is-small" onClick={() => set(null)}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
