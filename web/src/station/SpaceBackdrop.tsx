// Background behind every tab in the dark theme (Emile, 16 Nov): real footage of Earth filmed from the
// International Space Station ("Earth from Space in 4K – Expedition 65 Edition", NASA JSC, public domain,
// images.nasa.gov jsc2022m000172). A clean 66 s stretch over North Africa, turned so Earth sits at the
// bottom, its tail cross-faded into its head so the loop has no seam.
// Loading: the 70 KB first frame shows at once (it is also the poster), then the video: 1600 px (4.3 MB) on
// wide screens, 960 px (2 MB) on phones. Data saver or reduced motion keep the still only. Not mounted on
// the Radiation page, which draws its own scene, so that page never downloads it.
import { useLocation } from 'react-router-dom';

const mq = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
const STILL =
  mq('(prefers-reduced-motion: reduce)') ||
  (typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true);
const SRC = mq('(max-width: 900px)') ? '/space/earth-iss-960.mp4' : '/space/earth-iss.mp4';

export default function SpaceBackdrop() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/radiation')) return null;
  return (
    <div className="space-bg is-earth is-video" aria-hidden>
      {STILL ? (
        <img className="space-media" src="/space/earth-iss.jpg" alt="" decoding="async" />
      ) : (
        <video className="space-media" src={SRC} poster="/space/earth-iss.jpg" muted playsInline autoPlay loop preload="auto" disablePictureInPicture />
      )}
    </div>
  );
}
