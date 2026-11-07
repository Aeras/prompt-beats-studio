import { runFullFootballEvidence } from "./football-full-evidence.server";
import { packFullEvidence } from "./football-full-evidence.shared";
import { searchInspirationWeb } from "./music-inspiration-research.server";
import {
  footballV2PlanningMessage,
  footballProfileConsent,
  FOOTBALL_SEARCH_PROFILES,
} from "./football-search-profiles.shared";
import {
  planFootballForecasts,
  planFootballSearchProfile,
} from "./football-forecast-planner.shared";
import {
  footballResearchBudget,
  FOOTBALL_CONSENT_VERSION,
  FOOTBALL_MAX_PROMPT_BYTES,
  FOOTBALL_MODEL_OUTPUT_TOKENS,
  FOOTBALL_RUN_TIMEOUT_MS,
  FOOTBALL_SEARCH_TIMEOUT_MS,
  FOOTBALL_MODEL_TIMEOUT_MS,
} from "./football-research-budget.shared";
import {
  fixtureLocalDate,
  footballV2SynthesisBrief,
  footballV2EvidenceUrls,
  packFootballEvidenceV2,
  attachIndependentAssessment,
  FOOTBALL_INDEPENDENT_ASSESSMENT_RULES,
} from "./football-evidence-v2.shared";
import { buildFootballClaimLedger } from "./football-evidence-v2.server";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildFootballPredictionConsensus,
  extractFootballPredictionReferences,
} from "./football-prediction-consensus.shared";
import { buildFootballSourceSnapshot } from "./football-ai-source-snapshot.shared";
import {
  footballAnalysisRequestSchema,
  footballResearchSystemForProfile,
  footballAiAssessmentSchema,
  footballResearchEvidenceSnapshotSchema,
  FOOTBALL_COMPLETE_RESEARCH_SYSTEM as FOOTBALL_RESEARCH_SYSTEM,
  filterResearchContextUrls,
  validateFootballMarketProbabilities,
} from "./football-ai-research.shared";
import {
  providerEvidenceUrls,
  withoutFootballSourceMetadata,
} from "./football-provider-evidence.shared";
import { FOOTBALL_LEAGUES, FOOTBALL_ESPN_LEAGUES } from "./football-research.shared";
import { usableOdds } from "./football-odds.shared";

// Deterministic future fixture calendar, independent of CI wall-clock hour and host timezone.
function offlineFixtureTimes(nowMs: number) {
  const now = new Date(nowMs);
  return {
    time: now.toISOString(),
    kickoff: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 12),
    ).toISOString(),
  };
}
for (const at of [
  "2026-11-06T21:00:00Z",
  "2026-11-06T23:14:00Z",
  "2026-11-07T00:01:00Z",
  "2026-03-28T23:30:00Z",
])
  test(`integration fixture stays date-correct across CI midnight/DST: ${at}`, () => {
    const { time, kickoff } = offlineFixtureTimes(Date.parse(at));
    const f = { leagueId: "IT-SA", homeTeam: "Inter", awayTeam: "Como", kickoffUtc: kickoff };
    expect(Date.parse(kickoff)).toBeGreaterThan(Date.parse(time));
    expect(fixtureLocalDate(f).date).toBe(kickoff.slice(0, 10));
    for (const pick of [
      "Our prediction for this match: Inter 2 - 1 Como",
      "Our pick: GG & Over 2.5",
    ]) {
      const text = `Inter vs Como Serie A ${kickoff.slice(0, 10)} ${kickoff.slice(11, 16)} UTC.\n${pick}`;
      expect(
        buildFootballClaimLedger(
          f,
          [
            {
              text,
              title: "Offline midnight regression",
              url: "https://sportsmole.co.uk/offline-midnight",
              accessedAt: time,
            },
          ],
          time,
        ).sourceCount,
      ).toBe(1);
    }
  });

for (const [iteration, mode] of (
  [
    "success",
    "success",
    "success",
    "success",
    "success",
    "success",
    "success",
    "success",
    "success",
    "success",
    "truncated",
    "invalid-assessment",
    "bad-judgment",
    "timeout",
    "denied",
    "admission-denied",
    "combo",
    "combo-without-joint",
    "abstain",
    "search-timeout",
    "journal-failure",
    "old-consent",
    "cancelled",
    "incident-score",
    "v2-basic",
    "v2-advanced",
    "v2-search-failure",
    "v2-forged-consent",
    "v2-denied",
    "v2-cancelled",
    "v2-second-failure",
    "v2-model-timeout",
    "v1-basic",
    "v2-fiorentina",
    "v2-manchester",
    "v2-unknown-team",
    "v2-league-mismatch",
    "v2-invalid-date",
    "v2-capacity-unknown",
    "v2-staged",
    ...Array.from({ length: 10 }, (_, i) => `v2-batch-${i}` as const),
  ] as const
).entries())
  test(`actual research handler ${iteration}: ${mode}, profile-derived searches, one paid attempt, authoritative provenance and retained usage`, async () => {
    const source = readFileSync(
      new URL("./football-ai-research.functions.ts", import.meta.url),
      "utf8",
    );
    const compiled = new (
      Bun as unknown as {
        Transpiler: new (options: { loader: string }) => { transformSync(source: string): string };
      }
    ).Transpiler({ loader: "ts" }).transformSync(source);
    const part = compiled.slice(
      compiled.indexOf(".handler(") + 9,
      compiled.indexOf("export const getPrivateFootballResearchHistory"),
    );
    const handlerText = part
      .slice(0, part.lastIndexOf(");"))
      .trim()
      .replaceAll("import(", "dynamicImport(");
    const v2 = mode.startsWith("v2-");
    const depth = (v2 && mode !== "v2-advanced") || mode === "v1-basic" ? "basic" : "advanced";
    const searchCount = v2 ? 2 : 5,
      resultsPerSearch = v2 ? 10 : 5,
      candidateCount = v2 ? 20 : 25;
    const profile = v2 ? "v2_experimental" : "v1_current";
    const { time, kickoff } = offlineFixtureTimes(Date.now());
    const identity = {
      leagueId: "IT-SA",
      homeTeam:
        mode === "v2-fiorentina"
          ? "Fiorentina"
          : mode === "v2-manchester"
            ? "Manchester United"
            : mode === "v2-unknown-team"
              ? "Inter Women"
              : "Inter",
      awayTeam:
        mode === "v2-fiorentina" ? "Juventus" : mode === "v2-manchester" ? "Liverpool" : "Como",
      kickoffUtc: mode === "v2-invalid-date" ? "invalid-date" : kickoff,
    };
    if (mode === "v2-manchester" || mode === "v2-league-mismatch") identity.leagueId = "EN-PL";
    const providerEvidence = {
      version: 1,
      collectedAtUtc: time,
      fixture: identity,
      providers: [
        {
          provider: "espn",
          status: "ok",
          fixtureId: "999",
          home: {
            id: "1",
            name: "Inter",
            standing: null,
            recentResults: [
              {
                id: "prior",
                kickoffUtc: "2026-01-01T12:00:00Z",
                opponent: "Synthetic opponent",
                homeAway: "home",
                goalsFor: 3,
                goalsAgainst: 1,
              },
            ],
            roster: [],
            injuries: [{ name: "Synthetic player", detail: "Offline unavailable" }],
            matchStatistics: [],
            teamStatistics: [],
          },
          away: {
            id: "2",
            name: "Como",
            standing: null,
            recentResults: [],
            roster: [],
            injuries: [],
            matchStatistics: [],
            teamStatistics: [],
          },
          resources: [
            {
              url: "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=999",
              status: "ok",
              fetchedAtUtc: time,
            },
          ],
          notes: [],
        },
      ],
      conflicts: [],
    };
    const odds = {
      version: 1,
      provider: "arbplay-stoiximan",
      status: "missing",
      fixture: identity,
      retrievedAtUtc: time,
      sourceFiles: [],
      quotes: [],
      notes: [],
    };
    const hosts = [
      "sportsmole.co.uk",
      "predictz.com",
      "dimers.com",
      "sportskeeda.com",
      "bbc.com",
      "theguardian.com",
      "espn.com",
    ];
    const sources = Array.from({ length: candidateCount }, (_, i) => ({
      title: `Synthetic editorial ${i}`,
      url: `https://${hosts[i % hosts.length]}/offline-${i}`,
      accessedAt: time,
      excerpt: `${identity.homeTeam} vs ${identity.awayTeam} ${identity.leagueId === "EN-PL" ? "Premier League" : "Serie A"} ${kickoff.slice(0, 10)} ${kickoff.slice(11, 16)} UTC.\n${i < 5 ? "Επιλογή" : i < 10 ? "Our pick" : "Прогноз"}: ${i === 0 && mode === "combo" ? "GG & Over 2.5" : i >= 10 && i < 15 ? "ТБ 2,5" : "Over 2.5"}; ${i < 5 ? "Συνθετικό ελληνικό κείμενο για τα αγωνιστικά στοιχεία και τις εκτιμήσεις του συγκεκριμένου αγώνα" : i >= 10 && i < 15 ? "Синтетический русский текст о матче, только для проверки языка и подтверждения формы прогноза" : "Distinct synthetic English report"} ${i}.`,
      researchIntent: "external_forecasts" as const,
    }));
    if (mode === "v2-staged")
      for (const s of sources)
        s.excerpt =
          s.excerpt +
          "\n" +
          (s.excerpt.includes("Επιλογή")
            ? "Συνθετική περιγραφή αγώνα. "
            : s.excerpt.includes("Прогноз")
              ? "Синтетическое описание матча. "
              : "Synthetic article narrative. "
          ).repeat(600) +
          "\nOur pick: Over 2.5";
    if (mode === "incident-score")
      sources[0]!.excerpt = `Inter vs Como Serie A ${kickoff.slice(0, 10)}\nOur prediction for this match: Inter 2 - 1 Como`;
    const raw = {
      summary: "Existing football result must remain available and source-bound.",
      estimates: [
        {
          market: "home_win",
          percent: 30,
          reason: "Synthetic home-team evidence for this fixture",
        },
        { market: "draw", percent: 25, reason: "Synthetic draw evidence for this fixture" },
        {
          market: "away_win",
          percent: 45,
          reason: "Synthetic away-team evidence for this fixture",
        },
      ],
      independentAssessment:
        mode === "abstain"
          ? {
              decision: "abstain",
              rationale: "The synthetic evidence is insufficient for an independent opinion.",
              supportingClaimIds: [],
              evidenceUrls: [],
            }
          : {
              decision: "lean",
              selection:
                mode === "combo" || mode === "combo-without-joint"
                  ? {
                      kind: "and",
                      legs: [
                        { kind: "btts", period: "FT", selection: "yes" },
                        { kind: "total", period: "FT", selection: "over", line: 2.5 },
                      ],
                    }
                  : { kind: "total", period: "FT", selection: "over", line: 2.5 },
              rationale:
                "Independent synthetic reading of actual supplied form and contrary uncertainty.",
              supportingClaimIds: mode === "combo" || mode === "combo-without-joint" ? [0] : [],
              evidenceUrls:
                mode === "combo" || mode === "combo-without-joint"
                  ? [sources[0]!.url, providerEvidence.providers[0]!.resources[0]!.url]
                  : [providerEvidence.providers[0]!.resources[0]!.url],
              ...(mode === "combo" || mode === "combo-without-joint"
                ? {
                    jointRationale:
                      "The supplied exact authored conjunction and provider facts jointly support this qualitative hypothesis.",
                  }
                : {}),
            },
      suggestions: [],
      limitations: [],
      // An injected/malformed model extraction cannot replace server-owned votes.
      onlinePredictions: [{ sourceIndex: 999, market: "invented_market" }],
      externalPredictionConsensus: { sourceCount: 999 },
      onlineEvidenceV2: { version: 2, sourceCount: 999 },
      onlineSourceAgreement: { sourceCount: 999 },
      ...(mode === "bad-judgment"
        ? {
            onlineJudgment: {
              decision: "lean",
              primary: "2 & Over 2.5",
              rationale: "This unsupported combination must not be applied",
              counterargument: "The source votes must still be retained",
              risk: "Unknown market and fictional joint probability",
              evidenceUrls: [sources[0]!.url],
            },
          }
        : {}),
      ...(mode === "invalid-assessment" ? { summary: 1 } : {}),
    };
    const usage = { inputTokens: 4071, outputTokens: 4198, totalTokens: 8269 };
    let searches = 0,
      calls = 0,
      admissions = 0,
      marked = false;
    const updates: Record<string, unknown>[] = [];
    const chain = {
      update: (v: Record<string, unknown>) => {
        updates.push(structuredClone(v));
        if (v["provider_started_at"]) marked = true;
        return chain;
      },
      eq: () => chain,
      abortSignal: () => chain,
      is: () => chain,
      select: () => chain,
      maybeSingle: async () => ({
        data: mode === "journal-failure" ? null : { id: "run" },
        error: mode === "journal-failure" ? { code: "offline" } : null,
      }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: mode === "journal-failure" ? { code: "offline" } : null }),
    };
    const admin = {
      rpc: async () => ({
        data: { id: "run", status: ++admissions === 1 ? "claimed" : "completed" },
        error: null,
      }),
      from: () => chain,
    };
    const dynamicImport = async (path: string) => {
      if (path.includes("football-full-evidence.server"))
        return {
          runFullFootballEvidence,
          footballFullModelCapacity: async () => ({
            context: mode === "v2-capacity-unknown" ? null : 1000000,
            output: 16384,
          }),
        };
      if (path.includes("ai-provider"))
        return {
          resolveAiModelForUser: async () => ({ model: "offline", provider: "openrouter" }),
          modelCaller: () => async (input: { prompt: string; system: string }) => {
            calls++;
            expect(marked).toBe(true);
            if (mode === "timeout" || mode === "v2-model-timeout")
              throw new Error("offline provider timeout");
            const prompt = JSON.parse(input.prompt);
            if (v2) {
              if (prompt.readingChunks) {
                expect(input).toHaveProperty("maxTokens", 8192);
                const evidenceCandidates = prompt.readingChunks
                  .filter((c: { text: string }) => c.text.includes("Our pick: Over 2.5"))
                  .map((c: { sourceId: string }) => ({
                    sourceId: c.sourceId,
                    quote: "Our pick: Over 2.5",
                    market: { kind: "total", period: "FT", selection: "over", line: 2.5 },
                    kind: "editorial",
                    rationale: "Synthetic offline authored pick",
                  }));
                return {
                  text: JSON.stringify({ evidenceCandidates }),
                  usage,
                  stopReason: "end_turn",
                  provider: "openrouter",
                  model: "offline",
                };
              }
              expect(input).toHaveProperty("maxTokens", FOOTBALL_MODEL_OUTPUT_TOKENS);
              if (prompt.readingMode) {
                expect(prompt.sources).toHaveLength(candidateCount);
                expect(prompt.validatedCandidates.length).toBeGreaterThan(0);
              } else {
                expect(prompt.sources).toHaveLength(candidateCount);
                expect(prompt.sources[19].text).toBe(sources[19]!.excerpt);
              }
              expect(prompt.context.providerEvidence.providers[0].home.recentResults).toHaveLength(
                1,
              );
              expect(prompt.context.providerEvidence.providers[0].home.injuries).toHaveLength(1);
              expect(input.system).toContain("Read every supplied article");
              expect(input.system).toContain("Use EXACT market ASTs");
              return {
                text: JSON.stringify({
                  ...raw,
                  evidenceCandidates: prompt.readingMode
                    ? []
                    : prompt.sources
                        .filter((s: { text: string }) => s.text.includes("Our pick: Over 2.5"))
                        .map((s: { sourceId: string }) => ({
                          sourceId: s.sourceId,
                          quote: "Our pick: Over 2.5",
                          market: { kind: "other", label: "goals prediction" },
                          kind: "editorial",
                          rationale: "Literal synthetic source recommendation",
                        })),
                  independentAssessment: {
                    decision: "lean",
                    rationale:
                      "Independent reading of supplied provider evidence and source uncertainty.",
                    primary: {
                      market: { kind: "total", period: "FT", selection: "over", line: 2.5 },
                      rationale:
                        "Form and the source-grounded goals selections support this qualitative lean.",
                      risk: "Finishing variance may produce a low-scoring game.",
                      evidenceUrls: [providerEvidence.providers[0]!.resources[0]!.url],
                    },
                  },
                }),
                usage,
                stopReason: "end_turn",
                provider: "openrouter",
                model: "offline",
              };
            }
            expect(input).toHaveProperty("maxTokens", FOOTBALL_MODEL_OUTPUT_TOKENS);
            expect(prompt.sources).toHaveLength(candidateCount);
            expect(prompt.providerEvidence.providers[0].home.recentResults).toHaveLength(1);
            expect(prompt.providerEvidence.providers[0].home.injuries).toHaveLength(1);
            expect(prompt.onlineEvidenceV2.profile).toBe(v2 ? "forecast-only-2" : "P1-Preserve");
            expect(prompt.onlineEvidenceV2.version).toBe(2);
            if (v2) {
              expect(prompt.performedSearches).toEqual([
                { language: "en", intent: "external_forecasts" },
                { language: "ru", intent: "external_forecasts" },
              ]);
              expect(input).toHaveProperty(
                "system",
                footballResearchSystemForProfile("v2_experimental"),
              );
              expect(prompt.sources[19].url).toBe(sources[19]!.url);
            }
            if (mode === "incident-score")
              expect(
                prompt.onlineEvidenceV2.claims.some(
                  (c: { market: { kind: string } }) => c.market.kind === "score",
                ),
              ).toBe(true);
            expect(
              prompt.onlineEvidenceV2.claims.every((c: { url: string }) =>
                sources.some((s) => s.url === c.url),
              ),
            ).toBe(true);
            expect(prompt.sources[6].sourceIndex).toBe(6);
            return {
              text: JSON.stringify(raw),
              usage,
              stopReason: mode === "truncated" ? "max_tokens" : "end_turn",
            };
          },
        };
      if (path.includes("client.server")) return { supabaseAdmin: admin };
      if (path.includes("football-espn.server"))
        return {
          fetchEspnFootballWeek: async () => [
            { ...identity, source: "espn", sourceFixtureId: "999", state: "scheduled" },
          ],
        };
      if (path.includes("football-provider-evidence.server"))
        return { collectFootballProviderEvidence: async () => providerEvidence };
      if (path.includes("football-provider-evidence.shared"))
        return { providerEvidenceUrls, withoutFootballSourceMetadata };
      if (path.includes("football-evidence-v2.server")) return { buildFootballClaimLedger };
      if (path.includes("football-odds.server"))
        return { collectFootballBookmakerOdds: async () => odds };
      if (path.includes("music-inspiration-research.server"))
        return {
          getMusicInspirationPrices: async () => ({
            input: 1,
            output: 2,
            cached: null,
            cacheWrite: null,
            searchCreditUsd: 0.008,
          }),
          searchInspirationWeb: async (
            query: string,
            signal: AbortSignal,
            _fetch: unknown,
            _key: unknown,
            depth: "basic" | "advanced",
            options: { football: { maxResults: number } },
          ) => {
            expect(options.football.maxResults).toBe(resultsPerSearch);
            expect(depth).toBe(
              (v2 && mode !== "v2-advanced") || mode === "v1-basic" ? "basic" : "advanced",
            );
            expect(signal.aborted).toBe(false);
            expect(updates.at(-1)?.["usage"]).toHaveProperty("research.searches");
            const journal = (
              updates.at(-1)?.["usage"] as { research: { searches: { state: string }[] } }
            ).research.searches;
            expect(journal.at(-1)!.state).toBe("unconfirmed");
            const plan = planFootballSearchProfile(identity, profile);
            expect(query).toBe(plan.queries[searches]!.query);
            const index = searches++;
            if (
              mode === "search-timeout" ||
              mode === "v2-search-failure" ||
              (mode === "v2-second-failure" && index === 1)
            )
              throw new Error("offline search timeout");
            if (v2)
              return searchInspirationWeb(
                query,
                signal,
                async (_url, init) => {
                  const request = JSON.parse(String(init?.body));
                  expect(_url).toBe("https://api.tavily.com/search");
                  expect(request.max_results).toBe(10);
                  expect(request.search_depth).toBe(depth);
                  expect(request.include_raw_content).toBe("text");
                  return Response.json({
                    usage: { credits: depth === "basic" ? 1 : 2 },
                    request_id: `offline-${index}`,
                    results: sources
                      .slice(index * 10, index * 10 + 10)
                      .map((s) => ({ title: s.title, url: s.url, raw_content: s.excerpt })),
                  });
                },
                "offline-fixture-key",
                depth,
                { football: { textChars: 24000, maxResults: 10, format: "text" } },
              );
            return {
              credits: depth === "basic" ? 1 : 2,
              requestId: `offline-${index}`,
              documents: sources
                .slice(index * 5, index * 5 + 5)
                .map((s) => ({ source: s, text: s.excerpt })),
            };
          },
        };
      throw Error("Unexpected dependency " + path);
    };
    const scope = {
      dynamicImport,
      packFullEvidence,
      getRequest: () => ({
        signal:
          mode === "cancelled" || mode === "v2-cancelled"
            ? AbortSignal.abort()
            : new AbortController().signal,
      }),
      planFootballForecasts,
      planFootballSearchProfile,
      footballV2PlanningMessage,
      footballAnalysisRequestSchema,
      footballResearchSystemForProfile,
      footballResearchBudget,
      FOOTBALL_CONSENT_VERSION,
      FOOTBALL_MAX_PROMPT_BYTES,
      FOOTBALL_MODEL_OUTPUT_TOKENS,
      FOOTBALL_RUN_TIMEOUT_MS,
      FOOTBALL_SEARCH_TIMEOUT_MS,
      FOOTBALL_MODEL_TIMEOUT_MS,
      attachIndependentAssessment,
      FOOTBALL_INDEPENDENT_ASSESSMENT_RULES,
      FOOTBALL_LEAGUES,
      FOOTBALL_ESPN_LEAGUES,
      LANGUAGE: {},
      buildFootballSourceSnapshot,
      footballV2SynthesisBrief,
      footballV2EvidenceUrls,
      packFootballEvidenceV2,
      buildFootballPredictionConsensus,
      extractFootballPredictionReferences,
      footballAiAssessmentSchema,
      footballResearchEvidenceSnapshotSchema,
      FOOTBALL_RESEARCH_SYSTEM,
      filterResearchContextUrls,
      validateFootballMarketProbabilities,
      usableOdds,
      requireFootballSuperAdmin: async (s: { rpc: () => Promise<{ data: boolean }> }) => {
        if (!(await s.rpc()).data) throw Error("Not allowed");
      },
      withFeatureAiDispatchAdmission: async (
        _u: string,
        _f: string[],
        fn: () => Promise<unknown>,
      ) => (mode === "admission-denied" ? Promise.reject(Error("offline admission denial")) : fn()),
      process: { env: { OPENROUTER_API_KEY: "offline", TAVILY_API_KEY: "offline" } },
    };
    const handler = new Function(...Object.keys(scope), `return (${handlerText})`)(
      ...Object.values(scope),
    );
    const input = {
      data: {
        fixtureProvider: "espn",
        leagueId: identity.leagueId,
        weekDate: kickoff.slice(0, 10),
        fixtureId: "999",
        modelId: "offline",
        requestKey: "a1111111-1111-4111-8111-111111111111",
        withTavily: true,
        tavilySearchDepth: depth,
        approvePaidRequest: true,
        researchConsentVersion: v2
          ? FOOTBALL_SEARCH_PROFILES.v2_experimental.consentVersion
          : FOOTBALL_CONSENT_VERSION,
        ...(v2
          ? {
              searchProfileVersion: profile,
              researchConsent: footballProfileConsent(profile, depth, "offline", "999"),
            }
          : {}),
      },
      context: {
        userId: "owner",
        supabase: {
          rpc: async () => ({ data: mode !== "denied" && mode !== "v2-denied", error: null }),
        },
      },
    };
    if (["v2-unknown-team", "v2-league-mismatch", "v2-invalid-date"].includes(mode)) {
      const code =
        mode === "v2-unknown-team"
          ? "football_v2_team_identity_unverified"
          : mode === "v2-league-mismatch"
            ? "football_v2_competition_mismatch"
            : "football_v2_venue_date_unverified";
      await expect(handler(input)).rejects.toThrow(footballV2PlanningMessage(code));
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      const failed = updates.find((u) => u["status"] === "failed");
      expect(failed?.["error_code"]).toBe(code);
      expect(
        (failed?.["usage"] as { research: { searches: unknown[] } }).research.searches,
      ).toEqual([]);
      await expect(handler(input)).rejects.toThrow("already recorded");
      expect(searches).toBe(0);
      return;
    }
    if (mode === "v2-capacity-unknown") {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(searches).toBe(2);
      expect(calls).toBe(0);
      const failed = updates.find((u) => u["status"] === "failed")!;
      expect(failed["error_code"]).toBe("incomplete_coverage");
      const report = (
        failed["usage"] as {
          research: { fullEvidenceV2: { coverage: string; reason: string; sources: unknown[] } };
        }
      ).research.fullEvidenceV2;
      expect(report.coverage).toBe("incomplete_coverage");
      expect(report.reason).toBe("capacity_unknown");
      expect(report.sources).toHaveLength(20);
      await expect(handler(input)).rejects.toThrow("already recorded");
      expect(searches).toBe(2);
      return;
    }
    if (mode === "v2-forged-consent") {
      input.data.researchConsent!.depth = depth === "basic" ? "advanced" : "basic";
      await expect(handler(input)).rejects.toThrow("selected search profile");
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      expect(admissions).toBe(0);
      return;
    }
    if (mode === "old-consent") {
      delete (input.data as { researchConsentVersion?: string }).researchConsentVersion;
      await expect(handler(input)).rejects.toThrow("five-search");
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      expect(admissions).toBe(0);
      return;
    }
    if (
      mode === "search-timeout" ||
      mode === "journal-failure" ||
      mode === "v2-search-failure" ||
      mode === "v2-second-failure"
    ) {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(calls).toBe(0);
      expect(searches).toBe(
        mode === "v2-second-failure"
          ? 2
          : mode === "search-timeout" || mode === "v2-search-failure"
            ? 1
            : 0,
      );
      expect(updates.some((u) => u["status"] === "failed" && !!u["usage"])).toBe(true);
      await expect(handler(input)).rejects.toThrow("already recorded");
      return;
    }
    if (mode === "cancelled" || mode === "v2-cancelled") {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      return;
    }
    if (mode === "denied" || mode === "v2-denied") {
      await expect(handler(input)).rejects.toThrow("Not allowed");
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      expect(admissions).toBe(0);
      return;
    }
    if (mode === "admission-denied") {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      return;
    }
    if (
      [
        "success",
        "bad-judgment",
        "combo",
        "combo-without-joint",
        "abstain",
        "incident-score",
        "v2-basic",
        "v2-advanced",
        "v2-fiorentina",
        "v2-manchester",
        "v2-staged",
        "v2-search-failure",
        "v2-forged-consent",
        "v2-denied",
        "v2-cancelled",
        "v1-basic",
      ].includes(mode) ||
      mode.startsWith("v2-batch-")
    ) {
      const result = await handler(input);
      expect(result.analysis.externalPredictionConsensus.sourceCount).toBeGreaterThan(0);
      expect(result.analysis.onlineEvidenceV2.sources).toHaveLength(candidateCount);
      if (mode === "incident-score")
        expect(
          result.analysis.onlineEvidenceV2.claims.some(
            (c: { countable: boolean; market: { kind: string } }) =>
              c.countable && c.market.kind === "score",
          ),
        ).toBe(true);
      expect(result.analysis.estimates).toHaveLength(3);
      const usageAudit = updates.find((u) => u["status"] === "completed")!["usage"] as {
        research: {
          budget: { searchCredits: number; searchCalls: number; resultsPerSearch: number };
          sourceSummary: { retainedDocs: number; legacyProjectionOmitted: number };
          searches: { credits: number; returnedSources: { url: string; title: string }[] }[];
        };
      };
      expect(usageAudit.research.searches).toHaveLength(searchCount);
      expect(usageAudit.research.budget.searchCredits).toBe(
        searchCount * (depth === "basic" ? 1 : 2),
      );
      expect(usageAudit.research.searches.reduce((sum, q) => sum + q.credits, 0)).toBe(
        searchCount * (depth === "basic" ? 1 : 2),
      );
      expect(result.analysis.searchProfileVersion).toBe(profile);
      if (v2) {
        expect(usageAudit.research.sourceSummary).toMatchObject({
          retainedDocs: 20,
          legacyProjectionOmitted: 2,
        });
        expect(result.sources).toHaveLength(20);
      }
      expect(
        usageAudit.research.searches.every((q) => q.returnedSources.length === resultsPerSearch),
      ).toBe(true);
      expect(
        usageAudit.research.searches.flatMap((q) => q.returnedSources).map((s) => s.url),
      ).toEqual(sources.map((s) => s.url));
      expect(result.analysis.researchBrief.matchFacts).toHaveLength(v2 ? 0 : 10);
      if (mode === "combo")
        expect(result.analysis.onlineEvidenceV2.judgment.selection.kind).toBe("and");
      if (mode === "combo-without-joint")
        expect(result.analysis.onlineEvidenceV2.judgmentStatus).toBe("invalid_evidence");
      if (mode === "abstain")
        expect(result.analysis.onlineEvidenceV2.judgment.decision).toBe("abstain");
      expect(
        result.analysis.onlineEvidenceV2.sources.some(
          (s: { detectedLanguage: string }) => s.detectedLanguage === "el",
        ),
      ).toBe(true);
      expect(
        result.analysis.onlineEvidenceV2.sources.some(
          (s: { detectedLanguage: string }) => s.detectedLanguage === "ru",
        ),
      ).toBe(true);
      expect(result.analysis.bookmakerOddsSnapshot).toEqual(odds);
      expect(result.analysis.onlineEvidenceV2.version).toBe(2);
      const persisted = updates.find((u) => u["status"] === "completed")!;
      expect(persisted["analysis"]).not.toHaveProperty("onlineEvidenceV2");
      expect(
        footballAiAssessmentSchema.omit({ onlineEvidenceV2: true }).safeParse(persisted["analysis"])
          .success,
      ).toBe(true);
      expect(
        (persisted["sources"] as { kind?: string }[]).some(
          (s) => s.kind === "football-online-evidence",
        ),
      ).toBe(true);
      if (mode === "bad-judgment") {
        expect(result.analysis.externalPredictionConsensus.judgment).toBeUndefined();
        expect(result.analysis.externalPredictionConsensus.judgmentStatus).toBe("invalid_evidence");
      }
      expect(
        updates.some(
          (u) =>
            u["status"] === "completed" &&
            (u["usage"] as { inputTokens?: number })?.inputTokens ===
              usage.inputTokens * (mode === "v2-staged" ? calls : 1),
        ),
      ).toBe(true);
    } else {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(
        updates.some(
          (u) =>
            u["status"] === "failed" &&
            (mode === "v2-model-timeout"
              ? (u["usage"] as { inputTokens?: number | null })?.inputTokens === null
              : mode === "timeout"
                ? !!(u["usage"] as { research?: unknown })?.research &&
                  !("inputTokens" in (u["usage"] as object))
                : (u["usage"] as { inputTokens?: number })?.inputTokens === usage.inputTokens),
        ),
      ).toBe(true);
    }
    await expect(handler(input)).rejects.toThrow("already recorded");
    if (v2) {
      const other = {
        ...input,
        data: {
          ...input.data,
          searchProfileVersion: "v1_current",
          researchConsentVersion: FOOTBALL_SEARCH_PROFILES.v1_current.consentVersion,
          researchConsent: footballProfileConsent("v1_current", depth, "offline", "999"),
        },
      };
      await expect(handler(other)).rejects.toThrow("already recorded");
    }
    expect(searches).toBe(searchCount);
    expect(calls).toBe(mode === "v2-staged" ? 4 : 1);
  });
