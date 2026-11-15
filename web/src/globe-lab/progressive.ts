// Progressive textures: small maps suspend the first view (fast first paint), full-size maps
// load in the background after the page is idle and replace them in place.
import { useEffect, useState } from 'react';
import * as THREE from 'three';

const idle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
};

/** Loads `urls` after the first paint plus `delayMs`; returns them in order when all are ready. */
export function useLateTextures(urls: string[], prep: (t: THREE.Texture, i: number) => void, delayMs = 1200): THREE.Texture[] | null {
  const key = urls.join('|');
  const [tex, setTex] = useState<THREE.Texture[] | null>(null);
  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture[] = [];
    const timer = setTimeout(
      () =>
        idle(() => {
          const loader = new THREE.TextureLoader();
          Promise.all(urls.map((u) => loader.loadAsync(u)))
            .then((ts) => {
              loaded = ts;
              if (!alive) return ts.forEach((t) => t.dispose());
              ts.forEach(prep);
              setTex(ts);
            })
            .catch(() => undefined);
        }),
      delayMs,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
      loaded.forEach((t) => t.dispose());
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return tex;
}
