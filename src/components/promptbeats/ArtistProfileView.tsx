import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Globe, Instagram, Music, Play, Pause, Share2, ShieldBan, Twitter, Youtube } from "lucide-react";

import { usePlayer } from "@/lib/player";
import { DonateButton } from "@/components/promptbeats/DonateButton";
import { LikeButton } from "@/components/promptbeats/LikeButton";
import { TrackOwnerActions } from "@/components/promptbeats/TrackOwnerActions";
import { EditProfileModal } from "@/components/promptbeats/EditProfileModal";
import { useModeration } from "@/hooks/useModeration";
import { getUserBanStatus, setUserBanned } from "@/lib/moderation.functions";

type Profile = {
  id: string;
  handle: string;
  display_name: string | null;
  artist_alias: string | null;
  avatar_url: string | null;
  bio: string | null;
  website_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  x_url: string | null;
  profile_completed?: boolean;
  donation_provider: string | null;
  donation_url: string | null;
  donation_custom_name: string | null;
};

type Track = {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  prompt: string | null;
  lyrics: string | null;
  audio_url: string;
  audio_type: string;
  created_at?: string;
};

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

function SocialLinks({ profile }: { profile: Profile }) {
  const links = [
    { url: profile.website_url, Icon: Globe, label: "Website" },
    { url: profile.instagram_url, Icon: Instagram, label: "Instagram" },
    { url: profile.tiktok_url, Icon: Music, label: "TikTok" },
    { url: profile.x_url, Icon: Twitter, label: "X (Twitter)" },
    { url: profile.youtube_url, Icon: Youtube, label: "YouTube" },
  ].filter((l) => Boolean(l.url && l.url.trim()));

  if (links.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {links.map(({ url, Icon, label }) => (
        <a
          key={label}
          href={url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}

function ShareProfileButton({ handle }: { handle: string }) {
  return (
    <button
      aria-label="Share profile"
      title="Share profile"
      onClick={async () => {
        const url = `https://promptbeats.app/@${handle}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Profile link copied!");
        } catch {
          toast.error("Could not copy the link");
        }
      }}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
    >
      <Share2 className="h-4 w-4" />
    </button>
  );
}

function BanUserToggle({ userId }: { userId: string }) {
  const { isAdmin } = useModeration();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["ban-status", userId],
    queryFn: () => getUserBanStatus({ data: { userId } }),
    enabled: isAdmin,
  });
  const banned = Boolean(data?.banned);
  if (!isAdmin) return null;

  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setUserBanned({ data: { userId, banned: !banned } });
          await queryClient.invalidateQueries();
          toast.success(banned ? "User unbanned" : "User banned");
        } catch {
          toast.error("Could not update this user");
        } finally {
          setBusy(false);
        }
      }}
      className={
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 " +
        (banned
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
          : "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20")
      }
    >
      <ShieldBan className="h-3.5 w-3.5" />
      {banned ? "Unban user" : "Ban user"}
    </button>
  );
}

export function ArtistProfileView({
  profile,
  tracks,
  isLoading,
  notFoundLabel = "Artist not found.",
}: {
  profile: Profile | null;
  tracks: Track[];
  isLoading: boolean;
  notFoundLabel?: string;
}) {
  const { play, current, playing } = usePlayer();

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link to="/" className="text-xs text-muted-foreground hover:text-accent">
          ← Back to the feed
        </Link>

        {isLoading && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && !profile && (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{notFoundLabel}</p>
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
                <div className="flex items-center gap-3">
                  <h1 className="min-w-0 truncate font-display text-2xl font-bold">
                    {profile.artist_alias || profile.display_name || profile.handle}
                  </h1>
                  <ShareProfileButton handle={profile.handle} />
                </div>
                <p className="text-xs text-muted-foreground">@{profile.handle}</p>
                {profile.bio && <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p>}
                <SocialLinks profile={profile} />
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <EditProfileModal profile={profile} />
                <BanUserToggle userId={profile.id} />
              </div>
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
