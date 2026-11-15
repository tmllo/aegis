// Platform entry point. OWNER: platform builder (src/platform/**, public/sw.js).
//
// main.tsx calls initPlatform() once at start-up.
// TODO(platform builder):
//   - register public/sw.js (production builds only) and report offline
//     readiness for the Systems flight-readiness panel
//   - start the sound engine (Web Audio, synthesized: no audio file is
//     fetched). It listens to the bus ('wrist', 'alert', 'checkin', 'case')
//     and plays only while useStation.getState().soundOn is true. Audio may
//     start only after a user gesture.

export function initPlatform(): void {
  // Nothing yet: the app runs without a service worker and without sound.
}
