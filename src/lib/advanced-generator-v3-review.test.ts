import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { withV3MusicalPlanning } from "./advanced-generator-v3-review";

describe("V3 adaptive musical planning", () => {
  test("preserves V2 and adds phrasing rather than post-edit guidance", () => {
    const prompt = withV3MusicalPlanning("V2 baseline");
    expect(prompt.startsWith("V2 baseline")).toBe(true);
    expect(prompt).toContain("COMPOSE, DO NOT POST-EDIT");
    expect(prompt).toContain("language, genre, mood, tempo");
    expect(prompt).toContain("Never impose fixed syllable counts");
    expect(prompt).not.toContain("independent reviewer");
  });
});

async function runFixture(version: string, revision = false) {
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
  const original = {
    title: "Original",
    tags: "Pop 80 BPM",
    lyrics: "[Verse]\\nHello",
    note: "Soft",
  };
  const calls: Array<{ prompt: string }> = [];
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
    console: { info() {}, warn() {}, log() {} },
    activeCaller: async () => ({
      model: "test",
      provider: "test",
      schemas: { song: { type: "song" } },
      call: async (request: { prompt: string }) => {
        calls.push(request);
        return {
          text: JSON.stringify(original),
          stopReason: "end_turn",
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
    withV3MusicalPlanning,
    parseSections: JSON.parse,
    generationOutput: z.object({
      title: z.string(),
      tags: z.string(),
      lyrics: z.string(),
      note: z.string(),
    }),
    SYSTEM_PROMPT: "Generate",
    REVISION_SYSTEM_PROMPT: "Revise",
  });
  const result = await exports.runSongGeneration!(
    { promptVersion: version, operation: revision ? "revision" : "generate" },
    "user",
    "job",
  );
  return { result, original, calls, batches };
}

describe("V3 actual provider path", () => {
  test("V3 runs a single provider call with composition-time planning", async () => {
    const f = await runFixture("v3");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.prompt).toContain("V2");
    expect(f.calls[0]?.prompt).toContain("ADAPTIVE MUSICAL PHRASING");
    expect(f.result.result).toEqual(f.original);
    expect(f.batches[0]).toHaveLength(1);
  });

  test("V1, V2 and revisions remain unchanged single-call flows", async () => {
    for (const [version, revision, expected] of [
      ["v1", false, "V1"],
      ["v2", false, "V1 V2"],
      ["v3", true, "Revision"],
    ] as const) {
      const f = await runFixture(version, revision);
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]?.prompt).toBe(expected);
      expect(f.batches[0]).toHaveLength(1);
    }
  });

  test("there is no second-stage reviewer in the generation runtime", () => {
    const source = readFileSync("src/lib/ai.functions.ts", "utf8");
    expect(source).not.toContain("buildV3ReviewPrompt(");
    expect(source).not.toContain("V3_REVIEW_SCHEMA");
    expect(source).not.toContain("isSafeV3Review(");
  });
});
