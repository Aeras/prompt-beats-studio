import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Project Version History UI", () => {
  test("Project view places Version History before Creation Notes and collapsible prompt cards", async () => {
    const library = await source("src/routes/library.tsx");
    const history = library.indexOf("<ProjectVersionHistory");
    const notes = library.indexOf("<ProjectCreationNotes", history);
    const versions = library.indexOf("projectVersionsOpen", notes);

    expect(history).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(history);
    expect(versions).toBeGreaterThan(notes);
  });

  test("history entries expose Open Version, explicit Compare, user notes and preferred version", async () => {
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");

    expect(history).toContain("Open Version");
    expect(history).toContain("Compare");
    expect(history).toContain("updateVersionUserNote");
    expect(history).toContain("setPreferredProjectVersion");
    expect(history).toContain("Previous version");
    expect(history).toContain("versionChangeChips");
  });

  test("Open Version is a read-only saved-version view", async () => {
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");

    expect(history).toContain("getPromptRevisionBase");
    expect(history).toContain("<VersionReadOnlyContent");
    expect(history).toContain('aria-modal="true"');
  });

  test("history API remains lightweight and does not load full snapshots or lyrics", async () => {
    const ai = await source("src/lib/ai.functions.ts");
    const start = ai.indexOf("export const listProjectVersionHistory");
    const end = ai.indexOf("export const updateVersionUserNote", start);
    const block = ai.slice(start, end);

    expect(block).toContain("version_change_metadata");
    expect(block).toContain("version_user_note");
    expect(block).not.toContain("generator_input_snapshot");
    expect(block).not.toContain(", lyrics,");
  });
});

describe("Project Version Compare UI", () => {
  test("mobile defaults to Changes Only and compare cards stack until desktop", async () => {
    const compare = await source("src/components/promptbeats/ProjectVersionCompare.tsx");

    expect(compare).toContain('matchMedia("(max-width: 767px)")');
    expect(compare).toContain("setChangesOnly(true)");
    expect(compare).toContain("md:grid-cols-2");
    expect(compare).toContain("Changes Only");
    expect(compare).toContain("Show All");
  });

  test("diff meaning is textual as well as visual", async () => {
    const compare = await source("src/components/promptbeats/ProjectVersionCompare.tsx");

    expect(compare).toContain('"Added"');
    expect(compare).toContain('"Removed"');
    expect(compare).toContain('"Changed"');
    expect(compare).toContain('"No changes"');
    expect(compare).toContain('"Moved"');
  });

  test("lyrics render word-level added and removed highlights in paired cards", async () => {
    const compare = await source("src/components/promptbeats/ProjectVersionCompare.tsx");

    expect(compare).toContain('<TokenText tokens={item.tokens} side="before"');
    expect(compare).toContain('<TokenText tokens={item.tokens} side="after"');
    expect(compare).toContain("decoration-red-300");
    expect(compare).toContain("decoration-emerald-300");
  });

  test("comparison includes the creative journey between non-adjacent versions", async () => {
    const compare = await source("src/components/promptbeats/ProjectVersionCompare.tsx");

    expect(compare).toContain("Changes along the way");
    expect(compare).toContain("item.version_change_metadata?.title");
  });
});
