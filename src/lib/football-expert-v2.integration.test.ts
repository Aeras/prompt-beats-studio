import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { footballAiAssessmentSchema } from "./football-ai-research.shared";
import {
  footballExpertDecisionSchema,
  FOOTBALL_EXPERT_ANALYST_SYSTEM,
  FOOTBALL_EXPERT_CANONICAL_CONTRACT,
} from "./football-ai-research-phases.shared";
import { buildFootballExpertPayload } from "./football-ai-expert-payload.shared";
import { validateFootballExpertV2 } from "./football-expert-v2.shared";
import { usableOdds } from "./football-odds.shared";
for (const bad of [false, true])
  test(`actual expert dispatch ${bad ? "rejects foreign quote and retains usage" : "persists canonical quote and refuses duplicate paid attempt"}`, async () => {
    const text = readFileSync(
      new URL("./football-ai-expert.functions.ts", import.meta.url),
      "utf8",
    );
    const compiled = new (
      Bun as unknown as {
        Transpiler: new (options: { loader: string }) => { transformSync(source: string): string };
      }
    ).Transpiler({ loader: "ts" }).transformSync(text);
    const start = compiled.indexOf(".handler(") + ".handler(".length;
    const handlerText = compiled
      .slice(start, compiled.lastIndexOf(");"))
      .trim()
      .replaceAll("import(", "dynamicImport(");
    const time = new Date().toISOString(),
      kickoff = new Date(Date.now() + 86400000).toISOString();
    const snapshot = {
      version: 1,
      provider: "arbplay-stoiximan",
      status: "matched",
      retrievedAtUtc: time,
      observedAtUtc: time,
      fixture: {
        leagueId: "EN-PL",
        homeTeam: "Arsenal",
        awayTeam: "Liverpool",
        kickoffUtc: kickoff,
      },
      sourceFiles: ["site_pregame_stoiximan_soccer_leagues.json"],
      providerFixtureId: "x",
      notes: [],
      quotes: ["home_win", "draw", "away_win"].map((market, i) => ({
        market,
        selectionId: "s" + i,
        providerMarketId: "m",
        decimal: 2 + i,
        line: null,
        observedAtUtc: time,
        retrievedAtUtc: time,
        sourceFile: "site_pregame_stoiximan_soccer_leagues.json",
      })),
    };
    const assessment = footballAiAssessmentSchema.parse({
      summary: "Complete existing football analysis with actual sources.",
      suggestions: [],
      limitations: [],
      bookmakerOddsSnapshot: snapshot,
      researchBrief: {
        collectedAtUtc: time,
        matchFacts: [],
        externalForecasts: [],
        evidenceStatus: "unverified_source_extracts",
      },
    });
    const decision = {
      decision: "pick",
      primary: {
        market: "home_win",
        offeredSelectionId: bad ? "foreign-selection" : "s0",
        confidence: "low",
        rationale: "The supplied facts support only a conditional football opinion.",
        strongestEvidence: "Source context, not model verification",
        mainRisk: "Missing final lineups",
      },
      avoid: "",
      limitations: [],
    };
    let calls = 0,
      inserts = 0,
      marked = false;
    const updates: Record<string, unknown>[] = [];
    const usage = { inputTokens: 100, outputTokens: 40, totalTokens: 140 };
    const admin = {
      from: () => {
        let mode = "read";
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          insert: () => {
            mode = "insert";
            return chain;
          },
          update: (v: Record<string, unknown>) => {
            mode = "update";
            updates.push(v);
            return chain;
          },
          maybeSingle: async () =>
            mode === "update"
              ? ((marked = true), { data: { id: "review" }, error: null })
              : {
                  data: {
                    id: "run",
                    user_id: "owner",
                    status: "completed",
                    kickoff_utc: kickoff,
                    analysis: assessment,
                  },
                  error: null,
                },
          single: async () => ({
            data: ++inserts === 1 ? { id: "review" } : null,
            error: inserts === 1 ? null : { code: "23505" },
          }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
        };
        return chain;
      },
    };
    const dynamicImport = async (path: string) =>
      path.includes("ai-provider")
        ? {
            resolveAiModelForUser: async () => ({ model: "offline", provider: "openrouter" }),
            modelCaller: () => async (input: { system: string; prompt: string }) => {
              expect(marked).toBe(true);
              calls++;
              expect(input.system).toContain(FOOTBALL_EXPERT_CANONICAL_CONTRACT);
              expect(JSON.parse(input.prompt).bookmakerOddsSnapshot).toEqual(
                assessment.bookmakerOddsSnapshot,
              );
              return { text: JSON.stringify(decision), usage, stopReason: "end_turn" };
            },
          }
        : { supabaseAdmin: admin };
    const scope = {
      dynamicImport,
      footballAiAssessmentSchema,
      footballExpertDecisionSchema,
      FOOTBALL_EXPERT_ANALYST_SYSTEM,
      FOOTBALL_EXPERT_CANONICAL_CONTRACT,
      buildFootballExpertPayload,
      validateFootballExpertV2,
      usableOdds,
      withFeatureAiDispatchAdmission: async (
        _u: string,
        _f: string[],
        fn: () => Promise<unknown>,
      ) => fn(),
      process: { env: { OPENROUTER_API_KEY: "offline" } },
    };
    const handler = new Function(...Object.keys(scope), `return (${handlerText})`)(
      ...Object.values(scope),
    );
    const input = {
      data: { runId: "run", modelId: "offline", approvePaidRequest: true },
      context: { userId: "owner", supabase: { rpc: async () => ({ data: true, error: null }) } },
    };
    if (bad) {
      await expect(handler(input)).rejects.toThrow("Expert review failed");
      expect(updates.some((u) => u["status"] === "failed" && u["usage"] === usage)).toBe(true);
      expect(updates.some((u) => u["status"] === "completed")).toBe(false);
    } else {
      await handler(input);
      expect(updates.some((u) => u["status"] === "completed" && u["usage"] === usage)).toBe(true);
    }
    await expect(handler(input)).rejects.toThrow();
    expect(calls).toBe(1);
  });
