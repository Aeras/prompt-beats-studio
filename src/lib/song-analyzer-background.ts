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

const STORAGE_KEY = "pb:song-analyzer-background-result-v2";
const LEGACY_STORAGE_KEY = "pb:song-analyzer-background-result-v1";

type AnalyzerStatus = "idle" | "running" | "completed" | "failed";

type PersistedAnalysisArgs = {
  model: string;
  finalModel?: string | undefined;
  trackTitle?: string | undefined;
  artist?: string | undefined;
};

export type AnalyzerBackgroundSnapshot = {
  status: AnalyzerStatus;
  fileName: string | null;
  startedAt: number | null;
  completedAt: number | null;
  analysisArgs: PersistedAnalysisArgs | null;
  legacyStage0Evidence: Stage0DspEvidence | null;
  stage0Evidence: Stage0DspEvidence | null;
  stageAEvidence: StageAEvidence | null;
  result: SongAnalysisResult | null;
  resultModel: string | null;
  finalResultModelLabel: string | null;
  error: string | null;
};

type StartArgs = PersistedAnalysisArgs & {
  file: File;
};

const emptySnapshot: AnalyzerBackgroundSnapshot = {
  status: "idle",
  fileName: null,
  startedAt: null,
  completedAt: null,
  analysisArgs: null,
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
    if (!raw) {
      window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
      return { ...emptySnapshot };
    }
    const parsed = JSON.parse(raw) as Partial<AnalyzerBackgroundSnapshot>;
    // Running work is recovered from the separately persisted RunPod job ID.
    // Do not resurrect a frozen spinner after a full browser refresh.
    if (!["completed", "failed"].includes(String(parsed.status))) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return { ...emptySnapshot };
    }
    return {
      ...emptySnapshot,
      ...parsed,
      status: parsed.status as AnalyzerStatus,
      analysisArgs: parsed.analysisArgs ?? null,
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
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Same-tab continuity still works while this JS runtime remains alive.
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
  return () => {
    listeners.delete(listener);
  };
}

export function clearAnalyzerBackground() {
  if (snapshot.status === "running") return false;
  activePromise = null;
  publish({ ...emptySnapshot });
  return true;
}

async function runAnalyzer(
  args: StartArgs,
  startedAt: number,
  resumeExisting: boolean,
): Promise<AnalyzerBackgroundSnapshot> {
  try {
    const audioBase64Promise = fileToBase64(args.file);
    let legacyStage0Evidence = resumeExisting ? snapshot.legacyStage0Evidence : null;
    let stage0Evidence = resumeExisting ? snapshot.stage0Evidence : null;

    if (!legacyStage0Evidence) {
      legacyStage0Evidence = await analyzeStage0Dsp(args.file);
      publish({ ...snapshot, legacyStage0Evidence });
    }

    const audioBase64 = await audioBase64Promise;

    if (!stage0Evidence) {
      stage0Evidence = await analyzeStage0Essentia(args.file, legacyStage0Evidence);
      publish({ ...snapshot, stage0Evidence });
    }
    const sourceStemPreview = consumeAnalyzerSourceStemPreview();

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
    publish({ ...snapshot, stageAEvidence: guarded.stageAEvidence as StageAEvidence });

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
      analysisArgs: {
        model: args.model,
        finalModel: args.finalModel,
        trackTitle: args.trackTitle,
        artist: args.artist,
      },
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
}

export function startAnalyzerBackground(args: StartArgs) {
  if (activePromise && snapshot.status === "running") return activePromise;
  if (snapshot.status === "running" && !activePromise) {
    return resumeAnalyzerBackground(args.file);
  }

  const startedAt = Date.now();
  publish({
    ...emptySnapshot,
    status: "running",
    fileName: args.file.name,
    startedAt,
    analysisArgs: {
      model: args.model,
      finalModel: args.finalModel,
      trackTitle: args.trackTitle,
      artist: args.artist,
    },
  });

  activePromise = runAnalyzer(args, startedAt, false);
  return activePromise;
}

export function resumeAnalyzerBackground(file: File) {
  if (activePromise && snapshot.status === "running") return activePromise;
  if (snapshot.status !== "running" || !snapshot.analysisArgs) return null;
  if (snapshot.fileName && snapshot.fileName !== file.name) return null;

  const args: StartArgs = {
    file,
    ...snapshot.analysisArgs,
  };
  const startedAt = snapshot.startedAt ?? Date.now();
  activePromise = runAnalyzer(args, startedAt, true);
  return activePromise;
}
