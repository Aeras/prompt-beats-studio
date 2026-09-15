import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Library as LibraryIcon, Copy, Check, Trash2, Loader2 } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import { TrackGridModeToggle, trackGridClassName, useTrackGridMode, type TrackGridMode } from "@/components/promptbeats/TrackGridView";
import type { Track } from "@/lib/tracks";
import { usePlayer } from "@/lib/player";
import { useAuth } from "@/hooks/useAuth";
import { listMyTracks, listLikedTracks } from "@/lib/tracks.functions";
import { listSavedPrompts, deleteSavedPrompt } from "@/lib/ai.functions";
import artFallback from "@/assets/art-3.jpg";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type Row = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  prompt: string;
  lyrics: string;
  audio_url: string;
  audio_type: string;
  source_type: "upload" | "suno" | "udio" | "legacy_link";
  source_id: string | null;
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number;
  is_published: boolean;
  handle?: string;
};

function toTrack(track: Row, handle: string): Track {
  return {
    id: track.id,
    userId: track.user_id,
    title: track.title,
    handle: track.handle ?? handle,
    genre: track.genre,
    art: track.cover_url ?? track.art_url ?? artFallback,
    duration: formatDuration(track.duration_seconds),
    plays: String(track.plays),
    prompt: track.prompt,
    lyrics: track.lyrics,
    audioUrl: track.audio_url,
    audioType: (track.audio_type === "link" ? "link" : "upload") as "link" | "upload",
    isPublished: track.is_published,
    sourceType: track.source_type,
    sourceId: track.source_id,
  };
}

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "My Library — PromptBeats" },
      {
        name: "description",
        content: "Your uploaded tracks, saved AI prompts and liked songs, all in one place.",
      },
      { property: "og:title", content: "My Library — PromptBeats" },
      {
        property: "og:description",
        content: "Manage your AI music uploads, saved prompts and liked tracks on PromptBeats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

const TABS = ["tracks", "prompts", "likes"] as const;
const TRACK_VISIBILITY_FILTERS = ["all", "public", "private"] as const;

function LibraryPage() {
  const { t } = useI18n();
  const { user, profile, loading } = useAuth();
  const { current, playing, play } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();
  const [tab, setTab] = useState<(typeof TABS)[number]>("tracks");
  const [trackVisibility, setTrackVisibility] = useState<(typeof TRACK_VISIBILITY_FILTERS)[number]>("all");
  const handle = profile?.handle ? `@${profile.handle}` : t("nav.you");

  const mine = useQuery({
    queryKey: ["library", "mine", user?.id],
    queryFn: () => listMyTracks(),
    enabled: Boolean(user),
  });
  const prompts = useQuery({
    queryKey: ["library", "prompts", user?.id],
    queryFn: () => listSavedPrompts(),
    enabled: Boolean(user),
  });
  const liked = useQuery({
    queryKey: ["library", "liked", user?.id],
    queryFn: () => listLikedTracks(),
    enabled: Boolean(user),
  });

  const myTracks = (mine.data?.tracks ?? []).map((track) => toTrack(track as Row, handle));
  const likedTracks = (liked.data?.tracks ?? []).map((track) => toTrack(track as Row, handle));
  const publicTrackCount = myTracks.filter((track) => track.isPublished).length;
  const privateTrackCount = myTracks.length - publicTrackCount;
  const filteredMyTracks = myTracks.filter(
    (track) => trackVisibility === "all" || (trackVisibility === "public" ? track.isPublished : !track.isPublished),
  );

  const tabLabel = (value: (typeof TABS)[number]) =>
    value === "tracks"
      ? t("library.myTracks")
      : value === "prompts"
        ? t("library.savedPrompts")
        : t("library.likedTracks");

  const visibilityLabel = (value: (typeof TRACK_VISIBILITY_FILTERS)[number]) =>
    value === "all" ? t("library.all") : value === "public" ? t("library.public") : t("library.private");

  const header = (
    <div className="flex items-center gap-2">
      <LibraryIcon className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">{t("library.title")}</span>
    </div>
  );

  if (!loading && !user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-10 md:px-8 md:pb-[150px]">
          <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
            <h1 className="font-display text-xl font-bold">{t("library.guestTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("library.guestBody")}</p>
            <Link
              to="/auth"
              className="mt-5 inline-flex rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"
            >
              {t("nav.signIn")}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  const emptyMyTracks =
    trackVisibility === "all"
      ? t("library.noTracks")
      : t("library.noVisibilityTracks", { visibility: visibilityLabel(trackVisibility).toLowerCase() });

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <h1 className="font-display text-2xl font-bold md:text-3xl">{t("library.title")}</h1>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all",
                tab === item
                  ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon"
                  : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
              )}
            >
              {tabLabel(item)}
            </button>
          ))}
        </div>

        {tab === "tracks" && (
          <>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {TRACK_VISIBILITY_FILTERS.map((filter) => {
                  const count =
                    filter === "all"
                      ? myTracks.length
                      : filter === "public"
                        ? publicTrackCount
                        : privateTrackCount;
                  return (
                    <button
                      key={filter}
                      onClick={() => setTrackVisibility(filter)}
                      aria-pressed={trackVisibility === filter}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-xs transition-all",
                        trackVisibility === filter
                          ? "border-accent/50 bg-accent/15 font-semibold text-accent"
                          : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
                      )}
                    >
                      {visibilityLabel(filter)} ({count})
                    </button>
                  );
                })}
              </div>
              <TrackGridModeToggle mode={gridMode} onChange={setGridMode} className="shrink-0" />
            </div>
            <Section
              empty={emptyMyTracks}
              tracks={filteredMyTracks}
              playing={playing}
              currentId={current?.id}
              onPlay={(track) => play(track, myTracks)}
              gridMode={gridMode}
            />
          </>
        )}

        {tab === "likes" && (
          <>
            <div className="mt-3 flex justify-end">
              <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />
            </div>
            <Section
              empty={t("library.noLikes")}
              tracks={likedTracks}
              playing={playing}
              currentId={current?.id}
              onPlay={(track) => play(track, likedTracks)}
              gridMode={gridMode}
            />
          </>
        )}

        {tab === "prompts" && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(prompts.data?.prompts ?? []).map((prompt) => (
              <SavedPromptCard key={prompt.id} prompt={prompt} />
            ))}
            {!prompts.isLoading && (prompts.data?.prompts ?? []).length === 0 && (
              <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                {t("library.noPrompts")}
              </p>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Section({
  tracks,
  empty,
  playing,
  currentId,
  onPlay,
  gridMode,
}: {
  tracks: Track[];
  empty: string;
  playing: boolean;
  currentId?: string;
  onPlay: (track: Track) => void;
  gridMode: TrackGridMode;
}) {
  return (
    <>
      <div className={`mt-6 ${trackGridClassName(gridMode)}`}>
        {tracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            isPlaying={playing && currentId === track.id}
            onPlay={onPlay}
            viewMode={gridMode}
          />
        ))}
      </div>
      {tracks.length === 0 && (
        <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </>
  );
}

function SavedPromptCard({
  prompt,
}: {
  prompt: {
    id: string;
    title: string | null;
    theme: string | null;
    genre: string | null;
    mood: string | null;
    tags: string | null;
    lyrics: string | null;
    note: string | null;
  };
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteSavedPrompt({ data: { id: prompt.id } });
      await queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false });
    } finally {
      setDeleting(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <article className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-base font-bold">
            {prompt.title || prompt.theme || t("library.untitledPrompt")}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {[prompt.genre, prompt.mood].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => copy([prompt.tags, prompt.lyrics].filter(Boolean).join("\n\n"))}
            aria-label={t("library.copyPrompt")}
            className="rounded-xl border border-white/10 p-2 text-muted-foreground transition-colors hover:text-accent"
          >
            {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            onClick={remove}
            disabled={deleting}
            aria-label={t("library.deletePrompt")}
            className="rounded-xl border border-white/10 p-2 text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {prompt.tags && (
        <pre className="mt-3 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">
          {prompt.tags}
        </pre>
      )}
      {prompt.lyrics && (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">
          {prompt.lyrics}
        </pre>
      )}
    </article>
  );
}
