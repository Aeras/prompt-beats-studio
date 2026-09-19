import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordAiUsage } from "@/lib/ai-usage.server";

export const SONG_ANALYZER_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
] as const;

export const DEFAULT_SONG_ANALYZER_MODEL = "gemini-3.8-flash";
export const SONG_ANALYZER_MAX_FILE_BYTES = 15 * 1024 * 1024;

const supportedMimeTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
] as const;

const confidenceSchema = z.enum(["high", "medium", "low"]);

const bpmSchema = z.object({
  approximate: z.number().min(20).max(300).nullable(),
  rangeMin: z.number().min(20).max(300).nullable(),
  rangeMax: z.number().min(20).max(300).nullable(),
  confidence: confidenceSchema,
  notes: z.string().trim().max(1000),
}).superRefine((value, ctx) => {
  if (value.rangeMin != null && value.rangeMax != null && value.rangeMin > value.rangeMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid BPM range" });
  }
});

const uncertainObservationSchema = z.object({
  observation: z.string().trim().min(1).max(2000),
  confidence: confidenceSchema,
});

export const songAnalysisResultSchema = z.object({
  generatorReady: z.object({
    musicStyle: z.string().trim().min(1).max(4000),
    mood: z.string().trim().min(1).max(2000),
    instruments: z.array(z.string().trim().min(1).max(1000)).max(30),
    bpm: bpmSchema,
    songStructure: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
    productionStyle: z.string().trim().min(1).max(4000),
    additionalInstructions: z.string().trim().max(4000),
  }),
  detailedAnalysis: z.object({
    genreAndStyle: z.string().trim().min(1).max(5000),
    moodAndEmotionalArc: z.string().trim().min(1).max(5000),
    tempoAndGroove: z.string().trim().min(1).max(5000),
    instrumentation: z.array(uncertainObservationSchema).max(40),
    arrangement: z.string().trim().min(1).max(6000),
    songStructure: z.string().trim().min(1).max(5000),
    vocals: z.string().trim().min(1).max(5000),
    productionAndMix: z.array(uncertainObservationSchema).max(40),
    dynamicsAndEnergy: z.string().trim().min(1).max(5000),
    notableCharacteristics: z.array(z.string().trim().min(1).max(2000)).max(30),
    confidenceAndUncertaintyNotes: z.array(z.string().trim().min(1).max(2000)).max(30),
  }),
});

export type SongAnalysisResult = z.infer<typeof songAnalysisResultSchema>;

const ANALYZER_SYSTEM_PROMPT = `
You are PromptBeats AI Song Analyzer, an expert music analyst and producer.

Analyze only what is supported by the supplied audio. Your job is to convert an existing song recording into:
1) generator-ready musical direction that can be edited and reused in PromptBeats, and
2) a detailed, audio-grounded song analysis.

NON-NEGOTIABLE GROUNDING RULES
- Do not invent instruments, production techniques, vocal traits, structure, tempo, or mix details that cannot be reasonably heard.
- When an observation is uncertain, say so and lower confidence instead of guessing.
- BPM must never use fake precision. Use approximate when stable; use a range when tempo is ambiguous, changing, rubato, half/double-time uncertain, or otherwise unclear.
- Instrument descriptions should be specific when the recording supports it: instrument + timbre + playing style + rhythmic/arrangement role + sonic character. Prefer descriptions such as "Warm fingerpicked steel-string acoustic guitar performing steady arpeggiated figures" over generic labels.
- Distinguish clearly audible instrumentation from uncertain or layered sounds.
- Do not identify copyrighted songs, artists, lyric text, melodies, or distinctive protected passages. Describe musical characteristics abstractly and transformation-safely.
- Do not quote or transcribe lyrics. Vocal analysis may describe delivery, register, texture, layering, phrasing, and role without reproducing words.
- Generator-ready fields must be useful musical directions, not a reconstruction of copyrighted expression.

GENERATOR-READY RULES
- musicStyle: concise but rich genre/style direction.
- mood: emotional/vibe direction.
- instruments: an array of descriptive instrument/sonic-role strings.
- bpm: approximate/range/confidence/notes.
- songStructure: ordered section labels suitable for PromptBeats Generator, e.g. ["Intro","Verse 1","Pre-Chorus","Chorus","Verse 2","Chorus","Bridge","Final Chorus","Outro"]. Use only sections supported by the audio.
- productionStyle: production, mix, space, texture, stereo, dynamics and aesthetic direction.
- additionalInstructions: useful recreation guidance that remains abstract and copyright-safe.

DETAILED ANALYSIS
Cover Genre & Style, Mood & Emotional Arc, Tempo & Groove, Instrumentation, Arrangement, Song Structure, Vocals, Production & Mix, Dynamics & Energy, Notable Characteristics, and explicit Confidence / Uncertainty Notes.

Return only the structured JSON requested by the schema.
`.trim();

const ANALYZER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    generatorReady: {
      type: "OBJECT",
      properties: {
        musicStyle: { type: "STRING" },
        mood: { type: "STRING" },
        instruments: { type: "ARRAY", items: { type: "STRING" } },
        bpm: {
          type: "OBJECT",
          properties: {
            approximate: { type: "NUMBER", nullable: true },
            rangeMin: { type: "NUMBER", nullable: true },
            rangeMax: { type: "NUMBER", nullable: true },
            confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            notes: { type: "STRING" },
          },
          required: ["approximate", "rangeMin", "rangeMax", "confidence", "notes"],
        },
        songStructure: { type: "ARRAY", items: { type: "STRING" } },
        productionStyle: { type: "STRING" },
        additionalInstructions: { type: "STRING" },
      },
      required: ["musicStyle", "mood", "instruments", "bpm", "songStructure", "productionStyle", "additionalInstructions"],
    },
    detailedAnalysis: {
      type: "OBJECT",
      properties: {
        genreAndStyle: { type: "STRING" },
        moodAndEmotionalArc: { type: "STRING" },
        tempoAndGroove: { type: "STRING" },
        instrumentation: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              observation: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            },
            required: ["observation", "confidence"],
          },
        },
        arrangement: { type: "STRING" },
        songStructure: { type: "STRING" },
        vocals: { type: "STRING" },
        productionAndMix: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              observation: { type: "STRING" },
              confidence: { type: "STRING", enum: ["high", "medium", "low"] },
            },
            required: ["observation", "confidence"],
          },
        },
        dynamicsAndEnergy: { type: "STRING" },
        notableCharacteristics: { type: "ARRAY", items: { type: "STRING" } },
        confidenceAndUncertaintyNotes: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: [
        "genreAndStyle",
        "moodAndEmotionalArc",
        "tempoAndGroove",
        "instrumentation",
        "arrangement",
        "songStructure",
        "vocals",
        "productionAndMix",
        "dynamicsAndEnergy",
        "notableCharacteristics",
        "confidenceAndUncertaintyNotes",
      ],
    },
  },
  required: ["generatorReady", "detailedAnalysis"],
};

async function requireAdmin(context: { supabase: any }) {
  const { data: isAdmin, error } = await context.supabase.rpc("current_user_has_role", { _role: "admin" });
  if (error || isAdmin !== true) throw new Error("Not allowed");
}

function normalizedUsage(payload: any) {
  const usage = payload?.usageMetadata;
  if (!usage) return null;
  const inputTokens = usage.promptTokenCount ?? null;
  const outputTokens =
    usage.candidatesTokenCount == null && usage.thoughtsTokenCount == null
      ? null
      : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const totalTokens =
    usage.totalTokenCount ??
    (inputTokens == null && outputTokens == null ? null : (inputTokens ?? 0) + (outputTokens ?? 0));
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: usage.cachedContentTokenCount ?? null,
    reasoningTokens: usage.thoughtsTokenCount ?? null,
  };
}

const analyzeInput = z.object({
  audioBase64: z.string().min(1).max(21_500_000),
  mimeType: z.enum(supportedMimeTypes),
  model: z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview"]).default(DEFAULT_SONG_ANALYZER_MODEL),
});

export const getSongAnalyzerAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    return {
      allowed: true as const,
      models: SONG_ANALYZER_MODELS,
      defaultModel: DEFAULT_SONG_ANALYZER_MODEL,
      maxFileBytes: SONG_ANALYZER_MAX_FILE_BYTES,
      supportedMimeTypes,
    };
  });

export const analyzeSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => analyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    const bytes = Buffer.from(data.audioBase64, "base64");
    if (!bytes.length || bytes.byteLength > SONG_ANALYZER_MAX_FILE_BYTES) {
      throw new Error("Audio file exceeds the 15 MB Analyzer limit.");
    }

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Gemini API is not configured");

    let usage: ReturnType<typeof normalizedUsage> = null;
    let success = false;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(data.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ANALYZER_SYSTEM_PROMPT }] },
            contents: [{
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: data.mimeType,
                    data: data.audioBase64,
                  },
                },
                {
                  text: "Analyze the supplied complete song recording using the canonical PromptBeats Analyzer rules. Return only schema-compliant JSON.",
                },
              ],
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: ANALYZER_RESPONSE_SCHEMA,
              maxOutputTokens: 8192,
              temperature: 0.2,
            },
          }),
        },
      );

      const payload = await response.json() as any;
      usage = normalizedUsage(payload);
      if (!response.ok) {
        throw new Error(payload?.error?.message || `Gemini analysis failed (${response.status})`);
      }

      const candidate = payload?.candidates?.[0];
      const finishReason = candidate?.finishReason ?? null;
      if (finishReason && finishReason !== "STOP") {
        throw new Error(`Gemini analysis stopped before completion: ${finishReason}`);
      }
      const text = (candidate?.content?.parts ?? [])
        .map((part: any) => typeof part?.text === "string" ? part.text : "")
        .join("")
        .trim();
      if (!text) throw new Error("Gemini returned no analysis");

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Gemini returned invalid Analyzer JSON");
      }
      const result = songAnalysisResultSchema.parse(parsed);
      success = true;
      return { result, model: data.model };
    } finally {
      await recordAiUsage({
        userId: context.userId,
        provider: "gemini",
        model: data.model,
        operation: "song_analysis",
        usage,
        success,
      });
    }
  });

const saveAnalysisInput = z.object({
  projectId: z.string().uuid(),
  model: z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview"]),
  result: songAnalysisResultSchema,
});

export const saveSongAnalysisToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const supabase = context.supabase as any;
    const { data: project, error: projectError } = await supabase
      .from("prompt_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (projectError || !project) throw new Error("Project not found");

    const { data: saved, error } = await supabase
      .from("song_analyses")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        model: data.model,
        generator_ready: data.result.generatorReady,
        detailed_analysis: data.result.detailedAnalysis,
      })
      .select("id, project_id, model, generator_ready, detailed_analysis, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { analysis: saved };
  });

export const listSongAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("song_analyses")
      .select("id, project_id, model, generator_ready, detailed_analysis, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { analyses: data ?? [] };
  });

export const deleteSongAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase.from("song_analyses").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
