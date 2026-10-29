import { z } from "zod";
import type { NormalizedUsage } from "./ai-usage.server";
const value = z.number().finite().nonnegative().nullable();
const plannerUsageSchema = z.object({
  inputTokens: value,
  outputTokens: value,
  reasoningTokens: value,
  cachedInputTokens: value,
  cacheWriteTokens: value,
  costUsd: value,
  providerReportedCostUsd: value,
  complete: z.boolean(),
});
export const inspirationUsageSchema = z.object({
  planner: plannerUsageSchema.nullable().optional(),
  inputTokens: value,
  outputTokens: value,
  reasoningTokens: value,
  cachedInputTokens: value,
  cacheWriteTokens: value,
  searchCredits: value,
  aiCostUsd: value,
  searchCostUsd: value,
  totalCostUsd: value,
  providerReportedCostUsd: value,
  complete: z.boolean(),
});
export type InspirationUsage = z.infer<typeof inspirationUsageSchema>;
export type InspirationPrices = {
  input: number | null;
  output: number | null;
  cached: number | null;
  cacheWrite: number | null;
  searchCreditUsd: number | null;
};
export const emptyInspirationPrices = (): InspirationPrices => ({
  input: null,
  output: null,
  cached: null,
  cacheWrite: null,
  searchCreditUsd: null,
});
export function configuredPrice(raw: unknown): number | null {
  if (
    (typeof raw !== "number" && typeof raw !== "string") ||
    (typeof raw === "string" && !raw.trim())
  )
    return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const round = (n: number) => Math.round(n * 1e8) / 1e8;
export type InspirationUsageEvidence = {
  prices?: Partial<InspirationPrices> | null;
  usage?: NormalizedUsage | null;
  aiDispatched?: boolean;
  aiFinal?: boolean;
  searches?: { state: string; credits?: number | null }[];
  planner?: Omit<InspirationUsageEvidence, "planner" | "searches"> | null;
};
/** Normalized output already includes reasoning; cached/write tokens are subsets of input. */
export function summarizeInspirationUsage(evidence: InspirationUsageEvidence): InspirationUsage {
  const p = { ...emptyInspirationPrices(), ...evidence.prices };
  const u = evidence.usage;
  const input = configuredPrice(u?.inputTokens),
    output = configuredPrice(u?.outputTokens);
  const cached = configuredPrice(u?.cachedInputTokens),
    written = configuredPrice(u?.cacheWriteTokens);
  const component = (tokens: number | null, rate: number | null) =>
    tokens === 0 ? 0 : tokens === null || rate === null ? null : (tokens * rate) / 1e6;
  let aiCost: number | null = evidence.aiDispatched ? null : 0;
  if (input !== null && output !== null && (cached ?? 0) + (written ?? 0) <= input) {
    const parts = [
      component(input - (cached ?? 0) - (written ?? 0), p.input),
      component(cached ?? 0, p.cached),
      component(written ?? 0, p.cacheWrite),
      component(output, p.output),
    ];
    aiCost = parts.every((n) => n !== null)
      ? round(parts.reduce<number>((sum, n) => sum + (n ?? 0), 0))
      : null;
  }
  const searches = evidence.searches ?? [];
  const knownSearch = searches.every(
    (s) => s.state === "observed" && configuredPrice(s.credits) !== null,
  );
  const credits = knownSearch ? searches.reduce((sum, s) => sum + s.credits!, 0) : null;
  const searchCost =
    credits === 0
      ? 0
      : credits === null || p.searchCreditUsd === null
        ? null
        : round(credits * p.searchCreditUsd);
  const planner = evidence.planner ? summarizeInspirationUsage(evidence.planner) : null;
  const complete =
    (!planner || planner.complete) &&
    (!evidence.aiDispatched || evidence.aiFinal === true) &&
    aiCost !== null &&
    searchCost !== null &&
    knownSearch;
  return {
    planner: planner
      ? {
          inputTokens: planner.inputTokens,
          outputTokens: planner.outputTokens,
          reasoningTokens: planner.reasoningTokens,
          cachedInputTokens: planner.cachedInputTokens,
          cacheWriteTokens: planner.cacheWriteTokens,
          costUsd: planner.aiCostUsd,
          providerReportedCostUsd: planner.providerReportedCostUsd,
          complete: planner.complete,
        }
      : null,
    inputTokens: input,
    outputTokens: output,
    reasoningTokens: configuredPrice(u?.reasoningTokens),
    cachedInputTokens: cached,
    cacheWriteTokens: written,
    searchCredits: credits,
    aiCostUsd: aiCost,
    searchCostUsd: searchCost,
    totalCostUsd: complete ? round(aiCost! + searchCost! + (planner?.aiCostUsd ?? 0)) : null,
    providerReportedCostUsd: configuredPrice(u?.providerReportedCostUsd),
    complete,
  };
}
