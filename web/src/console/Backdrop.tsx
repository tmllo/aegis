// A slow, dimmed Earth-limb loop behind the Environment and Systems text (rendered stills from
// NASA Blue/Black Marble with Solar System Scope clouds). Loaded after first paint.
import { useEffect, useState } from 'react';

const base = `${import.meta.env.BASE_URL}backdrops/`;

export function Backdrop() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const go = () => setOn(true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go);
    else window.setTimeout(go, 300);
  }, []);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="backdrop" aria-hidden>
      {on &&
        (reduce ? (
          <img src={`${base}day-limb-2560.jpg`} alt="" />
        ) : (
          <video autoPlay muted loop playsInline preload="auto" poster={`${base}day-limb-loop-poster.jpg`}>
            <source src={`${base}day-limb-loop-1280.webm`} type="video/webm" media="(max-width: 1440px)" />
            <source src={`${base}day-limb-loop-1920.webm`} type="video/webm" />
            <source src={`${base}day-limb-loop-1920.mp4`} type="video/mp4" />
          </video>
        ))}
    </div>
  );
}
