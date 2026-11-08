import {
  researchMarketKey,
  type ResearchMarket,
} from "./football-independent-markets.shared";
import type { RestoredCandidate } from "./football-independent-restoration.shared";

const normalizedText = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

/** Presentation-only identity; never changes evidence, eligibility or consensus. */
function selectionKey(market: ResearchMarket): string {
  if (market.kind === "and")
    return JSON.stringify(["and", market.legs.map(selectionKey).sort()]);
  if (market.kind === "other") return JSON.stringify(["other", normalizedText(market.label)]);
  if (market.kind === "stat_total" && market.player)
    return researchMarketKey({ ...market, player: normalizedText(market.player) });
  return researchMarketKey(market);
}

function publicationKey(sourceId: string, urls: Map<string, string | null>): string {
  const url = urls.get(sourceId);
  if (!url) return JSON.stringify(["source", sourceId]);
  try {
    const parsed = new URL(url);
    // A fragment is an anchor in the same publication. Preserve path/query identity.
    parsed.hash = "";
    return JSON.stringify(["url", parsed.href]);
  } catch {
    return JSON.stringify(["source", sourceId]);
  }
}

export function aggregatePublishedSelections(
  candidates: readonly RestoredCandidate[],
  sources: readonly { id: string; url: string | null }[],
) {
  const urls = new Map(sources.map((source) => [source.id, source.url]));
  const seen = new Set<string>();
  const groups = new Map<string, { marketKey: string; market: ResearchMarket; count: number }>();
  for (const candidate of candidates) {
    if (candidate.eligibleForConsensus) continue;
    const marketKey = selectionKey(candidate.market);
    const identity = JSON.stringify([publicationKey(candidate.sourceId, urls), marketKey]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const row = groups.get(marketKey);
    if (row) row.count += 1;
    else groups.set(marketKey, { marketKey, market: candidate.market, count: 1 });
  }
  const total = seen.size;
  return {
    total,
    rows: [...groups.values()]
      .sort((a, b) => b.count - a.count || (a.marketKey < b.marketKey ? -1 : a.marketKey > b.marketKey ? 1 : 0))
      .map((row) => ({ ...row, percentage: total ? (row.count / total) * 100 : 0 })),
  };
}