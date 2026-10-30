import { describe, expect, test } from "bun:test";

import { featureKeysForAiOperation } from "@/lib/ai-feature-access.server";
import type { AiOperation } from "@/lib/ai-usage.server";

describe("PB-015 independence boundaries", () => {
  test("normal Generator operations use only existing Feature Access identity", () => {
    for (const operation of ["generate", "repair", "audio_revision_intent"] as AiOperation[]) {
      expect(featureKeysForAiOperation(operation)).toEqual(["ai_generator"]);
    }
    expect(featureKeysForAiOperation("quality_check")).toEqual([
      "ai_generator",
      "quality_check",
    ]);
  });

  test("plan entitlement does not enter prompt-version selection or model access", async () => {
    const promptFiles = [
      "src/lib/ai.functions.ts",
      "src/lib/prompt-version-policy.ts",
      "src/lib/project-revision-prompt.ts",
    ];
    for (const path of promptFiles) {
      const file = Bun.file(path);
      if (!(await file.exists())) continue;
      const code = await file.text();
      expect(code).not.toContain("effective_subscription_plan");
      expect(code).not.toContain("subscription_manual_grants");
      expect(code).not.toContain("subscription-entitlements");
    }
    const model = await Bun.file("src/lib/ai-provider.server.ts").text();
    expect(model).not.toContain("effective_subscription_plan");
    expect(model).not.toContain("subscription_manual_grants");
    expect(model).not.toContain("subscription-entitlements");
  });

  test("feature map covers every current paid AI operation without a generic plan matrix", async () => {
    const usage = await Bun.file("src/lib/ai-usage.server.ts").text();
    for (const operation of [
      "music_inspiration",
      "generate",
      "quality_check",
      "repair",
      "post_repair_quality_check",
      "song_setup_assistant",
      "song_analysis",
      "inspiration_wall_extraction",
      "story_map_generate",
      "story_map_from_lyrics",
      "story_map_analyze_lyrics",
      "story_driven_plan",
      "universe_creative_bible_generate",
      "universe_creative_bible_refine",
      "universe_continuity_analysis",
      "universe_project_fit",
      "universe_next_song_plan",
      "audio_revision_intent",
    ]) {
      expect(usage).toContain(`"${operation}"`);
      expect(featureKeysForAiOperation(operation as AiOperation).length).toBeGreaterThan(0);
    }
  });
});
