import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCachedFootballWeek } from "@/lib/football-fixtures-cache.server";
import { footballMarketOutcome } from "@/lib/football-market-outcome.shared";
import { footballExpertDecisionSchema } from "@/lib/football-ai-research-phases.shared";
import {
  buildFootballSourceSnapshot,
  type FootballSourceSnapshot,
} from "@/lib/football-ai-source-snapshot.shared";
import {
  FOOTBALL_LEAGUES,
  FOOTBALL_ESPN_LEAGUES,
  type FootballLeagueId,
  type FootballAiDiscoveryLeagueId,
} from "@/lib/football-research.shared";
import {
  FOOTBALL_RESEARCH_SYSTEM,
  footballAiAssessmentSchema,
  footballResearchEvidenceSnapshotSchema,
  footballAnalysisRequestSchema,
  validateFootballMarketProbabilities,
  filterResearchContextUrls,
} from "@/lib/football-ai-research.shared";
import { withFeatureAiDispatchAdmission } from "@/lib/global-ai-usage.server";
import type { FootballFixture } from "@/lib/football-research.shared";

async function requireFootballSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_super_admin");
  if (error || data !== true) throw new Error("Not allowed");
}

const LANGUAGE: Record<string, string> = {
  "GR-SL": "ελληνικά",
  "EN-PL": "English",
  "ES-LL": "español",
  "IT-SA": "italiano",
  "DE-BL": "Deutsch",
  "FR-L1": "français",
  "NL-ED": "Nederlands",
  "PT-PL": "português",
  "BE-PL": "Nederlands français",
  "CH-SL": "Deutsch français",
  "UEFA-CL": "English",
  "UEFA-EL": "English",
};

/** One user-approved run. Every DB/provider operation is server-only. */
export const runPrivateFootballResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => footballAnalysisRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballSuperAdmin(context.supabase);
    if (process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] === "true") {
      throw new Error("AI analysis is disabled by the operator.");
    }
    if (!process.env["OPENROUTER_API_KEY"]?.trim()) {
      throw new Error("OpenRouter is not configured.");
    }
    if (!data.withTavily || !process.env["TAVILY_API_KEY"]?.trim()) {
      throw new Error("Source-backed analysis requires configured Tavily research.");
    }

    const { resolveAiModelForUser, modelCaller } = await import("@/lib/ai-provider.server");
    const resolved = await resolveAiModelForUser(context.userId, "ai_tools", data.modelId);
    if (resolved.provider !== "openrouter")
      throw new Error("Select an installed OpenRouter model.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let fixture: {
      source: string;
      leagueId: string;
      homeTeam: string;
      awayTeam: string;
      kickoffUtc: string;
    };
    let claimed: unknown;
    let claimError: unknown;
    if (data.fixtureProvider === "ai-search") {
      // Only server-corroborated (verified) AI fixtures; identity comes from the DB row.
      ({ data: claimed, error: claimError } = await supabaseAdmin.rpc(
        "claim_private_football_ai_research_run" as never,
        {
          _user_id: context.userId,
          _request_key: data.requestKey,
          _fixture_id: Number(data.fixtureId),
          _model_id: resolved.model,
        } as never,
      ));
      const c = (claimed ?? {}) as Record<string, string>;
      fixture = {
        source: "ai-search",
        leagueId: c["league_id"] ?? data.leagueId,
        homeTeam: c["home_team"] ?? "",
        awayTeam: c["away_team"] ?? "",
        kickoffUtc: c["kickoff_utc"] ? new Date(c["kickoff_utc"]).toISOString() : "",
      };
      if (!claimError && (!fixture.homeTeam || !fixture.kickoffUtc) && c["status"] === "claimed") {
        throw new Error("Only verified upcoming fixtures can be analyzed.");
      }
    } else {
      if (
        !(data.fixtureProvider === "espn" ? FOOTBALL_ESPN_LEAGUES : FOOTBALL_LEAGUES).some(
          (league) => league.id === data.leagueId,
        )
      ) {
        throw new Error("Unsupported competition for this provider.");
      }
      const legacyLeague = data.leagueId as FootballLeagueId;
      if (data.fixtureProvider === "football-data" && legacyLeague === "GR-SL") {
        throw new Error("Greek Super League is unavailable on football-data.org Free.");
      }
      const fixtures =
        data.fixtureProvider === "espn"
          ? await (
              await import("@/lib/football-espn.server")
            ).fetchEspnFootballWeek(data.leagueId, data.weekDate)
          : await getCachedFootballWeek(
              legacyLeague,
              data.weekDate,
              data.fixtureProvider === "football-data"
                ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
                : (await import("@/lib/football-fixtures.server")).fetchFootballWeek,
              Date.now,
              data.fixtureProvider,
            );
      const legacy = fixtures.find((item) => item.sourceFixtureId === data.fixtureId);
      if (!legacy || legacy.state !== "scheduled" || Date.parse(legacy.kickoffUtc) <= Date.now()) {
        throw new Error("Only verified upcoming fixtures can be analyzed.");
      }
      fixture = legacy;
      ({ data: claimed, error: claimError } = await supabaseAdmin.rpc(
        "claim_private_football_research_run_v2" as never,
        {
          _user_id: context.userId,
          _request_key: data.requestKey,
          _fixture_id: Number(legacy.sourceFixtureId),
          _league_id: legacy.leagueId,
          _home_team: legacy.homeTeam,
          _away_team: legacy.awayTeam,
          _kickoff_utc: legacy.kickoffUtc,
          _model_id: resolved.model,
          _source: data.fixtureProvider,
        } as never,
      ));
    }
    if (claimError) throw new Error("Research admission failed or hourly limit reached.");

    const claim = claimed as { status?: string; id?: string } | null;
    if (!claim?.id || claim.status !== "claimed") {
      throw new Error("This research request is already recorded. View history instead.");
    }
    const runId = claim.id;
    let providerCalled = false;
    let failureCode = "research_unavailable";
    let observedUsage: {
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
    } | null = null;

    try {
      return await withFeatureAiDispatchAdmission(context.userId, ["ai_generator"], async () => {
        // Load current ESPN data before paid research, without bypassing the fixture admission.
        const espnData = await (async () => {
          if (data.fixtureProvider !== "espn") return null;
          const { fetchEspnMatchContext } = await import("@/lib/football-espn-context.server");
          return fetchEspnMatchContext(data.leagueId, fixture as FootballFixture).catch(() => null);
        })();
        const { searchInspirationWeb } = await import("@/lib/music-inspiration-research.server");
        const kickoffDay = fixture.kickoffUtc.slice(0, 10);
        const common = `${fixture.homeTeam} vs ${fixture.awayTeam} ${kickoffDay}`;
        // ESPN provides structured baseline data. Tavily targets gaps, not redundant tables.
        const gaps = espnData?.missing.join(" ") ?? "standings form xG injuries";
        const queries = [
          `${common} ${gaps} expected goals xG xGA recent form home away verified match statistics`,
          `${common} ${LANGUAGE[data.leagueId] ?? "English"} latest injuries expected starting eleven rotation team news`,
          `${common} футбол прогноз ставки коэффициенты анализ tactical match preview betting odds`,
        ];
        const sources: FootballSourceSnapshot[] = [];
        for (const [queryIndex, query] of queries.entries()) {
          const result = await searchInspirationWeb(
            query,
            AbortSignal.timeout(20_000),
            undefined,
            undefined,
            data.tavilySearchDepth,
          );
          for (const doc of result.documents) {
            if (sources.some((existing) => existing.url === doc.source.url)) continue;
            sources.push({
              title: doc.source.title,
              url: doc.source.url,
              accessedAt: doc.source.accessedAt,
              excerpt: doc.text.slice(0, 2500),
              researchIntent: queryIndex < 2 ? "match_facts" : "external_forecasts",
            });
          }
        }
        const evidenceSnapshot = buildFootballSourceSnapshot(sources);
        if (!evidenceSnapshot.length)
          throw new Error("No independently retrieved match sources were available.");
        if (Date.now() >= Date.parse(fixture.kickoffUtc)) {
          throw new Error("Match kickoff passed before research completed.");
        }
        const evidenceCutoff = new Date().toISOString();
        const { data: marked, error: markError } = await supabaseAdmin
          .from("private_football_research_runs" as never)
          .update({
            provider_started_at: evidenceCutoff,
            evidence_cutoff_at: evidenceCutoff,
          } as never)
          .eq("id", runId)
          .eq("user_id", context.userId)
          .eq("status", "processing")
          .is("provider_started_at", null)
          .select("id")
          .maybeSingle();
        if (markError || !marked) throw new Error("Could not journal provider dispatch.");
        const caller = modelCaller(resolved.model, "openrouter", {
          userId: context.userId,
          operation: "football_research",
          executionId: runId,
        });
        providerCalled = true;
        failureCode = "provider_failed";
        const receipt = await caller({
          system: FOOTBALL_RESEARCH_SYSTEM,
          prompt: JSON.stringify({
            fixture: {
              source: fixture.source,
              league: fixture.leagueId,
              home: fixture.homeTeam,
              away: fixture.awayTeam,
              kickoffUtc: fixture.kickoffUtc,
            },
            espnData,
            sources: evidenceSnapshot.map((doc) => ({
              title: doc.title,
              url: doc.url,
              excerpt: doc.excerpt,
              retrievedAt: doc.accessedAt,
              researchIntent: doc.researchIntent,
            })),
          }),
          omitOpenRouterMaxTokens: true,
          requestTimeoutMs: 90000,
          jsonObjectOutput: true,
          ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
        });
        observedUsage = receipt.usage;
        if (receipt.stopReason !== "end_turn") {
          failureCode =
            receipt.stopReason === "max_tokens" ? "output_token_limit" : "incomplete_ai_output";
          throw new Error("AI response was incomplete.");
        }
        let raw: unknown;
        try {
          raw = JSON.parse(receipt.text);
        } catch {
          failureCode = "invalid_ai_json";
          throw new Error("AI response was not valid JSON.");
        }
        failureCode = "invalid_ai_schema";
        const validated = footballAiAssessmentSchema.safeParse(raw);
        if (!validated.success) {
          console.error("[football-research] invalid_ai_schema", {
            runId,
            issues: validated.error.issues.slice(0, 16).map((issue) => ({
              field: issue.path.join("."),
              code: issue.code,
            })),
          });
          throw new Error("AI response did not match the football schema.");
        }
        const parsedAssessment = validated.data;
        const assessment = parsedAssessment.matchContext
          ? {
              ...parsedAssessment,
              matchContext: filterResearchContextUrls(
                parsedAssessment.matchContext,
                evidenceSnapshot.map((item) => item.url),
              ),
            }
          : parsedAssessment;
        const issues = validateFootballMarketProbabilities(assessment);
        if (issues.length) {
          failureCode = "inconsistent_market_probabilities";
          throw new Error("AI market probabilities are inconsistent.");
        }
        const savedSources = evidenceSnapshot;
        const researchBrief = footballResearchEvidenceSnapshotSchema.parse({
          collectedAtUtc: evidenceCutoff,
          matchFacts: evidenceSnapshot.filter((x) => x.researchIntent === "match_facts"),
          externalForecasts: evidenceSnapshot.filter(
            (x) => x.researchIntent === "external_forecasts",
          ),
          evidenceStatus: "unverified_source_extracts",
        });
        const savedAnalysis = footballAiAssessmentSchema.parse({
          ...assessment,
          researchBrief,
          ...(espnData ? { espnData } : {}),
          tavilySearchDepth: data.tavilySearchDepth,
        });
        failureCode = "persistence_failed";
        const completedAt = new Date().toISOString();
        const { error: saveError } = await supabaseAdmin
          .from("private_football_research_runs" as never)
          .update({
            status: "completed",
            analysis: savedAnalysis,
            sources: savedSources,
            usage: receipt.usage,
            completed_at: completedAt,
          } as never)
          .eq("id", runId)
          .eq("user_id", context.userId)
          .eq("status", "processing");
        if (saveError) throw new Error("Could not persist the AI research result.");
        return {
          id: runId,
          fixture,
          modelId: resolved.model,
          analysis: savedAnalysis,
          sources: savedSources,
          completedAt,
        };
      });
    } catch {
      await supabaseAdmin
        .from("private_football_research_runs" as never)
        .update({
          status: "failed",
          error_code: providerCalled ? failureCode : "research_unavailable",
          ...(observedUsage ? { usage: observedUsage } : {}),
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", runId)
        .eq("user_id", context.userId)
        .eq("status", "processing");
      throw new Error(
        "Football research failed. The request was recorded and cannot be automatically retried.",
      );
    }
  });

export const getPrivateFootballResearchHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFootballSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("private_football_research_runs" as never)
      .select(
        "id,source,fixture_id,league_id,home_team,away_team,kickoff_utc,model_id,created_at,evidence_cutoff_at,status,error_code,analysis,sources,usage",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Football research history is unavailable.");
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      fixture_id: number;
      source: string;
      league_id: FootballLeagueId;
      home_team: string;
      away_team: string;
      model_id: string;
      kickoff_utc: string;
      created_at: string;
      evidence_cutoff_at: string | null;
      status: string;
      error_code: string | null;
      analysis: unknown;
      sources: unknown;
      usage: unknown;
    }>;
    const { data: hiddenRows, error: hiddenError } = await supabaseAdmin
      .from("private_football_research_hidden" as never)
      .select("run_id")
      .eq("user_id", context.userId);
    if (hiddenError) throw new Error("Football history visibility unavailable.");
    const hidden = new Set(
      ((hiddenRows ?? []) as Array<{ run_id: string }>).map((item) => item.run_id),
    );
    const visibleRows = rows.filter((row) => !hidden.has(row.id)).slice(0, 40);
    const { data: reviews, error: expertError } = await supabaseAdmin
      .from("private_football_expert_reviews" as never)
      .select("run_id,status,decision,model_id,error_code")
      .eq("user_id", context.userId)
      .in(
        "run_id",
        visibleRows.length
          ? visibleRows.map((r) => r.id)
          : ["00000000-0000-0000-0000-000000000000"],
      );
    if (expertError) throw new Error("Expert review history unavailable.");
    const reviewsByRun = new Map(
      (
        (reviews ?? []) as Array<{
          run_id: string;
          status: string;
          decision: unknown;
          model_id: string;
          error_code: string | null;
        }>
      ).map((review) => [review.run_id, review]),
    );
    // At most three unique league/weeks per screen load. Reuse the fixture
    // cache: do not burn 40 calls from the free daily API quota.
    const scored = new Map<string, Awaited<ReturnType<typeof getCachedFootballWeek>>>();
    for (const row of visibleRows) {
      if (row.status !== "completed" || Date.parse(row.kickoff_utc) > Date.now()) continue;
      const day = row.kickoff_utc.slice(0, 10);
      const key = row.source + ":" + row.league_id + ":" + day;
      if (scored.has(key) || scored.size >= 3) continue;
      try {
        if (row.source === "espn") {
          const { fetchEspnFootballWeek } = await import("@/lib/football-espn.server");
          scored.set(
            key,
            await fetchEspnFootballWeek(row.league_id as FootballAiDiscoveryLeagueId, day),
          );
          continue;
        }
        const loader =
          row.source === "football-data"
            ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
            : (await import("@/lib/football-fixtures.server")).fetchFootballWeek;
        scored.set(
          key,
          await getCachedFootballWeek(
            row.league_id,
            day,
            loader,
            Date.now,
            row.source === "football-data" ? "football-data" : "api-football",
          ),
        );
      } catch {
        // Historical scoring is best effort. A provider outage must not expose
        // any third-party error or erase persisted research evidence.
      }
    }
    return visibleRows.map((row) => {
      const day = row.kickoff_utc.slice(0, 10);
      const matches = scored.get(row.source + ":" + row.league_id + ":" + day);
      const match = matches?.find((f) => f.sourceFixtureId === String(row.fixture_id));
      const checked = footballAiAssessmentSchema.safeParse(row.analysis);
      const eligible =
        Number.isFinite(Date.parse(row.created_at)) &&
        Date.parse(row.created_at) < Date.parse(row.kickoff_utc) &&
        !!row.evidence_cutoff_at &&
        Date.parse(row.evidence_cutoff_at) < Date.parse(row.kickoff_utc);
      const outcomes =
        eligible && match && checked.success
          ? checked.data.suggestions.map((item) => ({
              market: item.market,
              outcome: footballMarketOutcome(item.market, match),
            }))
          : [];
      return {
        id: row.id,
        source: row.source,
        fixture_id: row.fixture_id,
        league_id: row.league_id,
        home_team: row.home_team,
        away_team: row.away_team,
        model_id: row.model_id,
        kickoff_utc: row.kickoff_utc,
        created_at: row.created_at,
        evidence_cutoff_at: row.evidence_cutoff_at,
        status: row.status,
        error_code: row.status === "failed" ? row.error_code : null,
        expertReview: (() => {
          const raw = reviewsByRun.get(row.id);
          if (!raw) return null;
          const checkedExpert = footballExpertDecisionSchema.safeParse(raw.decision);
          return {
            status: raw.status,
            modelId: raw.model_id,
            errorCode: raw.status === "failed" ? raw.error_code : null,
            decision: checkedExpert.success ? checkedExpert.data : null,
          };
        })(),
        analysis: checked.success ? checked.data : null,
        sources: Array.isArray(row.sources)
          ? row.sources
              .filter(
                (source): source is Record<string, unknown> =>
                  !!source && typeof source === "object" && !Array.isArray(source),
              )
              .map((source) => ({
                title: String(source["title"] ?? "").slice(0, 180),
                url: String(source["url"] ?? "").slice(0, 2000),
                accessedAt: String(source["accessedAt"] ?? "").slice(0, 40),
                researchIntent:
                  source["researchIntent"] === "external_forecasts"
                    ? ("external_forecasts" as const)
                    : ("match_facts" as const),
              }))
              .filter((source) => source.url.startsWith("https://"))
          : [],
        outcomes,
      };
    });
  });

/** Hide selected terminal runs without deleting immutable audit/admission records. */
export const hidePrivateFootballResearchHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(40) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireFootballSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: runs, error } = await supabaseAdmin
      .from("private_football_research_runs" as never)
      .select("id,status")
      .eq("user_id", context.userId)
      .in("id", data.ids);
    const found = (runs ?? []) as Array<{ id: string; status: string }>;
    if (
      error ||
      found.length !== new Set(data.ids).size ||
      found.some((run) => run.status === "processing")
    ) {
      throw new Error("Only owned terminal analyses can be cleared.");
    }
    const { error: saveError } = await supabaseAdmin
      .from("private_football_research_hidden" as never)
      .upsert(data.ids.map((id) => ({ user_id: context.userId, run_id: id })) as never[], {
        onConflict: "user_id,run_id",
      });
    if (saveError) throw new Error("Could not clear selected history.");
    return { hidden: data.ids.length };
  });
