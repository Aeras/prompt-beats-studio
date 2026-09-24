import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { createPromptProject, listPromptProjects } from "@/lib/ai.functions";
import {
  analyzeSong,
  DEFAULT_SONG_ANALYZER_MODEL,
  getSongAnalyzerAccess,
  saveSongAnalysis,
  SONG_ANALYZER_MAX_FILE_BYTES,
  SONG_ANALYZER_MODELS,
  type SongAnalysisResult,
  type StageAEvidence,
} from "@/lib/song-analyzer.functions";
import { completeAuxiliaryRequest, getAuxiliaryRequestKey } from "@/lib/auxiliary-request-key";
import { analyzeStage0Dsp } from "@/lib/song-analyzer-dsp";
import { analyzeStage0Essentia } from "@/lib/song-analyzer-essentia";
import type { Stage0DspEvidence } from "@/lib/song-analyzer-dsp.shared";
import {
  clearAnalyzerSessionAudio,
  loadAnalyzerSessionAudio,
  saveAnalyzerSessionAudio,
  sweepStaleAnalyzerAudio,
} from "@/lib/song-analyzer-session-audio";

const ANALYZER_HANDOFF_KEY = "pb:song-analyzer-handoff";
const NEW_PROJECT_VALUE = "__new__";

export const Route = createFileRoute("/song-analyzer")({
  head: () => ({
    meta: [
      { title: "AI Song Analyzer — PromptBeats" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SongAnalyzerPage,
});

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

function bpmLabel(result: SongAnalysisResult, uncertain = "Uncertain") {
  const bpm = result.generatorReady.bpm;
  if (bpm.rangeMin != null && bpm.rangeMax != null) return `${bpm.rangeMin}–${bpm.rangeMax} BPM`;
  if (bpm.approximate != null) return `≈ ${bpm.approximate} BPM`;
  return uncertain;
}

function observationText(
  items: Array<{ observation: string; confidence: "high" | "medium" | "low" }>,
) {
  return items.map((item) => `[${item.confidence.toUpperCase()}] ${item.observation}`).join("\n");
}

function SongAnalyzerPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useQuery({
    queryKey: ["song-analyzer-access", user?.id],
    queryFn: () => getSongAnalyzerAccess(),
    enabled: Boolean(user),
    retry: false,
  });
  const projects = useQuery({
    queryKey: ["song-analyzer-projects", user?.id],
    queryFn: () => listPromptProjects(),
    enabled: Boolean(user && access.data?.allowed),
  });

  const [file, setFile] = useState<File | null>(null);
  const [trackTitle, setTrackTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [model, setModel] = useState(DEFAULT_SONG_ANALYZER_MODEL);
  const [result, setResult] = useState<SongAnalysisResult | null>(null);
  const [stage0Evidence, setStage0Evidence] = useState<Stage0DspEvidence | null>(null);
  const [legacyStage0Evidence, setLegacyStage0Evidence] = useState<Stage0DspEvidence | null>(null);
  const [stage0DebugExpanded, setStage0DebugExpanded] = useState(false);
  const [legacyStage0DebugExpanded, setLegacyStage0DebugExpanded] = useState(false);
  const [stageAEvidence, setStageAEvidence] = useState<StageAEvidence | null>(null);
  const [stageADebugExpanded, setStageADebugExpanded] = useState(false);
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [newProject, setNewProject] = useState("");
  const [analysisName, setAnalysisName] = useState("Song Analysis");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [restoringAudio, setRestoringAudio] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await sweepStaleAnalyzerAudio();
        const restored = await loadAnalyzerSessionAudio();
        if (!cancelled && restored) setFile(restored);
      } catch {
        // Analyzer still works without browser session persistence.
      } finally {
        if (!cancelled) setRestoringAudio(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fileError = useMemo(() => {
    if (!file) return null;
    if (file.size > SONG_ANALYZER_MAX_FILE_BYTES) return t("songAnalyzer.fileTooLarge");
    return null;
  }, [file, t]);

  const analyze = async () => {
    if (!file || fileError) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    setStage0Evidence(null);
    setLegacyStage0Evidence(null);
    setStage0DebugExpanded(false);
    setLegacyStage0DebugExpanded(false);
    setStageAEvidence(null);
    setStageADebugExpanded(false);
    try {
      const [audioBase64, legacyDspEvidence] = await Promise.all([
        fileToBase64(file),
        analyzeStage0Dsp(file),
      ]);
      setLegacyStage0Evidence(legacyDspEvidence);
      const dspEvidence = await analyzeStage0Essentia(file, legacyDspEvidence);
      setStage0Evidence(dspEvidence);
      const response = await analyzeSong({
        data: {
          requestKey: getAuxiliaryRequestKey("song_analyzer"),
          audioBase64,
          mimeType: file.type as any,
          model: model as any,
          trackTitle: trackTitle.trim() || undefined,
          artist: artist.trim() || undefined,
          stage0Evidence: dspEvidence,
        },
      });
      setResult(response.result);
      setStage0Evidence(response.stage0Evidence);
      setStageAEvidence(response.stageAEvidence);
      setResultModel(response.model);
      completeAuxiliaryRequest("song_analyzer");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("songAnalyzer.analysisFailed"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result || !resultModel || !analysisName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let targetProjectId: string | null = projectId || null;
      if (projectId === NEW_PROJECT_VALUE) {
        if (!newProject.trim()) throw new Error(t("songAnalyzer.newProjectPlaceholder"));
        const created = await createPromptProject({ data: { name: newProject.trim() } });
        targetProjectId = created.project?.id ?? null;
      }
      await saveSongAnalysis({
        data: {
          name: analysisName.trim(),
          projectId: targetProjectId,
          model: resultModel as any,
          result,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["library", "song-analyses"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["song-analyzer-projects"], exact: false }),
      ]);
      setSaved(true);
      setProjectId(targetProjectId ?? "");
      setNewProject("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("songAnalyzer.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const sendToGenerator = () => {
    if (!result || typeof window === "undefined") return;
    window.sessionStorage.setItem(ANALYZER_HANDOFF_KEY, JSON.stringify(result.generatorReady));
    void navigate({ to: "/generate" });
  };

  const generatorFields = result
    ? ([
        [t("songAnalyzer.musicStyle"), result.generatorReady.musicStyle],
        [t("songAnalyzer.mood"), result.generatorReady.mood],
        [
          t("songAnalyzer.bpm"),
          `${bpmLabel(result, t("songAnalyzer.bpmUncertain"))} · confidence: ${result.generatorReady.bpm.confidence}\n${result.generatorReady.bpm.notes}`,
        ],
        [t("songAnalyzer.songStructure"), result.generatorReady.songStructure.join(" → ")],
        [t("songAnalyzer.instruments"), result.generatorReady.instruments.join("\n")],
        [t("songAnalyzer.productionStyle"), result.generatorReady.productionStyle],
        [
          t("songAnalyzer.additionalInstructions"),
          result.generatorReady.additionalInstructions || "—",
        ],
      ] as const)
    : [];

  const stage0RawJson = useMemo(
    () => (stage0Evidence ? JSON.stringify(stage0Evidence, null, 2) : ""),
    [stage0Evidence],
  );

  const legacyStage0RawJson = useMemo(
    () => (legacyStage0Evidence ? JSON.stringify(legacyStage0Evidence, null, 2) : ""),
    [legacyStage0Evidence],
  );

  const stageARawJson = useMemo(
    () => (stageAEvidence ? JSON.stringify(stageAEvidence, null, 2) : ""),
    [stageAEvidence],
  );

  const detailedFields = result
    ? ([
        [t("songAnalyzer.genreStyle"), result.detailedAnalysis.genreAndStyle],
        [t("songAnalyzer.emotionalArc"), result.detailedAnalysis.moodAndEmotionalArc],
        [t("songAnalyzer.tempoGroove"), result.detailedAnalysis.tempoAndGroove],
        [
          t("songAnalyzer.instrumentation"),
          observationText(result.detailedAnalysis.instrumentation),
        ],
        [t("songAnalyzer.arrangement"), result.detailedAnalysis.arrangement],
        [t("songAnalyzer.songStructure"), result.detailedAnalysis.songStructure],
        [t("songAnalyzer.vocals"), result.detailedAnalysis.vocals],
        [
          t("songAnalyzer.productionMix"),
          observationText(result.detailedAnalysis.productionAndMix),
        ],
        [t("songAnalyzer.dynamicsEnergy"), result.detailedAnalysis.dynamicsAndEnergy],
        [t("songAnalyzer.notable"), result.detailedAnalysis.notableCharacteristics.join("\n")],
        [
          t("songAnalyzer.confidenceNotes"),
          result.detailedAnalysis.confidenceAndUncertaintyNotes.join("\n"),
        ],
      ] as const)
    : [];

  const header = (
    <div className="flex items-center gap-2">
      <AudioLines className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">{t("songAnalyzer.title")}</span>
      <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
        {t("songAnalyzer.admin")}
      </span>
    </div>
  );

  if (loading)
    return (
      <AppShell header={header}>
        <main className="p-8 text-sm text-muted-foreground">{t("songAnalyzer.loading")}</main>
      </AppShell>
    );
  if (!user)
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-xl p-8">
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("songAnalyzer.signIn")}</p>
            <Link
              to="/auth"
              className="mt-4 inline-flex rounded-xl bg-gradient-neon px-4 py-2 text-sm font-semibold"
            >
              {t("songAnalyzer.signInButton")}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  if (access.isError)
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-xl p-8">
          <div className="glass rounded-2xl border border-red-400/20 p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-red-300" />
            <h1 className="mt-3 font-display text-lg font-bold">
              {t("songAnalyzer.adminRequired")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("songAnalyzer.adminRequiredBody")}
            </p>
          </div>
        </main>
      </AppShell>
    );
  if (access.isLoading)
    return (
      <AppShell header={header}>
        <main className="p-8 text-sm text-muted-foreground">
          {t("songAnalyzer.checkingAccess")}
        </main>
      </AppShell>
    );

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1500px] px-4 pb-24 pt-6 md:px-8">
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="glass h-fit rounded-2xl p-5">
            <h1 className="font-display text-xl font-bold">{t("songAnalyzer.analyzeComplete")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("songAnalyzer.zeroRetention")}</p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center hover:border-accent/50">
              <Upload className="h-7 w-7 text-accent" />
              <span className="mt-2 text-sm font-semibold">
                {restoringAudio
                  ? t("songAnalyzer.restoringAudio")
                  : file
                    ? file.name
                    : t("songAnalyzer.chooseAudio")}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {t("songAnalyzer.fileTypes")}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".mp3,.wav,.m4a,.mp4,.aac,.ogg,.flac,audio/*"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setResult(null);
                  setStage0Evidence(null);
                  setLegacyStage0Evidence(null);
                  setStageAEvidence(null);
                  setSaved(false);
                  setError(null);
                  if (nextFile) {
                    void saveAnalyzerSessionAudio(nextFile).catch(() =>
                      setError(t("songAnalyzer.sessionPersistFailed")),
                    );
                  }
                }}
              />
            </label>
            {fileError && <p className="mt-2 text-xs text-red-400">{fileError}</p>}
            {file && !fileError && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">{t("songAnalyzer.sessionKept")}</p>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setStage0Evidence(null);
                    setLegacyStage0Evidence(null);
                    setStageAEvidence(null);
                    setResultModel(null);
                    setSaved(false);
                    setError(null);
                    void clearAnalyzerSessionAudio().catch(() => undefined);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-red-400/30 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" /> {t("songAnalyzer.clearAudio")}
                </button>
              </div>
            )}

            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("songAnalyzer.optionalReference")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {t("songAnalyzer.optionalReferenceHelp")}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  {t("songAnalyzer.trackTitleOptional")}
                  <input
                    value={trackTitle}
                    onChange={(e) => setTrackTitle(e.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-foreground outline-none focus:border-primary/60"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  {t("songAnalyzer.artistOptional")}
                  <input
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-foreground outline-none focus:border-primary/60"
                  />
                </label>
              </div>
            </div>

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("songAnalyzer.model")}
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as typeof model)}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-foreground"
              >
                {SONG_ANALYZER_MODELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={analyze}
              disabled={!file || Boolean(fileError) || busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AudioLines className="h-4 w-4" />
              )}
              {busy ? t("songAnalyzer.analyzing") : t("songAnalyzer.analyze")}
            </button>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          </section>

          <section className="space-y-5">
            {!result ? (
              <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
                {t("songAnalyzer.empty")}
              </div>
            ) : (
              <>
                {legacyStage0Evidence && (
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Admin Diagnostic
                        </p>
                        <h2 className="mt-1 font-display text-lg font-bold">
                          Legacy Stage 0 — Comparison
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Previous PromptBeats DSP retained only for side-by-side benchmark during
                          the Essentia experiment.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <CopyAction label="Copy Legacy Stage 0 JSON" value={legacyStage0RawJson} />
                        <button
                          type="button"
                          onClick={() => setLegacyStage0DebugExpanded((value) => !value)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${legacyStage0DebugExpanded ? "rotate-180" : ""}`}
                          />
                          {legacyStage0DebugExpanded ? "Collapse" : "Expand"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">Engine</p>
                        <p className="mt-1 font-semibold">Legacy</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">Primary BPM</p>
                        <p className="mt-1 font-semibold">
                          {legacyStage0Evidence.tempo?.primaryBpm ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">Tempo confidence</p>
                        <p className="mt-1 font-semibold">
                          {legacyStage0Evidence.tempo?.confidence != null
                            ? legacyStage0Evidence.tempo.confidence.toFixed(2)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">Key candidate</p>
                        <p className="mt-1 font-semibold">
                          {legacyStage0Evidence.tonal?.keyCandidate ?? "Uncertain"}
                        </p>
                      </div>
                    </div>
                    {legacyStage0DebugExpanded && (
                      <pre className="mt-4 max-h-[720px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                        {legacyStage0RawJson}
                      </pre>
                    )}
                  </div>
                )}

                {stage0Evidence && (
                  <div className="glass rounded-2xl border border-cyan-400/20 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                          Admin Diagnostic
                        </p>
                        <h2 className="mt-1 font-display text-lg font-bold">
                          Stage 0 — Essentia DSP/MIR Evidence — Debug
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Deterministic signal-derived evidence. Supporting reference only — not
                          musical ground truth and not persisted to the Library.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <CopyAction label="Copy Stage 0 JSON" value={stage0RawJson} />
                        <button
                          type="button"
                          onClick={() => setStage0DebugExpanded((value) => !value)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${stage0DebugExpanded ? "rotate-180" : ""}`}
                          />
                          {stage0DebugExpanded ? "Collapse" : "Expand"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">DSP status</p>
                        <p className="mt-1 font-semibold">
                          {stage0Evidence.available
                            ? stage0Evidence.engine?.name === "essentia"
                              ? "Essentia"
                              : "Legacy fallback"
                            : "Unavailable"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">Primary BPM</p>
                        <p className="mt-1 font-semibold">
                          {stage0Evidence.tempo?.primaryBpm ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">Tempo confidence</p>
                        <p className="mt-1 font-semibold">
                          {stage0Evidence.tempo?.confidence != null
                            ? stage0Evidence.tempo.confidence.toFixed(2)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <p className="text-muted-foreground">Key candidate</p>
                        <p className="mt-1 font-semibold">
                          {stage0Evidence.tonal?.keyCandidate ?? "Uncertain"}
                        </p>
                      </div>
                    </div>
                    {stage0DebugExpanded && (
                      <pre className="mt-4 max-h-[720px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                        {stage0RawJson}
                      </pre>
                    )}
                  </div>
                )}

                {stageAEvidence && (
                  <div className="glass rounded-2xl border border-amber-400/20 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                          Admin Diagnostic
                        </p>
                        <h2 className="mt-1 font-display text-lg font-bold">
                          Stage A Evidence — Debug
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Exact validated Stage A object returned before Stage B synthesis. Not
                          persisted to the Library.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <CopyAction label="Copy Stage A JSON" value={stageARawJson} />
                        <button
                          type="button"
                          onClick={() => setStageADebugExpanded((value) => !value)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:border-amber-400/40 hover:text-amber-200"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${stageADebugExpanded ? "rotate-180" : ""}`}
                          />
                          {stageADebugExpanded ? "Collapse" : "Expand"}
                        </button>
                      </div>
                    </div>
                    {stageADebugExpanded && (
                      <pre className="mt-4 max-h-[720px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                        {stageARawJson}
                      </pre>
                    )}
                  </div>
                )}

                <div className="px-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                    Stage B
                  </p>
                  <h2 className="mt-1 font-display text-lg font-bold">
                    Final Musical Interpretation
                  </h2>
                </div>

                <div className="glass rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-gradient-neon">
                        {t("songAnalyzer.generatorReady")}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {t("songAnalyzer.analyzedWith", {
                          model:
                            SONG_ANALYZER_MODELS.find((item) => item.id === resultModel)?.label ??
                            resultModel ??
                            "",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CopyAction
                        label={t("songAnalyzer.copyAll")}
                        value={generatorFields
                          .map(([label, value]) => `${label}:\n${value}`)
                          .join("\n\n")}
                      />
                      <button
                        onClick={sendToGenerator}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                      >
                        <Wand2 className="h-4 w-4" />
                        {t("songAnalyzer.sendGenerator")}
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {generatorFields.map(([title, value], index) => (
                      <Field key={title} title={title} value={value} wide={index >= 4} />
                    ))}
                  </div>
                </div>

                <div className="glass rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-bold">{t("songAnalyzer.detailed")}</h2>
                    <CopyAction
                      label={t("songAnalyzer.copyAll")}
                      value={detailedFields
                        .map(([label, value]) => `${label}:\n${value}`)
                        .join("\n\n")}
                    />
                  </div>
                  <div className="mt-5 space-y-4">
                    {detailedFields.map(([title, value]) => (
                      <Field key={title} title={title} value={value} wide />
                    ))}
                  </div>
                </div>

                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <Save className="h-4 w-4 text-accent" />
                    <h2 className="font-display text-sm font-bold">
                      {t("songAnalyzer.saveTitle")}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("songAnalyzer.saveHelp")}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("songAnalyzer.analysisName")}
                      <input
                        value={analysisName}
                        maxLength={200}
                        onChange={(e) => {
                          setAnalysisName(e.target.value);
                          setSaved(false);
                        }}
                        placeholder={t("songAnalyzer.analysisNamePlaceholder")}
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-foreground outline-none focus:border-primary/60"
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("songAnalyzer.project")}
                      <select
                        value={projectId}
                        onChange={(e) => {
                          setProjectId(e.target.value);
                          setSaved(false);
                        }}
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-foreground"
                      >
                        <option value="">{t("songAnalyzer.noProject")}</option>
                        {(projects.data?.projects ?? []).map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                        <option value={NEW_PROJECT_VALUE}>
                          + {t("songAnalyzer.createProject")}
                        </option>
                      </select>
                    </label>
                  </div>
                  {projectId === NEW_PROJECT_VALUE && (
                    <input
                      value={newProject}
                      onChange={(e) => {
                        setNewProject(e.target.value);
                        setSaved(false);
                      }}
                      placeholder={t("songAnalyzer.newProjectPlaceholder")}
                      className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm outline-none focus:border-primary/60"
                    />
                  )}
                  <button
                    onClick={save}
                    disabled={
                      saving ||
                      !analysisName.trim() ||
                      (projectId === NEW_PROJECT_VALUE && !newProject.trim())
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-accent/50 px-4 py-2.5 text-sm text-accent disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : saved ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {saved ? t("songAnalyzer.saved") : t("songAnalyzer.save")}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function CopyAction({
  value,
  label,
  iconOnly = false,
}: {
  value: string;
  label: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
      {!iconOnly && label}
    </button>
  );
}

function Field({ title, value, wide = false }: { title: string; value: string; wide?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className={`rounded-xl border border-white/10 bg-black/20 p-4 ${wide ? "md:col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{title}</p>
        <CopyAction value={value} label={t("songAnalyzer.copy")} iconOnly />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{value}</p>
    </div>
  );
}
