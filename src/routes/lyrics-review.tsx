import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Languages,
  ListMusic,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { getCurrentUserAiModelAccess } from "@/lib/ai.functions";
import { getGenerationJob } from "@/lib/generation-jobs.functions";
import {
  getLyricsReviewProjectContext,
  saveLyricsReviewProjectVersion,
  startLyricsReviewSectionEditJob,
} from "@/lib/lyrics-review.functions";
import {
  LYRICS_REVIEW_LANGUAGES,
  analyzeLyricsDeterministic,
  detectLyricsLanguage,
  lyricsReviewLanguageFromCanonical,
  type LyricsReviewLanguageCode,
} from "@/lib/lyrics-review.shared";
import {
  readLyricsReviewGeneratorHandoff,
  writeLyricsReviewGeneratorHandoff,
  type LyricsReviewGeneratorHandoff,
} from "@/lib/lyrics-review-handoff.shared";
import { replaceLyricsSection } from "@/lib/lyrics-sections";
import type { LyricsSectionEditOutput } from "@/lib/lyrics-workspace.shared";
import { DEFAULT_AI_TARGET_PLATFORM } from "@/lib/ai-target-platforms";
import { cn } from "@/lib/utils";
import { useAccountPreferences } from "@/lib/account-preferences";
import { useDraftAutosave } from "@/lib/draft-autosave";

const searchSchema = z.object({
  source: z.enum(["project", "generator"]).optional(),
  project: z.string().guid().optional(),
  version: z.string().guid().optional(),
  handoff: z.string().guid().optional(),
});

export const Route = createFileRoute("/lyrics-review")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Lyrics Review — Meter, Rhyme & Singability | PromptBeats" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LyricsReviewPage,
});

type SourceMode = "standalone" | "project" | "generator";
type ProposalState = { sectionKey: string; result: LyricsSectionEditOutput } | null;

function languageLabel(code: LyricsReviewLanguageCode, appLanguage: string) {
  const entry = LYRICS_REVIEW_LANGUAGES.find((item) => item.code === code);
  return entry ? entry.label[appLanguage === "el" ? "el" : "en"] : code;
}

function sourceMode(search: z.infer<typeof searchSchema>): SourceMode {
  if (search.source === "project" && search.project) return "project";
  if (search.source === "generator" && search.handoff) return "generator";
  return "standalone";
}

function LyricsReviewPage() {
  const { language: appLanguage } = useI18n();
  const el = appLanguage === "el";
  const { user, loading } = useAuth();
  const { preferences: accountPreferences } = useAccountPreferences();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const mode = sourceMode(search);
  const access = useFeatureAccess("lyrics_review");
  const queryClient = useQueryClient();

  const projectContext = useQuery({
    queryKey: ["lyrics-review", "project", search.project, search.version],
    queryFn: () =>
      getLyricsReviewProjectContext({
        data: { projectId: search.project!, versionId: search.version ?? null },
      }),
    enabled: Boolean(user && access.allowed && mode === "project" && search.project),
    retry: false,
  });

  const [generatorHandoff, setGeneratorHandoff] = useState<LyricsReviewGeneratorHandoff | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [baselineLyrics, setBaselineLyrics] = useState("");
  const [languageCode, setLanguageCode] = useState<LyricsReviewLanguageCode>("en");
  const [manualLanguage, setManualLanguage] = useState(false);
  const [detectionConfidence, setDetectionConfidence] = useState<"high" | "medium" | "low">("low");
  const [sourceReady, setSourceReady] = useState(mode === "standalone");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [aiSectionKey, setAiSectionKey] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalState>(null);
  const [proposalChoice, setProposalChoice] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<{ lyrics: string; sectionKey: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lyricsReviewDraftScope =
    mode === "project"
      ? `lyrics-review:project:${search.project ?? "none"}:${search.version ?? "latest"}`
      : mode === "generator"
        ? `lyrics-review:generator:${search.handoff ?? "none"}`
        : "lyrics-review:standalone";
  const clearLyricsReviewDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: lyricsReviewDraftScope,
    enabled: Boolean(user && sourceReady && accountPreferences.autoSaveDrafts),
    value: { title, lyrics, languageCode, manualLanguage },
    onRestore: (draft) => {
      setTitle(draft.title);
      setLyrics(draft.lyrics);
      setLanguageCode(draft.languageCode);
      setManualLanguage(draft.manualLanguage);
    },
    isEmpty: (draft) =>
      mode === "standalone"
        ? !draft.title.trim() && !draft.lyrics.trim()
        : draft.lyrics === baselineLyrics,
  });

  const modelAccess = useQuery({
    queryKey: ["lyrics-review", "model-access"],
    queryFn: () => getCurrentUserAiModelAccess(),
    enabled: Boolean(user && access.allowed),
  });
  const modelOptions = modelAccess.data?.generator.modelOptions ?? [];
  const [model, setModel] = useState("");
  useEffect(() => {
    if (!model && modelAccess.data?.generator.defaultModel)
      setModel(modelAccess.data.generator.defaultModel);
  }, [model, modelAccess.data?.generator.defaultModel]);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (mode !== "generator" || !search.handoff) return;
    const handoff = readLyricsReviewGeneratorHandoff(search.handoff);
    if (!handoff) {
      setAiError(
        el
          ? "Το Generator handoff δεν είναι πλέον διαθέσιμο."
          : "The Generator handoff is no longer available.",
      );
      return;
    }
    setGeneratorHandoff(handoff);
    setTitle(handoff.result.title);
    setLyrics(handoff.result.lyrics);
    setBaselineLyrics(handoff.result.lyrics);
    const known = lyricsReviewLanguageFromCanonical(handoff.authoritativeLanguage);
    if (known) setLanguageCode(known);
    setManualLanguage(true);
    setSourceReady(true);
  }, [mode, search.handoff, el]);

  useEffect(() => {
    const data = projectContext.data;
    if (mode !== "project" || !data) return;
    setTitle(data.selected.title || data.project.name);
    setLyrics(data.selected.lyrics);
    setBaselineLyrics(data.selected.lyrics);
    const known = lyricsReviewLanguageFromCanonical(data.selected.language);
    if (known) setLanguageCode(known);
    setManualLanguage(true);
    setSourceReady(true);
    setProposal(null);
    setLastApplied(null);
  }, [mode, projectContext.data]);

  useEffect(() => {
    if (mode !== "standalone" || manualLanguage || !lyrics.trim()) return;
    const detection = detectLyricsLanguage(lyrics);
    if (detection.code) setLanguageCode(detection.code);
    setDetectionConfidence(detection.confidence);
  }, [lyrics, manualLanguage, mode]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await getGenerationJob({ data: { jobId } });
        if (cancelled || !response.job) return;
        const job = response.job;
        if (job.status === "failed" || job.status === "cancelled") {
          setJobId(null);
          setAiSectionKey(null);
          setAiError(job.error || (el ? "Το Deep Review απέτυχε." : "Deep Review failed."));
          return;
        }
        if (job.status !== "completed") return;
        setJobId(null);
        setAiSectionKey(null);
        if (!job.result || !("sectionEdit" in job.result)) {
          setAiError(
            el ? "Το AI επέστρεψε μη έγκυρη απάντηση." : "The AI returned an invalid response.",
          );
          return;
        }
        setProposal({
          sectionKey: job.result.sectionEdit.sectionLabel
            ? (aiSectionKey ?? "")
            : (aiSectionKey ?? ""),
          result: job.result.sectionEdit,
        });
        setProposalChoice(0);
      } catch {
        // Keep deterministic analysis and current lyric edits intact. Poll again.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, aiSectionKey, el]);

  useEffect(() => {
    const dirty = lyrics !== baselineLyrics;
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [lyrics, baselineLyrics]);

  const analysis = useMemo(
    () => (lyrics.trim() ? analyzeLyricsDeterministic(lyrics, languageCode) : null),
    [lyrics, languageCode],
  );
  const dirty = lyrics !== baselineLyrics;
  const selectedProject = projectContext.data?.selected ?? null;

  const changeVersion = (versionId: string) => {
    if (
      dirty &&
      !window.confirm(
        el
          ? "Έχεις μη αποθηκευμένες αλλαγές. Συνέχεια χωρίς αποθήκευση;"
          : "You have unsaved changes. Continue without saving?",
      )
    )
      return;
    void navigate({
      to: "/lyrics-review",
      search: { source: "project", project: search.project, version: versionId },
      replace: true,
    });
  };

  const startDeepReview = async (sectionKey: string) => {
    if (!lyrics.trim() || jobId) return;
    setAiError(null);
    setProposal(null);
    setAiSectionKey(sectionKey);
    try {
      const snapshot =
        mode === "project"
          ? (selectedProject?.generatorInputSnapshot ?? null)
          : (generatorHandoff?.snapshot ?? null);
      const authoritativeLanguage =
        mode === "standalone"
          ? (LYRICS_REVIEW_LANGUAGES.find((item) => item.code === languageCode)?.canonical ??
            "English")
          : mode === "project"
            ? selectedProject?.language ||
              LYRICS_REVIEW_LANGUAGES.find((item) => item.code === languageCode)?.canonical ||
              "English"
            : generatorHandoff?.authoritativeLanguage || "English";
      const response = await startLyricsReviewSectionEditJob({
        data: {
          feature: "lyrics_review",
          idempotencyKey: crypto.randomUUID(),
          generationModel: model || null,
          fullLyrics: lyrics,
          sectionKey,
          action: "improve_singability",
          customInstruction:
            "Preserve meaning and language. Make only targeted changes that materially improve natural phrasing, rhythmic flow, word stress, or singability. Do not rewrite unrelated lines.",
          title,
          tags:
            mode === "project"
              ? (selectedProject?.tags ?? "")
              : (generatorHandoff?.result.tags ?? ""),
          note:
            mode === "project"
              ? (selectedProject?.note ?? "")
              : (generatorHandoff?.result.note ?? ""),
          theme:
            mode === "project"
              ? (selectedProject?.theme ?? "")
              : (generatorHandoff?.snapshot.theme ?? ""),
          genre:
            mode === "project"
              ? (selectedProject?.genre ?? "")
              : (generatorHandoff?.snapshot.customMusicStyle ?? ""),
          mood:
            mode === "project"
              ? (selectedProject?.mood ?? "")
              : (generatorHandoff?.snapshot.customMood ?? ""),
          language: authoritativeLanguage,
          targetPlatform: snapshot?.targetPlatform ?? DEFAULT_AI_TARGET_PLATFORM,
          generatorInputSnapshot: snapshot,
          projectId: mode === "project" ? (search.project ?? null) : null,
          basePromptId: mode === "project" ? (selectedProject?.id ?? null) : null,
        },
      });
      if (response.rateLimited || !response.jobId) {
        setAiSectionKey(null);
        setAiError(
          el
            ? "Το όριο AI χρήσης έχει εξαντληθεί προσωρινά."
            : "The AI usage limit is temporarily exhausted.",
        );
        return;
      }
      setJobId(response.jobId);
    } catch (error) {
      setAiSectionKey(null);
      setAiError(
        error instanceof Error
          ? error.message
          : el
            ? "Το Deep Review απέτυχε."
            : "Deep Review failed.",
      );
    }
  };

  const proposalOptions = proposal
    ? [proposal.result.replacement, ...proposal.result.alternatives]
    : [];
  const applyProposal = () => {
    if (!proposal) return;
    const replacement = proposalOptions[proposalChoice] ?? proposal.result.replacement;
    const replaced = replaceLyricsSection(lyrics, proposal.sectionKey, replacement);
    if (!replaced.ok) {
      setAiError(replaced.error);
      return;
    }
    setLastApplied({ lyrics, sectionKey: proposal.sectionKey });
    setLyrics(replaced.lyrics);
    setProposal(null);
  };

  const undoLast = () => {
    if (!lastApplied) return;
    setLyrics(lastApplied.lyrics);
    setLastApplied(null);
  };

  const saveProject = async (saveMode: "new_version" | "replace_latest") => {
    if (!search.project || !selectedProject || !dirty || saving) return;
    if (saveMode === "replace_latest") {
      if (!selectedProject.isLeaf) return;
      const confirmed = window.confirm(
        el
          ? `Η V${selectedProject.versionNumber ?? "?"} θα αντικατασταθεί με τις νέες αλλαγές. Η προηγούμενη μορφή της δεν θα παραμείνει ως ξεχωριστή version. Συνέχεια;`
          : `V${selectedProject.versionNumber ?? "?"} will be replaced with these changes. Its previous form will not remain as a separate version. Continue?`,
      );
      if (!confirmed) return;
    }
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const saved = await saveLyricsReviewProjectVersion({
        data: {
          projectId: search.project,
          basePromptId: selectedProject.id,
          lyrics,
          mode: saveMode,
        },
      });
      clearLyricsReviewDraft();
      setBaselineLyrics(lyrics);
      setLastApplied(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["project-version-history", search.project] }),
      ]);
      setSavedMessage(
        saved.replaced
          ? el
            ? `Η V${saved.versionNumber} ενημερώθηκε.`
            : `V${saved.versionNumber} was updated.`
          : el
            ? `Αποθηκεύτηκε ως V${saved.versionNumber}.`
            : `Saved as V${saved.versionNumber}.`,
      );
      if (!saved.replaced) {
        void navigate({
          to: "/lyrics-review",
          search: { source: "project", project: search.project, version: saved.savedPromptId },
          replace: true,
        });
      } else {
        void projectContext.refetch();
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : el ? "Η αποθήκευση απέτυχε." : "Save failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  const returnToGenerator = (apply: boolean) => {
    if (!search.handoff || !generatorHandoff) return;
    if (
      !apply &&
      dirty &&
      !window.confirm(
        el
          ? "Να επιστρέψεις χωρίς τις αλλαγές του Lyrics Review;"
          : "Return without the Lyrics Review changes?",
      )
    )
      return;
    clearLyricsReviewDraft();
    writeLyricsReviewGeneratorHandoff({
      ...generatorHandoff,
      returnMode: apply ? "apply" : "discard",
      reviewedLyrics: apply ? lyrics : null,
    });
    void navigate({ to: "/generate", search: { reviewReturn: search.handoff } as never });
  };

  const exitStandalone = () => {
    if (
      dirty &&
      !window.confirm(
        el
          ? "Έχεις αλλαγές που δεν έχουν αντιγραφεί. Έξοδος;"
          : "You have changes that have not been copied. Exit?",
      )
    )
      return;
    clearLyricsReviewDraft();
    void navigate({ to: "/" });
  };

  if (loading || access.isLoading || (mode === "project" && projectContext.isLoading)) {
    return (
      <AppShell header={<HeaderTitle el={el} />}>
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {el ? "Φόρτωση Lyrics Review..." : "Loading Lyrics Review..."}
          </p>
        </main>
      </AppShell>
    );
  }
  if (!access.allowed) {
    return (
      <AppShell header={<HeaderTitle el={el} />}>
        <main className="mx-auto max-w-3xl p-4 md:p-8">
          <div className="glass rounded-2xl p-6">
            <p className="text-sm text-muted-foreground">
              {el
                ? "Το Lyrics Review δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
                : "Lyrics Review is not available for this account."}
            </p>
          </div>
        </main>
      </AppShell>
    );
  }
  if (mode === "project" && projectContext.error) {
    return (
      <AppShell header={<HeaderTitle el={el} />}>
        <main className="mx-auto max-w-3xl p-4 md:p-8">
          <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
            {projectContext.error instanceof Error
              ? projectContext.error.message
              : "Project could not be loaded."}
          </p>
        </main>
      </AppShell>
    );
  }

  const sourceText =
    mode === "project"
      ? `${el ? "Project" : "Project"}: ${projectContext.data?.project.name ?? "—"} · V${selectedProject?.versionNumber ?? "?"}`
      : mode === "generator"
        ? el
          ? "Από AI Generator"
          : "From AI Generator"
        : el
          ? "Αυτόνομη ανάλυση"
          : "Standalone analysis";

  return (
    <AppShell header={<HeaderTitle el={el} />}>
      <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8">
        <section className="glass rounded-2xl border border-accent/20 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                {sourceText}
              </p>
              <h1 className="mt-1 truncate font-display text-xl font-bold">
                {title || (el ? "Χωρίς τίτλο" : "Untitled lyrics")}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {el
                  ? "Meter, rhyme clues, επαναλήψεις και στοχευμένη βελτίωση τραγουδιστικότητας."
                  : "Meter, rhyme clues, repetitions, and targeted singability refinement."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {mode === "generator" && (
                <>
                  <button
                    type="button"
                    onClick={() => returnToGenerator(false)}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-muted-foreground"
                  >
                    {el ? "Επιστροφή χωρίς αλλαγές" : "Return Without Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => returnToGenerator(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-neon px-3 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {el ? "Εφαρμογή & Επιστροφή" : "Apply Changes & Return"}
                  </button>
                </>
              )}
              {mode === "project" && (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/library" })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {el ? "Πίσω στη Library" : "Back to Library"}
                </button>
              )}
              {mode === "standalone" && (
                <button
                  type="button"
                  onClick={exitStandalone}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {el ? "Έξοδος" : "Exit"}
                </button>
              )}
            </div>
          </div>

          {mode === "project" && projectContext.data && (
            <label className="mt-4 block text-xs text-muted-foreground">
              <span className="mb-1.5 block font-semibold text-foreground">
                {el ? "Έκδοση Project" : "Project version"}
              </span>
              <select
                value={selectedProject?.id ?? ""}
                onChange={(event) => changeVersion(event.target.value)}
                className="h-10 w-full max-w-sm rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-foreground"
              >
                {projectContext.data.versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    V{version.versionNumber ?? "?"}
                    {version.versionLabel ? ` · ${version.versionLabel}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {mode === "standalone" && (
          <section className="glass rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {el ? "Επικόλλησε τους στίχους" : "Paste lyrics"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {el
                    ? "Η γλώσσα αναγνωρίζεται αυτόματα και μπορείς να τη διορθώσεις."
                    : "Language is detected automatically and can be corrected manually."}
                </p>
              </div>
              {lyrics.trim() && (
                <label className="min-w-[220px] text-xs text-muted-foreground">
                  <span className="mb-1 block">
                    <Languages className="mr-1 inline h-3.5 w-3.5" />
                    {!manualLanguage
                      ? detectionConfidence === "low"
                        ? `${el ? "Πιθανή γλώσσα" : "Likely language"}: ${languageLabel(languageCode, appLanguage)}`
                        : `${el ? "Αναγνωρίστηκε" : "Detected"}: ${languageLabel(languageCode, appLanguage)}`
                      : `${el ? "Γλώσσα στίχων" : "Lyrics language"}: ${languageLabel(languageCode, appLanguage)}`}
                  </span>
                  <select
                    value={languageCode}
                    onChange={(event) => {
                      setLanguageCode(event.target.value as LyricsReviewLanguageCode);
                      setManualLanguage(true);
                    }}
                    className="h-10 w-full rounded-xl border border-accent/25 bg-black/40 px-3 text-sm text-foreground"
                  >
                    {LYRICS_REVIEW_LANGUAGES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label[el ? "el" : "en"]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <textarea
              value={lyrics}
              onChange={(event) => {
                setLyrics(event.target.value.slice(0, 12000));
                if (!event.target.value.trim()) setManualLanguage(false);
              }}
              rows={12}
              placeholder={
                el ? "[Verse 1]\nΟι στίχοι σου εδώ..." : "[Verse 1]\nYour lyrics here..."
              }
              className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 outline-none focus:border-accent/40"
            />
          </section>
        )}

        {mode !== "standalone" && sourceReady && (
          <section className="glass rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {el ? "Στίχοι προς ανάλυση" : "Lyrics under review"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {el
                    ? "Μπορείς να τους επεξεργαστείς πριν από την αποθήκευση ή επιστροφή."
                    : "You can edit them before saving or returning."}
                </p>
              </div>
              <span className="rounded-full border border-accent/25 px-2.5 py-1 text-[10px] font-semibold text-accent">
                {languageLabel(languageCode, appLanguage)}
              </span>
            </div>
            <textarea
              value={lyrics}
              onChange={(event) => setLyrics(event.target.value.slice(0, 12000))}
              rows={12}
              className="mt-4 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 outline-none focus:border-accent/40"
            />
          </section>
        )}

        {analysis && (
          <>
            <section className="glass rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                    {el ? "Άμεση ανάλυση" : "Instant Analysis"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {el
                      ? "Deterministic metrics — χωρίς AI request ή AI credits."
                      : "Deterministic metrics — no AI request or AI credits."}
                  </p>
                </div>
                {lastApplied && (
                  <button
                    type="button"
                    onClick={undoLast}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Undo
                  </button>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  [el ? "Ενότητες" : "Sections", analysis.overview.sectionCount],
                  [el ? "Γραμμές" : "Lines", analysis.overview.lineCount],
                  [el ? "Λέξεις" : "Words", analysis.overview.wordCount],
                  [el ? "Αποκλίσεις" : "Outliers", analysis.overview.outlierLineCount],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-xl font-bold text-accent">{value}</p>
                  </div>
                ))}
              </div>
              {(analysis.overview.repeatedWords.length > 0 ||
                analysis.overview.repeatedPhrases.length > 0) && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ObservationBox
                    title={el ? "Επαναλαμβανόμενες λέξεις" : "Repeated words"}
                    values={analysis.overview.repeatedWords.map(
                      (item) => `${item.value} ×${item.count}`,
                    )}
                  />
                  <ObservationBox
                    title={el ? "Επαναλαμβανόμενες φράσεις" : "Repeated phrases"}
                    values={analysis.overview.repeatedPhrases.map(
                      (item) => `${item.value} ×${item.count}`,
                    )}
                  />
                </div>
              )}
            </section>

            <div className="space-y-3">
              {analysis.sections.map((section) => {
                const open = openSections.has(section.key);
                const sectionProposal = proposal?.sectionKey === section.key ? proposal : null;
                return (
                  <section
                    key={section.key}
                    className="glass overflow-hidden rounded-2xl border border-white/10"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSections((current) => {
                          const next = new Set(current);
                          if (next.has(section.key)) next.delete(section.key);
                          else next.add(section.key);
                          return next;
                        })
                      }
                      className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    >
                      <div>
                        <p className="font-display text-sm font-bold">{section.label}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {section.lines.length} {el ? "γραμμές" : "lines"}
                          {section.rhymeGroups.length
                            ? ` · ${section.rhymeGroups.length} ${el ? "rhyme clues" : "rhyme clues"}`
                            : ""}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>
                    {open && (
                      <div className="border-t border-white/10 p-3 sm:p-4">
                        <div className="space-y-2">
                          {section.lines.map((line) => (
                            <div
                              key={line.index}
                              className={cn(
                                "rounded-xl border p-3",
                                line.flags.length
                                  ? "border-amber-300/20 bg-amber-300/[0.03]"
                                  : "border-white/10 bg-black/20",
                              )}
                            >
                              <p className="text-sm leading-5">{line.text}</p>
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                <span>
                                  {el ? "Λέξεις" : "Words"}: {line.words}
                                </span>
                                <span>
                                  {el ? "Περ. συλλαβές" : "Approx. syllables"}:{" "}
                                  {line.approximateSyllables ?? "—"}
                                </span>
                                {line.rhymeEnding && (
                                  <span>
                                    {el ? "Κατάληξη" : "Ending clue"}: {line.rhymeEnding}
                                  </span>
                                )}
                                {line.flags.includes("long_line") && (
                                  <span className="text-amber-200">
                                    {el
                                      ? "Αισθητά μεγαλύτερη από τις γειτονικές γραμμές"
                                      : "Noticeably longer than neighboring lines"}
                                  </span>
                                )}
                                {line.flags.includes("short_line") && (
                                  <span className="text-amber-200">
                                    {el
                                      ? "Αισθητά μικρότερη από τις γειτονικές γραμμές"
                                      : "Noticeably shorter than neighboring lines"}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {section.rhymeGroups.length > 0 && (
                          <div className="mt-3 rounded-xl border border-accent/15 bg-accent/[0.025] p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                              {el
                                ? "Πιθανές σχέσεις ομοιοκαταληξίας"
                                : "Possible rhyme relationships"}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {section.rhymeGroups
                                .map((group) => `${group.ending}: ${group.lineIndexes.join(", ")}`)
                                .join(" · ")}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground/70">
                              {el
                                ? "Clues βάσει καταλήξεων — όχι phonetic rhyme score."
                                : "Ending-based clues — not a phonetic rhyme score."}
                            </p>
                          </div>
                        )}

                        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-accent/20 bg-accent/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold text-accent">
                              {el ? "Deep Singability Review" : "Deep Singability Review"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {el
                                ? "AI πρόταση μόνο για αυτή την ενότητα, με διατήρηση νοήματος."
                                : "AI suggestion for this section only, preserving meaning."}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {modelOptions.length > 1 && (
                              <select
                                value={model}
                                onChange={(event) => setModel(event.target.value)}
                                className="h-9 max-w-[170px] rounded-lg border border-white/10 bg-black/40 px-2 text-[10px]"
                              >
                                {modelOptions.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              type="button"
                              disabled={Boolean(jobId) || modelOptions.length === 0}
                              onClick={() => startDeepReview(section.key)}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-accent/30 px-3 text-xs font-semibold text-accent disabled:opacity-40"
                            >
                              {jobId && aiSectionKey === section.key ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Wand2 className="h-3.5 w-3.5" />
                              )}
                              {el ? "Πρόταση βελτίωσης" : "Suggest improvement"}
                            </button>
                          </div>
                        </div>

                        {sectionProposal && (
                          <div className="mt-3 rounded-xl border border-accent/25 bg-black/25 p-3">
                            <p className="text-xs font-semibold">
                              {el ? "Πρόταση πριν την εφαρμογή" : "Preview before apply"}
                            </p>
                            <div className="mt-2 space-y-2">
                              {proposalOptions.map((option, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  aria-pressed={proposalChoice === index}
                                  onClick={() => setProposalChoice(index)}
                                  className={cn(
                                    "w-full rounded-xl border p-3 text-left text-xs leading-5",
                                    proposalChoice === index
                                      ? "border-accent/45 bg-accent/[0.06]"
                                      : "border-white/10 bg-black/20",
                                  )}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setProposal(null)}
                                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-foreground"
                              >
                                {el ? "Ακύρωση" : "Cancel"}
                              </button>
                              <button
                                type="button"
                                onClick={applyProposal}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-neon px-3 py-2 text-xs font-semibold text-primary-foreground"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Apply
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}

        {aiError && (
          <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
            {aiError}
          </p>
        )}

        {mode === "project" && selectedProject && (
          <section className="glass rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {el ? "Αποθήκευση στο Project" : "Save to Project"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {el
                    ? "Η νέα version είναι η ασφαλέστερη προεπιλογή."
                    : "Saving as a new version is the safer default."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!dirty || saving || !selectedProject.isLeaf}
                  title={
                    !selectedProject.isLeaf
                      ? el
                        ? "Μόνο η τελευταία version μπορεί να αντικατασταθεί"
                        : "Only the latest version can be replaced"
                      : undefined
                  }
                  onClick={() => saveProject("replace_latest")}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground disabled:opacity-35"
                >
                  {el ? "Αντικατάσταση τρέχουσας" : "Replace Current Version"}
                </button>
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={() => saveProject("new_version")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-neon px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {el
                    ? `Αποθήκευση ως νέα έκδοση στο “${projectContext.data?.project.name ?? "Project"}”`
                    : `Save as new version in “${projectContext.data?.project.name ?? "Project"}”`}
                </button>
              </div>
            </div>
            {saveError && <p className="mt-3 text-xs text-red-300">{saveError}</p>}
            {savedMessage && <p className="mt-3 text-xs text-green-300">{savedMessage}</p>}
          </section>
        )}

        {mode === "standalone" && lyrics.trim() && (
          <section className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">
              {el
                ? "Standalone: οι αλλαγές παραμένουν τοπικά μέχρι να τις αντιγράψεις."
                : "Standalone: changes remain local until you copy them."}
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(lyrics);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 px-3 py-2 text-xs font-semibold text-accent"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? (el ? "Αντιγράφηκε" : "Copied") : el ? "Αντιγραφή στίχων" : "Copy lyrics"}
            </button>
          </section>
        )}
      </main>
    </AppShell>
  );
}

function HeaderTitle({ el }: { el: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <ListMusic className="h-5 w-5 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="font-display text-lg font-bold">Lyrics Review</p>
        <p className="text-[11px] text-muted-foreground">
          {el ? "Meter, Rhyme & Singability" : "Meter, Rhyme & Singability"}
        </p>
      </div>
    </div>
  );
}

function ObservationBox({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-foreground/80"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
