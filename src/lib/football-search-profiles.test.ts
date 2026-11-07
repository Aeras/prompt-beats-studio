import { readFileSync } from "node:fs";
import { createFootballTeamRegistry, footballTeamRegistry } from "./football-team-registry.shared";
import { fixtureLocalDate } from "./football-evidence-v2.shared";
import { expect, test } from "bun:test";
import {
  FOOTBALL_V2_EN_SUFFIX,
  FOOTBALL_V2_RU_SUFFIX,
  planFootballForecasts,
  planFootballSearchProfile,
} from "./football-forecast-planner.shared";
import {
  footballAnalysisRequestSchema,
  footballResearchSystemForProfile,
  FOOTBALL_COMPLETE_RESEARCH_SYSTEM,
  footballAiAssessmentSchema,
} from "./football-ai-research.shared";
import {
  FOOTBALL_SEARCH_PROFILES,
  footballProfileConsent,
  footballV2PlanningMessage,
} from "./football-search-profiles.shared";
import {
  footballResearchBudget,
  FOOTBALL_CONSENT_VERSION,
  footballSearchReceiptSchema,
} from "./football-research-budget.shared";
import { searchInspirationWeb } from "./music-inspiration-research.server";
import { buildFootballClaimLedger } from "./football-evidence-v2.server";
import {
  packFootballEvidenceV2,
  readFootballEvidenceV2,
  parseAuthoredMarket,
  extractLiteralPicks,
} from "./football-evidence-v2.shared";
const f = {
  leagueId: "IT-SA",
  homeTeam: "Napoli",
  awayTeam: "Lazio",
  kickoffUtc: "2026-11-08T17:00:00Z",
};
const enSuffix =
  "Find published, independent expert predictions from different sites for this exact match. Require a clear recommended bet with reasoning, e.g. result, totals, BTTS, handicap, score, player or corner markets, or any other market; examples, not limits. Exclude odds-only, news and stats pages without a pick.";
const ruSuffix =
  "Найди независимые опубликованные прогнозы разных сайтов именно на этот матч. Нужны конкретные ставки с обоснованием: например, исход, тотал, обе забьют, фора, счёт, игроки, угловые или любой другой рынок. Это примеры, не ограничения. Исключи страницы лишь с коэффициентами, новостями или статистикой без прогноза.";
const en = `Napoli vs Lazio, 8 November 2026. ${enSuffix}`;
const ru = `Наполи — Лацио, 8 ноября 2026. ${ruSuffix}`;
test("exact revised owner goldens: EN306 RU313 suffix code points, unchanged examples-not-limits", () => {
  const p = planFootballSearchProfile(f, "v2_experimental");
  expect(p.queries.map((q) => q.query)).toEqual([en, ru]);
  expect(FOOTBALL_V2_EN_SUFFIX).toBe(enSuffix);
  expect(FOOTBALL_V2_RU_SUFFIX).toBe(ruSuffix);
  expect(Array.from(enSuffix)).toHaveLength(306);
  expect(Array.from(ruSuffix)).toHaveLength(313);
  expect(Array.from(en)).toHaveLength(340);
  expect(Array.from(ru)).toHaveLength(344);
  expect(p.searchCalls).toBe(2);
  expect(p.resultsPerSearch).toBe(10);
  expect(p.queries.map((q) => q.language)).toEqual(["en", "ru"]);
  expect(p.queries.every((q) => q.intent === "external_forecasts")).toBe(true);
});
test("V1 plan is exact legacy parity, including callbacks/intents/counts", () => {
  const old = planFootballForecasts(f, "P1-Preserve"),
    p = planFootballSearchProfile(f);
  for (const key of [
    "queries",
    "searchCalls",
    "resultsPerSearch",
    "venueTimezone",
    "localDate",
    "webFactsCoverage",
  ] as const)
    expect(p[key]).toEqual(old[key]);
  expect(p.queries.map((q) => q.query)).toEqual([
    "Νάπολι Λάτσιο 8 Νοεμβρίου 2026 προγνωστικά αγώνα",
    "Napoli vs Lazio 8 November 2026 match prediction preview",
    "Napoli Lazio 8 ноября 2026 прогноз на матч",
    "Napoli vs Lazio 2026-11-08 expected goals xG xGA recent form home away verified match statistics",
    "Napoli vs Lazio 2026-11-08 latest injuries expected starting eleven rotation team news",
  ]);
});
test("date swap and reviewed alias fallback preserve fixture identity within400; no clipped names", () => {
  const p = planFootballSearchProfile(
    { ...f, homeTeam: "SSC Napoli", awayTeam: "SS Lazio", kickoffUtc: "2026-11-08T23:30:00Z" },
    "v2_experimental",
  );
  expect(p.localDate).toBe("2026-11-09");
  expect(p.queries.every((q) => Array.from(q.query).length <= 400)).toBe(true);
  expect(p.queries[0]!.query).toStartWith("Napoli vs Lazio, 9 November 2026.");
  const reverse = planFootballSearchProfile(
    { ...f, homeTeam: "Lazio", awayTeam: "Napoli" },
    "v2_experimental",
  );
  expect(reverse.queries[1]!.query).toStartWith("Лацио — Наполи");
  const longer = planFootballSearchProfile(
    { ...f, homeTeam: "Manchester United", awayTeam: "Liverpool", leagueId: "EN-PL" },
    "v2_experimental",
  );
  expect(longer.queries[0]!.query).toStartWith("Manchester United vs Liverpool,");
  expect(longer.queries.every((q) => Array.from(q.query).length <= 400)).toBe(true);
});
for (const patch of [
  { homeTeam: "Unreviewed " + "long".repeat(100) },
  { homeTeam: "Lazio" },
  { kickoffUtc: "invalid" },
  { leagueId: "UEFA-CL" },
  { homeTeam: "Napoli Women" },
])
  test(`V2 fail-closed identity ${JSON.stringify(patch)}`, () =>
    expect(() => planFootballSearchProfile({ ...f, ...patch }, "v2_experimental")).toThrow());
const base = {
  leagueId: "IT-SA",
  weekDate: "2026-11-08",
  fixtureId: "999",
  modelId: "offline",
  requestKey: "a1111111-1111-4111-8111-111111111111",
  withTavily: true,
  approvePaidRequest: true,
  researchConsentVersion: FOOTBALL_CONSENT_VERSION,
};
test("legacy profile absence stays V1 with existing consent", () =>
  expect(footballAnalysisRequestSchema.parse(base).searchProfileVersion).toBe("v1_current"));
for (const profile of ["v1_current", "v2_experimental"] as const)
  for (const depth of ["basic", "advanced"] as const)
    test(`version/depth-bound consent and budget ${profile}/${depth}`, () => {
      const p = FOOTBALL_SEARCH_PROFILES[profile],
        data = {
          ...base,
          searchProfileVersion: profile,
          tavilySearchDepth: depth,
          researchConsentVersion: p.consentVersion,
          researchConsent: footballProfileConsent(profile, depth, "offline", "999"),
        };
      expect(footballAnalysisRequestSchema.safeParse(data).success).toBe(true);
      for (const patch of [
        { tavilySearchDepth: depth === "basic" ? "advanced" : "basic" },
        { modelId: "changed" },
        { fixtureId: "998" },
        { searchProfileVersion: profile === "v1_current" ? "v2_experimental" : "v1_current" },
        { researchConsent: undefined },
        { approvePaidRequest: false },
      ])
        expect(footballAnalysisRequestSchema.safeParse({ ...data, ...patch }).success).toBe(false);
      const b = footballResearchBudget(
        depth,
        { input: null, output: null, searchCreditUsd: null },
        profile,
      );
      expect(b.searchCalls).toBe(p.searchCalls);
      expect(b.resultsPerSearch).toBe(p.resultsPerSearch);
      expect(b.searchCredits).toBe(p.searchCalls * (depth === "basic" ? 1 : 2));
      expect(b.maxResults).toBe(p.maxCandidates);
      expect(b.totalUsd).toBeNull();
      expect(b.modelCalls).toBe(profile === "v2_experimental" ? 5 : 1);
      expect(b.automaticRetries).toBe(0);
      expect(b.extraExtractCalls).toBe(0);
    });
test("forged profile rejected; arbitrary client queries/calls never survive validation", () => {
  expect(
    footballAnalysisRequestSchema.safeParse({ ...base, searchProfileVersion: "P1-Preserve" })
      .success,
  ).toBe(false);
  const parsed = footballAnalysisRequestSchema.parse({
    ...base,
    query: "injected",
    searchCalls: 99,
    maxResults: 99,
  });
  expect(parsed).not.toHaveProperty("query");
  expect(parsed).not.toHaveProperty("searchCalls");
  expect(parsed).not.toHaveProperty("maxResults");
});
test("V1 system unchanged, V2 explicitly reports missing web-facts/native queries without market expansion", () => {
  expect(footballResearchSystemForProfile("v1_current")).toBe(FOOTBALL_COMPLETE_RESEARCH_SYSTEM);
  const system = footballResearchSystemForProfile("v2_experimental");
  expect(system).toContain("No Greek/league-native");
  expect(system).toContain("Structured provider facts/odds");
  expect(system).not.toContain(
    "Evidence should be gathered through independent English, Russian and relevant league-native",
  );
  expect(parseAuthoredMarket("player to score").kind).toBe("other");
});
test("10-result transport truthfully separates discoveries, raw docs, duplicates/unsafe/snippets and24k", async () => {
  let calls = 0;
  const results = Array.from({ length: 10 }, (_, i) => ({
    title: `Synthetic source ${i}`,
    url: `https://sportsmole.co.uk/offline/${i}`,
    raw_content: "A".repeat(i === 0 ? 25000 : 80),
  }));
  results[1]!.raw_content = "";
  results[2]!.url = results[0]!.url;
  results[3]!.url = "http://127.0.0.1/private";
  const r = await searchInspirationWeb(
    "offline",
    new AbortController().signal,
    async (url, init) => {
      calls++;
      expect(url).toBe("https://api.tavily.com/search");
      const b = JSON.parse(String(init?.body));
      expect(b.max_results).toBe(10);
      expect(b.include_raw_content).toBe("text");
      expect(b.auto_parameters).toBe(false);
      return Response.json({ usage: { credits: 7 }, request_id: "real-mock-receipt", results });
    },
    "offline-key",
    "advanced",
    { football: { maxResults: 10, textChars: 24000, format: "text" } },
  );
  expect(calls).toBe(1);
  expect(r.credits).toBe(7);
  expect(r.documents).toHaveLength(7);
  expect(r.documents[0]!.text).toHaveLength(24000);
  expect(r.footballAudit).toMatchObject({
    requestedResults: 10,
    receivedResults: 10,
    acceptedRawDocs: 7,
    droppedMissingRaw: 1,
    droppedDuplicateUrl: 1,
    droppedUnsafeUrl: 1,
    truncatedDocs: 1,
    droppedExcess: 0,
  });
  expect(r.footballAudit!.discoveredSources).toHaveLength(9);
  expect(
    footballSearchReceiptSchema.safeParse({
      query: "offline",
      language: "en",
      intent: "external_forecasts",
      state: "observed",
      credits: r.credits,
      requestId: r.requestId,
      returnedSources: r.footballAudit!.discoveredSources,
    }).success,
  ).toBe(true);
});
test("ten safe discoveries include snippet-only without promoting any missing-raw page", async () => {
  const r = await searchInspirationWeb(
    "offline",
    new AbortController().signal,
    async () =>
      Response.json({
        results: Array.from({ length: 10 }, (_, i) => ({
          title: "Offline",
          url: `https://example.org/${i}`,
          content: "Prediction: Over 2.5",
          raw_content: i === 9 ? null : "Our pick: Over 2.5",
        })),
      }),
    "offline-key",
    "basic",
    { football: { maxResults: 10 } },
  );
  expect(r.footballAudit!.discoveredSources).toHaveLength(10);
  expect(r.documents).toHaveLength(9);
  expect(r.footballAudit!.droppedMissingRaw).toBe(1);
});
test("20 authoritative documents persist/hydrate separately from legacy18 projection", () => {
  const cutoff = "2026-11-07T00:00:00Z";
  const docs = Array.from({ length: 20 }, (_, i) => ({
    url: `https://sportsmole.co.uk/preview/${i}`,
    title: "Offline",
    accessedAt: cutoff,
    text: `Napoli vs Lazio Serie A 8 November 2026\nOur pick: Over 2.5\nSynthetic distinct paragraph ${i}`,
  }));
  const ledger = buildFootballClaimLedger(
    f,
    docs,
    cutoff,
    planFootballSearchProfile(f, "v2_experimental").queries,
    "forecast-only-2",
    "v2_experimental",
  );
  expect(ledger.sources).toHaveLength(20);
  expect(ledger.claims.some((c) => c.sourceIndex === 19)).toBe(true);
  expect(ledger.sourceCount).toBe(1);
  const packed = packFootballEvidenceV2(
    {
      onlineEvidenceV2: ledger,
      searchProfileVersion: "v2_experimental" as const,
      summary: "Offline persisted compatibility",
    },
    docs,
  );
  expect(packed.analysis).not.toHaveProperty("searchProfileVersion");
  expect(readFootballEvidenceV2(packed.sources, f, cutoff)?.searchProfileVersion).toBe(
    "v2_experimental",
  );
  expect(
    readFootballEvidenceV2(packed.sources, { ...f, awayTeam: "Como" }, cutoff),
  ).toBeUndefined();
  expect(
    footballAiAssessmentSchema.safeParse({
      summary: "Sufficient historical description",
      suggestions: [],
      limitations: [],
    }).success,
  ).toBe(true);
  expect(
    extractLiteralPicks("Bookmaker odds prediction: Over 2.5").every(
      (c) => c.stance !== "authored",
    ),
  ).toBe(true);
});

test("ten-result response above4MiB fails without retry or fabricated success/usage", async () => {
  let calls = 0;
  await expect(
    searchInspirationWeb(
      "offline",
      new AbortController().signal,
      async () => {
        calls++;
        return new Response(new Uint8Array(4 * 1024 * 1024 + 1));
      },
      "offline-key",
      "basic",
      { football: { maxResults: 10 } },
    ),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});
test("version provenance cannot be forged in a persisted sidecar", () => {
  const cutoff = "2026-11-07T00:00:00Z",
    ledger = buildFootballClaimLedger(
      f,
      [],
      cutoff,
      planFootballSearchProfile(f, "v2_experimental").queries,
      "forecast-only-2",
      "v2_experimental",
    );
  const packed = packFootballEvidenceV2(
    { onlineEvidenceV2: ledger, searchProfileVersion: "v2_experimental" as const },
    [],
  );
  (
    packed.sources[0] as { payload: { searchProfileVersion: string } }
  ).payload.searchProfileVersion = "v1_current";
  expect(readFootballEvidenceV2(packed.sources, f, cutoff)).toBeUndefined();
});

test("legacy Football adapter raw-document filtering order remains unchanged for V1", async () => {
  const r = await searchInspirationWeb(
    "offline",
    new AbortController().signal,
    async () =>
      Response.json({
        results: Array.from({ length: 6 }, (_, i) => ({
          title: "Offline",
          url: `https://example.org/legacy/${i}`,
          raw_content: i === 0 ? null : "Synthetic raw content",
        })),
      }),
    "offline-key",
    "basic",
    { football: { maxResults: 5 } },
  );
  expect(r.documents).toHaveLength(5);
  expect(r.documents[4]!.source.url).toEndWith("/5");
});

test("native Cyrillic article aliases are shared with V2 queries without changing V1 binding", () => {
  const cutoff = "2026-11-07T00:00:00Z",
    doc = {
      title: "Synthetic Russian author",
      url: "https://predictz.com/ru/offline",
      accessedAt: cutoff,
      text: "Наполи — Лацио Серия А 8 ноября 2026\nНаш выбор: П2",
    };
  const p = planFootballSearchProfile(f, "v2_experimental");
  const l = buildFootballClaimLedger(
    f,
    [doc],
    cutoff,
    p.queries,
    "forecast-only-2",
    "v2_experimental",
  );
  expect(l.sourceCount).toBe(1);
  expect(l.claims[0]!.market).toEqual({ kind: "1x2", period: "FT", selection: "2" });
  expect(buildFootballClaimLedger(f, [doc], cutoff).sourceCount).toBe(0);
  for (const text of [
    doc.text.replace("2026", "2025"),
    doc.text.replace("Наполи — Лацио", "Лацио — Наполи"),
    doc.text.replace("Серия А", "Premier League"),
  ])
    expect(
      buildFootballClaimLedger(
        f,
        [{ ...doc, text }],
        cutoff,
        p.queries,
        "forecast-only-2",
        "v2_experimental",
      ).sourceCount,
    ).toBe(0);
});

test("all six registry leagues retain verified ordered teams and local dates within400", () => {
  for (const [leagueId, homeTeam, awayTeam] of [
    ["GR-SL", "Olympiacos", "Panathinaikos"],
    ["EN-PL", "Manchester United", "Liverpool"],
    ["FR-L1", "Paris Saint-Germain", "Marseille"],
    ["ES-LL", "Real Madrid", "Barcelona"],
    ["DE-BL", "Bayern Munich", "Borussia Dortmund"],
    ["IT-SA", "AC Fiorentina", "Juventus FC"],
  ]) {
    const plan = planFootballSearchProfile(
      { ...f, leagueId: leagueId!, homeTeam: homeTeam!, awayTeam: awayTeam! },
      "v2_experimental",
    );
    expect(plan.localDate).toBe("2026-11-08");
    expect(plan.queries.map((q) => q.language)).toEqual(["en", "ru"]);
    for (const [i, q] of plan.queries.entries()) {
      expect(Array.from(q.query).length).toBeLessThanOrEqual(400);
      expect(q.query).toEndWith(i === 0 ? enSuffix : ruSuffix);
    }
  }
});

test("Fiorentina–Juventus now fits without arbitrary shortening; large unknown labels fail", () => {
  const p = planFootballSearchProfile(
    { ...f, homeTeam: "Fiorentina", awayTeam: "Juventus" },
    "v2_experimental",
  );
  expect(p.queries[0]!.query).toBe(`Fiorentina vs Juventus, 8 November 2026. ${enSuffix}`);
  expect(p.queries[1]!.query).toBe(`Fiorentina — Juventus, 8 ноября 2026. ${ruSuffix}`);
  expect(() =>
    planFootballSearchProfile(
      { ...f, homeTeam: "Fiorentina" + "x".repeat(300) },
      "v2_experimental",
    ),
  ).toThrow("football_v2_team_identity_unverified");
});

test("V2 local calendar is correct across Rome DST transition and midnight", () => {
  for (const [kickoffUtc, date] of [
    ["2026-03-28T23:30:00Z", "2026-03-29"],
    ["2026-03-29T22:30:00Z", "2026-03-30"],
    ["2026-10-25T23:30:00Z", "2026-10-26"],
  ])
    expect(
      planFootballSearchProfile({ ...f, kickoffUtc: kickoffUtc! }, "v2_experimental").localDate,
    ).toBe(date);
});

test("diagnostics are static safe messages, never arbitrary exception content", () => {
  const message = footballV2PlanningMessage("football_v2_query_too_long");
  expect(message).toContain("400");
  expect(footballV2PlanningMessage(message)).toBe(message);
  expect(footballV2PlanningMessage("<script>untrusted token secret</script>")).toBeUndefined();
  expect(footballV2PlanningMessage("constructor")).toBeUndefined();
});

test("ambiguous reviewed alias cannot enter the real V2 planner", () => {
  const teams = footballTeamRegistry.teams.filter((t) => ["Napoli", "Lazio"].includes(t.name));
  const registry = createFootballTeamRegistry(
    teams.map((t) => ({ ...t, aliases: [...t.aliases, "Synthetic shared alias"] })),
  );
  expect(registry.resolve("Synthetic shared alias").status).toBe("ambiguous");
  const source = readFileSync(
    new URL("./football-forecast-planner.shared.ts", import.meta.url),
    "utf8",
  );
  const compiled = new (
    Bun as unknown as {
      Transpiler: new (options: { loader: string }) => { transformSync(source: string): string };
    }
  ).Transpiler({ loader: "ts" }).transformSync(source);
  const fn = compiled.slice(compiled.indexOf("function planFootballSearchProfile("));
  const planner = new Function(
    "footballTeamRegistry",
    "fixtureLocalDate",
    fn + ";return planFootballSearchProfile;",
  )(registry, fixtureLocalDate);
  expect(() => planner({ ...f, homeTeam: "Synthetic shared alias" }, "v2_experimental")).toThrow(
    "football_v2_team_identity_unverified",
  );
});

test("every registered same-league ordered pairing fits the new queries without changing identity", () => {
  let pairs = 0;
  for (const h of footballTeamRegistry.teams)
    for (const a of footballTeamRegistry.teams) {
      if (h.id === a.id || h.domesticLeague !== a.domesticLeague) continue;
      const p = planFootballSearchProfile(
        {
          leagueId: h.domesticLeague,
          homeTeam: h.name,
          awayTeam: a.name,
          kickoffUtc: "2026-09-30T23:30:00Z",
        },
        "v2_experimental",
      );
      expect(p.queries).toHaveLength(2);
      expect(p.queries.every((q) => Array.from(q.query).length <= 400)).toBe(true);
      pairs++;
    }
  expect(pairs).toBeGreaterThan(1900);
});
