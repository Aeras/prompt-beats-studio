import { z } from "zod";
import { BRIEFS } from "./v3-fixtures";
import type { DPlan } from "./v3-d-plan";
import { ARMS, BASELINE_SHA, hash, loadSources, type Call, type ProviderReply } from "./v3-source";

export const BUDGET_MICRO_USD = 3_000_000;
const officialUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["developers.openai.com", "platform.openai.com"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  });
// Sanitized, operator-verified export of EFFECTIVE installed model + pricing.
// No fallback-catalog rates or arbitrary CLI model overrides are accepted.
export const evidenceSchema = z
  .object({
    registry: z
      .object({
        id: z.string().uuid(),
        provider: z.literal("openai"),
        providerModelId: z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,239}$/),
        displayName: z.literal("GPT-5.6 Luna"),
        status: z.enum(["enabled", "testing"]),
        generatorCompatible: z.literal(true),
        generatorEnabled: z.literal(true),
        generatorReasoningEffort: z
          .enum(["none", "low", "medium", "high", "xhigh", "max"])
          .nullable(),
        pricingCurrency: z.literal("USD"),
        pricingStatus: z.literal("verified"),
        inputPricePerMillion: z.number().positive().max(10000),
        outputPricePerMillion: z.number().positive().max(10000),
        cachedInputPricePerMillion: z.number().nonnegative().max(10000).nullable(),
        cacheWritePricePerMillion: z.number().nonnegative().max(10000).nullable(),
      })
      .strict(),
    verifiedAt: z.string().datetime(),
    modelSource: officialUrl,
    pricingSource: officialUrl,
    modelIdentityVerified: z.literal(true),
    schemaSupported: z.literal(true),
    reasoningBilledAsOutput: z.literal(true),
    // Context reservation deliberately covers the FULL input window, not an
    // optimistic chars/4 estimate. Operator must verify limits in official docs.
    maxInputTokens: z.number().int().min(32768).max(2_000_000),
    maxOutputTokens: z.number().int().positive().max(2_000_000),
    standardInputTokenCeiling: z.number().int().positive().max(2_000_000),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;

export function validateEvidence(value: unknown, now = Date.now()): Evidence {
  const parsed = evidenceSchema.safeParse(value);
  if (!parsed.success) throw new Error("MODEL_OR_PRICING_UNVERIFIED");
  const age = now - Date.parse(parsed.data.verifiedAt);
  if (age < 0 || age > 24 * 60 * 60 * 1000) throw new Error("EVIDENCE_STALE");
  return parsed.data;
}

export function makePlan(evidence?: Evidence) {
  const source = loadSources();
  const reasoningEffort = evidence?.registry.generatorReasoningEffort ?? "medium";
  const jobs = BRIEFS.flatMap((brief) =>
    ARMS.flatMap((arm) =>
      [1, 2].map((run) => {
        const prompt = source.prompt(brief, arm);
        const call: Call = {
          system: source.SYSTEM_PROMPT,
          prompt,
          schema: source.SONG_SCHEMA,
          maxTokens: 8192,
          reasoningEffort,
        };
        const id = `${brief.id}-${arm}-${run}`;
        const outputCap = source.openAiOutputBudget(call);
        const inputBytes = Buffer.byteLength(
          JSON.stringify({ instructions: call.system, input: prompt, text: call.schema }),
          "utf8",
        );
        if (
          evidence &&
          (outputCap > evidence.maxOutputTokens ||
            inputBytes + 4096 >
              Math.min(evidence.maxInputTokens, evidence.standardInputTokenCeiling))
        )
          throw new Error("MODEL_TOKEN_LIMIT_UNVERIFIED");
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
          blindId: hash(`pb-v3-blind-v1:${id}`).slice(0, 20),
          brief: brief.id,
          arm,
          run,
          call,
          promptHash: hash(prompt),
          outputCap,
          inputBytes,
          upperMicroUsd,
        };
      }),
    ),
  );
  const fingerprint = hash(
    JSON.stringify({
      baseline: BASELINE_SHA,
      source: source.sourceHash,
      evidence: evidence ?? null,
      jobs: jobs.map(({ call, ...job }) => ({
        ...job,
        systemHash: hash(call.system),
        schemaHash: hash(JSON.stringify(call.schema)),
      })),
    }),
  );
  return { source, jobs, fingerprint, evidence };
}
export type Plan = ReturnType<typeof makePlan> | DPlan;
export type Job = Plan["jobs"][number];

export function dryRun(plan: Plan, _provider?: unknown) {
  // Deliberately has no transport, environment key, fetch or caller creation path.
  return {
    mode: "offline-dry-run",
    providerCalls: 0,
    spendUsd: 0,
    plannedGenerations: plan.jobs.length,
    fingerprint: plan.fingerprint,
    baselineSha: BASELINE_SHA,
    provider: "openai",
    requestedAppLabel: "gpt-5.6-luna",
    effectiveModel: plan.evidence?.registry.providerModelId ?? null,
    liveReady: Boolean(plan.evidence),
    blockers: plan.evidence
      ? []
      : ["Installed registry/model/pricing/limits not verified; paid execution blocked"],
    estimatedUpperUsd: plan.evidence
      ? plan.jobs.reduce((sum, job) => sum + (job.upperMicroUsd ?? 0), 0) / 1e6
      : null,
    budgetTargetUsd: 3,
    reportedBalanceUsd: 4.11,
    intendedReserveUsd: 1.11,
    caveat:
      "Local estimates/reservations are not a provider-enforced financial ceiling. All planned jobs may not fit; each call must pass remaining-budget guard.",
    jobs: plan.jobs.map(({ call, ...job }) => ({
      ...job,
      systemHash: hash(call.system),
      schemaHash: hash(JSON.stringify(call.schema)),
      reasoningEffort: call.reasoningEffort,
    })),
  };
}

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().nullish(),
  cacheWriteTokens: z.number().int().nonnegative().nullish(),
  reasoningTokens: z.number().int().nonnegative().nullish(),
});
export function meter(reply: ProviderReply, evidence: Evidence, job: Job) {
  const parsed = usageSchema.safeParse(reply.usage);
  if (!parsed.success) throw new Error("USAGE_MISSING_OR_INVALID");
  const u = parsed.data;
  if (
    u.totalTokens !== u.inputTokens + u.outputTokens ||
    (u.cachedInputTokens ?? 0) > u.inputTokens ||
    (u.reasoningTokens ?? 0) > u.outputTokens ||
    (u.cacheWriteTokens ?? 0) > u.inputTokens ||
    u.inputTokens > Math.min(evidence.maxInputTokens, evidence.standardInputTokenCeiling) ||
    u.outputTokens > job.outputCap
  )
    throw new Error("USAGE_INCONSISTENT");
  // Charge ALL input at highest applicable rate; never rely on cache discounts.
  // output_tokens already includes reasoning: record it but do not double-count.
  const inputRate = Math.max(
    evidence.registry.inputPricePerMillion,
    evidence.registry.cachedInputPricePerMillion ?? 0,
    evidence.registry.cacheWritePricePerMillion ?? 0,
  );
  return {
    usage: u,
    microUsd:
      Math.ceil(u.inputTokens * inputRate) +
      Math.ceil(u.outputTokens * evidence.registry.outputPricePerMillion),
  };
}

export const ledgerSchema = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    entries: z.array(
      z
        .object({
          id: z.string().regex(/^(?:ru-(pop|ballad|hook)-(current|a|a\+b|c)-[12]|(?:ru|el|en|es|fr)-(pop|ballad|hook)-d-1)$/),
          blindId: z.string().regex(/^[a-f0-9]{20}$/),
          state: z.enum(["reserved", "completed", "failed", "abandoned"]),
          reservedMicroUsd: z.number().int().nonnegative(),
          chargedMicroUsd: z.number().int().nonnegative().nullable(),
          resultHash: z.string().nullable(),
          error: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type Ledger = z.infer<typeof ledgerSchema>;

export async function execute(
  plan: Plan,
  ledger: Ledger,
  options: {
    live: boolean;
    confirmSpendUsd: string;
    ci: boolean;
    apiKeyAvailable: boolean;
    priorExposureMicroUsd?: number;
    continuation?: string;
    call: (model: string, request: Call) => Promise<ProviderReply>;
    saveLedger: (ledger: Ledger) => void;
    saveResult: (
      id: string,
      result: Record<string, unknown>,
      blind: { id: string; lyrics: string },
    ) => void;
    now?: () => number;
    saveFailure?: (id: string, result: Record<string, unknown>) => void;
  },
) {
  const now = options.now ?? Date.now;
  const priorExposureMicroUsd = options.priorExposureMicroUsd ?? 0;
  if (
    !Number.isSafeInteger(priorExposureMicroUsd) ||
    priorExposureMicroUsd < 0 ||
    priorExposureMicroUsd > BUDGET_MICRO_USD
  )
    throw new Error("PRIOR_EXPOSURE_INVALID");
  if (!options.live || options.confirmSpendUsd !== "3.00" || options.ci || !options.apiKeyAvailable)
    throw new Error("LIVE_AUTHORIZATION_REQUIRED");
  if (!plan.evidence) throw new Error("MODEL_OR_PRICING_UNVERIFIED");
  validateEvidence(plan.evidence, now());
  const evidence = plan.evidence;
  const checked = ledgerSchema.safeParse(ledger);
  if (
    !checked.success ||
    ledger.fingerprint !== plan.fingerprint ||
    new Set(ledger.entries.map((e) => e.id)).size !== ledger.entries.length ||
    ledger.entries.some((entry, index) => {
      const job = plan.jobs[index];
      return (
        !job ||
        job.id !== entry.id ||
        job.blindId !== entry.blindId ||
        job.upperMicroUsd !== entry.reservedMicroUsd ||
        (entry.chargedMicroUsd !== null && entry.chargedMicroUsd > entry.reservedMicroUsd) ||
        (entry.state === "abandoned" &&
          (entry.resultHash !== null ||
            entry.chargedMicroUsd !== null ||
            entry.error !== "MANUALLY_ABANDONED_UNCERTAIN_BILLING")) ||
        (entry.state === "completed" &&
          (entry.chargedMicroUsd === null ||
            !entry.resultHash ||
            !/^[a-f0-9]{64}$/.test(entry.resultHash) ||
            entry.error !== null))
      );
    })
  )
    throw new Error("LEDGER_MISMATCH");
  if (ledger.entries.some((entry) => entry.state !== "completed" && entry.state !== "abandoned"))
    throw new Error("UNCERTAIN_PRIOR_REQUEST_MANUAL_REVIEW_REQUIRED");
  if (ledger.entries.length > 0) {
    const pilot = ledger.entries[0];
    if (!pilot?.resultHash || options.continuation !== pilot.resultHash)
      throw new Error("PILOT_REVIEW_REQUIRED");
  } else if (options.continuation) throw new Error("PILOT_REQUIRED_FIRST");
  const count = options.continuation ? plan.jobs.length : 1;
  let calls = 0;
  for (const job of plan.jobs) {
    if (ledger.entries.some((entry) => entry.id === job.id)) continue;
    validateEvidence(evidence, now());
    const spent = ledger.entries.reduce(
      (sum, entry) => sum + (entry.chargedMicroUsd ?? entry.reservedMicroUsd),
      0,
    );
    if (
      job.upperMicroUsd === null ||
      job.upperMicroUsd + spent + priorExposureMicroUsd > BUDGET_MICRO_USD
    )
      throw new Error("BUDGET_EXPOSURE_EXCEEDED");
    const entry: Ledger["entries"][number] = {
      id: job.id,
      blindId: job.blindId,
      state: "reserved",
      reservedMicroUsd: job.upperMicroUsd,
      chargedMicroUsd: null,
      resultHash: null,
      error: null,
    };
    ledger.entries.push(entry);
    options.saveLedger(ledger); // Durable reservation BEFORE dispatch; crash cannot silently retry.
    const started = now();
    let raw: ProviderReply | undefined;
    try {
      calls++;
      raw = await options.call(evidence.registry.providerModelId, job.call);
      const metered = meter(raw, evidence, job);
      entry.chargedMicroUsd = metered.microUsd;
      if (raw.provider !== "openai" || raw.model !== evidence.registry.providerModelId)
        throw new Error("PROVIDER_MODEL_MISMATCH");
      if (raw.stopReason !== "end_turn") throw new Error("GENERATION_INCOMPLETE");
      let json: unknown;
      try {
        json = JSON.parse(raw.text);
      } catch {
        throw new Error("INVALID_JSON");
      }
      if (
        !json ||
        typeof json !== "object" ||
        Object.keys(json).sort().join(",") !== "lyrics,note,tags,title"
      )
        throw new Error("INVALID_SONG_SCHEMA");
      const validated = plan.source.generationOutput.safeParse(plan.source.parseSections(raw.text));
      if (!validated.success) throw new Error("INVALID_SONG_SCHEMA");
      const result = {
        blindId: job.blindId,
        brief: job.brief,
        candidate: job.arm,
        run: job.run,
        provider: raw.provider,
        model: raw.model,
        timestamp: new Date(started).toISOString(),
        durationMs: now() - started,
        finishStatus: raw.stopReason,
        usage: metered.usage,
        estimatedUsd: metered.microUsd / 1e6,
        reservedUpperUsd: entry.reservedMicroUsd / 1e6,
        promptHash: job.promptHash,
        systemHash: hash(job.call.system),
        schemaHash: hash(JSON.stringify(job.call.schema)),
        fingerprint: plan.fingerprint,
        reasoningEffort: job.call.reasoningEffort,
        outputCap: job.outputCap,
        song: validated.data,
        renderedLyrics: validated.data.lyrics,
      };
      entry.resultHash = hash(JSON.stringify(result));
      options.saveResult(job.blindId, result, { id: job.blindId, lyrics: validated.data.lyrics });
      entry.state = "completed";
      options.saveLedger(ledger);
    } catch (error) {
      entry.state = "failed";
      const known = [
        "USAGE_MISSING_OR_INVALID",
        "USAGE_INCONSISTENT",
        "PROVIDER_MODEL_MISMATCH",
        "GENERATION_INCOMPLETE",
        "INVALID_JSON",
        "INVALID_SONG_SCHEMA",
      ];
      entry.error =
        error instanceof Error && known.includes(error.message)
          ? error.message
          : "REQUEST_OR_STORAGE_FAILED_UNCERTAIN";
      // Retain upper exposure if usage is missing/network failed. No retries.
      options.saveLedger(ledger);
      options.saveFailure?.(job.blindId, {
        blindId: job.blindId,
        brief: job.brief,
        candidate: job.arm,
        run: job.run,
        provider: "openai",
        model: evidence.registry.providerModelId,
        timestamp: new Date(started).toISOString(),
        durationMs: now() - started,
        finishStatus: "failed",
        error: entry.error,
        promptHash: job.promptHash,
        fingerprint: plan.fingerprint,
        usage: entry.chargedMicroUsd === null ? null : usageSchema.parse(raw?.usage),
        estimatedUsd: entry.chargedMicroUsd === null ? null : entry.chargedMicroUsd / 1e6,
        reservedUpperUsd: entry.reservedMicroUsd / 1e6,
      });
      throw new Error(entry.error);
    }
    if (calls >= count) break;
  }
  const abandoned = ledger.entries.filter((entry) => entry.state === "abandoned").length;
  return {
    calls,
    completed: ledger.entries.filter((entry) => entry.state === "completed").length,
    pilotReviewRequired: !options.continuation,
    ...(abandoned > 0 ? { abandoned } : {}),
  };
}
