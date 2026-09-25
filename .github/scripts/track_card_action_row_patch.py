from pathlib import Path
import re


def must_replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing pattern in {path}: {old[:120]!r}')
    text = text.replace(old, new, count)
    p.write_text(text)


def must_regex(path: str, pattern: str, repl: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    updated, n = re.subn(pattern, repl, text, count=count, flags=re.S)
    if n != count:
        raise SystemExit(f'regex expected {count}, got {n} in {path}')
    p.write_text(updated)

# TrackCard: title/metadata get their own full-width block, followed by one action row.
track = 'src/components/promptbeats/TrackCard.tsx'
pattern = r'''        <div className=\{cn\("flex items-start justify-between".*?\n        </div>\n\n        <div className=\{cn\("flex items-center justify-between".*?\n        </div>'''
replacement = '''        <div className="min-w-0">
          <h3 className={cn("truncate font-semibold", compact ? "text-sm" : "text-base")}>
            <Link
              to="/track/$id"
              params={{ id: track.id }}
              className="relative z-10 inline-block cursor-pointer transition-colors hover:text-accent"
            >
              {track.title}
            </Link>
          </h3>
          <p
            className={cn("truncate text-muted-foreground", compact ? "text-[10px]" : "text-xs")}
          >
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
          className={cn(
            "flex items-center justify-between",
            compact ? "gap-1" : "gap-2",
          )}
        >
          <div
            data-track-actions="left"
            className={cn("flex min-w-0 items-center", compact ? "gap-0.5" : "gap-1")}
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
                  compact ? "h-9 w-6" : "h-10 w-8",
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
                  compact ? "h-9 w-6" : "h-10 w-8",
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
              "ml-auto flex min-w-0 shrink-0 items-center justify-end",
              compact ? "gap-0" : "gap-0.5",
            )}
          >
            <LikeButton trackId={track.id} enabled={Boolean(track.userId)} compact={compact} />
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
            )}
          </div>
        </div>'''
must_regex(track, pattern, replacement)

# LikeButton: compact action rows hide the count and use a small invisible footprint without a visual container.
like = 'src/components/promptbeats/LikeButton.tsx'
must_replace(
    like,
    'export function LikeButton({ trackId, enabled = true }: { trackId: string; enabled?: boolean }) {',
    '''export function LikeButton({
  trackId,
  enabled = true,
  compact = false,
}: {
  trackId: string;
  enabled?: boolean;
  compact?: boolean;
}) {''',
)
must_replace(
    like,
    '        "flex shrink-0 items-center gap-1.5 text-xs transition-colors",',
    '        "flex shrink-0 items-center justify-center text-xs transition-colors",\n        compact ? "h-9 w-6" : "h-10 min-w-8 gap-1",',
)
must_replace(
    like,
    '      <Heart className={cn("h-4 w-4", liked && "fill-current drop-shadow-[0_0_8px_var(--neon)]")} />\n      {count > 0 && <span className="tabular-nums">{count}</span>}',
    '''      <Heart
        className={cn(
          compact ? "h-[18px] w-[18px]" : "h-4 w-4",
          liked && "fill-current drop-shadow-[0_0_8px_var(--neon)]",
        )}
      />
      {!compact && count > 0 && <span className="tabular-nums">{count}</span>}''',
)

# TrackLibraryActions: allow bare action triggers for cards while preserving framed styling elsewhere.
lib = 'src/components/promptbeats/TrackLibraryActions.tsx'
must_replace(
    lib,
    '''  ownerActions = null,
}: {
  track: Track;
  compact?: boolean;
  ownerActions?: ReactNode;
}) {''',
    '''  ownerActions = null,
  bare = false,
}: {
  track: Track;
  compact?: boolean;
  ownerActions?: ReactNode;
  bare?: boolean;
}) {''',
)
must_replace(
    lib,
    '''              className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />''',
    '''              className={
                bare
                  ? "grid h-9 w-6 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  : "grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
              }
            >
              <MoreHorizontal className={bare ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />''',
)
must_replace(
    lib,
    '''  const iconClass =
    "grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:border-white/5 disabled:text-muted-foreground/30 disabled:opacity-60 disabled:hover:border-white/5 disabled:hover:text-muted-foreground/30";''',
    '''  const iconClass = bare
    ? "grid h-10 w-8 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"
    : "grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:border-white/5 disabled:text-muted-foreground/30 disabled:opacity-60 disabled:hover:border-white/5 disabled:hover:text-muted-foreground/30";''',
)
must_replace(
    lib,
    '<div className="flex shrink-0 items-center gap-1.5">',
    '<div className={bare ? "flex shrink-0 items-center gap-0" : "flex shrink-0 items-center gap-1.5"}>',
    count=1,
)
must_replace(lib, '<Bookmark className={`h-3.5 w-3.5 ${isFavorite ? "fill-current text-accent" : ""}`} />', '<Bookmark className={`${bare ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} ${isFavorite ? "fill-current text-accent" : ""}`} />')
must_replace(lib, '<ListPlus className="h-3.5 w-3.5" />', '<ListPlus className={bare ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />')
must_replace(lib, '<Download className="h-3.5 w-3.5" />', '<Download className={bare ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />')

# Share button: bare mode removes the visible circle/border but keeps the modal unchanged.
share = 'src/components/promptbeats/ShareTrackButton.tsx'
must_replace(share, '  compact?: boolean;\n};', '  compact?: boolean;\n  bare?: boolean;\n};')
must_replace(
    share,
    '''  iconOnly = false,
  compact = false,
}: Props) {''',
    '''  iconOnly = false,
  compact = false,
  bare = false,
}: Props) {''',
)
must_replace(
    share,
    '''          iconOnly
            ? `grid place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent ${compact ? "h-7 w-7" : "h-8 w-8"}`
            : "inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"''',
    '''          iconOnly
            ? bare
              ? `grid place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${compact ? "h-9 w-6" : "h-10 w-8"}`
              : `grid place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent ${compact ? "h-7 w-7" : "h-8 w-8"}`
            : "inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"''',
)
must_replace(share, '<Share2 className="h-4 w-4" />', '<Share2 className={bare ? "h-[18px] w-[18px]" : "h-4 w-4"} />', count=1)

# Report control: bare card mode.
report = 'src/components/promptbeats/ReportTrackControl.tsx'
must_replace(
    report,
    '''  compact = false,
  iconOnly = true,
}: {
  trackId: string;
  ownerId: string;
  isPublished: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}) {''',
    '''  compact = false,
  iconOnly = true,
  bare = false,
}: {
  trackId: string;
  ownerId: string;
  isPublished: boolean;
  compact?: boolean;
  iconOnly?: boolean;
  bare?: boolean;
}) {''',
)
must_replace(
    report,
    '''        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-amber-300/40 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50",
          compact ? "h-7 w-7" : iconOnly ? "h-8 w-8" : "h-9 gap-2 px-3 text-xs",
        )}''',
    '''        className={cn(
          bare
            ? "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
            : "inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-amber-300/40 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50",
          bare
            ? compact
              ? "h-9 w-6"
              : "h-10 w-8"
            : compact
              ? "h-7 w-7"
              : iconOnly
                ? "h-8 w-8"
                : "h-9 gap-2 px-3 text-xs",
        )}''',
)
must_replace(report, '<Flag className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />', '<Flag className={bare ? "h-[18px] w-[18px]" : compact ? "h-3.5 w-3.5" : "h-4 w-4"} />')

# Owner menu trigger: same bare treatment for the standard card row.
owner = 'src/components/promptbeats/TrackOwnerActions.tsx'
must_replace(
    owner,
    '''  inlineMenuItems = false,
}: {
  track: EditableTrack;
  compact?: boolean;
  menuMode?: boolean;
  inlineMenuItems?: boolean;
}) {''',
    '''  inlineMenuItems = false,
  bare = false,
}: {
  track: EditableTrack;
  compact?: boolean;
  menuMode?: boolean;
  inlineMenuItems?: boolean;
  bare?: boolean;
}) {''',
)
must_replace(
    owner,
    '''  const buttonClass =
    "grid place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent " +
    (compact ? "h-7 w-7" : "h-8 w-8");''',
    '''  const buttonClass = bare
    ? "grid h-10 w-8 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    : "grid place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent " +
      (compact ? "h-7 w-7" : "h-8 w-8");''',
)
must_replace(owner, '<MoreHorizontal className="h-4 w-4" />', '<MoreHorizontal className={bare ? "h-[18px] w-[18px]" : "h-4 w-4"} />', count=1)

# Regression test for the card layout and borderless action mode.
test = Path('src/lib/track-card-action-row.test.ts')
test.write_text('''import { describe, expect, test } from "bun:test";\nimport { readFile } from "node:fs/promises";\n\nconst source = (path: string) => readFile(path, "utf8");\n\ndescribe("Track card action row", () => {\n  test("uses one action row with content left and utilities right", async () => {\n    const card = await source("src/components/promptbeats/TrackCard.tsx");\n    expect(card).toContain('data-track-actions="left"');\n    expect(card).toContain('data-track-actions="right"');\n    expect(card).toContain("<PromptContentIcon compact={compact} />");\n    expect(card).toContain("<LyricsContentIcon compact={compact} />");\n    expect(card).toContain("<TrackLibraryActions");\n    expect(card).toContain("bare");\n    expect(card).toContain("<ShareTrackButton");\n    expect(card).toContain("<ReportTrackControl");\n  });\n\n  test("card action controls expose borderless bare variants", async () => {\n    const files = await Promise.all([\n      source("src/components/promptbeats/TrackLibraryActions.tsx"),\n      source("src/components/promptbeats/ShareTrackButton.tsx"),\n      source("src/components/promptbeats/ReportTrackControl.tsx"),\n      source("src/components/promptbeats/TrackOwnerActions.tsx"),\n    ]);\n    for (const content of files) expect(content).toContain("bare");\n    expect(files[0]).toContain('bare ? "grid h-10 w-8');\n    expect(files[1]).toContain('bare ? `grid place-items-center');\n  });\n});\n''')

print('track card action row patch applied')
