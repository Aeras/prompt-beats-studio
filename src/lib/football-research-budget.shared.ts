import { z } from "zod";
export const FOOTBALL_SEARCH_PROFILE = "P1-Preserve" as const;
export const FOOTBALL_SEARCH_CALLS = 5;
export const FOOTBALL_RESULTS_PER_SEARCH = 5;
export const FOOTBALL_MODEL_OUTPUT_TOKENS = 16384;
export const FOOTBALL_MAX_PROMPT_BYTES = 262144;
export const FOOTBALL_RUN_TIMEOUT_MS = 150000;
export const FOOTBALL_SEARCH_TIMEOUT_MS = 15000;
export const FOOTBALL_MODEL_TIMEOUT_MS = 90000;
export const FOOTBALL_CONSENT_VERSION = "football-five-searches-v2" as const;
export function footballResearchBudget(
  depth: "basic" | "advanced",
  prices: {
    input: number | null;
    output: number | null;
    searchCreditUsd: number | null;
    cached?: number | null;
    cacheWrite?: number | null;
  },
) {
  const rate = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const inputRate = rate(prices.input),
    outputRate = rate(prices.output),
    credit = rate(prices.searchCreditUsd);
  const inputTokenAllowance = FOOTBALL_MAX_PROMPT_BYTES + 4096;
  const maxInputRate =
    inputRate === null
      ? null
      : Math.max(inputRate, rate(prices.cached) ?? 0, rate(prices.cacheWrite) ?? 0);
  const searchCredits = depth === "advanced" ? 10 : 5;
  const modelUsd =
    maxInputRate === null || outputRate === null
      ? null
      : (inputTokenAllowance * maxInputRate + FOOTBALL_MODEL_OUTPUT_TOKENS * outputRate) / 1e6;
  const searchUsd = credit === null ? null : searchCredits * credit;
  return {
    profile: FOOTBALL_SEARCH_PROFILE,
    searchCalls: 5,
    resultsPerSearch: 5,
    maxResults: 25,
    searchCredits,
    modelCalls: 1,
    outputTokens: FOOTBALL_MODEL_OUTPUT_TOKENS,
    maxPromptBytes: FOOTBALL_MAX_PROMPT_BYTES,
    inputTokenAllowance,
    inputAccounting: "conservative_utf8_bytes_plus_framing_not_tokenizer_exact" as const,
    modelUsd,
    searchUsd,
    totalUsd: modelUsd === null || searchUsd === null ? null : modelUsd + searchUsd,
    tariffBasis: "stored_administrator_rates_estimate_not_invoice" as const,
    extraExtractCalls: 0,
    automaticRetries: 0,
  };
}
export const footballSearchReceiptSchema = z
  .object({
    query: z.string().max(2000),
    language: z.enum(["el", "en", "ru", "unknown"]),
    intent: z.enum(["external_forecasts", "match_facts"]),
    state: z.enum(["unconfirmed", "observed"]),
    credits: z.number().int().nonnegative().nullable(),
    requestId: z.string().max(200).nullable(),
  })
  .strict();
export type FootballSearchReceipt = z.infer<typeof footballSearchReceiptSchema>;
