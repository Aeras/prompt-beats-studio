import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AUDIO_MODEL_LAB_MAX_FILE_BYTES = 14 * 1024 * 1024;

export const AUDIO_MODEL_LAB_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "gemini" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "gemini" },
  { id: "gemini-4-argon", label: "Gemini 4 Argon", provider: "gemini" },
] as const;

export type AudioModelLabModelId = (typeof AUDIO_MODEL_LAB_MODELS)[number]["id"];

const modelSchema = z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-4-argon"]);

const inputSchema = z.object({
  model: modelSchema,
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(120),
  audioBase64: z.string().min(1).max(21_000_000),
});

const ANALYSIS_PROMPT = `You are performing a direct, evidence-first analysis of a complete music track from the audio itself.

Do not use outside knowledge about the artist or title. Do not invent details that are not audible. When uncertain, say so explicitly. Use the same headings and order below. Give concise but musically specific evidence for every important conclusion.

MUSIC STYLE / GENRE
- Primary genre/style
- Subgenre(s) and influences
- Confidence and audible evidence

MOOD / CHARACTER
- Core mood, emotional arc and energy

TEMPO / GROOVE
- Estimated BPM
- Confidence
- Possible half-time/double-time interpretation
- Meter and groove description

KEY / TONALITY
- Estimated key/tonal center if discernible
- Confidence and uncertainty

SONG STRUCTURE
- Full section sequence with approximate MM:SS timestamps
- Note any intro, verses, pre-choruses, choruses, bridge, breakdown, interlude, solo, outro, or other sections actually heard

INSTRUMENTS
- List the main instruments/sound sources
- For each: role, timbre/technique and confidence
- Distinguish acoustic/electric/synthesized/programmed sources when possible

VOCALS
- Vocal presence and type
- Delivery: melodic singing, conversational singing, sing-rap, rap, spoken word, mixed, or uncertain
- Register/timbre, harmonies/backing vocals, notable processing

PRODUCTION / MIX
- Drum source and character
- Bass source and character
- Acoustic/electronic balance
- Spatial effects, ambience, saturation, filtering, stereo traits and other audible production details

ARRANGEMENT CHANGES
- Describe the most important changes between sections and how the track builds/releases energy

EVIDENCE / UNCERTAINTY
- Bullet the strongest observations you are confident about
- Bullet every material point that remains uncertain or could have an alternative interpretation

FINAL MUSIC DNA
- One compact generator-ready paragraph describing the track's musical identity, instrumentation, tempo feel, vocal character, production and arrangement.

Do not add a transcript of lyrics unless a tiny lyric fragment is strictly necessary to distinguish vocal delivery. Do not identify the song or artist from memory.`;

async function requireAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("current_user_is_admin_level");
  if (error || data !== true) throw new Error("Audio Model Lab is restricted to administrators.");
}

async function analyzeWithGemini(model: string, audioBase64: string, mimeType: string) {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  if (model === "gemini-4-argon") {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(15 * 60 * 1000),
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: ANALYSIS_PROMPT },
                { inlineData: { data: audioBase64, mimeType } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 32_768,
            thinkingConfig: { thinkingLevel: "medium" },
          },
        }),
      },
    );
    const payload = (await response.json()) as any;
    if (!response.ok) {
      const message = payload?.error?.message;
      throw new Error(
        typeof message === "string" && message
          ? message
          : "Gemini 4 Argon analysis failed.",
      );
    }

    const text = (payload?.candidates?.[0]?.content?.parts ?? [])
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (!text) throw new Error("Gemini 4 Argon returned an empty analysis.");
    return text;
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: ANALYSIS_PROMPT },
          { inlineData: { data: audioBase64, mimeType } },
        ],
      },
    ],
    config: {
      temperature: 0.15,
      maxOutputTokens: 8192,
    },
  });

  const text = response.text?.trim() ?? "";
  if (!text) throw new Error("The Gemini model returned an empty analysis.");
  return text;
}

export const getAudioModelLabAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    return { allowed: true as const };
  });

export const analyzeAudioWithLabModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);

    const estimatedBytes = Math.floor((data.audioBase64.length * 3) / 4);
    if (estimatedBytes > AUDIO_MODEL_LAB_MAX_FILE_BYTES) {
      throw new Error("Audio file is too large for the direct-model lab.");
    }

    const startedAt = Date.now();
    const label =
      data.model === "gemini-3.8-flash"
        ? "Gemini 3.8 Flash"
        : data.model === "gemini-3.1-pro-preview"
          ? "Gemini 3.1 Pro"
          : "Gemini 4 Argon";
    const text = await analyzeWithGemini(data.model, data.audioBase64, data.mimeType);
    return {
      model: data.model,
      label,
      provider: "Google Gemini",
      providerModelId: data.model,
      text,
      durationMs: Date.now() - startedAt,
    };
  });
