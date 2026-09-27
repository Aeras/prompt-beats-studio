import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeExternalTrackSource } from "@/lib/track-sources";
import { throwSafeServerError } from "@/lib/server-error";

const fingerprintSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .regex(/^\d{1,3}(,\d{1,3}){63}$/);

const duplicateInput = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("upload"),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    fingerprint: fingerprintSchema,
    durationSeconds: z.number().int().min(0).max(60 * 60),
  }),
  z.object({
    sourceType: z.enum(["suno", "udio"]),
    sourceUrl: z.string().trim().url().max(2000),
  }),
]);

type DuplicateTrack = {
  id: string;
  title: string;
  created_at: string;
};

function parseFingerprint(value: string | null | undefined): number[] | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 64 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255))
    return null;
  return parts;
}

function pearsonSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return -1;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]! - leftMean;
    const b = right[i]! - rightMean;
    numerator += a * b;
    leftEnergy += a * a;
    rightEnergy += b * b;
  }
  const denominator = Math.sqrt(leftEnergy * rightEnergy);
  return denominator > 0 ? numerator / denominator : -1;
}

function asDuplicateTrack(row: any): DuplicateTrack {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    created_at: String(row.created_at ?? ""),
  };
}

export const checkTrackDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => duplicateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.sourceType !== "upload") {
      const normalized = normalizeExternalTrackSource(data.sourceType, data.sourceUrl);
      if (!normalized) return { status: "invalid" as const, duplicate: null };
      const { data: existing, error } = await (supabaseAdmin.from("tracks") as any)
        .select("id,title,created_at")
        .eq("user_id", context.userId)
        .eq("source_type", normalized.sourceType)
        .eq("source_id", normalized.sourceId)
        .limit(1);
      if (error)
        throwSafeServerError(
          "tracks:duplicate-external-check",
          error,
          "The track could not be checked. Please try again.",
        );
      const duplicate = existing?.[0] ? asDuplicateTrack(existing[0]) : null;
      return duplicate
        ? { status: "duplicate" as const, duplicate }
        : { status: "unique" as const, duplicate: null };
    }

    const { data: exactRows, error: exactError } = await (supabaseAdmin.from("tracks") as any)
      .select("id,title,created_at")
      .eq("user_id", context.userId)
      .eq("source_type", "upload")
      .eq("audio_content_hash", data.contentHash)
      .limit(1);
    if (exactError)
      throwSafeServerError(
        "tracks:duplicate-upload-hash-check",
        exactError,
        "The audio file could not be checked. Please try again.",
      );
    if (exactRows?.[0]) {
      return { status: "duplicate" as const, duplicate: asDuplicateTrack(exactRows[0]) };
    }

    const minDuration = Math.max(0, data.durationSeconds - 3);
    const maxDuration = data.durationSeconds + 3;
    const { data: candidates, error: candidateError } = await (supabaseAdmin.from("tracks") as any)
      .select("id,title,created_at,audio_fingerprint,duration_seconds")
      .eq("user_id", context.userId)
      .eq("source_type", "upload")
      .not("audio_fingerprint", "is", null)
      .gte("duration_seconds", minDuration)
      .lte("duration_seconds", maxDuration)
      .limit(40);
    if (candidateError)
      throwSafeServerError(
        "tracks:duplicate-upload-fingerprint-check",
        candidateError,
        "The audio file could not be checked. Please try again.",
      );

    const incoming = parseFingerprint(data.fingerprint);
    let best: { score: number; track: DuplicateTrack } | null = null;
    if (incoming) {
      for (const candidate of candidates ?? []) {
        const parsed = parseFingerprint(candidate.audio_fingerprint);
        if (!parsed) continue;
        const score = pearsonSimilarity(incoming, parsed);
        if (!best || score > best.score) best = { score, track: asDuplicateTrack(candidate) };
      }
    }

    // Deliberately conservative: perceptual matches warn but never hard-block.
    if (best && best.score >= 0.992) {
      return {
        status: "similar" as const,
        duplicate: best.track,
        similarity: Number(best.score.toFixed(4)),
      };
    }

    return { status: "unique" as const, duplicate: null };
  });
