/**
 * Centralized, server-side pricing configuration for AI models.
 *
 * Prices are published API list prices in USD per 1,000,000 tokens and are
 * used ONLY to compute an *estimated* cost. They are not invoices.
 * Update prices here without touching any AI business logic.
 */
export type ModelPrice = {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
};

export const MODEL_PRICING: Record<string, ModelPrice> = {
  "gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "claude-sonnet-5": { inputPerMillion: 3, outputPerMillion: 15 },
};

/**
 * Estimated cost in USD, computed separately for input and output tokens.
 * Returns null when the model has no known pricing or usage is unavailable,
 * so the dashboard can render "N/A" instead of a fabricated number.
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  const price = MODEL_PRICING[model];
  if (!price) return null;
  if (inputTokens == null && outputTokens == null) return null;
  const cost =
    ((inputTokens ?? 0) / 1_000_000) * price.inputPerMillion +
    ((outputTokens ?? 0) / 1_000_000) * price.outputPerMillion;
  return Number(cost.toFixed(6));
}
