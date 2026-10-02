import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Instagram, Music, Share2, ShieldBan, Twitter, Youtube } from "lucide-react";

import { usePlayer } from "@/lib/player";
import { DonationMethods } from "@/components/promptbeats/DonationMethods";
import { FollowCreatorControl } from "@/components/promptbeats/FollowCreatorControl";
import { TrackCard } from "@/components/promptbeats/TrackCard";
import type { Track as PlayerTrack } from "@/lib/tracks";
import { EditProfileModal } from "@/components/promptbeats/EditProfileModal";
import { useModeration } from "@/hooks/useModeration";
import { ACCOUNT_BLOCK_REASONS, getUserBanStatus, setUserBanned } from "@/lib/moderation.functions";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { getSafeExternalUrl } from "@/lib/safe-external-url";
import {
  TrackGridModeToggle,
  trackGridClassName,
  useTrackGridMode,
} from "@/components/promptbeats/TrackGridView";
import artFallback from "@/assets/art-3.jpg";
import { useI18n } from "@/i18n";
import { localizedAccountReasonLabel } from "@/i18n/ui-catalog";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import {
  TrackSourceFilter,
  useTrackSourcePreference,
  type TrackSourcePreference,
} from "@/components/promptbeats/TrackSourceFilter";

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
  staff_badge?: string | null;
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
  source_type: string;
  source_url: string | null;
  source_id: string | null;
  art_url: string | null;
  cover_url: string | null;
  created_with?: string | null;
  allow_download?: boolean;
  duration_seconds?: number | null;
  is_published?: boolean;
  prompt_is_public?: boolean;
  lyrics_is_public?: boolean;
  contains_explicit_lyrics?: boolean;
  created_at?: string;
};

function SocialLinks({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const links = [
    { url: getSafeExternalUrl(profile.website_url), Icon: Globe, label: t("social.website") },
    {
      url: getSafeExternalUrl(profile.instagram_url, "instagram"),
      Icon: Instagram,
      label: t("social.instagram"),
    },
    {
      url: getSafeExternalUrl(profile.tiktok_url, "tiktok"),
      Icon: Music,
      label: t("social.tiktok"),
    },
    { url: getSafeExternalUrl(profile.x_url, "x"), Icon: Twitter, label: t("social.twitter") },
    {
      url: getSafeExternalUrl(profile.youtube_url, "youtube"),
      Icon: Youtube,
      label: t("social.youtube"),
    },
  ].filter((item) => Boolean(item.url));
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
  const { t } = useI18n();
  return (
    <button
      aria-label={t("profile.share")}
      title={t("profile.share")}
      onClick={async () => {
        const url = `https://promptbeats.app/@${handle}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success(t("profile.linkCopied"));
        } catch {
          toast.error(t("profile.copyFailed"));
        }
      }}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
    >
      <Share2 className="h-4 w-4" />
    </button>
  );
}

export function BanUserToggle({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { isAdmin, canBlockUsers, canUnblockUsers } = useModeration();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reasonCode, setReasonCode] = useState<(typeof ACCOUNT_BLOCK_REASONS)[number]["code"] | "">(
    "",
  );
  const [reasonText, setReasonText] = useState("");
  const canModerate = canBlockUsers || canUnblockUsers;
  const { data, error, isLoading } = useQuery({
    queryKey: ["ban-status", userId],
    queryFn: () => getUserBanStatus({ data: { userId } }),
    enabled: canModerate,
  });
  const banned = Boolean(data?.banned);
  if (!canModerate || error || isLoading || !data) return null;
  const validReason = Boolean(reasonCode) && (reasonCode !== "other" || Boolean(reasonText.trim()));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => {
            setReasonCode("");
            setReasonText("");
            setConfirming(true);
          }}
          className={
            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 " +
            (banned
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
              : "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20")
          }
        >
          <ShieldBan className="h-3.5 w-3.5" />
          {banned ? t("profile.unblock") : t("profile.block")}
        </button>
        {isAdmin && (
          <a
            href={`/management?userId=${encodeURIComponent(userId)}`}
            className="inline-flex items-center rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("profile.manage")}
          </a>
        )}
      </div>
      {confirming && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="glass-strong w-full max-w-md rounded-3xl p-6"
          >
            <h2 className="font-display text-lg font-bold">
              {banned ? t("profile.unblockTitle") : t("profile.blockTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {banned ? t("profile.unblockBody") : t("profile.blockBody")}
            </p>
            {!banned && (
              <div className="mt-4 space-y-2">
                <label className="text-xs text-muted-foreground">
                  {t("moderation.reason")}
                  <select
                    value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm"
                  >
                    <option value="">{t("profile.selectReason")}</option>
                    {ACCOUNT_BLOCK_REASONS.map((reason) => (
                      <option key={reason.code} value={reason.code}>
                        {localizedAccountReasonLabel(reason.code, reason.label, t)}
                      </option>
                    ))}
                  </select>
                </label>
                {reasonCode === "other" && (
                  <textarea
                    value={reasonText}
                    onChange={(event) => setReasonText(event.target.value)}
                    maxLength={500}
                    placeholder={t("profile.enterReason")}
                    className="min-h-20 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
                  />
                )}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground"
              >
                {t("common.cancel")}
              </button>
              <button
                disabled={busy || (!banned && !validReason)}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await setUserBanned({
                      data: {
                        userId,
                        banned: !banned,
                        reasonCode: banned ? undefined : reasonCode || undefined,
                        reasonText: banned ? undefined : reasonText,
                      },
                    });
                    await queryClient.invalidateQueries();
                    toast.success(
                      banned ? t("profile.accountUnblocked") : t("profile.accountBlocked"),
                    );
                    setConfirming(false);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : t("profile.accountUpdateFailed"),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className={
                  banned
                    ? "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    : "rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
                }
              >
                {busy
                  ? t("profile.working")
                  : banned
                    ? t("profile.confirmUnblock")
                    : t("profile.confirmBlock")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ArtistProfileView({
  profile,
  tracks,
  isLoading,
  notFoundLabel,
}: {
  profile: Profile | null;
  tracks: Track[];
  isLoading: boolean;
  notFoundLabel?: string;
}) {
  const { t, language } = useI18n();
  const { play, current, playing } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();
  const { preference: defaultTrackSource } = useTrackSourcePreference();
  const [trackSource, setTrackSource] = useState<TrackSourcePreference>(defaultTrackSource);
  useEffect(() => setTrackSource(defaultTrackSource), [defaultTrackSource, profile?.id]);
  const visibleTracks = tracks.filter((track) => {
    if (trackSource === "all") return true;
    const isUpload = track.source_type === "upload" || track.source_type == null;
    return trackSource === "uploads" ? isUpload : !isUpload;
  });
  const missingLabel = notFoundLabel ?? t("profile.notFound");

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link to="/" className="text-xs text-muted-foreground hover:text-accent">
          ← {t("auth.backFeed")}
        </Link>
        {isLoading && (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {t("profile.loading")}
          </p>
        )}
        {!isLoading && !profile && (
          <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {missingLabel}
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
                <div className="flex items-center gap-3">
                  <h1 className="min-w-0 truncate font-display text-2xl font-bold">
                    {profile.artist_alias || profile.display_name || profile.handle}
                  </h1>
                  <ShareProfileButton handle={profile.handle} />
                </div>
                <p className="text-xs text-muted-foreground">@{profile.handle}</p>
                <StaffBadge badge={profile.staff_badge} />
                {profile.bio ? (
                  <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p>
                ) : null}
                <SocialLinks profile={profile} />
                <FollowCreatorControl userId={profile.id} />
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <EditProfileModal profile={profile} />
                <BanUserToggle userId={profile.id} />
              </div>
            </header>

            <DonationMethods userId={profile.id} />

            <section className="space-y-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{t("profile.discography")}</h2>
                <div className="mt-3 flex w-full items-center justify-between gap-3">
                  <TrackSourceFilter
                    value={trackSource}
                    onChange={setTrackSource}
                    language={language}
                  />
                  <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />
                </div>
              </div>
              {visibleTracks.length === 0 && (
                <p className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
                  {t("profile.noPublished")}
                </p>
              )}
              <div className={trackGridClassName(gridMode)}>
                {visibleTracks.map((track) => {
                  const cardTrack: PlayerTrack = {
                    id: track.id,
                    userId: track.user_id,
                    title: track.title,
                    handle: profile.handle,
                    genre: track.genre,
                    art: track.cover_url ?? track.art_url ?? profile.avatar_url ?? artFallback,
                    duration: "--:--",
                    plays: "0",
                    prompt: track.prompt ?? "",
                    lyrics: track.lyrics ?? "",
                    audioUrl: track.audio_url,
                    audioType: track.audio_type === "link" ? "link" : "upload",
                    sourceType: track.source_type as PlayerTrack["sourceType"],
                    sourceId: track.source_id,
                    createdWith: (track.created_with as PlayerTrack["createdWith"]) ?? null,
                    allowDownload: track.allow_download === true,
                    durationSeconds: track.duration_seconds ?? null,
                    containsExplicitLyrics: track.contains_explicit_lyrics === true,
                    isPublished: track.is_published ?? true,
                    promptIsPublic: track.prompt_is_public ?? true,
                    lyricsIsPublic: track.lyrics_is_public ?? true,
                    staffBadge: profile.staff_badge ?? null,
                  };
                  return (
                    <TrackCard
                      key={track.id}
                      track={cardTrack}
                      viewMode={gridMode}
                      isPlaying={playing && current?.id === track.id}
                      onPlay={(selectedTrack) => play(selectedTrack, [])}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
