describe("Music Analyzer V1 automatic Stage B provider", () => {
  test("uses OpenRouter Argon instead of hidden direct Gemini Flash when listening provider is not Gemini", async () => {
    const analyzer = await source("./song-analyzer.functions.ts");
    expect(analyzer).toContain('const V1_OPENROUTER_SYNTHESIS_MODEL = "google/gemini-4-argon"');
    expect(analyzer).toContain('provider === "gemini" ? data.model : V1_OPENROUTER_SYNTHESIS_MODEL');
    expect(analyzer).toContain('synthesisModel === data.model ? apiKey : process.env["OPENROUTER_API_KEY"]');
    expect(analyzer).toContain('https://openrouter.ai/api/v1/chat/completions');
    expect(analyzer).toContain('provider: provider === "gemini" ? "gemini" : "openrouter"');
    expect(analyzer).toContain('response_format: { type: "json_object" }');
    expect(analyzer).toContain('parseStructured(text, songAnalysisResultSchema, args.model, stage)');
  });
});

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("Installed AI model compatibility verification", () => {
  test("offers a model-specific verification action without automatic enabling", async () => {
    const admin = await source("./ai-model-admin.functions.ts");
    const panel = await source("../components/promptbeats/AiModelsPanel.tsx");
    expect(admin).toContain("verifyInstalledAiModelCompatibility");
    expect(admin).toContain("testSingleProviderModelCompatibility");
    expect(admin).toContain("generator_compatible: generatorCompatible");
    expect(admin).toContain("quality_check_compatible: qualityCheckCompatible");
    expect(panel).toContain("verifyInstalledAiModelCompatibility");
    expect(panel).toContain("disabled={!generatorCompatible}");
    expect(panel).toContain("disabled={!qualityCompatible}");
    expect(panel).toContain('"Επαλήθευση"');
    expect(panel).toContain("Small charges may apply");
  });
});

describe("Admin Music Analyzer model discovery", () => {
  test("uses catalog modalities when available and live audio probes when catalogs omit them", async () => {
    const registry = await source("./ai-provider-registry.server.ts");
    expect(registry).toContain("discoverProviderAudioTextModels");
    expect(registry).toContain('inputModalities.includes("audio")');
    expect(registry).toContain('outputModalities.includes("text")');
    expect(registry).toContain("probeAudioTextCompatibility");
    expect(registry).toContain('provider.id === "gemini"');
    expect(registry).toContain('provider.id === "openai"');
    expect(registry).toContain("Audio compatibility was verified with a live probe.");
  });

  test("only enables direct installation for verified runtime adapters", async () => {
    const registry = await source("./ai-provider-registry.server.ts");
    const admin = await source("./music-analyzer-admin.functions.ts");
    expect(registry).toContain('provider.id === "gemini"');
    expect(registry).toContain('provider.id === "openai"');
    expect(registry).toContain('provider.id === "openrouter"');
    expect(registry).toContain("audioAnalyzerRuntimeSupport(provider, rawId)");
    expect(registry).toContain("if (!runtime.supported)");
    expect(registry).toContain('"openai/gpt-audio-1.5"');
    expect(registry).toContain('"gemini-4-argon"');
    const v2 = await source("./song-analyzer-v2.shared.ts");
    for (const id of [
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview",
      "gemini-4-argon",
      "gpt-audio-1.5",
      "openai/gpt-audio",
      "openai/gpt-audio-1.5",
    ]) {
      expect(registry).toContain(`"${id}"`);
      expect(v2).toContain(`"${id}"`);
    }
    expect(admin).toContain("if (!candidate.runtimeSupported)");
    expect(admin).toContain('"song_analyzer_extra_models"');
    expect(admin).toContain("BUILTIN_ANALYZER_MODELS");
  });

  test("routes admin-added OpenRouter audio models through input_audio chat completions", async () => {
    const analyzer = await source("./song-analyzer.functions.ts");
    expect(analyzer).toContain('"https://openrouter.ai/api/v1/chat/completions"');
    expect(analyzer).toContain('type: "input_audio"');
    expect(analyzer).toContain('process.env["OPENROUTER_API_KEY"]');
    expect(analyzer).toContain('provider === "gemini" ? data.model : "gemini-3.8-flash"');
  });

  test("renders the Music Analyzer discovery control at the bottom of AI Models admin", async () => {
    const panel = await source("../components/promptbeats/AiModelsPanel.tsx");
    expect(panel).toContain("Music Analyzer");
    expect(panel).toContain("checkMusicAnalyzerProviderModels");
    expect(panel).toContain("Προσθήκη στο Music Analyzer");
    expect(panel).toContain("reviewed Music Analyzer V2 runtime contract");
  });
});
