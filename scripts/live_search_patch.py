from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Global header search: controlled, debounced, and Enter remains an immediate optional submit.
path = "src/components/promptbeats/AppShell.tsx"
replace_once(
    path,
    'import { Link, useRouterState } from "@tanstack/react-router";\n',
    'import { Link, useNavigate, useRouterState } from "@tanstack/react-router";\n',
)
replace_once(
    path,
    'const DRAWER_IDLE_MS = 2_000;\n',
    'const DRAWER_IDLE_MS = 2_000;\nconst LIVE_SEARCH_DEBOUNCE_MS = 250;\n',
)
replace_once(
    path,
    '''  const [tabletLandscape, setTabletLandscape] = useState(false);
  const drawerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useActiveNav();
  const { t } = useI18n();''',
    '''  const [tabletLandscape, setTabletLandscape] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const drawerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSearchTouchedRef = useRef(false);
  const active = useActiveNav();
  const currentHref = useRouterState({ select: (state) => state.location.href });
  const navigate = useNavigate();
  const { t } = useI18n();''',
)
replace_once(
    path,
    '''  useEffect(() => {
    if (!isInvalid) return;
    void supabase.auth.signOut().then(() => window.location.assign("/auth"));
  }, [isInvalid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);''',
    '''  useEffect(() => {
    if (!isInvalid) return;
    void supabase.auth.signOut().then(() => window.location.assign("/auth"));
  }, [isInvalid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URL(currentHref, window.location.origin).searchParams.get("q") ?? "";
    liveSearchTouchedRef.current = false;
    setGlobalSearch((current) => (current === query ? current : query));
  }, [currentHref]);

  const runGlobalSearch = useCallback(
    (value: string) => {
      const query = value.trim();
      void navigate({
        to: "/",
        search: query ? { q: query } : {},
        replace: true,
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (!liveSearchTouchedRef.current) return;
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    liveSearchTimerRef.current = setTimeout(() => {
      liveSearchTouchedRef.current = false;
      runGlobalSearch(globalSearch);
    }, LIVE_SEARCH_DEBOUNCE_MS);
    return () => {
      if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    };
  }, [globalSearch, runGlobalSearch]);

  const handleGlobalSearchChange = (value: string) => {
    liveSearchTouchedRef.current = true;
    setGlobalSearch(value);
  };

  const submitGlobalSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveSearchTouchedRef.current = false;
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    runGlobalSearch(globalSearch);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);''',
)
replace_once(
    path,
    '''              <form action="/" method="get" className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  type="search"
                  aria-label={t("discover.searchAria")}
                  placeholder={t("discover.searchPlaceholder")}
                  className="h-10 w-full rounded-full border border-white/10 bg-black/35 pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
                />
              </form>''',
    '''              <form onSubmit={submitGlobalSearch} className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  type="search"
                  value={globalSearch}
                  onChange={(event) => handleGlobalSearchChange(event.target.value)}
                  aria-label={t("discover.searchAria")}
                  placeholder={t("discover.searchPlaceholder")}
                  autoComplete="off"
                  className="h-10 w-full rounded-full border border-white/10 bg-black/35 pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
                />
              </form>''',
)

# Discover route: make q an optional router search param so every debounced URL update rerenders results
# without forcing every existing Link to provide a search object.
path = "src/routes/index.tsx"
replace_once(
    path,
    '''export const Route = createFileRoute("/")({
  head: () => ({''',
    '''export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search["q"] === "string" ? search["q"].trim() : "";
    return q ? { q } : {};
  },
  head: () => ({''',
)
replace_once(
    path,
    '''  const { t, language } = useI18n();
  const [genre, setGenre] = useState("All");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = new URLSearchParams(window.location.search).get("q");
    if (value) setQuery(value);
  }, []);
  const [category, setCategory] = useState<"tracks" | "creators" | "prompts">("tracks");''',
    '''  const { t, language } = useI18n();
  const { q } = Route.useSearch();
  const query = q ?? "";
  const [genre, setGenre] = useState("All");
  const [category, setCategory] = useState<"tracks" | "creators" | "prompts">("tracks");''',
)

# Regression coverage: all current user-visible search inputs are live; the only former submit-only one is now debounced.
Path("src/lib/live-search.test.ts").write_text(
    '''import { describe, expect, test } from "bun:test";\n\nasync function source(path: string) {\n  return Bun.file(path).text();\n}\n\ndescribe("Live search", () => {\n  test("global search updates Discover while typing and Enter remains optional", async () => {\n    const shell = await source("src/components/promptbeats/AppShell.tsx");\n    expect(shell).toContain("const LIVE_SEARCH_DEBOUNCE_MS = 250");\n    expect(shell).toContain("onChange={(event) => handleGlobalSearchChange(event.target.value)}");\n    expect(shell).toContain("setTimeout(() => {");\n    expect(shell).toContain("runGlobalSearch(globalSearch)");\n    expect(shell).toContain("onSubmit={submitGlobalSearch}");\n    expect(shell).not.toContain('<form action="/" method="get"');\n\n    const discover = await source("src/routes/index.tsx");\n    expect(discover).toContain("validateSearch: (search: Record<string, unknown>): { q?: string }");\n    expect(discover).toContain("const { q } = Route.useSearch()");\n    expect(discover).toContain('const query = q ?? ""');\n    expect(discover).not.toContain("new URLSearchParams(window.location.search).get(\\"q\\")");\n  });\n\n  test("existing search surfaces filter or request on change without Enter", async () => {\n    const checks: Array<[string, string]> = [\n      ["src/components/promptbeats/LanguagePicker.tsx", "setQuery(event.target.value)"],\n      ["src/components/promptbeats/SmartPresetsPanel.tsx", "setQuery(event.target.value)"],\n      ["src/components/promptbeats/LibraryFolderPicker.tsx", "setQuery(event.target.value)"],\n      ["src/components/promptbeats/ProjectVersionLinkedTracks.tsx", "setQuery(event.target.value)"],\n      [\n        "src/components/promptbeats/InspirationWallDirectionPanel.tsx",\n        "setTrackSearch(event.target.value)",\n      ],\n      ["src/routes/library.tsx", "onSearchChange={setPromptSearch}"],\n      ["src/routes/management.tsx", "setSearch(draft)"],\n    ];\n\n    for (const [path, liveChange] of checks) {\n      expect(await source(path)).toContain(liveChange);\n    }\n  });\n});\n'''
)
