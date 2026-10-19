import { describe, expect, test } from "bun:test";
import { buildAdvancedGeneratorPromptV2 } from "./advanced-generator-prompt-v2";
import { buildAdvancedGeneratorPromptV3 } from "./advanced-generator-prompt-v3";
import { readFile } from "node:fs/promises";

const base = [
  "USER INPUTS — AUTHORITATIVE:",
  "==================================================",
  "CREATIVE PRIORITY",
  "==================================================",
  "Original instruction.",
  "==================================================",
  "PROFESSIONAL CREATIVE DIRECTION",
  "==================================================",
  "Preserve the song identity.",
].join("\n");

describe("Experimental Advanced Generator V3", () => {
  test("retains V2 blueprint rules and adds adaptive singability guidance only in V3", () => {
    const v2 = buildAdvancedGeneratorPromptV2(base);
    const v3 = buildAdvancedGeneratorPromptV3(base);
    expect(v3).toContain("V2 CREATIVE AUTHORITY");
    expect(v3).toContain("V3 ADAPTIVE SINGABILITY");
    expect(v3).toContain("half-time vs double-time");
    expect(v3).toContain("SOFT diagnostic signals");
    expect(v3).toContain("same generation call");
    expect(v3).toContain("EVERY requested language");
    expect(v3).toContain("LANGUAGE-NATIVE NATURALNESS");
    expect(v3).toContain("native-language");
    expect(v3).toContain("choose near-rhyme, assonance or no rhyme");
    expect(v3).not.toContain("natural spoken Greek (or the requested");
    expect(v3).toContain("section intended for relaxed or sustained singing");
    expect(v2).not.toContain("V3 ADAPTIVE SINGABILITY");
    expect(base).not.toContain("V3 ADAPTIVE SINGABILITY");
  });

  test("fails closed if prompt composition anchors drift", () => {
    expect(() => buildAdvancedGeneratorPromptV3("no anchors")).toThrow("anchors missing");
  });

  test("V3 is accessible only through Super Admin Advanced generation", async () => {
    const jobs = await readFile("src/lib/generation-jobs.functions.ts", "utf8");
    const route = await readFile("src/routes/generate.tsx", "utf8");
    const ai = await readFile("src/lib/ai.functions.ts", "utf8");
    expect(jobs).toContain('data.promptVersion === "v2" || data.promptVersion === "v3"');
    expect(jobs).toContain("isSuperAdmin !== true || !data.advanced || data.operation !==");
    expect(route).toContain(
      'advanced && !revisionMode && moderation.isSuperAdmin ? promptVersion : "v1"',
    );
    expect(route).toContain('<option value="v3">Prompt Version 3');
    expect(ai).toContain('data.promptVersion === "v3"');
    expect(ai).toContain("buildAdvancedGeneratorPromptV3(buildPrompt(data))");
  });
});
