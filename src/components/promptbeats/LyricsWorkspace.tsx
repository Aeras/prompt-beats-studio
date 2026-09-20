import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Lock, RotateCcw, Save, Sparkles, Unlock, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getCurrentUserAiModelAccess } from "@/lib/ai.functions";
import {
  getGenerationJob,
  getLatestLyricsSectionEditJob,
  startLyricsSectionEditJob,
  type GenerationJob,
} from "@/lib/generation-jobs.functions";
import { saveLyricsWorkspaceVersion } from "@/lib/lyrics-workspace.functions";
import {
  LYRICS_SECTION_ACTIONS,
  type LyricsSectionAction,
  type LyricsSectionEditOutput,
} from "@/lib/lyrics-workspace.shared";
import { parseLyricsSections, replaceLyricsSection } from "@/lib/lyrics-sections";
import type { GeneratorInputSnapshot } from "@/lib/generator-revision.shared";
import type { AITargetPlatform } from "@/lib/ai-target-platforms";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const WORKSPACE_JOB_STORAGE_KEY = "pb:lyrics-workspace-job";

export type LyricsWorkspaceSong = {
  title: string;
  tags: string;
  note: string;
  lyrics: string;
  theme: string;
  genre: string;
  mood: string;
  language: string;
  targetPlatform: AITargetPlatform;
  generatorInputSnapshot: GeneratorInputSnapshot | null;
};

type Props = {
  song: LyricsWorkspaceSong;
  projectId?: string | null;
  projectName?: string | null;
  basePromptId?: string | null;
  baseVersionNumber?: number | null;
  onClose: (lyrics: string, savedVersion?: { id: string; versionNumber: number } | null) => void;
};

function actionLabelKey(action: LyricsSectionAction) {
  return `lyricsWorkspace.action.${action}` as const;
}

function resultSectionEdit(job: GenerationJob | null): LyricsSectionEditOutput | null {
  if (!job?.result || !("sectionEdit" in job.result)) return null;
  return job.result.sectionEdit;
}

export function LyricsWorkspace({
  song,
  projectId = null,
  projectName = null,
  basePromptId = null,
  baseVersionNumber = null,
  onClose,
}: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [lyrics, setLyrics] = useState(song.lyrics);
  const [baselineLyrics, setBaselineLyrics] = useState(song.lyrics);
  const [locked, setLocked] = useState<Set<string>>(() => new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [action, setAction] = useState<LyricsSectionAction>("rewrite");
  const [customInstruction, setCustomInstruction] = useState("");
  const [proposal, setProposal] = useState<LyricsSectionEditOutput | null>(null);
  const [proposalChoice, setProposalChoice] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [undoBySection, setUndoBySection] = useState<Record<string, string>>({});
  const [lastEditSummary, setLastEditSummary] = useState("Lyrics edit");
  const [currentBasePromptId, setCurrentBasePromptId] = useState(basePromptId);
  const [currentBaseVersion, setCurrentBaseVersion] = useState(baseVersionNumber);
  const [savedVersion, setSavedVersion] = useState<{ id: string; versionNumber: number } | null>(
    basePromptId && baseVersionNumber ? { id: basePromptId, versionNumber: baseVersionNumber } : null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const sections = useMemo(() => parseLyricsSections(lyrics), [lyrics]);
  const dirty = lyrics !== baselineLyrics;
  const modelAccess = useQuery({
    queryKey: ["lyrics-workspace", "model-access"],
    queryFn: () => getCurrentUserAiModelAccess(),
  });
  const generatorAccess = modelAccess.data?.generator;
  const modelOptions = generatorAccess?.modelOptions ?? [];
  const [model, setModel] = useState(song.generatorInputSnapshot?.generationModel ?? "");

  useEffect(() => {
    if (!model && generatorAccess?.defaultModel) setModel(generatorAccess.defaultModel);
  }, [generatorAccess?.defaultModel, model]);

  const clearPolling = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const acceptCompletedJob = (job: GenerationJob) => {
    if (job.status === "failed" || job.status === "cancelled") {
      clearPolling();
      setJobId(null);
      localStorage.removeItem(WORKSPACE_JOB_STORAGE_KEY);
      setAiError(job.error || t("lyricsWorkspace.aiFailed"));
      return true;
    }
    if (job.status !== "completed") return false;
    clearPolling();
    setJobId(null);
    localStorage.removeItem(WORKSPACE_JOB_STORAGE_KEY);
    const next = resultSectionEdit(job);
    if (!next) {
      setAiError(t("lyricsWorkspace.aiInvalid"));
      return true;
    }
    setProposal(next);
    setProposalChoice(0);
    return true;
  };

  const pollJob = async (id: string) => {
    try {
      const res = await getGenerationJob({ data: { jobId: id } });
      if (!res.job) {
        clearPolling();
        setJobId(null);
        localStorage.removeItem(WORKSPACE_JOB_STORAGE_KEY);
        return;
      }
      acceptCompletedJob(res.job);
    } catch {
      // Keep the durable job id and try again on the next poll / reload.
    }
  };

  const startPolling = (id: string) => {
    clearPolling();
    setJobId(id);
    localStorage.setItem(WORKSPACE_JOB_STORAGE_KEY, id);
    void pollJob(id);
    pollRef.current = window.setInterval(() => void pollJob(id), 1500);
  };

  useEffect(() => {
    let cancelled = false;
    const recover = async () => {
      const stored = localStorage.getItem(WORKSPACE_JOB_STORAGE_KEY);
      if (stored) {
        if (!cancelled) startPolling(stored);
        return;
      }
      try {
        const res = await getLatestLyricsSectionEditJob();
        const job = res.job;
        if (!job || job.input?.operation !== "lyrics_section_edit") return;
        const ctx = job.input.sectionEdit;
        const sameSource =
          ctx.fullLyrics === lyrics &&
          (ctx.projectId ?? null) === (projectId ?? null) &&
          (ctx.basePromptId ?? null) === (currentBasePromptId ?? null);
        if (sameSource && !cancelled && ["pending", "processing", "completed"].includes(job.status)) {
          if (!acceptCompletedJob(job)) startPolling(job.jobId);
        }
      } catch {
        // Recovery is best-effort; the user can start a new request.
      }
    };
    void recover();
    return () => {
      cancelled = true;
      clearPolling();
    };
    // Initial source identity only; do not recover a stale job after every manual edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSectionContent = (sectionKey: string, content: string) => {
    if (locked.has(sectionKey)) return;
    const replaced = replaceLyricsSection(lyrics, sectionKey, content);
    if (!replaced.ok) return;
    setLyrics(replaced.lyrics);
    setProposal(null);
    setAiError(null);
  };

  const openAiEditor = (sectionKey: string) => {
    if (locked.has(sectionKey)) return;
    setEditingKey(sectionKey);
    setAction("rewrite");
    setCustomInstruction("");
    setProposal(null);
    setProposalChoice(0);
    setAiError(null);
  };

  const runAiEdit = async () => {
    if (!editingKey || locked.has(editingKey) || jobId) return;
    if (action === "custom" && !customInstruction.trim()) {
      setAiError(t("lyricsWorkspace.customRequired"));
      return;
    }
    setAiError(null);
    setProposal(null);
    try {
      const res = await startLyricsSectionEditJob({
        data: {
          idempotencyKey: crypto.randomUUID(),
          generationModel: model || null,
          fullLyrics: lyrics,
          sectionKey: editingKey,
          action,
          customInstruction,
          title: song.title,
          tags: song.tags,
          note: song.note,
          theme: song.theme,
          genre: song.genre,
          mood: song.mood,
          language: song.language,
          targetPlatform: song.targetPlatform,
          generatorInputSnapshot: song.generatorInputSnapshot,
          projectId: projectId ?? null,
          basePromptId: currentBasePromptId ?? null,
        },
      });
      if (res.rateLimited) {
        setAiError(t("lyricsWorkspace.rateLimited"));
        return;
      }
      if (!res.job || res.job.input?.operation !== "lyrics_section_edit") {
        setAiError(t("lyricsWorkspace.otherJobActive"));
        return;
      }
      if (!acceptCompletedJob(res.job)) startPolling(res.job.jobId);
      void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t("lyricsWorkspace.aiFailed"));
    }
  };

  const proposalOptions = proposal ? [proposal.replacement, ...proposal.alternatives] : [];
  const applyProposal = () => {
    if (!editingKey || !proposal || locked.has(editingKey)) return;
    const section = sections.find((item) => item.key === editingKey);
    if (!section) {
      setAiError(t("lyricsWorkspace.sectionChanged"));
      return;
    }
    const chosen = proposalOptions[proposalChoice] ?? proposal.replacement;
    const replaced = replaceLyricsSection(lyrics, editingKey, chosen);
    if (!replaced.ok) {
      setAiError(replaced.error);
      return;
    }
    setUndoBySection((prev) => ({ ...prev, [editingKey]: section.content }));
    setLyrics(replaced.lyrics);
    setLastEditSummary(`${section.displayLabel} · ${t(actionLabelKey(action))}`.slice(0, 120));
    setProposal(null);
    setEditingKey(null);
    setCustomInstruction("");
  };

  const undoSection = (sectionKey: string) => {
    const previous = undoBySection[sectionKey];
    if (previous == null || locked.has(sectionKey)) return;
    const replaced = replaceLyricsSection(lyrics, sectionKey, previous);
    if (!replaced.ok) return;
    setLyrics(replaced.lyrics);
    setUndoBySection((prev) => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
  };

  const saveAsVersion = async () => {
    if (!projectId || !currentBasePromptId || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveLyricsWorkspaceVersion({
        data: {
          projectId,
          basePromptId: currentBasePromptId,
          lyrics,
          versionLabel: lastEditSummary || "Lyrics edit",
        },
      });
      setCurrentBasePromptId(saved.savedPromptId);
      setCurrentBaseVersion(saved.versionNumber);
      setSavedVersion({ id: saved.savedPromptId, versionNumber: saved.versionNumber });
      setBaselineLyrics(lyrics);
      setUndoBySection({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["generator", "revision-versions"], exact: false }),
      ]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("lyricsWorkspace.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const closeWorkspace = () => {
    if (projectId && dirty && !window.confirm(t("lyricsWorkspace.unsavedConfirm"))) return;
    onClose(lyrics, savedVersion);
  };

  return (
    <div className="space-y-4 rounded-3xl border border-accent/25 bg-black/30 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">{t("lyricsWorkspace.title")}</p>
          <h2 className="mt-1 truncate font-display text-xl font-bold">{song.title || t("library.untitledPrompt")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {[projectName, currentBaseVersion ? `V${currentBaseVersion}` : null, song.language].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modelOptions.length > 0 && (
            <select
              aria-label={t("lyricsWorkspace.model")}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-10 min-w-0 max-w-full rounded-xl border border-white/10 bg-black/50 px-3 text-xs"
            >
              {modelOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          )}
          {projectId && currentBasePromptId && (
            <button
              type="button"
              onClick={saveAsVersion}
              disabled={!dirty || saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-accent/40 px-3 text-xs font-semibold text-accent disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("lyricsWorkspace.saveNewVersion")}
            </button>
          )}
          <button type="button" onClick={closeWorkspace} aria-label={t("common.close")} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {projectId && !dirty && savedVersion && savedVersion.id !== basePromptId && (
        <p className="rounded-xl border border-green-400/20 bg-green-400/5 p-3 text-xs text-green-300">
          {t("lyricsWorkspace.savedAsVersion", { version: savedVersion.versionNumber })}
        </p>
      )}
      {saveError && <p className="text-xs text-red-400">{saveError}</p>}

      <div className="space-y-3">
        {sections.map((section) => {
          const isLocked = locked.has(section.key);
          const editing = editingKey === section.key;
          const canUndo = undoBySection[section.key] != null;
          return (
            <section key={section.key} className={cn("rounded-2xl border p-3 sm:p-4", isLocked ? "border-white/10 bg-white/[0.02]" : "border-white/10 bg-black/25")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold text-foreground">{section.displayLabel}</h3>
                  {section.rawHeader && <p className="text-[10px] text-muted-foreground">{section.rawHeader}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {canUndo && (
                    <button type="button" onClick={() => undoSection(section.key)} disabled={isLocked} aria-label={t("lyricsWorkspace.undo")} title={t("lyricsWorkspace.undo")} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent disabled:opacity-40">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLocked((prev) => {
                      const next = new Set(prev);
                      if (next.has(section.key)) next.delete(section.key); else next.add(section.key);
                      return next;
                    })}
                    aria-pressed={isLocked}
                    aria-label={isLocked ? t("lyricsWorkspace.unlock") : t("lyricsWorkspace.lock")}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent"
                  >
                    {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => openAiEditor(section.key)} disabled={isLocked || Boolean(jobId)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/30 px-2.5 text-xs text-accent disabled:opacity-40">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("lyricsWorkspace.aiEdit")}
                  </button>
                </div>
              </div>

              <textarea
                value={section.content}
                onChange={(e) => setSectionContent(section.key, e.target.value)}
                disabled={isLocked}
                rows={Math.max(4, Math.min(14, section.content.split(/\r?\n/).length + 1))}
                aria-label={t("lyricsWorkspace.sectionEditor", { section: section.displayLabel })}
                className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 text-sm leading-6 outline-none focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
              />

              {editing && !isLocked && (
                <div className="mt-3 space-y-3 rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select value={action} onChange={(e) => { setAction(e.target.value as LyricsSectionAction); setProposal(null); setAiError(null); }} className="h-10 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 text-xs">
                      {LYRICS_SECTION_ACTIONS.map((item) => <option key={item} value={item}>{t(actionLabelKey(item))}</option>)}
                    </select>
                    <button type="button" onClick={() => { setEditingKey(null); setProposal(null); setAiError(null); }} className="h-10 rounded-lg border border-white/10 px-3 text-xs text-muted-foreground">{t("common.cancel")}</button>
                  </div>
                  {action === "custom" && (
                    <textarea value={customInstruction} onChange={(e) => setCustomInstruction(e.target.value.slice(0, 2000))} rows={3} placeholder={t("lyricsWorkspace.customPlaceholder")} className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs outline-none focus:border-accent/50" />
                  )}

                  {!proposal && (
                    <button type="button" onClick={runAiEdit} disabled={Boolean(jobId) || !model} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-neon px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                      {jobId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {jobId ? t("lyricsWorkspace.editing") : t("lyricsWorkspace.generateProposal")}
                    </button>
                  )}

                  {proposal && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">{t("lyricsWorkspace.preview")}</p>
                      {proposalOptions.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                          {proposalOptions.map((_, index) => (
                            <button key={index} type="button" onClick={() => setProposalChoice(index)} className={proposalChoice === index ? "rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs text-accent" : "rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground"}>
                              {t("lyricsWorkspace.option", { option: String.fromCharCode(65 + index) })}
                            </button>
                          ))}
                        </div>
                      )}
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/50 p-3 text-sm leading-6">{proposalOptions[proposalChoice] ?? proposal.replacement}</pre>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={applyProposal} className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-neon px-4 text-xs font-semibold text-primary-foreground"><Check className="h-4 w-4" />{t("lyricsWorkspace.apply")}</button>
                        <button type="button" onClick={() => { setProposal(null); void runAiEdit(); }} disabled={Boolean(jobId)} className="h-9 rounded-lg border border-white/10 px-3 text-xs text-muted-foreground">{t("common.retry")}</button>
                        <button type="button" onClick={() => { setProposal(null); setEditingKey(null); }} className="h-9 rounded-lg border border-white/10 px-3 text-xs text-muted-foreground">{t("common.cancel")}</button>
                      </div>
                    </div>
                  )}

                  {aiError && <p className="text-xs text-red-400">{aiError}</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{dirty ? t("lyricsWorkspace.unsaved") : t("lyricsWorkspace.noUnsaved")}</span>
        <span>{t("lyricsWorkspace.sectionCount", { count: sections.length })}</span>
      </div>
    </div>
  );
}
