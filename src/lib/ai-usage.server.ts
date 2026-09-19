/**
 * AI usage recording. Observes provider responses only — it never issues an
 * AI call of its own and never blocks the AI pipeline.
 */
import { estimateCostUsdForModel } from "@/lib/ai-pricing.server";

export type AiOperation =
  | "generate"
  | "quality_check"
  | "repair"
  | "post_repair_quality_check"
  | "song_setup_assistant";

/** Provider-agnostic normalized usage, as reported by the provider. */
export type NormalizedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Provider-specific details used for more accurate cost estimation when available. */
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
 */
export async function recordAiUsage(rec: UsageRecord): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const input = rec.usage?.inputTokens ?? null;
    const output = rec.usage?.outputTokens ?? null;
    const total = rec.usage?.totalTokens ?? (input == null && output == null ? null : (input ?? 0) + (output ?? 0));
    await supabaseAdmin.from("ai_usage_logs" as never).insert({
      user_id: rec.userId,
      generation_id: rec.generationId ?? null,
      provider: rec.provider,
      model: rec.model,
      operation: rec.operation,
      input_tokens: input,
      output_tokens: output,
      total_tokens: total,
      estimated_cost_usd: await estimateCostUsdForModel(rec.model, input, output, {
        cachedInputTokens: rec.usage?.cachedInputTokens,
        cacheWriteTokens: rec.usage?.cacheWriteTokens,
      }),
      success: rec.success,
    } as never);
  } catch (err) {
    console.error("[ai-usage] failed to record usage", err);
  }
}
