import {
  pollEnhancedStage0Job,
  startEnhancedStage0Job,
} from "@/lib/song-analyzer-enhanced-job.functions";
import type { AnalyzerSourceStemPreview } from "@/lib/song-analyzer-enhanced.shared";
import type { Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";

export type AnalyzerSimilarityEmbedding = {
  contract: "promptbeats-mert95-similarity-v1";
  vector: number[];
};

const RUNPOD_POLL_INTERVAL_MS = 2_000;
const RUNPOD_RESUME_DEADLINE_MS = 11 * 60 * 1000;
const MAX_CONSECUTIVE_POLL_TRANSPORT_ERRORS = 8;

let pendingSourceStemPreview: AnalyzerSourceStemPreview | null = null;

export function consumeAnalyzerSourceStemPreview() {
  const preview = pendingSourceStemPreview;
  pendingSourceStemPreview = null;
  return preview;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientTransportError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("temporarily unavailable") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection")
  );
}

/**
 * Compatibility adapter retained so the Song Analyzer route does not duplicate
 * transport logic. Browser-side Essentia.js/WASM has been removed; Super Admin
 * analysis obtains Stage 0 evidence from the external GPU worker
 * (Demucs + Essentia + MERT + fusion).
 *
 * Enhanced Stage 0 is authoritative. We never silently continue to Stage A or
 * the Final Judge with legacy browser DSP when the GPU path is unavailable.
 *
 * The RunPod request is split into a short submit call plus resumable status
 * polls. Once RunPod has accepted the job, GPU execution is independent of the
 * long-lived browser HTTP request. If mobile backgrounding temporarily pauses JS
 * or drops a poll request, the same RunPod job is polled again after wake-up;
 * no duplicate GPU job is started. Transient polling failures are tolerated up
 * to a bounded limit, while deterministic worker failures still fail closed.
 *
 * The short Demucs `other` preview is transient verifier transport. It is
 * removed from Stage 0 before normal debug/final/persistence flows can see it.
 */
async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read audio file"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Could not encode audio file"));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

async function requestEnhancedStage0(audioBase64: string, mimeType: File["type"]) {
  // Do not automatically retry submission: a lost response after RunPod accepted
  // the request could otherwise create two billable GPU jobs. Resilience starts
  // after a concrete RunPod job ID has been returned.
  const started = await startEnhancedStage0Job({
    data: {
      audioBase64,
      mimeType: mimeType as any,
    },
  });

  const deadline = Math.max(Date.now(), started.startedAt) + RUNPOD_RESUME_DEADLINE_MS;
  let consecutiveTransportErrors = 0;

  while (Date.now() < deadline) {
    await sleep(RUNPOD_POLL_INTERVAL_MS);
    try {
      const polled = await pollEnhancedStage0Job({
        data: {
          jobId: started.jobId,
          audioKey: started.audioKey,
          startedAt: started.startedAt,
        },
      });
      consecutiveTransportErrors = 0;
      if (polled.status === "completed" && polled.stage0Evidence) {
        return {
          stage0Evidence: polled.stage0Evidence,
          similarityEmbedding: polled.similarityEmbedding ?? null,
        };
      }
    } catch (error) {
      if (!isTransientTransportError(error)) throw error;
      consecutiveTransportErrors += 1;
      if (consecutiveTransportErrors > MAX_CONSECUTIVE_POLL_TRANSPORT_ERRORS) throw error;
      // Browser timers are routinely throttled while a phone is locked. A small
      // bounded backoff avoids hammering the server immediately after reconnect.
      await sleep(Math.min(1_000 * consecutiveTransportErrors, 5_000));
    }
  }

  throw new Error("Enhanced Song Analyzer timed out while waiting for the GPU worker.");
}

export async function analyzeStage0EssentiaWithSimilarity(
  file: File,
  _legacy: Stage0DspEvidence,
): Promise<{
  stage0Evidence: Stage0DspEvidence;
  similarityEmbedding: AnalyzerSimilarityEmbedding | null;
}> {
  pendingSourceStemPreview = null;

  try {
    const audioBase64 = await fileToBase64(file);
    const response = await requestEnhancedStage0(audioBase64, file.type);
    const transported = response.stage0Evidence as Stage0DspEvidence & {
      sourceStemPreview?: AnalyzerSourceStemPreview;
    };
    const { sourceStemPreview, ...cleanStage0Evidence } = transported;
    pendingSourceStemPreview = sourceStemPreview ?? null;
    return {
      stage0Evidence: cleanStage0Evidence as Stage0DspEvidence,
      similarityEmbedding: response.similarityEmbedding,
    };
  } catch (error) {
    pendingSourceStemPreview = null;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Enhanced Song Analyzer is temporarily unavailable. Analysis was stopped instead of using degraded legacy DSP. ${detail}`.slice(0, 900),
    );
  }
}

export async function analyzeStage0Essentia(
  file: File,
  legacy: Stage0DspEvidence,
): Promise<Stage0DspEvidence> {
  return (await analyzeStage0EssentiaWithSimilarity(file, legacy)).stage0Evidence;
}
