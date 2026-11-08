import {
  FOOTBALL_SEARCH_PROFILES,
  type FootballSearchProfileVersion,
} from "./football-search-profiles.shared";
import { z } from "zod";
export const FOOTBALL_SEARCH_PROFILE = "P1-Preserve" as const;
export const FOOTBALL_SEARCH_CALLS = 5;
export const FOOTBALL_RESULTS_PER_SEARCH = 5;
export const FOOTBALL_MODEL_OUTPUT_TOKENS = 16384;
export const FOOTBALL_MAX_PROMPT_BYTES = 262144;
export const FOOTBALL_RUN_TIMEOUT_MS = 300000;
export const FOOTBALL_SEARCH_TIMEOUT_MS = 15000;
export const FOOTBALL_MODEL_TIMEOUT_MS = 180000;
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
  profileVersion: FootballSearchProfileVersion = "v1_current",
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
  const config = FOOTBALL_SEARCH_PROFILES[profileVersion];
  const searchCredits = config.searchCalls * (depth === "advanced" ? 2 : 1);
  const modelCalls = profileVersion === "v2_experimental" ? 5 : 1;
  const outputTokenAllowance =
    profileVersion === "v2_experimental"
      ? 4 * 8192 + FOOTBALL_MODEL_OUTPUT_TOKENS
      : FOOTBALL_MODEL_OUTPUT_TOKENS;
  const modelUsd =
    maxInputRate === null || outputRate === null
      ? null
      : (modelCalls * inputTokenAllowance * maxInputRate + outputTokenAllowance * outputRate) / 1e6;
  const searchUsd = credit === null ? null : searchCredits * credit;
  return {
    profile: profileVersion === "v1_current" ? FOOTBALL_SEARCH_PROFILE : "forecast-only-2",
    searchProfileVersion: profileVersion,
    searchCalls: config.searchCalls,
    resultsPerSearch: config.resultsPerSearch,
    maxResults: config.maxCandidates,
    searchCredits,
    modelCalls,
    ...(profileVersion === "v2_experimental" ? { outputTokenAllowance } : {}),
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
    crossQueryDuplicates: z.number().int().nonnegative().max(10).optional(),
    retrieval: z
      .object({
        requestedResults: z.number().int().min(1).max(10),
        receivedResults: z.number().int().nonnegative(),
        acceptedRawDocs: z.number().int().nonnegative(),
        droppedMissingRaw: z.number().int().nonnegative(),
        droppedUnsafeUrl: z.number().int().nonnegative(),
        droppedDuplicateUrl: z.number().int().nonnegative(),
        droppedExcess: z.number().int().nonnegative(),
        truncatedDocs: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    returnedSources: z
      .array(z.object({ url: z.string().url().max(2000), title: z.string().max(180) }).strict())
      .max(10)
      .optional(),
  })
  .strict();
export type FootballSearchReceipt = z.infer<typeof footballSearchReceiptSchema>;
