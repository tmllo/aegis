// useReactionTest: the short PVT as a hook. The page shows one big target area; tap/click/Space calls tap().
//   const rt = useReactionTest({ subject, durationS: 60 });
//   rt.start(); rt.tap(); rt.cancel();
//   rt.phase: 'idle' | 'wait' | 'go' | 'done'   ('go' = the dot is showing)
//   rt.last (ms of the last reaction), rt.result {meanMs, medianMs, lapses, falseStarts, trials}, rt.progress 0..1
//   rt.baseline {status, usual}: against this person's previous results on this device
import { useCallback, useEffect, useRef, useState } from 'react';
import { againstBaseline, nextWait, score, type PvtResult } from './reaction';

export type ReactionPhase = 'idle' | 'wait' | 'go' | 'done';

const KEY = 'ex-pvt-v1';
function history(subject: string): number[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}')[subject] ?? []) as number[];
  } catch {
    return [];
  }
}
function remember(subject: string, mean: number) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    all[subject] = [...(all[subject] ?? []), mean].slice(-20);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked */
  }
}

export function useReactionTest({ subject, durationS = 60 }: { subject: string | null | undefined; durationS?: number }) {
  const [phase, setPhase] = useState<ReactionPhase>('idle');
  const [last, setLast] = useState<number | null>(null);
  const [result, setResult] = useState<PvtResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [baseline, setBaseline] = useState<ReturnType<typeof againstBaseline> | null>(null);
  const rts = useRef<number[]>([]);
  const falseStarts = useRef(0);
  const shownAt = useRef(0);
  const t0 = useRef(0);
  const timer = useRef(0);
  const ticker = useRef(0);
  const phaseRef = useRef<ReactionPhase>('idle');
  const setP = (p: ReactionPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clear = () => {
    window.clearTimeout(timer.current);
    window.clearInterval(ticker.current);
  };
  useEffect(() => clear, []);

  const finish = useCallback(() => {
    clear();
    const r = score(rts.current, falseStarts.current);
    setResult(r);
    setProgress(1);
    if (r.meanMs != null && subject) {
      setBaseline(againstBaseline(r.meanMs, history(subject)));
      remember(subject, r.meanMs);
    }
    setP('done');
  }, [subject]);

  const schedule = useCallback(() => {
    setP('wait');
    timer.current = window.setTimeout(() => {
      if ((performance.now() - t0.current) / 1000 >= durationS) return finish();
      shownAt.current = performance.now();
      setP('go');
      // no reaction in 3 s counts as a lapse of 3000 ms and the test moves on
      timer.current = window.setTimeout(() => {
        if (phaseRef.current !== 'go') return;
        rts.current.push(3000);
        setLast(3000);
        schedule();
      }, 3000);
    }, nextWait());
  }, [durationS, finish]);

  const start = useCallback(() => {
    clear();
    rts.current = [];
    falseStarts.current = 0;
    setLast(null);
    setResult(null);
    setBaseline(null);
    setProgress(0);
    t0.current = performance.now();
    ticker.current = window.setInterval(() => setProgress(Math.min(1, (performance.now() - t0.current) / 1000 / durationS)), 250);
    schedule();
  }, [durationS, schedule]);

  const tap = useCallback(() => {
    if (phaseRef.current === 'go') {
      window.clearTimeout(timer.current);
      const rt = Math.round(performance.now() - shownAt.current);
      rts.current.push(rt);
      setLast(rt);
      if ((performance.now() - t0.current) / 1000 >= durationS) finish();
      else schedule();
    } else if (phaseRef.current === 'wait') {
      falseStarts.current += 1;
      setLast(null);
    }
  }, [durationS, finish, schedule]);

  const cancel = useCallback(() => {
    clear();
    setP('idle');
    setProgress(0);
  }, []);

  return { phase, last, result, progress, baseline, start, tap, cancel };
}
