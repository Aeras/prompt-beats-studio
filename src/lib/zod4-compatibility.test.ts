import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { durableQualityCheckInput, qualityReportSchema } from "./quality-check-job-schema";
import * as universe from "./song-universe.shared";
import { songBlueprintSchema } from "./song-blueprint.shared";
import { generatorInputSnapshotSchema } from "./generator-revision.shared";
import { AI_TARGET_PLATFORMS, DEFAULT_AI_TARGET_PLATFORM } from "./ai-target-platforms";
import { getSafeExternalUrl } from "./safe-external-url";
import {
  compatibleUtcDateTimePattern,
  compatibleOffsetDateTimePattern,
} from "./validation-datetime";

// Evaluate the real input declarations without importing server handlers, auth,
// database clients or providers. No network or synthetic replacement schemas.
function declaration(path: string, names: string[]) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  return names
    .map((name) => {
      for (const node of source.statements) {
        if (!ts.isVariableStatement(node)) continue;
        const item = node.declarationList.declarations.find(
          (entry) => entry.name.getText(source) === name,
        );
        if (item) return `const ${item.getText(source)};`;
      }
      throw new Error(`Missing production validator: ${name}`);
    })
    .join("\n");
}

function evaluate<T>(source: string, bindings: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, z, ...bindings });
  return exports as T;
}

const legacyId = "11111111-1111-1111-1111-111111111111";
const generation = evaluate<{ schema: z.ZodType<Record<string, unknown>> }>(
  `${declaration("src/lib/generation-jobs.functions.ts", ["jobInput"])}\nexports.schema = jobInput;`,
  {
    AI_TARGET_PLATFORMS,
    DEFAULT_AI_TARGET_PLATFORM,
    songBlueprintSchema,
    generatorInputSnapshotSchema,
  },
).schema;
const createUniverse = evaluate<{ schema: z.ZodType<Record<string, unknown>> }>(
  `${declaration("src/lib/song-universe.functions.ts", ["createSchema"])}\nexports.schema = createSchema;`,
  universe,
).schema;
const profile = evaluate<{ schema: z.ZodType<Record<string, unknown>> }>(
  `${declaration("src/lib/profile.functions.ts", ["optionalUrl", "profileInput"])}\nexports.schema = profileInput;`,
  { getSafeExternalUrl },
).schema;

describe("Zod 4 security and persisted validation compatibility", () => {
  test("oversized bounded collections are rejected before parsing their elements", () => {
    let parsed = 0;
    const element = z.unknown().transform((value) => {
      parsed += 1;
      return value;
    });
    expect(z.array(element).max(1).safeParse(["a", "b"]).success).toBe(false);
    expect(
      z
        .set(element)
        .max(1)
        .safeParse(new Set(["a", "b"])).success,
    ).toBe(false);
    expect(parsed).toBe(0);
  });

  test("Generator retains accepted identifiers, defaults, stripping and bounds", () => {
    const input = {
      idempotencyKey: legacyId,
      theme: " A song ",
      genre: " Pop ",
      mood: " Warm ",
      language: " el ",
      unknown: "discard",
    };
    const result = generation.parse(input);
    expect(result).toMatchObject({
      idempotencyKey: legacyId,
      theme: "A song",
      genre: "Pop",
      promptVersion: "v1",
      operation: "generate",
      production: "",
    });
    expect(result).not.toHaveProperty("unknown");
    expect(generation.safeParse({ ...input, idempotencyKey: "invalid" }).success).toBe(false);
    expect(generation.safeParse({ ...input, theme: "x".repeat(2001) }).success).toBe(false);
  });

  test("Quality Check preserves text, nullish transforms and score limits", () => {
    const result = {
      title: " Τίτλος ",
      tags: " Pop ",
      lyrics: " Στίχοι\nδεύτερη γραμμή ",
      note: " Note ",
    };
    const input = durableQualityCheckInput.parse({
      theme: "Theme",
      genre: "Pop",
      mood: "Warm",
      language: "el",
      generationId: legacyId,
      result,
    });
    expect(input.result.lyrics).toBe("Στίχοι\nδεύτερη γραμμή");
    expect(input.qualityCheckVersion).toBe("v1");
    const report = {
      passed: true,
      score: 9,
      issues: [],
      languageIssues: [],
      grammarIssues: [],
      singabilityIssues: [],
      genreIssues: [],
      consistencyIssues: [],
      corrections: null,
    };
    expect(qualityReportSchema.parse(report)).toMatchObject({
      corrections: [],
      creativeSuggestions: [],
      vocalSuggestions: [],
      productionSuggestions: [],
    });
    expect(qualityReportSchema.safeParse({ ...report, score: 11 }).success).toBe(false);
    expect(
      qualityReportSchema.safeParse({ ...report, issues: Array(31).fill("issue") }).success,
    ).toBe(false);
    const invalid = qualityReportSchema.safeParse({ ...report, score: "9" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error).toBeInstanceOf(z.ZodError);
      expect(invalid.error.issues[0]?.path).toEqual(["score"]);
    }
  });

  test("Song Universe omitted story bible is parsed into its nested defaults", () => {
    const result = createUniverse.parse({ title: " Universe " });
    expect(result["title"]).toBe("Universe");
    expect(result["storyBible"]).toEqual(universe.songUniverseStoryBibleSchema.parse({}));
    expect(result).toMatchObject({
      universeType: "other",
      plannerContrast: "balanced",
      plannedTrackCount: null,
    });
  });

  test("profile preprocessing preserves blank/null and rejects unsafe URLs", () => {
    expect(profile.parse({ website_url: "  " })).toMatchObject({
      website_url: null,
      profile_completed: false,
    });
    expect(profile.parse({ website_url: " https://example.com/path " })["website_url"]).toBe(
      "https://example.com/path",
    );
    expect(profile.safeParse({ website_url: "javascript:alert(1)" }).success).toBe(false);
    expect(profile.safeParse({ instagram_url: "https://example.com/" }).success).toBe(false);
  });

  test("billing still accepts only the server-approved plan and rejects arbitrary prices", () => {
    const path = "src/lib/stripe.functions.ts";
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    let validator = "";
    function visit(node: ts.Node) {
      if (
        !validator &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "inputValidator"
      ) {
        validator = node.arguments[0]?.getText(source) ?? "";
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (!validator) throw new Error("Missing Checkout validator");
    const parse = evaluate<{ parse: (input: unknown) => unknown }>(
      `exports.parse = ${validator};`,
      {},
    ).parse;
    expect(parse({ plan: "pro", checkoutAttemptId: legacyId })).toEqual({
      plan: "pro",
      checkoutAttemptId: legacyId,
    });
    expect(() => parse({ plan: "pro", checkoutAttemptId: legacyId, price: 1 })).toThrow();
    expect(() => parse({ plan: "admin", checkoutAttemptId: legacyId })).toThrow();
  });

  test("persisted UTC and offset timestamps retain the prior calendar grammar", () => {
    const utc = z.string().regex(compatibleUtcDateTimePattern);
    const offset = z.string().regex(compatibleOffsetDateTimePattern);
    for (const value of ["2024-02-29T12:30Z", "2026-10-24T12:30:45.123456Z"]) {
      expect(utc.parse(value)).toBe(value);
      expect(offset.parse(value)).toBe(value);
    }
    for (const value of ["2026-10-24T12:30+0200", "2026-10-24T12:30:45+02:00"]) {
      expect(offset.parse(value)).toBe(value);
      expect(utc.safeParse(value).success).toBe(false);
    }
    for (const value of [
      "2023-02-29T12:30Z",
      "2026-04-31T12:30Z",
      "2026-10-24T24:00Z",
      "2026-10-24T12:60Z",
      "2026-10-24T12:30",
    ]) {
      expect(utc.safeParse(value).success).toBe(false);
      expect(offset.safeParse(value).success).toBe(false);
    }
  });
});
