import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FOOTBALL_AI_LEAGUE_IDS } from "@/lib/football-research.shared";
import {
  aiFixtureWeekBounds,
  validateAiFixtureBatch,
} from "@/lib/football-ai-fixture-validation.shared";
import { withFeatureAiDispatchAdmission } from "@/lib/global-ai-usage.server";
import {
  aiFixtureAvailability,
  aiFixtureErrorMessage,
  aiFixtureGateCode,
  mapAdmissionRpcError,
  type AiFixturePostAdmissionCode,
  type AiFixturePreAdmissionCode,
} from "@/lib/football-ai-fixture-errors.shared";

const leagueWeek = z
  .object({
    leagueId: z.enum(FOOTBALL_AI_LEAGUE_IDS),
    weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
const refreshInput = leagueWeek
  .extend({
    consent: z
      .object({ acknowledged: z.literal(true), estimatedMaxUsd: z.number().positive().max(1) })
      .strict(),
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

async function requireSuperAdmin(supabase: {
  rpc: (name: never) => PromiseLike<{ data: unknown; error: unknown }>;
}) {
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
    const [{ data: rows, error }, maxCostUsd] = await Promise.all([
      supabaseAdmin
        .from("private_football_ai_fixtures" as never)
        .select(
          "fixture_id,league_id,home_team,away_team,kickoff_utc,verification_status,verified_sources_count,source_evidence,updated_at",
        )
        .eq("user_id", context.userId)
        .eq("league_id", data.leagueId)
        .gte("kickoff_utc", from + "T00:00:00Z")
        .lte("kickoff_utc", to + "T23:59:59Z")
        .order("kickoff_utc", { ascending: true })
        .limit(80),
      pricingFor(AI_FIXTURE_MODEL),
    ]);
    if (error) throw new Error("AI candidate history unavailable");
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
      availability: aiFixtureAvailability(process.env, maxCostUsd !== null),
    };
  });

/** One explicitly consented, quota-admitted, billable refresh. AI never writes the DB. */
export const refreshPrivateAiFixtureCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => refreshInput.parse(raw))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.supabase as never);
    const startedAt = Date.now();
    const preFail = (code: AiFixturePreAdmissionCode, extra: Record<string, unknown> = {}) => {
      console.info("football_ai_fixture_refresh_rejected", {
        stage: "pre_admission",
        code,
        dispatched: false,
        elapsedMs: Date.now() - startedAt,
        ...extra,
      });
      return new Error(aiFixtureErrorMessage(code));
    };
    const search = await import("@/lib/football-ai-fixture-search.server");
    const gate = aiFixtureGateCode(aiFixtureAvailability(process.env, true));
    if (gate) throw preFail(gate);
    const key = process.env["OPENROUTER_API_KEY"]!.trim();
    let maxCost: number | null;
    try {
      maxCost = await pricingFor(search.AI_FIXTURE_MODEL);
    } catch {
      throw preFail("model_pricing_unavailable");
    }
    if (maxCost === null) throw preFail("model_pricing_unavailable");
    if (Math.abs(maxCost - data.consent.estimatedMaxUsd) > 1e-9) throw preFail("cost_changed");

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
      throw preFail(mapAdmissionRpcError((admissionError as { message?: string } | null)?.message));

    const finish = (
      ok: boolean,
      candidates: number | null,
      verified: number | null,
      code: string | null,
    ) =>
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
    const { consumeAiDispatchAdmission } = await import("@/lib/global-ai-usage.server");
    const { AiFixtureProviderError } = search;
    let dispatched = false;
    let featurePermitted = false;
    let usageRecorded = false;
    let stage: AiFixturePostAdmissionCode = "provider_failed";
    try {
      const result = await withFeatureAiDispatchAdmission(
        context.userId,
        ["ai_generator"],
        async () => {
          featurePermitted = true;
          return search.requestAiFixtureCandidates(
            { leagueId: data.leagueId, weekDate: data.weekDate },
            {
              apiKey: key,
              model: search.AI_FIXTURE_MODEL,
              fetcher: async (input, init) => {
                await consumeAiDispatchAdmission();
                dispatched = true;
                return globalThis.fetch(input, init);
              },
              signal: AbortSignal.timeout(90_000),
            },
          );
        },
      );
      await recordAiUsage({
        executionId: admissionId,
        userId: context.userId,
        provider: "openrouter",
        model: search.AI_FIXTURE_MODEL,
        operation: "football_research",
        usage: result.usage,
        success: true,
      });
      usageRecorded = true;
      stage = "invalid_ai_output";
      const candidates = validateAiFixtureBatch(
        result.content,
        data.leagueId,
        data.weekDate,
        new Date(),
      );
      stage = "corroboration_failed";
      const { corroborateAiFixture, MAX_FETCHES_PER_REFRESH } =
        await import("@/lib/football-ai-fixture-corroboration.server");
      const budget = { remaining: MAX_FETCHES_PER_REFRESH };
      const corroborated = [];
      for (const fixture of candidates) {
        const ok = await corroborateAiFixture(fixture, result.citations, fetch, budget);
        if (ok) corroborated.push(ok);
      }
      stage = "persistence_failed";
      const { saveAiFixtureCandidates } =
        await import("@/lib/football-ai-fixture-persistence.server");
      const saved = await saveAiFixtureCandidates(
        supabaseAdmin as never,
        context.userId,
        candidates,
        corroborated,
      );
      await finish(true, saved.stored, saved.verified, null);
      console.info("football_ai_fixture_refresh_completed", {
        admissionId,
        dispatched,
        elapsedMs: Date.now() - startedAt,
        stored: saved.stored,
        verified: saved.verified,
      });
      return { candidatesStored: saved.stored, verified: saved.verified };
    } catch (error) {
      if (!featurePermitted || !dispatched) stage = "dispatch_admission_failed";
      else if (error instanceof AiFixtureProviderError) {
        stage =
          error.kind === "http_4xx"
            ? "provider_http_4xx"
            : error.kind === "http_5xx"
              ? "provider_http_5xx"
              : error.kind === "network"
                ? "provider_network_failed"
                : "provider_response_invalid";
      }
      if (dispatched && !usageRecorded) {
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
      await Promise.resolve(finish(false, null, null, stage)).catch(() => {});
      const httpStatus = error instanceof AiFixtureProviderError ? error.httpStatus : null;
      console.error("football_ai_fixture_refresh_failed", {
        stage: "post_admission",
        code: stage,
        dispatched,
        featurePermitted,
        admissionId,
        elapsedMs: Date.now() - startedAt,
        name: error instanceof Error ? error.name : "unknown",
        ...(httpStatus !== null ? { httpStatus } : {}),
      });
      throw new Error(aiFixtureErrorMessage(stage));
    }
  });

/** Revalidate saved, untrusted candidates without any paid model search. */
export const reverifyPrivateAiFixtureCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => leagueWeek.parse(raw))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.supabase as never);
    const { from, to } = aiFixtureWeekBounds(data.weekDate);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("private_football_ai_fixtures" as never)
      .select("fixture_id,league_id,normalized_key,home_team,away_team,kickoff_utc,source_evidence,verification_status")
      .eq("user_id", context.userId).eq("league_id", data.leagueId)
      .eq("verification_status", "candidate")
      .gte("kickoff_utc", from + "T00:00:00Z")
      .lte("kickoff_utc", to + "T23:59:59Z")
      .order("kickoff_utc", { ascending: true }).limit(12);
    if (error) throw new Error("Candidate verification could not load saved records");
    const {
      corroborateAiFixture, MAX_FETCHES_PER_REFRESH, trustedPublicUrl,
    } = await import("@/lib/football-ai-fixture-corroboration.server");
    const budget = { remaining: MAX_FETCHES_PER_REFRESH };
    let verified = 0;
    let attempted = 0;
    let withoutEnoughSources = 0;
    for (const item of (rows ?? []) as Array<Record<string, unknown>>) {
      const kickoffUtc = String(item["kickoff_utc"] ?? "");
      if (Date.parse(kickoffUtc) <= Date.now()) continue;
      const sources = (Array.isArray(item["source_evidence"]) ? item["source_evidence"] : [])
        .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
        .filter((v) => typeof v["url"] === "string" && !!trustedPublicUrl(v["url"]))
        .slice(0, 8)
        .map((v) => ({ url: String(v["url"]), title: String(v["title"] ?? "").slice(0, 250) }));
      if (sources.length < 2) { withoutEnoughSources++; continue; }
      const fixture = {
        leagueId: data.leagueId,
        homeTeam: String(item["home_team"]),
        awayTeam: String(item["away_team"]),
        kickoffUtc,
        normalizedKey: String(item["normalized_key"]),
        observedAtUtc: new Date().toISOString(),
        sources,
      };
      attempted++;
      const proof = await corroborateAiFixture(fixture, [], fetch, budget);
      if (proof) {
        const { error: saveError } = await supabaseAdmin.rpc(
          "upsert_private_football_ai_fixture" as never, {
            _user_id: context.userId, _league_id: fixture.leagueId,
            _normalized_key: fixture.normalizedKey, _home_team: fixture.homeTeam,
            _away_team: fixture.awayTeam, _kickoff_utc: fixture.kickoffUtc,
            _verified: true, _source_evidence: proof.verifiedSources,
          } as never,
        );
        if (saveError) throw new Error("Verified fixture update failed");
        verified++;
      }
      if (budget.remaining === 0) break;
    }
    return { checked: attempted, verified, insufficientSources: withoutEnoughSources };
  });
