import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Library as LibraryIcon, Copy, Check } from "lucide-react";
import { AppShell } from "@/components/promptbeats/AppShell";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import type { Track } from "@/lib/tracks";
import { usePlayer } from "@/lib/player";
import { useAuth } from "@/hooks/useAuth";
import { listMyTracks, listLikedTracks } from "@/lib/tracks.functions";
import { listSavedPrompts } from "@/lib/ai.functions";
import artFallback from "@/assets/art-3.jpg";
import { cn } from "@/lib/utils";

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
  art_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  plays: number;
  handle?: string;
};

function toTrack(t: Row, handle: string): Track {
  return {
    id: t.id,
    userId: t.user_id,
    title: t.title,
    handle: t.handle ?? handle,
    genre: t.genre,
    art: t.cover_url ?? t.art_url ?? artFallback,
    duration: formatDuration(t.duration_seconds),
    plays: String(t.plays),
    prompt: t.prompt,
    lyrics: t.lyrics,
    audioUrl: t.audio_url,
    audioType: (t.audio_type === "link" ? "link" : "upload") as "link" | "upload",
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

const TABS = [
  { id: "tracks", label: "My Tracks" },
  { id: "prompts", label: "Saved Prompts" },
  { id: "likes", label: "Liked Tracks" },
] as const;

function LibraryPage() {
  const { user, profile, loading } = useAuth();
  const { current, playing, play } = usePlayer();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("tracks");
  const handle = profile?.handle ? `@${profile.handle}` : "@you";

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

  const myTracks = (mine.data?.tracks ?? []).map((t) => toTrack(t as Row, handle));
  const likedTracks = (liked.data?.tracks ?? []).map((t) => toTrack(t as Row, handle));

  const header = (
    <div className="flex items-center gap-2">
      <LibraryIcon className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">My Library</span>
    </div>
  );

  if (!loading && !user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-10 md:px-8 md:pb-[150px]">
          <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
            <h1 className="font-display text-xl font-bold">Your library lives here</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to see your uploads, saved prompts and liked tracks.
            </p>
            <Link
              to="/auth"
              className="mt-5 inline-flex rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"
            >
              Sign in
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <h1 className="font-display text-2xl font-bold md:text-3xl">
          <span className="text-gradient-neon">My</span> Library
        </h1>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all",
                tab === t.id
                  ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon"
                  : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "tracks" && (
          <Section
            empty="You haven't uploaded any tracks yet."
            tracks={myTracks}
            playing={playing}
            currentId={current?.id}
            onPlay={(track) => play(track, myTracks)}
          />
        )}

        {tab === "likes" && (
          <Section
            empty="No liked tracks yet — tap the heart on any track."
            tracks={likedTracks}
            playing={playing}
            currentId={current?.id}
            onPlay={(track) => play(track, likedTracks)}
          />
        )}

        {tab === "prompts" && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(prompts.data?.prompts ?? []).map((p) => (
              <SavedPromptCard key={p.id} prompt={p} />
            ))}
            {!prompts.isLoading && (prompts.data?.prompts ?? []).length === 0 && (
              <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                No saved prompts yet. Generate one in the Studio and hit “Save to my library”.
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
}: {
  tracks: Track[];
  empty: string;
  playing: boolean;
  currentId?: string | undefined;
  onPlay: (t: Track) => void;
}) {
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {tracks.map((t) => (
          <TrackCard key={t.id} track={t} isPlaying={playing && currentId === t.id} onPlay={onPlay} />
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
  const [copied, setCopied] = useState(false);
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
            {prompt.title || prompt.theme || "Untitled prompt"}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {[prompt.genre, prompt.mood].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={() => copy([prompt.tags, prompt.lyrics].filter(Boolean).join("\n\n"))}
          aria-label="Copy prompt"
          className="shrink-0 rounded-xl border border-white/10 p-2 text-muted-foreground transition-colors hover:text-accent"
        >
          {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
        </button>
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
