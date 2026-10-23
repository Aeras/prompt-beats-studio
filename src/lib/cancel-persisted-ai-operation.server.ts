import { cancelBackgroundOperation, type CancelOutcome } from "@/lib/ai-cancellation-upstream.server";

/**
 * Recovery cancellation path: the browser never receives upstream IDs or keys.
 * Caller must first authorize job ownership; this function is server-only.
 */
export async function cancelPersistedBackgroundOperation(
  provider: unknown,
  operationId: unknown,
): Promise<CancelOutcome | null> {
  if ((provider !== "openai" && provider !== "gemini") ||
      typeof operationId !== "string" ||
      !/^[A-Za-z0-9_.:-]{1,160}$/.test(operationId)) return null;
  const key = process.env[provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"];
  if (!key) return "cancel_failed";
  try {
    const result = await cancelBackgroundOperation(provider, operationId, key, {
      polls: 8,
      pollIntervalMs: 400,
    });
    return result.outcome;
  } catch {
    return "cancel_failed";
  }
}
