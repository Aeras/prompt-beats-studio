import { expect, test } from "bun:test";
import { buildFootballClaimLedger } from "./football-evidence-v2.server";
import {
  attachIndependentAssessment,
  claimLedgerSchema,
  descriptiveMarketKey,
} from "./football-evidence-v2.shared";
import {
  footballResearchBudget,
  FOOTBALL_MODEL_OUTPUT_TOKENS,
  FOOTBALL_CONSENT_VERSION,
} from "./football-research-budget.shared";
import { footballAnalysisRequestSchema } from "./football-ai-research.shared";
const fixture = {
  leagueId: "IT-SA",
  homeTeam: "Inter",
  awayTeam: "Como",
  kickoffUtc: "2026-11-08T19:45:00Z",
};
const cutoff = "2026-11-06T12:00:00Z",
  provider = "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=999";
const combo = {
  kind: "and" as const,
  legs: [
    { kind: "btts" as const, period: "FT" as const, selection: "yes" as const },
    { kind: "total" as const, period: "FT" as const, selection: "over" as const, line: 2.5 },
  ] as const,
};
const doc = (text: string, i = 0) => ({
  title: "Explicitly synthetic source",
  url: `https://sportsmole.co.uk/synthetic-${i}`,
  accessedAt: cutoff,
  text: `Inter vs Como Serie A 8 November 2026.\n${text}`,
});
const judgment = (url: string) => ({
  decision: "lean",
  selection: combo,
  rationale: "Synthetic independent joint reading of the supplied match evidence.",
  supportingClaimIds: [0],
  evidenceUrls: [url, provider],
  jointRationale:
    "Both components and their conjunction have explicit authored and supplied provider support.",
});
test("joint proposal requires exact complete authored combo and provider evidence", () => {
  const l = buildFootballClaimLedger(
    fixture,
    [doc("Prediction: GG & Over 2.5")],
    cutoff,
    [],
    "P1-Preserve",
  );
  const accepted = attachIndependentAssessment(l, judgment(l.sources[0]!.url), [provider]);
  expect(accepted.judgmentStatus).toBe("available");
  expect(descriptiveMarketKey(accepted.judgment!.selection!)).toStartWith("AND(");
  expect(
    attachIndependentAssessment(
      l,
      { ...judgment(l.sources[0]!.url), evidenceUrls: [l.sources[0]!.url] },
      [provider],
    ).judgmentStatus,
  ).toBe("invalid_evidence");
  expect(
    attachIndependentAssessment(l, { ...judgment(l.sources[0]!.url), jointRationale: undefined }, [
      provider,
    ]).judgmentStatus,
  ).toBe("invalid_evidence");
});
test("two popular separate legs are not a supported joint proposition", () => {
  const l = buildFootballClaimLedger(
    fixture,
    [doc("Prediction: GG\nOur pick is Over 2.5")],
    cutoff,
  );
  expect(
    attachIndependentAssessment(l, { ...judgment(l.sources[0]!.url), supportingClaimIds: [0, 1] }, [
      provider,
    ]).judgmentStatus,
  ).toBe("invalid_evidence");
});
for (const patch of [
  { evidenceUrls: ["https://invented.example/fake"] },
  { supportingClaimIds: [299] },
  { rationale: "A guaranteed positive expected value +EV outcome" },
  { rationale: "Analysts agree therefore the probability is 90%" },
  { selection: { kind: "other", label: "invented" } },
])
  test(`independent proposal fails closed ${JSON.stringify(patch)}`, () => {
    const l = buildFootballClaimLedger(fixture, [doc("Prediction: GG & Over 2.5")], cutoff);
    expect(
      attachIndependentAssessment(l, { ...judgment(l.sources[0]!.url), ...patch }, [provider])
        .judgmentStatus,
    ).toBe("invalid_evidence");
  });
test("abstention remains an explicit valid outcome", () => {
  const l = buildFootballClaimLedger(fixture, [], cutoff);
  expect(
    attachIndependentAssessment(
      l,
      {
        decision: "abstain",
        rationale: "The actual supplied evidence is insufficient.",
        supportingClaimIds: [],
        evidenceUrls: [],
      },
      [],
    ).judgmentStatus,
  ).toBe("abstain");
});
test("all 25 documents and last-source claim remain reachable", () => {
  const l = buildFootballClaimLedger(
    fixture,
    Array.from({ length: 25 }, (_, i) =>
      doc(i === 24 ? "Prediction: Over 2.5" : "Neutral synthetic facts only.", i),
    ),
    cutoff,
    [],
    "P1-Preserve",
  );
  expect(l.sources).toHaveLength(25);
  expect(l.claims[0]!.sourceIndex).toBe(24);
  expect(l.claims[0]!.countable).toBe(true);
  expect(claimLedgerSchema.safeParse(l).success).toBe(true);
});
for (const depth of ["basic", "advanced"] as const)
  test(`pre-dispatch ${depth} resource/price envelope`, () => {
    const b = footballResearchBudget(depth, { input: 1, output: 2, searchCreditUsd: 0.01 });
    expect(b.searchCalls).toBe(5);
    expect(b.resultsPerSearch).toBe(5);
    expect(b.maxResults).toBe(25);
    expect(b.searchCredits).toBe(depth === "basic" ? 5 : 10);
    expect(b.outputTokens).toBe(FOOTBALL_MODEL_OUTPUT_TOKENS);
    expect(b.totalUsd).toBe(
      (b.inputTokenAllowance + 2 * b.outputTokens) / 1e6 + 0.01 * b.searchCredits,
    );
    expect(b.automaticRetries).toBe(0);
  });
test("unknown prices remain unknown, old prices never impose age admission", () => {
  const b = footballResearchBudget("advanced", {
    input: null,
    output: null,
    searchCreditUsd: null,
  });
  expect(b.totalUsd).toBeNull();
  expect(b.modelUsd).toBeNull();
  expect(b.searchCredits).toBe(10);
});
test("five-query consent cannot be forged with the old single boolean", () => {
  const request = {
    fixtureProvider: "espn",
    leagueId: "IT-SA",
    weekDate: "2026-11-06",
    fixtureId: "999",
    requestKey: "dd000000-0000-4000-8000-000000000009",
    modelId: "offline",
    withTavily: true,
    approvePaidRequest: true,
  };
  expect(footballAnalysisRequestSchema.safeParse(request).success).toBe(false);
  expect(
    footballAnalysisRequestSchema.safeParse({
      ...request,
      researchConsentVersion: FOOTBALL_CONSENT_VERSION,
    }).success,
  ).toBe(true);
});

test("logically contradictory conjunctions cannot be counted or recommended", () => {
  const l = buildFootballClaimLedger(fixture, [doc("Prediction: 1 & 2")], cutoff);
  expect(l.sourceCount).toBe(0);
  expect(l.claims[0]!.reasons).toContain("contradictory_market");
});
test("invalid replacement cannot leave a stale independent judgment", () => {
  const l = buildFootballClaimLedger(fixture, [doc("Prediction: GG & Over 2.5")], cutoff);
  const first = attachIndependentAssessment(l, judgment(l.sources[0]!.url), [provider]);
  const next = attachIndependentAssessment(first, { invented: true }, [provider]);
  expect(next.judgment).toBeUndefined();
  expect(next.judgmentStatus).toBe("invalid_evidence");
});
