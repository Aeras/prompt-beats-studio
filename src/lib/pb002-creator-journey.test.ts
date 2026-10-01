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
    expect(sidebar).toContain('studio: "/create"');
    expect(sidebar).toContain('item.id === "studio"');
    expect(sidebar).toContain('"Δημιουργία"');
    expect(sidebar).toContain('"Create"');
    expect(shell).toContain('studio: "/create"');
    expect(shell).toContain('pathname.startsWith("/create") || pathname.startsWith("/generate")');
    expect(shell).toContain('tab.id === "studio"');
    expect(shell).toContain('language === "el" ? "Δημιουργία" : "Create"');
  });
});
