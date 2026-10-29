import * as diagnostics from "./music-inspiration-diagnostics.shared";
import { expect, test } from "bun:test";
import {
  summarizeInspirationUsage,
  configuredPrice,
  emptyInspirationPrices,
} from "./music-inspiration-usage.shared";
const prices = { input: 2, output: 10, cached: 0.2, cacheWrite: 2.5, searchCreditUsd: 0.008 };
const usage = {
  inputTokens: 1000,
  outputTokens: 2000,
  totalTokens: 3000,
  cachedInputTokens: 200,
  cacheWriteTokens: 100,
  reasoningTokens: 500,
};
test("normalized reasoning is included once; cache subsets use their own saved rates", () => {
  const report = summarizeInspirationUsage({
    prices,
    usage,
    aiDispatched: true,
    aiFinal: true,
    searches: [
      { state: "observed", credits: 1 },
      { state: "observed", credits: 1 },
    ],
  });
  expect(report.aiCostUsd).toBeCloseTo((700 * 2 + 200 * 0.2 + 100 * 2.5 + 2000 * 10) / 1e6, 8);
  expect(report.searchCostUsd).toBe(0.016);
  expect(report.totalCostUsd).toBeCloseTo(report.aiCostUsd! + 0.016, 8);
  expect(report.reasoningTokens).toBe(500);
  expect(report.complete).toBe(true);
});
test("large actual usage is reported without a monetary ceiling", () => {
  const report = summarizeInspirationUsage({
    prices,
    usage: { inputTokens: 1e6, outputTokens: 1e6, totalTokens: 2e6 },
    aiDispatched: true,
    aiFinal: true,
  });
  expect(report.totalCostUsd).toBe(12);
});
test("missing prices never become fabricated free usage", () => {
  const report = summarizeInspirationUsage({
    prices: emptyInspirationPrices(),
    usage,
    aiDispatched: true,
    aiFinal: true,
  });
  expect(report.aiCostUsd).toBeNull();
  expect(report.totalCostUsd).toBeNull();
  expect(report.inputTokens).toBe(1000);
});
test("zero configured tariffs are valid; unknown is different from free", () => {
  expect(configuredPrice(0)).toBe(0);
  expect(configuredPrice(null)).toBeNull();
  expect(configuredPrice(-1)).toBeNull();
  expect(
    summarizeInspirationUsage({
      prices: { input: 0, output: 0 },
      usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      aiDispatched: true,
      aiFinal: true,
    }).totalCostUsd,
  ).toBe(0);
});
test("a timed-out or partial receipt never claims a complete total", () => {
  const report = summarizeInspirationUsage({
    prices,
    usage,
    aiDispatched: true,
    aiFinal: false,
    searches: [{ state: "unknown" }],
  });
  expect(report.totalCostUsd).toBeNull();
  expect(report.searchCredits).toBeNull();
  expect(report.inputTokens).toBe(1000);
});
test("provider-reported amount is separate and never added again", () => {
  const report = summarizeInspirationUsage({
    prices,
    usage: { ...usage, providerReportedCostUsd: 9 },
    aiDispatched: true,
    aiFinal: true,
  });
  expect(report.providerReportedCostUsd).toBe(9);
  expect(report.totalCostUsd).toBe(report.aiCostUsd);
});
test("impossible cache counters fail safely without losing observed counts", () => {
  const report = summarizeInspirationUsage({
    prices,
    usage: { ...usage, cachedInputTokens: 5000 },
    aiDispatched: true,
    aiFinal: true,
  });
  expect(report.aiCostUsd).toBeNull();
  expect(report.inputTokens).toBe(1000);
});

// Executes the actual quote loader with an offline database, not a duplicate estimator.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as shared from "./music-inspiration.shared";
import * as usageShared from "./music-inspiration-usage.shared";
import { createHash } from "node:crypto";
test("actual quote loader accepts old/unverified/missing tariffs without affecting admission", async () => {
  const state: any = {
    data: {
      pricing_currency: "USD",
      pricing_status: "unknown",
      pricing_checked_at: "2000-01-01",
      input_price_per_million: 100,
      output_price_per_million: 200,
      cached_input_price_per_million: null,
      cache_write_price_per_million: null,
    },
    error: null,
  };
  const filters: any[] = [];
  const q: any = {
    select: () => q,
    eq: (...args: any[]) => {
      filters.push(args);
      return q;
    },
    maybeSingle: async () => {
      if (state.throw) throw Error("offline");
      return state;
    },
  };
  const exported: any = {};
  runInNewContext(
    ts.transpileModule(readFileSync("src/lib/music-inspiration-research.server.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: exported,
      process: { env: { MUSIC_INSPIRATION_SEARCH_CREDIT_USD: "0.008" } },
      require(name: string) {
        if (name === "./music-inspiration-diagnostics.shared") return diagnostics;
        if (name === "node:crypto") return { createHash };
        if (name === "zod") return { z };
        if (name === "./music-inspiration.shared") return shared;
        if (name === "./music-inspiration-usage.shared") return usageShared;
        if (name === "@/integrations/supabase/client.server")
          return { supabaseAdmin: { from: () => q } };
        throw Error(name);
      },
    },
  );
  expect(await exported.getMusicInspirationPrices("fixture", "openai")).toEqual({
    input: 100,
    output: 200,
    cached: null,
    cacheWrite: null,
    searchCreditUsd: 0.008,
  });
  expect(filters).toContainEqual(["provider_model_id", "fixture"]);
  expect(filters).toContainEqual(["provider", "openai"]);
  state.data = null;
  expect((await exported.getMusicInspirationPrices("fixture", "openai")).input).toBeNull();
  state.error = { code: "offline" };
  expect((await exported.getMusicInspirationPrices("fixture", "openai")).searchCreditUsd).toBe(
    0.008,
  );
  state.throw = true;
  expect((await exported.getMusicInspirationPrices("fixture", "openai")).input).toBeNull();
});

test("observed cache writes without an administrator tariff keep estimation partial, not free or double-counted", () => {
  const report = summarizeInspirationUsage({
    prices: { input: 2, output: 10, cached: null, cacheWrite: null, searchCreditUsd: 0.008 },
    usage: {
      inputTokens: 4071,
      outputTokens: 4198,
      totalTokens: 8269,
      reasoningTokens: 185,
      cachedInputTokens: 0,
      cacheWriteTokens: 4068,
      providerReportedCostUsd: 0.052156,
    },
    aiDispatched: true,
    aiFinal: true,
    searches: [{ state: "observed", credits: 5 }],
  });
  expect(report.aiCostUsd).toBeNull();
  expect(report.totalCostUsd).toBeNull();
  expect(report.cacheWriteTokens).toBe(4068);
  expect(report.searchCostUsd).toBe(0.04);
  expect(report.providerReportedCostUsd).toBe(0.052156);
  expect(report.complete).toBe(false);
});

test("planner, Tavily and synthesis are independently priced and summed once", () => {
  const report = summarizeInspirationUsage({
    prices,
    usage,
    aiDispatched: true,
    aiFinal: true,
    planner: {
      prices: { ...prices, input: 1, output: 3 },
      usage: { ...usage, providerReportedCostUsd: 9 },
      aiDispatched: true,
      aiFinal: true,
    },
    searches: [{ state: "observed", credits: 2 }],
  });
  expect(report.planner!.costUsd).toBeCloseTo((700 + 200 * 0.2 + 100 * 2.5 + 2000 * 3) / 1e6, 8);
  expect(report.planner!.reasoningTokens).toBe(500);
  expect(report.planner!.providerReportedCostUsd).toBe(9);
  expect(report.totalCostUsd).toBeCloseTo(report.aiCostUsd! + report.planner!.costUsd! + 0.016, 8);
  expect(report.totalCostUsd).toBeLessThan(1); // Provider-reported amount is displayed, never added again.
});
test("unknown planner consumption or missing planner tariff never becomes a zero-cost total", () => {
  for (const planner of [
    { prices, usage: null, aiDispatched: true, aiFinal: false },
    { prices: emptyInspirationPrices(), usage, aiDispatched: true, aiFinal: true },
  ]) {
    const report = summarizeInspirationUsage({
      prices,
      usage,
      aiDispatched: true,
      aiFinal: true,
      planner,
    });
    expect(report.totalCostUsd).toBeNull();
    expect(report.planner!.costUsd).toBeNull();
    expect(report.complete).toBe(false);
    expect(report.aiCostUsd).not.toBeNull();
  }
});

test("a job failing before synthesis still reports incurred planner cost", () => {
  const report = summarizeInspirationUsage({
    prices,
    aiDispatched: false,
    planner: { prices, usage, aiDispatched: true, aiFinal: true },
    searches: [],
  });
  expect(report.aiCostUsd).toBe(0);
  expect(report.searchCostUsd).toBe(0);
  expect(report.planner!.costUsd).toBeGreaterThan(0);
  expect(report.totalCostUsd).toBe(report.planner!.costUsd);
  expect(report.complete).toBe(true);
});
