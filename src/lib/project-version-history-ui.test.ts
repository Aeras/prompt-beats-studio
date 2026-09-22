import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Project Version History UI", () => {
  test("project workspace order keeps History before Creation Notes and version cards", async () => {
    const library = await source("src/routes/library.tsx");
    const historyIndex = library.indexOf("<ProjectVersionHistory");
    const notesIndex = library.indexOf("<ProjectCreationNotes");
    const versionsIndex = library.indexOf("Project Versions / Prompts");

    expect(historyIndex).toBeGreaterThan(-1);
    expect(notesIndex).toBeGreaterThan(historyIndex);
    expect(versionsIndex).toBeGreaterThan(notesIndex);
  });

  test("history supports notes, preferred version, read-only open and explicit compare selection", async () => {
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");

    expect(history).toContain("updateVersionUserNote");
    expect(history).toContain("setPreferredProjectVersion");
    expect(history).toContain("getPromptRevisionBase");
    expect(history).toContain("setCompareRightId(\"\")");
    expect(history).toContain("Previous version");
    expect(history).toContain("versionChangeChips");
  });

  test("compare is lazy, responsive and has Changes Only / Show All", async () => {
    const compare = await source("src/components/promptbeats/ProjectVersionCompare.tsx");

    expect(compare).toContain("getProjectVersionsForCompare");
    expect(compare).toContain("compareProjectVersions");
    expect(compare).toContain('window.matchMedia("(max-width: 767px)")');
    expect(compare).toContain("Changes Only");
    expect(compare).toContain("Show All");
    expect(compare).toContain("Changes along the way");
    expect(compare).toContain("md:grid-cols-2");
  });

  test("migration history is checked into GitHub source of truth", async () => {
    const foundation = await source("supabase/migrations/20260922162948_project_version_history_foundation.sql");
    const writers = await source("supabase/migrations/20260922163129_project_version_history_writers.sql");

    expect(foundation).toContain("version_change_metadata");
    expect(foundation).toContain("version_user_note");
    expect(foundation).toContain("preferred_prompt_id");
    expect(writers).toContain("preserve_saved_prompt_version_change_metadata");
    expect(writers).toContain("create_prompt_revision_version");
    expect(writers).toContain("create_prompt_lyrics_workspace_version");
  });
});
