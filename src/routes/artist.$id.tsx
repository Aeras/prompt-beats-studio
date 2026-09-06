import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Music, Play, Pause } from "lucide-react";
import { usePlayer } from "@/lib/player";

import { getPublicArtistById } from "@/lib/profile.functions";
import { DonateButton } from "@/components/promptbeats/DonateButton";
import { LikeButton } from "@/components/promptbeats/LikeButton";
import { TrackOwnerActions } from "@/components/promptbeats/TrackOwnerActions";
import { EditProfileModal } from "@/components/promptbeats/EditProfileModal";

export const Route = createFileRoute("/artist/$id")({
  head: () => ({
    meta: [
      { title: "Artist — PromptBeats" },
      { name: "description", content: "Explore this creator's AI tracks, copy their prompts and support their work." },
      { property: "og:title", content: "Artist on PromptBeats" },
      { property: "og:description", content: "AI tracks and prompt recipes from this PromptBeats creator." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArtistPage,
});

function CopyPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label="Copy prompt"
      title="Copy prompt"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(prompt);
        } catch {
          /* clipboard unavailable */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent transition-colors hover:bg-accent/20"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ArtistPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["public-artist", id],
    queryFn: () => getPublicArtistById({ data: { id } }),
  });

  const { play, current, playing } = usePlayer();
  const profile = data?.profile ?? null;
  const tracks = data?.tracks ?? [];

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link to="/" className="text-xs text-muted-foreground hover:text-accent">
          ← Back to the feed
        </Link>

        {isLoading && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && !profile && (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Artist not found.</p>
        )}

        {profile && (
          <>
            <header className="glass-strong flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
              <img
                src={profile.avatar_url ?? `https://i.pravatar.cc/120?u=${profile.id}`}
                alt={`${profile.artist_alias ?? profile.handle} avatar`}
                width={88}
                height={88}
                className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-primary/60"
              />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-2xl font-bold">
                  {profile.artist_alias || profile.display_name || profile.handle}
                </h1>
                <p className="text-xs text-muted-foreground">@{profile.handle}</p>
                {profile.bio && <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p>}
              </div>
              <EditProfileModal profile={profile} />
            </header>

            <DonateButton
              provider={profile.donation_provider}
              url={profile.donation_url}
              customName={profile.donation_custom_name}
            />

            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Discography</h2>
              {tracks.length === 0 && (
                <p className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
                  No published tracks yet.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {tracks.map((t) => (
                  <article key={t.id} className="glass space-y-3 rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 shrink-0 text-accent" />
                      <Link
                        to="/track/$id"
                        params={{ id: t.id }}
                        className="truncate text-sm font-semibold hover:text-accent"
                      >
                        {t.title}
                      </Link>
                      {t.prompt ? <CopyPromptButton prompt={t.prompt} /> : null}
                      <LikeButton trackId={t.id} />
                      <TrackOwnerActions
                        compact
                        track={{
                          id: t.id,
                          user_id: t.user_id,
                          title: t.title,
                          genre: t.genre,
                          prompt: t.prompt ?? "",
                          lyrics: t.lyrics ?? "",
                          audio_url: t.audio_url,
                          audio_type: t.audio_type,
                        }}
                      />
                    </div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.genre}</p>
                    <button
                      onClick={() =>
                        play(
                          {
                            id: t.id,
                            userId: t.user_id,
                            title: t.title,
                            handle: `@${profile.handle}`,
                            genre: t.genre,
                            art: profile.avatar_url ?? `https://i.pravatar.cc/120?u=${profile.id}`,
                            duration: "--:--",
                            plays: "0",
                            prompt: t.prompt ?? "",
                            lyrics: t.lyrics ?? "",
                            audioUrl: t.audio_url,
                            audioType: "upload",
                          },
                          [],
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
                    >
                      {current?.id === t.id && playing ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {current?.id === t.id && playing ? "Pause" : "Play"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
