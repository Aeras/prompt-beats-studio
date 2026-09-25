import { describe, expect, test } from "bun:test";

import {
  buildGeneratorVersionMetadata,
  buildInitialVersionMetadata,
  buildLyricsWorkspaceVersionMetadata,
  buildManualVersionMetadata,
  buildProjectRevisionVersionMetadata,
  diffLyricsSections,
  versionChangeChips,
  versionChangeMetadataSchema,
} from "./project-version-history.shared";
import { generatorInputSnapshotSchema } from "./generator-revision.shared";

const baseSnapshot = generatorInputSnapshotSchema.parse({
  generatorMode: "advanced",
  customMusicStyle: "Indie Pop",
  customMood: "Melancholic",
  customBpm: "82",
  songStructure: ["Verse", "Chorus"],
});

describe("Project Version History metadata", () => {
  test("Lyrics Workspace server reads baseline lyrics from saved_prompts, not prompt_projects", async () => {
    const source = await Bun.file(
      new URL("./lyrics-workspace.functions.ts", import.meta.url),
    ).text();
    expect(source).toContain('.from("prompt_projects")\n      .select("id")');
    expect(source).toContain('.from("saved_prompts")\n      .select("id, lyrics")');
    expect(source).not.toContain('.from("prompt_projects")\n      .select("id, lyrics")');
  });

  test("V1 metadata is canonical initial version metadata", () => {
    expect(buildInitialVersionMetadata()).toEqual({
      schemaVersion: 1,
      source: "initial_generation",
      title: "Initial version",
      summary: "The initial saved version of this project.",
      changedFields: [],
      changedSections: [],
      userRequest: null,
    });
  });

  test("Lyrics Workspace metadata detects changed lyric sections deterministically", () => {
    const before = "[Verse]\nOld verse\n\n[Chorus]\nSame hook";
    const after = "[Verse]\nNew verse\n\n[Chorus]\nSame hook";
    const metadata = buildLyricsWorkspaceVersionMetadata({
      beforeLyrics: before,
      afterLyrics: after,
      versionLabel: "Verse 1 · More emotional",
    });

    expect(metadata.source).toBe("lyrics_workspace");
    expect(metadata.title).toBe("Verse 1 · More emotional");
    expect(metadata.changedFields).toEqual(["lyrics"]);
    expect(metadata.changedSections).toEqual([
      { sectionKey: "verse:1", sectionLabel: "Verse", changeType: "changed" },
    ]);
  });

  test("section diff detects added and removed sections", () => {
    expect(diffLyricsSections("[Verse]\nA\n\n[Chorus]\nB", "[Verse]\nA\n\n[Bridge]\nC")).toEqual([
      { sectionKey: "chorus:1", sectionLabel: "Chorus", changeType: "removed" },
      { sectionKey: "bridge:1", sectionLabel: "Bridge", changeType: "added" },
    ]);
  });

  test("Project Revision metadata combines snapshot and lyrics changes without AI", () => {
    const desired = generatorInputSnapshotSchema.parse({
      ...baseSnapshot,
      customMusicStyle: "Pop Rock",
      customBpm: "90",
      songStructure: ["Verse", "Chorus", "Bridge"],
    });
    const metadata = buildProjectRevisionVersionMetadata({
      revisionRequest: "Add a bridge and make the style more rock.",
      baseSnapshot,
      desiredSnapshot: desired,
      beforeLyrics: "[Verse]\nA\n\n[Chorus]\nB",
      afterLyrics: "[Verse]\nA\n\n[Chorus]\nB2\n\n[Bridge]\nC",
    });

    expect(metadata.source).toBe("project_revision");
    expect(metadata.userRequest).toBe("Add a bridge and make the style more rock.");
    expect(metadata.changedFields).toEqual(
      expect.arrayContaining(["customMusicStyle", "customBpm", "songStructure", "lyrics"]),
    );
    expect(metadata.changedSections).toEqual(
      expect.arrayContaining([
        { sectionKey: "chorus:1", sectionLabel: "Chorus", changeType: "changed" },
        { sectionKey: "bridge:1", sectionLabel: "Bridge", changeType: "added" },
      ]),
    );
  });

  test("Generator metadata uses actual snapshot differences for later direct saves", () => {
    const desired = generatorInputSnapshotSchema.parse({
      ...baseSnapshot,
      customMood: "Bittersweet",
    });
    const metadata = buildGeneratorVersionMetadata({
      title: "Mood pass",
      baseSnapshot,
      desiredSnapshot: desired,
      beforeLyrics: "[Verse]\nA",
      afterLyrics: "[Verse]\nA",
    });

    expect(metadata.title).toBe("Mood pass");
    expect(metadata.changedFields).toEqual(["customMood"]);
    expect(metadata.changedSections).toEqual([]);
  });

  test("standalone prompts added to an existing project get canonical manual lineage metadata", () => {
    const desired = generatorInputSnapshotSchema.parse({
      ...baseSnapshot,
      customMood: "Hopeful",
    });
    const metadata = buildManualVersionMetadata({
      baseSnapshot,
      desiredSnapshot: desired,
      beforeLyrics: "[Verse]\nOld",
      afterLyrics: "[Verse]\nNew",
    });

    expect(metadata.source).toBe("manual_edit");
    expect(metadata.title).toBe("Added to project");
    expect(metadata.changedFields).toEqual(expect.arrayContaining(["customMood", "lyrics"]));
    expect(metadata.changedSections).toEqual([
      { sectionKey: "verse:1", sectionLabel: "Verse", changeType: "changed" },
    ]);
  });

  test("change chips are compact and derived from canonical metadata", () => {
    const metadata = versionChangeMetadataSchema.parse({
      schemaVersion: 1,
      source: "project_revision",
      title: "Arrangement updated",
      summary: "Structure and arrangement changed.",
      changedFields: ["lyrics", "songStructure", "songBlueprint", "customBpm"],
      changedSections: [
        { sectionKey: "chorus:1", sectionLabel: "Chorus 1", changeType: "changed" },
      ],
      userRequest: "Make the ending bigger.",
    });

    expect(versionChangeChips(metadata)).toEqual([
      "Lyrics",
      "Structure",
      "Arrangement",
      "Chorus 1",
    ]);
  });

  test("metadata schema rejects unbounded provenance payloads", () => {
    expect(
      versionChangeMetadataSchema.safeParse({
        schemaVersion: 1,
        source: "project_revision",
        title: "x".repeat(161),
        summary: "Summary",
        changedFields: [],
        changedSections: [],
        userRequest: null,
      }).success,
    ).toBe(false);
  });
});

describe("Version history writer contracts", () => {
  test("all canonical version creation paths write canonical metadata", async () => {
    const ai = await Bun.file("src/lib/ai.functions.ts").text();
    const workspace = await Bun.file("src/lib/lyrics-workspace.functions.ts").text();
    const jobs = await Bun.file("src/lib/generation-jobs.server.ts").text();

    expect(ai).toContain("buildInitialVersionMetadata()");
    expect(ai).toContain("buildGeneratorVersionMetadata({");
    expect(ai).toContain("version_change_metadata: versionMetadata");
    expect(workspace).toContain("buildLyricsWorkspaceVersionMetadata({");
    expect(workspace).toContain("_version_change_metadata: versionChangeMetadata");
    expect(jobs).toContain("buildProjectRevisionVersionMetadata({");
    expect(jobs).toContain("_version_change_metadata: versionChangeMetadata");
    expect(ai).toContain("Project versions cannot be moved between projects");
    expect(ai).toContain("buildManualVersionMetadata({");
  });

  test("standalone prompt assignment is serialized and does not alter normal Project revision flow", async () => {
    const migration = await Bun.file(
      "supabase/migrations/20260925163000_atomic_standalone_prompt_project_assignment.sql",
    ).text();
    const ai = await Bun.file("src/lib/ai.functions.ts").text();
    const jobs = await Bun.file("src/lib/generation-jobs.server.ts").text();

    expect(migration).toContain("OLD.project_id IS NULL AND NEW.project_id IS NOT NULL");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(NEW.project_id::text))");
    expect(migration).toContain("COALESCE(MAX(sp.version_number), 0) + 1");
    expect(migration).toContain("NEW.parent_prompt_id := v_parent_id");
    expect(migration).toContain("NEW.version_number := v_next_version");
    expect(migration).toContain("BEFORE UPDATE OF project_id ON public.saved_prompts");
    expect(ai).toContain("Project versions cannot be moved between projects");
    expect(jobs).toContain("buildProjectRevisionVersionMetadata({");
  });

  test("detaching a Project version resets Project-only lineage before it can be reused", async () => {
    const migration = await Bun.file(
      "supabase/migrations/20260925173000_reset_detached_prompt_version_state.sql",
    ).text();

    expect(migration).toContain("OLD.project_id IS NOT NULL AND NEW.project_id IS NULL");
    expect(migration).toContain("NEW.version_number := NULL");
    expect(migration).toContain("NEW.version_label := NULL");
    expect(migration).toContain("NEW.parent_prompt_id := NULL");
    expect(migration).toContain("NEW.version_change_metadata := NULL");
    expect(migration).toContain("NEW.version_user_note := NULL");
    expect(migration).toContain("NEW.branch_label := NULL");
    expect(migration).toContain("NEW.revision_request := NULL");
    expect(migration).toContain("NEW.project_id IS NULL AND NEW.version_change_metadata IS NULL");
    expect(migration).toContain("WHERE project_id IS NULL");
    expect(migration).toContain("OLD.project_id IS NULL AND NEW.project_id IS NOT NULL");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(NEW.project_id::text))");
  });
});
