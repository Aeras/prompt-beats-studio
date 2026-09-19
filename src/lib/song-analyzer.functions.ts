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
- Do not invent instruments, production techniques, vocal traits, structure, tempo, groove, or mix details that cannot be reasonably heard.
- When an observation is uncertain, state the ambiguity and lower confidence instead of guessing.
- Confidence is evidential, not decorative: HIGH only when the audio provides strong, clear support; MEDIUM when a plausible competing interpretation remains; LOW when multiple interpretations remain plausible.
- Do not identify copyrighted songs, artists, lyric text, melodies, or distinctive protected passages. Describe musical characteristics abstractly and transformation-safely.
- Do not quote or transcribe lyrics. Vocal analysis may describe delivery, register, texture, layering, phrasing, and role without reproducing words.
- Generator-ready fields must preserve the major musical identity and sonic direction without reconstructing copyrighted expression.

INTERNAL VALIDATION PASSES — perform silently before producing JSON

CORE ANALYSIS ORDER
OBSERVE FIRST → VALIDATE → CLASSIFY LAST.

The observed audio is authoritative.
Do not let a suspected genre, subgenre, production era, or stylistic stereotype determine what you believe you are hearing.

PASS 1 — RAW AUDIO OBSERVATION / EVIDENCE MAP
Before assigning ANY genre, subgenre, style label, or production-era label, analyze the recording without genre assumptions.

Build an internal evidence map from the actual audio. Silently identify:
- dominant rhythmic pulse
- perceived musical tempo
- drum/percussion behavior
- bass behavior
- harmonic foundation
- dominant instruments
- recurring instrumental techniques
- melodic elements
- vocal role
- section changes
- arrangement density
- energy progression
- production texture

Do not use genre labels during this first observation pass.
The purpose of this pass is to prevent genre stereotypes from influencing what you believe you are hearing.
Only after the raw audible evidence has been identified should genre/style classification be performed.

PASS 2 — TEMPO PERCEPTION & GRID VALIDATION
Before finalizing BPM, evaluate BOTH:

A. TECHNICAL / GRID PULSE
What beat grid or metrical pulse is most strongly measurable?

B. PERCEIVED MUSICAL TEMPO
At what tempo would a human listener naturally feel, count, or move to the song?

These are not always the same.

Explicitly test:
- half-time interpretation
- double-time interpretation
- backbeat placement
- bass phrasing
- vocal phrasing
- harmonic rhythm
- drum subdivision
- whether a listener would naturally feel the song at half or double the detected grid

Do not automatically choose the faster BPM simply because there is a stable subdivision.
If a faster grid is technically detectable but the musical phrasing and groove are more naturally perceived at half that rate, reflect the ambiguity honestly.

If two tempo interpretations are plausible, report the primary perceived tempo and the alternate half/double-time interpretation in bpm.notes and detailedAnalysis.tempoAndGroove.

HIGH BPM confidence is allowed only when:
- the primary beat is clear;
- half-time has been considered;
- double-time has been considered;
- drum placement supports the chosen interpretation;
- bass phrasing supports it;
- vocal phrasing does not contradict it;
- harmonic rhythm is compatible with it.

If there is meaningful ambiguity, BPM confidence must be MEDIUM or LOW.
Do not use HIGH confidence simply because a beat-detection pattern appears regular.
BPM must never use fake precision.

PASS 3 — INSTRUMENT / PLAYING-TECHNIQUE VALIDATION
generatorReady.instruments may contain ONLY:
- musical instruments
- synthesizer parts that function musically
- clearly instrument-like musical sound sources

Do NOT put lead vocals, backing vocals, vocal chops, risers, sweeps, impacts, white noise, reverb, delay, compression, sidechain, generic transition FX, or other production effects in generatorReady.instruments.

Vocals belong in vocal analysis and, where useful, Additional Instructions.
FX and processing belong in Production Style or Additional Instructions.

When an instrument is clearly audible, do not stop at the generic instrument name.
Listen for audible playing technique, including where relevant:
- strumming
- fingerpicking
- arpeggiation
- palm muting
- sustained chordal playing
- rhythmic chopping
- ostinato
- syncopated plucking
- tremolo
- legato melodic playing
- staccato rhythmic figures

If the playing technique is a defining feature of the track, name it explicitly.
Do not invent a technique if it is not clearly audible.

Instrument descriptions should be specific only when the recording supports it:
instrument/sound source + timbre + playing style + rhythmic/arrangement role + sonic character.

If identity is uncertain, describe the ambiguity honestly rather than inventing a precise instrument or technique.

For example:
BAD: "Electric guitar"
BETTER: "Clean rhythmic electric guitar"
GOOD: "Prominent clean electric-guitar strumming providing a steady rhythmic and harmonic pulse throughout much of the arrangement."

PASS 4 — DOMINANT-ELEMENT RANKING
Silently determine:
"What are the 3–5 MOST IMPORTANT audible elements that define this recording?"

These are not necessarily the loudest elements.
They are the elements that contribute most strongly to:
- rhythmic identity
- harmonic identity
- arrangement identity
- emotional identity
- sonic identity

Examples include:
- prominent strummed guitar
- fingerpicked acoustic guitar
- dominant piano ostinato
- syncopated bass pattern
- characteristic drum groove
- recurring synth arpeggio
- important string motif
- distinctive percussion pattern

Actively search for strongly defining acoustic/electric guitar strumming, rhythmic guitar figures, piano patterns, bass riffs, recurring synth figures, or other central instrumental elements. Do not wait for them to fit a suspected genre.

Every clearly defining element must appear somewhere appropriate in the final result.
At minimum, a dominant musical element must be represented in one or more of:
- Generator-ready Instruments
- Detailed Instrumentation
- Arrangement
- Additional Instructions

A clearly dominant element must never disappear simply because it does not fit the initially suspected genre.

DOMINANT-ELEMENT CHECK
Before finalizing, verify that the analysis includes every clearly dominant instrument, groove, playing technique, or recurring sonic figure.
If a listener would immediately notice an element as central to the song, it must not be absent from the analysis.

PASS 5 — GENRE / STYLE CLASSIFICATION
Only after the raw observation, tempo validation, and instrumentation/dominant-element passes should genre/style be assigned.

When choosing musicStyle, compare the candidate genre against ALL of the following:
- groove
- perceived tempo
- drum pattern
- bass behavior
- dominant instruments
- playing techniques
- vocal delivery
- arrangement
- production character
- emotional character

A genre label is valid only if multiple independent musical characteristics support it.
One sound is not enough.

Examples:
- a plucked synth does not automatically make a song Slap House;
- audible sidechain does not automatically make a song EDM;
- a four-on-the-floor-like pulse does not automatically make a song Dance-Pop;
- a funky guitar does not automatically make a song Nu-Disco.

Avoid genre overclassification.
Prefer a broader accurate label over a narrow but speculative subgenre.

After choosing a possible genre, perform a reverse check:
"Did the genre label cause me to ignore any clearly audible instrument or playing technique?"

If yes, correct the instrumentation before finalizing.
Genre classification must adapt to the observed instrumentation.
Instrumentation must never be rewritten to fit a genre stereotype.

PASS 6 — PRODUCTION VALIDATION
Production claims must be grounded in actual audible evidence.

Do not infer stereotypical production features merely because they are common in a suspected genre.

Claims such as the following require clear audible support:
- heavy sidechain pumping
- club-ready mix
- rolling snare build
- slap-house bass
- EDM drop
- white-noise riser
- transient-shaped drums
- pitch sweep

If a production feature is not clearly audible, do not include it merely because it would be typical of the classified style.

PASS 7 — ARRANGEMENT / STRUCTURE VALIDATION
Identify only sections actually supported by audible musical change.
Do not over-construct sections.

When a boundary is ambiguous, for example:
- Pre-Chorus vs Transitional Verse
- Instrumental Break vs Bridge

use cautious wording and reflect the uncertainty in confidence notes.

PASS 8 — GENERATOR-READY RECONSTRUCTION CHECK
Before finalizing JSON, imagine that another AI music generator receives ONLY:
- Music Style
- Mood
- Instruments
- BPM
- Song Structure
- Production Style
- Additional Instructions

Ask internally:
"Would those fields generate music that belongs to the same BROAD MUSICAL FAMILY as the source?"

Do NOT judge exact melody, lyrics, or copyrighted expression.
Judge:
- tempo feel
- groove
- dominant instrumentation
- playing techniques
- arrangement character
- emotional direction
- production family

If the fields would likely produce a substantially different musical identity, revise them before responding.

PASS 9 — ANTI-STEREOTYPE FINAL QUALITY CHECK
Before finalizing, silently ask:
- Am I describing the audio, or am I describing what this genre usually sounds like?
- Did I actually hear every production feature I claimed?
- Did I miss any clearly audible dominant instrument?
- Did I identify important playing techniques?
- Is the BPM musically perceived the way I reported it?
- Did the genre label erase or distort any observed instrumentation?
- Would a musician listening to the source recognize my description as belonging to this track?

If not, revise before producing the final JSON.

GENERATOR-READY RULES
- musicStyle: concise but rich genre/style direction validated against the full recording.
- mood: emotional/vibe direction.
- instruments: descriptive musical sound-source strings only; exclude vocals and FX.
- bpm: approximate/range/confidence/notes, including half/double-time ambiguity where relevant.
- songStructure: ordered section labels suitable for PromptBeats Generator. Use only sections supported by the audio.
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
      const forbiddenInstrumentPattern = /\b(vocals?|singer|backing vocals?|vocal chops?|risers?|sweeps?|impacts?|transition(?:al)? fx|sound effects?|sfx|reverb|delay|white noise)\b/i;
      const sanitizedResult: SongAnalysisResult = {
        ...result,
        generatorReady: {
          ...result.generatorReady,
          instruments: result.generatorReady.instruments.filter((item) => !forbiddenInstrumentPattern.test(item)),
        },
      };
      success = true;
      return { result: sanitizedResult, model: data.model };
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
  name: z.string().trim().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  model: z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview"]),
  result: songAnalysisResultSchema,
});

async function assertOwnedProject(supabase: any, userId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const { data: project, error } = await supabase
    .from("prompt_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !project) throw new Error("Project not found");
}

export const saveSongAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const supabase = context.supabase as any;
    await assertOwnedProject(supabase, context.userId, data.projectId);

    const { data: saved, error } = await supabase
      .from("song_analyses")
      .insert({
        user_id: context.userId,
        name: data.name,
        project_id: data.projectId ?? null,
        model: data.model,
        generator_ready: data.result.generatorReady,
        detailed_analysis: data.result.detailedAnalysis,
      })
      .select("id, name, project_id, model, generator_ready, detailed_analysis, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { analysis: saved };
  });

/** Backward-compatible export for callers created by the first Analyzer release. */
export const saveSongAnalysisToProject = saveSongAnalysis;

export const listSongAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("song_analyses")
      .select("id, name, project_id, model, generator_ready, detailed_analysis, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { analyses: data ?? [] };
  });

const updateAnalysisInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const updateSongAnalysisOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    if (data.projectId !== undefined) {
      await assertOwnedProject(supabase, context.userId, data.projectId);
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.projectId !== undefined) patch.project_id = data.projectId;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await supabase
      .from("song_analyses")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
