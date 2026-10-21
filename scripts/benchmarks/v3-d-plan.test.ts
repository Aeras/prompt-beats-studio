import { describe, expect, test } from "bun:test";
import { D_BRIEFS } from "./v3-d-fixtures";
import { makeDPlan } from "./v3-d-plan";
import { withV3MusicalPlanning } from "../../src/lib/advanced-generator-v3-review";

describe("candidate D multilingual frozen design", () => {
  test("only one candidate and exactly three jobs per language, 15 total", () => {
    expect(D_BRIEFS).toHaveLength(15);
    const groups = ["Russian", "Greek", "English", "Spanish", "French"];
    for (const language of groups) {
      expect(D_BRIEFS.filter((brief) => brief.language === language)).toHaveLength(3);
    }
    expect(new Set(D_BRIEFS.map((brief) => brief.id)).size).toBe(15);
    expect(D_BRIEFS.map((brief) => brief.id).slice(0, 3)).toEqual([
      "ru-pop",
      "ru-ballad",
      "ru-hook",
    ]);
  });

  test("D retains rhyme intent but not A+B/C-only prompt blocks", () => {
    const result = withV3MusicalPlanning("SOURCE", "d");
    expect(result).toContain("RHYME INTENT (V3)");
    expect(result).toContain("PHONETIC RHYME, VOCAL FLOW & SECTION DYNAMICS");
    expect(result).not.toContain("For sections where rhyme serves the brief, silently consider");
    expect(result).not.toContain("LANGUAGE-FIRST QUALITY (V3-C)");
    expect(result).toContain("Never add or remove sections");
    expect(result).toContain("never rules copied from another language");
  });

  test("manifest contains exclusively D, no paid requests, no repeated IDs", () => {
    const plan = makeDPlan();
    expect(plan.totalJobs).toBe(15);
    expect(plan.modelCalls).toBe(0);
    expect(plan.readyForPaidExecution).toBe(false);
    expect(new Set(plan.jobs.map((job) => job.id)).size).toBe(15);
    expect(new Set(plan.jobs.map((job) => job.blindId)).size).toBe(15);
    expect(new Set(plan.jobs.map((job) => job.promptHash)).size).toBe(15);
    expect(plan.jobs.every((job) => job.arm === "d")).toBe(true);
    expect(plan.jobs.every((job) => job.call.prompt.includes("PHONETIC RHYME"))).toBe(true);
    expect(plan.fingerprint).toBe(makeDPlan().fingerprint);
  });
});
