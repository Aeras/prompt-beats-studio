import { usageEvidence } from "./ai-usage-evidence";
import type { ModelResult } from "./ai-provider.server";

/** GET only: recovery never creates, retries or changes a provider generation. */
export async function retrieveBackgroundResult(
  provider: "openai" | "gemini",
  remoteId: string,
  model: string,
  fetcher = fetch,
): Promise<ModelResult | null> {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(remoteId)) throw new Error("Invalid operation ID.");
  const secret = process.env[provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"];
  if (!secret) throw new Error("Recovery provider is not configured.");
  const url =
    provider === "openai"
      ? `https://api.openai.com/v1/responses/${encodeURIComponent(remoteId)}`
      : `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(remoteId)}`;
  const response = await fetcher(url, {
    method: "GET",
    signal: AbortSignal.timeout(10000),
    headers:
      provider === "openai" ? { authorization: `Bearer ${secret}` } : { "x-goog-api-key": secret },
  });
  if (!response.ok) throw new Error("Recovery status unavailable.");
  const p = (await response.json()) as {
    status?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    outputs?: Array<{ type?: string; text?: string }>;
    output_text?: string;
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  if (!["completed", "failed", "cancelled", "incomplete", "expired"].includes(p.status ?? ""))
    return null;
  const text =
    provider === "openai"
      ? (p.output ?? [])
          .filter((x) => x.type === "message")
          .flatMap((x) => x.content ?? [])
          .filter((x) => x.type === "output_text")
          .map((x) => x.text ?? "")
          .join("")
      : (p.output_text ??
        (p.steps ?? [])
          .filter((x) => x.type === "model_output")
          .flatMap((x) => x.content ?? [])
          .filter((x) => x.type === "text")
          .map((x) => x.text ?? "")
          .join(""));
  return {
    text,
    stopReason: p.status === "completed" ? "end_turn" : (p.status ?? null),
    usage: usageEvidence(p),
    provider,
    model,
  };
}
