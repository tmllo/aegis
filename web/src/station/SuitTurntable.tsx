// The suit, photoreal: a Cycles turntable of the Apollo 11 A7L scan (Smithsonian 3D, CC0; patches and flag
// painted out) with a gold reflective visor, one hard sun and texture detail
// (blender-assets/_scripts/suit-render/turntable_app.py). It is rendered through the app's own 3D camera
// (fov 34, same position and target, orbiting the same way), so drawn at the stage height each frame lines
// up with the skeleton, vessels and organs. Frame i = shared angle 2*pi*i/N; one play = one turn at
// SPIN_SPEED, in step with spin.ts. WebM VP9 alpha for Chrome/Firefox, HEVC alpha for Safari / iPhone.
import { useEffect, useRef, useState } from 'react';
import { spin, SPIN_SPEED } from './spin';
import './suit.css';

const TURN_S = (2 * Math.PI) / SPIN_SPEED; // one turn, seconds
const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BASE = import.meta.env.BASE_URL;
/** Safari decodes HEVC with alpha; everyone else gets VP9 with alpha */
const SAFARI = typeof navigator !== 'undefined' && /Apple/.test(navigator.vendor) && !/CriOS|FxiOS|Chrome/.test(navigator.userAgent);
// phones get the 600 px encode (1.6-1.9 MB instead of 4.5-8.4 MB): still sharper than the stage at 3x
const SMALL = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 900px)').matches;
const SRC = `${BASE}suit/turntable${SMALL ? '-600' : ''}.${SAFARI ? 'mp4' : 'webm'}`;
/** video time for the shared angle: the render's camera orbits exactly like the 3D camera, so t grows with a */
const timeOf = (a: number, d: number) => ((((a / (2 * Math.PI)) * d) % d) + d) % d;
const angleOf = (t: number, d: number) => (t / d) * 2 * Math.PI;

export default function SuitTurntable() {
  const [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const resume = useRef(0);
  const idle = useRef(true);

  const dur = () => {
    const v = video.current;
    return v && isFinite(v.duration) && v.duration > 0 ? v.duration : TURN_S;
  };
  const seekTo = (a: number) => {
    const v = video.current;
    if (v) v.currentTime = timeOf(a, dur());
  };

  // start at the shared angle, then let the video drive the angle while it plays
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onReady = () => {
      v.playbackRate = dur() / TURN_S; // one play = one turn at the shared speed, whatever the encoded length
      seekTo(spin.a);
      setReady(true);
      if (!REDUCE) void v.play().catch(() => undefined);
    };
    if (v.readyState >= 1) onReady();
    else v.addEventListener('loadedmetadata', onReady, { once: true });
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (idle.current && !v.paused) spin.a = angleOf(v.currentTime, dur());
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('loadedmetadata', onReady);
    };
  }, []);

  const pause = () => {
    idle.current = false;
    window.clearTimeout(resume.current);
    video.current?.pause();
  };
  const later = () => {
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => {
      idle.current = true;
      if (!REDUCE) void video.current?.play().catch(() => undefined);
    }, 4000);
  };
  useEffect(() => () => window.clearTimeout(resume.current), []);

  return (
    <div
      className={`suit-tt${ready ? ' is-ready' : ''}`}
      role="img"
      aria-label="Apollo 11 A7L spacesuit, turn it by dragging or with the arrow keys"
      tabIndex={0}
      onPointerDown={(e) => {
        pause();
        drag.current = { x: e.clientX, a: spin.a };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        spin.a = d.a - (e.clientX - d.x) * 0.012;
        seekTo(spin.a);
      }}
      onPointerUp={() => {
        drag.current = null;
        later();
      }}
      onPointerCancel={() => {
        drag.current = null;
        later();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        pause();
        spin.a += (e.key === 'ArrowLeft' ? -1 : 1) * 0.1;
        seekTo(spin.a);
        later();
      }}
    >
      <video ref={video} className="suit-tt-video" src={SRC} muted playsInline loop preload="auto" disablePictureInPicture />
      {!ready && <p className="suit-tt-wait">Loading suit</p>}
    </div>
  );
}
