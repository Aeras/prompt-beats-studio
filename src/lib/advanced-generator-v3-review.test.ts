import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { withV3MusicalPlanning, type V3RhymeCandidate } from "./advanced-generator-v3-review";
import { buildAdvancedGeneratorPromptV2 } from "./advanced-generator-prompt-v2";
import { generationPlatformGuidance } from "./ai-platform-guidance";
import { activeSongBlueprint } from "./song-blueprint.shared";
import { withAdvancedSunoEnrichmentInstruction } from "./advanced-suno-enrichment";

describe("V3 adaptive musical planning", () => {
  test("provides separately testable A and A+B without touching the V2 prefix", () => {
    const source = "V2 baseline";
    const a = withV3MusicalPlanning(source, "a");
    const ab = withV3MusicalPlanning(source, "a+b");
    expect(a.startsWith(source)).toBe(true);
    expect(ab.startsWith(source)).toBe(true);
    expect(a).toContain("RHYME INTENT (V3)");
    expect(ab).toContain("RHYME INTENT (V3)");
    expect(a).not.toContain("Keep the endings provisional");
    expect(ab).toContain("Keep the endings provisional");
    expect(a).toContain("free verse, minimal rhyme");
    expect(a).toContain("Require narrative development only when");
    expect(a).toContain("Do not equate natural phrasing with avoiding rhyme");
    expect(a).toContain("recurring end-rhyme");
    expect(a).not.toContain("mandatory rhymes");
    expect(ab).toContain("Return only the existing song output schema");
    expect(withV3MusicalPlanning(source)).toBe(ab);
  });

  test("preserves V2 and adds phrasing rather than post-edit guidance", () => {
    const prompt = withV3MusicalPlanning("V2 baseline");
    expect(prompt.startsWith("V2 baseline")).toBe(true);
    expect(prompt).toContain("COMPOSE, DO NOT POST-EDIT");
    expect(prompt).toContain("language, genre, mood, tempo");
    expect(prompt).toContain("Never impose fixed syllable counts");
    expect(prompt).not.toContain("independent reviewer");
  });

  test("keeps explicit schemes and metrical forms above automatic defaults", () => {
    for (const candidate of ["a", "a+b"] as const) {
      const prompt = withV3MusicalPlanning("V2 baseline", candidate);
      expect(prompt).toContain("honor explicit requests for a particular metrical form");
      expect(prompt).toContain("occurrence-specific Blueprint preferences");
      expect(prompt).toContain("do not demand end rhyme on every line");
      expect(prompt).toContain(
        "Preserve explicit section lengths, order, vocal handoffs and hooks",
      );
    }
    const ab = withV3MusicalPlanning("V2 baseline", "a+b");
    expect(ab).toContain("Relax only a self-chosen pattern");
    expect(ab).toContain("never an explicit user or Blueprint rhyme scheme");
    expect(ab).not.toContain("revise an ending or relax a pattern rather than");
  });
});

// Compile only the actual pure assemblers; never import the server module or
// install global module mocks. This exercises inherited and platform guidance.
function buildActualV1(input: Record<string, unknown>): string {
  const source = ts.createSourceFile(
    "ai.functions.ts",
    readFileSync("src/lib/ai.functions.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const functions = ["buildSongBlueprintPrompt", "buildPrompt"].map((name) => {
    const node = source.statements.find(
      (item) => ts.isFunctionDeclaration(item) && item.name?.text === name,
    );
    if (!node) throw new Error(`Missing assembler: ${name}`);
    return node.getText(source);
  });
  const code = ts.transpileModule(`${functions.join("\n")}\nexports.buildPrompt = buildPrompt;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { buildPrompt?: (data: Record<string, unknown>) => string } = {};
  runInNewContext(code, { exports, activeSongBlueprint, generationPlatformGuidance });
  if (!exports.buildPrompt) throw new Error("Missing compiled assembler");
  return exports.buildPrompt(input);
}

const brief = {
  theme: "A quiet shared Sunday morning, no developing story required.",
  genre: "Melodic pop — Additional musical direction: Target tempo: 104 BPM.",
  mood: "Warm",
  language: "Russian",
  targetPlatform: "suno",
  structure: "Verse → Chorus → Final Chorus",
  production: "Conversational female vocal",
  instructions: "ABAB in the Chorus; eight syllables per line. Keep the final hook unchanged.",
  songBlueprint: [
    {
      structureIndex: 2,
      sectionType: "Final Chorus",
      occurrence: 1,
      instruction: "Free verse here; keep the required hook.",
    },
  ],
  operation: "generate",
  inputSnapshot: { generatorMode: "advanced" },
};

async function runFixture(
  version: string,
  revision = false,
  options: { input?: Record<string, unknown>; candidate?: V3RhymeCandidate } = {},
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
  const original = {
    title: "Original",
    tags: "Pop 80 BPM",
    lyrics: "[Verse]\\nHello",
    note: "Soft",
  };
  const calls: Array<{
    prompt: string;
    schema: unknown;
    maxTokens: number;
    reasoningEffort: string;
  }> = [];
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
      call: async (request: {
        prompt: string;
        schema: unknown;
        maxTokens: number;
        reasoningEffort: string;
      }) => {
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
    buildPrompt: options.input ? buildActualV1 : () => "V1",
    buildRevisionPrompt: () => "Revision",
    buildAdvancedGeneratorPromptV2: options.input
      ? buildAdvancedGeneratorPromptV2
      : (prompt: string) => `${prompt} V2`,
    withV3MusicalPlanning: (prompt: string) => withV3MusicalPlanning(prompt, options.candidate),
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
    { ...options.input, promptVersion: version, operation: revision ? "revision" : "generate" },
    "user",
    "job",
  );
  return { result, original, calls, batches };
}

describe("V3 actual provider path", () => {
  test("both candidates preserve the complete V2 assembly, user brief and provider contract", async () => {
    const input = withAdvancedSunoEnrichmentInstruction(brief);
    const snapshot = JSON.stringify(input);
    const v2 = await runFixture("v2", false, { input });
    const base = v2.calls[0]?.prompt;
    expect(base).toBe(buildAdvancedGeneratorPromptV2(buildActualV1(input)));
    expect(base).toContain("ADVANCED SUNO");
    for (const candidate of ["a", "a+b"] as const) {
      const f = await runFixture("v3", false, { input, candidate });
      expect(f.calls).toHaveLength(1);
      expect(f.batches[0]).toHaveLength(1);
      expect(f.calls[0]?.prompt).toBe(withV3MusicalPlanning(base ?? "", candidate));
      for (const value of [
        input.theme,
        input.genre,
        input.language,
        input.structure,
        input.production,
        input.instructions,
        brief.songBlueprint[0]?.instruction ?? "",
      ])
        expect(f.calls[0]?.prompt).toContain(value);
      expect(f.calls[0]?.schema).toEqual(v2.calls[0]?.schema);
      expect(f.calls[0]?.maxTokens).toBe(v2.calls[0]?.maxTokens);
      expect(f.calls[0]?.reasoningEffort).toBe(v2.calls[0]?.reasoningEffort);
      expect(f.result.result).toEqual(f.original);
    }
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test("multilingual free verse, internal rhyme and narrative requests survive both assemblies", () => {
    const cases = [
      {
        targetPlatform: "suno",
        language: "Russian",
        genre: "Melodic pop",
        instructions: "Свободный стих, без концевой рифмы.",
      },
      {
        targetPlatform: "udio",
        language: "Greek",
        genre: "Spoken word",
        instructions: "Μόνο εσωτερική ρίμα, χωρίς αφηγηματική εξέλιξη.",
      },
      {
        targetPlatform: "suno",
        language: "Japanese",
        genre: "Experimental ambient",
        instructions: "物語の展開は不要。韻は最小限。",
      },
      {
        targetPlatform: "udio",
        language: "English",
        genre: "Rap",
        instructions:
          "Internal rhyme only.\nNARRATIVE LYRICS DIRECTION: Give sung lyrics a clear beginning, development and fitting ending.",
      },
    ];
    for (const direction of cases) {
      const input = { ...brief, ...direction };
      const v1 = buildActualV1(input);
      const v2 = buildAdvancedGeneratorPromptV2(v1);
      for (const candidate of ["a", "a+b"] as const) {
        const composed = withV3MusicalPlanning(v2, candidate);
        expect(composed.startsWith(v2)).toBe(true);
        expect(composed.slice(0, v2.length)).toBe(v2);
        expect(composed).toContain(`Requested Language: ${direction.language}`);
        expect(composed).toContain(direction.instructions);
        expect(composed).toContain("over genre defaults");
        expect(composed).toContain("Require narrative development only when");
        expect(composed).toContain("without inventing\na story arc");
      }
      expect(v1).not.toContain("RHYME INTENT (V3)");
      expect(v2).not.toContain("RHYME INTENT (V3)");
    }
  });

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
