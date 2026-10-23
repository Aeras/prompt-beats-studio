/**
 * CLI for the isolated AI cancellation harness.
 *   Dry run (default, no network):  bun ./tools/ai-cancellation/run.ts
 *   Live, one mode (paid, needs explicit approval):
 *     bun ./tools/ai-cancellation/run.ts --live --modes openrouter_stream_abort --confirm-spend-usd 0.002
 * The ledger .benchmarks.local/ai-cancellation/ledger.json durably reserves each
 * billable request before dispatch and permanently blocks a second call per mode.
 */
import { DEFAULT_TOTAL_BUDGET_USD, MODES, runHarness, type ModeId } from "./harness";
import { FileLedger } from "./ledger";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const live = args.includes("--live");
const confirm = flag("--confirm-spend-usd");
const modes = (flag("--modes")?.split(",") ?? Object.keys(MODES)) as ModeId[];
for (const m of modes) if (!(m in MODES)) throw new Error(`Unknown mode ${m}`);

const out = await runHarness(
  {
    modes,
    live,
    confirmSpendUsd: confirm ? Number(confirm) : null,
    totalBudgetUsd: DEFAULT_TOTAL_BUDGET_USD,
    priorCalls: {},
    priorSpentUpperUsd: 0,
  },
  {
    fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    env: (k) => process.env[k],
    ledger: new FileLedger(".benchmarks.local/ai-cancellation/ledger.json"),
  },
);
console.log(JSON.stringify({ live, ...out }, null, 2));
