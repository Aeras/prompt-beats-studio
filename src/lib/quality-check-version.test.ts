import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { durableQualityCheckInput } from "./quality-check-job-schema";

const song = {
  targetPlatform: "suno" as const,
  theme: "Real-life story",
  genre: "Pop",
  mood: "Warm",
  language: "Greek",
  result: {
    title: "Example",
    tags: "Pop",
    lyrics: "[Verse]\nΚάποιος στίχος",
    note: "Soft",
  },
};

describe("Quality Check version isolation", () => {
  test("missing version remains V1 for every existing caller", () => {
    expect(durableQualityCheckInput.parse(song).qualityCheckVersion).toBe("v1");
    expect(
      durableQualityCheckInput.parse({ ...song, qualityCheckVersion: "v2" }).qualityCheckVersion,
    ).toBe("v2");
    expect(
      durableQualityCheckInput.parse({ ...song, qualityCheckVersion: "v2.1" }).qualityCheckVersion,
    ).toBe("v2.1");
    expect(durableQualityCheckInput.safeParse({ ...song, qualityCheckVersion: "v3" }).success).toBe(
      false,
    );
  });

  test("super-admin authorization is checked on admission and again in the worker", () => {
    const admission = readFileSync("src/lib/quality-check-jobs.functions.ts", "utf8");
    const worker = readFileSync("src/lib/quality-check-jobs.server.ts", "utf8");
    expect(admission).toContain('data.qualityCheckVersion !== "v1"');
    expect(admission).toContain('"current_user_is_super_admin"');
    expect(worker).toContain('payload.qualityCheckVersion !== "v1"');
    expect(worker).toContain('.from("user_roles")');
    expect(worker).toContain('.eq("role", "super_admin")');
  });

  test("the generator UI preserves all three selectable QC versions", () => {
    const ui = readFileSync("src/routes/generate.tsx", "utf8");
    expect(ui).toContain('option value="v2.1"');
    expect(ui).toContain('selected === "v2.1"');
    expect(ui).toContain("onQualityCheckVersionChange(selected)");
    expect(ui).not.toContain('e.target.value === "v2" ? "v2" : "v1"');
  });

  test("V1 and V2 prompts remain available alongside an independent V2.1 prompt", () => {
    const core = readFileSync("src/lib/quality-check-core.server.ts", "utf8");
    expect(core).toContain("const QUALITY_SYSTEM_PROMPT =");
    expect(core).toContain("const QUALITY_V2_SYSTEM_PROMPT =");
    expect(core).toContain("const QUALITY_V21_SYSTEM_PROMPT =");
    expect(core).toContain('data.qualityCheckVersion === "v2.1"');
    expect(core).toContain('data.qualityCheckVersion === "v2"');
    expect(core).toContain("QUALITY_V21_SYSTEM_PROMPT");
  });
});
