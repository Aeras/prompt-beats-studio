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

import { AI_MODELS, AI_MODEL_IDS, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";

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

export function providerOf(model: string) {
  return AI_MODELS.find((m) => m.id === model)?.provider ?? "gemini";
}

function isAiModelId(model: string): model is AiModelId {
  return AI_MODEL_IDS.includes(model as AiModelId);
}

function sanitizeAllowedModels(models: string[] | null | undefined): AiModelId[] {
  const seen = new Set<string>();
  const allowed: AiModelId[] = [];
  for (const model of models ?? []) {
    if (!isAiModelId(model) || seen.has(model)) continue;
    seen.add(model);
    allowed.push(model);
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
  const { data: isAdmin } = await supabaseAdmin.rpc(
    "_has_role_internal",
    {
      _user_id: userId,
      _role: "admin",
    },
  );
  return isAdmin === true;
}

async function callAnthropic(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
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
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[ai-provider] Anthropic request failed (${res.status})`, body.slice(0, 1000));
    throw new Error("The AI provider is temporarily unavailable. Please try again later.");
  }

  const payload = (await res.json()) as {
    stop_reason?: string | null;
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text =
    payload.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? "";
  const reason = payload.stop_reason ?? null;
  const stopReason = reason === "stop_sequence" ? "end_turn" : reason;
  const inputTokens = payload.usage?.input_tokens ?? null;
  const outputTokens = payload.usage?.output_tokens ?? null;
  const usage =
    inputTokens == null && outputTokens == null
      ? null
      : { inputTokens, outputTokens, totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) };
  return { text, stopReason, usage, provider: "anthropic", model };
}

async function callGemini(model: string, call: ModelCall): Promise<ModelResult> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("The AI service is not configured. Please try again later.");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: call.prompt,
    config: {
      systemInstruction: call.system,
      // Gemini structured JSON output; Zod still validates the parsed result.
      responseMimeType: "application/json",
      ...(call.schema ? { responseSchema: call.schema as never } : {}),
      maxOutputTokens: (call.maxTokens ?? 8192) * 2,
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
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body,
    });

  let res = await send();
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1500;
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
    reason === "stop" ? "end_turn" : reason === "length" || reason === "model_length" ? "max_tokens" : reason;
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
 * OpenAI-compatible chat completions call shared by Groq, OpenRouter and xAI.
 * The PromptBeats system prompt, user prompt and downstream Zod validation are
 * identical to every other provider; only transport differs.
 */
async function callOpenAiCompatible(
  providerName: "groq" | "openrouter" | "xai",
  endpoint: string,
  apiKey: string,
  model: string,
  call: ModelCall,
  useJsonMode: boolean,
): Promise<ModelResult> {
  const res = await fetch(endpoint, {
    method: "POST",
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
  // xAI supports OpenAI-compatible Chat Completions and JSON object mode.
  return callOpenAiCompatible(
    "xai",
    "https://api.x.ai/v1/chat/completions",
    apiKey,
    model,
    call,
    true,
  );
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
  if (call.reasoningEffort === "high" || call.reasoningEffort === "xhigh" || call.reasoningEffort === "max") {
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
    model: payload.model ?? model,
  };
}

/** Returns a provider-agnostic caller bound to the given model. */
export function modelCaller(model: string): ModelCaller {
  const provider = providerOf(model) as string;
  return (call) => {
    if (provider === "anthropic") return callAnthropic(model, call);
    if (provider === "mistral") return callMistral(model, call);
    if (provider === "groq") return callGroq(model, call);
    if (provider === "openrouter") return callOpenRouter(model, call);
    if (provider === "xai") return callXai(model, call);
    if (provider === "openai") return callOpenAI(model, call);
    return callGemini(model, call);
  };
}

/**
 * Server-authoritative active model. Read with the privileged client from a
 * table that is unreachable from the browser, so a client can never influence
 * which provider is used.
 */
export async function getActiveModel(): Promise<AiModelId> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_model")
      .maybeSingle();
    const value = (data as { value?: { model?: string } } | null)?.value;
    const model = value?.model;
    if (model && AI_MODELS.some((m) => m.id === model)) return model as AiModelId;
    await supabaseAdmin.from("app_settings").upsert(
      {
        key: "ai_model",
        value: { model: DEFAULT_AI_MODEL },
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "key" },
    );
  } catch {
    /* fall back to the default below */
  }
  return DEFAULT_AI_MODEL;
}

export type EffectiveAiModelAccess = {
  activeModel: AiModelId;
  defaultModel: AiModelId;
  availableModels: AiModelId[];
  accessMode: "admin" | "inherit" | "custom";
};

export async function getEffectiveModelAccess(userId: string): Promise<EffectiveAiModelAccess> {
  const active = await getActiveModel();
  const supabaseAdmin = await assertAiEligibleUser(userId);
  if (await hasAdminBypass(userId)) {
    return {
      activeModel: active,
      defaultModel: active,
      availableModels: [...AI_MODEL_IDS],
      accessMode: "admin",
    };
  }

  const { data: override, error: overrideError } = await supabaseAdmin
    .from("user_model_access")
    .select("access_mode, allowed_models")
    .eq("user_id", userId)
    .maybeSingle();
  if (overrideError) {
    if (overrideError.code === "42P01") {
      return {
        activeModel: active,
        defaultModel: active,
        availableModels: [active],
        accessMode: "inherit",
      };
    }
    throw new Error("Could not verify AI model access.");
  }
  const access = override as { access_mode?: string; allowed_models?: string[] } | null;
  if (access?.access_mode !== "custom") {
    return {
      activeModel: active,
      defaultModel: active,
      availableModels: [active],
      accessMode: "inherit",
    };
  }
  const allowed = sanitizeAllowedModels(access.allowed_models);
  if (!allowed.length) throw new Error("No AI model is available for this account.");
  return {
    activeModel: active,
    defaultModel: allowed.includes(active) ? active : (allowed[0] as AiModelId),
    availableModels: allowed,
    accessMode: "custom",
  };
}

/** Resolve a provider model without trusting a browser-supplied model id. */
export async function getModelForUser(userId: string, requestedModel?: string): Promise<AiModelId> {
  if (requestedModel && !isAiModelId(requestedModel)) throw new Error("Unsupported AI model.");
  const access = await getEffectiveModelAccess(userId);
  if (!requestedModel) return access.defaultModel;
  if (!(access.availableModels as readonly string[]).includes(requestedModel)) {
    throw new Error("That AI model is not available for this account.");
  }
  return requestedModel as AiModelId;
}

/** Admin-only write path; the caller must already have verified admin rights. */
export async function setActiveModel(model: AiModelId, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    {
      key: "ai_model",
      value: { model },
      updated_at: new Date().toISOString(),
      updated_by: userId,
    } as never,
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
  return { model };
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
