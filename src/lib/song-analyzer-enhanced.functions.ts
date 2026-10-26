import { aiProviderFetch, aiContinuationFetch } from "./global-ai-usage.server";
import { safeErrorType } from "@/lib/safe-diagnostics";
import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeatureAccess } from "@/lib/feature-access.functions";
import {
  queryMusicMemoryByVector,
  similarityVectorSchema,
} from "@/lib/qdrant-music-memory.functions";
import {
  buildEnhancedStage0Evidence,
  enhancedCanonicalEvidenceSchema,
} from "@/lib/song-analyzer-enhanced.shared";

const ENHANCED_ANALYZER_MAX_FILE_BYTES = 15 * 1024 * 1024;
const DEFAULT_RUNPOD_TIMEOUT_MS = 10 * 60 * 1000;
const RUNPOD_POLL_INTERVAL_MS = 2_000;
const TEMP_AUDIO_DELETE_ATTEMPTS = 3;
const REFERENCE_MEMORY_QUERY_LIMIT = 48;
const REFERENCE_MEMORY_EXPANDED_QUERY_LIMIT = 192;
const REFERENCE_MEMORY_LIMIT = 12;
const REFERENCE_MEMORY_MIN_GENRE_MATCHES = 4;

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

const workerStemPreviewSchema = z.object({
  source: z.literal("demucs_other"),
  mime_type: z.literal("audio/mpeg"),
  audio_base64: z.string().min(1).max(2_000_000),
  duration_seconds: z.number().positive().finite().nullable(),
  windows: z
    .array(
      z.object({
        start_seconds: z.number().nonnegative().finite(),
        end_seconds: z.number().nonnegative().finite(),
      }),
    )
    .min(1)
    .max(8),
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
    similarity_embedding: similarityVectorSchema.nullable().optional(),
    stem_previews: z
      .object({
        other: workerStemPreviewSchema.optional(),
      })
      .optional(),
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
  const parsed = Number(
    process.env["RUNPOD_MUSIC_ANALYSIS_TIMEOUT_MS"] ?? DEFAULT_RUNPOD_TIMEOUT_MS,
  );
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

function payloadText(value: unknown, max = 300) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function payloadStringArray(value: unknown, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, 120));
}

function normalizeArtistKey(artist: string | null, fallback: string | number | null) {
  if (artist) return `artist:${artist.toLocaleLowerCase().replace(/\s+/g, " ").trim()}`;
  return `track:${String(fallback ?? crypto.randomUUID())}`;
}

function hasUsefulStyleMetadata(match: {
  genreTop: string | null;
  genres: string[];
  tags: string[];
}) {
  return Boolean(match.genreTop || match.genres.length || match.tags.length);
}

function buildGenreConsensus(
  matches: Array<{
    genreTop: string | null;
    genres: string[];
  }>,
) {
  const counts = new Map<string, { label: string; count: number }>();

  for (const match of matches) {
    const labels = new Set(
      [match.genreTop, ...match.genres]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    );
    for (const label of labels) {
      const key = label.toLocaleLowerCase();
      const current = counts.get(key);
      counts.set(key, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 10)
    .map((item) => ({
      label: item.label,
      count: item.count,
      share: matches.length ? Number((item.count / matches.length).toFixed(4)) : 0,
    }));
}

function referenceConsensusStrength(args: {
  matchCount: number;
  uniqueArtistCount: number;
  topShare: number;
}) {
  if (args.matchCount < REFERENCE_MEMORY_MIN_GENRE_MATCHES || args.uniqueArtistCount < 4)
    return "insufficient" as const;
  if (args.topShare >= 0.7 && args.uniqueArtistCount >= 6) return "strong" as const;
  if (args.topShare >= 0.5) return "moderate" as const;
  return "weak" as const;
}

function mapReferenceCandidates(result: Awaited<ReturnType<typeof queryMusicMemoryByVector>>) {
  return result.matches.map((match) => {
    const payload = match.payload;
    const sourceTrackId =
      typeof payload["source_track_id"] === "number" && Number.isInteger(payload["source_track_id"])
        ? payload["source_track_id"]
        : null;
    return {
      id: match.id,
      score: match.score,
      sourceTrackId: typeof sourceTrackId === "number" ? sourceTrackId : null,
      title: payloadText(payload["title"]),
      artist: payloadText(payload["artist"]),
      genreTop: payloadText(payload["genre_top"], 120),
      genres: payloadStringArray(payload["genres"]),
      tags: payloadStringArray(payload["tags"]),
    };
  });
}

async function buildReferenceMemory(vector: number[]) {
  let result = await queryMusicMemoryByVector({
    vector,
    limit: REFERENCE_MEMORY_QUERY_LIMIT,
  });
  let candidates = mapReferenceCandidates(result);
  let metadataEligible = candidates.filter(hasUsefulStyleMetadata);

  if (metadataEligible.length < REFERENCE_MEMORY_LIMIT) {
    result = await queryMusicMemoryByVector({
      vector,
      limit: REFERENCE_MEMORY_EXPANDED_QUERY_LIMIT,
    });
    candidates = mapReferenceCandidates(result);
    metadataEligible = candidates.filter(hasUsefulStyleMetadata);
  }

  const seenArtists = new Set<string>();
  const deduplicated = [] as typeof metadataEligible;
  for (const match of metadataEligible) {
    const artistKey = normalizeArtistKey(match.artist, match.sourceTrackId ?? match.id);
    if (seenArtists.has(artistKey)) continue;
    seenArtists.add(artistKey);
    deduplicated.push(match);
  }

  const matches = deduplicated.slice(0, REFERENCE_MEMORY_LIMIT);
  const genreConsensus = buildGenreConsensus(matches);
  const uniqueArtistCount = new Set(
    matches.map((match) => normalizeArtistKey(match.artist, match.sourceTrackId ?? match.id)),
  ).size;
  const topShare = genreConsensus[0]?.share ?? 0;
  const consensusStrength = referenceConsensusStrength({
    matchCount: matches.length,
    uniqueArtistCount,
    topShare,
  });

  return {
    used: matches.length > 0,
    embeddingContract: "promptbeats-mert95-similarity-v1" as const,
    candidateCount: candidates.length,
    metadataEligibleCount: metadataEligible.length,
    deduplicatedCount: deduplicated.length,
    matchCount: matches.length,
    uniqueArtistCount,
    consensusStrength,
    genreConsensus,
    matches,
    interpretationGuidance:
      "REFERENCE MEMORY GUARDRAIL: Stage A must IGNORE referenceMemory when describing audible instruments, groove, vocals, tempo, arrangement, production, or other raw audio evidence. Reference memory is not audible evidence. The Final Judge may use only genreConsensus/consensusStrength as secondary corroboration after direct Stage 0 + Stage A evidence has independently supported the same broad style family. It must never introduce a new genre family, instrument, groove, tempo interpretation, vocal style, or arrangement because of neighbours. Per-match titles, artists, labels and cosine scores are diagnostic/debug context only and must not be used as votes. Even strong consensus cannot override contradictory direct audio evidence; weak/insufficient consensus should not change the primary style classification at all. Cosine score is embedding proximity, not genre probability.",
  };
}

function appendLimitation(existing: string[], message: string) {
  return [...existing, message].slice(-30);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRunpodJson(url: string, apiKey: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");

  const response = await (
    /\/(run|runsync)$/.test(new URL(url).pathname) ? aiProviderFetch : aiContinuationFetch
  )(url, {
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
      throw new Error(
        `Enhanced analysis ${envelope.status.toLowerCase()}: ${safeRunpodError(envelope.error)}`,
      );
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
    errorType: safeErrorType(lastError),
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
      const rawStemPreview = worker.output.stem_previews?.other;
      const sourceStemPreview = rawStemPreview
        ? {
            source: "demucs_other" as const,
            mimeType: "audio/mpeg" as const,
            audioBase64: rawStemPreview.audio_base64,
            durationSeconds: rawStemPreview.duration_seconds,
            windows: rawStemPreview.windows.map((window) => ({
              startSeconds: window.start_seconds,
              endSeconds: window.end_seconds,
            })),
          }
        : undefined;
      let stage0Evidence = buildEnhancedStage0Evidence({
        canonicalEvidence,
        durationSeconds: worker.output.input.duration_seconds ?? null,
        totalMs: Date.now() - startedAt,
        workerEngine: worker.output.engine,
        sourceStemPreview,
      });

      const similarityEmbedding = worker.output.similarity_embedding ?? null;
      if (similarityEmbedding) {
        try {
          const referenceMemory = await buildReferenceMemory(similarityEmbedding.vector);
          stage0Evidence = {
            ...stage0Evidence,
            referenceMemory,
            limitations: appendLimitation(
              stage0Evidence.limitations,
              `Qdrant reference memory retained ${referenceMemory.matchCount} artist-deduplicated, metadata-bearing neighbours from ${referenceMemory.candidateCount} candidates; consensus=${referenceMemory.consensusStrength}.`,
            ),
          };
        } catch (error) {
          console.warn(
            "[song-analyzer] Qdrant reference-memory lookup failed; continuing without it",
            {
              errorType: safeErrorType(error),
            },
          );
          stage0Evidence = {
            ...stage0Evidence,
            limitations: appendLimitation(
              stage0Evidence.limitations,
              "Qdrant reference-memory lookup was unavailable; final analysis continued from direct audio evidence only.",
            ),
          };
        }
      } else {
        stage0Evidence = {
          ...stage0Evidence,
          limitations: appendLimitation(
            stage0Evidence.limitations,
            "Enhanced worker did not return the canonical MERT similarity embedding; Qdrant reference-memory retrieval was not used.",
          ),
        };
      }

      return {
        stage0Evidence,
        canonicalEvidence,
        similarityEmbedding,
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
