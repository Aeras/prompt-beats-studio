import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Music2, RotateCcw } from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { listPromptProjects, listPromptProjectVersions } from "@/lib/ai.functions";
import { createAudioRevisionFeedback } from "@/lib/audio-revision-feedback.functions";
import {
  AUDIO_REVISION_HANDOFF_KEY,
  audioRevisionHandoffSchema,
} from "@/lib/audio-revision-feedback.shared";
import { listProjectVersionLinkedTracks } from "@/lib/project-version-tracks.functions";

export const Route = createFileRoute("/audio-revision")({
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

function AudioRevisionPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const el = language === "el";
  const navigate = useNavigate();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [projectId, setProjectId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [keep, setKeep] = useState("");
  const [change, setChange] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const [revisionBrief, setRevisionBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projects = useQuery({
    queryKey: ["audio-revision", "projects", user?.id],
    queryFn: () => listPromptProjects(),
    enabled: Boolean(user),
  });

  const versions = useQuery({
    queryKey: ["audio-revision", "versions", projectId],
    queryFn: () => listPromptProjectVersions({ data: { projectId } }),
    enabled: Boolean(projectId),
  });

  const tracks = useQuery({
    queryKey: ["audio-revision", "tracks", projectId, versionId],
    queryFn: () => listProjectVersionLinkedTracks({ data: { projectId, versionId } }),
    enabled: Boolean(projectId && versionId),
  });

  const projectRows = projects.data?.projects ?? [];
  const versionRows = versions.data?.prompts ?? [];
  const trackRows = tracks.data?.tracks ?? [];
  const selectedTrack = useMemo(
    () => trackRows.find((track) => track.track_id === trackId) ?? null,
    [trackId, trackRows],
  );

  const resetAfterProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    setVersionId("");
    setTrackId("");
    setError(null);
  };

  const resetAfterVersion = (nextVersionId: string) => {
    setVersionId(nextVersionId);
    setTrackId("");
    setError(null);
  };

  const submit = async () => {
    if (!projectId || !versionId || !trackId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const handoff = await createAudioRevisionFeedback({
        data: {
          idempotencyKey: idempotencyKey.current,
          projectId,
          versionId,
          trackId,
          keep,
          change,
          revisionBrief,
        },
      });
      const parsed = audioRevisionHandoffSchema.parse(handoff);
      window.sessionStorage.setItem(AUDIO_REVISION_HANDOFF_KEY, JSON.stringify(parsed));
      await navigate({
        to: "/generate",
        search: { mode: "revision", project: projectId, base: versionId },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : el
            ? "Δεν ήταν δυνατή η δημιουργία του revision handoff."
            : "The revision handoff could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  const directionReady = Boolean(keep.trim() || change.trim());

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
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{el ? "Project" : "Project"}</span>
              <select
                value={projectId}
                onChange={(event) => resetAfterProject(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-foreground outline-none focus:border-accent/40"
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
                disabled={!projectId || versions.isLoading}
                className="h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-foreground outline-none focus:border-accent/40 disabled:opacity-45"
              >
                <option value="">{el ? "Επίλεξε Version" : "Select Version"}</option>
                {versionRows.map((version) => (
                  <option key={version.id} value={version.id}>
                    V{version.version_number ?? "?"} · {version.title || version.version_label || "Untitled"}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{el ? "Audio αποτέλεσμα" : "Audio result"}</span>
              <select
                value={trackId}
                onChange={(event) => setTrackId(event.target.value)}
                disabled={!versionId || tracks.isLoading}
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

          {(projects.isLoading || versions.isLoading || tracks.isLoading) && (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {el ? "Φόρτωση context..." : "Loading context..."}
            </p>
          )}

          {selectedTrack && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/[0.035] p-4">
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
                  {selectedTrack.is_primary ? (el ? " · Κύριο αποτέλεσμα" : " · Primary result") : ""}
                </p>
              </div>
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
                onChange={(event) => setKeep(event.target.value.slice(0, 900))}
                maxLength={900}
                rows={6}
                placeholder={el ? "π.χ. Κράτησε το chorus groove και τη φωνητική ένταση..." : "e.g. Keep the chorus groove and vocal intensity..."}
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-emerald-300/40"
              />
              <span className="block text-right text-[10px] text-muted-foreground">{keep.length}/900</span>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-amber-300">Change</span>
              <p className="text-xs text-muted-foreground">
                {el ? "Τι θέλεις να αλλάξει στην επόμενη έκδοση;" : "What should change in the next version?"}
              </p>
              <textarea
                value={change}
                onChange={(event) => setChange(event.target.value.slice(0, 1200))}
                maxLength={1200}
                rows={6}
                placeholder={el ? "π.χ. Μείωσε τα synths στο verse και κάνε το bridge πιο ήσυχο..." : "e.g. Reduce synths in the verse and make the bridge quieter..."}
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-amber-300/40"
              />
              <span className="block text-right text-[10px] text-muted-foreground">{change.length}/1200</span>
            </label>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <button
              type="button"
              onClick={() => setBriefOpen((value) => !value)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-accent"
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
                onChange={(event) => setRevisionBrief(event.target.value.slice(0, 600))}
                maxLength={600}
                rows={4}
                placeholder={el ? "Συνολική κατεύθυνση για την επόμενη έκδοση..." : "Overall direction for the next version..."}
                className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-accent/40"
              />
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-4 text-xs leading-relaxed text-muted-foreground">
            {el
              ? "AI findings δεν εισάγονται αυτόματα. Θα μπορούν να χρησιμοποιούνται μόνο όταν είναι επαληθευμένα ότι ανήκουν ακριβώς σε αυτή την έκδοση και αυτό το audio αποτέλεσμα, και μόνο μετά από δική σου επιβεβαίωση."
              : "AI findings are never imported automatically. They may be used only when they are verifiably bound to this exact version and audio result, and only after your confirmation."}
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!projectId || !versionId || !trackId || !directionReady || busy}
            onClick={submit}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {el ? "Δημιουργία revision από αυτό" : "Create revision from this"}
          </button>
        </section>
      </main>
    </AppShell>
  );
}
