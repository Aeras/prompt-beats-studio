/**
 * AI usage recording. Observes provider responses only — it never issues an
 * AI call of its own and never blocks the AI pipeline.
 *
 * Token usage is always persisted, even when pricing is not yet known. The
 * database is responsible for calculating cost from public.ai_models and for
 * backfilling NULL costs later when verified pricing is added.
 */
export type AiOperation =
  | "generate"
  | "quality_check"
  | "repair"
  | "post_repair_quality_check"
  | "song_setup_assistant"
  | "song_analysis"
  | "inspiration_wall_extraction"
  | "story_map_generate"
  | "story_map_from_lyrics"
  | "story_map_analyze_lyrics"
  | "story_driven_plan"
  | "universe_creative_bible_generate"
  | "universe_creative_bible_refine"
  | "universe_continuity_analysis"
  | "universe_project_fit"
  | "universe_next_song_plan"
  | "audio_revision_intent";

/** Provider-agnostic normalized usage, as reported by the provider. */
export type NormalizedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Provider-specific details used for more accurate cost calculation when available. */
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
  /** Stable identity of one real dispatch, not a logical user action. */
  executionId?: string;
  /** Provider-reported cost is not an independently verified invoice. */
  providerReportedCostUsd?: number | null;
};

export type UsageRecord = {
  executionId?: string | undefined;
  usageState?: "unknown" | "partial" | "final";
  userId: string;
  generationId?: string | null;
  provider: string;
  model: string;
  operation: AiOperation;
  usage: NormalizedUsage | null;
  success: boolean;
};

export type UsageInsert = {
  id: string;
  provider_usage_state: "unknown" | "partial" | "final";
  user_id: string;
  generation_id: string | null;
  provider: string;
  model: string;
  operation: AiOperation;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  reasoning_tokens: number | null;
  provider_reported_cost_usd: number | null;
  success: boolean;
};

export function toUsageInsert(rec: UsageRecord): UsageInsert {
  const input = rec.usage?.inputTokens ?? null;
  const output = rec.usage?.outputTokens ?? null;
  const total = rec.usage?.totalTokens ?? (input == null || output == null ? null : input + output);

  return {
    id: rec.executionId ?? rec.usage?.executionId ?? crypto.randomUUID(),
    provider_usage_state: rec.usageState ?? (rec.usage ? "final" : "unknown"),
    user_id: rec.userId,
    generation_id: rec.generationId ?? null,
    provider: rec.provider,
    model: rec.model,
    operation: rec.operation,
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    cached_input_tokens: rec.usage?.cachedInputTokens ?? null,
    cache_write_tokens: rec.usage?.cacheWriteTokens ?? null,
    reasoning_tokens: rec.usage?.reasoningTokens ?? null,
    provider_reported_cost_usd: rec.usage?.providerReportedCostUsd ?? null,
    success: rec.success,
  };
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export type UsageDelivery = {
  settle: (payload: UsageInsert) => Promise<void>;
  enqueue: (payload: UsageInsert) => Promise<void>;
};
/** Also retries a lost transport ACK; the identity never changes. */
export async function deliverAiUsage(payload: UsageInsert, store: UsageDelivery, pause = wait) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await store.settle(payload);
      return "recorded" as const;
    } catch {
      if (attempt === 0) await pause(150);
    }
  }
  await store.enqueue(payload);
  return "queued" as const;
}

/**
 * Persists one usage row per actual provider request, with the service-role
 * client (the table is unreadable by normal users). Analytics must never break
 * generation, so a failed primary insert is retried once and then written to a
 * durable outbox. Successful future writes opportunistically drain that outbox.
 *
 * Do not calculate pricing in application code. The ai_usage_logs insert
 * trigger reads the canonical ai_models pricing registry. If pricing is not
 * verified yet, the row remains pending_pricing and is backfilled later.
 */
export async function recordAiUsage(rec: UsageRecord): Promise<void> {
  const payload = toUsageInsert(rec);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const outcome = await deliverAiUsage(payload, {
      settle: async (value) => {
        const { error } = await supabaseAdmin
          .rpc("settle_ai_usage_internal" as never, { _payload: value } as never)
          .abortSignal(AbortSignal.timeout(10000));
        if (error) throw new Error("Usage persistence failed.");
      },
      enqueue: async (value) => {
        const { error } = await supabaseAdmin
          .from("ai_usage_outbox" as never)
          .upsert(
            {
              id: value.id,
              payload: value,
              last_error: "usage_delivery_failed",
            } as never,
            { onConflict: "id", ignoreDuplicates: true },
          )
          .abortSignal(AbortSignal.timeout(10000));
        if (error) throw new Error("Usage outbox persistence failed.");
      },
    });
    try {
      const { attachAuxiliaryReceipt } = await import("./ai-auxiliary-model-context.server");
      await attachAuxiliaryReceipt(payload);
    } catch {
      // Financial evidence has already been persisted; retain only the precise
      // conservative uninstall blocker if its association needs reconciliation.
      console.error("[ai-usage] auxiliary receipt association pending", payload.id);
    }
    if (outcome === "recorded") {
      const { error: flushError } = await supabaseAdmin
        .rpc("flush_ai_usage_outbox" as never, { _limit: 20 } as never)
        .abortSignal(AbortSignal.timeout(10000));
      if (flushError) console.error("[ai-usage] outbox flush failed");
      return;
    }

    console.error("[ai-usage] primary insert failed; queued durable retry", payload.id);
  } catch (err) {
    console.error("[ai-usage] failed to record or queue usage", payload.id);
  }
}
