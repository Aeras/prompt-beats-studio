import { completeAuxiliaryRequest, getAuxiliaryRequestKey } from "@/lib/auxiliary-request-key";
import { analyzeStage0Dsp } from "@/lib/song-analyzer-dsp";
import type { Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";
import {
  analyzeStage0Essentia,
  consumeAnalyzerSourceStemPreview,
} from "@/lib/song-analyzer-essentia";
import {
  analyzeSong,
  type SongAnalysisResult,
  type StageAEvidence,
} from "@/lib/song-analyzer.functions";
import { guardSongAnalyzerStageA } from "@/lib/song-analyzer-stage-a-guard.functions";
import { finalizeSongAnalysis } from "@/lib/song-analyzer-final.functions";

const STORAGE_KEY = "pb:song-analyzer-background-result-v1";

type AnalyzerStatus = "idle" | "running" | "completed" | "failed";

export type AnalyzerBackgroundSnapshot = {
  status: AnalyzerStatus;
  fileName: string | null;
  startedAt: number | null;
  completedAt: number | null;
  legacyStage0Evidence: Stage0DspEvidence | null;
  stage0Evidence: Stage0DspEvidence | null;
  stageAEvidence: StageAEvidence | null;
  result: SongAnalysisResult | null;
  resultModel: string | null;
  finalResultModelLabel: string | null;
  error: string | null;
};

type StartArgs = {
  file: File;
  model: string;
  finalModel?: string;
  trackTitle?: string;
  artist?: string;
};

const emptySnapshot: AnalyzerBackgroundSnapshot = {
  status: "idle",
  fileName: null,
  startedAt: null,
  completedAt: null,
  legacyStage0Evidence: null,
  stage0Evidence: null,
  stageAEvidence: null,
  result: null,
  resultModel: null,
  finalResultModelLabel: null,
  error: null,
};

let snapshot: AnalyzerBackgroundSnapshot = restoreSnapshot();
let activePromise: Promise<AnalyzerBackgroundSnapshot> | null = null;
const listeners = new Set<(value: AnalyzerBackgroundSnapshot) => void>();

function restoreSnapshot(): AnalyzerBackgroundSnapshot {
  if (typeof window === "undefined") return { ...emptySnapshot };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...emptySnapshot };
    const parsed = JSON.parse(raw) as Partial<AnalyzerBackgroundSnapshot>;
    if (parsed.status !== "completed" && parsed.status !== "failed") return { ...emptySnapshot };
    return {
      ...emptySnapshot,
      ...parsed,
      status: parsed.status,
    };
  } catch {
    return { ...emptySnapshot };
  }
}

function persist(value: AnalyzerBackgroundSnapshot) {
  if (typeof window === "undefined") return;
  try {
    if (value.status === "completed" || value.status === "failed") {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else if (value.status === "idle") {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Background continuity still works within the current JS lifetime.
  }
}

function publish(next: AnalyzerBackgroundSnapshot) {
  snapshot = next;
  persist(next);
  for (const listener of listeners) listener(snapshot);
}

function fileToBase64(file: File) {
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

export function getAnalyzerBackgroundSnapshot() {
  return snapshot;
}

export function subscribeAnalyzerBackground(listener: (value: AnalyzerBackgroundSnapshot) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearAnalyzerBackground() {
  if (snapshot.status === "running") return false;
  activePromise = null;
  publish({ ...emptySnapshot });
  return true;
}

export function startAnalyzerBackground(args: StartArgs) {
  if (activePromise && snapshot.status === "running") return activePromise;

  const startedAt = Date.now();
  publish({
    ...emptySnapshot,
    status: "running",
    fileName: args.file.name,
    startedAt,
  });

  activePromise = (async () => {
    try {
      const [audioBase64, legacyStage0Evidence] = await Promise.all([
        fileToBase64(args.file),
        analyzeStage0Dsp(args.file),
      ]);
      publish({ ...snapshot, legacyStage0Evidence });

      const stage0Evidence = await analyzeStage0Essentia(args.file, legacyStage0Evidence);
      const sourceStemPreview = consumeAnalyzerSourceStemPreview();
      publish({ ...snapshot, stage0Evidence });

      const response = await analyzeSong({
        data: {
          requestKey: getAuxiliaryRequestKey("song_analyzer"),
          audioBase64,
          mimeType: args.file.type as any,
          model: args.model as any,
          stage0Evidence,
        },
      });

      const guarded = await guardSongAnalyzerStageA({
        data: {
          audioBase64,
          mimeType: args.file.type as any,
          model: args.model as any,
          stage0Evidence: sourceStemPreview
            ? { ...response.stage0Evidence, sourceStemPreview }
            : response.stage0Evidence,
          stageAEvidence: response.stageAEvidence,
          initialResult: response.result,
        },
      });

      const finalized = await finalizeSongAnalysis({
        data: {
          initialResult: guarded.initialResult,
          stage0Evidence: response.stage0Evidence,
          stageAEvidence: guarded.stageAEvidence,
          audioAnalysisModel: args.model as any,
          finalModel: args.finalModel || undefined,
          trackTitle: args.trackTitle?.trim() || undefined,
          artist: args.artist?.trim() || undefined,
        },
      });

      completeAuxiliaryRequest("song_analyzer");
      const completed: AnalyzerBackgroundSnapshot = {
        status: "completed",
        fileName: args.file.name,
        startedAt,
        completedAt: Date.now(),
        legacyStage0Evidence,
        stage0Evidence: response.stage0Evidence,
        stageAEvidence: guarded.stageAEvidence as StageAEvidence,
        result: finalized.result,
        resultModel: response.model,
        finalResultModelLabel: finalized.finalModelLabel,
        error: null,
      };
      publish(completed);
      return completed;
    } catch (error) {
      const failed: AnalyzerBackgroundSnapshot = {
        ...snapshot,
        status: "failed",
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
      publish(failed);
      return failed;
    } finally {
      activePromise = null;
    }
  })();

  return activePromise;
}
