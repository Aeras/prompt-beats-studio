import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Music } from "lucide-react";

import { getPublicProfile } from "@/lib/profile.functions";
import { getTrackDownloadAvailability } from "@/lib/track-download.functions";
import { DonationMethods } from "@/components/promptbeats/DonationMethods";
import { EditProfileModal } from "@/components/promptbeats/EditProfileModal";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { BanUserToggle } from "@/components/promptbeats/ArtistProfileView";
import { incrementTrackPlay } from "@/lib/tracks.functions";
import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import { getTrackEmbedUrl } from "@/lib/track-sources";
import artFallback from "@/assets/art-3.jpg";
import { activateMedia, subscribeToMediaActivation } from "@/lib/media-coordinator";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { getUserAvatarUrl } from "@/lib/user-avatar";

export const Route = createFileRoute("/u/$handle")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} — Creator on PromptBeats` },
      {
        name: "description",
        content: `Listen to AI tracks by @${params.handle}, copy their prompts and support their work on PromptBeats.`,
      },
      { property: "og:title", content: `@${params.handle} on PromptBeats` },
      { property: "og:description", content: `AI tracks and prompts by @${params.handle}.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreatorPage,
});

function CreatorPage() {
  const { handle } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const nativeCycles = useRef(new Map<string, { listenedSeconds: number; lastTime: number; endedHandled: boolean }>());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  useEffect(() => subscribeToMediaActivation(({ id }) => {
    for (const [trackId, audio] of audioRefs.current) {
      if (id !== `creator-native-${trackId}`) audio.pause();
    }
  }), []);
  const { data, isLoading } = useQuery({
    queryKey: ["public-profile", handle],
    queryFn: () => getPublicProfile({ data: { handle } }),
  });

  const profile = data?.profile ?? null;
  const tracks = data?.tracks ?? [];
  const trackIds = useMemo(() => tracks.map((track) => track.id), [tracks]);
  const { data: downloadAvailability } = useQuery({
    queryKey: ["track-download-availability", user?.id, trackIds.join(",")],
    queryFn: () => getTrackDownloadAvailability({ data: { trackIds } }),
    enabled: Boolean(user && trackIds.length),
    staleTime: 30_000,
  });

  const handleNativePlay = (trackId: string, audio: HTMLAudioElement) => {
    const cycle = nativeCycles.current.get(trackId);
    if (!cycle || cycle.endedHandled) {
      nativeCycles.current.set(trackId, { listenedSeconds: 0, lastTime: audio.currentTime, endedHandled: false });
      return;
    }
    cycle.lastTime = audio.currentTime;
  };

  const handleNativeProgress = (trackId: string, audio: HTMLAudioElement) => {
    const cycle = nativeCycles.current.get(trackId);
    if (!cycle || audio.paused) return;
    const delta = audio.currentTime - cycle.lastTime;
    if (delta >= 0 && delta <= 2.5) cycle.listenedSeconds += delta;
    cycle.lastTime = audio.currentTime;
  };

  const countCompletedPlay = (trackId: string, audio: HTMLAudioElement) => {
    const cycle = nativeCycles.current.get(trackId);
    if (!cycle || cycle.endedHandled) return;
    cycle.endedHandled = true;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const minimumSeconds = Math.min(30, duration * 0.7);
    if (!(duration > 0 && cycle.listenedSeconds >= duration * 0.7 && cycle.listenedSeconds >= minimumSeconds)) return;
    void incrementTrackPlay({ data: { trackId } }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["public-profile", handle] });
    }).catch(() => {
      // Playback remains successful even if telemetry cannot be recorded.
    });
  };

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link to="/" className="text-xs text-muted-foreground hover:text-accent">
          ← {t("creator.backToFeed")}
        </Link>

        {isLoading && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{t("creator.loading")}</p>}

        {!isLoading && !profile && (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {t("creator.notFound", { handle })}
          </p>
        )}

        {profile && (
          <>
            <header className="glass-strong flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
              <img
                src={getUserAvatarUrl(profile.avatar_url)}
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
                <StaffBadge badge={profile.staff_badge} />
                {profile.bio && <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p>}
              </div>
              <EditProfileModal profile={profile} />
              <BanUserToggle userId={profile.id} />
            </header>

            <DonationMethods userId={profile.id} />

            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">{t("creator.tracks")}</h2>
              {tracks.length === 0 && (
                <p className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
                  {t("creator.noPublished")}
                </p>
              )}
              {tracks.map((track) => {
                const embedUrl = getTrackEmbedUrl(track.source_type, track.source_id);
                const canDownload = downloadAvailability?.allowed[track.id] === true;
                return <article key={track.id} className="glass space-y-3 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <Music className="h-4 w-4 shrink-0 text-accent" />
                    <p className="truncate text-sm font-semibold">{track.title}</p>
                    <span className="ml-auto shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {track.genre}
                    </span>
                  </div>
                  {embedUrl ? (
                    <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      <img src={artFallback} alt="" className="h-full w-full object-cover" />
                      <ExternalTrackEmbed sourceType={track.source_type} sourceId={track.source_id} title={`${track.title} player`} />
                    </div>
                  ) : track.audio_type === "link" ? (
                    <a
                      href={track.audio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {t("creator.listenOnPlatform")}
                    </a>
                  ) : (
                    <audio
                      ref={(audio) => { if (audio) audioRefs.current.set(track.id, audio); else audioRefs.current.delete(track.id); }}
                      controls
                      controlsList={canDownload ? undefined : "nodownload"}
                      preload="none"
                      src={track.audio_url}
                      onPlay={(event) => { activateMedia({ id: `creator-native-${track.id}`, kind: "native" }); handleNativePlay(track.id, event.currentTarget); }}
                      onTimeUpdate={(event) => handleNativeProgress(track.id, event.currentTarget)}
                      onEnded={(event) => countCompletedPlay(track.id, event.currentTarget)}
                      className="w-full"
                    />
                  )}
                </article>;
              })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
