import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, test } from "bun:test";
import { z } from "zod";
import * as blueprint from "./song-blueprint.shared";
import * as revisions from "./generator-revision.shared";
import * as atlas from "./song-atlas.shared";
import * as lyrics from "./lyrics-workspace.shared";
import * as sections from "./lyrics-sections";
import * as limits from "./generator-input-limits";
import * as platforms from "./ai-target-platforms";
import { generationOutput, parseSections } from "./generation-result.shared";
import * as registry from "./prompt-registry.shared";
import {
  buildAdvancedGeneratorPromptV4Beta,
  normalizeV4Platform,
  serializeV4Blueprint,
} from "./advanced-generator-prompt-v4-beta";
import {
  buildAdvancedGeneratorPromptV5Beta1,
  V5_BETA_1_PLACEHOLDERS,
} from "./advanced-generator-prompt-v5-beta-1";
import {
  V5_BETA_1_MASTER_PROMPT_TEMPLATE as template,
  V5_BETA_1_MASTER_PROMPT_SHA256 as sha,
} from "./advanced-generator-prompt-v5-beta-1.template";
import { buildGeneratorBenchmarkMarkdown } from "./generator-benchmark-export";
const canonical =
  "docs/prompts/PromptBeats_TEAM09_Creative_Master_Prompt_V2_CANDIDATE_2026-10-30.md";
const base = {
  theme: "Νυχτερινό τρένο",
  genre: "Indie folk",
  mood: "Bittersweet",
  language: "Greek",
  targetPlatform: "udio",
};
const version = "v5_beta_1";
function codeParts(path: string, names: string[]) {
  const raw = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true);
  return source.statements
    .filter(
      (n) =>
        (ts.isFunctionDeclaration(n) && !!n.name && names.includes(n.name.text)) ||
        (ts.isVariableStatement(n) &&
          n.declarationList.declarations.some(
            (d) => ts.isIdentifier(d.name) && names.includes(d.name.text),
          )),
    )
    .map((n) => n.getText(source))
    .join("\n");
}
function evaluate(code: string, globals: Record<string, unknown> = {}) {
  const exports: any = {};
  runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      z,
      console: { log() {}, warn() {}, error() {} },
      AbortController,
      AbortSignal,
      setInterval,
      clearInterval,
      Date,
      JSON,
      ...globals,
    },
  );
  return exports;
}
const contractGlobals = {
  ...blueprint,
  ...revisions,
  ...atlas,
  ...lyrics,
  ...platforms,
  ...registry,
};
function generationSchema() {
  return evaluate(
    codeParts("src/lib/ai.functions.ts", ["generateInput"]) + "\nexports.schema=generateInput;",
    contractGlobals,
  ).schema;
}
const snapshot = revisions.generatorInputSnapshotSchema.parse({ generatorMode: "advanced" });
const fullInput = () =>
  generationSchema().parse({ ...base, promptVersion: version, inputSnapshot: snapshot });
const output = {
  title: "Original title",
  tags: "Acoustic folk",
  lyrics: "[Verse]\nOriginal words",
  note: "Original production note",
};

test("V5 canonical bytes and runtime template retain the supplied SHA-256 and exact nine placeholders", () => {
  const bytes = readFileSync(canonical);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "f27e91b49e18b9d083359843b70ecb61b66fb4cab196878349fc086c5d0498e1",
  );
  expect(Buffer.from(template, "utf8").equals(bytes)).toBe(true);
  expect(createHash("sha256").update(template).digest("hex")).toBe(sha);
  expect([...template.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1])).toEqual([
    ...V5_BETA_1_PLACEHOLDERS,
  ]);
  for (const key of V5_BETA_1_PLACEHOLDERS)
    expect(template.split("{{" + key + "}}").length - 1).toBe(1);
});
test("all nine inputs substitute once without rescanning user tokens or dollar syntax", () => {
  const input = {
    ...base,
    theme: "  {{GENRES}} $& Καλημέρα  ",
    genre: "rock",
    structure: "Verse → Chorus → Chorus",
    production: "Wide",
    instructions: "{{CORE_IDEA}} $$ $'",
    songBlueprint: [
      {
        structureIndex: 2,
        sectionType: "Chorus",
        occurrence: 2,
        instruction: "{{MOOD}} $&",
        energy: 5 as const,
      },
    ],
  };
  const values: Record<string, string> = {
    CORE_IDEA: input.theme.trim(),
    GENRES: input.genre,
    MOOD: input.mood,
    LANGUAGE: input.language,
    TARGET_PLATFORM: "udio",
    SONG_STRUCTURE: input.structure,
    PRODUCTION_STYLE: input.production,
    ADDITIONAL_INSTRUCTIONS: input.instructions,
    SONG_BLUEPRINT: serializeV4Blueprint(input.songBlueprint),
  };
  expect(buildAdvancedGeneratorPromptV5Beta1(input)).toBe(
    template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key]!),
  );
  expect(buildAdvancedGeneratorPromptV5Beta1(input)).toContain("Structure position 3: Chorus #2");
});
test("optional blanks, required inputs and Suno/Udio normalization preserve V4 helper behavior", () => {
  for (const targetPlatform of [" Udio ", "SUNO", "other"]) {
    const value = buildAdvancedGeneratorPromptV5Beta1({ ...base, targetPlatform });
    expect(value).toContain("(`suno` or `udio`):** " + normalizeV4Platform(targetPlatform));
    expect(value).toContain("(not provided)");
    expect(value).not.toMatch(/\{\{[A-Z_]+\}\}/);
  }
  for (const key of ["theme", "genre", "mood", "language"] as const)
    expect(() => buildAdvancedGeneratorPromptV5Beta1({ ...base, [key]: " " })).toThrow(
      "V5 BETA 1 requires",
    );
  expect(buildAdvancedGeneratorPromptV5Beta1(base)).not.toBe(
    buildAdvancedGeneratorPromptV4Beta(base),
  );
});
test("four-field output validation and metadata/default contracts remain compatible", () => {
  expect(generationOutput.parse(output)).toEqual(output);
  for (const key of Object.keys(output)) {
    const raw: any = { ...output };
    delete raw[key];
    expect(generationOutput.safeParse(raw).success).toBe(false);
  }
  const schema = generationSchema();
  expect(schema.parse({ ...base }).promptVersion).toBe("v1");
  for (const promptVersion of ["v1", "v2", "v3", "v4_beta", version])
    expect(schema.parse({ ...base, promptVersion }).promptVersion).toBe(promptVersion);
  const md = buildGeneratorBenchmarkMarkdown({
    title: "Title",
    musicStyle: "Folk",
    lyrics: "Original",
    producerNote: "Note",
    modelId: "offline",
    modelLabel: "Fixture",
    provider: "offline",
    targetPlatform: "udio",
    generatorMode: "advanced",
    promptVersion: version,
    exportedAt: "2026-10-30T00:00:00Z",
  });
  expect(md).toContain("**Prompt Version:** v5_beta_1");
});
test("actual dispatch selects V5 independently, preserving V1–V4 and revision branches", async () => {
  const calls: any[] = [];
  let usage = 0;
  const run = evaluate(codeParts("src/lib/ai.functions.ts", ["runSongGeneration"]), {
    assertGenerationRequestBudget: limits.assertGenerationRequestBudget,
    activeCaller: async () => ({
      model: "offline",
      provider: "offline",
      schemas: { song: { type: "object" } },
      call: Object.assign(
        async (input: any) => {
          calls.push(input);
          return {
            text: JSON.stringify(output),
            stopReason: "end_turn",
            usage: null,
            provider: "offline",
            model: "offline",
          };
        },
        { executionId: "offline" },
      ),
    }),
    buildAdvancedGeneratorPromptV4Beta,
    buildAdvancedGeneratorPromptV5Beta1,
    buildPrompt: () => "legacy-v1",
    buildRevisionPrompt: () => "legacy-revision",
    buildAdvancedGeneratorPromptV2: (p: string) => "v2:" + p,
    withV3MusicalPlanning: (p: string) => "v3:" + p,
    SYSTEM_PROMPT: "unchanged-system",
    REVISION_SYSTEM_PROMPT: "unchanged-revision-system",
    generationOutput,
    parseSections,
    flushUsage: async () => {
      usage++;
    },
  }).runSongGeneration;
  for (const [promptVersion, expected] of [
    ["v1", "legacy-v1"],
    ["v2", "v2:legacy-v1"],
    ["v3", "v3:v2:legacy-v1"],
    ["v4_beta", buildAdvancedGeneratorPromptV4Beta(base)],
    [version, buildAdvancedGeneratorPromptV5Beta1(base)],
  ]) {
    const result = await run({ ...fullInput(), promptVersion }, "offline-owner", null);
    expect(result.result).toEqual(output);
    expect(calls.at(-1).prompt).toBe(expected);
    expect(calls.at(-1).maxTokens).toBe(8192);
    expect(calls.at(-1).system).toBe("unchanged-system");
  }
  await run({ ...fullInput(), operation: "revision" }, "offline-owner", null);
  expect(calls.at(-1).prompt).toBe("legacy-revision");
  expect(calls.at(-1).system).toBe("unchanged-revision-system");
  expect(calls).toHaveLength(6);
  expect(usage).toBe(6);
});
function admissionFixture() {
  let allowed = true,
    roleError = false;
  const started: any[] = [];
  const module = evaluate(readFileSync("src/lib/generation-jobs.functions.ts", "utf8"), {
    require: (name: string) => {
      if (name === "zod") return { z };
      if (name === "@tanstack/react-start")
        return {
          createServerFn: () => ({
            validate: (value: unknown) => value,
            middleware() {
              return this;
            },
            inputValidator(fn: any) {
              this.validate = fn;
              return this;
            },
            handler(fn: any) {
              return async (args: any) => fn({ ...args, data: this.validate(args.data) });
            },
          }),
        };
      if (name.includes("song-atlas.shared")) return atlas;
      if (name.includes("prompt-registry.shared")) return registry;
      if (name.includes("global-ai-usage")) return { AI_DISABLED_MESSAGE: "AI disabled" };
      if (name.includes("auth-middleware")) return { requireSupabaseAuth: {} };
      if (name.includes("feature-access.functions"))
        return { requireFeatureAccess: async () => {} };
      if (name.includes("ai-target-platforms")) return platforms;
      if (name.includes("generator-input-limits")) return limits;
      if (name.includes("generator-revision.shared")) return revisions;
      if (name.includes("lyrics-workspace.shared")) return lyrics;
      if (name.includes("lyrics-sections")) return sections;
      if (name.includes("song-blueprint.shared")) return blueprint;
      if (name.includes("ai-provider.server"))
        return { getModelForUser: async () => "offline-model" };
      throw Error("Unexpected admission import " + name);
    },
  });
  const client = {
    rpc: async (name: string, args: any) => {
      if (name === "current_user_is_admin_level") return { data: true, error: null };
      if (name === "current_user_is_super_admin")
        return { data: allowed, error: roleError ? { code: "offline" } : null };
      if (name === "start_generation_job") {
        started.push(args);
        return {
          data: {
            id: "a5000000-0000-4000-8000-000000000004",
            status: "pending",
            input_payload: {
              ...args._input,
              promptVersion:
                args._input.promptVersion === "default" ? "v1" : args._input.promptVersion,
            },
            result: null,
          },
          error: null,
        };
      }
      throw Error("Unexpected admission RPC " + name);
    },
  };
  const invoke = (patch: any = {}) =>
    module.startGenerationJob({
      data: {
        ...fullInput(),
        idempotencyKey: "a5000000-0000-4000-8000-000000000001",
        advanced: true,
        ...patch,
      },
      context: { userId: "owner", supabase: client },
    });
  return {
    invoke,
    started,
    role: (value: boolean, error = false) => {
      allowed = value;
      roleError = error;
    },
  };
}
test("actual admission rejects forged role/mode/revision and unknown versions before job creation", async () => {
  const f = admissionFixture();
  f.role(false);
  await expect(f.invoke()).rejects.toThrow("restricted");
  expect(f.started).toHaveLength(0);
  f.role(true, true);
  await expect(f.invoke()).rejects.toThrow("restricted");
  f.role(true);
  for (const patch of [
    { advanced: false },
    { operation: "revision" },
    { inputSnapshot: { generatorMode: "basic" } },
    { inputSnapshot: null },
  ])
    await expect(f.invoke(patch)).rejects.toThrow("restricted");
  await expect(f.invoke({ promptVersion: "v5" })).rejects.toThrow();
  expect(f.started).toHaveLength(0);
  const result = await f.invoke();
  expect(result.job.input.promptVersion).toBe(version);
  expect(f.started[0]._input.promptVersion).toBe(version);
  expect(f.started[0]._input.inputSnapshot.generatorMode).toBe("advanced");
  const old = await f.invoke({ promptVersion: undefined });
  expect(old.job.input.promptVersion).toBe("v1");
});
function workerFixture(input: any, allowed = true, roleError = false) {
  let state = "pending",
    dispatches = 0;
  const patches: any[] = [];
  const job: any = {
    id: "a5000000-0000-4000-8000-000000000004",
    user_id: "owner",
    input_payload: input,
    attempts: 0,
    generation_id: null,
  };
  const db = {
    rpc: async (name: string) => {
      if (name === "_has_role_internal") return { data: allowed, error: roleError ? {} : null };
      if (name === "generator_prompt_for_job_internal")
        return {
          data:
            allowed && !roleError
              ? {
                  ...input.promptBinding,
                  builtin_version: input.promptVersion === "registry" ? null : input.promptVersion,
                }
              : null,
          error: roleError ? {} : null,
        };
      throw Error("Unexpected worker RPC " + name);
    },
    from: () => {
      let patch: any = null;
      const filters: any[] = [];
      const response = () => {
        if (filters.some(([op, k, v]) => op === "eq" && k === "status" && v !== state))
          return { data: null, error: null };
        if (filters.some(([op, k]) => op === "not" && k === "cancel_requested_at"))
          return { data: null, error: null };
        if (patch) {
          patches.push(patch);
          if (patch.status) state = patch.status;
        }
        return { data: patch ? { ...job } : { cancel_requested_at: null }, error: null };
      };
      const q: any = {
        update: (p: any) => {
          patch = p;
          return q;
        },
        select: () => q,
        eq: (k: string, v: any) => {
          filters.push(["eq", k, v]);
          return q;
        },
        is: () => q,
        not: (k: string) => {
          filters.push(["not", k]);
          return q;
        },
        maybeSingle: async () => response(),
        then: (resolve: any) => Promise.resolve(response()).then(resolve),
      };
      return q;
    },
  };
  const worker = evaluate(
    codeParts("src/lib/generation-jobs.server.ts", ["safeErrorMessage", "executeGenerationJob"]),
    {
      admin: async () => db,
      durableAiJobInput: z.union([generationSchema(), lyrics.lyricsSectionEditJobSchema]),
      assertGenerationRequestBudget: limits.assertGenerationRequestBudget,
      AI_DISABLED_MESSAGE: "AI disabled",
      AI_UNAVAILABLE_MESSAGE: "AI unavailable",
      safeErrorType: () => "Error",
      runSongGeneration: async (data: any) => {
        dispatches++;
        expect(data.promptVersion).toBe(input.promptVersion);
        return { result: output, provider: "offline", model: "offline" };
      },
      withAdvancedSunoEnrichmentInstruction: (x: any) => x,
      fitMusicStyleToPlatform: (x: string) => x,
      require: (name: string) => {
        if (name.includes("generation-reconciliation"))
          return { reconcileFailedGeneration: async () => {} };
        if (name.includes("ai-execution")) return { claimRecoveredJob: async () => null };
        throw Error("Unexpected worker import " + name);
      },
    },
  ).executeGenerationJob;
  return {
    run: () => worker(job.id),
    patches,
    get dispatches() {
      return dispatches;
    },
  };
}
test("actual raw-job worker re-verifies V5 and duplicate completion never redispatches", async () => {
  for (const [input, allowed, error] of [
    [fullInput(), false, false],
    [fullInput(), true, true],
    [{ ...fullInput(), inputSnapshot: null }, true, false],
    [{ ...fullInput(), inputSnapshot: { generatorMode: "basic" } }, true, false],
    [{ ...fullInput(), operation: "revision" }, true, false],
  ] as const) {
    const f = workerFixture(input, allowed, error);
    await f.run();
    expect(f.dispatches).toBe(0);
    expect(f.patches.some((p) => p.status === "failed")).toBe(true);
    expect(f.patches.some((p) => p.provider_started_at)).toBe(false);
  }
  const f = workerFixture(fullInput());
  expect(await f.run()).toEqual({ ran: true });
  expect(f.dispatches).toBe(1);
  expect(f.patches.some((p) => p.status === "completed")).toBe(true);
  expect(await f.run()).toEqual({ ran: false });
  expect(f.dispatches).toBe(1);
});

test("registry-pinned production defaults run without experimental privilege while unavailable bindings fail before provider marking", async () => {
  const binding = {
    id: "af560000-0000-4000-8000-000000000001",
    digest: "a".repeat(64),
    label: "Production prompt",
    experimental: false,
  };
  const input = {
    ...fullInput(),
    inputSnapshot: { generatorMode: "basic" },
    promptBinding: binding,
  };
  const production = workerFixture(input);
  await production.run();
  expect(production.dispatches).toBe(1);
  await production.run();
  expect(production.dispatches).toBe(1);
  for (const invalid of [
    workerFixture({ ...input, promptVersion: "registry", promptBinding: undefined }),
    workerFixture(input, true, true),
    workerFixture(input, false),
  ]) {
    await invalid.run();
    expect(invalid.dispatches).toBe(0);
    expect(invalid.patches.some((p) => p.provider_started_at)).toBe(false);
  }
});
