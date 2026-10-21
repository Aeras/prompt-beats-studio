import { readFileSync } from "node:fs";
import type { Evidence } from "./v3-benchmark";
import { D_BRIEFS, dBriefInput } from "./v3-d-fixtures";
import { BASELINE_SHA, hash, loadSources } from "./v3-source";

/** D-only immutable, offline manifest. Deliberately no transport or paid runner. */
export function makeDPlan(evidence?: Evidence) {
  const source = loadSources();
  const jobs = D_BRIEFS.map((brief) => {
    const prompt = source.dPrompt(dBriefInput(brief));
    const id = `${brief.id}-d-1`;
    const call = {
      system: source.SYSTEM_PROMPT,
      prompt,
      schema: source.SONG_SCHEMA,
      reasoningEffort: "medium",
      maxTokens: 8192,
    };
    const outputCap = source.openAiOutputBudget(call);
    const inputBytes = Buffer.byteLength(
      JSON.stringify({ instructions: call.system, input: prompt, text: call.schema }),
      "utf8",
    );
    if (
      evidence &&
      (outputCap > evidence.maxOutputTokens ||
        inputBytes + 4096 > Math.min(evidence.maxInputTokens, evidence.standardInputTokenCeiling))
    ) throw new Error("MODEL_TOKEN_LIMIT_UNVERIFIED");
    const upperMicroUsd = evidence
      ? Math.ceil(
          evidence.maxInputTokens *
            Math.max(
              evidence.registry.inputPricePerMillion,
              evidence.registry.cachedInputPricePerMillion ?? 0,
              evidence.registry.cacheWritePricePerMillion ?? 0,
            ),
        ) + Math.ceil(outputCap * evidence.registry.outputPricePerMillion)
      : null;
    return {
      id,
      blindId: hash(`pb-v3d-blind-v1:${id}`).slice(0, 20),
      language: brief.language,
      brief: brief.id,
      arm: "d" as const,
      run: 1,
      promptHash: hash(prompt),
      systemHash: hash(call.system),
      schemaHash: hash(JSON.stringify(call.schema)),
      outputCap,
      inputBytes,
      upperMicroUsd,
      call,
    };
  });
  const fingerprint = hash(
    JSON.stringify({
      series: "PB-V3-D-MULTILINGUAL-15",
      baseline: BASELINE_SHA,
      sourceHash: source.sourceHash,
      fixtures: D_BRIEFS,
      dPlannerSource: hash(readFileSync("scripts/benchmarks/v3-d-plan.ts", "utf8")),
      jobs: jobs.map(({ call, ...job }) => job),
    }),
  );
  return {
    series: "PB-V3-D-MULTILINGUAL-15",
    baselineSha: BASELINE_SHA,
    fingerprint,
    totalJobs: jobs.length,
    modelCalls: 0,
    readyForPaidExecution: Boolean(evidence),
    source,
    evidence,
    languages: ["Russian", "Greek", "English", "Spanish", "French"],
    jobs,
  };
}

export type DPlan = ReturnType<typeof makeDPlan>;
