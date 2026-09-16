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
