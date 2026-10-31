import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import {
  V4_BETA_PLACEHOLDERS,
  buildAdvancedGeneratorPromptV4Beta,
  normalizeV4Platform,
} from "./advanced-generator-prompt-v4-beta";
import {
  V4_BETA_MASTER_PROMPT_SHA256,
  V4_BETA_MASTER_PROMPT_TEMPLATE,
} from "./advanced-generator-prompt-v4-beta.template";

const base = {
  theme: "A night train leaving Thessaloniki",
  genre: "Indie folk",
  mood: "Bittersweet",
  language: "Greek",
  targetPlatform: "udio",
};

describe("V4 BETA prompt", () => {
  it("template is the frozen verbatim master prompt", () => {
    const sha = createHash("sha256").update(V4_BETA_MASTER_PROMPT_TEMPLATE, "utf8").digest("hex");
    expect(sha).toBe(V4_BETA_MASTER_PROMPT_SHA256);
    expect(sha).toBe("d9aa44af8d554b7721c4644bc50751cabf799fa6b887fe9e4ed7df8fbf9fad88");
  });

  it("template contains each placeholder exactly once", () => {
    for (const key of V4_BETA_PLACEHOLDERS) {
      expect(V4_BETA_MASTER_PROMPT_TEMPLATE.split(`{{${key}}}`).length - 1).toBe(1);
    }
  });

  it("fills every placeholder and leaves none behind", () => {
    const out = buildAdvancedGeneratorPromptV4Beta(base);
    expect(out).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(out).toContain("- **Core Idea / Theme:** A night train leaving Thessaloniki");
    expect(out).toContain("- **Requested Song Structure (if provided):** (not provided)");
  });

  it("normalizes platform to suno or udio only", () => {
    expect(normalizeV4Platform("Udio")).toBe("udio");
    expect(normalizeV4Platform("suno")).toBe("suno");
    expect(normalizeV4Platform("other")).toBe("suno");
    expect(buildAdvancedGeneratorPromptV4Beta(base)).toContain("(`suno` or `udio`):** udio");
  });

  it("does not re-substitute placeholders injected by user text", () => {
    const out = buildAdvancedGeneratorPromptV4Beta({ ...base, instructions: "{{CORE_IDEA}}" });
    expect(out).toContain("- **Additional Instructions (if provided):** {{CORE_IDEA}}");
  });

  it("serializes blueprint occurrences in order", () => {
    const out = buildAdvancedGeneratorPromptV4Beta({
      ...base,
      structure: "Verse, Chorus",
      songBlueprint: [
        {
          structureIndex: 1,
          sectionType: "Chorus",
          occurrence: 1,
          energy: 5,
          instruction: "Full band",
        },
      ],
    });
    expect(out).toContain(
      "- Structure position 2: Chorus #1 — Energy target: 5/5 — Direction: Full band",
    );
  });

  it("rejects empty required fields", () => {
    expect(() => buildAdvancedGeneratorPromptV4Beta({ ...base, mood: " " })).toThrow();
  });

  it("enforces the same Super Admin runner guard for V2, V3 and V4", () => {
    const runner = readFileSync("src/lib/generation-jobs.server.ts", "utf8");
    for (const version of ["v2", "v3", "v4_beta"]) {
      expect(runner).toContain(`input.promptVersion === "${version}"`);
    }
    expect(runner).toContain('input.inputSnapshot?.generatorMode !== "advanced"');
    expect(runner).toContain('input.operation !== "generate"');
  });

  it("is Super Admin Advanced new-song only and routed separately from V3", () => {
    const jobs = readFileSync("src/lib/generation-jobs.functions.ts", "utf8");
    expect(jobs).toContain('data.promptVersion === "v3" || data.promptVersion === "v4_beta"');
    const ai = readFileSync("src/lib/ai.functions.ts", "utf8");
    expect(ai).toContain(
      'data.promptVersion === "v4_beta"\n          ? buildAdvancedGeneratorPromptV4Beta(data)',
    );
    expect(ai).toContain("? buildRevisionPrompt(data)");
  });

  it("gives only the two verified OpenRouter models additional output budget", () => {
    const ai = readFileSync("src/lib/ai.functions.ts", "utf8");
    expect(ai).toContain('provider === "openrouter"');
    expect(ai).toContain('model === "aion-labs/aion-3.0"');
    expect(ai).toContain('model === "qwen/qwen3.8-max-0902"');
    expect(ai).toContain("? 16384");
    expect(ai).toContain(": 8192");
    expect(ai).not.toContain("maxTokens: 16384");
  });

  it("OpenRouter forwards reasoning and separates upstream errors without leaking bodies", () => {
    const adapter = readFileSync("src/lib/ai-provider.server.ts", "utf8");
    const section = adapter
      .split("async function callOpenAiCompatible(")[1]
      ?.split("async function callGroq(")[0];
    expect(section).toBeDefined();
    expect(section).toContain('providerName === "openrouter" && call.reasoningEffort');
    expect(section).toContain("{ effort: call.reasoningEffort }");
    expect(section).toContain("enabled: false");
    expect(section).toContain("completion_tokens_details?.reasoning_tokens");
    expect(section).toContain("res.status === 429");
    expect(section).toContain("res.status === 400 || res.status === 422");
    expect(section).not.toContain("errorBody.slice");
    const jobs = readFileSync("src/lib/generation-jobs.server.ts", "utf8");
    expect(jobs).toContain("The AI provider rate limit was reached.");
    expect(jobs).toContain("The AI provider rejected the request parameters.");
  });

  it("GLM OpenRouter requests JSON output and invalid results log only safe metadata", () => {
    const adapter = readFileSync("src/lib/ai-provider.server.ts", "utf8");
    expect(adapter).toContain('model === "z-ai/glm-5.3-flash"');
    expect(adapter).toContain('response_format: { type: "json_object" }');
    const ai = readFileSync("src/lib/ai.functions.ts", "utf8");
    expect(ai).toContain("generation_invalid_response");
    expect(ai).toContain("result.error.issues.map");
    expect(ai).toContain("responseLength: raw.length");
  });

  it("records safe OpenRouter generation stop and missing-field diagnostics", () => {
    const ai = readFileSync("src/lib/ai.functions.ts", "utf8");
    expect(ai).toContain("[ai] generation_non_success_stop");
    expect(ai).toContain("reasoningTokens: generated.usage?.reasoningTokens ?? null");
    expect(ai).toContain("returnedKeys,");
    expect(ai).toContain("Object.prototype.hasOwnProperty.call(decoded, key)");
    expect(ai).toContain("safeIssuePath(issue.path)");
  });

  it("bounds MiMo generator reasoning without modifying other provider budgets", () => {
    const ai = readFileSync("src/lib/ai.functions.ts", "utf8");
    const generation = ai
      .split("export async function runSongGeneration(")[1]
      ?.split("export async function runLyricsSectionEdit(")[0];
    expect(generation).toContain('model.startsWith("xiaomi/mimo-v2.6-")');
    expect(generation).toContain('provider === "openrouter"');
    expect(generation).toContain('? "none"');
    const adapter = readFileSync("src/lib/ai-provider.server.ts", "utf8");
    expect(adapter).toContain('call.reasoningEffort === "none"');
    expect(adapter).toContain("enabled: false");
    expect(generation).toContain(": 8192");
  });

  it("disables Qwen3.8 Flash reasoning only for OpenRouter song generation", () => {
    const generator = readFileSync("src/lib/ai.functions.ts", "utf8");
    const song = generator
      .split("export async function runSongGeneration(")[1]
      ?.split("export async function runLyricsSectionEdit(")[0];
    expect(song).toContain('model === "qwen/qwen3.8-flash"');
    expect(song).toContain('? "none"');
    expect(song).toContain(": 8192");

    const adapter = readFileSync("src/lib/ai-provider.server.ts", "utf8");
    expect(adapter).toContain('model === "qwen/qwen3.8-flash"');
    expect(adapter).toContain("enabled: false");
  });

  it("job runner re-verifies Super Admin Advanced before running V4 BETA", () => {
    const runner = readFileSync("src/lib/generation-jobs.server.ts", "utf8");
    const guard = runner.indexOf('input.promptVersion === "v4_beta"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(runner.indexOf("runSongGeneration("));
    expect(runner).toContain('_role: "super_admin"');
    expect(runner).toContain('input.inputSnapshot?.generatorMode !== "advanced"');
  });
});
