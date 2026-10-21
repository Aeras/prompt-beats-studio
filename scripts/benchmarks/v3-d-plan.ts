import { D_BRIEFS, dBriefInput } from "./v3-d-fixtures";
import { BASELINE_SHA, hash, loadSources } from "./v3-source";

/** D-only immutable, offline manifest. Deliberately no transport or paid runner. */
export function makeDPlan() {
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
      outputCap: source.openAiOutputBudget(call),
      call,
    };
  });
  const fingerprint = hash(
    JSON.stringify({
      series: "PB-V3-D-MULTILINGUAL-15",
      baseline: BASELINE_SHA,
      sourceHash: source.sourceHash,
      fixtures: D_BRIEFS,
      jobs: jobs.map(({ call, ...job }) => job),
    }),
  );
  return {
    series: "PB-V3-D-MULTILINGUAL-15",
    baselineSha: BASELINE_SHA,
    fingerprint,
    totalJobs: jobs.length,
    modelCalls: 0,
    readyForPaidExecution: false,
    languages: ["Russian", "Greek", "English", "Spanish", "French"],
    jobs,
  };
}
