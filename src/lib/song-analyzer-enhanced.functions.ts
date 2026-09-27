import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  buildEnhancedStage0Evidence,
  enhancedCanonicalEvidenceSchema,
} from "@/lib/song-analyzer-enhanced.shared";

const ENHANCED_ANALYZER_MAX_FILE_BYTES = 15 * 1024 * 1024;
const DEFAULT_RUNPOD_TIMEOUT_MS = 10 * 60 * 1000;
const RUNPOD_POLL_INTERVAL_MS = 2_000;
const TEMP_AUDIO_DELETE_ATTEMPTS = 3;

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

const enhancedInputSchema = z.object({
  audioBase64: z.string().min(1).max(21_500_000),
  mimeType: z.enum(supportedMimeTypes),
});

const workerOutputSchema = z
  .object({
    ok: z.literal(true),
    engine: z.string().trim().min(1).max(200),
    input: z
      .object({
        duration_seconds: z.number().nonnegative().finite().nullable().optional(),
      })
      .passthrough(),
    canonical_evidence: enhancedCanonicalEvidenceSchema,
  })
  .passthrough();

const runpodEnvelopeSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1),
    output: z.unknown().optional(),
    error: z.unknown().optional(),
    executionTime: z.number().nonnegative().finite().optional(),
    delayTime: z.number().nonnegative().finite().optional(),
  })
  .passthrough();

function extensionForMimeType(mimeType: (typeof supportedMimeTypes)[number]) {
  switch (mimeType) {
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/ogg":
      return "ogg";
    case "audio/flac":
      return "flac";
    default:
      return "mp3";
  }
}

function configuredTimeoutMs() {
  const parsed = Number(process.env["RUNPOD_MUSIC_ANALYSIS_TIMEOUT_MS"] ?? DEFAULT_RUNPOD_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_RUNPOD_TIMEOUT_MS;
  return Math.max(60_000, Math.min(11 * 60 * 1000, Math.trunc(parsed)));
}

function safeRunpodError(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value).slice(0, 500);
    } catch {
      return "unknown worker error";
    }
  }
  return "unknown worker error";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRunpodJson(url: string, apiKey: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`RunPod request failed (${response.status}): ${safeRunpodError(payload)}`);
  }
  return runpodEnvelopeSchema.parse(payload);
}

async function runEnhancedWorker(audioUrl: string) {
  const endpointId = process.env["RUNPOD_MUSIC_ANALYSIS_ENDPOINT_ID"]?.trim();
  const apiKey = process.env["RUNPOD_API_KEY"]?.trim();
  if (!endpointId || !apiKey) {
    throw new Error("Enhanced Song Analyzer worker is not configured.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("Enhanced Song Analyzer endpoint configuration is invalid.");
  }

  const baseUrl = `https://api.runpod.ai/v2/${endpointId}`;
  const submitted = await fetchRunpodJson(`${baseUrl}/run`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      input: {
        action: "analyze_fused",
        audio_url: audioUrl,
      },
    }),
  });

  if (!submitted.id) throw new Error("RunPod did not return a job ID.");
  const jobId = submitted.id;
  const deadline = Date.now() + configuredTimeoutMs();
  let envelope = submitted;

  while (Date.now() < deadline) {
    if (envelope.status === "COMPLETED") {
      return {
        output: workerOutputSchema.parse(envelope.output),
        executionTimeMs: envelope.executionTime ?? null,
        delayTimeMs: envelope.delayTime ?? null,
      };
    }
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(envelope.status)) {
      throw new Error(`Enhanced analysis ${envelope.status.toLowerCase()}: ${safeRunpodError(envelope.error)}`);
    }

    await sleep(RUNPOD_POLL_INTERVAL_MS);
    envelope = await fetchRunpodJson(`${baseUrl}/status/${encodeURIComponent(jobId)}`, apiKey, {
      method: "GET",
    });
  }

  throw new Error("Enhanced Song Analyzer timed out while waiting for the GPU worker.");
}

async function requireEnhancedAnalyzerAccess(context: { supabase: any }) {
  await requireFeatureAccess(context.supabase, "song_analyzer");
  const { data, error } = await context.supabase.rpc("current_user_is_super_admin");
  if (error || data !== true) {
    throw new Error("Enhanced Song Analyzer is currently restricted to Super Admin.");
  }
}

async function deleteTemporaryAudio(deleteFromR2: (key: string) => Promise<void>, key: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= TEMP_AUDIO_DELETE_ATTEMPTS; attempt += 1) {
    try {
      await deleteFromR2(key);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < TEMP_AUDIO_DELETE_ATTEMPTS) await sleep(250 * attempt);
    }
  }
  console.error("[song-analyzer] failed to delete temporary enhanced-analysis audio", {
    key,
    attempts: TEMP_AUDIO_DELETE_ATTEMPTS,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

export const analyzeEnhancedStage0 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enhancedInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEnhancedAnalyzerAccess(context);

    const bytes = Buffer.from(data.audioBase64, "base64");
    if (!bytes.length || bytes.byteLength > ENHANCED_ANALYZER_MAX_FILE_BYTES) {
      throw new Error("Audio file exceeds the 15 MB Analyzer limit.");
    }

    const { uploadToR2, createSignedR2GetUrl, deleteFromR2 } = await import("@/lib/r2.server");
    const extension = extensionForMimeType(data.mimeType);
    const key = `analyzer-temp/${context.userId}/${crypto.randomUUID()}.${extension}`;
    const startedAt = Date.now();

    await uploadToR2(key, bytes, data.mimeType);
    try {
      // Long enough for serverless queue/cold-start + the endpoint's 600 second execution budget.
      const audioUrl = await createSignedR2GetUrl(key, 30 * 60);
      const worker = await runEnhancedWorker(audioUrl);
      const canonicalEvidence = worker.output.canonical_evidence;
      const stage0Evidence = buildEnhancedStage0Evidence({
        canonicalEvidence,
        durationSeconds: worker.output.input.duration_seconds ?? null,
        totalMs: Date.now() - startedAt,
        workerEngine: worker.output.engine,
      });

      return {
        stage0Evidence,
        canonicalEvidence,
        worker: {
          engine: worker.output.engine,
          executionTimeMs: worker.executionTimeMs,
          delayTimeMs: worker.delayTimeMs,
        },
      };
    } finally {
      // Analyzer source audio is temporary transport only and is never retained as a Track/Library asset.
      await deleteTemporaryAudio(deleteFromR2, key);
    }
  });