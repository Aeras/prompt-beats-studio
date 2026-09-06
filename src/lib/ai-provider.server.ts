/**
 * Provider/model abstraction for the AI pipeline.
 *
 * The whole application pipeline (Generate → Quality Check → optional manual
 * Repair → post-repair Quality Check) lives in `ai.functions.ts` and is shared
 * by every provider. Only the raw model call differs and lives here.
 *
 * API keys are read from server-side environment variables inside the call and
 * never leave the server.
 */
import { GoogleGenAI } from "@google/genai";

import { AI_MODELS, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";

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
};

export type ModelCaller = (call: ModelCall) => Promise<ModelResult>;

function providerOf(model: string) {
  return AI_MODELS.find((m) => m.id === model)?.provider ?? "gemini";
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

  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);

  const payload = (await res.json()) as {
    stop_reason?: string | null;
    content?: { type: string; text?: string }[];
  };
  const text =
    payload.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? "";
  const reason = payload.stop_reason ?? null;
  const stopReason = reason === "stop_sequence" ? "end_turn" : reason;
  return { text, stopReason };
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
  return { text, stopReason };
}

/** Returns a provider-agnostic caller bound to the given model. */
export function modelCaller(model: string): ModelCaller {
  const provider = providerOf(model);
  return (call) => (provider === "anthropic" ? callAnthropic(model, call) : callGemini(model, call));
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

/** Admin-only write path; the caller must already have verified admin rights. */
export async function setActiveModel(model: AiModelId, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("app_settings" as never)
    .upsert(
      { key: "ai_model", value: { model }, updated_at: new Date().toISOString(), updated_by: userId } as never,
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
  ],
};
