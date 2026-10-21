import { describe, expect, test } from "bun:test";
import { D_BRIEFS } from "./v3-d-fixtures";
import { makeDPlan } from "./v3-d-plan";
import { execute, validateEvidence, type Ledger } from "./v3-benchmark";
import { parseArgs, D_PRIOR_EXPOSURE_MICRO_USD } from "./v3-runner";
import { withV3MusicalPlanning } from "../../src/lib/advanced-generator-v3-review";

describe("candidate D multilingual frozen design", () => {
  test("D-only mode is explicit and tracks cumulative prior conservative exposure", () => {
    expect(parseArgs(["--d-only"]).dOnly).toBe(true);
    expect(parseArgs([]).dOnly).toBe(false);
    expect(D_PRIOR_EXPOSURE_MICRO_USD).toBe(394662);
    expect(parseArgs(["--d-only", "--live", "--confirm-spend-usd", "3.00"]).dOnly).toBe(true);
    expect(() => parseArgs(["--d-only", "--recover-abandoned-job", "ru-pop-c-1"])).toThrow();
  });

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

  test("protected D-only pipeline completes mock pilot plus 14 calls with prior exposure", async () => {
    const evidence = validateEvidence({
      registry: {
        id: "00000000-0000-4000-8000-000000000001",
        provider: "openai",
        providerModelId: "gpt-5.6-luna",
        displayName: "GPT-5.6 Luna",
        status: "testing",
        generatorCompatible: true,
        generatorEnabled: true,
        generatorReasoningEffort: "medium",
        pricingCurrency: "USD",
        pricingStatus: "verified",
        inputPricePerMillion: 0.2,
        outputPricePerMillion: 1.2,
        cachedInputPricePerMillion: 0.02,
        cacheWritePricePerMillion: 0.25,
      },
      verifiedAt: new Date().toISOString(),
      modelSource: "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
      pricingSource: "https://developers.openai.com/api/docs/pricing",
      modelIdentityVerified: true,
      schemaSupported: true,
      reasoningBilledAsOutput: true,
      maxInputTokens: 131072,
      maxOutputTokens: 32768,
      standardInputTokenCeiling: 131072,
    });
    const plan = makeDPlan(evidence);
    const ledger: Ledger = { fingerprint: plan.fingerprint, entries: [] };
    let count = 0;
    const saved: string[] = [];
    const options = {
      live: true,
      confirmSpendUsd: "3.00",
      ci: false,
      apiKeyAvailable: true,
      priorExposureMicroUsd: D_PRIOR_EXPOSURE_MICRO_USD,
      call: async () => {
        count++;
        return {
          provider: "openai",
          model: "gpt-5.6-luna",
          stopReason: "end_turn",
          text: JSON.stringify({
            title: "Mock song",
            tags: "Melodic pop, 104 BPM",
            lyrics: "[Chorus]\\nMock sung line",
            note: "Offline-only mock",
          }),
          usage: {
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500,
            reasoningTokens: 100,
            cachedInputTokens: 0,
          },
        };
      },
      saveLedger: (_ledger: Ledger) => {},
      saveResult: (id: string) => {
        saved.push(id);
      },
    };
    await execute(plan, ledger, options);
    expect(count).toBe(1);
    expect(ledger.entries).toHaveLength(1);
    await execute(plan, ledger, { ...options, continuation: ledger.entries[0]!.resultHash! });
    expect(count).toBe(15);
    expect(ledger.entries).toHaveLength(15);
    expect(saved).toHaveLength(15);
    expect(new Set(saved).size).toBe(15);
    expect(ledger.entries.every((entry) => entry.state === "completed")).toBe(true);
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
