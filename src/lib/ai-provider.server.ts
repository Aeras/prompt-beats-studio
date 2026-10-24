/**
 * Provider/model abstraction for the AI pipeline.
 *
 * The whole application pipeline (Generate → Quality Check → user-approved
 * corrections) lives in `ai.functions.ts` and is shared by every provider.
 * Only the raw model call differs and lives here.
 *
 * API keys are read from server-side environment variables inside the call and
 * never leave the server.
 */
import { GoogleGenAI } from "@google/genai";
import { usageEvidence } from "./ai-usage-evidence";

async function observeUsage(call: ModelCall, payload: unknown) {
  const usage = usageEvidence(payload, call.usageProvider);
  if (usage) await call.onUsageObserved?.(usage);
}

import { AI_MODELS, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";
import {
  getInstalledRegistryModels,
  getOperationDefaultModel,
  getRegistryModel,
  isModelEligibleForOperation,
  reasoningForOperation,
  type AiModelOperation,
  type RegistryModel,
} from "@/lib/ai-model-registry.server";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export type ModelCall = {
  /** Internal accounting context, never included in provider request bodies. */
  usageProvider?: string;
  onUsageObserved?: (usage: import("./ai-usage.server").NormalizedUsage) => void | Promise<void>;
  /** System instruction shared by all providers. */
  system: string;
  /** User prompt shared by all providers. */
  prompt: string;
  /** Output token budget for non-reasoning providers / visible-output baseline. */
  maxTokens?: number;
  /** Optional structured-output JSON schema (used where the provider supports it). */
  schema?: Record<string, unknown>;
  /** Provider-specific reasoning budget; ignored by providers that do not expose it. */
  reasoningEffort?: ReasoningEffort;
  /** Explicit bounded request timeout for long-running durable operations only. */
  requestTimeoutMs?: number;
  /** Caller-driven cancellation, separate from the transport timeout. */
  abortSignal?: AbortSignal;
  /** Reports independently verified upstream cancellation to the durable job. */
  onCancellationResult?: (outcome: string) => void | Promise<void>;
  onRemoteOperationCreated?: (
    provider: "openai" | "gemini",
    remoteId: string,
  ) => void | Promise<void>;
};

export type ModelResult = {
  text: string;
  /** Normalized: "end_turn" (complete), "max_tokens" (truncated), or other. */
  stopReason: string | null;
  /** Provider-reported token usage; null when the provider did not report it. */
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cachedInputTokens?: number | null;
    cacheWriteTokens?: number | null;
    reasoningTokens?: number | null;
    executionId?: string;
    providerReportedCostUsd?: number | null;
  } | null;
  /** The provider that actually served this request. */
  provider: string;
  /** The model that actually served this request. */
  model: string;
};

export type ModelCaller = ((call: ModelCall) => Promise<ModelResult>) & {
  executionId?: string | undefined;
};

function providerRequestTimeoutMs(call: ModelCall) {
  if (call.requestTimeoutMs !== undefined) {
    return Math.max(1000, Math.min(call.requestTimeoutMs, 12 * 60 * 1000));
  }
  if (
    call.reasoningEffort === "high" ||
    call.reasoningEffort === "xhigh" ||
    call.reasoningEffort === "max"
  ) {
    return 7 * 60 * 1000;
  }
  if (call.reasoningEffort === "medium") return 6 * 60 * 1000;
  return 5 * 60 * 1000;
}

function providerRequestSignal(call: ModelCall) {
  const timeout = AbortSignal.timeout(providerRequestTimeoutMs(call));
  return call.abortSignal ? AbortSignal.any([timeout, call.abortSignal]) : timeout;
}

export function providerOf(model: string) {
  return AI_MODELS.find((m) => m.id === model)?.provider ?? "gemini";
}

function sanitizeAllowedModels(models: string[] | null | undefined): AiModelId[] {
  const seen = new Set<string>();
  const allowed: AiModelId[] = [];
  for (const model of models ?? []) {
    const normalized = typeof model === "string" ? model.trim() : "";
    if (!normalized || normalized.length > 240 || seen.has(normalized)) continue;
    seen.add(normalized);
    allowed.push(normalized);
  }
  return allowed;
}

async function assertAiEligibleUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authError || !authUser.user) throw new Error("The account is no longer available.");
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profile_private")
    .select("is_banned")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError || !profile || (profile as { is_banned?: boolean }).is_banned === true) {
    throw new Error("This account is not allowed to use AI services.");
  }
  return supabaseAdmin;
}

async function hasAdminBypass(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("_is_admin_level_internal", {
    _user_id: userId,
  });
  return isAdmin === true;
}

async function callAnthropic(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");

  const startedAt = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: providerRequestSignal(call),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: call.maxTokens ?? 8192,
      system: call.system,
      messages: [{ role: "user", content: call.prompt }],
      // Anthropic explicitly recommends streaming for long-running Messages
      // requests because intermediaries may drop otherwise-idle connections.
      // We still accumulate the complete response before returning it to the
      // existing PromptBeats parsing/validation pipeline.
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let errorType = "unknown";
    try {
      const parsed = JSON.parse(body) as { error?: { type?: string } };
      errorType = parsed.error?.type ?? errorType;
    } catch {
      // Keep diagnostics metadata-only; never log prompt/lyrics content.
    }
    console.error("[ai-provider] Anthropic request failed", {
      model,
      status: res.status,
      errorType,
      durationMs: Date.now() - startedAt,
      requestId: res.headers.get("request-id") ?? res.headers.get("x-request-id"),
    });
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  if (!res.body) {
    console.error("[ai-provider] Anthropic stream missing body", {
      model,
      durationMs: Date.now() - startedAt,
      requestId: res.headers.get("request-id") ?? res.headers.get("x-request-id"),
    });
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";
  let text = "";
  let reason: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let cachedInputTokens: number | null = null;
  let cacheWriteTokens: number | null = null;

  const processEvent = (rawData: string) => {
    if (!rawData || rawData === "[DONE]") return false;
    const event = JSON.parse(rawData) as {
      type?: string;
      message?: {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      delta?: {
        type?: string;
        text?: string;
        stop_reason?: string | null;
      };
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      error?: { type?: string; message?: string };
    };

    if (event.type === "message_start") {
      const usage = event.message?.usage;
      inputTokens = usage?.input_tokens ?? inputTokens;
      outputTokens = usage?.output_tokens ?? outputTokens;
      cachedInputTokens = usage?.cache_read_input_tokens ?? cachedInputTokens;
      cacheWriteTokens = usage?.cache_creation_input_tokens ?? cacheWriteTokens;
      return usage !== undefined;
    }

    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      text += event.delta.text ?? "";
      return false;
    }

    if (event.type === "message_delta") {
      reason = event.delta?.stop_reason ?? reason;
      outputTokens = event.usage?.output_tokens ?? outputTokens;
      return event.usage !== undefined;
    }

    if (event.type === "error") {
      const errorType = event.error?.type ?? "stream_error";
      console.error("[ai-provider] Anthropic stream error", {
        model,
        errorType,
        durationMs: Date.now() - startedAt,
        requestId: res.headers.get("request-id") ?? res.headers.get("x-request-id"),
      });
      throw new Error("The AI provider is temporarily unavailable. Please try again later.");
    }
    return false;
  };

  const observeCurrentUsage = async () => {
    const observed = usageEvidence(
      {
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_input_tokens: cachedInputTokens,
          cache_creation_input_tokens: cacheWriteTokens,
        },
      },
      "anthropic",
    );
    if (observed) await call.onUsageObserved?.(observed);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        const usageChanged = data ? processEvent(data) : false;
        if (usageChanged) await observeCurrentUsage();
        boundary = buffer.indexOf("\n\n");
      }

      if (done) break;
    }

    const trailing = buffer.trim();
    if (trailing) {
      const data = trailing
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data && processEvent(data)) await observeCurrentUsage();
    }
  } catch (error) {
    console.error("[ai-provider] Anthropic stream interrupted", {
      model,
      durationMs: Date.now() - startedAt,
      requestId: res.headers.get("request-id") ?? res.headers.get("x-request-id"),
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  } finally {
    reader.releaseLock();
  }

  const stopReason = reason === "stop_sequence" ? "end_turn" : reason;
  const usage =
    inputTokens == null &&
    outputTokens == null &&
    cachedInputTokens == null &&
    cacheWriteTokens == null
      ? null
      : usageEvidence(
          {
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_read_input_tokens: cachedInputTokens,
              cache_creation_input_tokens: cacheWriteTokens,
            },
          },
          "anthropic",
        );

  console.info("[ai-provider] Anthropic stream completed", {
    model,
    stopReason,
    durationMs: Date.now() - startedAt,
    requestId: res.headers.get("request-id") ?? res.headers.get("x-request-id"),
  });

  return { text, stopReason, usage, provider: "anthropic", model };
}

export class AiProviderHttpError extends Error {
  override readonly name = "AiProviderHttpError";
  constructor(
    readonly provider: string,
    readonly httpStatus: number,
    readonly providerCode: string | null,
  ) {
    super(`AI provider request failed: ${provider} HTTP ${httpStatus}`);
  }
}

/**
 * Gemini SSE emits incremental candidate text and a terminal usage/finish frame.
 * The full JSON response is reconstructed before Quality Check validation.
 * This avoids holding an idle generateContent HTTP request for the entire
 * (often >120s) Argon reasoning period. A stream does not bypass hard runtime
 * execution limits; those still require deployment-level investigation.
 */
async function collectGeminiSse(
  response: Response,
  model: string,
  call?: ModelCall,
): Promise<{
  text: string;
  finish: string | null;
  usageMetadata: any;
}> {
  if (!response.body) throw new Error("Gemini streaming response has no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finish: string | null = null;
  let usageMetadata: any = null;
  let frames = 0;
  const consume = (frame: string) => {
    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) return;
    const data = dataLines.join("\n");
    if (data === "[DONE]") return;
    const payload = JSON.parse(data) as any;
    if (payload?.error) {
      throw new Error("Gemini streaming response returned an error frame.");
    }
    const candidate = payload?.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part?.text === "string") text += part.text;
    }
    if (typeof candidate?.finishReason === "string") finish = candidate.finishReason;
    if (payload?.usageMetadata) usageMetadata = payload.usageMetadata;
    frames++;
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      // SSE frames are separated by blank lines (LF or CRLF).
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        consume(buffer.slice(0, boundary));
        if (call) await observeUsage(call, { usageMetadata });
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } catch (error) {
    console.error("[ai-provider] Gemini Argon stream failed", {
      model,
      frames,
      receivedCharacters: text.length,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (finish !== "STOP") {
    console.error("[ai-provider] Gemini Argon stream incomplete", {
      model,
      frames,
      finish,
      receivedCharacters: text.length,
    });
  }
  return { text, finish, usageMetadata };
}

async function callGeminiBackground(
  model: string,
  call: ModelCall,
  apiKey: string,
  maxOutputTokens: number,
): Promise<ModelResult> {
  const url = "https://generativelanguage.googleapis.com/v1beta/interactions";
  const headers = { "x-goog-api-key": apiKey, "content-type": "application/json" };
  // Background response IDs must arrive even when the user stops immediately.
  const create = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(providerRequestTimeoutMs(call)),
    body: JSON.stringify({
      model,
      input: call.prompt,
      system_instruction: call.system,
      background: true,
      generation_config: { max_output_tokens: maxOutputTokens },
      ...(call.schema ? { response_format: call.schema } : {}),
    }),
  });
  if (!create.ok) throw new Error("The Gemini background request was rejected.");
  let interaction = (await create.json()) as {
    id?: string;
    status?: string;
    output_text?: string;
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    usage?: {
      total_input_tokens?: number;
      total_output_tokens?: number;
      total_thought_tokens?: number;
      total_tokens?: number;
    };
  };
  const id = interaction.id;
  await observeUsage(call, interaction);
  if (!id || !/^[A-Za-z0-9_.:-]{1,160}$/.test(id))
    throw new Error("Gemini did not return a usable background interaction ID.");

  await call.onRemoteOperationCreated?.("gemini", id);
  const deadline = Date.now() + providerRequestTimeoutMs(call);
  const terminal = new Set(["completed", "failed", "cancelled"]);
  while (!terminal.has(interaction.status ?? "") && Date.now() < deadline) {
    if (call.abortSignal?.aborted) {
      const { cancelBackgroundOperation } = await import("@/lib/ai-cancellation-upstream.server");
      const cancelled = await cancelBackgroundOperation("gemini", id, apiKey, {
        onUsageObserved: call.onUsageObserved,
      });
      await call.onCancellationResult?.(cancelled.outcome);
      throw new Error("Generation cancellation requested.");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    const check = await fetch(`${url}/${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!check.ok) throw new Error("Gemini background status retrieval failed.");
    interaction = (await check.json()) as typeof interaction;
    await observeUsage(call, interaction);
  }
  if (call.abortSignal?.aborted) {
    if (interaction.status !== "cancelled") {
      const { cancelBackgroundOperation } = await import("@/lib/ai-cancellation-upstream.server");
      const cancelled = await cancelBackgroundOperation("gemini", id, apiKey, {
        onUsageObserved: call.onUsageObserved,
      });
      await call.onCancellationResult?.(cancelled.outcome);
    } else {
      await call.onCancellationResult?.("cancelled_upstream_confirmed");
    }
    throw new Error("Generation cancellation requested.");
  }
  if (interaction.status !== "completed")
    throw new Error("The Gemini background request was not completed.");

  const text =
    interaction.output_text ??
    interaction.steps
      ?.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("") ??
    "";
  const u = interaction.usage;
  const inputTokens = u?.total_input_tokens ?? null;
  const outputTokens = u?.total_output_tokens ?? null;
  const totalTokens =
    u?.total_tokens ??
    (inputTokens == null && outputTokens == null ? null : (inputTokens ?? 0) + (outputTokens ?? 0));
  return {
    text,
    stopReason: "end_turn",
    usage:
      inputTokens == null && outputTokens == null && totalTokens == null
        ? null
        : {
            inputTokens,
            outputTokens,
            totalTokens,
            reasoningTokens: u?.total_thought_tokens ?? null,
          },
    provider: "gemini",
    model,
  };
}

async function callGemini(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");

  const isArgon = model === "gemini-4-argon";
  const argonThinkingLevel =
    call.reasoningEffort === "low"
      ? "low"
      : call.reasoningEffort === "high" ||
          call.reasoningEffort === "xhigh" ||
          call.reasoningEffort === "max"
        ? "high"
        : "medium";
  const timeoutMs = isArgon ? 15 * 60 * 1000 : providerRequestTimeoutMs(call);
  const requestedOutput = (call.maxTokens ?? 8192) * 2;
  const maxOutputTokens = isArgon ? Math.max(requestedOutput, 32_768) : requestedOutput;

  if (call.abortSignal && model === "gemini-3.8-flash")
    return callGeminiBackground(model, call, apiKey, maxOutputTokens);

  // Gemini 4 Argon requires a newer SDK than the version currently pinned by
  // PromptBeats. Use the stable REST generateContent contract directly so the
  // model can be enabled without upgrading the whole Gemini dependency surface.
  if (isArgon) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: call.abortSignal
          ? AbortSignal.any([AbortSignal.timeout(timeoutMs), call.abortSignal])
          : AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: call.system }] },
          contents: [{ role: "user", parts: [{ text: call.prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            ...(call.schema ? { responseSchema: call.schema } : {}),
            maxOutputTokens,
            thinkingConfig: { thinkingLevel: argonThinkingLevel },
          },
        }),
      },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as any;
      const message = payload?.error?.message;
      const providerCode = typeof payload?.error?.status === "string" ? payload.error.status : null;
      console.error("[ai-provider] Gemini 4 Argon request failed", {
        status: response.status,
        providerCode,
        // Truncated provider detail is server-only. Never expose model request or API key.
        error: typeof message === "string" ? message.slice(0, 300) : "unknown",
      });
      throw new AiProviderHttpError("gemini", response.status, providerCode);
    }

    const streamed = await collectGeminiSse(response, model, call);
    const finish = streamed.finish;
    const stopReason =
      finish === "STOP" ? "end_turn" : finish === "MAX_TOKENS" ? "max_tokens" : (finish ?? null);
    const text = streamed.text;
    const um = streamed.usageMetadata;
    const inputTokens = um?.promptTokenCount ?? null;
    const outputTokens =
      um?.candidatesTokenCount == null && um?.thoughtsTokenCount == null
        ? null
        : (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0);
    const totalTokens =
      um?.totalTokenCount ??
      (inputTokens == null && outputTokens == null
        ? null
        : (inputTokens ?? 0) + (outputTokens ?? 0));
    const usage =
      inputTokens == null && outputTokens == null && totalTokens == null
        ? null
        : {
            inputTokens,
            outputTokens,
            totalTokens,
            cachedInputTokens: um?.cachedContentTokenCount ?? null,
            reasoningTokens: um?.thoughtsTokenCount ?? null,
          };
    return { text, stopReason, usage, provider: "gemini", model };
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: call.prompt,
    config: {
      systemInstruction: call.system,
      abortSignal: providerRequestSignal(call),
      httpOptions: { timeout: providerRequestTimeoutMs(call) },
      // Gemini structured JSON output; Zod still validates the parsed result.
      responseMimeType: "application/json",
      ...(call.schema ? { responseSchema: call.schema as never } : {}),
      maxOutputTokens,
    },
  });

  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason ?? null;
  const stopReason =
    finish === "STOP" ? "end_turn" : finish === "MAX_TOKENS" ? "max_tokens" : (finish ?? null);
  const text =
    response.text ??
    candidate?.content?.parts?.map((p) => ("text" in p ? (p.text ?? "") : "")).join("") ??
    "";
  const um = response.usageMetadata;
  const inputTokens = um?.promptTokenCount ?? null;
  const outputTokens =
    um?.candidatesTokenCount == null && um?.thoughtsTokenCount == null
      ? null
      : (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0);
  const totalTokens =
    um?.totalTokenCount ??
    (inputTokens == null && outputTokens == null ? null : (inputTokens ?? 0) + (outputTokens ?? 0));
  const usage =
    inputTokens == null && outputTokens == null && totalTokens == null
      ? null
      : {
          inputTokens,
          outputTokens,
          totalTokens,
          cachedInputTokens: um?.cachedContentTokenCount ?? null,
          reasoningTokens: um?.thoughtsTokenCount ?? null,
        };
  return { text, stopReason, usage, provider: "gemini", model };
}

async function callMistral(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["MISTRAL_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");

  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: call.prompt },
    ],
    max_tokens: call.maxTokens ?? 8192,
    // PromptBeats already asks for a JSON object and performs strict Zod
    // validation afterwards. JSON mode keeps the provider response parseable
    // without coupling our Google-style schema objects to Mistral's schema dialect.
    response_format: { type: "json_object" },
  });

  const send = () =>
    fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      signal: providerRequestSignal(call),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body,
    });

  // A new provider execution requires a new explicit attempt identity. Do not
  // hide an extra dispatch inside one accounted request after a 429.
  call.abortSignal?.throwIfAborted();
  const res = await send();

  if (!res.ok) {
    await observeUsage(
      call,
      await res
        .clone()
        .json()
        .catch(() => null),
    );
    console.error(`[ai-provider] Mistral request failed (${res.status})`);
    if (res.status === 429) {
      throw new Error(
        "This AI model has reached its request limit on the connected Mistral account. Please try another model or try again later.",
      );
    }
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const payload = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const choice = payload.choices?.[0];
  await observeUsage(call, payload);
  const content = choice?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.text ?? "").join("")
        : "";
  const reason = choice?.finish_reason ?? null;
  const stopReason =
    reason === "stop"
      ? "end_turn"
      : reason === "length" || reason === "model_length"
        ? "max_tokens"
        : reason;
  const inputTokens = payload.usage?.prompt_tokens ?? null;
  const outputTokens = payload.usage?.completion_tokens ?? null;
  const totalTokens =
    payload.usage?.total_tokens ??
    (inputTokens == null && outputTokens == null ? null : (inputTokens ?? 0) + (outputTokens ?? 0));
  const usage =
    inputTokens == null && outputTokens == null && totalTokens == null
      ? null
      : { inputTokens, outputTokens, totalTokens };
  return { text, stopReason, usage, provider: "mistral", model };
}
/**
 * OpenAI-compatible Chat Completions transport used by providers that still
 * expose that interface. xAI has a dedicated Responses API path below because
 * current Grok reasoning models need explicit effort and longer timeouts.
 */
async function callOpenAiCompatible(
  providerName: string,
  endpoint: string,
  apiKey: string,
  model: string,
  call: ModelCall,
  useJsonMode: boolean,
): Promise<ModelResult> {
  const res = await fetch(endpoint, {
    method: "POST",
    signal: providerRequestSignal(call),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.prompt },
      ],
      max_tokens: call.maxTokens ?? 8192,
      ...(providerName === "openrouter" && call.reasoningEffort
        ? {
            reasoning:
              (model.startsWith("xiaomi/mimo-v2.6-") || model === "qwen/qwen3.8-flash") &&
              call.reasoningEffort === "none"
                ? { enabled: false }
                : { effort: call.reasoningEffort },
          }
        : {}),
      // GLM finished normally on OpenRouter but repeatedly returned a response
      // that failed our four-field song contract. Request JSON mode for this
      // model only; no retry or extra paid request is performed.
      ...(useJsonMode ||
      (providerName === "openrouter" && model === "z-ai/glm-5.3-flash" && !!call.schema)
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  });

  if (!res.ok) {
    // Do not log provider error bodies: they may echo the prompt or credentials.
    console.error("[ai-provider] upstream_http_error", {
      provider: providerName,
      model,
      status: res.status,
      category:
        res.status === 429
          ? "rate_limit"
          : res.status === 400 || res.status === 422
            ? "invalid_request"
            : res.status === 401 || res.status === 403
              ? "authentication"
              : res.status >= 500
                ? "upstream_failure"
                : "other",
    });
    if (res.status === 429)
      throw new Error("The AI provider rate limit was reached. Please try later.");
    if (res.status === 400 || res.status === 422)
      throw new Error("The AI provider rejected the request parameters. Please contact support.");
    if (res.status === 401 || res.status === 403)
      throw new Error("The AI provider authentication was rejected. Please contact support.");
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const payload = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: { content?: string | Array<{ type?: string; text?: string }> };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };

  const choice = payload.choices?.[0];
  await observeUsage(call, payload);
  const content = choice?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.text ?? "").join("")
        : "";
  const reason = choice?.finish_reason ?? null;
  const stopReason =
    reason === "stop"
      ? "end_turn"
      : reason === "length" || reason === "model_length"
        ? "max_tokens"
        : reason;
  if (providerName === "openrouter" && stopReason === "max_tokens") {
    const completionTokens = payload.usage?.completion_tokens ?? null;
    const reasoningTokens = payload.usage?.completion_tokens_details?.reasoning_tokens ?? null;
    console.warn("[ai-provider] completion_budget_exhausted", {
      model,
      requestedMaxTokens: call.maxTokens ?? 8192,
      completionTokens,
      reasoningTokens,
      visibleTokens:
        completionTokens !== null && reasoningTokens !== null
          ? Math.max(0, completionTokens - reasoningTokens)
          : null,
    });
  }
  const usage = usageEvidence(payload, providerName);
  return { text, stopReason, usage, provider: providerName, model };
}

async function callGroq(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");
  return callOpenAiCompatible(
    "groq",
    "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model,
    call,
    true,
  );
}

/**
 * Streaming transport for the upstream/model combination verified in the
 * isolated OpenRouter test. Do not enable for arbitrary routed providers.
 */
async function callOpenRouterCancellable(
  model: string,
  call: ModelCall,
  apiKey: string,
): Promise<ModelResult> {
  let remoteId: string | null = null;
  let text = "";
  let stopReason: string | null = null;
  let usage: ModelResult["usage"] = null;
  let completed = false;
  const signal = providerRequestSignal(call);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        max_tokens: call.maxTokens ?? 8192,
        response_format: call.schema ? { type: "json_object" } : undefined,
        ...(call.reasoningEffort ? { reasoning: { effort: call.reasoningEffort } } : {}),
        provider: { only: ["OpenAI"], allow_fallbacks: false },
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    if (!res.ok || !res.body) throw new Error("OpenRouter streaming request failed.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            completed = true;
            break;
          }
          let event: any;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }
          if (
            !remoteId &&
            typeof event.id === "string" &&
            /^[A-Za-z0-9_.:-]{1,160}$/.test(event.id)
          )
            remoteId = event.id;
          const choice = event.choices?.[0];
          if (typeof choice?.delta?.content === "string") text += choice.delta.content;
          if (typeof choice?.finish_reason === "string") stopReason = choice.finish_reason;
          if (event.usage) {
            await observeUsage(call, event);
            usage = usageEvidence(event, "openrouter");
          }
        }
        if (completed) break;
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (!call.abortSignal?.aborted) throw error;
  }
  if (call.abortSignal?.aborted) {
    let confirmed = false;
    if (remoteId) {
      for (let i = 0; i < 12; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const status = await fetch(
            `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(remoteId)}`,
            {
              headers: { authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!status.ok) continue;
          const data = ((await status.json()) as any)?.data;
          if (data)
            await observeUsage(call, {
              usage: {
                input_tokens: data.tokens_prompt,
                output_tokens: data.tokens_completion,
                total_cost: data.total_cost,
              },
            });
          if (data?.cancelled === true && data?.provider_name === "OpenAI") {
            confirmed = true;
            break;
          }
        } catch {
          // Metadata is eventually consistent; never claim success on errors.
        }
      }
    }
    await call.onCancellationResult?.(
      confirmed ? "cancelled_upstream_confirmed" : "connection_aborted_unconfirmed",
    );
    throw new Error("Generation cancellation requested.");
  }
  if (!completed) throw new Error("The OpenRouter stream ended without a terminal frame.");
  return {
    text,
    stopReason:
      stopReason === "stop" ? "end_turn" : stopReason === "length" ? "max_tokens" : stopReason,
    usage,
    provider: "openrouter",
    model,
  };
}

async function callOpenRouter(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");
  if (call.abortSignal && model === "openai/gpt-5.6-luna")
    return callOpenRouterCancellable(model, call, apiKey);
  return callOpenAiCompatible(
    "openrouter",
    "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model,
    call,
    false,
  );
}

async function callXai(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["XAI_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");

  // Grok 4.6/4.7 are reasoning models and xAI currently recommends the Responses API
  // with at least a 900s client timeout for non-streaming reasoning requests.
  // PromptBeats also sets reasoning effort explicitly so xAI's higher provider default
  // cannot silently turn ordinary Generator calls into unexpectedly long requests.
  const jsonSchema = call.schema ? toOpenAiJsonSchema(call.schema) : null;
  const reasoningEffort =
    call.reasoningEffort === "none"
      ? "low"
      : call.reasoningEffort === "max"
        ? "xhigh"
        : (call.reasoningEffort ?? "medium");
  const timeoutMs = reasoningEffort === "xhigh" ? 30 * 60 * 1000 : 15 * 60 * 1000;

  let res: Response;
  try {
    res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      signal: call.abortSignal
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), call.abortSignal])
        : AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        max_output_tokens: openAiOutputBudget(call),
        reasoning: { effort: reasoningEffort },
        ...(jsonSchema
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: "promptbeats_response",
                  strict: true,
                  schema: jsonSchema,
                },
              },
            }
          : {}),
      }),
    });
  } catch (error) {
    console.error(
      `[ai-provider] xAI request failed before response (${model})`,
      error instanceof Error ? error.message : String(error),
    );
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  if (!res.ok) {
    await observeUsage(
      call,
      await res
        .clone()
        .json()
        .catch(() => null),
    );
    console.error(`[ai-provider] xAI Responses request failed (${res.status})`);
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const payload = (await res.json()) as {
    id?: string | null;
    status?: string | null;
    model?: string | null;
    incomplete_details?: { reason?: string | null } | null;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens_details?: { reasoning_tokens?: number };
    };
  };

  const text =
    payload.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ?? "";

  const status = payload.status ?? null;
  const incompleteReason = payload.incomplete_details?.reason ?? null;
  const stopReason =
    status === "completed"
      ? "end_turn"
      : status === "incomplete" && incompleteReason === "max_output_tokens"
        ? "max_tokens"
        : (incompleteReason ?? status);

  const inputTokens = payload.usage?.input_tokens ?? null;
  const outputTokens = payload.usage?.output_tokens ?? null;
  const totalTokens =
    payload.usage?.total_tokens ??
    (inputTokens == null && outputTokens == null ? null : (inputTokens ?? 0) + (outputTokens ?? 0));
  const usage =
    inputTokens == null && outputTokens == null && totalTokens == null
      ? null
      : {
          inputTokens,
          outputTokens,
          totalTokens,
          cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? null,
          reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens ?? null,
        };

  return { text, stopReason, usage, provider: "xai", model };
}

function toOpenAiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toOpenAiJsonSchema);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (key === "type" && typeof raw === "string") {
      out[key] = raw.toLowerCase();
    } else {
      out[key] = toOpenAiJsonSchema(raw);
    }
  }

  if (out["type"] === "object") {
    // OpenAI strict Structured Outputs requires object schemas to reject
    // undeclared keys. All PromptBeats schema objects already list their
    // required properties, so this preserves the canonical contract.
    out["additionalProperties"] = false;
  }
  return out;
}

function openAiOutputBudget(call: ModelCall): number {
  const baseline = call.maxTokens ?? 8192;
  // Responses API counts hidden reasoning and visible JSON together against
  // max_output_tokens. Give reasoning calls headroom without changing the
  // canonical PromptBeats visible-output budget or charging unused tokens.
  if (
    call.reasoningEffort === "high" ||
    call.reasoningEffort === "xhigh" ||
    call.reasoningEffort === "max"
  ) {
    return Math.max(baseline * 4, 32768);
  }
  if (call.reasoningEffort === "medium") return Math.max(baseline * 2, 16384);
  return baseline;
}

async function callOpenAI(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");

  const jsonSchema = call.schema ? toOpenAiJsonSchema(call.schema) : null;
  const body = {
    model,
    instructions: call.system,
    input: call.prompt,
    max_output_tokens: openAiOutputBudget(call),
    reasoning: { effort: call.reasoningEffort ?? "medium" },
    ...(jsonSchema
      ? {
          text: {
            format: {
              type: "json_schema",
              name: "promptbeats_response",
              strict: true,
              schema: jsonSchema,
            },
          },
        }
      : {}),
  };

  // The tested model has authoritative background cancellation. Other models
  // retain the historical transport until their background compatibility is
  // verified; a local abort alone must not be called upstream cancellation.
  const cancellableBackground = !!call.abortSignal && model === "gpt-5.6-luna";
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    // Keep initial creation response available even if cancellation is
    // requested concurrently: it contains the ID needed to cancel upstream.
    signal: cancellableBackground
      ? AbortSignal.timeout(providerRequestTimeoutMs(call))
      : providerRequestSignal(call),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(cancellableBackground ? { ...body, background: true, store: true } : body),
  });

  if (!res.ok) {
    await observeUsage(
      call,
      await res
        .clone()
        .json()
        .catch(() => null),
    );
    console.error(`[ai-provider] OpenAI request failed (${res.status})`);
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  let payload = (await res.json()) as {
    id?: string | null;
    status?: string | null;
    model?: string | null;
    incomplete_details?: { reason?: string | null } | null;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    usage?: {
      input_tokens?: number;
      input_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
      };
      output_tokens?: number;
      output_tokens_details?: {
        reasoning_tokens?: number;
      };
      total_tokens?: number;
    };
  };

  if (cancellableBackground) {
    await observeUsage(call, payload);
    const responseId = payload.id;
    if (!responseId || !/^resp_[A-Za-z0-9_-]{1,155}$/.test(responseId))
      throw new Error("OpenAI background response ID was not returned.");
    await call.onRemoteOperationCreated?.("openai", responseId);
    const headers = { authorization: `Bearer ${apiKey}` };
    let done = ["completed", "failed", "incomplete", "cancelled"].includes(payload.status ?? "");
    const deadline = Date.now() + providerRequestTimeoutMs(call);
    while (!done && Date.now() < deadline) {
      if (call.abortSignal?.aborted) {
        const { cancelBackgroundOperation } = await import("@/lib/ai-cancellation-upstream.server");
        const outcome = await cancelBackgroundOperation("openai", responseId, apiKey, {
          onUsageObserved: call.onUsageObserved,
        });
        await call.onCancellationResult?.(outcome.outcome);
        throw new Error("Generation cancellation requested.");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const statusRes = await fetch(
        `https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`,
        { method: "GET", headers, signal: AbortSignal.timeout(15000) },
      );
      if (!statusRes.ok) throw new Error("OpenAI background status could not be retrieved.");
      payload = (await statusRes.json()) as typeof payload;
      await observeUsage(call, payload);
      done = ["completed", "failed", "incomplete", "cancelled"].includes(payload.status ?? "");
    }
    if (call.abortSignal?.aborted) {
      if (payload.status !== "cancelled") {
        const { cancelBackgroundOperation } = await import("@/lib/ai-cancellation-upstream.server");
        const outcome = await cancelBackgroundOperation("openai", responseId, apiKey, {
          onUsageObserved: call.onUsageObserved,
        });
        await call.onCancellationResult?.(outcome.outcome);
      } else {
        await call.onCancellationResult?.("cancelled_upstream_confirmed");
      }
      throw new Error("Generation cancellation requested.");
    }
    if (!done || payload.status !== "completed")
      throw new Error("The OpenAI background generation did not complete successfully.");
  }

  const text =
    payload.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ?? "";

  const status = payload.status ?? null;
  const incompleteReason = payload.incomplete_details?.reason ?? null;
  const stopReason =
    status === "completed"
      ? "end_turn"
      : status === "incomplete" && incompleteReason === "max_output_tokens"
        ? "max_tokens"
        : (incompleteReason ?? status);

  const inputTokens = payload.usage?.input_tokens ?? null;
  const outputTokens = payload.usage?.output_tokens ?? null;
  const totalTokens =
    payload.usage?.total_tokens ??
    (inputTokens == null && outputTokens == null ? null : (inputTokens ?? 0) + (outputTokens ?? 0));
  const usage =
    inputTokens == null && outputTokens == null && totalTokens == null
      ? null
      : {
          inputTokens,
          outputTokens,
          totalTokens,
          cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? null,
          cacheWriteTokens: payload.usage?.input_tokens_details?.cache_write_tokens ?? null,
          reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens ?? null,
        };

  return {
    text,
    stopReason,
    usage,
    provider: "openai",
    // Keep the catalog/request model id stable for access control, analytics and
    // pricing even if OpenAI reports an internal snapshot identifier.
    model,
  };
}

/** Returns a provider-agnostic caller bound to the given model. */
export function modelCaller(
  model: string,
  providerOverride?: string,
  context?: import("./ai-execution.server").ExecutionContext,
): ModelCaller {
  const provider = providerOverride ?? providerOf(model);
  const raw: ModelCaller = (call) => {
    if (provider === "anthropic") return callAnthropic(model, call);
    if (provider === "mistral") return callMistral(model, call);
    if (provider === "groq") return callGroq(model, call);
    if (provider === "openrouter") return callOpenRouter(model, call);
    if (provider === "xai") return callXai(model, call);
    if (provider === "openai") return callOpenAI(model, call);
    if (provider === "gemini") return callGemini(model, call);

    const configs: Record<string, { secret: string; endpoint: string; jsonMode: boolean }> = {
      deepseek: {
        secret: "DEEPSEEK_API_KEY",
        endpoint: "https://api.deepseek.com/chat/completions",
        jsonMode: true,
      },
      together: {
        secret: "TOGETHER_API_KEY",
        endpoint: "https://api.together.xyz/v1/chat/completions",
        jsonMode: true,
      },
      fireworks: {
        secret: "FIREWORKS_API_KEY",
        endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
        jsonMode: true,
      },
      cerebras: {
        secret: "CEREBRAS_API_KEY",
        endpoint: "https://api.cerebras.ai/v1/chat/completions",
        jsonMode: true,
      },
      nvidia: {
        secret: "NVIDIA_API_KEY",
        endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
        jsonMode: true,
      },
    };
    const config = configs[provider];
    if (!config) throw new Error("This AI provider is not supported for PromptBeats generation.");
    const apiKey = process.env[config.secret];
    if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");
    return callOpenAiCompatible(provider, config.endpoint, apiKey, model, call, config.jsonMode);
  };
  if (!context) return raw;
  const tracked: ModelCaller = async (call) => {
    const { trackedCaller } = await import("./ai-execution.server");
    const invoke = trackedCaller(raw, provider, model, context);
    try {
      return await invoke(call);
    } finally {
      tracked.executionId = invoke.executionId;
    }
  };
  return tracked;
}

/**
 * Server-authoritative operation default. The legacy no-argument form maps to
 * Generator so older call sites remain safe during the Phase 1 transition.
 */
export async function getActiveModel(
  operation: AiModelOperation = "generator",
): Promise<AiModelId> {
  return (await getOperationDefaultModel(operation)).providerModelId;
}

export type EffectiveAiModelOption = {
  id: AiModelId;
  label: string;
  provider: string;
};

export type EffectiveAiModelAccess = {
  activeModel: AiModelId;
  defaultModel: AiModelId;
  availableModels: AiModelId[];
  modelOptions: EffectiveAiModelOption[];
  accessMode: "admin" | "inherit" | "custom";
};

async function eligibleModelsForOperation(operation: AiModelOperation) {
  const models = await getInstalledRegistryModels();
  return models.filter((model) => isModelEligibleForOperation(model, operation));
}

function toModelOptions(models: RegistryModel[]): EffectiveAiModelOption[] {
  return models.map((model) => ({
    id: model.providerModelId,
    label: model.displayName,
    provider: model.provider,
  }));
}

export async function getEffectiveModelAccess(
  userId: string,
  operation: AiModelOperation = "generator",
): Promise<EffectiveAiModelAccess> {
  const configuredDefault = await getOperationDefaultModel(operation);
  const supabaseAdmin = await assertAiEligibleUser(userId);

  if (await hasAdminBypass(userId)) {
    const available = await eligibleModelsForOperation(operation);
    return {
      activeModel: configuredDefault.providerModelId,
      defaultModel: configuredDefault.providerModelId,
      availableModels: available.map((model) => model.providerModelId),
      modelOptions: toModelOptions(available),
      accessMode: "admin",
    };
  }

  const { data: override, error: overrideError } = await supabaseAdmin
    .from("user_model_access")
    .select("access_mode, allowed_models")
    .eq("user_id", userId)
    .maybeSingle();
  if (overrideError && overrideError.code !== "42P01") {
    throw new Error("Could not verify AI model access.");
  }

  const access = override as { access_mode?: string; allowed_models?: string[] } | null;

  // Explicit grants continue to control additional selectable models. The
  // configured operation default is a separate global entitlement and is
  // always included, regardless of its access policy.
  if (access?.access_mode === "custom") {
    const requestedIds = sanitizeAllowedModels(access.allowed_models);
    const allowed: RegistryModel[] = [];
    for (const id of requestedIds) {
      const model = await getRegistryModel(id);
      if (!model) continue;
      if (!isModelEligibleForOperation(model, operation)) continue;
      if (model.accessPolicy === "admin_only") continue;
      allowed.push(model);
    }

    const effectiveModels = [
      configuredDefault,
      ...allowed.filter((model) => model.providerModelId !== configuredDefault.providerModelId),
    ];

    return {
      activeModel: configuredDefault.providerModelId,
      defaultModel: configuredDefault.providerModelId,
      availableModels: effectiveModels.map((model) => model.providerModelId),
      modelOptions: toModelOptions(effectiveModels),
      accessMode: "custom",
    };
  }

  // Inherit mode exposes only the global operation default. Its access policy
  // controls manual availability elsewhere, but does not override the admin's
  // global default choice for this operation.
  let inheritedDefault = configuredDefault;
  if (!isModelEligibleForOperation(configuredDefault, operation)) {
    const available = await eligibleModelsForOperation(operation);
    const preferred = available.find(
      (model) => model.providerModelId === DEFAULT_AI_MODEL && model.accessPolicy === "all_users",
    );
    const firstPublic = available.find((model) => model.accessPolicy === "all_users");
    const fallback = preferred ?? firstPublic;
    if (!fallback) throw new Error("No AI model is available for this account.");
    inheritedDefault = fallback;
  }

  return {
    activeModel: inheritedDefault.providerModelId,
    defaultModel: inheritedDefault.providerModelId,
    availableModels: [inheritedDefault.providerModelId],
    modelOptions: toModelOptions([inheritedDefault]),
    accessMode: "inherit",
  };
}

export type ResolvedAiModel = {
  model: AiModelId;
  provider: string;
  reasoningEffort?: ReasoningEffort;
};

export async function resolveAiModelForUser(
  userId: string,
  operation: AiModelOperation,
  requestedModel?: string,
): Promise<ResolvedAiModel> {
  if (requestedModel && (!requestedModel.trim() || requestedModel.length > 240)) {
    throw new Error("Unsupported AI model.");
  }
  const access = await getEffectiveModelAccess(userId, operation);
  const selected = (requestedModel ?? access.defaultModel) as AiModelId;
  if (!(access.availableModels as readonly string[]).includes(selected)) {
    throw new Error("That AI model is not available for this account.");
  }

  const registryModel = await getRegistryModel(selected);
  if (!registryModel || !isModelEligibleForOperation(registryModel, operation)) {
    throw new Error("That AI model is not available for this operation.");
  }

  const reasoningEffort = reasoningForOperation(registryModel, operation);
  return {
    model: registryModel.providerModelId,
    provider: registryModel.provider,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

/** Compatibility wrapper for older call sites; Generator remains the default operation. */
export async function getModelForUser(
  userId: string,
  requestedModel?: string,
  operation: AiModelOperation = "generator",
): Promise<AiModelId> {
  return (await resolveAiModelForUser(userId, operation, requestedModel)).model;
}

/**
 * Legacy admin write path. Until Phase 2 introduces separate controls, changing
 * the old shared active model updates both operation defaults together.
 */
export async function setActiveModel(model: AiModelId, userId: string) {
  const registryModel = await getRegistryModel(model);
  if (
    !registryModel ||
    !isModelEligibleForOperation(registryModel, "generator") ||
    !isModelEligibleForOperation(registryModel, "quality_check")
  ) {
    throw new Error("That AI model cannot be used as both defaults.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const value = { registryId: registryModel.id, model: registryModel.providerModelId };

  for (const key of [
    "ai_model",
    "ai_generator_default_model",
    "ai_quality_check_default_model",
    "ai_tools_default_model",
  ]) {
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key,
        value,
        updated_at: now,
        updated_by: userId,
      } as never,
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
  }
  return { model: registryModel.providerModelId };
}

/** JSON schemas used for provider-side structured output. */
export const SONG_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    tags: { type: "STRING" },
    lyrics: { type: "STRING" },
    note: { type: "STRING" },
  },
  required: ["title", "tags", "lyrics", "note"],
};

export const LYRICS_SECTION_EDIT_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    sectionLabel: { type: "STRING" },
    replacement: { type: "STRING" },
    alternatives: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["sectionLabel", "replacement", "alternatives"],
};

const SUGGESTION_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    explanation: { type: "STRING" },
    actionType: {
      type: "STRING",
      enum: ["add_to_music_style", "vocal_arrangement", "informational"],
    },
    value: { type: "STRING" },
    arrangement: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sectionLabel: { type: "STRING" },
          sectionOccurrenceIndex: { type: "INTEGER" },
          tag: { type: "STRING" },
        },
        required: ["sectionLabel", "sectionOccurrenceIndex", "tag"],
      },
    },
  },
  required: ["title", "explanation", "actionType", "value", "arrangement"],
};

export const QUALITY_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    passed: { type: "BOOLEAN" },
    score: { type: "NUMBER" },
    issues: { type: "ARRAY", items: { type: "STRING" } },
    languageIssues: { type: "ARRAY", items: { type: "STRING" } },
    grammarIssues: { type: "ARRAY", items: { type: "STRING" } },
    singabilityIssues: { type: "ARRAY", items: { type: "STRING" } },
    genreIssues: { type: "ARRAY", items: { type: "STRING" } },
    consistencyIssues: { type: "ARRAY", items: { type: "STRING" } },
    corrections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          field: { type: "STRING", enum: ["title", "tags", "lyrics", "note"] },
          sectionLabel: { type: "STRING" },
          originalText: { type: "STRING" },
          occurrenceIndex: { type: "NUMBER" },
          reason: { type: "STRING" },
          replacementText: { type: "STRING" },
        },
        required: [
          "field",
          "sectionLabel",
          "originalText",
          "occurrenceIndex",
          "reason",
          "replacementText",
        ],
      },
    },
    creativeSuggestions: { type: "ARRAY", items: SUGGESTION_SCHEMA },
    vocalSuggestions: { type: "ARRAY", items: SUGGESTION_SCHEMA },
    productionSuggestions: { type: "ARRAY", items: SUGGESTION_SCHEMA },
  },
  required: [
    "passed",
    "score",
    "issues",
    "languageIssues",
    "grammarIssues",
    "singabilityIssues",
    "genreIssues",
    "consistencyIssues",
    "corrections",
    "creativeSuggestions",
    "vocalSuggestions",
    "productionSuggestions",
  ],
};
