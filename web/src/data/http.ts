// The one place the app touches the network. Every path is relative to the
// app's own origin, so the same build reads static files (offline demo) or
// Tomas's server (which serves the app, /data/*.json and /api/*) with no change.
const base = (): string => import.meta.env.BASE_URL ?? '/';

/** GET a JSON file or endpoint below the app's base. Throws on HTTP errors and non-JSON replies. */
export async function getJson<T>(path: string, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base()}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    // A static host answers unknown paths with index.html: that is "no server".
    if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`${path}: not JSON`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let probe: Promise<boolean> | null = null;
/** true when the e^x server is behind this origin (its /api/health answers JSON). Asked once. */
export function hasServer(): Promise<boolean> {
  probe ??= getJson<unknown>('api/health', 1500).then(
    () => true,
    () => false,
  );
  return probe;
}
