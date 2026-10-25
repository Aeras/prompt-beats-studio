import type {
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from "@google/genai";
import { consumeAiDispatchAdmission } from "./global-ai-usage.server";

/** Public SDK API only. Disable opaque SDK retries and re-admit every explicit
 * retry. Current callers configure no retries (the installed SDK also sends
 * once when retryOptions is absent). Preserve an explicit caller retry policy. */
export async function generateAiContent(
  ai: GoogleGenAI,
  params: GenerateContentParameters,
): Promise<GenerateContentResponse> {
  const retry = params.config?.httpOptions?.retryOptions;
  const attempts = retry ? Math.max(1, retry.attempts ?? 5) : 1;
  const statuses = retry?.httpStatusCodes ?? [408, 429, 500, 502, 503, 504];
  for (let attempt = 0; ; attempt++) {
    params.config?.abortSignal?.throwIfAborted();
    await consumeAiDispatchAdmission();
    try {
      return await ai.models.generateContent({
        ...params,
        config: {
          ...params.config,
          httpOptions: { ...params.config?.httpOptions, retryOptions: { ...retry, attempts: 1 } },
        },
      });
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error ? Number(error.status) : null;
      if (
        attempt + 1 >= attempts ||
        params.config?.abortSignal?.aborted ||
        (status !== null && !statuses.includes(status))
      )
        throw error;
      const delay =
        Math.min(
          retry?.maxDelay ?? 60,
          (retry?.initialDelay ?? 1) * (retry?.expBase ?? 2) ** attempt,
        ) * 1000;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(
            (retry?.maxDelay ?? 60) * 1000,
            delay * ((retry?.jitter ?? 1) > 0 ? 1 + Math.random() : 1),
          ),
        ),
      );
    }
  }
}
