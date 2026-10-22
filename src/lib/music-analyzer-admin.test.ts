import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

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
