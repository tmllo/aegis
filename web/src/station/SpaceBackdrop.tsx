// Background behind every tab in the dark theme (Emile, 16 Nov): real footage of Earth filmed from the
// International Space Station ("Earth from Space in 4K – Expedition 65 Edition", NASA JSC, public domain,
// images.nasa.gov jsc2022m000172). A clean 66 s stretch over North Africa, turned so Earth sits at the
// bottom, its tail cross-faded into its head so the loop has no seam.
// Loading: the 70 KB first frame shows at once, then the video: 1600 px (4.3 MB) on wide screens, 960 px
// (2 MB) on phones. Data saver or reduced motion keep the still only. Not mounted on the Radiation page,
// which draws its own scene, so that page never downloads it.
// Phones (Emile: "should play on mobile automatically, no play button"): the still frame sits underneath
// and the video only fades in once it is really playing, so a phone that refuses autoplay (iOS Low Power
// Mode) shows the still Earth, never a play button. Muted is set on the element itself (React only sets the
// property, and iOS reads the attribute), and a refused start is retried on the first touch and whenever
// the tab comes back.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const mq = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
const STILL =
  mq('(prefers-reduced-motion: reduce)') ||
  (typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true);
const SRC = mq('(max-width: 900px)') ? '/space/earth-iss-960.mp4' : '/space/earth-iss.mp4';
const POSTER = '/space/earth-iss.jpg';

function EarthVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');

    const start = () => {
      if (!v.paused) return;
      v.play().catch(() => {
        /* refused (Low Power Mode, data saver): the still frame stays; retried on the next touch */
      });
    };
    const onPlaying = () => setPlaying(true);
    const onVisible = () => document.visibilityState === 'visible' && start();
    const events = ['touchstart', 'pointerdown', 'keydown', 'scroll'] as const;

    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', start);
    document.addEventListener('visibilitychange', onVisible);
    events.forEach((e) => window.addEventListener(e, start, { passive: true }));
    start();
    return () => {
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', start);
      document.removeEventListener('visibilitychange', onVisible);
      events.forEach((e) => window.removeEventListener(e, start));
    };
  }, []);

  return (
    <video
      ref={ref}
      className={`space-media space-video${playing ? ' is-playing' : ''}`}
      src={SRC}
      muted
      playsInline
      autoPlay
      loop
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      controls={false}
      tabIndex={-1}
    />
  );
}

export default function SpaceBackdrop() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/radiation')) return null;
  return (
    <div className="space-bg is-earth is-video" aria-hidden>
      <img className="space-media" src={POSTER} alt="" decoding="async" fetchPriority="high" />
      {!STILL && <EarthVideo />}
    </div>
  );
}
