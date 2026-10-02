import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("library tab refresh persistence", () => {
  test("gated library tabs survive auth and feature-access hydration", async () => {
    const hook = await readFile("src/hooks/useFeatureAccess.ts", "utf8");
    const library = await readFile("src/routes/library.tsx", "utf8");

    expect(hook).toContain('playlists: "playlists"');
    expect(hook).toContain('favorites: "favorites"');
    expect(hook).toContain('likes: "likes"');
    expect(hook).toContain('window.location.pathname === "/library"');
    expect(hook).toContain('new URLSearchParams(window.location.search).get("tab")');
    expect(hook).toContain("const { user, loading: authLoading } = useAuth();");
    expect(hook).toContain("authLoading || query.isLoading");
    expect(hook).toContain("query.data?.allowed === true || preserveRequestedLibraryTab");

    expect(library).toContain(
      "const { tab: requestedTab, project: projectSearch } = Route.useSearch();",
    );
    expect(library).toContain(
      'onClick={() => void navigate({ to: "/library", search: { tab: item } })}',
    );
  });
});
