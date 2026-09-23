import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { isSafeOwnedAudioKey } from "@/lib/storage-paths";

const songPackageSchema = z
  .object({
    title: z.string().trim().max(300),
    musicStyle: z.string().trim().max(8_000),
    lyrics: z.string().trim().max(40_000),
    productionNotes: z.string().trim().max(8_000),
    previousAudioKey: z.string().max(500).nullable().optional(),
  })
  .refine(
    (value) => Boolean(value.title || value.musicStyle || value.lyrics || value.productionNotes),
    {
      message: "Song package is empty",
    },
  );

async function requireMusicLabAccess(context: { supabase: any }) {
  await requireFeatureAccess(context.supabase, "ai_music_lab");
}

function isOwnedLyriaTempKey(key: string, userId: string) {
  return isSafeOwnedAudioKey(key, userId) && key.startsWith(`tracks/${userId}/lyria-temp/`);
}

async function deleteUnusedLyriaTemp(context: { supabase: any; userId: string }, key: string) {
  if (!isOwnedLyriaTempKey(key, context.userId)) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: inUse, error } = await supabaseAdmin
    .from("tracks")
    .select("id")
    .eq("audio_key", key)
    .limit(1);
  if (error) throw new Error("Could not verify generated audio state");
  if (inUse?.length) return false;
  const { deleteOwnedR2Object } = await import("@/lib/r2.server");
  await deleteOwnedR2Object(key, context.userId);
  return true;
}

export const getAiMusicLabAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMusicLabAccess(context);
    return { allowed: true as const };
  });

export const generateLyriaSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => songPackageSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireMusicLabAccess(context);
    const { requireAuxiliaryAiAdmission } = await import("@/lib/ai-admission.server");
    await requireAuxiliaryAiAdmission(context.supabase, "ai_music_lab");

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Gemini API is not configured");

    const prompt = [
      "Create a complete song from the following PromptBeats song package.",
      "Follow the supplied lyrics exactly where possible. Preserve section labels as structural guidance.",
      "Use the music style and producer notes as musical and production direction.",
      data.title && `TITLE:\n${data.title}`,
      data.musicStyle && `MUSIC STYLE:\n${data.musicStyle}`,
      data.lyrics && `LYRICS:\n${data.lyrics}`,
      data.productionNotes && `PRODUCER NOTES:\n${data.productionNotes}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3.5:generateContent",
      {
        method: "POST",
        signal: AbortSignal.timeout(5 * 60 * 1000),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO", "TEXT"],
          },
        }),
      },
    );

    const payload = (await response.json()) as {
      error?: { message?: string };
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { data?: string; mimeType?: string };
          }>;
        };
      }>;
    };

    if (!response.ok)
      throw new Error(payload.error?.message || `Lyria request failed (${response.status})`);

    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!audioPart?.data) throw new Error("Lyria returned no audio");

    const mimeType = audioPart.mimeType || "audio/mpeg";
    const extension = mimeType.includes("wav") ? "wav" : "mp3";
    const safeTitle =
      (data.title || "promptbeats-song")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "promptbeats-song";
    const key = `tracks/${context.userId}/lyria-temp/${Date.now()}-${safeTitle}.${extension}`;
    const bytes = Buffer.from(audioPart.data, "base64");
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const { uploadToR2 } = await import("@/lib/r2.server");
    const stored = await uploadToR2(key, arrayBuffer, mimeType);

    if (data.previousAudioKey && data.previousAudioKey !== stored.key) {
      try {
        await deleteUnusedLyriaTemp(context, data.previousAudioKey);
      } catch {
        /* keep the new result even if old temp cleanup fails */
      }
    }

    const generatedText = parts
      .map((part) => part.text)
      .filter((value): value is string => Boolean(value))
      .join("\n")
      .trim();

    return {
      audioUrl: stored.url,
      audioKey: stored.key,
      mimeType,
      generatedText,
      model: "lyria-3.5" as const,
    };
  });

export const downloadLyriaSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioKey: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireMusicLabAccess(context);
    if (!isOwnedLyriaTempKey(data.audioKey, context.userId))
      throw new Error("Invalid generated audio reference");

    const { getR2Client, getR2Config } = await import("@/lib/r2.server");
    const { endpoint, bucket } = getR2Config();
    const response = await getR2Client().fetch(`${endpoint}/${bucket}/${data.audioKey}`);
    if (!response.ok) throw new Error(`Generated audio download failed (${response.status})`);

    const arrayBuffer = await response.arrayBuffer();
    return {
      audioBase64: Buffer.from(arrayBuffer).toString("base64"),
      mimeType:
        response.headers.get("content-type") ||
        (data.audioKey.endsWith(".wav") ? "audio/wav" : "audio/mpeg"),
    };
  });

export const discardLyriaSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioKey: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireMusicLabAccess(context);
    if (!isOwnedLyriaTempKey(data.audioKey, context.userId))
      throw new Error("Invalid generated audio reference");
    const deleted = await deleteUnusedLyriaTemp(context, data.audioKey);
    return { ok: true as const, deleted };
  });
