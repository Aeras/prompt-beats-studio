import type { AiFixtureCandidate } from "./football-ai-fixture-validation.shared";
import { canonicalTeam } from "./football-ai-fixture-validation.shared";

/**
 * Server-rendered HTML sources only (JS-rendered score apps such as
 * flashscore/livescore return no fixture data in HTML and are excluded).
 */
export const CORROBORATION_HOSTS = [
  "uefa.com",
  "premierleague.com",
  "legaseriea.it",
  "laliga.com",
  "bundesliga.com",
  "ligue1.com",
  "slgr.gr",
  "eredivisie.nl",
  "ligaportugal.pt",
  "proleague.be",
  "sfl.ch",
  "bbc.co.uk",
  "bbc.com",
  "espn.com",
  "skysports.com",
  "theguardian.com",
  "worldfootball.net",
  "transfermarkt.com",
  "kicker.de",
  "lequipe.fr",
  "marca.com",
  "gazzetta.it",
  "fotmob.com",
  "sofascore.com",
] as const;
const MAX_BODY_BYTES = 600_000;
const MAX_REDIRECTS = 2;
export const MAX_FETCHES_PER_REFRESH = 24;
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "com.pt",
  "com.gr",
  "com.es",
  "com.br",
  "co.nl",
]);

export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

export function trustedPublicUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase();
    if (!CORROBORATION_HOSTS.some((host) => hostname === host || hostname.endsWith("." + host)))
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function plain(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|quot|apos|#39);/gi, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Timestamps with an explicit zone only; zone-less local times are ignored (fail closed). */
const ZONED =
  /\b(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})\b/g;
export function utcMinute(iso: string): string | null {
  const t = Date.parse(iso.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16) : null;
}

export type SourceVerdict = "confirms" | "contradicts" | "silent";

/**
 * Exact-minute UTC check, zero tolerance. A day-only match is never enough.
 * Sources: JSON-LD SportsEvent.startDate and zoned timestamps (e.g. <time
 * datetime>) that appear within the same bounded neighborhood as both teams.
 */
export function judgeSource(
  rawHtml: string,
  fixture: Pick<AiFixtureCandidate, "homeTeam" | "awayTeam" | "kickoffUtc">,
): SourceVerdict {
  const home = canonicalTeam(fixture.homeTeam);
  const away = canonicalTeam(fixture.awayTeam);
  const target = utcMinute(fixture.kickoffUtc);
  if (!home || !away || home === away || !target) return "silent";
  const minutes = new Set<string>();
  for (const block of rawHtml.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(block[1] ?? "");
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        if (typeof o["startDate"] === "string") {
          const text = plain(JSON.stringify(o));
          if (text.includes(home) && text.includes(away)) {
            const m = utcMinute(o["startDate"]);
            if (m && /(Z|[+-]\d{2}:?\d{2})$/.test(o["startDate"])) minutes.add(m);
          }
        }
        stack.push(...Object.values(o));
      }
    }
  }
  const body = rawHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  for (const match of body.matchAll(ZONED)) {
    const at = match.index ?? 0;
    const area = plain(body.slice(Math.max(0, at - 1200), at + 1200));
    if (!area.includes(home) || !area.includes(away)) continue;
    const m = utcMinute(match[0]);
    if (m) minutes.add(m);
  }
  if (minutes.size === 0) return "silent";
  if (minutes.has(target) && minutes.size === 1) return "confirms";
  return "contradicts";
}

async function readBounded(response: Response): Promise<string> {
  if (!response.body) throw new Error("source unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      n += result.value.byteLength;
      if (n > MAX_BODY_BYTES) throw new Error("source too large");
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(n);
  let i = 0;
  for (const c of chunks) {
    bytes.set(c, i);
    i += c.length;
  }
  return new TextDecoder().decode(bytes);
}

export type FetchBudget = { remaining: number };

/** Manual redirects, each hop re-validated against the allowlist. */
export async function fetchSource(
  url: URL,
  fetcher: typeof fetch,
  budget: FetchBudget,
): Promise<string | null> {
  let current: URL | null = url;
  for (let hop = 0; hop <= MAX_REDIRECTS && current; hop++) {
    if (budget.remaining <= 0) return null;
    budget.remaining--;
    const response: Response = await fetcher(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(4500),
      headers: { Accept: "text/html" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location: string | null = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      current = location ? trustedPublicUrl(new URL(location, current).href) : null;
      continue;
    }
    const mime = response.headers.get("content-type") ?? "";
    if (!response.ok || !/^text\/html\b/i.test(mime)) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    if (Number(response.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    return readBounded(response);
  }
  return null;
}

export type CorroboratedAiFixture = AiFixtureCandidate & {
  verifiedSources: { url: string; domain: string; checkedAtUtc: string }[];
};

/**
 * Model-cited URLs are untrusted leads. Verified requires ≥2 distinct
 * registrable domains confirming the exact UTC kickoff minute and no fetched
 * source contradicting it. Any failure leaves the fixture a candidate.
 */
export async function corroborateAiFixture(
  fixture: AiFixtureCandidate,
  citations: { url: string }[],
  fetcher: typeof fetch,
  budget: FetchBudget,
  now: () => Date = () => new Date(),
): Promise<CorroboratedAiFixture | null> {
  const verifiedSources: CorroboratedAiFixture["verifiedSources"] = [];
  const domains = new Set<string>();
  const seenUrls = new Set<string>();
  for (const citation of [...fixture.sources, ...citations]) {
    const url = trustedPublicUrl(citation.url);
    if (!url || seenUrls.has(url.href)) continue;
    seenUrls.add(url.href);
    const domain = registrableDomain(url.hostname);
    if (domains.has(domain)) continue;
    let html: string | null = null;
    try {
      html = await fetchSource(url, fetcher, budget);
    } catch {
      html = null;
    }
    if (!html) continue;
    const verdict = judgeSource(html, fixture);
    if (verdict === "contradicts") return null;
    if (verdict === "confirms") {
      domains.add(domain);
      verifiedSources.push({ url: url.href, domain, checkedAtUtc: now().toISOString() });
      if (domains.size >= 2) return { ...fixture, verifiedSources };
    }
  }
  return null;
}
