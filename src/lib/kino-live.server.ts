import { parseKinoSnapshot, type KinoSnapshot } from "@/lib/kino-live.shared";

const KINO_URL = "https://api.opap.gr/draws/v3.0/1100/last-result-and-active";
const CACHE_MS = 3500;
const MAX_BODY_CHARS = 120000;
let cached: KinoSnapshot | null = null;
let inFlight: Promise<KinoSnapshot> | null = null;

/** Server-only, deduplicated, bounded public OPAP read. Never forwards client URLs. */
export async function getKinoLiveSnapshot(
  now: () => number = Date.now,
  request: typeof fetch = fetch,
): Promise<KinoSnapshot> {
  if (cached && now() - cached.fetchedAt < CACHE_MS) return cached;
  if (inFlight) return inFlight;
  const task = (async () => {
    const response = await request(KINO_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5500),
    });
    if (!response.ok) throw new Error("KINO provider unavailable");
    const size = Number(response.headers.get("content-length") ?? "0");
    if (size > MAX_BODY_CHARS) throw new Error("KINO response too large");
    const body = await response.text();
    if (body.length > MAX_BODY_CHARS) throw new Error("KINO response too large");
    const snapshot = parseKinoSnapshot(JSON.parse(body) as unknown, now());
    cached = snapshot;
    return snapshot;
  })();
  inFlight = task;
  try {
    return await task;
  } finally {
    if (inFlight === task) inFlight = null;
  }
}
