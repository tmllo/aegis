// Ambient drone and soft UI ticks, synthesized with WebAudio (no files). Off by default.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = false;

function build() {
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.connect(master);
  for (const [f, g] of [
    [55, 0.05],
    [82.4, 0.03],
    [110.3, 0.015],
  ]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const gain = ctx.createGain();
    gain.gain.value = g;
    // a very slow swell
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + f / 4000;
    const depth = ctx.createGain();
    depth.gain.value = g * 0.4;
    lfo.connect(depth).connect(gain.gain);
    o.connect(gain).connect(lp);
    o.start();
    lfo.start();
  }
}

export function setAudio(next: boolean) {
  on = next;
  if (on && !ctx) build();
  if (!ctx || !master) return;
  void ctx.resume();
  master.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.4);
}

export const audioOn = () => on;

/** A short soft tick for taps. */
export function tick() {
  if (!on || !ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = 1760;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.07);
}
