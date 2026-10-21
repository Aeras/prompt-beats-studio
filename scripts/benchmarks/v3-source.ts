import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { buildAdvancedGeneratorPromptV2 } from "../../src/lib/advanced-generator-prompt-v2";
import { withV3MusicalPlanning } from "../../src/lib/advanced-generator-v3-review";
import { generationPlatformGuidance } from "../../src/lib/ai-platform-guidance";
import { activeSongBlueprint } from "../../src/lib/song-blueprint.shared";
import { withAdvancedSunoEnrichmentInstruction } from "../../src/lib/advanced-suno-enrichment";
import { BRIEFS, briefInput } from "./v3-fixtures";

export const BASELINE_SHA = "889b610b9ea41754e0389b4d9e5e53198e255dbc";
export const ARMS = ["current", "a", "a+b", "c"] as const;
export type Arm = (typeof ARMS)[number];
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// Extract only named, trusted repository declarations, just like the V3 runtime tests.
// No server module imports, initialization, privileged clients or database access.
function extract(source: string, names: string[]) {
  const ast = ts.createSourceFile("trusted.ts", source, ts.ScriptTarget.Latest, true);
  return names
    .map((name) => {
      const fn = ast.statements.find(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
      );
      if (fn) return fn.getText(ast);
      for (const statement of ast.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const declaration = statement.declarationList.declarations.find(
          (node) => node.name.getText(ast) === name,
        );
        if (declaration) return `const ${declaration.getText(ast)};`;
      }
      throw new Error(`Trusted source declaration missing: ${name}`);
    })
    .join("\n");
}

function compile<T>(source: string, names: string[], bindings: Record<string, unknown>): T {
  const code = ts.transpileModule(
    `${extract(source, names)}\nObject.assign(exports, {${names.join(",")}});`,
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const exports = {};
  runInNewContext(code, { exports, ...bindings }, { timeout: 5000 });
  // Typed boundary for explicitly selected repository declarations, covered by parity tests.
  return exports as T;
}

export type Call = {
  system: string;
  prompt: string;
  maxTokens: number;
  schema: Record<string, unknown>;
  reasoningEffort: string;
};
export type ProviderReply = {
  text: string;
  stopReason: string | null;
  provider: string;
  model: string;
  usage: null | {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cachedInputTokens?: number | null;
    cacheWriteTokens?: number | null;
    reasoningTokens?: number | null;
  };
};

export function loadSources() {
  const ai = readFileSync("src/lib/ai.functions.ts", "utf8");
  const provider = readFileSync("src/lib/ai-provider.server.ts", "utf8");
  // Pinned original MAIN implementation, NOT the branch's default A+B.
  const baseline = execFileSync(
    "git",
    ["show", `${BASELINE_SHA}:src/lib/advanced-generator-v3-review.ts`],
    { encoding: "utf8" },
  );
  const builders = compile<{
    buildPrompt: (data: Record<string, unknown>) => string;
    SYSTEM_PROMPT: string;
    generationOutput: z.ZodType<{ title: string; tags: string; lyrics: string; note: string }>;
    parseSections: (raw: string) => unknown;
  }>(
    ai,
    [
      "buildSongBlueprintPrompt",
      "buildPrompt",
      "SYSTEM_PROMPT",
      "generationOutput",
      "parseSections",
    ],
    { z, activeSongBlueprint, generationPlatformGuidance },
  );
  const current = compile<{ withV3MusicalPlanning: (prompt: string) => string }>(
    baseline,
    ["withV3MusicalPlanning"],
    {},
  );
  const adapter = compile<{
    SONG_SCHEMA: Record<string, unknown>;
    openAiOutputBudget: (call: Call) => number;
  }>(provider, ["SONG_SCHEMA", "openAiOutputBudget"], {});
  // Extract request settings from actual generation code, rather than guessing defaults.
  const runtime = extract(ai, ["runSongGeneration"]);
  if (
    !runtime.includes("maxTokens: 8192") ||
    !runtime.includes('reasoningEffort: reasoningEffort ?? "medium"') ||
    !runtime.includes("schema: schemas.song")
  ) {
    throw new Error("Generator request contract changed; review benchmark settings before running");
  }
  const v2 = (brief: (typeof BRIEFS)[number]) =>
    buildAdvancedGeneratorPromptV2(
      builders.buildPrompt(withAdvancedSunoEnrichmentInstruction(briefInput(brief))),
    );
  return {
    ...builders,
    ...adapter,
    sourceHash: hash(
      [
        ai,
        provider,
        baseline,
        ...[
          "src/lib/advanced-generator-v3-review.ts",
          "src/lib/advanced-generator-prompt-v2.ts",
          "src/lib/ai-platform-guidance.ts",
          "src/lib/advanced-suno-enrichment.ts",
          "src/lib/song-blueprint.shared.ts",
          "scripts/benchmarks/v3-fixtures.ts",
          "scripts/benchmarks/v3-source.ts",
          "scripts/benchmarks/v3-benchmark.ts",
          "scripts/benchmarks/v3-runner.ts",
        ].map((path) => readFileSync(path, "utf8")),
      ].join("\n"),
    ),
    v2,
    prompt(brief: (typeof BRIEFS)[number], arm: Arm) {
      const base = v2(brief);
      const result =
        arm === "current" ? current.withV3MusicalPlanning(base) : withV3MusicalPlanning(base, arm);
      if (!result.startsWith(base)) throw new Error("V2 prefix changed");
      return result;
    },
    // Real app adapter with only fetch/key injected. Never logs provider error bodies.
    caller(fetcher: typeof fetch, apiKey: string) {
      return compile<{ callOpenAI: (model: string, call: Call) => Promise<ProviderReply> }>(
        provider,
        [
          "providerRequestTimeoutMs",
          "providerRequestSignal",
          "toOpenAiJsonSchema",
          "openAiOutputBudget",
          "callOpenAI",
        ],
        {
          process: { env: { OPENAI_API_KEY: apiKey } },
          fetch: fetcher,
          AbortSignal,
          console: { error() {} },
        },
      ).callOpenAI;
    },
  };
}
