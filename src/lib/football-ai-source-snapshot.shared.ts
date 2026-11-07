import { z } from "zod";
/**
 * Reusable, bounded pre-kickoff evidence snapshot. Search excerpts are untrusted
 * third-party text, not verified sports facts. The model must independently
 * distinguish observations, predictions, and unresolved conflicts.
 */
export type FootballSourceSnapshot = {
  title: string;
  url: string;
  accessedAt: string;
  excerpt: string;
  publishedAtUtc?: string;
  researchIntent: "match_facts" | "external_forecasts";
};
export function buildFootballSourceSnapshot(
  documents: ReadonlyArray<FootballSourceSnapshot>,
  maxSources: 18 | 20 = 18,
): FootballSourceSnapshot[] {
  const results: FootballSourceSnapshot[] = [];
  const seen = new Set<string>();
  for (const doc of documents) {
    if (results.length >= maxSources) break;
    try {
      const parsed = new URL(doc.url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) continue;
      parsed.hash = "";
      const key = parsed.href;
      if (seen.has(key)) continue;
      const accessed = new Date(doc.accessedAt);
      if (!Number.isFinite(accessed.getTime())) continue;
      seen.add(key);
      results.push({
        title: doc.title.slice(0, 180),
        url: key,
        accessedAt: accessed.toISOString(),
        excerpt: doc.excerpt.slice(0, 650),
        researchIntent: doc.researchIntent,
        ...(doc.publishedAtUtc &&
        z.string().datetime({ offset: true }).safeParse(doc.publishedAtUtc).success
          ? { publishedAtUtc: new Date(doc.publishedAtUtc).toISOString() }
          : {}),
      });
    } catch {
      // Discard malformed source links, not the entire research.
    }
  }
  return results;
}
