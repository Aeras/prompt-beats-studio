import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Inspiration Wall Phase 3", () => {
  test("AI extraction is deliberate, admission-controlled, registry-backed and usage-logged", async () => {
    const code = await source("src/lib/inspiration-wall-ai.functions.ts");
    expect(code).toContain('requireFeatureAccess(context.supabase, "inspiration_wall")');
    expect(code).toContain('requireAuxiliaryAiAdmission(context.supabase, "inspiration_wall")');
    expect(code).toContain('getEffectiveModelAccess(userId, "ai_tools")');
    expect(code).toContain('option.provider === "gemini"');
    expect(code).toContain('operation: "inspiration_wall_extraction"');
    expect(code).not.toContain('const MODEL = "gemini-');
  });

  test("AI follows the approved semantic priority and safe image interpretation rules", async () => {
    const code = await source("src/lib/inspiration-wall-ai.functions.ts");
    expect(code).toContain("Explicit written constraints and instructions");
    expect(code).toContain("Pinned cards");
    expect(code).toContain("TEXT OVERRIDES IMAGE INTERPRETATION");
    expect(code).toContain("Do not identify people");
    expect(code).toContain('if (card.type === "constraint") return 0');
    expect(code).toContain("image_object_key");
    expect(code).toContain('from("inspiration-wall-images")');
  });

  test("Creative Direction uses the canonical structured fields and is persisted", async () => {
    const code = await source("src/lib/inspiration-wall-ai.functions.ts");
    for (const field of [
      "coreTheme",
      "moodPalette",
      "visualLanguage",
      "narrativeAngle",
      "musicalCharacter",
      "productionTexture",
      "vocalPersonality",
      "lyricalKeywords",
      "thingsToAvoid",
      "contradictions",
      "openQuestions",
    ]) {
      expect(code).toContain(field);
    }
    expect(code).toContain("inspirationWallCreativeDirectionSchema.parse");
    expect(code).toContain("creative_direction: parsed");
  });

  test("Project and Result Track connections stay separate and owner scoped", async () => {
    const server = await source("src/lib/inspiration-wall-ai.functions.ts");
    const panel = await source("src/components/promptbeats/InspirationWallDirectionPanel.tsx");
    expect(server).toContain('.from("prompt_projects")');
    expect(server).toContain('.eq("user_id", context.userId)');
    expect(server).toContain('.eq("source_type", "upload")');
    expect(server).toContain('.eq("moderation_status", "active")');
    expect(panel).toContain("connectedProjectId");
    expect(panel).toContain("linkInspirationWallTrack");
    expect(panel).toContain("unlinkInspirationWallTrack");
    expect(panel).toContain("Project connection is optional and separate from Result Tracks.");
  });

  test("Creative Direction is user-reviewable with keep/remove controls", async () => {
    const panel = await source("src/components/promptbeats/InspirationWallDirectionPanel.tsx");
    expect(panel).toContain("FIELD_META");
    expect(panel).toContain('type="checkbox"');
    expect(panel).toContain("Save Creative Direction");
    expect(panel).toContain("Extract Creative Direction");
  });

  test("the Wall route mounts Phase 3 without adding direct Generate behavior", async () => {
    const route = await source("src/routes/inspiration-wall.tsx");
    expect(route).toContain("InspirationWallDirectionPanel");
    expect(route).toContain("trackLinks={wall.data.trackLinks}");
    expect(route).not.toContain("Generate Song");
  });
});
