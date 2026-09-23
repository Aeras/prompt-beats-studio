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

/**
 * Persists one usage row per actual provider request, with the service-role
 * client (the table is unreadable by normal users). Failures here are logged
 * and swallowed so analytics can never break generation.
 *
 * Do not calculate pricing in application code. The ai_usage_logs insert
 * trigger reads the canonical ai_models pricing registry. If pricing is not
 * verified yet, the row remains pending_pricing and is backfilled later.
 */
export async function recordAiUsage(rec: UsageRecord): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const input = rec.usage?.inputTokens ?? null;
    const output = rec.usage?.outputTokens ?? null;
    const total =
      rec.usage?.totalTokens ??
      (input == null && output == null ? null : (input ?? 0) + (output ?? 0));

    const { error } = await supabaseAdmin.from("ai_usage_logs" as never).insert({
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
    } as never);

    if (error) throw error;
  } catch (err) {
    console.error("[ai-usage] failed to record usage", err);
  }
}
