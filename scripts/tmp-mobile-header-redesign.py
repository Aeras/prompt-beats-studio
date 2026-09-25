from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: target not found")
    return text.replace(old, new, 1)

# AppShell: compact mobile global row + separate page identity row, preserve desktop shell.
p = Path("src/components/promptbeats/AppShell.tsx")
s = p.read_text()
s = replace_once(
    s,
    'import { ChevronLeft, ChevronRight, Menu, ShieldAlert, X } from "lucide-react";',
    'import { ChevronLeft, ChevronRight, Menu, Search, ShieldAlert, X } from "lucide-react";',
    "AppShell lucide import",
)
old_header = '''        <header className="glass-strong sticky top-0 z-20 border-b">
          <div className="relative mx-auto max-w-[1900px] px-4 py-3 md:px-8 md:py-4">
            <div className="flex items-start gap-3">
              <button
                aria-label={t("shell.openMenu")}
                onClick={() => setDrawer(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div
                className={cn(
                  "min-w-0 flex-1",
                  authenticated ? "pr-40 md:pr-44" : "pr-14 md:pr-16",
                )}
              >
                {header}
              </div>
            </div>
            <div className="absolute right-4 top-3 z-10 flex items-center gap-2 md:right-8 md:top-4">
              {authenticated && <ModerationCaseCenter />}
              {authenticated && <NotificationCenter />}
              <HelpMenu />
            </div>
          </div>
        </header>'''
new_header = '''        <header className="glass-strong sticky top-0 z-20 border-b">
          <div className="mx-auto max-w-[1900px] md:px-8 md:py-4">
            <div className="flex items-center gap-2 px-3 py-2 md:hidden">
              <button
                aria-label={t("shell.openMenu")}
                onClick={() => setDrawer(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20"
              >
                <Menu className="h-5 w-5" />
              </button>
              <form action="/" method="get" className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  type="search"
                  aria-label={t("discover.searchAria")}
                  placeholder={t("discover.searchPlaceholder")}
                  className="h-10 w-full rounded-full border border-white/10 bg-black/35 pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
                />
              </form>
              <div className="flex shrink-0 items-center gap-1.5">
                {authenticated && <ModerationCaseCenter />}
                {authenticated && <NotificationCenter />}
                <HelpMenu />
              </div>
            </div>
            {header && (
              <div className="border-t border-white/5 px-4 py-2.5 md:hidden">
                <div className="min-w-0">{header}</div>
              </div>
            )}

            <div className="relative hidden md:block">
              <div className="min-w-0 pr-44">{header}</div>
              <div className="absolute right-0 top-0 z-10 flex items-center gap-2">
                {authenticated && <ModerationCaseCenter />}
                {authenticated && <NotificationCenter />}
                <HelpMenu />
              </div>
            </div>
          </div>
        </header>'''
s = replace_once(s, old_header, new_header, "AppShell header")
p.write_text(s)

# Discover/feed: page identity in second row, full-width category/genre strips below it, no duplicate hero heading.
p = Path("src/routes/index.tsx")
s = p.read_text()
s = replace_once(s, 'import { Search } from "lucide-react";', 'import { Compass } from "lucide-react";', "index icon import")
# Read q from the shared mobile search form after hydration.
needle = '  const [query, setQuery] = useState("");\n'
s = replace_once(
    s,
    needle,
    needle + '  useEffect(() => {\n    if (typeof window === "undefined") return;\n    const value = new URLSearchParams(window.location.search).get("q");\n    if (value) setQuery(value);\n  }, []);\n',
    "index query init",
)
start = s.find('  const header = (\n')
end = s.find('\n\n  return (', start)
if start < 0 or end < 0:
    raise SystemExit("index header block not found")
s = s[:start] + '''  const header = (
    <div className="flex min-w-0 items-center gap-2">
      <Compass className="h-5 w-5 shrink-0 text-accent" />
      <span className="truncate font-display text-base font-bold md:text-lg">{t("nav.feedShort")}</span>
    </div>
  );''' + s[end:]
old_body = '''    <AppShell header={header}>
      <div className="px-4 pt-4 md:px-8">
        <ProfileBanner />
      </div>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-6 md:px-8 md:pb-[150px]">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">
            <span className="text-gradient-neon">{t("discover.titleLead")}</span>{" "}
            {t("discover.titleTail")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("discover.trackCount", { count: sourceFiltered.length })}
          </p>
          {category !== "creators" && (
            <div className="mt-3 flex w-full items-center justify-between gap-3">'''
new_body = '''    <AppShell header={header}>
      <div className="w-full border-b border-white/5 bg-black/10 py-2">
        <div className="flex w-full gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-8">
          {(["tracks", "creators", "prompts"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all",
                category === item
                  ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon"
                  : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
              )}
            >
              {categoryLabel(item)}
            </button>
          ))}
        </div>
        <div className="mt-1 flex w-full gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-8">
          {GENRES.map((item) => (
            <button
              key={item}
              onClick={() => setGenre(item)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-xs transition-all",
                genre === item
                  ? "border-transparent bg-gradient-neon font-semibold text-primary-foreground glow-neon"
                  : "border-white/10 text-muted-foreground hover:border-accent/50 hover:text-accent",
              )}
            >
              {localizedGenreLabel(item, t)}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pt-4 md:px-8">
        <ProfileBanner />
      </div>
      <main className="mx-auto max-w-[1600px] px-4 pb-[220px] pt-4 md:px-8 md:pb-[150px]">
        <div>
          {category !== "creators" && (
            <div className="flex w-full items-center justify-between gap-3">'''
s = replace_once(s, old_body, new_body, "index body header")
p.write_text(s)

# Library: page title lives only in the page identity row.
p = Path("src/routes/library.tsx")
s = p.read_text()
s = replace_once(
    s,
    '        <h1 className="font-display text-2xl font-bold md:text-3xl">{t("library.title")}</h1>\n\n        <div className="relative mt-4">',
    '        <div className="relative mt-1 md:mt-4">',
    "library duplicate title",
)
p.write_text(s)

# Generator: keep AI Prompt Studio as the identity row; remove the repeated large mobile hero title/subtitle.
p = Path("src/routes/generate.tsx")
s = p.read_text()
pattern = re.compile(
    r'(?P<indent>\s*)<div className="flex items-center gap-3">\s*<img[^>]*logoAsset[^>]*>.*?<div>\s*<h1[^>]*>\{t\("generator\.title"\)\}</h1>\s*<p[^>]*>\{t\("generator\.optimizedFor"\)\}</p>\s*</div>\s*</div>',
    re.S,
)
match = pattern.search(s)
if match:
    replacement = match.group(0)
    # Desktop keeps the hero; mobile hides it because the identity row already names the page.
    if 'hidden md:flex' not in replacement:
        replacement = replacement.replace('className="flex items-center gap-3"', 'className="hidden items-center gap-3 md:flex"', 1)
        s = s[:match.start()] + replacement + s[match.end():]
else:
    # More tolerant fallback: hide the nearest wrapper containing generator.title.
    pos = s.find('{t("generator.title")}')
    if pos < 0:
        raise SystemExit("generate title not found")
    wrapper = s.rfind('<div className="flex items-center gap-3">', 0, pos)
    if wrapper < 0:
        raise SystemExit("generate title wrapper not found")
    s = s[:wrapper] + s[wrapper:].replace('<div className="flex items-center gap-3">', '<div className="hidden items-center gap-3 md:flex">', 1)
p.write_text(s)

print("mobile header redesign patch applied")
