import { expect, test } from "bun:test";
import { aggregatePublishedSelections } from "./football-published-distribution.shared";
import { aggregateVerifiedMarkets, type RestoredCandidate } from "./football-independent-restoration.shared";
import type { ResearchMarket } from "./football-independent-markets.shared";

const over = (line: number): ResearchMarket => ({ kind: "total", period: "FT", selection: "over", line });
function candidate(sourceId: string, market: ResearchMarket, id = 0): RestoredCandidate {
  return {
    id, sourceId, market, originalMarket: market, quote: "Published choice", sourceDigest: "a".repeat(64),
    quoteStartUtf16: 0, kind: "editorial", quoteVerified: true, fixtureVerified: false,
    independenceConfirmed: false, eligibleForConsensus: false, publisherFamily: null, reasons: ["fixture_unverified"],
  };
}
test("same selection counts once per publication, including repeated excerpts and source aliases", () => {
  const result = aggregatePublishedSelections([
    candidate("a", over(2.5)), candidate("a", over(2.5), 1), candidate("alias", over(2.5), 2), candidate("b", over(2.5), 3),
  ], [{ id: "a", url: "https://example.com/pick#one" }, { id: "alias", url: "https://example.com/pick#two" }, { id: "b", url: "https://example.com/another-pick" }]);
  expect(result.total).toBe(2);
  expect(result.rows[0]?.count).toBe(2);
});
test("distinct lines and choices from the same publication all count", () => {
  const result = aggregatePublishedSelections([candidate("a", over(2.5)), candidate("a", over(3.5)), candidate("a", { kind: "total", period: "FT", selection: "under", line: 2.5 })], []);
  expect(result.total).toBe(3);
  expect(result.rows.map((r) => r.count)).toEqual([1, 1, 1]);
});
test("1 X 2 1X X2 12 GG NG and half-time choices stay distinct", () => {
  const markets: ResearchMarket[] = [
    ...(["1", "X", "2"] as const).map((selection) => ({ kind: "1x2" as const, period: "FT" as const, selection })),
    ...(["1X", "X2", "12"] as const).map((selection) => ({ kind: "dc" as const, period: "FT" as const, selection })),
    { kind: "btts", period: "FT", selection: "yes" }, { kind: "btts", period: "FT", selection: "no" },
    { kind: "btts", period: "HT", selection: "yes" },
  ];
  const result = aggregatePublishedSelections(markets.map((m) => candidate("a", m)), []);
  expect(result.total).toBe(9);
  expect(result.rows.length).toBe(9);
});
test("settlement, statistic, subject, player, score, HT/FT and combinations retain exact identities", () => {
  const base: ResearchMarket = { kind: "stat_total", statistic: "corners", period: "FT", subject: "match", selection: "over", line: 9.5 };
  const markets: ResearchMarket[] = [base, { ...base, statistic: "cards" }, { ...base, subject: "home" }, { ...base, player: "Player One" }, { ...base, player: "Player Two" },
    { kind: "handicap", period: "FT", settlement: "asian", selection: "1", line: -1 },
    { kind: "handicap", period: "FT", settlement: "european", selection: "1", line: -1 },
    { kind: "score", period: "FT", home: 1, away: 2 }, { kind: "htft", half: "X", full: "2" },
    { kind: "and", legs: [over(2.5), { kind: "btts", period: "FT", selection: "yes" }] },
    { kind: "other", label: "Unsupported exact choice" }];
  const result = aggregatePublishedSelections(markets.map((m) => candidate("a", m)), []);
  expect(result.total).toBe(11);
  expect(result.rows.length).toBe(11);
});
test("safe formatting normalization and reversed combination legs deduplicate without broad category merging", () => {
  const btts: ResearchMarket = { kind: "btts", period: "FT", selection: "yes" };
  const result = aggregatePublishedSelections([
    candidate("a", { kind: "other", label: "  Exact   PICK " }), candidate("a", { kind: "other", label: "exact pick" }),
    candidate("a", { kind: "other", label: "different pick" }),
    candidate("a", { kind: "and", legs: [over(2.5), btts] }), candidate("a", { kind: "and", legs: [btts, over(2.5)] }),
  ], []);
  expect(result.total).toBe(3);
});
test("counts descend and percentages use the unique selection sample, never success probabilities", () => {
  const result = aggregatePublishedSelections([candidate("a", over(2.5)), candidate("b", over(2.5)), candidate("c", over(2.5)), candidate("a", over(3.5))], []);
  expect(result.total).toBe(4);
  expect(result.rows.map((r) => r.count)).toEqual([3, 1]);
  expect(result.rows.map((r) => r.percentage)).toEqual([75, 25]);
  expect(result.rows.reduce((sum, row) => sum + row.count, 0)).toBe(result.total);
});
test("presentation does not mutate candidates or change independent consensus", () => {
  const candidates = [candidate("a", over(2.5)), { ...candidate("b", over(3.5)), eligibleForConsensus: true, publisherFamily: "verified" }];
  const before = structuredClone(candidates);
  const consensus = aggregateVerifiedMarkets(candidates);
  expect(aggregatePublishedSelections(candidates, []).total).toBe(1);
  expect(candidates).toEqual(before);
  expect(aggregateVerifiedMarkets(candidates)).toEqual(consensus);
});
test("empty sample stays empty and source fallback does not collapse different sources", () => {
  expect(aggregatePublishedSelections([], [])).toEqual({ total: 0, rows: [] });
  expect(aggregatePublishedSelections([candidate("a", over(2.5)), candidate("b", over(2.5))], []).total).toBe(2);
});