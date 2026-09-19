/**
 * Centralized, server-side pricing configuration for AI models.
 *
 * Prices are published API list prices in USD per 1,000,000 tokens and are
 * used ONLY to compute an *estimated* cost. They are not invoices.
 * Update prices here without touching any AI business logic.
 */
export type ModelPrice = {
  /** USD per 1M uncached input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
  /** Optional USD per 1M cached-input read tokens. */
  cachedInputPerMillion?: number;
  /** Optional USD per 1M cache-write input tokens. */
  cacheWritePerMillion?: number;
};

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // gemini-3.1-pro-preview — official Google Gemini API paid tier: $1.25/1M input,
  // $10.00/1M output (prompts <= 200k tokens).
  "gemini-3.1-pro-preview": { inputPerMillion: 1.25, outputPerMillion: 10 },
  // gemini-3-flash-preview — official Google Gemini API Standard paid tier
  // (ai.google.dev/gemini-api/docs/pricing): $0.50/1M input (text), $3.00/1M
  // output (incl. thinking tokens). Free Tier is "free of charge"; paid-tier
  // list prices are used here for cost estimation, consistent with the other models.
  "gemini-3-flash-preview": { inputPerMillion: 0.5, outputPerMillion: 3.0 },
  // "gemini-3.6-flash": PENDING VERIFICATION — official API pricing for
  // this model is not yet configured. Do NOT fabricate a value. Until verified
  // prices are added here, estimateCostUsd returns null and the dashboard
  // renders cost as "N/A" for this model (tokens are still tracked).
  "claude-sonnet-5": { inputPerMillion: 3, outputPerMillion: 15 },
  // grok-4.6 — official xAI short-context list pricing (<200k prompt tokens):
  // $2.00/1M input and $6.00/1M output. PromptBeats requests are far below the
  // 200k long-context threshold, so these rates match normal app usage.
  "grok-4.6": { inputPerMillion: 2, outputPerMillion: 6 },

  // OpenAI standard API list pricing verified 2026-09-19.
  // GPT-5.6+ cache reads are 90% discounted and cache writes are billed at
  // 1.25x the uncached input rate.
  "gpt-5.6-luna": {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    cacheWritePerMillion: 0.25,
    outputPerMillion: 1.2,
  },
  "gpt-5.6-terra": {
    inputPerMillion: 2,
    cachedInputPerMillion: 0.2,
    cacheWritePerMillion: 2.5,
    outputPerMillion: 12,
  },
  "gpt-5.6-sol": {
    inputPerMillion: 4,
    cachedInputPerMillion: 0.4,
    cacheWritePerMillion: 5,
    outputPerMillion: 20,
  },
  "gpt-6-astra": {
    inputPerMillion: 10,
    cachedInputPerMillion: 1,
    cacheWritePerMillion: 12.5,
    outputPerMillion: 50,
  },
};

/**
 * Estimated cost in USD, computed separately for input and output tokens.
 * Returns null when the model has no known pricing or usage is unavailable,
 * so the dashboard can render "N/A" instead of a fabricated number.
 */
type PriceDetails = {
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
};

function estimateWithPrice(
  price: ModelPrice | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  details?: PriceDetails,
): number | null {
  if (!price) return null;
  if (inputTokens == null && outputTokens == null) return null;

  const totalInput = inputTokens ?? 0;
  const cachedInput = Math.max(0, Math.min(totalInput, details?.cachedInputTokens ?? 0));
  const cacheWrite = Math.max(
    0,
    Math.min(totalInput - cachedInput, details?.cacheWriteTokens ?? 0),
  );
  const uncachedInput = Math.max(0, totalInput - cachedInput - cacheWrite);

  const inputCost =
    (uncachedInput / 1_000_000) * price.inputPerMillion +
    (cachedInput / 1_000_000) * (price.cachedInputPerMillion ?? price.inputPerMillion) +
    (cacheWrite / 1_000_000) * (price.cacheWritePerMillion ?? price.inputPerMillion);
  const outputCost = ((outputTokens ?? 0) / 1_000_000) * price.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

/** Compatibility calculator retained while Phase 1 is rolled out. */
export function estimateCostUsd(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  details?: PriceDetails,
): number | null {
  return estimateWithPrice(MODEL_PRICING[model], inputTokens, outputTokens, details);
}

/**
 * Registry-authoritative cost calculation. If the registry is temporarily
 * unavailable during rollout/rollback, the previous hardcoded pricing table is
 * used only as a compatibility fallback.
 */
export async function estimateCostUsdForModel(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  details?: PriceDetails,
): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_models" as never)
      .select(
        "input_price_per_million,output_price_per_million,cached_input_price_per_million,cache_write_price_per_million,pricing_status",
      )
      .eq("provider_model_id", model)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as {
      input_price_per_million: number | string | null;
      output_price_per_million: number | string | null;
      cached_input_price_per_million: number | string | null;
      cache_write_price_per_million: number | string | null;
      pricing_status: string;
    };
    if (
      row.pricing_status !== "verified" ||
      row.input_price_per_million == null ||
      row.output_price_per_million == null
    ) {
      return null;
    }

    const price: ModelPrice = {
      inputPerMillion: Number(row.input_price_per_million),
      outputPerMillion: Number(row.output_price_per_million),
      ...(row.cached_input_price_per_million == null
        ? {}
        : { cachedInputPerMillion: Number(row.cached_input_price_per_million) }),
      ...(row.cache_write_price_per_million == null
        ? {}
        : { cacheWritePerMillion: Number(row.cache_write_price_per_million) }),
    };
    return estimateWithPrice(price, inputTokens, outputTokens, details);
  } catch (error) {
    console.warn("[ai-pricing] registry pricing unavailable; using compatibility pricing", error);
    return estimateCostUsd(model, inputTokens, outputTokens, details);
  }
}
