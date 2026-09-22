import { describe, expect, test } from "bun:test";

import {
  buildGeneratorVersionMetadata,
  buildInitialVersionMetadata,
  buildLyricsWorkspaceVersionMetadata,
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
    expect(diffLyricsSections(
      "[Verse]\nA\n\n[Chorus]\nB",
      "[Verse]\nA\n\n[Bridge]\nC",
    )).toEqual([
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
    expect(metadata.changedFields).toEqual(expect.arrayContaining([
      "customMusicStyle",
      "customBpm",
      "songStructure",
      "lyrics",
    ]));
    expect(metadata.changedSections).toEqual(expect.arrayContaining([
      { sectionKey: "chorus:1", sectionLabel: "Chorus", changeType: "changed" },
      { sectionKey: "bridge:1", sectionLabel: "Bridge", changeType: "added" },
    ]));
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
    expect(versionChangeMetadataSchema.safeParse({
      schemaVersion: 1,
      source: "project_revision",
      title: "x".repeat(161),
      summary: "Summary",
      changedFields: [],
      changedSections: [],
      userRequest: null,
    }).success).toBe(false);
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
  });
});
