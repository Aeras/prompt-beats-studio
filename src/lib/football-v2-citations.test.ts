import { expect, test } from "bun:test";
import { createRestorationPolicy } from "./football-independent-restoration.server";
import {
  makeFullSources,
  runFullFootballEvidence,
  type FullEvidenceRunInput,
} from "./football-full-evidence.server";
import type { FullEvidenceHit } from "./football-full-evidence.shared";
const fixture = {
  leagueId: "IT-SA",
  homeTeam: "Fiorentina",
  awayTeam: "Juventus",
  kickoffUtc: "2026-11-08T19:45:00Z",
};
const cutoff = "2026-11-07T12:00:00Z";
const urls = [
  "https://sportsgambler.com/football/fiorentina-vs-juventus/",
  "https://independent.example.org/fiorentina-juventus-preview",
];
const unknown = [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=invented",
  "https://api.pitchapi.dev/v1/fixtures/invented",
];
const market = {
  kind: "total" as const,
  period: "FT" as const,
  selection: "over" as const,
  line: 2.5,
};
const hits: FullEvidenceHit[] = urls.map((url, i) => {
  const text = `Fiorentina vs Juventus Serie A 8 November 2026 19:45 UTC.\nOur pick: Over 2.5\nEditorial context ${i}`;
  return {
    url,
    text,
    title: "Offline Tavily page",
    accessedAt: cutoff,
    status: "full_or_partial_raw_text",
    rawChars: text.length,
    cleanedChars: text.length,
    snippetChars: 0,
  };
});
function setup() {
  const calls: unknown[] = [];
  const input: FullEvidenceRunInput = {
    fixture,
    cutoff,
    hits,
    runId: "ae000000-0000-4000-8000-000000000001",
    restoration: true,
    context: { fixture },
    system: "Offline analysis",
    providerUrls: [],
    capacity: { context: 1000000, output: 16384 },
    signal: new AbortController().signal,
    authorize: async () => {},
    journal: async () => {},
    caller: () => async (call) => {
      calls.push(call);
      return {
        text: "{}",
        provider: "openrouter",
        model: "offline",
        stopReason: "end_turn",
        usage: null,
      };
    },
  };
  const docs = makeFullSources(hits);
  const { policy } = createRestorationPolicy(input);
  policy.prepareDocs?.(docs);
  policy.verify(
    docs.map((d) => ({
      sourceId: d.id,
      quote: "Our pick: Over 2.5",
      market,
      kind: "editorial",
      rationale: "Offline excerpt",
    })),
    docs,
    fixture,
    cutoff,
  );
  const assessment = {
    decision: "lean",
    rationale: "A cautious goals view from supplied evidence.",
    primary: {
      market,
      rationale: "The supplied editorial goals recommendations support this market.",
      risk: "Finishing can be weaker than expected.",
      evidenceUrls: [...urls, ...unknown],
    },
  };
  return { input, calls, docs, policy, assessment };
}
test("Tavily pages survive mixed receipt references; unsupplied ESPN and PitchAPI URLs do not", () => {
  const s = setup();
  const judgment = s.policy.judge(s.assessment, s.docs, {} as never);
  expect(judgment.decision).toBe("lean");
  expect(judgment.evidenceUrls).toEqual(urls);
  expect(judgment.evidenceUrls.some((u) => unknown.includes(u))).toBe(false);
  expect(s.policy.synthesisData?.()).toMatchObject({
    candidates: [
      { fixtureVerified: true },
      { fixtureVerified: true, independenceConfirmed: false, eligibleForConsensus: false },
    ],
  });
});
test("source IDs alone resolve to exact Tavily URLs independently of publisher review", () => {
  const s = setup();
  const raw = {
    ...s.assessment,
    primary: {
      ...s.assessment.primary,
      evidenceUrls: [],
      evidenceSourceIds: s.docs.map((d) => d.id),
    },
  };
  const judgment = s.policy.judge(raw, s.docs, {} as never);
  expect(judgment.evidenceUrls).toEqual(urls);
  expect(judgment.evidenceSourceIds).toEqual(s.docs.map((d) => d.id));
});
test("unsupported remaining market abstains after unknown references are removed", () => {
  const s = setup();
  const raw = {
    ...s.assessment,
    primary: {
      ...s.assessment.primary,
      market: { ...market, selection: "under" },
      evidenceUrls: [...urls, ...unknown],
    },
  };
  const judgment = s.policy.judge(raw, s.docs, {} as never);
  expect(judgment.decision).toBe("abstain");
  expect(judgment.selection).toBeUndefined();
  expect(judgment.evidenceUrls).toEqual([]);
});
test("unknown references alone fall back to verified authored sources for the same market", () => {
  const s = setup();
  const judgment = s.policy.judge(
    { ...s.assessment, primary: { ...s.assessment.primary, evidenceUrls: unknown } },
    s.docs,
    {} as never,
  );
  expect(judgment.decision).toBe("lean");
  expect(judgment.evidenceUrls.length).toBeGreaterThan(0);
  expect(judgment.evidenceUrls.some((u) => unknown.includes(u))).toBe(false);
});
test("actual V2 engine saves only resolved citations in one offline model dispatch", async () => {
  const s = setup();
  s.input.caller = () => async (call) => {
    s.calls.push(call);
    const p = JSON.parse(call.prompt);
    return {
      text: JSON.stringify({
        evidenceCandidates: p.sources.map((d: { sourceId: string }) => ({
          sourceId: d.sourceId,
          quote: "Our pick: Over 2.5",
          market,
          kind: "editorial",
          rationale: "Offline excerpt",
        })),
        independentAssessment: s.assessment,
      }),
      provider: "openrouter",
      model: "offline",
      stopReason: "end_turn",
      usage: null,
    };
  };
  const result = await runFullFootballEvidence(s.input);
  expect(result.report.coverage).toBe("complete");
  expect(result.report.judgment?.evidenceUrls).toEqual(urls);
  expect(result.report.restoration?.assessment?.primary?.evidenceUrls).toEqual(urls);
  expect(s.calls).toHaveLength(1);
});

test("provider IDs resolve only explicitly supplied approved resources", () => {
  const s = setup();
  s.input.providerUrls = [
    "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=999",
  ];
  const { policy } = createRestorationPolicy(s.input);
  const result = policy.judge(
    {
      ...s.assessment,
      primary: { ...s.assessment.primary, evidenceUrls: [], evidenceSourceIds: ["provider-src-1"] },
    },
    s.docs,
    {} as never,
  );
  expect(result.evidenceUrls).toEqual(s.input.providerUrls);
  expect(result.evidenceSourceIds).toBeUndefined();
});
test("a returned wrong-fixture page and unknown source ID cannot rescue a claim", () => {
  const s = setup();
  const wrong = makeFullSources([
    {
      ...(hits[0] as FullEvidenceHit),
      text: "Napoli vs Lazio Serie A 8 November 2026 19:45 UTC. Our pick: Over 2.5",
    },
  ]);
  const result = s.policy.judge(
    {
      ...s.assessment,
      primary: {
        ...s.assessment.primary,
        evidenceUrls: [urls[0]],
        evidenceSourceIds: ["src-invented"],
      },
    },
    wrong,
    {} as never,
  );
  expect(result.decision).toBe("abstain");
  expect(result.evidenceUrls).toEqual([]);
});
