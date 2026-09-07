/**
 * Super-Admin AI usage & cost analytics.
 *
 * Read-only: it never triggers an AI call and never touches the generation,
 * quality, repair or rate-limit logic. All queries run server-side through the
 * caller's authenticated client, so the admin-only RLS policy on
 * `ai_usage_logs` is the security boundary.
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
  failures: number;
};

const rangeInput = z.object({ days: z.number().int().min(1).max(365).default(30) });

function empty(key: string): Breakdown {
  return { key, requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, failures: 0 };
}

function accumulate(map: Map<string, Breakdown>, key: string, r: UsageRow) {
  const b = map.get(key) ?? empty(key);
  b.requests += 1;
  b.inputTokens += r.input_tokens ?? 0;
  b.outputTokens += r.output_tokens ?? 0;
  b.totalTokens += r.total_tokens ?? (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
  b.costUsd += Number(r.estimated_cost_usd ?? 0);
  if (!r.success) b.failures += 1;
  map.set(key, b);
}

const sorted = (m: Map<string, Breakdown>) => [...m.values()].sort((a, b) => b.costUsd - a.costUsd);

export const getAiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rowsRaw, error } = await context.supabase
      .from("ai_usage_logs" as never)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);
    const rows = (rowsRaw ?? []) as unknown as UsageRow[];

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
        failures: acc.failures + b.failures,
      }),
      { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, failures: 0 },
    );

    const songs = byGeneration.size;
    const avgCostPerSong = songs ? totals.costUsd / songs : 0;
    const avgTokensPerSong = songs ? totals.totalTokens / songs : 0;
    const dailyAvgCost = totals.costUsd / data.days;

    return {
      days: data.days,
      totals,
      songs,
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
