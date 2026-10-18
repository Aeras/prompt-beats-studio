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
  } | null;
  /** The provider that actually served this request. */
  provider: string;
  /** The model that actually served this request. */
  model: string;
};

export type ModelCaller = (call: ModelCall) => Promise<ModelResult>;

function providerRequestTimeoutMs(call: ModelCall) {
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
  return AbortSignal.timeout(providerRequestTimeoutMs(call));
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
    if (!rawData || rawData === "[DONE]") return;
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
      return;
    }

    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      text += event.delta.text ?? "";
      return;
    }

    if (event.type === "message_delta") {
      reason = event.delta?.stop_reason ?? reason;
      outputTokens = event.usage?.output_tokens ?? outputTokens;
      return;
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
        if (data) processEvent(data);
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
      if (data) processEvent(data);
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
      : {
          inputTokens,
          outputTokens,
          totalTokens:
            inputTokens == null && outputTokens == null
              ? null
              : (inputTokens ?? 0) + (outputTokens ?? 0),
          cachedInputTokens,
          cacheWriteTokens,
        };

  console.info("[ai-provider] Anthropic stream completed", {
    model,
    stopReason,
    durationMs: Date.now() - startedAt,
    requestId: res.headers.get("request-id") ?? res.headers.get("x-request-id"),
  });

  return { text, stopReason, usage, provider: "anthropic", model };
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

  // Gemini 4 Argon requires a newer SDK than the version currently pinned by
  // PromptBeats. Use the stable REST generateContent contract directly so the
  // model can be enabled without upgrading the whole Gemini dependency surface.
  if (isArgon) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(timeoutMs),
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
    const payload = (await response.json()) as any;
    if (!response.ok) {
      const message = payload?.error?.message;
      console.error("[ai-provider] Gemini 4 Argon request failed", {
        status: response.status,
        error: typeof message === "string" ? message.slice(0, 300) : "unknown",
      });
      throw new Error(
        typeof message === "string" && message
          ? message
          : "The Gemini 4 Argon service is temporarily unavailable.",
      );
    }

    const candidate = payload?.candidates?.[0];
    const finish = candidate?.finishReason ?? null;
    const stopReason =
      finish === "STOP" ? "end_turn" : finish === "MAX_TOKENS" ? "max_tokens" : (finish ?? null);
    const text = (candidate?.content?.parts ?? [])
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    const um = payload?.usageMetadata;
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
      : { inputTokens, outputTokens, totalTokens };
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

  let res = await send();
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1500;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    res = await send();
  }

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[ai-provider] Mistral request failed (${res.status})`, errorBody.slice(0, 1000));
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
      ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(
      `[ai-provider] ${providerName} request failed (${res.status})`,
      errorBody.slice(0, 1000),
    );
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const payload = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: { content?: string | Array<{ type?: string; text?: string }> };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const choice = payload.choices?.[0];
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

async function callOpenRouter(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");
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
      signal: AbortSignal.timeout(timeoutMs),
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
    const errorBody = await res.text();
    console.error(
      `[ai-provider] xAI Responses request failed (${res.status})`,
      errorBody.slice(0, 2000),
    );
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const payload = (await res.json()) as {
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

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: providerRequestSignal(call),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[ai-provider] OpenAI request failed (${res.status})`, errorBody.slice(0, 1000));
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const payload = (await res.json()) as {
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
export function modelCaller(model: string, providerOverride?: string): ModelCaller {
  const provider = providerOverride ?? providerOf(model);
  return (call) => {
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
