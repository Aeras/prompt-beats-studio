from pathlib import Path

p = Path("src/routes/library.tsx")
s = p.read_text()

old = '''type LibraryTab = (typeof TABS)[number];

function parseLibraryTab(value: unknown): LibraryTab {
  return typeof value === "string" && TABS.includes(value as LibraryTab)
    ? (value as LibraryTab)
    : "tracks";
}

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: parseLibraryTab(search.tab),
  }),'''
new = '''type LibraryTab = (typeof TABS)[number];
type LibrarySearch = { tab?: LibraryTab };

function parseLibraryTab(value: unknown): LibraryTab | undefined {
  return typeof value === "string" && TABS.includes(value as LibraryTab)
    ? (value as LibraryTab)
    : undefined;
}

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    tab: parseLibraryTab(search["tab"]),
  }),'''
assert old in s
s = s.replace(old, new, 1)

old = '''  const [promptView, setPromptView] = useState<"all" | "projects" | "analyses">("all");
  const [promptSearch, setPromptSearch] = useState("");
  useEffect(() => setTrackSource(defaultTrackSource), [defaultTrackSource, tab]);

  const availableTabs = TABS.filter((item) => {'''
new = '''  const [promptView, setPromptView] = useState<"all" | "projects" | "analyses">("all");
  const [promptSearch, setPromptSearch] = useState("");

  const availableTabs = TABS.filter((item) => {'''
assert old in s
s = s.replace(old, new, 1)

old = '''  const tab = availableTabs.includes(requestedTab) ? requestedTab : "tracks";

  useEffect(() => {
    if (requestedTab !== tab) {
      void navigate({ to: "/library", search: { tab }, replace: true });
    }
  }, [navigate, requestedTab, tab]);'''
new = '''  const tab = requestedTab && availableTabs.includes(requestedTab) ? requestedTab : "tracks";

  useEffect(() => setTrackSource(defaultTrackSource), [defaultTrackSource, tab]);

  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      void navigate({ to: "/library", search: {}, replace: true });
    }
  }, [navigate, requestedTab, tab]);'''
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

p = Path("src/lib/library-folders.test.ts")
s = p.read_text()
s = s.replace(
    'expect(library).toContain("parseLibraryTab(search.tab)");',
    'expect(library).toContain(\'parseLibraryTab(search["tab"])\');',
)
p.write_text(s)
