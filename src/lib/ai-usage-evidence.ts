import type { NormalizedUsage } from "./ai-usage.server";

type EvidenceObject = Partial<
  Record<
    | "usage"
    | "usageMetadata"
    | "input_tokens"
    | "prompt_tokens"
    | "promptTokenCount"
    | "total_input_tokens"
    | "output_tokens"
    | "completion_tokens"
    | "candidatesTokenCount"
    | "total_output_tokens"
    | "total_tokens"
    | "totalTokenCount"
    | "cost"
    | "total_cost"
    | "input_tokens_details"
    | "prompt_tokens_details"
    | "cached_tokens"
    | "cachedContentTokenCount"
    | "cache_read_input_tokens"
    | "cache_creation_input_tokens"
    | "cache_write_tokens"
    | "output_tokens_details"
    | "completion_tokens_details"
    | "reasoning_tokens"
    | "thoughtsTokenCount"
    | "total_thought_tokens",
    unknown
  >
>;
function object(value: unknown): EvidenceObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function tokens(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 2147483647
    ? value
    : null;
}
/** Allowlisted receipt fields only. No provider message, prompt, key or raw body. */
export function usageEvidence(payload: unknown, provider?: string): NormalizedUsage | null {
  const p = object(payload);
  const u = object(p.usage ?? p.usageMetadata ?? p);
  let input = tokens(
    u.input_tokens ?? u.prompt_tokens ?? u.promptTokenCount ?? u.total_input_tokens,
  );
  let output = tokens(
    u.output_tokens ?? u.completion_tokens ?? u.candidatesTokenCount ?? u.total_output_tokens,
  );
  // GenerateContent candidates exclude thoughts; OpenAI-compatible output already includes them.
  if (u.candidatesTokenCount !== undefined || u.thoughtsTokenCount !== undefined) {
    const candidates = tokens(u.candidatesTokenCount);
    const thoughts = tokens(u.thoughtsTokenCount);
    output =
      candidates === null && thoughts === null ? null : tokens((candidates ?? 0) + (thoughts ?? 0));
  }
  // Anthropic input_tokens is uncached input, unlike OpenAI-compatible prompt_tokens.
  if (provider === "anthropic" && input !== null) {
    input = tokens(
      input +
        (tokens(u.cache_read_input_tokens) ?? 0) +
        (tokens(u.cache_creation_input_tokens) ?? 0),
    );
  }
  const total =
    tokens(u.total_tokens ?? u.totalTokenCount) ??
    (input === null || output === null ? null : tokens(input + output));
  const cost = provider === "openrouter" ? (u.cost ?? u.total_cost) : null;
  const knownCost = typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null;
  if (input === null && output === null && total === null && knownCost === null) return null;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
    cachedInputTokens: tokens(
      object(u.input_tokens_details ?? u.prompt_tokens_details).cached_tokens ??
        u.cachedContentTokenCount ??
        u.cache_read_input_tokens,
    ),
    cacheWriteTokens: tokens(
      u.cache_creation_input_tokens ??
        object(u.input_tokens_details ?? u.prompt_tokens_details).cache_write_tokens,
    ),
    reasoningTokens: tokens(
      object(u.output_tokens_details ?? u.completion_tokens_details).reasoning_tokens ??
        u.thoughtsTokenCount ??
        u.total_thought_tokens,
    ),
    providerReportedCostUsd: knownCost,
  };
}
