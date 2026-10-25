import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/tracks";
import { LikeButton } from "@/components/promptbeats/LikeButton";
import { TrackOwnerActions } from "@/components/promptbeats/TrackOwnerActions";
import { TrackLibraryActions } from "@/components/promptbeats/TrackLibraryActions";
import { ShareTrackButton } from "@/components/promptbeats/ShareTrackButton";
import { StaffBadge } from "@/components/promptbeats/StaffBadge";
import { ExplicitBadge } from "@/components/promptbeats/ExplicitBadge";
import { ReportTrackControl } from "@/components/promptbeats/ReportTrackControl";
import { SimilarSongsMenuItem } from "@/components/promptbeats/SimilarSongsMenuItem";
import { SimilarSongsDialog } from "@/components/promptbeats/SimilarSongsDialog";
import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import { useExternalPlayback } from "@/components/promptbeats/ExternalPlaybackProvider";
import {
  TrackContentOverlay,
  type TrackContentKind,
} from "@/components/promptbeats/TrackContentOverlay";
import { canUseNativeTrackPlayer, getTrackEmbedUrl } from "@/lib/track-sources";
import type { TrackGridMode } from "@/components/promptbeats/TrackGridView";
import { useI18n } from "@/i18n";

function PromptContentIcon({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", compact ? "h-[17px] w-[17px]" : "h-5 w-5")}
      fill="none"
    >
      <path
        d="M4.2 13.7c1.3 3.4 4.4 5.5 7.9 5.5 3.7 0 6.9-2.4 8-5.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="text-cyan-300"
      />
      <path
        d="M19.6 10.4C18.7 6.9 15.6 4.5 12 4.5c-3.7 0-6.9 2.5-8 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="text-violet-400"
      />
      <path
        d="M8 12h1.4l.8-2.2 1.4 4.3 1.3-5.8 1.5 4.8.8-1.9H17"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-fuchsia-300"
      />
      <path
        d="M17.8 3.2l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55.55-1.45Z"
        fill="currentColor"
        className="text-fuchsia-300"
      />
    </svg>
  );
}

function LyricsContentIcon({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", compact ? "h-[17px] w-[17px]" : "h-5 w-5")}
      fill="none"
    >
      <path
        d="M4 6.5h9.5M4 10h8M4 13.5h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="text-fuchsia-300"
      />
      <path
        d="M15.3 5.2v9.2a2.35 2.35 0 1 1-1.7-2.25V7.1l5.2-1.35v6.9a2.35 2.35 0 1 1-1.7-2.25V4.6l-1.8.6Z"
        fill="currentColor"
        className="text-violet-300"
      />
      <path
        d="M3.8 18.1c2.7-2.2 5.1-2.3 7.4-.3 2 1.7 4.2 1.7 7-.35"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="text-cyan-300"
      />
    </svg>
  );
}

export function TrackCard({
  track,
  isPlaying,
  onPlay,
  viewMode = "standard",
}: {
  track: Track;
  isPlaying: boolean;
  onPlay: (t: Track) => void;
  viewMode?: TrackGridMode;
}) {
  const { t, language } = useI18n();
  const { openExternalPlayback } = useExternalPlayback();
  const [activeContent, setActiveContent] = useState<TrackContentKind | null>(null);
  const [similarSongsOpen, setSimilarSongsOpen] = useState(false);
  const [contentAnchor, setContentAnchor] = useState<Pick<
    DOMRect,
    "left" | "top" | "bottom" | "width"
  > | null>(null);
  const [contentTrigger, setContentTrigger] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [playCount, setPlayCount] = useState(() => Number.parseInt(track.plays, 10) || 0);
  const embedUrl = getTrackEmbedUrl(track.sourceType, track.sourceId);
  const canUseNativePlayer = canUseNativeTrackPlayer(track.sourceType);
  const compact = viewMode === "compact";
  const ownerTrack = track.userId
    ? {
        id: track.id,
        user_id: track.userId,
        title: track.title,
        genre: track.genre,
        prompt: track.prompt,
        lyrics: track.lyrics,
        audio_url: track.audioUrl ?? "",
        audio_type: track.audioType ?? "upload",
        source_type: track.sourceType,
        source_url: track.sourceType === "upload" ? null : (track.audioUrl ?? null),
        created_with: track.createdWith ?? null,
        is_published: track.isPublished ?? true,
        prompt_is_public: track.promptIsPublic ?? true,
        lyrics_is_public: track.lyricsIsPublic ?? true,
        contains_explicit_lyrics: track.containsExplicitLyrics ?? false,
      }
    : null;

  useEffect(() => {
    const onPlayCounted = (event: Event) => {
      const detail = (event as CustomEvent<{ trackId?: string; plays?: number }>).detail;
      if (detail?.trackId === track.id && typeof detail.plays === "number")
        setPlayCount(detail.plays);
    };
    window.addEventListener("promptbeats:track-play-counted", onPlayCounted);
    return () => window.removeEventListener("promptbeats:track-play-counted", onPlayCounted);
  }, [track.id]);

  useEffect(() => {
    const onOtherTrackContentOpened = (event: Event) => {
      const detail = (event as CustomEvent<{ trackId?: string }>).detail;
      if (detail?.trackId !== track.id) setActiveContent(null);
    };
    window.addEventListener("promptbeats:track-content-opened", onOtherTrackContentOpened);
    return () =>
      window.removeEventListener("promptbeats:track-content-opened", onOtherTrackContentOpened);
  }, [track.id]);

  const toggleContent = (kind: TrackContentKind, element: HTMLElement) => {
    if (activeContent === kind) {
      setActiveContent(null);
      return;
    }
    const { left, top, bottom, width } = element.getBoundingClientRect();
    const cardRect = element.closest("article")?.getBoundingClientRect();
    setContentAnchor({
      left: cardRect?.left ?? left,
      top,
      bottom,
      width: cardRect?.width ?? width,
    });
    setContentTrigger(element);
    window.dispatchEvent(
      new CustomEvent("promptbeats:track-content-opened", { detail: { trackId: track.id } }),
    );
    setActiveContent(kind);
  };

  const copy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article
      className={cn(
        "glass group overflow-hidden rounded-2xl transition-all hover:border-white/20 hover:shadow-[0_10px_40px_-12px_color-mix(in_oklab,var(--neon)_45%,transparent)]",
        compact && "rounded-xl",
      )}
    >
      <div className="relative aspect-square overflow-hidden">
        <Link
          to="/track/$id"
          params={{ id: track.id }}
          aria-label={t("track.open", { title: track.title })}
          className="block h-full cursor-pointer"
        >
          <img
            src={track.art}
            alt={t("track.coverAlt", { title: track.title })}
            width={640}
            height={640}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        {embedUrl && !compact && (
          <ExternalTrackEmbed
            sourceType={track.sourceType}
            sourceId={track.sourceId}
            title={t("track.player", { title: track.title })}
          />
        )}
        <div
          className={cn(
            "absolute flex max-w-[80%] flex-col items-start",
            compact ? "left-2 top-2 gap-1" : "left-3 top-3 gap-1.5",
          )}
        >
          <span
            className={cn(
              "glass rounded-full uppercase tracking-widest text-accent",
              compact ? "px-1.5 py-0.5 text-[8px]" : "px-2.5 py-1 text-[10px]",
            )}
          >
            {track.genre}
          </span>
          {track.containsExplicitLyrics && <ExplicitBadge compact={compact} />}
          {track.createdWith && track.sourceType === "upload" && (
            <span
              className={cn(
                "rounded-full bg-black/70 font-medium text-white/85 backdrop-blur-sm",
                compact ? "px-1.5 py-0.5 text-[8px]" : "px-2.5 py-1 text-[10px]",
              )}
            >
              {language === "el" ? "Δημιουργήθηκε με" : "Created with"} {track.createdWith}
            </span>
          )}
        </div>
        {compact && embedUrl && (
          <>
            <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/90">
              {track.sourceType}
            </span>
            <button
              type="button"
              onClick={(event) =>
                openExternalPlayback({
                  trackId: track.id,
                  title: track.title,
                  sourceType: track.sourceType,
                  sourceId: track.sourceId,
                  returnFocusElement: event.currentTarget,
                })
              }
              aria-label={
                language === "el"
                  ? `Αναπαραγωγή ${track.title} με εξωτερικό player`
                  : `Play ${track.title} with external player`
              }
              title={language === "el" ? "Αναπαραγωγή εξωτερικά" : "Play externally"}
              className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-gradient-neon text-primary-foreground glow-neon transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 active:scale-95"
            >
              <Play className="ml-0.5 h-4 w-4" />
            </button>
          </>
        )}
        {!embedUrl && canUseNativePlayer && (
          <button
            onClick={() => onPlay(track)}
            aria-label={
              isPlaying
                ? t("track.pause", { title: track.title })
                : t("track.play", { title: track.title })
            }
            className={cn(
              "absolute grid place-items-center rounded-full bg-gradient-neon glow-neon transition-transform hover:scale-110 active:scale-95",
              compact ? "bottom-2 right-2 h-9 w-9" : "bottom-3 right-3 h-12 w-12",
            )}
          >
            {isPlaying ? (
              <Pause className={cn("text-primary-foreground", compact ? "h-4 w-4" : "h-5 w-5")} />
            ) : (
              <Play
                className={cn("ml-0.5 text-primary-foreground", compact ? "h-4 w-4" : "h-5 w-5")}
              />
            )}
          </button>
        )}
      </div>

      <div className={cn(compact ? "space-y-2 p-2.5" : "space-y-3 p-3")}>
        <div className="min-w-0">
          <h3 className={cn("truncate font-semibold", compact ? "text-sm" : "text-base")}>
            <Link
              to="/track/$id"
              params={{ id: track.id }}
              className="relative z-10 inline-block cursor-pointer transition-colors hover:text-accent"
            >
              {track.title}
            </Link>
          </h3>
          <p className={cn("truncate text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
            {track.userId ? (
              <Link
                to="/$handle"
                params={{ handle: track.handle }}
                className="transition-colors hover:text-accent"
                onClick={(e) => e.stopPropagation()}
              >
                {track.handle}
              </Link>
            ) : (
              <span>{track.handle}</span>
            )}
            {track.staffBadge && (
              <>
                <span className="mx-1.5">·</span>
                <StaffBadge badge={track.staffBadge} />
              </>
            )}
            {" · "}
            {t("track.plays", { count: playCount })}
          </p>
        </div>

        <div
          className={cn("flex w-full items-center", compact ? "gap-0" : "justify-between gap-2")}
        >
          <div
            data-track-actions="left"
            className={cn("flex shrink-0 items-center", compact ? "gap-0" : "gap-1")}
          >
            {track.prompt?.trim() && (
              <button
                type="button"
                onClick={(event) => toggleContent("prompt", event.currentTarget)}
                aria-label={
                  activeContent === "prompt" ? t("track.hidePrompt") : t("track.showPrompt")
                }
                title={activeContent === "prompt" ? t("track.hidePrompt") : t("track.showPrompt")}
                aria-pressed={activeContent === "prompt"}
                className={cn(
                  "grid shrink-0 place-items-center text-muted-foreground transition-all hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  compact ? "h-9 w-7" : "h-9 w-7",
                  activeContent === "prompt" &&
                    "text-accent drop-shadow-[0_0_7px_color-mix(in_oklab,var(--neon)_75%,transparent)]",
                )}
              >
                <PromptContentIcon compact={compact} />
              </button>
            )}
            {track.lyrics?.trim() && (
              <button
                type="button"
                onClick={(event) => toggleContent("lyrics", event.currentTarget)}
                aria-label={
                  activeContent === "lyrics" ? t("track.hideLyrics") : t("track.showLyrics")
                }
                title={activeContent === "lyrics" ? t("track.hideLyrics") : t("track.showLyrics")}
                aria-pressed={activeContent === "lyrics"}
                className={cn(
                  "grid shrink-0 place-items-center text-muted-foreground transition-all hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50",
                  compact ? "h-9 w-7" : "h-9 w-7",
                  activeContent === "lyrics" &&
                    "text-violet-300 drop-shadow-[0_0_7px_rgba(196,140,255,0.8)]",
                )}
              >
                <LyricsContentIcon compact={compact} />
              </button>
            )}
          </div>

          <div
            data-track-actions="right"
            className={cn(
              "ml-auto flex shrink-0 items-center justify-end",
              compact ? "gap-0" : "gap-0",
            )}
          >
            <LikeButton trackId={track.id} enabled={Boolean(track.userId)} compact={compact} />
            <TrackLibraryActions
              track={track}
              compact={compact}
              bare
              inlineActions={
                !compact && track.userId ? (
                  <ShareTrackButton
                    trackId={track.id}
                    ownerId={track.userId}
                    isPublished={track.isPublished ?? true}
                    promptIsPublic={track.promptIsPublic ?? true}
                    lyricsIsPublic={track.lyricsIsPublic ?? true}
                    trackTitle={track.title}
                    iconOnly
                    bare
                  />
                ) : null
              }
              menuActions={
                <>
                  <SimilarSongsMenuItem onOpen={() => setSimilarSongsOpen(true)} />
                  {compact && track.userId && (
                    <ShareTrackButton
                      trackId={track.id}
                      ownerId={track.userId}
                      isPublished={track.isPublished ?? true}
                      promptIsPublic={track.promptIsPublic ?? true}
                      lyricsIsPublic={track.lyricsIsPublic ?? true}
                      trackTitle={track.title}
                      menuItem
                    />
                  )}
                  {track.userId && (
                    <ReportTrackControl
                      trackId={track.id}
                      ownerId={track.userId}
                      isPublished={track.isPublished ?? true}
                      menuItem
                    />
                  )}
                </>
              }
              ownerActions={
                ownerTrack ? (
                  <TrackOwnerActions compact={compact} inlineMenuItems track={ownerTrack} />
                ) : null
              }
            />
          </div>
        </div>
      </div>
      <SimilarSongsDialog
        trackId={track.id}
        trackTitle={track.title}
        open={similarSongsOpen}
        onClose={() => setSimilarSongsOpen(false)}
      />
      {activeContent && (
        <TrackContentOverlay
          kind={activeContent}
          content={
            activeContent === "prompt" ? track.prompt?.trim() || t("track.noPrompt") : track.lyrics
          }
          anchorRect={contentAnchor}
          onClose={() => setActiveContent(null)}
          onCopy={
            activeContent === "prompt"
              ? track.prompt?.trim()
                ? () => copy(track.prompt)
                : undefined
              : () => copy(track.lyrics)
          }
          copied={copied}
          returnFocusElement={contentTrigger}
        />
      )}
    </article>
  );
}
