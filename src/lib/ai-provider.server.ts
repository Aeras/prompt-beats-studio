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

export type ModelCall = {
  /** System instruction shared by all providers. */
  system: string;
  /** User prompt shared by all providers. */
  prompt: string;
  /** Output token budget. */
  maxTokens?: number;
  /** Optional structured-output JSON schema (used where the provider supports it). */
  schema?: Record<string, unknown>;
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
    .from("profile_private" as never)
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
    "_has_role_internal" as never,
    {
      _user_id: userId,
      _role: "admin",
    } as never,
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

/** Returns a provider-agnostic caller bound to the given model. */
export function modelCaller(model: string): ModelCaller {
  const provider = providerOf(model);
  return (call) =>
    provider === "anthropic" ? callAnthropic(model, call) : callGemini(model, call);
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
      .from("app_settings" as never)
      .select("value")
      .eq("key", "ai_model")
      .maybeSingle();
    const value = (data as { value?: { model?: string } } | null)?.value;
    const model = value?.model;
    if (model && AI_MODELS.some((m) => m.id === model)) return model as AiModelId;
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
    .from("user_model_access" as never)
    .select("access_mode, allowed_models")
    .eq("user_id", userId)
    .maybeSingle();
  if (overrideError) {
    // Backward compatibility while the additive migration is being rolled
    // out; all other database failures fail closed rather than broadening
    // model access.
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
    defaultModel: allowed.includes(active) ? active : allowed[0],
    availableModels: allowed,
    accessMode: "custom",
  };
}

/** Resolve a provider model without trusting a browser-supplied model id. */
export async function getModelForUser(userId: string, requestedModel?: string): Promise<AiModelId> {
  if (requestedModel && !isAiModelId(requestedModel)) throw new Error("Unsupported AI model.");
  const access = await getEffectiveModelAccess(userId);
  if (!requestedModel) return access.defaultModel;
  if (!access.availableModels.includes(requestedModel)) {
    throw new Error("That AI model is not available for this account.");
  }
  return requestedModel;
}

/** Admin-only write path; the caller must already have verified admin rights. */
export async function setActiveModel(model: AiModelId, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_settings" as never).upsert(
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
