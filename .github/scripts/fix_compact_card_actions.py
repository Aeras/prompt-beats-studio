from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing pattern in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, count))

# Compact card: keep content actions as a distinct left group and utilities as a distinct right group.
card = "src/components/promptbeats/TrackCard.tsx"
replace(card,
'''      className={cn("shrink-0 overflow-visible", compact ? "h-[18px] w-[18px]" : "h-5 w-5")}''',
'''      className={cn("shrink-0 overflow-visible", compact ? "h-[17px] w-[17px]" : "h-5 w-5")}''',
2)
replace(card,
'''        <div className={cn("flex items-center justify-between", compact ? "gap-1" : "gap-2")}>''',
'''        <div
          className={cn(
            "flex w-full items-center justify-between",
            compact ? "gap-3" : "gap-2",
          )}
        >''')
replace(card,
'''            className={cn("flex min-w-0 items-center", compact ? "gap-0.5" : "gap-1")}''',
'''            className={cn("flex shrink-0 items-center", compact ? "gap-1" : "gap-1")}''')
replace(card,
'''                  compact ? "h-8 w-5" : "h-9 w-7",''',
'''                  compact ? "h-9 w-8" : "h-9 w-7",''',
2)
replace(card,
'''            className={cn("ml-auto flex min-w-0 shrink-0 items-center justify-end", "gap-0")}''',
'''            className={cn(
              "ml-auto flex shrink-0 items-center justify-end",
              compact ? "gap-1" : "gap-0",
            )}''')

# Compact like target is separated from neighboring actions while keeping the visible icon small.
like = "src/components/promptbeats/LikeButton.tsx"
replace(like,
'''        compact ? "h-8 w-5" : "h-9 min-w-7 gap-1",''',
'''        compact ? "h-9 w-8" : "h-9 min-w-7 gap-1",''')
replace(like,
'''          compact ? "h-4 w-4" : "h-[17px] w-[17px]",''',
'''          compact ? "h-[15px] w-[15px]" : "h-[17px] w-[17px]",''')

# Download / More: safe compact targets, tighter visible icons, and vertical ellipsis.
actions = "src/components/promptbeats/TrackLibraryActions.tsx"
replace(actions,
'''import { Bookmark, Download, ListPlus, Loader2, MoreHorizontal, Plus, X } from "lucide-react";''',
'''import { Bookmark, Download, ListPlus, Loader2, MoreVertical, Plus, X } from "lucide-react";''')
replace(actions,
'''    ? "grid h-8 w-5 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"''',
'''    ? "grid h-9 w-8 place-items-center text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:text-muted-foreground/30 disabled:opacity-60"''')
replace(actions,
'''  const iconSize = compact ? "h-4 w-4" : "h-[17px] w-[17px]";''',
'''  const iconSize = compact ? "h-[15px] w-[15px]" : "h-[17px] w-[17px]";''')
replace(actions,
'''      <div className="flex shrink-0 items-center gap-0">''',
'''      <div className={compact ? "flex shrink-0 items-center gap-1" : "flex shrink-0 items-center gap-0"}>''')
replace(actions,
'''              <MoreHorizontal className={iconSize} />''',
'''              <MoreVertical className={iconSize} />''')

# Regression coverage for the requested compact layout.
test = "src/lib/track-card-action-row.test.ts"
replace(test,
'''    expect(libraryActions).toContain("h-8 w-5");
    expect(libraryActions).toContain("h-9 w-7");
    expect(libraryActions).toContain("<MoreHorizontal");''',
'''    expect(libraryActions).toContain("h-9 w-8");
    expect(libraryActions).toContain("h-9 w-7");
    expect(libraryActions).toContain("<MoreVertical");''')
replace(test,
'''    expect(card).toContain('data-track-actions="right"');''',
'''    expect(card).toContain('data-track-actions="right"');
    expect(card).toContain('compact ? "gap-3" : "gap-2"');
    expect(card).toContain('compact ? "h-9 w-8" : "h-9 w-7"');''')

print("compact card actions patch applied")
