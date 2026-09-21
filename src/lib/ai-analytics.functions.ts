/**
 * Super-Admin AI usage & cost analytics.
 *
 * Read-only: it never triggers an AI call and never touches the generation,
 * quality, repair or rate-limit logic. All queries run server-side through the
 * caller's authenticated client, so the admin-only RLS policy on
 * ai_usage_logs is the security boundary.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UsageRow = {
  id: string;
  user_id: string | null;
  generation_id: string | null;
  provider: string;
  model: string;
  operation: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | string | null;
  cost_status: "calculated" | "pending_pricing" | "usage_unavailable" | null;
  success: boolean;
  created_at: string;
};

export type Breakdown = {
  key: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Any request that still has no calculable cost. */
  unknownCostRequests: number;
  /** Token usage is known, but verified model pricing is still missing. */
  pendingPricingRequests: number;
  /** The provider did not report enough token usage to calculate cost. */
  usageUnavailableRequests: number;
  failures: number;
};

const rangeInput = z.object({ days: z.number().int().min(1).max(365).default(30) });

function empty(key: string): Breakdown {
  return {
    key,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    unknownCostRequests: 0,
    pendingPricingRequests: 0,
    usageUnavailableRequests: 0,
    failures: 0,
  };
}

function accumulate(map: Map<string, Breakdown>, key: string, r: UsageRow) {
  const b = map.get(key) ?? empty(key);
  b.requests += 1;
  b.inputTokens += r.input_tokens ?? 0;
  b.outputTokens += r.output_tokens ?? 0;
  b.totalTokens += r.total_tokens ?? (r.input_tokens ?? 0) + (r.output_tokens ?? 0);

  if (r.estimated_cost_usd === null || r.estimated_cost_usd === undefined) {
    b.unknownCostRequests += 1;
    if (r.cost_status === "pending_pricing") b.pendingPricingRequests += 1;
    if (r.cost_status === "usage_unavailable") b.usageUnavailableRequests += 1;
  } else {
    b.costUsd += Number(r.estimated_cost_usd);
  }

  if (!r.success) b.failures += 1;
  map.set(key, b);
}

const sorted = (m: Map<string, Breakdown>) =>
  [...m.values()].sort((a, b) => b.costUsd - a.costUsd);

export const getAiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("current_user_is_admin_level");
    if (!isAdmin) throw new Error("Forbidden");

    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const PAGE = 1000;
    const MAX_ROWS = 200000;
    const rows: UsageRow[] = [];

    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data: pageRaw, error } = await context.supabase
        .from("ai_usage_logs")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const page = (pageRaw ?? []) as unknown as UsageRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }

    const byProviderModel = new Map<string, Breakdown>();
    const byOperation = new Map<string, Breakdown>();
    const byDay = new Map<string, Breakdown>();
    const byGeneration = new Map<string, Breakdown>();

    for (const r of rows) {
      accumulate(byProviderModel, `${r.provider} · ${r.model}`, r);
      accumulate(byOperation, r.operation, r);
      accumulate(byDay, r.created_at.slice(0, 10), r);
      if (r.generation_id) accumulate(byGeneration, r.generation_id, r);
    }

    const totals = [...byOperation.values()].reduce(
      (acc, b) => ({
        requests: acc.requests + b.requests,
        inputTokens: acc.inputTokens + b.inputTokens,
        outputTokens: acc.outputTokens + b.outputTokens,
        totalTokens: acc.totalTokens + b.totalTokens,
        costUsd: acc.costUsd + b.costUsd,
        unknownCostRequests: acc.unknownCostRequests + b.unknownCostRequests,
        pendingPricingRequests: acc.pendingPricingRequests + b.pendingPricingRequests,
        usageUnavailableRequests:
          acc.usageUnavailableRequests + b.usageUnavailableRequests,
        failures: acc.failures + b.failures,
      }),
      {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        unknownCostRequests: 0,
        pendingPricingRequests: 0,
        usageUnavailableRequests: 0,
        failures: 0,
      },
    );

    const songs = byGeneration.size;
    const completeCostGenerations = [...byGeneration.values()].filter(
      (generation) => generation.unknownCostRequests === 0,
    );
    const completeCostSongs = completeCostGenerations.length;
    const unknownCostSongs = songs - completeCostSongs;
    const completeCostTotal = completeCostGenerations.reduce(
      (sum, generation) => sum + generation.costUsd,
      0,
    );
    const avgCostPerSong = completeCostSongs
      ? completeCostTotal / completeCostSongs
      : 0;
    const avgTokensPerSong = songs ? totals.totalTokens / songs : 0;
    const dailyAvgCost = totals.costUsd / data.days;

    return {
      days: data.days,
      totals,
      songs,
      completeCostSongs,
      unknownCostSongs,
      avgCostPerSong,
      avgTokensPerSong,
      forecast: { daily: dailyAvgCost, monthly: dailyAvgCost * 30 },
      byProviderModel: sorted(byProviderModel),
      byOperation: sorted(byOperation),
      byDay: [...byDay.values()].sort((a, b) => (a.key < b.key ? 1 : -1)),
      recentGenerations: [...byGeneration.values()].slice(0, 50),
      recent: rows.slice(0, 50),
    };
  });
