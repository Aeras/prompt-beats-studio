import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("PB-002 unified creator journey", () => {
  test("Create is an intent-oriented entry without replacing canonical Generator or Project state", async () => {
    const create = await source("src/routes/create.tsx");
    expect(create).toContain('createFileRoute("/create")');
    expect(create).toContain('to: "/generate" as const');
    expect(create).toContain('to: "/library" as const');
    expect(create).toContain('search: { tab: "prompts" as const }');
    expect(create).toContain('useFeatureAccess("ai_generator")');
    expect(create).toContain('useFeatureAccess("lyrics_review")');
    expect(create).toContain('useFeatureAccess("song_analyzer")');
    expect(create).toContain("Project is the strongest context");
    expect(create).toContain("not mandatory");
  });

  test("navigation presents Create while legacy Generator deep links remain active", async () => {
    const sidebar = await source("src/components/promptbeats/Sidebar.tsx");
    const shell = await source("src/components/promptbeats/AppShell.tsx");

    expect(sidebar).toContain('{ id: "studio", labelKey: "nav.create", icon: Sparkles }');
    expect(sidebar).toContain(
      'const PRIMARY_NAV_IDS: NavId[] = ["home", "studio", "discover", "library"]',
    );
    expect(sidebar).toContain('studio: "create"');
    expect(sidebar).toContain('studio: "/create"');

    expect(shell).toContain('studio: "/create"');
    expect(shell).toContain('pathname.startsWith("/create")');
    expect(shell).toContain('pathname.startsWith("/generate")');
    expect(shell).toContain('pathname.startsWith("/audio-revision")');
    expect(shell).toContain('{ id: "studio", domain: "create", labelKey: "nav.createShort" }');
    expect(shell).toContain("const label = t(tab.labelKey)");
  });
});
