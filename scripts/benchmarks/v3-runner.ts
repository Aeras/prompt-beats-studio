import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  dryRun,
  execute,
  ledgerSchema,
  makePlan,
  validateEvidence,
  type Ledger,
} from "./v3-benchmark";
import { hash } from "./v3-source";

// *.local is already ignored. Unlike .output, this survives application builds.
const OUTPUT = ".benchmarks.local/v3-rhyme";
export function parseArgs(args: string[]) {
  let live = false;
  let confirmSpendUsd = "";
  let evidencePath: string | undefined;
  let continuation: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg || seen.has(arg)) throw new Error("INVALID_ARGUMENTS");
    seen.add(arg);
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--dry-run") continue;
    if (!["--confirm-spend-usd", "--evidence", "--continue-after-pilot"].includes(arg))
      throw new Error("INVALID_ARGUMENTS");
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS");
    if (arg === "--confirm-spend-usd") confirmSpendUsd = value;
    if (arg === "--evidence") evidencePath = value;
    if (arg === "--continue-after-pilot") continuation = value;
  }
  if ((live && seen.has("--dry-run")) || (!live && (confirmSpendUsd || continuation)))
    throw new Error("INVALID_ARGUMENTS");
  return { live, confirmSpendUsd, evidencePath, continuation };
}

function durableJson(path: string, value: unknown, exclusive = false) {
  const fd = openSync(exclusive ? path : `${path}.tmp`, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (!exclusive) renameSync(`${path}.tmp`, path);
}

export async function main(args: string[]) {
  const options = parseArgs(args);
  const ci = Boolean(
    process.env["CI"] ||
    process.env["GITHUB_ACTIONS"] ||
    process.env["TF_BUILD"] ||
    process.env["BUILD_NUMBER"],
  );
  if (options.live && (ci || options.confirmSpendUsd !== "3.00"))
    throw new Error("LIVE_AUTHORIZATION_REQUIRED");
  const evidence = options.evidencePath
    ? validateEvidence(JSON.parse(readFileSync(options.evidencePath, "utf8")))
    : undefined;
  const plan = makePlan(evidence);
  if (!options.live) {
    const report = dryRun(plan);
    mkdirSync(`${OUTPUT}/offline`, { recursive: true, mode: 0o700 });
    // Deterministic output: no keys, time, generated content, or environment state.
    writeFileSync(`${OUTPUT}/offline/manifest.json`, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!evidence) throw new Error("MODEL_OR_PRICING_UNVERIFIED");
  const key = process.env["OPENAI_API_KEY"];
  if (!key?.trim()) throw new Error("API_KEY_MISSING");
  const directory = `${OUTPUT}/live`;
  mkdirSync(`${directory}/blind`, { recursive: true, mode: 0o700 });
  // Exclusive process lock, never auto-expired: stale lock requires billing review.
  const lockPath = `${directory}/runner.lock`;
  const lock = openSync(lockPath, "wx", 0o600);
  try {
    const ledgerPath = `${directory}/ledger.json`;
    const ledger: Ledger = existsSync(ledgerPath)
      ? ledgerSchema.parse(JSON.parse(readFileSync(ledgerPath, "utf8")))
      : { fingerprint: plan.fingerprint, entries: [] };
    for (const entry of ledger.entries) {
      if (entry.state === "completed") {
        const record = JSON.parse(readFileSync(`${directory}/${entry.blindId}.json`, "utf8"));
        if (hash(JSON.stringify(record)) !== entry.resultHash)
          throw new Error("RESULT_LEDGER_MISMATCH");
      }
    }
    const adapter = plan.source.caller(fetch, key);
    const result = await execute(plan, ledger, {
      live: true,
      ci,
      confirmSpendUsd: options.confirmSpendUsd,
      apiKeyAvailable: true,
      ...(options.continuation ? { continuation: options.continuation } : {}),
      call: async (model, call) => {
        const reply = await adapter(model, call);
        // Defense in depth: never persist an echoed execution credential.
        if (JSON.stringify(reply).includes(key)) throw new Error("CREDENTIAL_ECHO_REJECTED");
        return reply;
      },
      saveLedger: (value) => durableJson(ledgerPath, value),
      saveResult: (id, record, blind) => {
        durableJson(`${directory}/${id}.json`, record, true);
        durableJson(`${directory}/blind/${id}.json`, blind, true);
      },
      saveFailure: (id, record) => durableJson(`${directory}/${id}.failure.json`, record, true),
    });
    console.log(
      JSON.stringify(
        {
          ...result,
          pilotResultHash: ledger.entries[0]?.resultHash,
          estimatedSpentUsd:
            ledger.entries.reduce(
              (sum, entry) => sum + (entry.chargedMicroUsd ?? entry.reservedMicroUsd),
              0,
            ) / 1e6,
          directory,
        },
        null,
        2,
      ),
    );
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => {
    // Never print arbitrary errors, request payloads, credentials or provider bodies.
    console.error(
      "Benchmark stopped safely. Review local ledger/status, evidence and execution instructions; do not retry an uncertain paid request.",
    );
    process.exitCode = 1;
  });
}
