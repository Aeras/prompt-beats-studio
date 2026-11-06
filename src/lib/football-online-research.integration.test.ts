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
  FOOTBALL_RESEARCH_SYSTEM,
  filterResearchContextUrls,
  validateFootballMarketProbabilities,
} from "./football-ai-research.shared";
import {
  providerEvidenceUrls,
  withoutFootballSourceMetadata,
} from "./football-provider-evidence.shared";
import { FOOTBALL_LEAGUES, FOOTBALL_ESPN_LEAGUES } from "./football-research.shared";
import { usableOdds } from "./football-odds.shared";

for (const mode of ["success", "truncated", "invalid-assessment", "bad-judgment"] as const)
  test(`actual research handler: ${mode}, three searches, one paid attempt, authoritative provenance and retained usage`, async () => {
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
      providers: [],
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
    const sources = hosts.map((host, i) => ({
      title: `Synthetic editorial ${i}`,
      url: `https://${host}/offline-${i}`,
      accessedAt: time,
      excerpt: `Inter vs Como Serie A ${kickoff.slice(0, 10)} ${kickoff.slice(11, 16)} UTC. Prediction: Over 2.5; Distinct synthetic report ${i}.`,
      researchIntent: "external_forecasts" as const,
    }));
    const raw = {
      summary: "Existing football result must remain available and source-bound.",
      suggestions: [],
      limitations: [],
      // An injected/malformed model extraction cannot replace server-owned votes.
      onlinePredictions: [{ sourceIndex: 999, market: "invented_market" }],
      externalPredictionConsensus: { sourceCount: 999 },
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
        updates.push(v);
        if (v["provider_started_at"]) marked = true;
        return chain;
      },
      eq: () => chain,
      is: () => chain,
      select: () => chain,
      maybeSingle: async () => ({ data: { id: "run" }, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
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
            const prompt = JSON.parse(input.prompt);
            expect(prompt.sources).toHaveLength(7);
            expect(prompt.onlineSourceAgreement.sourceCount).toBe(7);
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
      if (path.includes("football-odds.server"))
        return { collectFootballBookmakerOdds: async () => odds };
      if (path.includes("music-inspiration-research.server"))
        return {
          searchInspirationWeb: async () => {
            const index = searches++;
            return {
              documents: sources
                .slice(index * 3, index * 3 + 3)
                .map((s) => ({ source: s, text: s.excerpt })),
            };
          },
        };
      throw Error("Unexpected dependency " + path);
    };
    const scope = {
      dynamicImport,
      FOOTBALL_LEAGUES,
      FOOTBALL_ESPN_LEAGUES,
      LANGUAGE: {},
      buildFootballSourceSnapshot,
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
      ) => fn(),
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
      },
      context: { userId: "owner", supabase: { rpc: async () => ({ data: true, error: null }) } },
    };
    if (mode === "success" || mode === "bad-judgment") {
      const result = await handler(input);
      expect(result.analysis.externalPredictionConsensus.sourceCount).toBe(7);
      expect(result.analysis.bookmakerOddsSnapshot).toEqual(odds);
      if (mode === "bad-judgment") {
        expect(result.analysis.externalPredictionConsensus.judgment).toBeUndefined();
        expect(result.analysis.externalPredictionConsensus.judgmentStatus).toBe("invalid_evidence");
      }
      expect(updates.some((u) => u["status"] === "completed" && u["usage"] === usage)).toBe(true);
    } else {
      await expect(handler(input)).rejects.toThrow("cannot be automatically retried");
      expect(updates.some((u) => u["status"] === "failed" && u["usage"] === usage)).toBe(true);
    }
    await expect(handler(input)).rejects.toThrow("already recorded");
    expect(searches).toBe(3);
    expect(calls).toBe(1);
  });
