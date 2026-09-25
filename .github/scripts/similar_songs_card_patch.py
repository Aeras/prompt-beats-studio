from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing pattern in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, count))

# ShareTrackButton: allow rendering as an item inside the shared track actions menu.
share = "src/components/promptbeats/ShareTrackButton.tsx"
replace(share,
'''import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";''',
'''import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";''')
replace(share,
'''  bare?: boolean;
};''',
'''  bare?: boolean;
  menuItem?: boolean;
};''')
replace(share,
'''  compact = false,
  bare = false,
}: Props) {''',
'''  compact = false,
  bare = false,
  menuItem = false,
}: Props) {''')
replace(share,
'''  return (
    <>
      <button
        type="button"
        onClick={openShareHub}
        aria-label={language === "el" ? "Κοινοποίηση" : "Share"}''',
'''  if (menuItem) {
    return (
      <>
        <DropdownMenu.Item
          onSelect={() => openShareHub()}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-white/10 focus:bg-white/10"
        >
          <Share2 className="h-4 w-4" />
          {language === "el" ? "Κοινοποίηση" : "Share"}
        </DropdownMenu.Item>
        {modal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openShareHub}
        aria-label={language === "el" ? "Κοινοποίηση" : "Share"}''')

# ReportTrackControl: same inline menu support.
report = "src/components/promptbeats/ReportTrackControl.tsx"
replace(report,
'''import { cn } from "@/lib/utils";''',
'''import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";''')
replace(report,
'''  bare = false,
}: {''',
'''  bare = false,
  menuItem = false,
}: {''')
replace(report,
'''  bare?: boolean;
}) {''',
'''  bare?: boolean;
  menuItem?: boolean;
}) {''')
replace(report,
'''  const label = t("report.action");
  return (
    <>''',
'''  const label = t("report.action");
  if (menuItem) {
    return (
      <>
        <DropdownMenu.Item
          onSelect={() => setOpen(true)}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-amber-100 outline-none hover:bg-white/10 focus:bg-white/10"
        >
          <Flag className="h-4 w-4" /> {label}
        </DropdownMenu.Item>
        {modal}
      </>
    );
  }
  return (
    <>''')

# TrackLibraryActions: visible download + one secondary menu for both compact and standard cards.
lib = "src/components/promptbeats/TrackLibraryActions.tsx"
replace(lib,
'''  ownerActions = null,
  bare = false,
}: {
  track: Track;
  compact?: boolean;
  ownerActions?: ReactNode;
  bare?: boolean;
}) {''',
'''  ownerActions = null,
  menuActions = null,
  inlineActions = null,
  bare = false,
}: {
  track: Track;
  compact?: boolean;
  ownerActions?: ReactNode;
  menuActions?: ReactNode;
  inlineActions?: ReactNode;
  bare?: boolean;
}) {''')
start = '''  if (compact) {
    return (
      <>
        <DropdownMenu.Root modal={false}>'''
end = '''  const iconClass = bare
    ? "grid h-10 w-8 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"
    : "grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:border-white/5 disabled:text-muted-foreground/30 disabled:opacity-60 disabled:hover:border-white/5 disabled:hover:text-muted-foreground/30";
  return (
    <>
      <div
        className={bare ? "flex shrink-0 items-center gap-0" : "flex shrink-0 items-center gap-1.5"}
      >
        {favoritesAccess.allowed && (
          <button
            onClick={() => void favorite()}
            disabled={busy === "favorite"}
            aria-label={isFavorite ? copy.removeFavorite : copy.addFavorite}
            title={isFavorite ? copy.removeFavorite : copy.addFavorite}
            className={iconClass}
          >
            {busy === "favorite" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bookmark
                className={`${bare ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} ${isFavorite ? "fill-current text-accent" : ""}`}
              />
            )}
          </button>
        )}
        {canPlaylist && (
          <button
            onClick={() => setPlaylistOpen(true)}
            aria-label={copy.playlist}
            title={copy.playlist}
            className={iconClass}
          >
            <ListPlus className={bare ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />
          </button>
        )}
        {hasDownloadableSource && (
          <button
            onClick={() => void download()}
            disabled={!canDownload || busy === "download"}
            aria-label={canDownload ? copy.download : copy.downloadDisabled}
            title={canDownload ? copy.download : copy.downloadDisabled}
            className={iconClass}
          >
            {busy === "download" && canDownload ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className={bare ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />
            )}
          </button>
        )}
      </div>
      {playlistModal}
    </>
  );'''
p = Path(lib)
text = p.read_text()
si = text.find(start)
ei = text.find(end)
if si < 0 or ei < 0 or ei <= si:
    raise SystemExit("could not locate TrackLibraryActions render blocks")
new_render = '''  const compactIconClass = bare
    ? "grid h-8 w-5 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"
    : "grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground";
  const standardIconClass = bare
    ? "grid h-9 w-7 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"
    : "grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent";
  const iconClass = compact ? compactIconClass : standardIconClass;
  const iconSize = compact ? "h-4 w-4" : "h-[17px] w-[17px]";

  return (
    <>
      <div className="flex shrink-0 items-center gap-0">
        {hasDownloadableSource && (
          <button
            onClick={() => void download()}
            disabled={!canDownload || busy === "download"}
            aria-label={canDownload ? copy.download : copy.downloadDisabled}
            title={canDownload ? copy.download : copy.downloadDisabled}
            className={iconClass}
          >
            {busy === "download" && canDownload ? (
              <Loader2 className={`${iconSize} animate-spin`} />
            ) : (
              <Download className={iconSize} />
            )}
          </button>
        )}
        {inlineActions}
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              aria-label={language === "el" ? "Περισσότερες ενέργειες" : "More track actions"}
              className={iconClass}
            >
              <MoreHorizontal className={iconSize} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              align="end"
              onInteractOutside={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest?.('[role="dialog"]')) event.preventDefault();
              }}
              className="z-[120] min-w-56 rounded-xl border border-white/10 bg-[#111116]/95 p-1.5 text-sm shadow-2xl backdrop-blur-xl"
            >
              {favoritesAccess.allowed && (
                <DropdownMenu.Item
                  onSelect={() => void favorite()}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-white/10 focus:bg-white/10"
                >
                  <Bookmark className={`h-4 w-4 ${isFavorite ? "fill-current text-accent" : ""}`} />
                  {isFavorite ? copy.removeFavorite : copy.addFavorite}
                </DropdownMenu.Item>
              )}
              {canPlaylist && (
                <DropdownMenu.Item
                  onSelect={() => setPlaylistOpen(true)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-white/10 focus:bg-white/10"
                >
                  <ListPlus className="h-4 w-4" /> {copy.playlist}
                </DropdownMenu.Item>
              )}
              {menuActions}
              {ownerActions}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {playlistModal}
    </>
  );'''
text = text[:si] + new_render + text[ei + len(end):]
p.write_text(text)

# TrackCard: Prompt/Lyrics remain left; compact gets Like + Download + More.
# Standard gets Like + Download + Share + More, which fixes crowding there too.
card = "src/components/promptbeats/TrackCard.tsx"
replace(card,
'''import { ReportTrackControl } from "@/components/promptbeats/ReportTrackControl";''',
'''import { ReportTrackControl } from "@/components/promptbeats/ReportTrackControl";
import { SimilarSongsMenuItem } from "@/components/promptbeats/SimilarSongsMenuItem";''')
replace(card,
'''                  compact ? "h-9 w-6" : "h-10 w-8",''',
'''                  compact ? "h-8 w-5" : "h-9 w-7",''', 2)
old_right = '''            <LikeButton trackId={track.id} enabled={Boolean(track.userId)} compact={compact} />
            <TrackLibraryActions
              track={track}
              compact={compact}
              bare
              ownerActions={
                compact && ownerTrack ? (
                  <TrackOwnerActions compact inlineMenuItems track={ownerTrack} />
                ) : null
              }
            />
            {track.userId && (
              <ShareTrackButton
                trackId={track.id}
                ownerId={track.userId}
                isPublished={track.isPublished ?? true}
                promptIsPublic={track.promptIsPublic ?? true}
                lyricsIsPublic={track.lyricsIsPublic ?? true}
                trackTitle={track.title}
                iconOnly
                compact={compact}
                bare
              />
            )}
            {!compact && ownerTrack && <TrackOwnerActions menuMode bare track={ownerTrack} />}
            {track.userId && (
              <ReportTrackControl
                trackId={track.id}
                ownerId={track.userId}
                isPublished={track.isPublished ?? true}
                compact={compact}
                bare
              />
            )}'''
new_right = '''            <LikeButton trackId={track.id} enabled={Boolean(track.userId)} compact={compact} />
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
                  <SimilarSongsMenuItem trackId={track.id} trackTitle={track.title} />
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
              ownerActions={ownerTrack ? <TrackOwnerActions compact={compact} inlineMenuItems track={ownerTrack} /> : null}
            />'''
replace(card, old_right, new_right)
replace(card,
'''              compact ? "gap-0" : "gap-0.5",''',
'''              "gap-0",''')

# Like button: slightly smaller footprint so compact cards do not overlap.
like = "src/components/promptbeats/LikeButton.tsx"
replace(like,
'''        compact ? "h-9 w-6" : "h-10 min-w-8 gap-1",''',
'''        compact ? "h-8 w-5" : "h-9 min-w-7 gap-1",''')
replace(like,
'''          compact ? "h-[18px] w-[18px]" : "h-4 w-4",''',
'''          compact ? "h-4 w-4" : "h-[17px] w-[17px]",''')

# Share button bare standard sizing follows the reduced standard action row.
replace(share,
'''${compact ? "h-9 w-6" : "h-10 w-8"}''',
'''${compact ? "h-8 w-5" : "h-9 w-7"}''')
replace(share,
'''<Share2 className={bare ? "h-[18px] w-[18px]" : "h-4 w-4"} />''',
'''<Share2 className={bare ? "h-[17px] w-[17px]" : "h-4 w-4"} />''')

print("similar songs + card actions patch applied")
