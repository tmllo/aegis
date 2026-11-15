// Loading screen driver (the screen itself is inline in index.html, so it is the first paint).
// The hairline follows the real loads: the data files are registered as items on three's
// DefaultLoadingManager, next to every GLB and texture the page asks for. When the manager
// is idle for a moment the screen fades into the app. ?boot=hold keeps it up (screenshots).
import { DefaultLoadingManager } from 'three';
import { useMissionStore } from './data/store';
import { loadCabin } from './data/cabin';

const el = document.getElementById('boot');
const line = el?.querySelector<HTMLElement>('.boot-line i') ?? null;
const hold = new URLSearchParams(location.search).get('boot') === 'hold';
const MAX_MS = 8000; // never block the app longer than this
const IDLE_MS = 300; // manager idle this long = done

let finished = false;
let idleTimer = 0;
let shown = 0.04;

function setProgress(p: number) {
  shown = Math.max(shown, Math.min(1, p));
  line?.style.setProperty('--p', shown.toFixed(3));
}

function finish() {
  if (finished || !el || hold) return;
  finished = true;
  setProgress(1);
  window.setTimeout(() => {
    el.classList.add('boot-out');
    window.setTimeout(() => el.remove(), 600);
  }, 180);
}

function track<T>(name: string, p: Promise<T>) {
  DefaultLoadingManager.itemStart(name);
  p.catch(() => undefined).finally(() => DefaultLoadingManager.itemEnd(name));
}

if (el) {
  const prev = { progress: DefaultLoadingManager.onProgress, load: DefaultLoadingManager.onLoad, start: DefaultLoadingManager.onStart };
  DefaultLoadingManager.onStart = (...a) => {
    window.clearTimeout(idleTimer);
    prev.start?.(...a);
  };
  DefaultLoadingManager.onProgress = (url, loaded, total) => {
    window.clearTimeout(idleTimer);
    setProgress(0.08 + 0.92 * (loaded / Math.max(total, 1)));
    prev.progress?.(url, loaded, total);
  };
  DefaultLoadingManager.onLoad = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(finish, IDLE_MS);
    prev.load?.();
  };

  track('data', useMissionStore.getState().load());
  track('cabin', loadCabin());
  window.setTimeout(finish, MAX_MS);
}
