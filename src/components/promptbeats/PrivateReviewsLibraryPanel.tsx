import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquareText, Search, Trash2 } from "lucide-react";

import { PrivateReviewManager } from "@/components/promptbeats/PrivateReviewManager";
import { useI18n } from "@/i18n";
import {
  deleteFinishedPrivateReviewTrack,
  listMyPrivateReviewSessions,
} from "@/lib/private-review.functions";
type ReviewRow = Awaited<ReturnType<typeof listMyPrivateReviewSessions>>[number];

/** Existing owner RPC already lists expired/closed history; this is only a grouped entry point. */
export function PrivateReviewsLibraryPanel({ userId }: { userId: string }) {
  const { language } = useI18n();
  const el = language === "el";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const sessions = useQuery({
    queryKey: ["private-review-library", userId],
    queryFn: () => listMyPrivateReviewSessions({ data: {} }),
  });
  const deleteTrackReviews = useMutation({
    mutationFn: (trackId: string) =>
      deleteFinishedPrivateReviewTrack({ data: { trackId } }),
    onSuccess: async () => {
      setSelectedTrackId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["private-review-library"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["private-review-sessions"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["private-review-owner-session"], exact: false }),
      ]);
    },
  });
  const confirmTrackDeletion = (trackId: string, count: number) => {
    const text = el
      ? `Οριστική διαγραφή και των ${count} Private Reviews του τραγουδιού, μαζί με όλα τα σχόλια; Η ενέργεια δεν αναιρείται.`
      : `Permanently delete all ${count} Private Reviews for this track, including comments? This cannot be undone.`;
    if (window.confirm(text)) deleteTrackReviews.mutate(trackId);
  };

  const tracks = useMemo(() => {
    const groups = new Map<string, { title: string; latestAt: string; sessions: ReviewRow[] }>();
    for (const session of sessions.data ?? []) {
      if (session.sourceType !== "track" || !session.sourceTrackId) continue;
      const id = session.sourceTrackId;
      const prior = groups.get(id);
      if (prior) {
        prior.sessions.push(session);
        if (session.createdAt > prior.latestAt) prior.latestAt = session.createdAt;
      } else {
        groups.set(id, {
          title: session.audioSnapshot?.title || (el ? "Τραγούδι" : "Track"),
          latestAt: session.createdAt,
          sessions: [session],
        });
      }
    }
    return [...groups.entries()]
      .map(([id, group]) => ({ id, ...group }))
      .filter((entry) =>
        entry.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      )
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  }, [el, search, sessions.data]);

  return (
    <section className="mt-5 space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={el ? "Αναζήτηση τραγουδιού" : "Search review tracks"}
          aria-label={el ? "Αναζήτηση τραγουδιού" : "Search review tracks"}
          className="h-11 w-full rounded-xl border border-white/10 bg-black/25 pl-10 pr-3 text-sm outline-none focus:border-accent/50"
        />
      </div>
      {sessions.isPending ? (
        <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {el ? "Φόρτωση reviews…" : "Loading reviews…"}
        </div>
      ) : sessions.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {el ? "Δεν ήταν δυνατή η φόρτωση των reviews." : "Reviews could not be loaded."}
        </p>
      ) : tracks.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {el
            ? "Δεν υπάρχουν τραγούδια με Private Reviews."
            : "No tracks with Private Reviews yet."}
        </p>
      ) : (
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
          {tracks.map((track) => {
            const comments = track.sessions.reduce((sum, session) => sum + session.commentCount, 0);
            const active = track.sessions.some((session) => session.state === "active");
            return (
              <div key={track.id} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectedTrackId(selectedTrackId === track.id ? null : track.id)}
                  aria-expanded={selectedTrackId === track.id}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 pr-12 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <MessageSquareText className="h-5 w-5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{track.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {track.sessions.length} {el ? "συνεδρίες" : "sessions"} · {comments}{" "}
                      {el ? "σχόλια" : "comments"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {active ? (el ? "Ενεργό" : "Active") : el ? "Ιστορικό" : "History"}
                  </span>
                </button>
                {!active && (
                  <button
                    type="button"
                    onClick={() => confirmTrackDeletion(track.id, track.sessions.length)}
                    disabled={deleteTrackReviews.isPending}
                    aria-label={el ? `Διαγραφή όλων των reviews για ${track.title}` : `Delete all reviews for ${track.title}`}
                    title={el ? "Οριστική διαγραφή όλων των reviews" : "Permanently delete all reviews"}
                    className="absolute right-2 mt-[-3.2rem] grid h-9 w-9 place-items-center text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {selectedTrackId === track.id && (
                  <PrivateReviewManager
                    initialTrackId={track.id}
                    projectName={track.title}
                    language={language}
                    canCreateNew={false}
                    historyOnly
                    inline
                    onClose={() => setSelectedTrackId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
