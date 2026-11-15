// Guided demo: the 90-second pitch path as six beats. Each beat opens the right screen; the card says
// what to point at. Arrow keys move between beats, Esc closes. Built from the live data, nothing scripted.
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SYSTEMS, RANK, firstName, issueLine, useStationData } from './model';
import { useStation } from './state';
import { Icon } from './ui';

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
    const sysOf = (v: (typeof views)[number]) => SYSTEMS.map((s) => s.id).sort((a, b) => RANK[v.status[b]] - RANK[v.status[a]])[0];
    const mt = data.storm.meta.metrics_test;
    const beats: Beat[] = [
      { to: '/', title: 'Today on board', say: `One screen for the whole crew at ${data.crew.mission.name.replace(' (sim)', '')}. Status comes from each astronaut's own baseline, not population averages.` },
    ];
    if (amber) beats.push({ to: `/crew/${amber.m.id}?s=${sysOf(amber)}`, title: `${firstName(amber.m)}: watch`, say: `${amber.issue ? issueLine(amber.issue) : ''}. Fine by textbook ranges, flagged because it is not normal for this astronaut.` });
    if (red) beats.push({ to: `/crew/${red.m.id}?s=${sysOf(red)}`, title: `${firstName(red.m)}: act now`, say: `${red.issue ? issueLine(red.issue) : ''}. Red means a clear action and one tap to the flight surgeon.` });
    beats.push({ to: `/checkin/${(red ?? byRank[0]).m.id}`, title: 'Daily check-in', say: 'About a minute. Every value is scored live against the personal baseline; saving updates the body, the overview and the queue.' });
    beats.push({ to: '/radiation', title: 'Radiation early warning', say: `Trained on ${Number(data.storm.meta.train_period[1].slice(0, 4)) - Number(data.storm.meta.train_period[0].slice(0, 4)) + 1} years of NASA DONKI data, scored once on unseen 2024–2026: ${Math.round(mt.hit_rate * mt.n_storms)} of ${mt.n_storms} storms warned, ~${mt.false_alarms_per_month.toFixed(0)} false alarm a month.` });
    beats.push({ to: '/radiation#replay', title: 'May 2024 superstorm', say: 'Press play. The model never saw 2024. Watch the shelter order go out, then the particles arrive hours later.' });
    return beats;
  }, [data, views]);
}

export function DemoButton() {
  const set = useStation((s) => s.setDemoStep);
  const step = useStation((s) => s.demoStep);
  return (
    <button className={`st-demo-btn${step != null ? ' is-on' : ''}`} onClick={() => set(step == null ? 0 : null)} title="Guided demo">
      <Icon.play />
      <span>Demo</span>
    </button>
  );
}

export function Demo() {
  const step = useStation((s) => s.demoStep);
  const set = useStation((s) => s.setDemoStep);
  const beats = useBeats();
  const nav = useNavigate();
  const beat = step != null ? beats[step] : null;

  useEffect(() => {
    if (!beat) return;
    nav(beat.to.replace('#replay', ''));
    if (beat.to.endsWith('#replay')) window.setTimeout(() => document.querySelector('.st-replay')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
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
