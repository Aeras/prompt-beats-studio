import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  dryRun,
  execute,
  makePlan,
  meter,
  validateEvidence,
  type Evidence,
  type Ledger,
} from "./v3-benchmark";
import { ARMS, BASELINE_SHA, loadSources, type ProviderReply } from "./v3-source";
import { BRIEFS } from "./v3-fixtures";
import { parseArgs } from "./v3-runner";

// SYNTHETIC evidence, never a claim about an installed registry or real prices.
const evidence = (): Evidence =>
  validateEvidence({
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
const song = {
  title: "Тест",
  tags: "Melodic pop, 104 BPM",
  lyrics: "[Chorus]\nТестовая строка",
  note: "Тестовая запись, не реальная генерация.",
};
const reply = (): ProviderReply => ({
  text: JSON.stringify(song),
  stopReason: "end_turn",
  provider: "openai",
  model: "gpt-5.6-luna",
  usage: {
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    reasoningTokens: 200,
    cachedInputTokens: 100,
  },
});

function harness(plan = makePlan(evidence())) {
  const ledger: Ledger = { fingerprint: plan.fingerprint, entries: [] };
  let calls = 0;
  const saved: Record<string, unknown>[] = [];
  const reservations: string[] = [];
  const options = {
    live: true,
    confirmSpendUsd: "3.00",
    ci: false,
    apiKeyAvailable: true,
    call: async () => {
      calls++;
      expect(ledger.entries.at(-1)?.state).toBe("reserved");
      return reply();
    },
    saveLedger: (value: Ledger) => {
      reservations.push(JSON.stringify(value));
    },
    saveResult: (
      _id: string,
      value: Record<string, unknown>,
      blind: { id: string; lyrics: string },
    ) => {
      expect(Object.keys(blind).sort()).toEqual(["id", "lyrics"]);
      saved.push(value);
    },
  };
  return { plan, ledger, options, saved, reservations, calls: () => calls };
}

describe("V3-C cumulative cap with previous lost benchmark exposure", () => {
  test("fresh ledger includes previous $0.303449 before first dispatch", async () => {
    const h = harness();
    await expect(
      execute(h.plan, h.ledger, {
        ...h.options,
        priorExposureMicroUsd: 2_800_000,
      }),
    ).rejects.toThrow("BUDGET_EXPOSURE_EXCEEDED");
    expect(h.calls()).toBe(0);
    expect(h.ledger.entries).toHaveLength(0);
  });

  test("rejects invalid outside exposure before any provider request", async () => {
    for (const exposure of [-1, Number.NaN, 3_000_001, 1.5]) {
      const h = harness();
      await expect(
        execute(h.plan, h.ledger, {
          ...h.options,
          priorExposureMicroUsd: exposure,
        }),
      ).rejects.toThrow("PRIOR_EXPOSURE_INVALID");
      expect(h.calls()).toBe(0);
    }
  });

  test("external exposure is cumulative with completed and reserved jobs", async () => {
    const h = harness();
    const first = await execute(h.plan, h.ledger, {
      ...h.options,
      priorExposureMicroUsd: 303449,
    });
    expect(first.calls).toBe(1);
    expect(h.ledger.entries[0]?.state).toBe("completed");
    const second = h.plan.jobs[1]!;
    h.ledger.entries.push({
      id: second.id,
      blindId: second.blindId,
      state: "abandoned",
      reservedMicroUsd: second.upperMicroUsd!,
      chargedMicroUsd: null,
      resultHash: null,
      error: "MANUALLY_ABANDONED_UNCERTAIN_BILLING",
    });
    const highExposure = 3_000_000 - second.upperMicroUsd! - (h.ledger.entries[0]!.chargedMicroUsd ?? 0);
    await expect(
      execute(h.plan, h.ledger, {
        ...h.options,
        priorExposureMicroUsd: highExposure,
        continuation: h.ledger.entries[0]!.resultHash!,
      }),
    ).rejects.toThrow("BUDGET_EXPOSURE_EXCEEDED");
    expect(h.calls()).toBe(1);
  });
});

describe("V3 benchmark explicit offline recovery arguments", () => {
  const digest = "a".repeat(64);
  test("requires full audited recovery parameters and never allows live recovery", () => {
    const args = [
      "--recover-prior-evidence",
      ".benchmarks.local/evidence-original.json",
      "--evidence",
      ".benchmarks.local/evidence.json",
      "--recover-abandoned-job",
      "ru-pop-c-1",
      "--expected-ledger-hash",
      digest,
    ];
    expect(parseArgs(args).recovering).toBe(true);
    expect(parseArgs(args).live).toBe(false);
    expect(() => parseArgs([...args, "--live"])).toThrow("INVALID_RECOVERY_ARGUMENTS");
    expect(() => parseArgs([...args, "--continue-after-pilot", digest])).toThrow(
      "INVALID_ARGUMENTS",
    );
    expect(() => parseArgs(args.slice(0, -2))).toThrow("INVALID_RECOVERY_ARGUMENTS");
    expect(() =>
      parseArgs(args.map((value) => (value === "ru-pop-c-1" ? "ru-pop-c-2" : value))),
    ).toThrow("INVALID_RECOVERY_ARGUMENTS");
  });
});

describe("V3 benchmark uncertain-request quarantine", () => {
  test("an audited abandoned job is skipped forever and its full reservation counts", async () => {
    const h = harness();
    await execute(h.plan, h.ledger, h.options);
    const first = h.ledger.entries[0]!;
    const second = h.plan.jobs[1]!;
    h.ledger.entries.push({
      id: second.id,
      blindId: second.blindId,
      state: "abandoned",
      reservedMicroUsd: second.upperMicroUsd!,
      chargedMicroUsd: null,
      resultHash: null,
      error: "MANUALLY_ABANDONED_UNCERTAIN_BILLING",
    });
    const countBefore = h.calls();
    const result = await execute(h.plan, h.ledger, {
      ...h.options,
      continuation: first.resultHash!,
    });
    expect(result.abandoned).toBe(1);
    expect(result.completed).toBe(23);
    expect(h.calls() - countBefore).toBe(22);
    expect(h.ledger.entries[1]?.state).toBe("abandoned");
    expect(h.ledger.entries[1]?.chargedMicroUsd).toBeNull();
    expect(h.ledger.entries[1]?.reservedMicroUsd).toBe(second.upperMicroUsd);
  });

  test("a suspicious abandoned record cannot bypass manual billing review", async () => {
    const h = harness();
    await execute(h.plan, h.ledger, h.options);
    const second = h.plan.jobs[1]!;
    h.ledger.entries.push({
      id: second.id,
      blindId: second.blindId,
      state: "abandoned",
      reservedMicroUsd: second.upperMicroUsd!,
      chargedMicroUsd: 0,
      resultHash: null,
      error: "MANUALLY_ABANDONED_UNCERTAIN_BILLING",
    });
    await expect(
      execute(h.plan, h.ledger, { ...h.options, continuation: h.ledger.entries[0]!.resultHash! }),
    ).rejects.toThrow("LEDGER_MISMATCH");
    expect(h.calls()).toBe(1);
  });
});

describe("V3 benchmark offline assembly", () => {
  test("24 deterministic jobs use genuine V2 prefixes and pinned original MAIN V3", () => {
    const plan = makePlan();
    expect(plan.jobs).toHaveLength(24);
    expect(new Set(plan.jobs.map((j) => j.id)).size).toBe(24);
    expect(new Set(plan.jobs.map((j) => j.blindId)).size).toBe(24);
    expect(dryRun(plan)).toEqual(dryRun(makePlan()));
    const original = execFileSync(
      "git",
      ["show", `${BASELINE_SHA}:src/lib/advanced-generator-v3-review.ts`],
      { encoding: "utf8" },
    );
    const exports: { withV3MusicalPlanning?: (p: string) => string } = {};
    runInNewContext(
      ts.transpileModule(original, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
        .outputText,
      { exports },
    );
    for (const brief of BRIEFS) {
      const base = plan.source.v2(brief);
      for (const arm of ARMS) {
        const job = plan.jobs.find((j) => j.brief === brief.id && j.arm === arm)!;
        expect(job.call.prompt.startsWith(base)).toBe(true);
        expect(job.call.prompt).toContain(brief.instructions);
        expect(job.call.prompt).toContain("ADVANCED SUNO");
        expect(job.call.prompt).toContain("Четыре спетые строки");
        expect(job.outputCap).toBe(16384);
        if (arm === "current") {
          expect(job.call.prompt).toBe(exports.withV3MusicalPlanning!(base));
          expect(job.call.prompt).not.toContain("RHYME INTENT (V3)");
        } else expect(job.call.prompt).toContain("RHYME INTENT (V3)");
      }
    }
  });

  test("dry-run makes zero provider calls, needs no key and does not invent unknown prices", () => {
    let calls = 0;
    const report = dryRun(makePlan(), () => {
      calls++;
      throw new Error("Network forbidden");
    });
    expect(calls).toBe(0);
    expect(report.providerCalls).toBe(0);
    expect(report.spendUsd).toBe(0);
    expect(report.estimatedUpperUsd).toBe(null);
    expect(report.liveReady).toBe(false);
    expect(report.effectiveModel).toBe(null);
    expect(dryRun(makePlan(evidence())).estimatedUpperUsd! > 0).toBe(true);
  });

  test("real CLI dry-run succeeds with all fetch forbidden and an unused sentinel key", () => {
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        `globalThis.fetch = () => { throw new Error("NETWORK_FORBIDDEN"); }; const {main}=await import('./scripts/benchmarks/v3-runner.ts'); await main([]);`,
      ],
      { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "SENTINEL_NEVER_OUTPUT" } },
    );
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    const report = JSON.parse(child.stdout);
    expect(report.plannedGenerations).toBe(24);
    expect(child.stdout).not.toContain("SENTINEL_NEVER_OUTPUT");
    expect(readFileSync(".benchmarks.local/v3-rhyme/offline/manifest.json", "utf8")).not.toContain(
      "SENTINEL_NEVER_OUTPUT",
    );
  });

  test("arguments never infer live mode and reject ambiguous/unknown flags", () => {
    expect(parseArgs([]).live).toBe(false);
    for (const args of [
      ["--confirm-spend-usd", "3.00"],
      ["--live", "--dry-run"],
      ["--live", "--live"],
      ["--model", "anything"],
      ["--evidence"],
    ])
      expect(() => parseArgs(args)).toThrow("INVALID_ARGUMENTS");
  });
});

describe("effective model evidence and real adapter", () => {
  test("rejects unknown/outdated pricing, stale evidence, bad sources and token caps", () => {
    for (const value of [
      null,
      { ...evidence(), verifiedAt: "2020-01-01T00:00:00.000Z" },
      { ...evidence(), modelSource: "https://evil.example/model" },
      { ...evidence(), registry: { ...evidence().registry, pricingStatus: "unknown" } },
      { ...evidence(), registry: { ...evidence().registry, inputPricePerMillion: null } },
    ])
      expect(() => validateEvidence(value)).toThrow();
    expect(() => makePlan({ ...evidence(), maxOutputTokens: 100 })).toThrow(
      "MODEL_TOKEN_LIMIT_UNVERIFIED",
    );
    expect(() => makePlan({ ...evidence(), standardInputTokenCeiling: 10 })).toThrow(
      "MODEL_TOKEN_LIMIT_UNVERIFIED",
    );
  });

  test("real adapter preserves model, system, schema, reasoning and actual output cap with one mocked fetch", async () => {
    const plan = makePlan(evidence());
    let calls = 0;
    const mockFetch: typeof fetch = async (url, init) => {
      calls++;
      expect(url).toBe("https://api.openai.com/v1/responses");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.instructions).toBe(plan.source.SYSTEM_PROMPT);
      expect(body.max_output_tokens).toBe(16384);
      expect(body.reasoning.effort).toBe("medium");
      expect(body.text.format.strict).toBe(true);
      expect(body.text.format.schema.additionalProperties).toBe(false);
      expect(body.text.format.schema.required).toEqual(["title", "tags", "lyrics", "note"]);
      return new Response(
        JSON.stringify({
          status: "completed",
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            total_tokens: 1500,
            output_tokens_details: { reasoning_tokens: 200 },
          },
          output: [
            { type: "message", content: [{ type: "output_text", text: JSON.stringify(song) }] },
          ],
        }),
      );
    };
    const result = await plan.source.caller(mockFetch, "FAKE_UNIT_TEST_KEY")(
      "gpt-5.6-luna",
      plan.jobs[0]!.call,
    );
    expect(calls).toBe(1);
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage?.reasoningTokens).toBe(200);
    expect(result.text).not.toContain("FAKE_UNIT_TEST_KEY");
  });

  test("meters all output including reasoning once and never relies on cache discounts", () => {
    const plan = makePlan(evidence());
    expect(meter(reply(), plan.evidence!, plan.jobs[0]!).microUsd).toBe(850);
    expect(() => meter({ ...reply(), usage: null }, plan.evidence!, plan.jobs[0]!)).toThrow(
      "USAGE_MISSING_OR_INVALID",
    );
    expect(() =>
      meter(
        { ...reply(), usage: { inputTokens: 1, outputTokens: 1, totalTokens: 99 } },
        plan.evidence!,
        plan.jobs[0]!,
      ),
    ).toThrow("USAGE_INCONSISTENT");
  });

  test("adapter does not retry HTTP failures or transport timeouts or leak error bodies", async () => {
    const source = loadSources();
    for (const timeout of [false, true]) {
      let calls = 0;
      const fake: typeof fetch = async () => {
        calls++;
        if (timeout) throw new Error("SECRET_TIMEOUT_DETAIL");
        return new Response("SECRET_PROVIDER_BODY", { status: 429 });
      };
      let failure = "";
      try {
        await source.caller(fake, "FAKE_KEY")("gpt-5.6-luna", makePlan().jobs[0]!.call);
      } catch (error) {
        failure = error instanceof Error ? error.message : "unknown";
      }
      expect(calls).toBe(1);
      // HTTP bodies are suppressed by the extracted adapter. Transport errors
      // are sanitized by execute/CLI before storage or output.
      if (!timeout) expect(failure).not.toContain("SECRET_PROVIDER_BODY");
    }
    expect(
      source.openAiOutputBudget({ ...makePlan().jobs[0]!.call, reasoningEffort: "high" }),
    ).toBe(32768);
  });
});

describe("pilot, reservations, failure and resume guards", () => {
  test("pilot dispatches exactly once, reserves first and cannot continue without pilot review", async () => {
    const f = harness();
    expect(await execute(f.plan, f.ledger, f.options)).toEqual({
      calls: 1,
      completed: 1,
      pilotReviewRequired: true,
    });
    expect(f.calls()).toBe(1);
    expect(f.saved).toHaveLength(1);
    expect(f.ledger.entries[0]?.state).toBe("completed");
    await expect(execute(f.plan, f.ledger, f.options)).rejects.toThrow("PILOT_REVIEW_REQUIRED");
    expect(f.calls()).toBe(1);
    const continuation = f.ledger.entries[0]!.resultHash!;
    const result = await execute(f.plan, f.ledger, { ...f.options, continuation });
    expect(result.calls).toBe(23);
    expect(f.calls()).toBe(24);
    expect((await execute(f.plan, f.ledger, { ...f.options, continuation })).calls).toBe(0);
    expect(new Set(f.ledger.entries.map((e) => e.id)).size).toBe(24);
  });

  test("live gates, unknown pricing and over-budget stop before dispatch", async () => {
    for (const override of [
      { live: false },
      { ci: true },
      { apiKeyAvailable: false },
      { confirmSpendUsd: "300" },
    ]) {
      const f = harness();
      await expect(execute(f.plan, f.ledger, { ...f.options, ...override })).rejects.toThrow(
        "LIVE_AUTHORIZATION_REQUIRED",
      );
      expect(f.calls()).toBe(0);
    }
    const unknown = harness(makePlan());
    await expect(execute(unknown.plan, unknown.ledger, unknown.options)).rejects.toThrow(
      "MODEL_OR_PRICING_UNVERIFIED",
    );
    const expensive = evidence();
    expensive.registry.inputPricePerMillion = 100;
    const costly = harness(makePlan(expensive));
    await expect(execute(costly.plan, costly.ledger, costly.options)).rejects.toThrow(
      "BUDGET_EXPOSURE_EXCEEDED",
    );
    expect(costly.calls()).toBe(0);
  });

  test("missing usage, invalid JSON/schema, truncation, timeout and provider errors never retry", async () => {
    const cases: Array<{ response?: ProviderReply; error?: string; code: string }> = [
      { response: { ...reply(), usage: null }, code: "USAGE_MISSING_OR_INVALID" },
      { response: { ...reply(), text: "not json" }, code: "INVALID_JSON" },
      {
        response: { ...reply(), text: JSON.stringify({ ...song, lyrics: "" }) },
        code: "INVALID_SONG_SCHEMA",
      },
      {
        response: { ...reply(), text: JSON.stringify({ ...song, extra: true }) },
        code: "INVALID_SONG_SCHEMA",
      },
      {
        response: { ...reply(), text: JSON.stringify({ ...song, lyrics: 42 }) },
        code: "INVALID_SONG_SCHEMA",
      },
      { response: { ...reply(), stopReason: "max_tokens" }, code: "GENERATION_INCOMPLETE" },
      { error: "TimeoutError: SECRET_DO_NOT_LOG", code: "REQUEST_OR_STORAGE_FAILED_UNCERTAIN" },
      { error: "HTTP 500 with SECRET_DO_NOT_LOG", code: "REQUEST_OR_STORAGE_FAILED_UNCERTAIN" },
    ];
    for (const item of cases) {
      const f = harness();
      let count = 0;
      await expect(
        execute(f.plan, f.ledger, {
          ...f.options,
          call: async () => {
            count++;
            if (item.error) throw new Error(item.error);
            return item.response!;
          },
        }),
      ).rejects.toThrow(item.code);
      expect(count).toBe(1);
      expect(f.ledger.entries[0]?.state).toBe("failed");
      expect(JSON.stringify(f.ledger)).not.toContain("SECRET_DO_NOT_LOG");
      expect(f.saved).toHaveLength(0);
      await expect(execute(f.plan, f.ledger, f.options)).rejects.toThrow(
        "UNCERTAIN_PRIOR_REQUEST_MANUAL_REVIEW_REQUIRED",
      );
    }
  });

  test("remaining budget is rechecked after the pilot, not just at startup", async () => {
    const expensive = evidence();
    expensive.registry.inputPricePerMillion = 20;
    const f = harness(makePlan(expensive));
    let calls = 0;
    const options = {
      ...f.options,
      call: async () => {
        calls++;
        return {
          ...reply(),
          usage: { inputTokens: 100000, outputTokens: 10000, totalTokens: 110000 },
        };
      },
    };
    await execute(f.plan, f.ledger, options);
    await expect(
      execute(f.plan, f.ledger, { ...options, continuation: f.ledger.entries[0]!.resultHash! }),
    ).rejects.toThrow("BUDGET_EXPOSURE_EXCEEDED");
    expect(calls).toBe(1);
  });

  test("unknown usage keeps the full reservation and records only safe failure metadata", async () => {
    const f = harness();
    const failures: Record<string, unknown>[] = [];
    await expect(
      execute(f.plan, f.ledger, {
        ...f.options,
        call: async () => ({ ...reply(), usage: null, text: "PRIVATE_RAW_TEXT" }),
        saveFailure: (_id, value) => {
          failures.push(value);
        },
      }),
    ).rejects.toThrow("USAGE_MISSING_OR_INVALID");
    expect(f.ledger.entries[0]?.chargedMicroUsd).toBe(null);
    expect(failures[0]?.["usage"]).toBe(null);
    expect((failures[0]?.["reservedUpperUsd"] as number) > 0).toBe(true);
    expect(JSON.stringify(failures)).not.toContain("PRIVATE_RAW_TEXT");
  });

  test("evidence expiration between units halts continuation without a request", async () => {
    const f = harness();
    await execute(f.plan, f.ledger, f.options);
    await expect(
      execute(f.plan, f.ledger, {
        ...f.options,
        continuation: f.ledger.entries[0]!.resultHash!,
        now: () => Date.now() + 25 * 60 * 60 * 1000,
      }),
    ).rejects.toThrow("EVIDENCE_STALE");
    expect(f.calls()).toBe(1);
  });

  test("crash reservation, duplicates, ledger drift and write failures block further calls", async () => {
    const f = harness();
    await expect(
      execute(f.plan, f.ledger, {
        ...f.options,
        saveLedger: () => {
          throw new Error("disk failed");
        },
      }),
    ).rejects.toThrow();
    expect(f.calls()).toBe(0);
    await expect(execute(f.plan, f.ledger, f.options)).rejects.toThrow(
      "UNCERTAIN_PRIOR_REQUEST_MANUAL_REVIEW_REQUIRED",
    );
    const duplicate = harness();
    await execute(duplicate.plan, duplicate.ledger, duplicate.options);
    duplicate.ledger.entries.push(duplicate.ledger.entries[0]!);
    await expect(execute(duplicate.plan, duplicate.ledger, duplicate.options)).rejects.toThrow(
      "LEDGER_MISMATCH",
    );
    const drift = harness();
    drift.ledger.fingerprint = "changed";
    await expect(execute(drift.plan, drift.ledger, drift.options)).rejects.toThrow(
      "LEDGER_MISMATCH",
    );
  });
});
