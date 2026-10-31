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
  test("retains the entire V2 prompt and adds only adaptive phrasing", () => {
    const v2 = buildAdvancedGeneratorPromptV2(base);
    const v3 = buildAdvancedGeneratorPromptV3(base);
    expect(v3.startsWith(v2)).toBe(true);
    expect(v3).toContain("ADAPTIVE MUSICAL PHRASING");
    expect(v3).toContain("COMPOSE, DO NOT POST-EDIT");
    expect(v3).not.toContain("V3 CONSERVATIVE SINGABILITY CHECK");
    expect(v2).not.toContain("ADAPTIVE MUSICAL PHRASING");
  });

  test("V3 stays Super Admin Advanced-only and single-pass", async () => {
    const jobs = await readFile("src/lib/generation-jobs.functions.ts", "utf8");
    const route = await readFile("src/routes/generate.tsx", "utf8");
    const ai = await readFile("src/lib/ai.functions.ts", "utf8");
    expect(jobs).toContain('data.promptVersion === "v2" || data.promptVersion === "v3"');
    expect(jobs).toContain("isSuperAdmin !== true || !data.advanced || data.operation !==");
    expect(route).toMatch(
      /revisionMode\s*\?\s*"v1"\s*:\s*advanced && moderation.isSuperAdmin\s*\?\s*promptVersion\s*:\s*"default"/,
    );
    expect(route).toMatch(/<option value="v3">\s*Prompt Version 3/);
    expect(ai).toContain('data.promptVersion === "v3"');
    expect(ai).toContain("withV3MusicalPlanning(");
    expect(ai).not.toContain("buildV3ReviewPrompt(");
  });
});
