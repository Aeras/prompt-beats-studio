import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AUDIO_MODEL_LAB_MAX_FILE_BYTES = 14 * 1024 * 1024;

export const AUDIO_MODEL_LAB_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "gemini" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "gemini" },
  { id: "qwen-3.8-omni-flash", label: "Qwen 3.8 Omni Flash", provider: "nexos" },
] as const;

export type AudioModelLabModelId = (typeof AUDIO_MODEL_LAB_MODELS)[number]["id"];

const modelSchema = z.enum([
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "qwen-3.8-omni-flash",
]);

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

function extensionForAudio(fileName: string, mimeType: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (["mp3", "wav", "flac", "ogg", "aac", "m4a", "webm", "opus"].includes(ext)) return ext;
  const subtype = mimeType.toLowerCase().split("/")[1]?.split(";")[0] ?? "";
  if (subtype === "mpeg") return "mp3";
  if (subtype === "x-m4a") return "m4a";
  return subtype || "mp3";
}

async function resolveNexosQwenModelId() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_models" as never)
    .select("provider_model_id,display_name")
    .eq("provider", "nexos");
  if (error) throw new Error("Could not read the installed Nexos models.");

  const rows = (data ?? []) as Array<{ provider_model_id?: string; display_name?: string }>;
  const exact = rows.find(
    (row) => String(row.display_name ?? "").trim().toLowerCase() === "qwen 3.8 omni flash",
  );
  const fallback = rows.find((row) => {
    const value = `${row.display_name ?? ""} ${row.provider_model_id ?? ""}`.toLowerCase();
    return value.includes("qwen") && value.includes("3.8") && value.includes("omni") && value.includes("flash");
  });
  const id = exact?.provider_model_id ?? fallback?.provider_model_id;
  if (!id) throw new Error("Qwen 3.8 Omni Flash is not installed from Nexos AI.");
  return String(id);
}

async function analyzeWithGemini(model: string, audioBase64: string, mimeType: string) {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

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

async function analyzeWithNexosQwen(
  audioBase64: string,
  mimeType: string,
  fileName: string,
) {
  const apiKey = process.env["NEXOS_API_KEY"]?.trim();
  if (!apiKey) throw new Error("NEXOS_API_KEY is not configured.");
  const modelId = await resolveNexosQwenModelId();
  const format = extensionForAudio(fileName, mimeType);

  const response = await fetch("https://api.nexos.ai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(7 * 60 * 1000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ANALYSIS_PROMPT },
            {
              type: "input_audio",
              input_audio: {
                data: audioBase64,
                format,
              },
            },
          ],
        },
      ],
      temperature: 0.15,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    console.warn("[audio-model-lab] Nexos audio request failed", {
      status: response.status,
      model: modelId,
      body,
    });
    if (response.status === 400 || response.status === 415 || response.status === 422) {
      throw new Error(
        `Nexos rejected direct audio input for this Qwen route (HTTP ${response.status}).`,
      );
    }
    throw new Error(`Nexos audio analysis failed (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string | Array<{ type?: string; text?: string }> };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content.trim()
      : Array.isArray(content)
        ? content.map((part) => part.text ?? "").join("").trim()
        : "";
  if (!text) throw new Error("Qwen returned an empty analysis through Nexos AI.");
  return { text, modelId };
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
    if (data.model === "qwen-3.8-omni-flash") {
      const result = await analyzeWithNexosQwen(data.audioBase64, data.mimeType, data.fileName);
      return {
        model: data.model,
        label: "Qwen 3.8 Omni Flash",
        provider: "Nexos AI",
        providerModelId: result.modelId,
        text: result.text,
        durationMs: Date.now() - startedAt,
      };
    }

    const label = data.model === "gemini-3.8-flash" ? "Gemini 3.8 Flash" : "Gemini 3.1 Pro";
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
