import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("AI model selector policy", () => {
  test("shared selection hook hides the selector unless multiple effective models exist", async () => {
    const hook = await source("src/hooks/useAiModelSelection.ts");
    expect(hook).toContain('type ModelBucket = "generator" | "qualityCheck" | "aiTools"');
    expect(hook).toContain("showSelector: options.length > 1");
    expect(hook).toContain("!options.some((option) => option.id === selectedModel)");
    expect(hook).toContain("setSelectedModel(eligibleDefault)");
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

  test("Song Universe routes every AI action through the selected model", async () => {
    const route = await source("src/routes/song-universe.tsx");
    const server = await source("src/lib/song-universe-ai.functions.ts");
    expect(route.match(/model: aiModel\.selectedModel/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(server.match(/requestedModel: data\.model \?\? null/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(server).toContain('resolveAiModelForUser(userId, "ai_tools", requestedModel ?? undefined)');
  });

  test("Admin protects all three defaults and exposes AI Tools default", async () => {
    const panel = await source("src/components/promptbeats/AiModelsPanel.tsx");
    const admin = await source("src/lib/ai-model-admin.functions.ts");
    expect(panel).toContain("aiToolsDefault");
    expect(panel).toContain('operation: "ai_tools"');
    expect(panel).toContain("isAiToolsDefault");
    expect(admin).toContain('z.enum(["generator", "quality_check", "ai_tools"])');
    expect(admin).toContain("isAiToolsDefault");
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
