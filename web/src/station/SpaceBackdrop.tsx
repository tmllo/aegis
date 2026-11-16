// Background behind every tab in the dark theme (Emile, 16 Nov): Earth from orbit, rendered in Blender
// from NASA Blue Marble + Black Marble (public domain) under the real NASA SVS Deep Star Maps 2020 sky
// (blender-assets/_scripts/backdrops/backdrop.py earth). One still image with a very slow drift (CSS),
// so it costs nothing next to the 3D body. Hidden on the Radiation page, which draws its own scene.
export default function SpaceBackdrop() {
  return (
    <div className="space-bg is-still is-earth" aria-hidden>
      <div className="space-still" style={{ backgroundImage: 'url(/space/bg-earth.jpg)' }} />
    </div>
  );
}
