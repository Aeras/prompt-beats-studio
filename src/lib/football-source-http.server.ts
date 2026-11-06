import type { EvidenceStatus } from "./football-provider-evidence.shared";

export const FOOTBALL_SOURCE_HOSTS = [
  "site.api.espn.com",
  "api.pitchapi.dev",
  "stoiximan.jojapi.net",
  "v3.football.api-sports.io",
  "api.football-data.org",
] as const;
export class FootballSourceError extends Error {
  constructor(
    public readonly status: EvidenceStatus,
    public readonly retryAfterMs = 0,
  ) {
    super(status);
  }
}
type Options = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  maxBytes?: number;
};
/** Some adapters do not reject pending reads when their signal aborts. Bound the await too. */
function untilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new FootballSourceError("timeout"));
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
/** Fixed hosts, bare Workers-safe fetch, bounded streamed UTF-8 JSON. No redirects/retries/raw errors. */
export async function footballSourceJson(url: URL, options: Options = {}): Promise<unknown> {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(FOOTBALL_SOURCE_HOSTS as readonly string[]).includes(url.hostname)
  )
    throw new FootballSourceError("invalid_response");
  const fetcher = options.fetcher ?? fetch;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(6000)])
    : AbortSignal.timeout(6000);
  const max = options.maxBytes ?? 1_200_000;
  if (signal.aborted) throw new FootballSourceError("timeout");
  try {
    const response = await untilAbort(
      fetcher(url, {
        method: "GET",
        redirect: "manual",
        signal,
        ...(options.headers ? { headers: options.headers } : {}),
      }),
      signal,
    );
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      const retry = response.headers.get("retry-after") ?? "";
      const retryAfterMs = /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Math.max(0, Date.parse(retry) - Date.now()) || 0;
      throw new FootballSourceError(
        response.status === 429
          ? "rate_limited"
          : [401, 403].includes(response.status)
            ? "access_denied"
            : response.status === 404
              ? "not_found"
              : "unavailable",
        retryAfterMs,
      );
    }
    if (
      !/\bapplication\/(?:[a-z.+-]*\+)?json\b/i.test(response.headers.get("content-type") ?? "")
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new FootballSourceError("invalid_response");
    }
    if (Number(response.headers.get("content-length") ?? 0) > max) {
      void response.body?.cancel().catch(() => undefined);
      throw new FootballSourceError("too_large");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new FootballSourceError("invalid_response");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "",
      size = 0;
    try {
      while (true) {
        const part = await untilAbort(reader.read(), signal);
        if (part.done) break;
        size += part.value.byteLength;
        if (size > max) throw new FootballSourceError("too_large");
        try {
          text += decoder.decode(part.value, { stream: true });
        } catch {
          throw new FootballSourceError("invalid_response");
        }
      }
      try {
        text += decoder.decode();
      } catch {
        throw new FootballSourceError("invalid_response");
      }
    } finally {
      // Cancellation itself may never settle for a broken transport; do not hold the journal open.
      void reader.cancel().catch(() => undefined);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new FootballSourceError("invalid_response");
    }
  } catch (error) {
    if (error instanceof FootballSourceError) throw error;
    throw new FootballSourceError(signal.aborted ? "timeout" : "unavailable");
  }
}
