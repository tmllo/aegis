// Pure signal processing for the camera scan (remote photoplethysmography, rPPG).
// No DOM, no React: everything here is testable on synthetic signals (signal.test.ts).
//
// Pipeline per scan:
//   per-frame mean R, G, B of the skin box  ->  resample to a fixed rate
//   -> POS pulse signal (Wang et al. 2017, "Algorithmic Principles of Remote PPG")
//   -> detrend + band-pass (heart 0.7-3 Hz = 42-180 bpm)
//   -> spectrum peak = heart rate; peak share of band power = confidence.
// Breathing: the slow (0.1-0.5 Hz = 6-30 /min) part of the green trace, same spectral method.
// Camera estimate, not a medical device.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Sample extends Rgb {
  /** milliseconds (performance.now()) */
  t: number;
}

export interface RateEstimate {
  /** per minute */
  rate: number;
  /** 0..1: share of the band's power that sits at the peak */
  confidence: number;
}

export const HEART_BAND: [number, number] = [0.7, 3.0];
export const BREATH_BAND: [number, number] = [0.1, 0.5];

const mean = (x: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : 0;
};

const std = (x: ArrayLike<number>): number => {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2;
  return x.length ? Math.sqrt(s / x.length) : 0;
};

/** Linear resampling of irregular camera timestamps to a fixed rate fs (Hz). */
export function resample(samples: Sample[], fs: number): Rgb[] {
  if (samples.length < 2) return samples.map(({ r, g, b }) => ({ r, g, b }));
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const n = Math.floor(((t1 - t0) / 1000) * fs) + 1;
  const out: Rgb[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j];
    const b = samples[j + 1];
    const w = b.t === a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    out.push({ r: a.r + (b.r - a.r) * w, g: a.g + (b.g - a.g) * w, b: a.b + (b.b - a.b) * w });
  }
  return out;
}

/** POS pulse signal: project temporally normalised RGB onto the plane orthogonal to skin tone, overlap-add. */
export function pos(rgb: Rgb[], fs: number): Float64Array {
  const n = rgb.length;
  const h = new Float64Array(n);
  const l = Math.max(2, Math.round(1.6 * fs)); // 1.6 s window
  for (let start = 0; start + l <= n; start++) {
    let mr = 0, mg = 0, mb = 0;
    for (let k = start; k < start + l; k++) {
      mr += rgb[k].r; mg += rgb[k].g; mb += rgb[k].b;
    }
    mr /= l; mg /= l; mb /= l;
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;
    const s1 = new Float64Array(l);
    const s2 = new Float64Array(l);
    for (let k = 0; k < l; k++) {
      const c = rgb[start + k];
      const rn = c.r / mr, gn = c.g / mg, bn = c.b / mb;
      s1[k] = gn - bn;
      s2[k] = -2 * rn + gn + bn;
    }
    const sd2 = std(s2);
    const alpha = sd2 > 1e-12 ? std(s1) / sd2 : 0;
    const seg = new Float64Array(l);
    for (let k = 0; k < l; k++) seg[k] = s1[k] + alpha * s2[k];
    const m = mean(seg);
    for (let k = 0; k < l; k++) h[start + k] += seg[k] - m;
  }
  return h;
}

/** Remove slow drift (lighting, auto-exposure) with a moving-average high-pass. */
export function detrend(x: ArrayLike<number>, fs: number, seconds = 1.5): Float64Array {
  const n = x.length;
  const w = Math.max(1, Math.round(seconds * fs));
  const out = new Float64Array(n);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - (w >> 1));
    const b = Math.min(n, i + (w >> 1) + 1);
    out[i] = x[i] - (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

/** Power spectrum of a real signal by direct DFT on a zero-padded grid (n is small: <= ~1000 frames). */
function spectrum(x: ArrayLike<number>, fs: number, band: [number, number], resolutionHz = 0.005): { f: number[]; p: number[] } {
  const n = x.length;
  const m = mean(x);
  // Hann window cuts leakage between the heart and breathing peaks
  const xw = new Float64Array(n);
  for (let i = 0; i < n; i++) xw[i] = (x[i] - m) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
  const f: number[] = [];
  const p: number[] = [];
  for (let freq = band[0]; freq <= band[1] + 1e-9; freq += resolutionHz) {
    const w = (2 * Math.PI * freq) / fs;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      re += xw[i] * Math.cos(w * i);
      im -= xw[i] * Math.sin(w * i);
    }
    f.push(freq);
    p.push(re * re + im * im);
  }
  return { f, p };
}

/** Dominant rate in a band, per minute, with a 0..1 confidence (peak +-0.1 Hz share of band power). */
export function dominantRate(x: ArrayLike<number>, fs: number, band: [number, number]): RateEstimate | null {
  if (x.length < fs * 4) return null;
  const { f, p } = spectrum(x, fs, band);
  let k = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[k]) k = i;
  const total = p.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let near = 0;
  for (let i = 0; i < p.length; i++) if (Math.abs(f[i] - f[k]) <= 0.1) near += p[i];
  return { rate: f[k] * 60, confidence: Math.min(1, near / total) };
}

export interface ScanResult {
  bpm: number | null;
  breathing: number | null;
  /** 0..1, from the heart-rate spectrum, lowered by motion and bad light */
  confidence: number;
}

export interface Quality {
  /** 0..1, fraction of frames with a usable brightness (not too dark, not clipped) */
  light: number;
  /** 0..1, 1 = still */
  stillness: number;
}

/** Brightness and motion checks on the raw samples. */
export function quality(samples: Sample[]): Quality {
  if (!samples.length) return { light: 0, stillness: 0 };
  let ok = 0;
  for (const s of samples) {
    const y = 0.299 * s.r + 0.587 * s.g + 0.114 * s.b;
    if (y > 40 && y < 235) ok++;
  }
  // frame-to-frame jumps of the box mean that are far larger than a pulse (pulse is < ~1 level)
  let jumps = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i].g - samples[i - 1].g) + Math.abs(samples[i].r - samples[i - 1].r);
    if (d > 6) jumps++;
  }
  return { light: ok / samples.length, stillness: 1 - Math.min(1, (jumps / samples.length) * 10) };
}

/** Full estimate from raw camera samples. fs: processing rate (30 Hz default). */
export function estimate(samples: Sample[], fs = 30): ScanResult {
  const rgb = resample(samples, fs);
  if (rgb.length < fs * 6) return { bpm: null, breathing: null, confidence: 0 };
  const pulse = detrend(pos(rgb, fs), fs, 1.5);
  const heart = dominantRate(pulse, fs, HEART_BAND);
  // breathing: slow component of the green trace (chest motion and venous return modulate it)
  const g = rgb.map((c) => c.g);
  const slow = detrend(g, fs, 12);
  const breath = rgb.length >= fs * 15 ? dominantRate(slow, fs, BREATH_BAND) : null;
  const q = quality(samples);
  const conf = heart ? heart.confidence * Math.min(1, q.light * 1.1) * q.stillness : 0;
  return {
    bpm: heart ? Math.round(heart.rate) : null,
    breathing: breath && breath.confidence > 0.35 ? Math.round(breath.rate) : null,
    confidence: Math.round(conf * 100) / 100,
  };
}
