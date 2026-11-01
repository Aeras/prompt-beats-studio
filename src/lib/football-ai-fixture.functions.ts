import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FOOTBALL_AI_LEAGUE_IDS, FOOTBALL_AI_REFRESH_QUOTA } from "@/lib/football-research.shared";
import { aiFixtureWeekBounds, validateAiFixtureBatch } from "@/lib/football-ai-fixture-validation.shared";
import { withFeatureAiDispatchAdmission } from "@/lib/global-ai-usage.server";

const leagueWeek = z
  .object({ leagueId: z.enum(FOOTBALL_AI_LEAGUE_IDS), weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .strict();
const refreshInput = leagueWeek
  .extend({
    consent: z.object({ acknowledged: z.literal(true), estimatedMaxUsd: z.number().positive().max(1) }).strict(),
  })
  .strict();

export type AiFixtureRow = {
  fixtureId: number;
  leagueId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  status: "candidate" | "verified";
  verifiedSources: number;
  sources: { url: string; domain?: string }[];
  updatedAt: string;
};

async function requireSuperAdmin(supabase: { rpc: (name: never) => PromiseLike<{ data: unknown; error: unknown }> }) {
  const { data, error } = await supabase.rpc("current_user_is_super_admin" as never);
  if (error || data !== true) throw new Error("Not allowed");
}

async function pricingFor(model: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ai_models")
    .select("input_price_per_million,output_price_per_million,pricing_status,status")
    .eq("provider", "openrouter")
    .eq("provider_model_id", model)
    .maybeSingle();
  if (!data || data.status !== "enabled" || data.pricing_status !== "verified") return null;
  const { estimateAiFixtureMaxCostUsd } = await import("@/lib/football-ai-fixture-search.server");
  return estimateAiFixtureMaxCostUsd({
    inputPerMillion: Number(data.input_price_per_million),
    outputPerMillion: Number(data.output_price_per_million),
  });
}

/** Read-only: candidates, consent info (max cost, remaining quota). */
export const getPrivateAiFixtureCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => leagueWeek.parse(raw))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.supabase as never);
    const { from, to } = aiFixtureWeekBounds(data.weekDate);
    const { AI_FIXTURE_MODEL } = await import("@/lib/football-ai-fixture-search.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows, error }, { data: quota }, maxCostUsd] = await Promise.all([
      supabaseAdmin
        .from("private_football_ai_fixtures" as never)
        .select("fixture_id,league_id,home_team,away_team,kickoff_utc,verification_status,verified_sources_count,source_evidence,updated_at")
        .eq("user_id", context.userId)
        .eq("league_id", data.leagueId)
        .gte("kickoff_utc", from + "T00:00:00Z")
        .lte("kickoff_utc", to + "T23:59:59Z")
        .order("kickoff_utc", { ascending: true })
        .limit(80),
      supabaseAdmin.rpc("private_football_ai_refresh_quota" as never, { _user_id: context.userId } as never),
      pricingFor(AI_FIXTURE_MODEL),
    ]);
    if (error) throw new Error("AI candidate history unavailable");
    const q = (quota ?? {}) as { hourUsed?: number; dayUsed?: number };
    const fixtures: AiFixtureRow[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      fixtureId: Number(r["fixture_id"]),
      leagueId: String(r["league_id"]),
      homeTeam: String(r["home_team"]),
      awayTeam: String(r["away_team"]),
      kickoffUtc: String(r["kickoff_utc"]),
      status: r["verification_status"] === "verified" ? "verified" : "candidate",
      verifiedSources: Number(r["verified_sources_count"] ?? 0),
      sources: (Array.isArray(r["source_evidence"]) ? r["source_evidence"] : [])
        .slice(0, 8)
        .map((s: { url?: unknown; domain?: unknown }) => ({
          url: String(s.url ?? ""),
          ...(typeof s.domain === "string" ? { domain: s.domain } : {}),
        })),
      updatedAt: String(r["updated_at"]),
    }));
    return {
      fixtures,
      model: AI_FIXTURE_MODEL,
      maxCostUsd,
      quota: {
        hourRemaining: Math.max(0, FOOTBALL_AI_REFRESH_QUOTA.perHour - Number(q.hourUsed ?? 0)),
        dayRemaining: Math.max(0, FOOTBALL_AI_REFRESH_QUOTA.perDay - Number(q.dayUsed ?? 0)),
      },
    };
  });

/** One explicitly consented, quota-admitted, billable refresh. AI never writes the DB. */
export const refreshPrivateAiFixtureCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => refreshInput.parse(raw))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.supabase as never);
    if (process.env["PROMPTBEATS_AI_FIXTURE_BETA_ENABLED"] !== "true")
      throw new Error("AI fixture discovery remains disabled by operator");
    if (process.env["PROMPTBEATS_AI_DISPATCH_DISABLED"] === "true") throw new Error("AI dispatch disabled");
    if (process.env["PROMPTBEATS_AI_FIXTURE_BETA_SPEND_APPROVED"] !== "true")
      throw new Error("AI fixture paid refresh has not been approved by operator");
    const key = process.env["OPENROUTER_API_KEY"]?.trim();
    if (!key) throw new Error("OpenRouter unavailable");
    const search = await import("@/lib/football-ai-fixture-search.server");
    const maxCost = await pricingFor(search.AI_FIXTURE_MODEL);
    if (maxCost === null) throw new Error("AI fixture model is not installed with verified pricing");
    if (Math.abs(maxCost - data.consent.estimatedMaxUsd) > 1e-9)
      throw new Error("Cost estimate changed; review and confirm again");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admissionId, error: admissionError } = await supabaseAdmin.rpc(
      "claim_private_football_ai_fixture_refresh" as never,
      {
        _user_id: context.userId,
        _league_id: data.leagueId,
        _week_date: data.weekDate,
        _model_id: search.AI_FIXTURE_MODEL,
        _max_cost_usd: maxCost,
      } as never,
    );
    if (admissionError || typeof admissionId !== "string")
      throw new Error("AI fixture refresh limit reached or unavailable");

    const finish = (ok: boolean, candidates: number | null, verified: number | null, code: string | null) =>
      supabaseAdmin.rpc(
        "finish_private_football_ai_fixture_refresh" as never,
        {
          _admission_id: admissionId,
          _user_id: context.userId,
          _ok: ok,
          _candidates: candidates,
          _verified: verified,
          _error_code: code,
        } as never,
      );
    const { recordAiUsage } = await import("@/lib/ai-usage.server");
    const { aiProviderFetch } = await import("@/lib/global-ai-usage.server");
    let dispatched = false;
    try {
      const result = await withFeatureAiDispatchAdmission(context.userId, ["ai_generator"], async () => {
        dispatched = true;
        return search.requestAiFixtureCandidates(
          { leagueId: data.leagueId, weekDate: data.weekDate },
          { apiKey: key, model: search.AI_FIXTURE_MODEL, fetcher: aiProviderFetch, signal: AbortSignal.timeout(90_000) },
        );
      });
      await recordAiUsage({
        executionId: admissionId,
        userId: context.userId,
        provider: "openrouter",
        model: search.AI_FIXTURE_MODEL,
        operation: "football_research",
        usage: result.usage,
        success: true,
      });
      const candidates = validateAiFixtureBatch(result.content, data.leagueId, data.weekDate, new Date());
      const { corroborateAiFixture, MAX_FETCHES_PER_REFRESH } = await import(
        "@/lib/football-ai-fixture-corroboration.server"
      );
      const budget = { remaining: MAX_FETCHES_PER_REFRESH };
      const corroborated = [];
      for (const fixture of candidates) {
        const ok = await corroborateAiFixture(fixture, result.citations, fetch, budget);
        if (ok) corroborated.push(ok);
      }
      const { saveAiFixtureCandidates } = await import("@/lib/football-ai-fixture-persistence.server");
      const saved = await saveAiFixtureCandidates(supabaseAdmin as never, context.userId, candidates, corroborated);
      await finish(true, saved.stored, saved.verified, null);
      return { candidatesStored: saved.stored, verified: saved.verified };
    } catch (error) {
      if (dispatched) {
        await recordAiUsage({
          executionId: admissionId,
          userId: context.userId,
          provider: "openrouter",
          model: search.AI_FIXTURE_MODEL,
          operation: "football_research",
          usage: null,
          usageState: "unknown",
          success: false,
        }).catch(() => {});
      }
      await finish(false, null, null, dispatched ? "provider_or_corroboration_failed" : "admission_failed");
      console.error("football_ai_fixture_refresh_failed", {
        dispatched,
        name: error instanceof Error ? error.name : "unknown",
      });
      throw new Error("AI fixture refresh failed; the attempt counts toward your quota.");
    }
  });
