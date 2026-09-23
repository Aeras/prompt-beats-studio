import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  buildInspirationWallSongSetupDescription,
  inspirationWallSongSetupHandoffSchema,
} from "./inspiration-wall-song-setup.shared";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Inspiration Wall Phase 4", () => {
  test("handoff stays structured and rejects unrelated raw Wall payloads", () => {
    const valid = {
      version: 1 as const,
      wallId: "00000000-0000-4000-8000-000000000001",
      wallTitle: "Night Drive",
      connectedProjectId: null,
      direction: { coreTheme: "A late-night return home", thingsToAvoid: ["nostalgia clichés"] },
    };
    expect(inspirationWallSongSetupHandoffSchema.parse(valid)).toEqual(valid);
    expect(() =>
      inspirationWallSongSetupHandoffSchema.parse({ ...valid, cards: [{ body: "raw" }] }),
    ).toThrow();
  });

  test("Song Setup description contains only approved structured fields", () => {
    const description = buildInspirationWallSongSetupDescription(
      { coreTheme: "Night drive", moodPalette: ["tense", "hopeful"] },
      "en",
    );
    expect(description).toContain("Core Theme: Night drive");
    expect(description).toContain("Emotional / Mood Palette: tense, hopeful");
    expect(description).not.toContain("Visual Language:");
    expect(description).not.toContain("Things to Avoid:");
  });

  test("handoff field labels support English and Greek", () => {
    const direction = { vocalPersonality: "restrained" };
    expect(buildInspirationWallSongSetupDescription(direction, "en")).toContain(
      "Vocal Personality",
    );
    expect(buildInspirationWallSongSetupDescription(direction, "el")).toContain(
      "Φωνητική Προσωπικότητα",
    );
  });

  test("Wall primary action persists current approvals and never generates directly", async () => {
    const panel = await source("src/components/promptbeats/InspirationWallDirectionPanel.tsx");
    expect(panel).toContain("Use in Song Setup");
    expect(panel).toContain("Χρήση στο Song Setup");
    expect(panel).toContain("collectApprovedDirection(direction, kept)");
    expect(panel).toContain("INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY");
    expect(panel).toContain('navigate({ to: "/generate" })');
    expect(panel).not.toContain("startGenerationJob");
  });

  test("Generator consumes one-time handoff and opens Song Setup for review", async () => {
    const generator = await source("src/routes/generate.tsx");
    const modal = await source("src/components/promptbeats/SongSetupAssistantModal.tsx");
    expect(generator).toContain("inspirationWallSongSetupHandoffSchema.parse");
    expect(generator).toContain("buildInspirationWallSongSetupDescription");
    expect(generator).toContain("setSongSetupAssistantOpen(true)");
    expect(generator).toContain("prefillDescription={songSetupPrefill?.description ?? null}");
    expect(modal).toContain(
      "only the Creative Direction fields you chose to keep were transferred",
    );
    expect(modal).toContain("if (!open || !prefillKey || !prefillDescription) return;");
  });

  test("private Wall images are cleaned up on replacement, card deletion and Wall deletion", async () => {
    const server = await source("src/lib/inspiration-wall.functions.ts");
    expect(server).toContain("cleanupInspirationWallImages");
    expect(server).toContain('.from("inspiration-wall-images").remove(uniqueKeys)');
    expect(server).toContain("existing.image_object_key !== data.imageObjectKey");
    expect(server).toContain("imageCards");
    expect(server).toContain(
      "await cleanupInspirationWallImages(supabase, [existing.image_object_key])",
    );
  });
});
