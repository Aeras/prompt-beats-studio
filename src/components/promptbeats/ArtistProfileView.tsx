import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Globe, Instagram, Music, Play, Pause, Share2, ShieldBan, Twitter, Youtube } from "lucide-react";

import { usePlayer } from "@/lib/player";
import { DonateButton } from "@/components/promptbeats/DonateButton";
import { LikeButton } from "@/components/promptbeats/LikeButton";
import { TrackOwnerActions } from "@/components/promptbeats/TrackOwnerActions";
import { TrackLibraryActions } from "@/components/promptbeats/TrackLibraryActions";
import type { Track as PlayerTrack } from "@/lib/tracks";
import { EditProfileModal } from "@/components/promptbeats/EditProfileModal";
import { useModeration } from "@/hooks/useModeration";
import { ACCOUNT_BLOCK_REASONS, getUserBanStatus, setUserBanned } from "@/lib/moderation.functions";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { getSafeExternalUrl } from "@/lib/safe-external-url";
import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import { TrackGridModeToggle, trackGridClassName, useTrackGridMode } from "@/components/promptbeats/TrackGridView";
import { canUseNativeTrackPlayer, getTrackEmbedUrl } from "@/lib/track-sources";
import { cn } from "@/lib/utils";
import artFallback from "@/assets/art-3.jpg";
import { useI18n } from "@/i18n";
import { localizedAccountReasonLabel, localizedGenreLabel } from "@/i18n/ui-catalog";

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
  created_with?: PlayerTrack["createdWith"];
  allow_download?: boolean;
  duration_seconds?: number | null;
  is_published?: boolean;
  created_at?: string;
};

function CopyPromptButton({ prompt }: { prompt: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={t("library.copyPrompt")}
      title={t("library.copyPrompt")}
      onClick={async () => {
        try { await navigator.clipboard.writeText(prompt); } catch { /* clipboard unavailable */ }
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
  const { t } = useI18n();
  const links = [
    { url: getSafeExternalUrl(profile.website_url), Icon: Globe, label: t("social.website") },
    { url: getSafeExternalUrl(profile.instagram_url, "instagram"), Icon: Instagram, label: t("social.instagram") },
    { url: getSafeExternalUrl(profile.tiktok_url, "tiktok"), Icon: Music, label: t("social.tiktok") },
    { url: getSafeExternalUrl(profile.x_url, "x"), Icon: Twitter, label: t("social.twitter") },
    { url: getSafeExternalUrl(profile.youtube_url, "youtube"), Icon: Youtube, label: t("social.youtube") },
  ].filter((item) => Boolean(item.url));
  if (links.length === 0) return null;
  return <div className="mt-3 flex flex-wrap items-center gap-2">{links.map(({ url, Icon, label }) => <a key={label} href={url!} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"><Icon className="h-4 w-4" /></a>)}</div>;
}

function ShareProfileButton({ handle }: { handle: string }) {
  const { t } = useI18n();
  return (
    <button
      aria-label={t("profile.share")}
      title={t("profile.share")}
      onClick={async () => {
        const url = `https://promptbeats.app/@${handle}`;
        try { await navigator.clipboard.writeText(url); toast.success(t("profile.linkCopied")); }
        catch { toast.error(t("profile.copyFailed")); }
      }}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
    ><Share2 className="h-4 w-4" /></button>
  );
}

export function BanUserToggle({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { isAdmin, canBlockUsers, canUnblockUsers } = useModeration();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reasonCode, setReasonCode] = useState<(typeof ACCOUNT_BLOCK_REASONS)[number]["code"] | "">("");
  const [reasonText, setReasonText] = useState("");
  const canModerate = canBlockUsers || canUnblockUsers;
  const { data, error, isLoading } = useQuery({ queryKey: ["ban-status", userId], queryFn: () => getUserBanStatus({ data: { userId } }), enabled: canModerate });
  const banned = Boolean(data?.banned);
  if (!canModerate || error || isLoading || !data) return null;
  const validReason = Boolean(reasonCode) && (reasonCode !== "other" || Boolean(reasonText.trim()));

  return <>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => { setReasonCode(""); setReasonText(""); setConfirming(true); }} className={"inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 " + (banned ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20" : "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20")}>
        <ShieldBan className="h-3.5 w-3.5" />{banned ? t("profile.unblock") : t("profile.block")}
      </button>
      {isAdmin && <a href={`/management?userId=${encodeURIComponent(userId)}`} className="inline-flex items-center rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">{t("profile.manage")}</a>}
    </div>
    {confirming && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="glass-strong w-full max-w-md rounded-3xl p-6">
      <h2 className="font-display text-lg font-bold">{banned ? t("profile.unblockTitle") : t("profile.blockTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{banned ? t("profile.unblockBody") : t("profile.blockBody")}</p>
      {!banned && <div className="mt-4 space-y-2"><label className="text-xs text-muted-foreground">{t("moderation.reason")}<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm"><option value="">{t("profile.selectReason")}</option>{ACCOUNT_BLOCK_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{localizedAccountReasonLabel(reason.code, reason.label, t)}</option>)}</select></label>{reasonCode === "other" && <textarea value={reasonText} onChange={(event) => setReasonText(event.target.value)} maxLength={500} placeholder={t("profile.enterReason")} className="min-h-20 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm" />}</div>}
      <div className="mt-5 flex justify-end gap-3"><button disabled={busy} onClick={() => setConfirming(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground">{t("common.cancel")}</button><button disabled={busy || (!banned && !validReason)} onClick={async () => { setBusy(true); try { await setUserBanned({ data: { userId, banned: !banned, reasonCode: banned ? undefined : (reasonCode || undefined), reasonText: banned ? undefined : reasonText } }); await queryClient.invalidateQueries(); toast.success(banned ? t("profile.accountUnblocked") : t("profile.accountBlocked")); setConfirming(false); } catch (err) { toast.error(err instanceof Error ? err.message : t("profile.accountUpdateFailed")); } finally { setBusy(false); } }} className={banned ? "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" : "rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-50"}>{busy ? t("profile.working") : banned ? t("profile.confirmUnblock") : t("profile.confirmBlock")}</button></div>
    </div></div>}
  </>;
}

export function ArtistProfileView({ profile, tracks, isLoading, notFoundLabel }: { profile: Profile | null; tracks: Track[]; isLoading: boolean; notFoundLabel?: string }) {
  const { t } = useI18n();
  const { play, current, playing } = usePlayer();
  const { mode: gridMode, setMode: setGridMode } = useTrackGridMode();
  const compact = gridMode === "compact";
  const missingLabel = notFoundLabel ?? t("profile.notFound");

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link to="/" className="text-xs text-muted-foreground hover:text-accent">← {t("auth.backFeed")}</Link>
        {isLoading && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{t("profile.loading")}</p>}
        {!isLoading && !profile && <p className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">{missingLabel}</p>}

        {profile && <>
          <header className="glass-strong flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
            <img src={profile.avatar_url ?? `https://i.pravatar.cc/120?u=${profile.id}`} alt={`${profile.artist_alias ?? profile.handle} avatar`} width={88} height={88} className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-primary/60" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3"><h1 className="min-w-0 truncate font-display text-2xl font-bold">{profile.artist_alias || profile.display_name || profile.handle}</h1><ShareProfileButton handle={profile.handle} /></div>
              <p className="text-xs text-muted-foreground">@{profile.handle}</p>
              <StaffBadge badge={profile.staff_badge} />
              {profile.bio ? <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p> : null}
              <SocialLinks profile={profile} />
            </div>
            <div className="flex shrink-0 flex-col gap-2"><EditProfileModal profile={profile} /><BanUserToggle userId={profile.id} /></div>
          </header>

          <DonateButton provider={profile.donation_provider} url={profile.donation_url} customName={profile.donation_custom_name} />

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">{t("profile.discography")}</h2><TrackGridModeToggle mode={gridMode} onChange={setGridMode} /></div>
            {tracks.length === 0 && <p className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">{t("profile.noPublished")}</p>}
            <div className={trackGridClassName(gridMode)}>
              {tracks.map((track) => {
                const embedUrl = getTrackEmbedUrl(track.source_type, track.source_id);
                const canUseNativePlayer = canUseNativeTrackPlayer(track.source_type);
                const largeArtwork = track.cover_url ?? track.art_url ?? profile.avatar_url ?? artFallback;
                const nativeTrack: PlayerTrack = {
                  id: track.id,
                  userId: track.user_id,
                  title: track.title,
                  handle: `@${profile.handle}`,
                  genre: track.genre,
                  art: largeArtwork,
                  duration: "--:--",
                  plays: "0",
                  prompt: track.prompt ?? "",
                  lyrics: track.lyrics ?? "",
                  audioUrl: track.audio_url,
                  audioType: track.audio_type === "link" ? "link" as const : "upload" as const,
                  sourceType: track.source_type as PlayerTrack["sourceType"],
                  sourceId: track.source_id,
                  createdWith: track.created_with ?? null,
                  allowDownload: track.allow_download === true,
                  durationSeconds: track.duration_seconds ?? null,
                  isPublished: track.is_published ?? true,
                };
                const isPlaying = current?.id === track.id && playing;
                return <article key={track.id} className={cn("glass space-y-3 rounded-2xl p-4", compact && "space-y-2 rounded-xl p-2.5")}>
                  <div className="flex items-center gap-2">
                    <Music className={cn("shrink-0 text-accent", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                    <Link to="/track/$id" params={{ id: track.id }} className={cn("truncate font-semibold hover:text-accent", compact ? "text-xs" : "text-sm")}>{track.title}</Link>
                    {track.prompt ? <CopyPromptButton prompt={track.prompt} /> : null}
                    <LikeButton trackId={track.id} />
                    <TrackLibraryActions track={nativeTrack} compact={compact} />
                    <TrackOwnerActions compact track={{ id: track.id, user_id: track.user_id, title: track.title, genre: track.genre, prompt: track.prompt ?? "", lyrics: track.lyrics ?? "", audio_url: track.audio_url, audio_type: track.audio_type, source_type: track.source_type, source_url: track.source_url }} />
                  </div>
                  <p className={cn("uppercase tracking-widest text-muted-foreground", compact ? "text-[8px]" : "text-[10px]")}>{localizedGenreLabel(track.genre, t)}</p>
                  {compact ? (
                    <div className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/30">
                      <Link to="/track/$id" params={{ id: track.id }} aria-label={t("track.open", { title: track.title })} className="block h-full"><img src={profile.avatar_url ?? artFallback} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /></Link>
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                      {embedUrl ? <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/90">{track.source_type}</span> : canUseNativePlayer ? <button type="button" onClick={(event) => { event.preventDefault(); play(nativeTrack, []); }} aria-label={isPlaying ? t("track.pause", { title: track.title }) : t("track.play", { title: track.title })} className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-gradient-neon text-primary-foreground glow-neon">{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}</button> : null}
                    </div>
                  ) : embedUrl ? (
                    <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30"><img src={artFallback} alt="" className="h-full w-full object-cover" /><ExternalTrackEmbed sourceType={track.source_type} sourceId={track.source_id} title={t("track.player", { title: track.title })} /></div>
                  ) : canUseNativePlayer ? (
                    <div className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      <Link to="/track/$id" params={{ id: track.id }} aria-label={t("track.open", { title: track.title })} className="block h-full w-full">
                        <img src={largeArtwork} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      </Link>
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                      <button type="button" onClick={() => play(nativeTrack, [])} aria-label={isPlaying ? t("track.pause", { title: track.title }) : t("track.play", { title: track.title })} className="absolute bottom-3 right-3 grid h-12 w-12 place-items-center rounded-full bg-gradient-neon text-primary-foreground glow-neon transition-transform hover:scale-105 active:scale-95">
                        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                      </button>
                    </div>
                  ) : null}
                </article>;
              })}
            </div>
          </section>
        </>}
      </div>
    </div>
  );
}
