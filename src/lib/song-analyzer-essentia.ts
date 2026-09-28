import { cancelEnhancedStage0Job } from "@/lib/song-analyzer-enhanced-cancel.functions";
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
const RUNPOD_EXECUTION_TIMEOUT_MS = 11 * 60 * 1000;
const RUNPOD_RECOVERY_WINDOW_MS = 30 * 60 * 1000;
const MAX_CONSECUTIVE_POLL_TRANSPORT_ERRORS = 8;
const ACTIVE_RUNPOD_JOB_KEY = "pb:song-analyzer-runpod-job-v1";

let pendingSourceStemPreview: AnalyzerSourceStemPreview | null = null;

type PersistedRunpodJob = {
  jobId: string;
  audioKey: string;
  startedAt: number;
  fileFingerprint: string;
};

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

function fingerprintFile(file: File) {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

function readPersistedRunpodJob(): PersistedRunpodJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_RUNPOD_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRunpodJob>;
    if (
      typeof parsed.jobId !== "string" ||
      typeof parsed.audioKey !== "string" ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.fileFingerprint !== "string"
    ) {
      window.sessionStorage.removeItem(ACTIVE_RUNPOD_JOB_KEY);
      return null;
    }
    return parsed as PersistedRunpodJob;
  } catch {
    return null;
  }
}

function persistRunpodJob(job: PersistedRunpodJob | null) {
  if (typeof window === "undefined") return;
  try {
    if (job) window.sessionStorage.setItem(ACTIVE_RUNPOD_JOB_KEY, JSON.stringify(job));
    else window.sessionStorage.removeItem(ACTIVE_RUNPOD_JOB_KEY);
  } catch {
    // Resume metadata is best-effort; the server still enforces job ownership.
  }
}

async function cancelAndForget(job: PersistedRunpodJob) {
  persistRunpodJob(null);
  try {
    await cancelEnhancedStage0Job({
      data: {
        jobId: job.jobId,
        audioKey: job.audioKey,
      },
    });
  } catch {
    // The caller is already stopping this logical run. Do not turn cleanup into
    // a second user-facing failure or accidentally resubmit a duplicate job.
  }
}

export function hasRecoverableEnhancedStage0Job(file?: File | null) {
  const job = readPersistedRunpodJob();
  if (!job) return false;
  if (Date.now() - job.startedAt > RUNPOD_RECOVERY_WINDOW_MS) return false;
  return !file || job.fileFingerprint === fingerprintFile(file);
}

/**
 * Browser-side Essentia.js/WASM has been removed; Super Admin analysis obtains
 * Stage 0 evidence from the external GPU worker (Demucs + Essentia + MERT +
 * fusion). Enhanced Stage 0 is authoritative: legacy DSP is never silently used
 * as a substitute when the GPU path fails.
 *
 * Once RunPod returns a job ID, that identity is persisted immediately. A page
 * refresh or a temporarily suspended mobile tab therefore resumes polling the
 * same billable GPU job instead of submitting a duplicate. The normal execution
 * budget is deliberately separate from the longer recovery window: an actually
 * running job is cancelled after 11 minutes, while a phone that wakes later may
 * still collect a job that already reached COMPLETED during suspension.
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

async function requestEnhancedStage0(file: File, audioBase64: string) {
  const fileFingerprint = fingerprintFile(file);
  let active = readPersistedRunpodJob();

  if (active && active.fileFingerprint !== fileFingerprint) {
    await cancelAndForget(active);
    active = null;
  }

  if (active && Date.now() - active.startedAt > RUNPOD_RECOVERY_WINDOW_MS) {
    await cancelAndForget(active);
    active = null;
  }

  if (!active) {
    // Do not automatically retry submission: if RunPod accepted the request but
    // the response was lost, retrying /run could create a second billable job.
    const started = await startEnhancedStage0Job({
      data: {
        audioBase64,
        mimeType: file.type as any,
      },
    });
    active = {
      jobId: started.jobId,
      audioKey: started.audioKey,
      startedAt: started.startedAt,
      fileFingerprint,
    };
    persistRunpodJob(active);
  }

  const recoveryDeadline = active.startedAt + RUNPOD_RECOVERY_WINDOW_MS;
  let consecutiveTransportErrors = 0;

  while (Date.now() < recoveryDeadline) {
    await sleep(RUNPOD_POLL_INTERVAL_MS);
    try {
      const polled = await pollEnhancedStage0Job({
        data: {
          jobId: active.jobId,
          audioKey: active.audioKey,
          startedAt: active.startedAt,
        },
      });
      consecutiveTransportErrors = 0;

      if (polled.status === "completed" && polled.stage0Evidence) {
        persistRunpodJob(null);
        return {
          stage0Evidence: polled.stage0Evidence,
          similarityEmbedding: polled.similarityEmbedding ?? null,
        };
      }

      if (Date.now() - active.startedAt >= RUNPOD_EXECUTION_TIMEOUT_MS) {
        await cancelAndForget(active);
        throw new Error(
          "Enhanced Song Analyzer exceeded the 11-minute GPU execution limit and was cancelled.",
        );
      }
    } catch (error) {
      if (!isTransientTransportError(error)) {
        persistRunpodJob(null);
        throw error;
      }
      consecutiveTransportErrors += 1;
      if (consecutiveTransportErrors > MAX_CONSECUTIVE_POLL_TRANSPORT_ERRORS) {
        // Keep the persisted job identity. A refresh/reopen can resume the same
        // RunPod job inside the recovery window instead of starting another one.
        throw error;
      }
      await sleep(Math.min(1_000 * consecutiveTransportErrors, 5_000));
    }
  }

  await cancelAndForget(active);
  throw new Error("Enhanced Song Analyzer recovery window expired and the GPU job was cancelled.");
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
    const response = await requestEnhancedStage0(file, audioBase64);
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
