/**
 * Server-side AI pricing calculator.
 *
 * Pricing data is registry-authoritative and lives only in public.ai_models.
 * This module contains calculation logic only; it intentionally has no
 * hardcoded model prices or fallback price table.
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

type PriceDetails = {
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
};

function estimateWithPrice(
  price: ModelPrice,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  details?: PriceDetails,
): number | null {
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

/**
 * Registry-authoritative cost calculation.
 *
 * If the model has unknown/unverified pricing, or the registry cannot be read,
 * return null so callers render N/A instead of silently using stale prices.
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
    console.warn("[ai-pricing] registry pricing unavailable; cost estimate omitted", error);
    return null;
  }
}
