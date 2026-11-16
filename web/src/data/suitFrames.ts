// Fetches the suit turntable frames (static files in public/suit, rendered in Blender). Lives in src/data
// because only this layer loads files (docs/ARCHITECTURE.md).
export const suitFrameUrl = (i: number) => `${import.meta.env.BASE_URL}suit/f${String(i).padStart(3, '0')}.webp`;

export function loadSuitFrames(n: number): Promise<(Blob | null)[]> {
  return Promise.all(
    Array.from({ length: n }, (_, k) =>
      fetch(suitFrameUrl(k))
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null),
    ),
  );
}
