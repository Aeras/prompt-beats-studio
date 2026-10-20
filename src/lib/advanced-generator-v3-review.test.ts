import { describe, expect, test } from "bun:test";
import {
  buildV3ReviewPrompt,
  isSafeV3Review,
  parseV3Review,
  v3ReviewOutput,
  withV3MusicalPlanning,
} from "./advanced-generator-v3-review";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as reviewHelpers from "./advanced-generator-v3-review";

const lyrics = [
  "[Verse]",
  "[Warm vocal]",
  "I used to hide the words from you",
  "Now I can speak the simple truth",
  "[Chorus]",
  "[Full band]",
  "Come back to me, come back tonight",
  "We found a way to make it right",
].join("\n");

describe("Independent V3 lyric review", () => {
  test("supplies authoritative brief and actual musical context with a lyrics-only contract", () => {
    const prompt = buildV3ReviewPrompt({
      title: "Song",
      tags: "Pop",
      lyrics,
      note: "Producer note",
      language: "English",
      genre: "Pop",
      mood: "Hopeful",
      production: "100 BPM, sung",
      structure: "Verse -> Chorus",
      theme: "Accept separation without reunion",
      instructions: "Keep the final hook verbatim",
      songBlueprint: [
        { structureIndex: 0, sectionType: "Verse", occurrence: 1, instruction: "He left first" },
      ],
      targetPlatform: "udio",
    });
    expect(prompt).toContain('single field "lyrics"');
    for (const value of [
      "Accept separation without reunion",
      "Keep the final hook verbatim",
      "He left first",
      "100 BPM",
      "Producer note",
      "udio",
    ])
      expect(prompt).toContain(value);
    expect(prompt).toContain('"musicStyle":"Pop"');
    expect(prompt).toContain("Do not use fixed syllable budgets");
    expect(prompt).toContain("Language: English");
    expect(prompt).toContain(lyrics);
  });

  test("V3-only planning couples musical style and tempo without fixed syllable formulas", () => {
    const prompt = withV3MusicalPlanning("V2 baseline");
    expect(prompt.startsWith("V2 baseline")).toBe(true);
    expect(prompt).toContain("Before drafting");
    expect(prompt).toContain("half-time/double-time");
    expect(prompt).toContain("Never impose a universal BPM-to-syllable formula");
  });

  test("review output accepts lyrics only and rejects metadata or empty lyrics", () => {
    expect(v3ReviewOutput.safeParse({ lyrics }).success).toBe(true);
    expect(v3ReviewOutput.safeParse({ lyrics, title: "Changed" }).success).toBe(false);
    expect(v3ReviewOutput.safeParse({ lyrics: " " }).success).toBe(false);
    expect(parseV3Review(JSON.stringify({ lyrics })).success).toBe(true);
    expect(parseV3Review("malformed JSON").success).toBe(false);
    expect(parseV3Review('{"lyrics":null}').success).toBe(false);
  });

  test("runtime preserves metadata by construction and forwards original requirements", () => {
    const runtime = readFileSync("src/lib/ai.functions.ts", "utf8");
    expect(runtime).toContain('!isRevision && data.promptVersion === "v3"');
    expect(runtime).toContain("schema: V3_REVIEW_SCHEMA");
    expect(runtime).toContain("finalResult = { ...result.data, lyrics: reviewed.data.lyrics }");
    expect(runtime).toContain("songBlueprint: activeSongBlueprint(data.songBlueprint)");
    expect(runtime).toContain("instructions: data.instructions");
  });

  test("rejects moving a section boundary even when global tag order and line count match", () => {
    expect(
      isSafeV3Review(
        lyrics,
        lyrics.replace(
          "Now I can speak the simple truth\n[Chorus]",
          "[Chorus]\nNow I can speak the simple truth",
        ),
      ),
    ).toBe(false);
    expect(isSafeV3Review("[Verse]\n[Male] Hello there", "[Verse]\n[Male] Goodbye there")).toBe(
      false,
    );
  });

  test("requires consistent repeated hooks while counting distinct corrections", () => {
    expect(isSafeV3Review("First line\n\nSecond line", "First line\nSecond line")).toBe(false);
    const original = Array.from({ length: 5 }, () => "[Chorus]\nWe walks home tonight").join("\n");
    expect(isSafeV3Review(original, original.replaceAll("We walks", "We walk"))).toBe(true);
    expect(isSafeV3Review(original, original.replace("We walks", "We walk"))).toBe(false);
  });

  test("rejects whole-line rewrites even within the changed-line budget", () => {
    expect(
      isSafeV3Review(
        lyrics,
        lyrics.replace(
          "I used to hide the words from you",
          "The city burns beneath a crimson moon",
        ),
      ),
    ).toBe(false);
  });

  test("bounds edits for scripts without word spaces and preserves Greek phrasing", () => {
    expect(isSafeV3Review("[Verse]\n我在这里等着你", "[Verse]\n我在这里等着他")).toBe(true);
    expect(isSafeV3Review("[Verse]\n我在这里等着你", "[Verse]\n天空燃烧变成红色")).toBe(false);
    expect(
      isSafeV3Review("[Verse]\nΚι εγώ σε περιμένω εδώ", "[Verse]\nΚι εγώ σε περιμένω ακόμα"),
    ).toBe(true);
  });

  test("accepts unchanged or minimal lyric changes", () => {
    expect(isSafeV3Review(lyrics, lyrics)).toBe(true);
    expect(isSafeV3Review(lyrics, lyrics.replace("simple truth", "honest truth"))).toBe(true);
  });

  test("rejects section structure modifications or excessive rewrites", () => {
    expect(isSafeV3Review(lyrics, lyrics.replace("[Chorus]", "[Verse]"))).toBe(false);
    expect(isSafeV3Review(lyrics, lyrics.replace("[Warm vocal]", "[Rap vocal]"))).toBe(false);
    expect(
      isSafeV3Review(
        lyrics,
        lyrics
          .replace("I used", "I always used")
          .replace("Now I", "Never I")
          .replace("Come back", "Stay away"),
      ),
    ).toBe(false);
    expect(isSafeV3Review(lyrics, "")).toBe(false);
  });
});

// Execute the actual runtime function with isolated dependencies, not module mocks
// that could leak into other test files. No network, credentials or paid calls.
async function runFixture(
  reviewText: string,
  options: { fail?: boolean; version?: string; revision?: boolean; stopReason?: string } = {},
) {
  const source = ts.createSourceFile(
    "ai.functions.ts",
    readFileSync("src/lib/ai.functions.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const runtime = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "runSongGeneration",
  );
  if (!runtime) throw new Error("Missing runtime function");
  const code = ts.transpileModule(runtime.getText(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const original = { title: "Original", tags: "Slow pop, 80 BPM", lyrics, note: "Soft delivery" };
  const calls: Array<{ prompt: string; schema: unknown }> = [];
  const batches: Array<Array<{ success: boolean }>> = [];
  const exports: {
    runSongGeneration?: (
      data: Record<string, unknown>,
      user: string,
      job: string,
    ) => Promise<{ result: typeof original }>;
  } = {};
  runInNewContext(code, {
    exports,
    ...reviewHelpers,
    console: { info() {}, warn() {}, log() {} },
    activeCaller: async () => ({
      model: "test",
      provider: "test",
      schemas: { song: { type: "song" } },
      call: async (request: { prompt: string; schema: unknown }) => {
        calls.push(request);
        if (calls.length === 2 && options.fail) throw new Error("provider unavailable");
        return {
          text: calls.length === 1 ? JSON.stringify(original) : reviewText,
          stopReason: calls.length === 1 ? "end_turn" : (options.stopReason ?? "end_turn"),
          model: "test",
          provider: "test",
          usage: {},
        };
      },
    }),
    flushUsage: async (_user: string, _job: string, records: Array<{ success: boolean }>) =>
      batches.push(records),
    buildPrompt: () => "V1",
    buildRevisionPrompt: () => "Revision",
    buildAdvancedGeneratorPromptV2: (prompt: string) => `${prompt} V2`,
    parseSections: JSON.parse,
    generationOutput: z.object({
      title: z.string(),
      tags: z.string(),
      lyrics: z.string(),
      note: z.string(),
    }),
    activeSongBlueprint: (blueprint: unknown) => blueprint,
    SYSTEM_PROMPT: "Generate",
    REVISION_SYSTEM_PROMPT: "Revise",
  });
  const result = await exports.runSongGeneration!(
    {
      promptVersion: options.version ?? "v3",
      operation: options.revision ? "revision" : "generate",
      language: "English",
      genre: "Pop",
      mood: "Warm",
      production: "80 BPM",
      structure: "Verse, Chorus",
      theme: "Return home",
      instructions: "Keep the hook",
      songBlueprint: [],
      targetPlatform: "suno",
    },
    "user",
    "job",
  );
  return { ...result, original, calls, batches };
}

describe("V3 runtime with an isolated provider", () => {
  test("applies a safe lyrics-only response, preserves metadata and logs two executions", async () => {
    const edited = lyrics.replace("simple truth", "honest truth");
    const f = await runFixture(JSON.stringify({ lyrics: edited }));
    expect(f.result).toEqual({ ...f.original, lyrics: edited });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]?.prompt).toContain("V3 MUSICAL PHRASE PLANNING");
    expect(f.calls[1]?.prompt).toContain("80 BPM");
    expect(f.calls[1]?.prompt).toContain("Keep the hook");
    expect(f.batches[0]).toHaveLength(2);
  });

  test("malformed, unsafe, metadata-bearing and incomplete reviews retain the original without duplicate usage", async () => {
    for (const text of [
      "invalid JSON",
      JSON.stringify({ lyrics: "A completely different song" }),
      JSON.stringify({ lyrics, title: "Changed" }),
    ]) {
      const f = await runFixture(text);
      expect(f.result).toEqual(f.original);
      expect(f.batches[0]).toHaveLength(2);
    }
    const incomplete = await runFixture(JSON.stringify({ lyrics }), { stopReason: "max_tokens" });
    expect(incomplete.result).toEqual(incomplete.original);
    expect(incomplete.batches[0]).toHaveLength(2);
  });

  test("provider failure keeps the original and records the failed attempt once", async () => {
    const f = await runFixture("", { fail: true });
    expect(f.result).toEqual(f.original);
    expect(f.batches[0]).toHaveLength(2);
    expect(f.batches[0]?.[1]?.success).toBe(false);
  });

  test("V1, V2 and revision preserve their original single-call prompts", async () => {
    for (const [options, expected] of [
      [{ version: "v1" }, "V1"],
      [{ version: "v2" }, "V1 V2"],
      [{ revision: true }, "Revision"],
    ] as const) {
      const f = await runFixture("", options);
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]?.prompt).toBe(expected);
      expect(f.result).toEqual(f.original);
      expect(f.batches[0]).toHaveLength(1);
    }
  });
});
