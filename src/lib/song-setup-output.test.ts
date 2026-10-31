import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { parseSongSetupOutput, songSetupOutputMessage } from "./song-setup-output.shared";

const source = readFileSync("src/lib/song-setup-assistant.functions.ts", "utf8");
const ast = ts.createSourceFile("setup.ts", source, ts.ScriptTarget.Latest, true);
const schemaCode = ast.statements
  .filter(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) =>
          ts.isIdentifier(d.name) &&
          [
            "songSetupDraftSchema",
            "adminSongSetupDraftSchema",
            "superAdminSongSetupDraftSchema",
          ].includes(d.name.text),
      ),
  )
  .map((n) => n.getText(ast))
  .join("\n");
const schemas: any = {};
runInNewContext(
  ts.transpileModule(
    schemaCode +
      "\nObject.assign(exports,{songSetupDraftSchema,adminSongSetupDraftSchema,superAdminSongSetupDraftSchema});",
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  { exports: schemas, z },
);
const canonical = {
  theme: "An original reunion story",
  musicStyle: "Pop, Rock",
  mood: "Warm, Hopeful",
  instruments: "Guitar, Bass",
  bpm: "104",
  songStructure: "Verse → Chorus",
  productionStyle: "Clear spacious mix",
  additionalInstructions: "Original song; preserve the brief.",
  language: "English",
};
const labeled = {
  Theme: canonical.theme,
  "Music Style": ["Pop", "Rock"],
  Mood: ["Warm", "Hopeful"],
  Instruments: ["Guitar", "Bass"],
  BPM: 104,
  "Song Structure": canonical.songStructure,
  "Production Style": canonical.productionStyle,
  "Additional Instructions": canonical.additionalInstructions,
  Language: canonical.language,
};
const receipt = (raw: unknown, stopReason = "end_turn") => ({
  text: JSON.stringify(raw),
  stopReason,
});
const parse = (raw: unknown, role = "songSetupDraftSchema") =>
  parseSongSetupOutput(receipt(raw), (x) => schemas[role].parse(x));

test("actual nine-field schemas reproduce observed display-label/list/numeric dialect without guessed content", () => {
  expect(schemas.songSetupDraftSchema.safeParse(labeled).success).toBe(false);
  expect(parse(labeled)).toEqual(canonical);
  expect(parse(canonical)).toEqual(canonical);
  expect(labeled.BPM).toBe(104);
  expect(labeled["Music Style"]).toEqual(["Pop", "Rock"]);
});
test("every missing required setup field is rejected, with no fill or alias guessing", () => {
  for (const key of Object.keys(canonical)) {
    const raw: any = { ...canonical };
    delete raw[key];
    expect(() => parse(raw)).toThrow("song_setup_output:invalid_schema");
  }
  for (const key of Object.keys(labeled)) {
    const raw: any = { ...labeled };
    delete raw[key];
    expect(() => parse(raw)).toThrow("song_setup_output:invalid_schema");
  }
  for (const raw of [
    { setup: canonical },
    { ...canonical, extra: "untrusted" },
    { ...labeled, Theme: undefined },
    { ...labeled, BPM: undefined, bpm: "104" },
    { ...canonical, mood: ["Warm"] },
    { ...labeled, Mood: ["Warm", null] },
    { ...labeled, Mood: [] },
    [],
    null,
  ])
    expect(() => parse(raw)).toThrow("song_setup_output:invalid_schema");
});
test("role ceilings remain enforced after exact-key projection", () => {
  const raw = { ...labeled, Theme: "x".repeat(550) };
  expect(() => parse(raw)).toThrow("song_setup_output:invalid_schema");
  expect(parse(raw, "adminSongSetupDraftSchema").theme).toHaveLength(550);
  expect(parse(raw, "superAdminSongSetupDraftSchema").theme).toHaveLength(550);
  expect(() =>
    parse({ ...raw, "Production Style": "x".repeat(2001) }, "adminSongSetupDraftSchema"),
  ).toThrow();
  expect(
    parse({ ...raw, "Production Style": "x".repeat(2001) }, "superAdminSongSetupDraftSchema")
      .productionStyle,
  ).toHaveLength(2001);
});
test("invalid JSON, valid-but-incomplete output and invalid BPM never become a setup", () => {
  for (const stop of ["max_tokens", "unknown", "tool_use"]) {
    expect(() =>
      parseSongSetupOutput({ text: JSON.stringify(canonical), stopReason: stop }, (x) =>
        schemas.songSetupDraftSchema.parse(x),
      ),
    ).toThrow("song_setup_output:incomplete");
  }
  expect(() =>
    parseSongSetupOutput({ text: "SECRET invalid", stopReason: "end_turn" }, (x) =>
      schemas.songSetupDraftSchema.parse(x),
    ),
  ).toThrow("song_setup_output:invalid_json");
  for (const bpm of [0, 39, 261, 104.5])
    expect(() => parse({ ...labeled, BPM: bpm })).toThrow("song_setup_output:invalid_bpm");
  expect(parse({ ...canonical, bpm: "Auto" }).bpm).toBe("Auto");
});
test("safe output diagnostics are localized and never contain provider bodies/Zod payloads", () => {
  for (const code of ["incomplete", "invalid_json", "invalid_schema", "invalid_bpm"]) {
    const e = new Error("song_setup_output:" + code);
    expect(songSetupOutputMessage(e, "el")).toBeTruthy();
    expect(songSetupOutputMessage(e, "en")).toBeTruthy();
    expect(songSetupOutputMessage(e, "el")).not.toBe(songSetupOutputMessage(e, "en"));
  }
  expect(songSetupOutputMessage(new Error("SECRET raw provider body"), "el")).toBeNull();
});

function compile(file: string, requireMock: (key: string) => unknown) {
  const exports: any = {};
  runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, require: requireMock, console, Error, Object, Number, JSON, Array, Promise },
  );
  return exports;
}
function handlerFixture(raw: unknown, stopReason = "end_turn") {
  let status = "claimed",
    saved: any = null,
    denied = false,
    calls = 0,
    started = 0;
  const usage = new Map();
  const inputs: any[] = [];
  const events: string[] = [];
  const auxiliary = compile("src/lib/ai-auxiliary-idempotency.server.ts", (key) => {
    if (key === "zod") return { z };
    if (key.includes("global-ai-usage"))
      return {
        withFeatureAiDispatchAdmission: async (_userId: string, _keys: string[], fn: any) => fn(),
        AiUsageUnavailableError: Error,
      };
    if (key.includes("ai-feature-access"))
      return { featureKeysForAuxiliaryAiOperation: () => ["ai_generator", "song_setup_assistant"] };
    if (key.includes("ai-auxiliary-model-context"))
      return {
        auxiliaryModelContext: { run: async (_context: any, fn: any) => fn() },
        startAuxiliaryModel: async () => {
          started++;
        },
      };
    if (key.includes("ai-finalization"))
      return {
        completeAuxiliaryAiRequest: async (x: any) => {
          status = "completed";
          saved = x.result;
        },
        failAuxiliaryAiRequest: async (x: any) => {
          status = "failed";
          saved = x.errorMessage;
        },
      };
    throw Error("Unexpected auxiliary import " + key);
  });
  const caller: any = async (input: any) => {
    calls++;
    inputs.push(input);
    return {
      text: JSON.stringify(raw),
      stopReason,
      provider: "openrouter",
      model: "openai/gpt-6.1-sol",
      usage: { inputTokens: 1862, outputTokens: 653, totalTokens: 2515 },
    };
  };
  caller.executionId = "46800000-0000-4000-8000-000000000001";
  const module = compile("src/lib/song-setup-assistant.functions.ts", (key) => {
    if (key === "zod") return { z };
    if (key === "@tanstack/react-start")
      return {
        createServerFn: () => ({
          middleware() {
            return this;
          },
          inputValidator() {
            return this;
          },
          handler(fn: any) {
            return fn;
          },
        }),
      };
    if (key.includes("auth-middleware")) return { requireSupabaseAuth: {} };
    if (key.includes("feature-access.functions"))
      return {
        requireFeatureAccess: async () => {
          if (denied) throw Error("denied");
        },
      };
    if (key.includes("generator-options"))
      return Object.fromEntries(
        [
          "ADVANCED_MOODS",
          "ADVANCED_MUSIC_STYLES",
          "BPM_OPTIONS",
          "INSTRUMENTS",
          "SONG_LANGUAGES",
          "SONG_STRUCTURE_TAGS",
        ].map((k) => [k, [{ value: "Offline" }]]),
      );
    if (key.includes("ai-target-platforms")) return { AI_TARGET_PLATFORMS: ["suno", "udio"] };
    if (key.includes("ai-auxiliary-idempotency")) return auxiliary;
    if (key.includes("song-setup-role"))
      return { getSongSetupRoleFlags: async () => ({ isAdminLevel: true, isSuperAdmin: true }) };
    if (key.includes("song-setup-output")) return { parseSongSetupOutput };
    if (key.includes("ai-provider.server"))
      return {
        resolveAiModelForUser: async () => ({
          model: "openai/gpt-6.1-sol",
          provider: "openrouter",
        }),
        modelCaller: () => caller,
      };
    if (key.includes("ai-usage.server"))
      return {
        recordAiUsage: async (x: any) => {
          events.push("usage");
          usage.set(x.executionId, x);
        },
      };
    throw Error("Unexpected setup import " + key);
  });
  const invoke = () =>
    module.generateSongSetup({
      data: {
        description: "Synthetic original music brief",
        targetPlatform: "suno",
        requestKey: "46800000-0000-4000-8000-000000000002",
      },
      context: {
        userId: "offline-owner",
        supabase: {
          rpc: async () => ({
            data: {
              status,
              ...(status === "claimed"
                ? { executionToken: "46800000-0000-4000-8000-000000000003" }
                : status === "completed"
                  ? { result: saved }
                  : status === "failed"
                    ? { error: saved }
                    : {}),
            },
            error: null,
          }),
        },
      },
    });
  return {
    invoke,
    usage,
    inputs,
    events,
    get calls() {
      return calls;
    },
    get started() {
      return started;
    },
    deny: () => {
      denied = true;
    },
  };
}
test("actual Setup handler sends explicit contract/JSON-object output and cached replay does not pay again", async () => {
  const f = handlerFixture(labeled);
  const result = await f.invoke();
  expect(result.setup).toEqual(canonical);
  expect(await f.invoke()).toEqual(result);
  expect(f.calls).toBe(1);
  expect(f.started).toBe(1);
  expect(f.usage.size).toBe(1);
  expect(f.inputs[0].jsonObjectOutput).toBe(true);
  expect(f.inputs[0].prompt).toContain('"musicStyle"');
  expect(f.inputs[0].schema.required).toHaveLength(9);
});
test("actual Setup handler accounts rejected/incomplete output once and never redispatches a failed request", async () => {
  for (const [raw, stop] of [
    [{}, "end_turn"],
    [labeled, "max_tokens"],
  ] as const) {
    const f = handlerFixture(raw, stop);
    await expect(f.invoke()).rejects.toThrow("song_setup_output:");
    expect(f.usage.size).toBe(1);
    await expect(f.invoke()).rejects.toThrow("song_setup_output:");
    expect(f.calls).toBe(1);
    expect(f.started).toBe(1);
    expect([...f.usage.values()][0].usage.inputTokens).toBe(1862);
  }
  const f = handlerFixture(canonical);
  f.deny();
  await expect(f.invoke()).rejects.toThrow("denied");
  expect(f.calls).toBe(0);
  expect(f.started).toBe(0);
});
