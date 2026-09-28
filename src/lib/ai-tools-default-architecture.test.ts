import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("AI Tools default architecture", () => {
  test("registry has three canonical operation buckets", async () => {
    const registry = await source("src/lib/ai-model-registry.server.ts");
    expect(registry).toContain('"generator" | "quality_check" | "ai_tools"');
    expect(registry).toContain('return "ai_tools_default_model"');
  });
  test("Admin reads and writes AI Tools default", async () => {
    const admin = await source("src/lib/ai-model-admin.functions.ts");
    const panel = await source("src/components/promptbeats/AiModelsPanel.tsx");
    expect(admin).toContain('readDefaultModel(supabaseAdmin, "ai_tools_default_model")');
    expect(admin).toContain('z.enum(["generator", "quality_check", "ai_tools"])');
    expect(panel).toContain('t("aiModels.aiToolsDefault")');
    expect(panel).toContain('["ai_tools", t("aiModels.aiToolsDefault")');
    expect(panel).toContain("setDefault.mutate({ operation, model: value })");
  });
  test("standalone AI tools use AI Tools default while Generator remains Generator-owned", async () => {
    const story = await source("src/lib/story-map-ai.functions.ts");
    const wall = await source("src/lib/inspiration-wall-ai.functions.ts");
    const setup = await source("src/lib/song-setup-assistant.functions.ts");
    const generator = await source("src/lib/generation-jobs.functions.ts");
    expect(story).toContain('getEffectiveModelAccess(userId, "ai_tools")');
    expect(wall).toContain('getEffectiveModelAccess(userId, "ai_tools")');
    expect(setup).toContain('resolveAiModelForUser(context.userId, "ai_tools", data.model)');
    expect(setup).not.toContain("SONG_SETUP_ASSISTANT_MODEL");
    expect(generator).toContain(
      'getModelForUser(context.userId, data.generationModel ?? undefined, "generator")',
    );
  });
  test("model access payload exposes AI Tools options", async () => {
    const ai = await source("src/lib/ai.functions.ts");
    expect(ai).toContain('getEffectiveModelAccess(context.userId, "ai_tools")');
    expect(ai).toContain('aiTools: aiToolsResult.status === "fulfilled"');
  });
});