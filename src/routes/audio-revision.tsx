import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Music2, RotateCcw } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import {
  getCurrentUserAiModelAccess,
  getPromptRevisionBase,
  listPromptProjects,
  listPromptProjectVersions,
} from "@/lib/ai.functions";
import {
  completeAudioRevisionFeedback,
  createAudioRevisionFeedback,
} from "@/lib/audio-revision-feedback.functions";
import { getAudioRevisionIntent } from "@/lib/audio-revision-intent.functions";
import { generatorInputSnapshotSchema } from "@/lib/generator-revision.shared";
import {
  getGenerationJob,
  startGenerationJob,
  type GenerationJob,
} from "@/lib/generation-jobs.functions";
import { listProjectVersionLinkedTracks } from "@/lib/project-version-tracks.functions";

export const Route = createFileRoute("/audio-revision")({
  validateSearch: z.object({
    project: z.string().uuid().optional(),
    version: z.string().uuid().optional(),
    track: z.string().uuid().optional(),
    intent: z.string().uuid().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Audio Revision — PromptBeats" },
      {
        name: "description",
        content: "Turn a linked audio result into an intentional PromptBeats project revision.",
      },
    ],
  }),
  component: AudioRevisionPage,
});

function joinSnapshotValues(selected: string[], custom: string) {
  return [...selected, custom]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

function AudioRevisionPage() {
  const { user, loading } = useAuth();
  const { language } = useI18n();
  const el = language === "el";
  const navigate = useNavigate();
  const search = Route.useSearch();
  const intentId = search.intent ?? null;
  const feedbackKey = useRef(crypto.randomUUID());
  const finalizingJob = useRef<string | null>(null);
  const hydratedIntent = useRef<string | null>(null);

  const [projectId, setProjectId] = useState(search.project ?? "");
  const [versionId, setVersionId] = useState(search.version ?? "");
  const [trackId, setTrackId] = useState(search.track ?? "");
  const [keep, setKeep] = useState("");
  const [change, setChange] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const [revisionBrief, setRevisionBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdRevision, setCreatedRevision] = useState<{
    id: string;
    versionNumber: number;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", replace: true });
  }, [loading, navigate, user]);

  useEffect(() => {
    if (busy || jobId || intentId) return;
    feedbackKey.current = crypto.randomUUID();
  }, [busy, change, intentId, jobId, keep, projectId, revisionBrief, trackId, versionId]);

  const projects = useQuery({
    queryKey: ["audio-revision", "projects", user?.id],
    queryFn: () => listPromptProjects(),
    enabled: Boolean(user),
  });

  const versions = useQuery({
    queryKey: ["audio-revision", "versions", projectId],
    queryFn: () => listPromptProjectVersions({ data: { projectId } }),
    enabled: Boolean(user && projectId),
  });

  const tracks = useQuery({
    queryKey: ["audio-revision", "tracks", projectId, versionId],
    queryFn: () => listProjectVersionLinkedTracks({ data: { projectId, versionId } }),
    enabled: Boolean(user && projectId && versionId),
  });

  const base = useQuery({
    queryKey: ["audio-revision", "base", projectId, versionId],
    queryFn: () => getPromptRevisionBase({ data: { projectId, basePromptId: versionId } }),
    enabled: Boolean(user && projectId && versionId),
  });

  const modelAccess = useQuery({
    queryKey: ["audio-revision", "model-access", user?.id],
    queryFn: () => getCurrentUserAiModelAccess(),
    enabled: Boolean(user),
  });

  const intent = useQuery({
    queryKey: ["audio-revision", "intent", intentId, projectId, versionId, trackId],
    queryFn: () =>
      getAudioRevisionIntent({
        data: {
          projectId,
          versionId,
          trackId,
          intentId: intentId as string,
        },
      }),
    enabled: Boolean(user && intentId && projectId && versionId && trackId),
  });

  const job = useQuery({
    queryKey: ["audio-revision", "job", jobId],
    queryFn: () => getGenerationJob({ data: { jobId: jobId as string } }),
    enabled: Boolean(jobId),
    refetchInterval: 2500,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });

  const projectRows = projects.data?.projects ?? [];
  const versionRows = versions.data?.prompts ?? [];
  const trackRows = tracks.data?.tracks ?? [];
  const selectedTrack = trackRows.find((track) => track.track_id === trackId) ?? null;
  const intentRecord = intent.data?.intent ?? null;

  useEffect(() => {
    if (!intentId || intent.isLoading) return;
    if (!intentRecord) {
      setError(
        el
          ? "Το Revision Intent δεν αντιστοιχεί σε αυτό το Project, Version και Track."
          : "The Revision Intent does not match this Project, Version and Track.",
      );
      return;
    }
    if (hydratedIntent.current === intentRecord.id) return;
    hydratedIntent.current = intentRecord.id;
    setKeep(intentRecord.acceptedKeep);
    setChange(intentRecord.acceptedChange);
    setRevisionBrief(intentRecord.acceptedRevisionBrief);
    setBriefOpen(Boolean(intentRecord.acceptedRevisionBrief));
    if (intentRecord.feedbackId) setFeedbackId(intentRecord.feedbackId);
    if (intentRecord.createdRevisionPromptId) {
      setCreatedRevision({ id: intentRecord.createdRevisionPromptId, versionNumber: 0 });
    }
  }, [el, intent.isLoading, intentId, intentRecord]);

  const snapshotResult = generatorInputSnapshotSchema.safeParse(
    base.data?.prompt.generator_input_snapshot,
  );
  const hasCanonicalSnapshot = snapshotResult.success;

  useEffect(() => {
    const current = job.data?.job;
    if (!current || !jobId || current.jobId !== jobId) return;

    if (current.status === "failed" || current.status === "cancelled") {
      setBusy(false);
      setJobId(null);
      setError(
        current.status === "failed"
          ? current.error ||
              (el ? "Η δημιουργία της νέας έκδοσης απέτυχε." : "The new revision failed.")
          : el
            ? "Η δημιουργία ακυρώθηκε."
            : "The revision was cancelled.",
      );
      return;
    }

    if (current.status !== "completed" || !feedbackId || finalizingJob.current === current.jobId) {
      return;
    }

    const revisionMeta =
      current.result && "revisionMeta" in current.result ? current.result.revisionMeta : null;
    if (!revisionMeta) {
      setBusy(false);
      setJobId(null);
      setError(
        el
          ? "Η δημιουργία ολοκληρώθηκε χωρίς canonical Project Version."
          : "The generation completed without a canonical Project Version.",
      );
      return;
    }

    finalizingJob.current = current.jobId;
    void completeAudioRevisionFeedback({
      data: {
        feedbackId,
        revisionPromptId: revisionMeta.savedPromptId,
      },
    })
      .then(() => {
        setCreatedRevision({
          id: revisionMeta.savedPromptId,
          versionNumber: revisionMeta.versionNumber,
        });
        setBusy(false);
        setJobId(null);
        setError(null);
        void intent.refetch();
      })
      .catch((cause) => {
        setBusy(false);
        setJobId(null);
        setError(
          cause instanceof Error
            ? cause.message
            : el
              ? "Η νέα έκδοση δημιουργήθηκε αλλά δεν συνδέθηκε με το audio feedback."
              : "The revision was created but could not be linked to the audio feedback.",
        );
      });
  }, [el, feedbackId, intent, job.data?.job, jobId]);

  const resetAfterProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    setVersionId("");
    setTrackId("");
    setCreatedRevision(null);
    setError(null);
  };

  const resetAfterVersion = (nextVersionId: string) => {
    setVersionId(nextVersionId);
    setTrackId("");
    setCreatedRevision(null);
    setError(null);
  };

  const submit = async () => {
    if (!projectId || !versionId || !trackId || busy || !snapshotResult.success) return;
    const prompt = base.data?.prompt;
    const defaultModel = modelAccess.data?.generator.defaultModel;
    if (!prompt || !defaultModel) {
      setError(
        el ? "Το revision context δεν είναι ακόμη έτοιμο." : "Revision context is not ready yet.",
      );
      return;
    }

    if (keep.length > 900 || change.length > 1200 || revisionBrief.length > 600) {
      setError(
        el
          ? "Η κατεύθυνση του revision υπερβαίνει τα επιτρεπτά όρια. Επεξεργάσου το κείμενο πριν συνεχίσεις."
          : "The revision direction exceeds the allowed limits. Edit it before continuing.",
      );
      return;
    }

    setBusy(true);
    setCreatedRevision(null);
    setError(null);
    try {
      const feedback = await createAudioRevisionFeedback({
        data: {
          idempotencyKey: feedbackKey.current,
          projectId,
          versionId,
          trackId,
          revisionIntentId: intentId,
          keep,
          change,
          revisionBrief,
        },
      });
      setFeedbackId(feedback.feedbackId);

      if (feedback.createdRevisionPromptId) {
        setCreatedRevision({ id: feedback.createdRevisionPromptId, versionNumber: 0 });
        setBusy(false);
        void intent.refetch();
        return;
      }

      const snapshot = snapshotResult.data;
      const desiredSnapshot = {
        ...snapshot,
        generatorMode: "revision" as const,
        generationModel: defaultModel,
      };
      const musicStyle =
        joinSnapshotValues(snapshot.selectedMusicStyles, snapshot.customMusicStyle) ||
        String(prompt.genre ?? "");
      const mood =
        joinSnapshotValues(snapshot.selectedMoods, snapshot.customMood) ||
        String(prompt.mood ?? "");
      const instruments = joinSnapshotValues(
        snapshot.selectedInstruments,
        snapshot.customInstruments,
      );
      const theme = String(prompt.theme || snapshot.theme || "")
        .trim()
        .slice(0, 500);
      const genre = String(prompt.genre || musicStyle)
        .trim()
        .slice(0, 500);
      const effectiveMood = mood.trim().slice(0, 120);
      const effectiveLanguage = String(
        prompt.language || snapshot.customLanguage || snapshot.language,
      )
        .trim()
        .slice(0, 80);

      if (theme.length < 3 || !genre || !effectiveMood || !effectiveLanguage) {
        throw new Error(
          el
            ? "Η επιλεγμένη έκδοση δεν έχει αρκετό canonical Generator context για ασφαλές audio revision."
            : "The selected version does not contain enough canonical Generator context for a safe audio revision.",
        );
      }

      const response = await startGenerationJob({
        data: {
          idempotencyKey: feedback.feedbackId,
          targetPlatform: snapshot.targetPlatform,
          theme,
          genre,
          mood: effectiveMood,
          language: effectiveLanguage,
          generationModel: defaultModel,
          advanced: true,
          baseMusicStyle: musicStyle.slice(0, 500),
          instruments: instruments.slice(0, 200),
          structure: snapshot.songStructure.join(" → ").slice(0, 600),
          songBlueprint: snapshot.songBlueprint,
          production: snapshot.productionStyle.slice(0, 2000),
          instructions: snapshot.additionalInstructions.slice(0, 2000),
          operation: "revision",
          revision: {
            projectId,
            basePromptId: versionId,
            revisionRequest: feedback.revisionRequest,
            desiredSnapshot,
          },
          inputSnapshot: desiredSnapshot,
        },
      });

      if (response.rateLimited || !response.job) {
        throw new Error(
          el
            ? "Έφτασες το προσωρινό όριο AI δημιουργιών. Δοκίμασε ξανά αργότερα."
            : "The temporary AI generation limit has been reached. Try again later.",
        );
      }

      const returned = response.job as GenerationJob;
      if (
        returned.input?.operation !== "revision" ||
        returned.input.revision?.projectId !== projectId ||
        returned.input.revision?.basePromptId !== versionId ||
        returned.input.revision?.revisionRequest !== feedback.revisionRequest
      ) {
        throw new Error(
          el
            ? "Υπάρχει ήδη άλλη AI δημιουργία σε εξέλιξη. Περίμενε να ολοκληρωθεί πριν ξεκινήσεις το audio revision."
            : "Another AI generation is already in progress. Wait for it to finish before starting the audio revision.",
        );
      }

      setJobId(returned.jobId);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Δεν ήταν δυνατή η δημιουργία της νέας έκδοσης."
            : "The new revision could not be created.",
      );
    }
  };

  const directionReady = Boolean(keep.trim() || change.trim());
  const directionWithinLimits =
    keep.length <= 900 && change.length <= 1200 && revisionBrief.length <= 600;
  const loadingContext =
    projects.isLoading ||
    versions.isLoading ||
    tracks.isLoading ||
    base.isLoading ||
    modelAccess.isLoading ||
    (Boolean(intentId) && intent.isLoading);
  const intentReady = !intentId || Boolean(intentRecord && intentRecord.status === "draft");
  const canSubmit =
    Boolean(
      projectId &&
      versionId &&
      trackId &&
      directionReady &&
      directionWithinLimits &&
      hasCanonicalSnapshot,
    ) &&
    Boolean(modelAccess.data?.generator.defaultModel) &&
    intentReady &&
    !busy &&
    !createdRevision;

  return (
    <AppShell
      header={
        <div>
          <h1 className="font-display text-xl font-bold">Audio → Revision</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {el
              ? "Άκουσε το πραγματικό αποτέλεσμα, κράτησε ό,τι λειτουργεί και άλλαξε μόνο ό,τι χρειάζεται."
              : "Use the real audio result: preserve what works and change only what needs revision."}
          </p>
        </div>
      }
    >
      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <section className="glass-strong rounded-3xl p-5 sm:p-7">
          {intentId && (
            <p className="mb-4 rounded-xl border border-accent/20 bg-accent/[0.04] p-3 text-xs text-muted-foreground">
              {el
                ? "Revision Intent: η αποδεκτή κατεύθυνση φορτώνεται ιδιωτικά από τον server. Μπορείς να την ελέγξεις πριν ξεκινήσεις· τίποτα δεν εκτελείται αυτόματα."
                : "Revision Intent: the accepted direction is loaded privately from the server. Review it before starting; nothing runs automatically."}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Project</span>
              <select
                value={projectId}
                onChange={(event) => resetAfterProject(event.target.value)}
                disabled={busy || Boolean(intentId)}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-foreground outline-none focus:border-accent/40 disabled:opacity-45"
              >
                <option value="">{el ? "Επίλεξε Project" : "Select Project"}</option>
                {projectRows.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{el ? "Έκδοση" : "Version"}</span>
              <select
                value={versionId}
                onChange={(event) => resetAfterVersion(event.target.value)}
                disabled={!projectId || versions.isLoading || busy || Boolean(intentId)}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-foreground outline-none focus:border-accent/40 disabled:opacity-45"
              >
                <option value="">{el ? "Επίλεξε Version" : "Select Version"}</option>
                {versionRows.map((version) => (
                  <option key={version.id} value={version.id}>
                    V{version.version_number ?? "?"} ·{" "}
                    {version.title || version.version_label || "Untitled"}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {el ? "Audio αποτέλεσμα" : "Audio result"}
              </span>
              <select
                value={trackId}
                onChange={(event) => setTrackId(event.target.value)}
                disabled={!versionId || tracks.isLoading || busy || Boolean(intentId)}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-foreground outline-none focus:border-accent/40 disabled:opacity-45"
              >
                <option value="">{el ? "Επίλεξε linked Track" : "Select linked Track"}</option>
                {trackRows
                  .filter((track) => !track.unavailable)
                  .map((track) => (
                    <option key={track.track_id} value={track.track_id}>
                      {track.is_primary ? "★ " : ""}
                      {track.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {loadingContext && (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {el ? "Φόρτωση context..." : "Loading context..."}
            </p>
          )}

          {versionId && !base.isLoading && !hasCanonicalSnapshot && (
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
              {el
                ? "Αυτή η παλαιότερη έκδοση δεν έχει πλήρες Generator snapshot. Για ασφάλεια δεν θα εφευρεθούν ιστορικές ρυθμίσεις· χρησιμοποίησε το κανονικό Revision mode του Generator."
                : "This older version has no complete Generator snapshot. Historical settings will not be invented; use the Generator's regular Revision mode instead."}
            </p>
          )}

          {selectedTrack && (
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.035] p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-accent/20 text-accent">
                  <Music2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedTrack.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {selectedTrack.is_published
                      ? el
                        ? "Δημόσιο linked audio"
                        : "Public linked audio"
                      : el
                        ? "Ιδιωτικό linked audio"
                        : "Private linked audio"}
                    {selectedTrack.is_primary
                      ? el
                        ? " · Κύριο αποτέλεσμα"
                        : " · Primary result"
                      : ""}
                  </p>
                </div>
              </div>
              {selectedTrack.audio_url && (
                <audio
                  className="mt-3 w-full"
                  controls
                  preload="metadata"
                  src={selectedTrack.audio_url}
                />
              )}
            </div>
          )}
        </section>

        <section className="glass rounded-3xl border border-white/10 p-5 sm:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-emerald-300">Keep</span>
              <p className="text-xs text-muted-foreground">
                {el ? "Τι θέλεις να παραμείνει όπως είναι;" : "What should stay as it is?"}
              </p>
              <textarea
                value={keep}
                onChange={(event) => setKeep(event.target.value)}
                disabled={busy || Boolean(createdRevision)}
                maxLength={900}
                rows={6}
                placeholder={
                  el
                    ? "π.χ. Κράτησε το chorus groove και τη φωνητική ένταση..."
                    : "e.g. Keep the chorus groove and vocal intensity..."
                }
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-emerald-300/40 disabled:opacity-50"
              />
              <span className="block text-right text-[10px] text-muted-foreground">
                {keep.length}/900
              </span>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-amber-300">Change</span>
              <p className="text-xs text-muted-foreground">
                {el
                  ? "Τι θέλεις να αλλάξει στην επόμενη έκδοση;"
                  : "What should change in the next version?"}
              </p>
              <textarea
                value={change}
                onChange={(event) => setChange(event.target.value)}
                disabled={busy || Boolean(createdRevision)}
                maxLength={1200}
                rows={6}
                placeholder={
                  el
                    ? "π.χ. Μείωσε τα synths στο verse και κάνε το bridge πιο ήσυχο..."
                    : "e.g. Reduce synths in the verse and make the bridge quieter..."
                }
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-amber-300/40 disabled:opacity-50"
              />
              <span className="block text-right text-[10px] text-muted-foreground">
                {change.length}/1200
              </span>
            </label>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <button
              type="button"
              disabled={busy || Boolean(createdRevision)}
              onClick={() => setBriefOpen((value) => !value)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-accent disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {briefOpen
                ? el
                  ? "Κλείσιμο Revision Brief"
                  : "Hide Revision Brief"
                : el
                  ? "Προσθήκη προαιρετικού Revision Brief"
                  : "Add optional Revision Brief"}
            </button>
            {briefOpen && (
              <textarea
                value={revisionBrief}
                onChange={(event) => setRevisionBrief(event.target.value)}
                disabled={busy || Boolean(createdRevision)}
                maxLength={600}
                rows={4}
                placeholder={
                  el
                    ? "Συνολική κατεύθυνση για την επόμενη έκδοση..."
                    : "Overall direction for the next version..."
                }
                className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-accent/40 disabled:opacity-50"
              />
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-4 text-xs leading-relaxed text-muted-foreground">
            {el
              ? "AI findings δεν εισάγονται αυτόματα. Θα χρησιμοποιούνται μόνο όταν υπάρχει επαληθευμένη σύνδεση με ακριβώς αυτή την έκδοση και αυτό το audio αποτέλεσμα, και μετά από δική σου επιβεβαίωση."
              : "AI findings are never imported automatically. They may be used only when verifiably bound to this exact version and audio result, and only after your confirmation."}
          </div>

          {busy && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/[0.04] p-3 text-xs text-accent">
              <Loader2 className="h-4 w-4 animate-spin" />
              {el
                ? "Δημιουργείται durable Project Revision. Μπορείς να αφήσεις τη σελίδα ανοιχτή όσο ολοκληρώνεται."
                : "Creating a durable Project Revision. You can keep this page open while it completes."}
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
              {error}
            </p>
          )}

          {createdRevision && (
            <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <Check className="h-4 w-4" />
                {el
                  ? createdRevision.versionNumber > 0
                    ? `Δημιουργήθηκε η V${createdRevision.versionNumber}.`
                    : "Η νέα έκδοση έχει ήδη δημιουργηθεί."
                  : createdRevision.versionNumber > 0
                    ? `V${createdRevision.versionNumber} was created.`
                    : "The new revision has already been created."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/library"
                  search={{ tab: "prompts" }}
                  className="rounded-lg border border-emerald-400/25 px-3 py-2 text-xs font-semibold text-emerald-300"
                >
                  {el ? "Άνοιγμα Project" : "Open Project"}
                </Link>
                <Link
                  to="/generate"
                  search={{ mode: "revision", project: projectId, base: createdRevision.id }}
                  className="rounded-lg border border-accent/30 px-3 py-2 text-xs font-semibold text-accent"
                >
                  {el ? "Συνέχεια από τη νέα έκδοση" : "Continue from the new version"}
                </Link>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {el ? "Δημιουργία revision από αυτό" : "Create revision from this"}
          </button>
        </section>
      </main>
    </AppShell>
  );
}
