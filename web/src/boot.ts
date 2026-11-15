// Loading screen driver (the screen itself, LQIP -> poster -> intro clip, is inline in index.html).
// The hairline follows the real loads: the data files are registered as items on three's
// DefaultLoadingManager, next to every GLB and texture the page asks for (routes add their own
// heavy items, e.g. the body model). Timeline with the intro (first load of a session):
//   0.6 s to 3.5 s the hairline fills, never faster than the clock and never past the real loads;
//   at 3.5 s, if everything is loaded, a 700 ms crossfade into the app; otherwise the clip plays on
//   (to 5.4 s, then holds its last frame) until the loads finish. Skip / Enter / Esc close at once.
// Without the intro it closes as soon as the loads finish. ?boot=hold keeps it up (screenshots).
import { DefaultLoadingManager } from 'three';
import { useMissionStore } from './data/store';
import { loadCabin } from './data/cabin';

const el = document.getElementById('boot');
const line = el?.querySelector<HTMLElement>('.boot-line i') ?? null;
const hold = new URLSearchParams(location.search).get('boot') === 'hold';
const intro = el?.dataset.intro === 'playing';
const MIN_MS = 3500; // intro length
const FILL_FROM = 600;
const MAX_MS = 15000; // never block the app longer than this
const IDLE_MS = 300; // manager idle this long = loaded

let real = 0.04; // fraction of real loads done
let ready = false;
let closed = false;
let idleTimer = 0;

function paint() {
  if (!line || closed) return;
  const t = performance.now();
  const clock = intro ? Math.max(0, Math.min(1, (t - FILL_FROM) / (MIN_MS - FILL_FROM))) : 1;
  line.style.setProperty('--p', Math.max(0.02, Math.min(real, clock)).toFixed(3));
  requestAnimationFrame(paint);
}

function close() {
  if (closed || !el || hold) return;
  closed = true;
  line?.style.setProperty('--p', '1');
  el.classList.add('boot-out');
  document.documentElement.classList.add('boot-done'); // console bars animate in now
  window.setTimeout(() => el.remove(), 800);
}

function tryClose() {
  if (closed || !ready) return;
  const wait = intro ? MIN_MS - performance.now() : 0;
  if (wait > 0) window.setTimeout(tryClose, wait);
  else close();
}

function loaded() {
  real = 1;
  ready = true;
  tryClose();
}

function track<T>(name: string, p: Promise<T>) {
  DefaultLoadingManager.itemStart(name);
  p.catch(() => undefined).finally(() => DefaultLoadingManager.itemEnd(name));
}

if (el) {
  // the mark shows in the app's own font, so it does not jump at the handoff
  void document.fonts.load('300 28px "Inter Tight"').then(() => el.classList.add('boot-font'), () => el.classList.add('boot-font'));
  // Count items by wrapping the manager's own itemStart/itemEnd, not its onStart/onProgress/onLoad
  // callbacks: drei's useProgress store overwrites those callbacks as soon as drei is imported,
  // which cut this screen off from the loads (it then only closed at MAX_MS).
  const m = DefaultLoadingManager;
  const start0 = m.itemStart.bind(m);
  const end0 = m.itemEnd.bind(m);
  let started = 0;
  let ended = 0;
  m.itemStart = (url: string) => {
    started++;
    window.clearTimeout(idleTimer);
    ready = false; // a new heavy load (e.g. the route's model) started
    start0(url);
  };
  m.itemEnd = (url: string) => {
    ended++;
    real = Math.max(real, Math.min(0.97, 0.08 + 0.92 * (ended / Math.max(started, 1))));
    window.clearTimeout(idleTimer);
    if (ended >= started) idleTimer = window.setTimeout(loaded, IDLE_MS);
    end0(url);
  };
  el.addEventListener('intro-skip', close);

  track('data', useMissionStore.getState().load());
  track('cabin', loadCabin());
  // Give the route's lazy chunk time to register its own heavy loads before the screen may close.
  track('route', new Promise((r) => window.setTimeout(r, 900)));
  window.setTimeout(loaded, MAX_MS);
  requestAnimationFrame(paint);
}
