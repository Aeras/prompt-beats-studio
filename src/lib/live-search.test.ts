import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Live search", () => {
  test("global search updates Discover while typing and Enter remains optional", async () => {
    const shell = await source("src/components/promptbeats/AppShell.tsx");
    expect(shell).toContain("const LIVE_SEARCH_DEBOUNCE_MS = 250");
    expect(shell).toContain("onChange={(event) => handleGlobalSearchChange(event.target.value)}");
    expect(shell).toContain("setTimeout(() => {");
    expect(shell).toContain("runGlobalSearch(globalSearch)");
    expect(shell).toContain("onSubmit={submitGlobalSearch}");
    expect(shell).not.toContain('<form action="/" method="get"');

    const discover = await source("src/routes/index.tsx");
    expect(discover).toContain("validateSearch: (search: Record<string, unknown>): { q?: string }");
    expect(discover).toContain("const { q } = Route.useSearch()");
    expect(discover).toContain('const query = q ?? ""');
    expect(discover).not.toContain('new URLSearchParams(window.location.search).get("q")');
  });

  test("existing search surfaces filter or request on change without Enter", async () => {
    const checks: Array<[string, string]> = [
      ["src/components/promptbeats/LanguagePicker.tsx", "setQuery(event.target.value)"],
      ["src/components/promptbeats/SmartPresetsPanel.tsx", "setQuery(event.target.value)"],
      ["src/components/promptbeats/LibraryFolderPicker.tsx", "setQuery(event.target.value)"],
      ["src/components/promptbeats/ProjectVersionLinkedTracks.tsx", "setQuery(event.target.value)"],
      [
        "src/components/promptbeats/InspirationWallDirectionPanel.tsx",
        "setTrackSearch(event.target.value)",
      ],
      ["src/routes/library.tsx", "onSearchChange={setPromptSearch}"],
      ["src/routes/management.tsx", "setSearch(draft)"],
    ];

    for (const [path, liveChange] of checks) {
      expect(await source(path)).toContain(liveChange);
    }
  });
});
