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
    expect(durableQualityCheckInput.parse({ ...song, qualityCheckVersion: "v2" }).qualityCheckVersion).toBe("v2");
    expect(durableQualityCheckInput.safeParse({ ...song, qualityCheckVersion: "v3" }).success).toBe(false);
  });

  test("super-admin authorization is checked on admission and again in the worker", () => {
    const admission = readFileSync("src/lib/quality-check-jobs.functions.ts", "utf8");
    const worker = readFileSync("src/lib/quality-check-jobs.server.ts", "utf8");
    expect(admission).toContain('data.qualityCheckVersion === "v2"');
    expect(admission).toContain('"current_user_is_super_admin"');
    expect(worker).toContain('payload.qualityCheckVersion === "v2"');
    expect(worker).toContain('.from("user_roles")');
    expect(worker).toContain('.eq("role", "super_admin")');
  });

  test("the existing V1 prompt remains unchanged and V2 has a separate prompt", () => {
    const core = readFileSync("src/lib/quality-check-core.server.ts", "utf8");
    expect(core).toContain("const QUALITY_SYSTEM_PROMPT =");
    expect(core).toContain("const QUALITY_V2_SYSTEM_PROMPT =");
    expect(core).toContain('data.qualityCheckVersion === "v2" ? QUALITY_V2_SYSTEM_PROMPT : QUALITY_SYSTEM_PROMPT');
  });
});
