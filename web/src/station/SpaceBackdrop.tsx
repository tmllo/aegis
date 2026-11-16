// Background behind every tab in the dark theme (Emile, 16 Nov): real footage of Earth filmed from the
// International Space Station ("Earth from Space in 4K – Expedition 65 Edition", NASA JSC, public domain,
// images.nasa.gov jsc2022m000172). A clean 66 s stretch over North Africa, turned so Earth sits at the
// bottom, its tail cross-faded into its head so the loop has no seam. Under prefers-reduced-motion only
// the still frame shows. Hidden on the Radiation page, which draws its own scene.
const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function SpaceBackdrop() {
  return (
    <div className="space-bg is-earth is-video" aria-hidden>
      {REDUCE ? (
        <img className="space-media" src="/space/earth-iss.jpg" alt="" />
      ) : (
        <video className="space-media" src="/space/earth-iss.mp4" poster="/space/earth-iss.jpg" muted playsInline autoPlay loop preload="auto" disablePictureInPicture />
      )}
    </div>
  );
}
