import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("Song Analyzer GPT Audio 1.5 provider integration", () => {
  test("exposes GPT Audio 1.5 as an Analyzer model and routes audio through OpenAI", async () => {
    const code = await source("./song-analyzer.functions.ts");
    expect(code).toContain('{ id: "gpt-audio-1.5", label: "GPT Audio 1.5" }');
    expect(code).toContain('process.env["OPENAI_API_KEY"]');
    expect(code).toContain('https://api.openai.com/v1/chat/completions');
    expect(code).toContain('type: "input_audio"');
    expect(code).toContain('modalities: ["text"]');
    expect(code).toContain('provider: analyzerProvider(args.model)');
  });

  test("keeps OpenAI audio input constrained to the documented MP3/WAV formats", async () => {
    const code = await source("./song-analyzer.functions.ts");
    const route = await source("../routes/song-analyzer.tsx");
    expect(code).toContain('mimeType === "audio/mpeg" || mimeType === "audio/mp3"');
    expect(code).toContain('mimeType === "audio/wav" || mimeType === "audio/x-wav"');
    expect(route).toContain("songAnalyzerModelAcceptsMimeType(model, file.type)");
    expect(route).toContain('t("songAnalyzer.gptAudioFormat")');
  });

  test("accepts GPT Audio runs through the Stage A guard while retaining the independent Gemini verifier", async () => {
    const guard = await source("./song-analyzer-stage-a-guard.functions.ts");
    expect(guard).toContain('"gpt-audio-1.5"');
    expect(guard).toContain(
      'data.model === "gpt-audio-1.5" ? "gemini-3.8-flash" : data.model',
    );
    expect(guard).toContain("model: verifierModel");
  });

  test("saved analyses accept GPT Audio as their recorded source model", async () => {
    const code = await source("./song-analyzer.functions.ts");
    expect(code).toContain(
      'model: z.enum(["gemini-3.8-flash", "gemini-3.1-pro-preview", "gpt-audio-1.5"])',
    );
  });
});
