import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { AudioOutcomeIntentControls } from "@/components/promptbeats/AudioOutcomeIntentControls";
import { listAudioOutcomeEvaluations } from "@/lib/audio-outcome.functions";
import { listProjectVersionLinkedTracks } from "@/lib/project-version-tracks.functions";

type Props = {
  projectId: string;
  versionId: string;
  language: string;
};

export function ProjectVersionAudioOutcomeIntentPanel({ projectId, versionId, language }: Props) {
  const el = language === "el";
  const queryClient = useQueryClient();
  const tracks = useQuery({
    queryKey: ["project-version-linked-tracks", projectId, versionId],
    queryFn: () => listProjectVersionLinkedTracks({ data: { projectId, versionId } }),
  });
  const outcomes = useQuery({
    queryKey: ["project-version-audio-outcomes", projectId, versionId],
    queryFn: () => listAudioOutcomeEvaluations({ data: { projectId, versionId } }),
  });

  const refreshOutcomes = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["project-version-audio-outcomes", projectId, versionId],
    });
  };

  if (tracks.isLoading || outcomes.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {el ? "Φόρτωση ιδιωτικού feedback..." : "Loading private feedback..."}
      </div>
    );
  }

  if (tracks.error || outcomes.error) {
    return (
      <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
        {el ? "Το ιδιωτικό audio feedback δεν φορτώθηκε." : "Private audio feedback could not be loaded."}
      </p>
    );
  }

  const rows = tracks.data?.tracks ?? [];
  if (rows.length === 0) return null;
  const evaluations = new Map(
    (outcomes.data?.evaluations ?? []).map((evaluation) => [evaluation.trackId, evaluation]),
  );

  return (
    <section className="rounded-xl border border-white/10 bg-black/10 p-3">
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          {el ? "Ιδιωτικό Outcome & Revision Intent" : "Private Outcome & Revision Intent"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {el
            ? "Αξιολόγησε αν το αποτέλεσμα πέτυχε την πρόθεσή σου ή σχεδίασε την επόμενη αλλαγή."
            : "Evaluate whether the result matched your intent or plan the next revision."}
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((track) => (
          <div key={track.track_id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs font-semibold">{track.title}</p>
              {track.is_primary && (
                <span className="shrink-0 text-[9px] font-semibold text-amber-300">
                  {el ? "Κύριο" : "Primary"}
                </span>
              )}
            </div>
            <AudioOutcomeIntentControls
              projectId={projectId}
              versionId={versionId}
              trackId={track.track_id}
              language={language}
              unavailable={track.unavailable}
              evaluation={evaluations.get(track.track_id) ?? null}
              onOutcomeSaved={refreshOutcomes}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
