import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Music2, Sparkles, X } from "lucide-react";

import artFallback from "@/assets/art-3.jpg";
import { useI18n } from "@/i18n";
import { listSimilarSongs } from "@/lib/similar-songs.functions";

export function SimilarSongsDialog({
  trackId,
  trackTitle,
  open,
  onClose,
}: {
  trackId: string;
  trackTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const { language } = useI18n();
  const query = useQuery({
    queryKey: ["tracks", "similar", trackId],
    queryFn: () => listSimilarSongs({ data: { trackId, limit: 12 } }),
    enabled: open,
    staleTime: 60_000,
  });

  if (!open || typeof document === "undefined") return null;

  const copy =
    language === "el"
      ? {
          title: "Παρόμοια τραγούδια",
          subtitle: `Τραγούδια με παρόμοιο prompt ή μουσικό ύφος με το «${trackTitle}».`,
          loading: "Αναζήτηση παρόμοιων τραγουδιών…",
          empty: "Δεν βρέθηκαν ακόμη αρκετά παρόμοια τραγούδια.",
          error: "Δεν ήταν δυνατή η αναζήτηση παρόμοιων τραγουδιών.",
          prompt: "Με βάση το prompt",
          genre: "Με βάση το μουσικό στυλ",
          match: "ομοιότητα",
          close: "Κλείσιμο",
        }
      : {
          title: "Similar songs",
          subtitle: `Tracks with a similar prompt or musical style to “${trackTitle}”.`,
          loading: "Finding similar songs…",
          empty: "There are not enough similar songs yet.",
          error: "Similar songs could not be loaded.",
          prompt: "Based on the prompt",
          genre: "Based on music style",
          match: "match",
          close: "Close",
        };

  return createPortal(
    <div
      className="fixed inset-0 z-[125] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`similar-songs-${trackId}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="glass-strong max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-accent">
              <Sparkles className="h-4 w-4" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                PromptBeats Match
              </p>
            </div>
            <h2 id={`similar-songs-${trackId}`} className="mt-1 font-display text-xl font-bold">
              {copy.title}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {query.isLoading ? (
          <div className="grid min-h-52 place-items-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" /> {copy.loading}
            </div>
          </div>
        ) : query.isError ? (
          <p className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {copy.error}
          </p>
        ) : (query.data?.tracks.length ?? 0) === 0 ? (
          <div className="mt-6 grid min-h-44 place-items-center rounded-2xl border border-white/10 bg-black/20 p-6 text-center">
            <div>
              <Music2 className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">{copy.empty}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-5 text-[11px] text-muted-foreground">
              {query.data?.basis === "prompt" ? copy.prompt : copy.genre}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(query.data?.tracks ?? []).map((track: any) => (
                <Link
                  key={track.id}
                  to="/track/$id"
                  params={{ id: track.id }}
                  onClick={onClose}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-2.5 transition-colors hover:border-accent/40 hover:bg-white/[0.04]"
                >
                  <img
                    src={track.cover_url ?? track.art_url ?? artFallback}
                    alt=""
                    width={72}
                    height={72}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{track.handle}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-accent">
                        {track.genre}
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-violet-300">
                        {track.similarity_score}% {copy.match}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
