import { planFootballForecasts } from "./football-forecast-planner.shared";
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
  ] as const
).entries())
  test(`actual research handler ${iteration}: ${mode}, five searches, one paid attempt, authoritative provenance and retained usage`, async () => {
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
    const time = new Date().toISOString(),
      kickoff = new Date(Math.ceil(Date.now() / 60000) * 60000 + 86400000).toISOString();
    const identity = {
      leagueId: "IT-SA",
      homeTeam: "Inter",
      awayTeam: "Como",
      kickoffUtc: kickoff,
    };
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
    const sources = Array.from({ length: 25 }, (_, i) => ({
      title: `Synthetic editorial ${i}`,
      url: `https://${hosts[i % hosts.length]}/offline-${i}`,
      accessedAt: time,
      excerpt: `Inter vs Como Serie A ${kickoff.slice(0, 10)} ${kickoff.slice(11, 16)} UTC.\n${i < 5 ? "Επιλογή" : i < 10 ? "Our pick" : "Прогноз"}: ${i === 0 && mode === "combo" ? "GG & Over 2.5" : i >= 10 && i < 15 ? "ТБ 2,5" : "Over 2.5"}; ${i < 5 ? "Συνθετικό ελληνικό κείμενο για τα αγωνιστικά στοιχεία και τις εκτιμήσεις του συγκεκριμένου αγώνα" : i >= 10 && i < 15 ? "Синтетический русский текст о матче, только для проверки языка и подтверждения формы прогноза" : "Distinct synthetic English report"} ${i}.`,
      researchIntent: "external_forecasts" as const,
    }));
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
      if (path.includes("ai-provider"))
        return {
          resolveAiModelForUser: async () => ({ model: "offline", provider: "openrouter" }),
          modelCaller: () => async (input: { prompt: string }) => {
            calls++;
            expect(marked).toBe(true);
            expect(input).toHaveProperty("maxTokens", FOOTBALL_MODEL_OUTPUT_TOKENS);
            if (mode === "timeout") throw new Error("offline provider timeout");
            const prompt = JSON.parse(input.prompt);
            expect(prompt.sources).toHaveLength(25);
            expect(prompt.providerEvidence.providers[0].home.recentResults).toHaveLength(1);
            expect(prompt.providerEvidence.providers[0].home.injuries).toHaveLength(1);
            expect(prompt.onlineEvidenceV2.profile).toBe("P1-Preserve");
            expect(prompt.onlineEvidenceV2.version).toBe(2);
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
            depth: string,
            options: { football: { maxResults: number } },
          ) => {
            expect(options.football.maxResults).toBe(5);
            expect(depth).toBe("advanced");
            expect(signal.aborted).toBe(false);
            expect(updates.at(-1)?.["usage"]).toHaveProperty("research.searches");
            const journal = (
              updates.at(-1)?.["usage"] as { research: { searches: { state: string }[] } }
            ).research.searches;
            expect(journal.at(-1)!.state).toBe("unconfirmed");
            const plan = planFootballForecasts(identity, "P1-Preserve");
            expect(query).toBe(plan.queries[searches]!.query);
            const index = searches++;
            if (mode === "search-timeout") throw new Error("offline search timeout");
            return {
              credits: 2,
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
      getRequest: () => ({
        signal: mode === "cancelled" ? AbortSignal.abort() : new AbortController().signal,
      }),
      planFootballForecasts,
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
        leagueId: "IT-SA",
        weekDate: kickoff.slice(0, 10),
        fixtureId: "999",
        modelId: "offline",
        withTavily: true,
        tavilySearchDepth: "advanced",
        approvePaidRequest: true,
        researchConsentVersion: FOOTBALL_CONSENT_VERSION,
      },
      context: {
        userId: "owner",
        supabase: { rpc: async () => ({ data: mode !== "denied", error: null }) },
      },
    };
    if (mode === "old-consent") {
      delete (input.data as { researchConsentVersion?: string }).researchConsentVersion;
      await expect(handler(input)).rejects.toThrow("five-search");
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      expect(admissions).toBe(0);
      return;
    }
    if (mode === "search-timeout" || mode === "journal-failure") {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(calls).toBe(0);
      expect(searches).toBe(mode === "search-timeout" ? 1 : 0);
      expect(updates.some((u) => u["status"] === "failed" && !!u["usage"])).toBe(true);
      await expect(handler(input)).rejects.toThrow("already recorded");
      return;
    }
    if (mode === "cancelled") {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(searches).toBe(0);
      expect(calls).toBe(0);
      return;
    }
    if (mode === "denied") {
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
      ].includes(mode)
    ) {
      const result = await handler(input);
      expect(result.analysis.externalPredictionConsensus.sourceCount).toBeGreaterThan(0);
      expect(result.analysis.onlineEvidenceV2.sources).toHaveLength(25);
      if (mode === "incident-score")
        expect(
          result.analysis.onlineEvidenceV2.claims.some(
            (c: { countable: boolean; market: { kind: string } }) =>
              c.countable && c.market.kind === "score",
          ),
        ).toBe(true);
      expect(result.analysis.estimates).toHaveLength(3);
      const usageAudit = updates.find((u) => u["status"] === "completed")!["usage"] as {
        research: { searches: { returnedSources: { url: string; title: string }[] }[] };
      };
      expect(usageAudit.research.searches).toHaveLength(5);
      expect(usageAudit.research.searches.every((q) => q.returnedSources.length === 5)).toBe(true);
      expect(
        usageAudit.research.searches.flatMap((q) => q.returnedSources).map((s) => s.url),
      ).toEqual(sources.map((s) => s.url));
      expect(result.analysis.researchBrief.matchFacts).toHaveLength(10);
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
            (u["usage"] as { inputTokens?: number })?.inputTokens === usage.inputTokens,
        ),
      ).toBe(true);
    } else {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(
        updates.some(
          (u) =>
            u["status"] === "failed" &&
            (mode === "timeout"
              ? !!(u["usage"] as { research?: unknown })?.research &&
                !("inputTokens" in (u["usage"] as object))
              : (u["usage"] as { inputTokens?: number })?.inputTokens === usage.inputTokens),
        ),
      ).toBe(true);
    }
    await expect(handler(input)).rejects.toThrow("already recorded");
    expect(searches).toBe(5);
    expect(calls).toBe(1);
  });
