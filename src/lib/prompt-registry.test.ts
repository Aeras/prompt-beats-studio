import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as registry from "./prompt-registry.shared";
import * as v4 from "./advanced-generator-prompt-v4-beta";
import {
  decodePromptImport,
  validatePromptTemplate,
  PROMPT_PLACEHOLDERS,
  PROMPT_MAX_BYTES,
  promptBindingSchema,
} from "./prompt-registry.shared";
import { buildRegistryPrompt } from "./prompt-registry.server";
const content = readFileSync(
  "docs/prompts/PromptBeats_V5_BETA_2_Master_Prompt_CANDIDATE.md",
  "utf8",
);
const input = {
  theme: "Νύχτα {{MOOD}} $&",
  genre: "Folk",
  mood: "Warm",
  language: "Greek",
  targetPlatform: "udio",
};
test("V5 BETA 2 source is exact UTF-8, validated once per placeholder and not active by import", () => {
  expect(Buffer.byteLength(content)).toBe(32037);
  const migration = readFileSync(
    "supabase/migrations/20261030195702_secure_generator_prompt_registry.sql",
    "utf8",
  );
  expect(migration.split("$pbv5$")[1]).toBe(content);
  expect(createHash("sha256").update(content).digest("hex")).toBe(
    "a11f730796ce81fc9653b87a509e41e01ce2b97280a3d74bfd6a3c43d81dae7a",
  );
  expect(decodePromptImport("candidate.md", new TextEncoder().encode(content))).toBe(content);
  for (const key of PROMPT_PLACEHOLDERS) expect(content.split(`{{${key}}}`).length).toBe(2);
  const built = buildRegistryPrompt(content, input);
  expect(built).toContain(input.theme);
  expect(built).toContain("udio");
  expect(built).not.toContain("{{SONG_BLUEPRINT}}");
});
test("malformed UTF-8, executable file types, paths, controls, missing/duplicate/unknown placeholders and bad output shapes reject", () => {
  for (const name of ["../a.md", "a.js", "a.sql", "a.md.exe", "folder/a.txt"])
    expect(() => decodePromptImport(name, new TextEncoder().encode(content))).toThrow();
  expect(() => decodePromptImport("a.md", new Uint8Array([0xc3, 0x28]))).toThrow();
  for (const value of [
    content + "\0",
    content + "{{MOOD}}",
    content.replace("{{MOOD}}", "{{UNKNOWN}}"),
    content.replace('"lyrics":', '"other":'),
    "x".repeat(PROMPT_MAX_BYTES + 1),
  ])
    expect(() => validatePromptTemplate(value)).toThrow();
});
test("registry content is absent from browser-safe shared contracts and binding cannot carry arbitrary body", () => {
  const shared = readFileSync("src/lib/prompt-registry.shared.ts", "utf8");
  expect(shared).not.toContain(".template");
  expect(shared).not.toContain("buildAdvancedGeneratorPrompt");
  expect(
    promptBindingSchema.safeParse({
      id: crypto.randomUUID(),
      label: "test",
      digest: "a".repeat(64),
      experimental: false,
      content,
    }).success,
  ).toBe(false);
});
test("source contract and runtime leave revisions, usage and one-call substitution independent", () => {
  const source = readFileSync("src/lib/ai.functions.ts", "utf8");
  expect(source).toContain("isRevision\n");
  expect(
    buildRegistryPrompt(content, { ...input, targetPlatform: "suno", structure: "Verse → Chorus" }),
  ).toContain("Verse → Chorus");
  const migration = readFileSync(
    "supabase/migrations/20261030195702_secure_generator_prompt_registry.sql",
    "utf8",
  );
  expect(migration).toContain("ON DELETE RESTRICT");
  expect(migration).not.toContain("ON DELETE CASCADE");
  expect(migration).toContain("immutable prompt binding");
});

test("actual server resolver verifies durable owner-bound receipt and exact content hash, without provider dispatch", async () => {
  const binding = {
    id: "af580000-0000-4000-8000-000000000001",
    digest: createHash("sha256").update(content).digest("hex"),
    label: "Candidate",
    experimental: false,
  };
  let data: any = { ...binding, content };
  let error: unknown = null;
  const calls: any[] = [];
  const exports: any = {};
  const code = ts.transpileModule(readFileSync("src/lib/prompt-registry.server.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports,
    crypto,
    TextEncoder,
    Uint8Array,
    require: (name: string) => {
      if (name.includes("prompt-registry.shared")) return registry;
      if (name.includes("advanced-generator-prompt-v4-beta")) return v4;
      if (name.includes("client.server"))
        return {
          supabaseAdmin: {
            rpc: async (name: string, args: unknown) => {
              calls.push({ name, args });
              return { data, error };
            },
          },
        };
      throw new Error("Unexpected import; no providers allowed");
    },
  });
  const run = () => exports.resolveBoundRegistryPrompt(binding, input, "owner", "job");
  expect(await run()).toContain(input.theme);
  expect(calls[0]).toEqual({
    name: "generator_prompt_for_job_internal",
    args: { _user_id: "owner", _job_id: "job" },
  });
  for (const bad of [
    null,
    { ...binding, content: content + "changed" },
    { ...binding, id: crypto.randomUUID(), content },
    { ...binding, digest: "0".repeat(64), content },
  ]) {
    data = bad;
    await expect(run()).rejects.toThrow();
  }
  data = { ...binding, content };
  error = { code: "offline" };
  await expect(run()).rejects.toThrow();
  await expect(exports.resolveBoundRegistryPrompt(binding, input, "owner")).rejects.toThrow(
    "durable prompt binding",
  );
});
