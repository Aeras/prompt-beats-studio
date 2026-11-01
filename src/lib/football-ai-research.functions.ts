import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCachedFootballWeek } from "@/lib/football-fixtures-cache.server";
import { footballMarketOutcome } from "@/lib/football-market-outcome.shared";
import type { FootballLeagueId } from "@/lib/football-research.shared";
import {
  FOOTBALL_RESEARCH_SYSTEM,
  footballAiAssessmentSchema,
  footballAnalysisRequestSchema,
} from "@/lib/football-ai-research.shared";
import { withFeatureAiDispatchAdmission } from "@/lib/global-ai-usage.server";

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

    if (data.fixtureProvider === "football-data" && data.leagueId === "GR-SL") {
      throw new Error("Greek Super League is unavailable on football-data.org Free.");
    }
    const loader = data.fixtureProvider === "football-data"
      ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
      : (await import("@/lib/football-fixtures.server")).fetchFootballWeek;
    const fixtures = await getCachedFootballWeek(data.leagueId, data.weekDate, loader, Date.now, data.fixtureProvider);
    const fixture = fixtures.find((item) => item.sourceFixtureId === data.fixtureId);
    if (!fixture || fixture.state !== "scheduled" || Date.parse(fixture.kickoffUtc) <= Date.now()) {
      throw new Error("Only verified upcoming fixtures can be analyzed.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
      "claim_private_football_research_run_v2" as never,
      {
        _user_id: context.userId,
        _request_key: data.requestKey,
        _fixture_id: Number(fixture.sourceFixtureId),
        _league_id: fixture.leagueId,
        _home_team: fixture.homeTeam,
        _away_team: fixture.awayTeam,
        _kickoff_utc: fixture.kickoffUtc,
        _model_id: resolved.model,
        _source: data.fixtureProvider,
      } as never,
    );
    if (claimError) throw new Error("Research admission failed or hourly limit reached.");

    const claim = claimed as { status?: string; id?: string } | null;
    if (!claim?.id || claim.status !== "claimed") {
      throw new Error("This research request is already recorded. View history instead.");
    }
    const runId = claim.id;
    let providerCalled = false;

    try {
      return await withFeatureAiDispatchAdmission(context.userId, ["ai_generator"], async () => {
        const { searchInspirationWeb } = await import("@/lib/music-inspiration-research.server");
        const kickoffDay = fixture.kickoffUtc.slice(0, 10);
        const common = `${fixture.homeTeam} vs ${fixture.awayTeam} ${kickoffDay}`;
        const queries = [
          `${common} match preview team news recent form predictions`,
          `${common} ${LANGUAGE[data.leagueId] ?? "English"} match analysis preview`,
        ];
        const sources: { title: string; url: string; accessedAt: string; excerpt: string }[] = [];
        for (const query of queries) {
          const result = await searchInspirationWeb(query, AbortSignal.timeout(20_000));
          for (const doc of result.documents) {
            if (sources.some((existing) => existing.url === doc.source.url)) continue;
            sources.push({
              title: doc.source.title,
              url: doc.source.url,
              accessedAt: doc.source.accessedAt,
              excerpt: doc.text.slice(0, 2500),
            });
          }
        }
        if (!sources.length)
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
            sources: sources.map((doc) => ({
              title: doc.title,
              url: doc.url,
              excerpt: doc.excerpt,
              retrievedAt: doc.accessedAt,
            })),
          }),
          maxTokens: 1800,
          requestTimeoutMs: 90000,
          jsonObjectOutput: true,
          ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
        });
        if (receipt.stopReason !== "end_turn") throw new Error("AI response was incomplete.");
        let raw: unknown;
        try {
          raw = JSON.parse(receipt.text);
        } catch {
          throw new Error("AI response was not valid JSON.");
        }
        const assessment = footballAiAssessmentSchema.parse(raw);
        const savedSources = sources.map(({ title, url, accessedAt }) => ({
          title,
          url,
          accessedAt,
        }));
        const completedAt = new Date().toISOString();
        const { error: saveError } = await supabaseAdmin
          .from("private_football_research_runs" as never)
          .update({
            status: "completed",
            analysis: assessment,
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
          analysis: assessment,
          sources: savedSources,
          completedAt,
        };
      });
    } catch {
      await supabaseAdmin
        .from("private_football_research_runs" as never)
        .update({
          status: "failed",
          error_code: providerCalled ? "provider_or_persistence_failed" : "research_unavailable",
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
        "id,source,fixture_id,league_id,home_team,away_team,kickoff_utc,model_id,created_at,evidence_cutoff_at,status,analysis,sources,usage",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(40);
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
      analysis: unknown;
      sources: unknown;
      usage: unknown;
    }>;
    // At most three unique league/weeks per screen load. Reuse the fixture
    // cache: do not burn 40 calls from the free daily API quota.
    const scored = new Map<string, Awaited<ReturnType<typeof getCachedFootballWeek>>>();
    for (const row of rows) {
      if (row.status !== "completed" || Date.parse(row.kickoff_utc) > Date.now()) continue;
      const day = row.kickoff_utc.slice(0, 10);
      const key = row.source + ":" + row.league_id + ":" + day;
      if (scored.has(key) || scored.size >= 3) continue;
      try {
        const loader = row.source === "football-data"
          ? (await import("@/lib/football-data.server")).fetchFootballDataWeek
          : (await import("@/lib/football-fixtures.server")).fetchFootballWeek;
        scored.set(key, await getCachedFootballWeek(row.league_id, day, loader, Date.now,
          row.source === "football-data" ? "football-data" : "api-football"));
      } catch {
        // Historical scoring is best effort. A provider outage must not expose
        // any third-party error or erase persisted research evidence.
      }
    }
    return rows.map((row) => {
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
        outcomes,
      };
    });
  });
