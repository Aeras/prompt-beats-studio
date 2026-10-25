import { describe, expect, test } from "bun:test";

import { shouldShowAiModelSelector } from "./ai-model-selector-policy.shared";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("AI model selector policy", () => {
  test("selector is hidden with one effective model and visible with two or more", () => {
    expect(shouldShowAiModelSelector(0)).toBe(false);
    expect(shouldShowAiModelSelector(1)).toBe(false);
    expect(shouldShowAiModelSelector(2)).toBe(true);
    expect(shouldShowAiModelSelector(4)).toBe(true);
  });

  test("shared selection hook hides the selector unless multiple effective models exist", async () => {
    const hook = await source("src/hooks/useAiModelSelection.ts");
    expect(hook).toContain('type ModelBucket = "generator" | "qualityCheck" | "aiTools"');
    expect(hook).toContain("shouldShowAiModelSelector(options.length)");
    expect(hook).toContain("!options.some((option) => option.id === selectedModel)");
    expect(hook).toContain("setSelectedModel(eligibleDefault)");
  });

  test("Next Song Planner renders the shared selector only when showSelector is true", async () => {
    const planner = await source("src/components/promptbeats/SongUniverseNextSongPlanner.tsx");
    expect(planner).toContain('useAiModelSelection("aiTools")');
    expect(planner).toContain("aiModel.showSelector &&");
    expect(planner).toContain("value={aiModel.selectedModel}");
    expect(planner).toContain("aiModel.setSelectedModel(event.target.value)");
    expect(planner).toContain("aiModel.options.map((option)");
    expect(planner).toContain("model: aiModel.selectedModel || null");
  });

  test("standalone AI tools pass the selected AI Tools model to server functions", async () => {
    const setup = await source("src/components/promptbeats/SongSetupAssistantModal.tsx");
    const story = await source("src/routes/story-map.tsx");
    const universe = await source("src/routes/song-universe.tsx");
    const wall = await source("src/components/promptbeats/InspirationWallDirectionPanel.tsx");

    expect(setup).toContain('useAiModelSelection("aiTools")');
    expect(setup).toContain("model: aiModel.selectedModel");
    expect(story).toContain('useAiModelSelection("aiTools")');
    expect(story).toContain("model: aiModel.selectedModel");
    expect(universe).toContain('useAiModelSelection("aiTools")');
    expect(universe).toContain("model: aiModel.selectedModel");
    expect(wall).toContain('useAiModelSelection("aiTools", supportsPromptBeatsVisionInput)');
    expect(wall).toContain("model: aiModel.selectedModel");
  });

  test("multimodal Inspiration Wall uses one centralized capability filter and safe fallback", async () => {
    const capability = await source("src/lib/ai-model-capabilities.shared.ts");
    const wallServer = await source("src/lib/inspiration-wall-ai.functions.ts");
    expect(capability).toContain('return model.provider === "gemini"');
    expect(wallServer).toContain("supportsPromptBeatsVisionInput");
    expect(wallServer).toContain("requestedModel");
    expect(wallServer).toContain("access.defaultModel");
    expect(wallServer).toContain("compatibleOptions[0]");
  });

  test("Song Universe routes every AI action through the selected model with safe stale-selection fallback", async () => {
    const route = await source("src/routes/song-universe.tsx");
    const server = await source("src/lib/song-universe-ai.functions.ts");
    expect(route.match(/model: aiModel\.selectedModel/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(
      server.match(/requestedModel: data\.model \?\? null/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(server).toContain('getEffectiveModelAccess(userId, "ai_tools")');
    expect(server).toContain("access.modelOptions.find((option) => option.id === requestedModel)");
    expect(server).toContain(
      "access.modelOptions.find((option) => option.id === access.defaultModel)",
    );
  });

  test("Admin protects all three defaults and exposes AI Tools default", async () => {
    const panel = await source("src/components/promptbeats/AiModelsPanel.tsx");
    const admin = await source("src/lib/ai-model-admin.functions.ts");
    expect(panel).toContain("aiToolsDefault");
    expect(panel).toMatch(/\[\s*"ai_tools",\s*t\("aiModels\.aiToolsDefault"\)/);
    expect(panel).toContain("setDefault.mutate({ operation, model: value })");
    expect(panel).toContain("isAiToolsDefault");
    expect(admin).toContain('z.enum(["generator", "quality_check", "ai_tools", "legacy"])');
    expect(admin).toContain('"admin_set_ai_model_default"');
    const sql = await source(
      "supabase/migrations/20261025173752_ai_models_inline_admin_uninstall.sql",
    );
    expect(sql).toContain("ai_tools_default_model");
    expect(sql).toContain("Select another default before disabling this model");
  });

  test("Generator and Quality Check continue resolving through their own operation buckets", async () => {
    const ai = await source("src/lib/ai.functions.ts");
    const qc = await source("src/lib/quality-check-core.server.ts");
    expect(ai).toContain('operation: "generator" | "quality_check"');
    expect(ai).toContain("resolveAiModelForUser(userId, operation, modelOverride)");
    expect(qc).toContain('"quality_check"');
    expect(qc).toContain("data.qualityCheckModel ?? undefined");
  });
});
