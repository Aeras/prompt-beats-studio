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
import * as creativeHistory from "./creative-direction-history.shared";
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
const historyProjectId = "11111111-1111-4111-8111-111111111111";
const secondHistoryProjectId = "44444444-4444-4444-8444-444444444444";
const historyUniverseId = "22222222-2222-4222-8222-222222222222";
const secondHistoryUniverseId = "55555555-5555-4555-8555-555555555555";
const historySessionId = "33333333-3333-4333-8333-333333333333";
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
  ...creativeHistory,
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

test("opted-in history uses the same single model call and returns only four song fields publicly", async () => {
  const calls: any[] = [];
  const privateOutput = {
    ...output,
    creativeDirection: {
      coreIdea: "A traveler choosing to leave a familiar city",
      narrator: "First person, reflective",
      emotionalApproach: "Hope held beside grief",
      hookIdentity: "A rising phrase about an open road",
      sonicIdentity: "Warm guitar with restrained percussion",
    },
  };
  const run = evaluate(
    codeParts("src/lib/ai.functions.ts", ["runSongGeneration", "creativeDirectionSongSchema"]),
    {
      assertGenerationRequestBudget: limits.assertGenerationRequestBudget,
      activeCaller: async () => ({
        model: "offline",
        provider: "offline",
        schemas: {
          song: {
            type: "OBJECT",
            properties: { title: { type: "STRING" }, tags: { type: "STRING" } },
            required: ["title", "tags"],
          },
        },
        call: Object.assign(
          async (input: any) => {
            calls.push(input);
            return {
              text: JSON.stringify(privateOutput),
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
      SYSTEM_PROMPT: "four-fields",
      CREATIVE_DIRECTION_SYSTEM_PROMPT: "five-fields-with-private-metadata",
      REVISION_SYSTEM_PROMPT: "unchanged-revision-system",
      buildCreativeDirectionHistoryPrompt: creativeHistory.buildCreativeDirectionHistoryPrompt,
      parseCreativeDirectionModelResponse: creativeHistory.parseCreativeDirectionModelResponse,
      generationOutput,
      parseSections,
      flushUsage: async () => {},
    },
  ).runSongGeneration;
  const enabledInput = {
    ...fullInput(),
    creativeDirectionHistory: {
      version: 1,
      scopes: [{ type: "session", id: historySessionId }],
    },
  };
  const history = [
    {
      coreIdea: "A traveler finding courage at dawn",
      narrator: "First person",
      emotionalApproach: "Quiet resolve",
      hookIdentity: "A dawn refrain",
      sonicIdentity: "Fingerpicked guitar",
    },
  ];
  const result = await run(enabledInput, "offline-owner", null, undefined, undefined, undefined, {
    userId: "offline-owner",
    operation: "generate",
    creativeDirectionHistory: history,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].prompt).toContain("A traveler finding courage at dawn");
  expect(calls[0].system).toBe("five-fields-with-private-metadata");
  expect(calls[0].schema.required).toContain("creativeDirection");
  expect(Object.keys(result.result)).toEqual(["title", "tags", "lyrics", "note"]);
  expect(result.creativeDirection).toEqual(privateOutput.creativeDirection);
});
function admissionFixture() {
  let allowed = true,
    roleError = false;
  const started: any[] = [];
  const memberships = new Map<string, string>();
  const ownedProjects = new Set([historyProjectId, secondHistoryProjectId]);
  const ownedUniverses = new Set([historyUniverseId, secondHistoryUniverseId]);
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
      if (name.includes("creative-direction-history.shared")) return creativeHistory;
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
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        maybeSingle: async () => {
          const value = (key: string) => filters.find(([filter]) => filter === key)?.[1];
          if (table === "prompt_projects") {
            const id = value("id");
            return {
              data:
                id && ownedProjects.has(String(id)) && value("user_id") === "owner" ? { id } : null,
              error: null,
            };
          }
          if (table === "song_universe_projects") {
            const universeId = memberships.get(String(value("project_id")));
            return { data: universeId ? { universe_id: universeId } : null, error: null };
          }
          if (table === "song_universes") {
            const id = value("id");
            return {
              data:
                id && ownedUniverses.has(String(id)) && value("owner_id") === "owner"
                  ? { id }
                  : null,
              error: null,
            };
          }
          throw Error("Unexpected admission table " + table);
        },
      };
      return query;
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
    membership: (projectId: string, universeId: string) => memberships.set(projectId, universeId),
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
test("history admission binds the opt-in to Super Admin Advanced mode before job creation", async () => {
  const f = admissionFixture();
  const creativeDirectionHistory = {
    version: 1,
    scopes: [{ type: "session", id: historySessionId }],
  };
  f.role(false);
  await expect(f.invoke({ creativeDirectionHistory })).rejects.toThrow("Super Admin");
  expect(f.started).toHaveLength(0);
  f.role(true);
  await expect(f.invoke({ advanced: false, creativeDirectionHistory })).rejects.toThrow(
    "Advanced generation",
  );
  await expect(f.invoke({ operation: "revision", creativeDirectionHistory })).rejects.toThrow(
    "Advanced generation",
  );
  const result = await f.invoke({ creativeDirectionHistory });
  expect(f.started).toHaveLength(1);
  expect(f.started[0]._input.creativeDirectionHistory).toEqual(creativeDirectionHistory);
});

test("actual admission keeps project, universe, paired and session scopes isolated and canonical", async () => {
  const sessionConfig = {
    version: 1,
    scopes: [{ type: "session", id: historySessionId }],
  };
  const projectConfig = {
    version: 1,
    scopes: [{ type: "project", id: historyProjectId }],
  };
  const universeConfig = {
    version: 1,
    scopes: [{ type: "song_universe", id: historyUniverseId }],
  };
  const pairedConfig = {
    version: 1,
    scopes: [
      { type: "project", id: historyProjectId },
      { type: "song_universe", id: historyUniverseId },
    ],
  };

  const f = admissionFixture();
  const sessionJob = await f.invoke({ creativeDirectionHistory: sessionConfig });
  expect(sessionJob.job.input?.creativeDirectionHistory).toEqual(sessionConfig);

  const independentProject = await f.invoke({ creativeDirectionHistory: projectConfig });
  expect(independentProject.job.input?.creativeDirectionHistory).toEqual(projectConfig);

  f.membership(historyProjectId, historyUniverseId);
  const linkedProjectJob = await f.invoke({ creativeDirectionHistory: projectConfig });
  expect(linkedProjectJob.job.input?.creativeDirectionHistory).toEqual(pairedConfig);

  const universeJob = await f.invoke({ creativeDirectionHistory: universeConfig });
  expect(universeJob.job.input?.creativeDirectionHistory).toEqual(universeConfig);

  const pairedJob = await f.invoke({ creativeDirectionHistory: pairedConfig });
  expect(pairedJob.job.input?.creativeDirectionHistory).toEqual(pairedConfig);

  const otherProjectJob = await f.invoke({
    creativeDirectionHistory: {
      version: 1,
      scopes: [{ type: "project", id: secondHistoryProjectId }],
    },
  });
  expect(otherProjectJob.job.input?.creativeDirectionHistory?.scopes).toEqual([
    { type: "project", id: secondHistoryProjectId },
  ]);
  expect(f.started).toHaveLength(6);

  const mismatched = {
    version: 1,
    scopes: [
      { type: "project", id: historyProjectId },
      { type: "song_universe", id: secondHistoryUniverseId },
    ],
  };
  await expect(f.invoke({ creativeDirectionHistory: mismatched })).rejects.toThrow(
    "does not belong",
  );
  expect(f.started).toHaveLength(6);
});

test("Generator admission persists resolved Project+Universe scopes through worker read and completion", async () => {
  const admission = admissionFixture();
  admission.membership(historyProjectId, historyUniverseId);
  const admitted = await admission.invoke({
    creativeDirectionHistory: {
      version: 1,
      scopes: [{ type: "project", id: historyProjectId }],
    },
  });
  const durableInput = admitted.job.input!;
  const expectedScopes = [
    { type: "project", id: historyProjectId },
    { type: "song_universe", id: historyUniverseId },
  ];
  expect(durableInput.creativeDirectionHistory?.scopes).toEqual(expectedScopes);

  const worker = workerFixture(durableInput);
  expect(await worker.run()).toEqual({ ran: true });
  expect(worker.dispatches).toBe(1);
  expect(worker.readScopes).toEqual([expectedScopes]);
  expect(worker.generationContexts).toEqual([
    expect.objectContaining({
      creativeDirectionHistory: [
        expect.objectContaining({ coreIdea: "A traveler finding courage at dawn" }),
      ],
    }),
  ]);
  expect(
    worker.rpcCalls.filter(
      ({ name }) => name === "complete_generation_with_creative_direction_history",
    ),
  ).toHaveLength(1);
});

function workerFixture(input: any, allowed = true, roleError = false, completionFails = false) {
  let state = "pending",
    dispatches = 0;
  const patches: any[] = [];
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const readScopes: unknown[] = [];
  const generationContexts: unknown[] = [];
  const job: any = {
    id: "a5000000-0000-4000-8000-000000000004",
    user_id: "owner",
    input_payload: input,
    attempts: 0,
    generation_id: null,
  };
  const db = {
    rpc: async (name: string, args: any = {}) => {
      rpcCalls.push({ name, args });
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
      if (name === "read_generator_creative_direction_history") {
        readScopes.push(args._scopes);
        return {
          data: [
            {
              coreIdea: "A traveler finding courage at dawn",
              narrator: "First person",
              emotionalApproach: "Quiet resolve",
              hookIdentity: "A dawn refrain",
              sonicIdentity: "Fingerpicked guitar",
            },
          ],
          error: null,
        };
      }
      if (name === "complete_generation_with_creative_direction_history") {
        if (completionFails) return { data: null, error: { message: "constraint error" } };
        state = "completed";
        patches.push({ status: "completed", result: args._result });
        return { data: true, error: null };
      }
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
      creativeDirectionHistoryEntriesSchema: creativeHistory.creativeDirectionHistoryEntriesSchema,
      assertGenerationRequestBudget: limits.assertGenerationRequestBudget,
      AI_DISABLED_MESSAGE: "AI disabled",
      AI_UNAVAILABLE_MESSAGE: "AI unavailable",
      safeErrorType: () => "Error",
      runSongGeneration: async (
        data: any,
        _userId: string,
        _generationId: string | null,
        _signal: AbortSignal,
        _recordCancellation: unknown,
        _recordRemoteOperation: unknown,
        context: unknown,
      ) => {
        dispatches++;
        generationContexts.push(context);
        expect(data.promptVersion).toBe(input.promptVersion);
        return {
          result: output,
          provider: "offline",
          model: "offline",
          ...(data.creativeDirectionHistory
            ? {
                creativeDirection: {
                  coreIdea: "A traveler leaving at dawn",
                  narrator: "First person",
                  emotionalApproach: "Hopeful",
                  hookIdentity: "A dawn refrain",
                  sonicIdentity: "Piano and guitar",
                },
              }
            : {}),
        };
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
    rpcCalls,
    readScopes,
    generationContexts,
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

test("opted-in worker reads private history once and atomically saves metadata without exposing it in result", async () => {
  const input = {
    ...fullInput(),
    creativeDirectionHistory: {
      version: 1,
      scopes: [{ type: "session", id: "33333333-3333-4333-8333-333333333333" }],
    },
  };
  const worker = workerFixture(input);
  await worker.run();
  expect(worker.dispatches).toBe(1);
  const read = worker.rpcCalls.find(
    (call) => call.name === "read_generator_creative_direction_history",
  );
  const complete = worker.rpcCalls.find(
    (call) => call.name === "complete_generation_with_creative_direction_history",
  );
  expect(read?.args._scopes).toEqual(input.creativeDirectionHistory.scopes);
  expect(worker.readScopes).toEqual([input.creativeDirectionHistory.scopes]);
  expect(complete?.args._direction.coreIdea).toBe("A traveler leaving at dawn");
  expect(Object.keys(complete!.args._result)).toEqual(["title", "tags", "lyrics", "note"]);
  expect(worker.patches.some((patch) => patch.result?.creativeDirection)).toBe(false);

  const failedWorker = workerFixture(input, true, false, true);
  await failedWorker.run();
  const failedPatch = failedWorker.patches.find((p) => p.status === "failed");
  expect(failedPatch).toBeDefined();
  expect(failedPatch.error).toBe(
    "The generation could not be finalized with its creative direction.",
  );
  expect(failedPatch.error).not.toContain("provider is temporarily unavailable");
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
