import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("Gemini 4 Argon direct integration", () => {
  test("registers Argon in the core AI catalog as direct Gemini", async () => {
    const models = await source("./ai-models.ts");
    expect(models).toContain(
      '{ id: "gemini-4-argon", label: "Gemini 4 Argon", provider: "gemini" }',
    );
  });

  test("uses the direct Google REST endpoint with Argon thinking levels", async () => {
    const provider = await source("./ai-provider.server.ts");
    expect(provider).toContain(
      '"https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent"',
    );
    expect(provider).toContain('thinkingConfig: { thinkingLevel: argonThinkingLevel }');
    expect(provider).toContain("Math.max(requestedOutput, 32_768)");
    expect(provider).toContain("15 * 60 * 1000");
  });

  test("exposes Argon as a direct Music Analyzer model", async () => {
    const analyzer = await source("./song-analyzer.functions.ts");
    const finalizer = await source("./song-analyzer-final.functions.ts");
    expect(analyzer).toContain('{ id: "gemini-4-argon", label: "Gemini 4 Argon" }');
    expect(analyzer).toContain('id: "gemini-4-argon"');
    expect(analyzer).toContain('provider: "gemini"');
    expect(finalizer).toContain('"gemini-4-argon"');
  });

  test("keeps web research on Gemini 3.8 Flash for Argon", async () => {
    const finalizer = await source("./song-analyzer-final.functions.ts");
    expect(finalizer).toContain('data.audioAnalysisModel !== "gemini-4-argon"');
    expect(finalizer).toContain(': "gemini-3.8-flash"');
  });
});
