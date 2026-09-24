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
  | "ai_music_lab_generation"
  | "inspiration_wall_extraction"
  | "story_map_generate"
  | "story_map_from_lyrics"
  | "story_map_analyze_lyrics"
  | "story_driven_plan"
  | "universe_creative_bible_generate"
  | "universe_creative_bible_refine"
  | "universe_continuity_analysis"
  | "universe_project_fit";

/** Provider-agnostic normalized usage, as reported by the provider. */
export type NormalizedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Provider-specific details used for more accurate cost calculation when available. */
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
};

export type UsageRecord = {
  userId: string;
  generationId?: string | null;
  provider: string;
  model: string;
  operation: AiOperation;
  usage: NormalizedUsage | null;
  success: boolean;
};

type UsageInsert = {
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
  success: boolean;
};

function toUsageInsert(rec: UsageRecord): UsageInsert {
  const input = rec.usage?.inputTokens ?? null;
  const output = rec.usage?.outputTokens ?? null;
  const total =
    rec.usage?.totalTokens ??
    (input == null && output == null ? null : (input ?? 0) + (output ?? 0));

  return {
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
    success: rec.success,
  };
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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

    let { error } = await supabaseAdmin.from("ai_usage_logs" as never).insert(payload as never);
    if (error) {
      await wait(150);
      ({ error } = await supabaseAdmin.from("ai_usage_logs" as never).insert(payload as never));
    }

    if (!error) {
      const { error: flushError } = await supabaseAdmin.rpc(
        "flush_ai_usage_outbox" as never,
        { _limit: 20 } as never,
      );
      if (flushError) console.error("[ai-usage] outbox flush failed", flushError);
      return;
    }

    const { error: outboxError } = await supabaseAdmin.from("ai_usage_outbox" as never).insert({
      payload,
      last_error: error.message,
    } as never);
    if (outboxError) throw outboxError;

    console.error("[ai-usage] primary insert failed; queued durable retry", error);
  } catch (err) {
    console.error("[ai-usage] failed to record or queue usage", err);
  }
}
