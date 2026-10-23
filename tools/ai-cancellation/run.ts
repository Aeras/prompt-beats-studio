/**
 * CLI for the isolated AI cancellation harness.
 *   Dry run (default, no network):  bun tools/ai-cancellation/run.ts
 *   Live (paid, needs approval):    bun tools/ai-cancellation/run.ts --live --confirm-spend-usd 0.02
 *   Limit modes:                    --modes openrouter_stream_abort,openai_background_responses
 * A ledger in .benchmarks.local/ai-cancellation/ blocks repeat billable calls per mode.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEFAULT_TOTAL_BUDGET_USD, MODES, runHarness, type ModeId, type ModeResult } from "./harness";

const DIR = ".benchmarks.local/ai-cancellation";
const LEDGER = `${DIR}/ledger.json`;

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const live = args.includes("--live");
const confirm = flag("--confirm-spend-usd");
const modes = (flag("--modes")?.split(",") ?? Object.keys(MODES)) as ModeId[];
for (const m of modes) if (!(m in MODES)) throw new Error(`Unknown mode ${m}`);

type Ledger = { calls: Partial<Record<ModeId, number>>; spentUpperUsd: number; results: ModeResult[] };
const ledger: Ledger = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, "utf8"))
  : { calls: {}, spentUpperUsd: 0, results: [] };

const out = await runHarness(
  {
    modes,
    live,
    confirmSpendUsd: confirm ? Number(confirm) : null,
    totalBudgetUsd: DEFAULT_TOTAL_BUDGET_USD,
    priorCalls: ledger.calls,
    priorSpentUpperUsd: ledger.spentUpperUsd,
  },
  {
    fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    env: (k) => process.env[k],
  },
);

if (live) {
  for (const r of out.results) {
    ledger.calls[r.mode] = (ledger.calls[r.mode] ?? 0) + r.billableCreateRequests;
    if (r.billableCreateRequests) ledger.spentUpperUsd += r.worstCaseCostUsd;
    ledger.results.push(r);
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
}
console.log(JSON.stringify({ live, ...out }, null, 2));
