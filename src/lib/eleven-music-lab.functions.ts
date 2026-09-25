import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import { isSafeOwnedAudioKey } from "@/lib/storage-paths";
import {
  auxiliaryRequestKeySchema,
  executeDurableAuxiliaryAiRequest,
} from "@/lib/ai-auxiliary-idempotency.server";

const ELEVEN_MODEL = "music_v2_5" as const;
const ELEVEN_BASE_URL = "https://api.elevenlabs.io/v1/music";

const promptSchema = z.string().trim().min(1).max(4100);
const durationSchema = z.number().int().min(3).max(600).default(180);

const planChunkSchema = z
  .object({
    text: z.string().max(20_000),
    duration_ms: z.number().int().min(1).max(600_000),
    positive_styles: z.array(z.string().max(500)).max(100).optional(),
    negative_styles: z.array(z.string().max(500)).max(100).optional(),
    context_adherence: z.string().max(50).optional(),
  })
  .passthrough();

const compositionPlanSchema = z
  .object({
    chunks: z.array(planChunkSchema).min(1).max(30),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (JSON.stringify(value).length > 120_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Composition plan is too large" });
    }
  });

async function requireElevenMusicLabAccess(context: { supabase: any }) {
  await requireFeatureAccess(context.supabase, "ai_music_lab");
  const { data, error } = await context.supabase.rpc("current_user_is_super_admin");
  if (error || data !== true) throw new Error("Not allowed");
}

function getElevenApiKey() {
  const apiKey = process.env["ELEVENLABS_API_KEY"]?.trim();
  if (!apiKey) throw new Error("ElevenLabs API is not configured");
  return apiKey;
}

function isOwnedElevenTempKey(key: string, userId: string) {
  return isSafeOwnedAudioKey(key, userId) && key.startsWith(`tracks/${userId}/eleven-temp/`);
}

async function deleteUnusedElevenTemp(
  context: { supabase: any; userId: string },
  key: string,
) {
  if (!isOwnedElevenTempKey(key, context.userId)) return false;
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

async function readElevenError(response: Response) {
  const fallback = `Eleven Music request failed (${response.status})`;
  try {
    const payload = (await response.json()) as {
      detail?: string | { message?: string };
      message?: string;
    };
    if (typeof payload.detail === "string") return payload.detail;
    if (payload.detail && typeof payload.detail === "object" && payload.detail.message)
      return payload.detail.message;
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

export const getElevenMusicLabAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireElevenMusicLabAccess(context);
    return { allowed: true as const, model: ELEVEN_MODEL };
  });

export const generateElevenCompositionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ prompt: promptSchema, durationSeconds: durationSchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireElevenMusicLabAccess(context);
    const response = await fetch(`${ELEVEN_BASE_URL}/plan`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": getElevenApiKey(),
      },
      body: JSON.stringify({
        prompt: data.prompt,
        music_length_ms: data.durationSeconds * 1000,
        model_id: ELEVEN_MODEL,
      }),
    });
    if (!response.ok) throw new Error(await readElevenError(response));
    const payload = compositionPlanSchema.parse(await response.json());
    return { model: ELEVEN_MODEL, plan: payload };
  });

const generateInputSchema = z
  .object({
    prompt: promptSchema.optional(),
    compositionPlan: compositionPlanSchema.optional(),
    durationSeconds: durationSchema,
    previousAudioKey: z.string().max(500).nullable().optional(),
    requestKey: auxiliaryRequestKeySchema,
  })
  .refine((value) => Boolean(value.prompt) !== Boolean(value.compositionPlan), {
    message: "Provide either a prompt or a composition plan",
  });

export const generateElevenMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => generateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireElevenMusicLabAccess(context);
    const result = await executeDurableAuxiliaryAiRequest({
      supabase: context.supabase,
      operation: "ai_music_lab",
      requestKey: data.requestKey,
      execute: async (markProviderStarted) => {
        const { recordAiUsage } = await import("@/lib/ai-usage.server");
        let success = false;
        try {
          await markProviderStarted();
          const body = data.compositionPlan
            ? { composition_plan: data.compositionPlan, model_id: ELEVEN_MODEL }
            : {
                prompt: data.prompt,
                music_length_ms: data.durationSeconds * 1000,
                model_id: ELEVEN_MODEL,
                force_instrumental: false,
              };
          const response = await fetch(`${ELEVEN_BASE_URL}?output_format=mp3_48000_192`, {
            method: "POST",
            signal: AbortSignal.timeout(10 * 60 * 1000),
            headers: {
              "Content-Type": "application/json",
              "xi-api-key": getElevenApiKey(),
            },
            body: JSON.stringify(body),
          });
          if (!response.ok) throw new Error(await readElevenError(response));

          const mimeType = response.headers.get("content-type") || "audio/mpeg";
          const bytes = Buffer.from(await response.arrayBuffer());
          if (!bytes.byteLength) throw new Error("Eleven Music returned no audio");

          const key = `tracks/${context.userId}/eleven-temp/${Date.now()}-${crypto.randomUUID()}.mp3`;
          const arrayBuffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          const { uploadToR2 } = await import("@/lib/r2.server");
          const stored = await uploadToR2(key, arrayBuffer, mimeType);

          if (data.previousAudioKey && data.previousAudioKey !== stored.key) {
            try {
              await deleteUnusedElevenTemp(context, data.previousAudioKey);
            } catch {
              /* keep the new result even if old temp cleanup fails */
            }
          }

          success = true;
          return {
            audioKey: stored.key,
            mimeType,
            model: ELEVEN_MODEL,
            songId: response.headers.get("song-id"),
          };
        } finally {
          await recordAiUsage({
            userId: context.userId,
            provider: "elevenlabs",
            model: ELEVEN_MODEL,
            operation: "ai_music_lab_generation",
            usage: null,
            success,
          });
        }
      },
    });

    if (!isOwnedElevenTempKey(result.audioKey, context.userId))
      throw new Error("Invalid generated audio reference");
    const { createSignedR2GetUrl } = await import("@/lib/r2.server");
    return { ...result, audioUrl: await createSignedR2GetUrl(result.audioKey) };
  });

export const downloadElevenMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioKey: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireElevenMusicLabAccess(context);
    if (!isOwnedElevenTempKey(data.audioKey, context.userId))
      throw new Error("Invalid generated audio reference");

    const { getR2Client, getR2Config } = await import("@/lib/r2.server");
    const { endpoint, bucket } = getR2Config();
    const response = await getR2Client().fetch(`${endpoint}/${bucket}/${data.audioKey}`);
    if (!response.ok) throw new Error(`Generated audio download failed (${response.status})`);
    return {
      audioBase64: Buffer.from(await response.arrayBuffer()).toString("base64"),
      mimeType: response.headers.get("content-type") || "audio/mpeg",
    };
  });

export const discardElevenMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioKey: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireElevenMusicLabAccess(context);
    if (!isOwnedElevenTempKey(data.audioKey, context.userId))
      throw new Error("Invalid generated audio reference");
    const deleted = await deleteUnusedElevenTemp(context, data.audioKey);
    return { ok: true as const, deleted };
  });
