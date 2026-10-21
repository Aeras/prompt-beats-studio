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
  evidenceSchema,
  execute,
  ledgerSchema,
  makePlan,
  validateEvidence,
  type Ledger,
} from "./v3-benchmark";
import { hash } from "./v3-source";
import { makeDPlan } from "./v3-d-plan";

// *.local is already ignored. Unlike .output, this survives application builds.
const OUTPUT = ".benchmarks.local/v3-rhyme";
const OUTPUT_D = ".benchmarks.local/v3-d-multilingual";
// Lost-run exposure $0.303449 + complete V3-C benchmark $0.091213.
export const D_PRIOR_EXPOSURE_MICRO_USD = 394662;
// PR #377: conservative exposure from the lost six-result run and uncertain request.
// Included in EVERY new live budget admission; never cleared by starting a fresh ledger.
export const PRIOR_BENCHMARK_EXPOSURE_MICRO_USD = 303449;
export function parseArgs(args: string[]) {
  let live = false;
  let dOnly = false;
  let confirmSpendUsd = "";
  let evidencePath: string | undefined;
  let continuation: string | undefined;
  let recoveryEvidencePath: string | undefined;
  let recoverJob: string | undefined;
  let expectedLedgerHash: string | undefined;
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
    if (arg === "--d-only") {
      dOnly = true;
      continue;
    }
    if (
      ![
        "--confirm-spend-usd",
        "--evidence",
        "--continue-after-pilot",
        "--recover-prior-evidence",
        "--recover-abandoned-job",
        "--expected-ledger-hash",
      ].includes(arg)
    )
      throw new Error("INVALID_ARGUMENTS");
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS");
    if (arg === "--confirm-spend-usd") confirmSpendUsd = value;
    if (arg === "--evidence") evidencePath = value;
    if (arg === "--continue-after-pilot") continuation = value;
    if (arg === "--recover-prior-evidence") recoveryEvidencePath = value;
    if (arg === "--recover-abandoned-job") recoverJob = value;
    if (arg === "--expected-ledger-hash") expectedLedgerHash = value;
  }
  if ((live && seen.has("--dry-run")) || (!live && (confirmSpendUsd || continuation)))
    throw new Error("INVALID_ARGUMENTS");
  const recovering = Boolean(recoveryEvidencePath || recoverJob || expectedLedgerHash);
  if (
    recovering &&
    (dOnly ||
      live ||
      continuation ||
      confirmSpendUsd ||
      !evidencePath ||
      !recoveryEvidencePath ||
      recoverJob !== "ru-pop-c-1" ||
      !/^[a-f0-9]{64}$/.test(expectedLedgerHash ?? ""))
  )
    throw new Error("INVALID_RECOVERY_ARGUMENTS");
  return {
    live,
    dOnly,
    confirmSpendUsd,
    evidencePath,
    continuation,
    recoveryEvidencePath,
    recoverJob,
    expectedLedgerHash,
    recovering,
  };
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
  const plan = options.dOnly ? makeDPlan(evidence) : makePlan(evidence);
  const output = options.dOnly ? OUTPUT_D : OUTPUT;
  if (options.recovering) {
    // Completely offline, explicit one-time ledger migration. This path never
    // constructs a provider adapter and never accesses OPENAI_API_KEY.
    const priorEvidence = evidenceSchema.parse(
      JSON.parse(readFileSync(options.recoveryEvidencePath!, "utf8")),
    );
    const priorPlan = makePlan(priorEvidence);
    if (
      !evidence ||
      JSON.stringify({ ...priorEvidence, verifiedAt: null }) !==
        JSON.stringify({ ...evidence, verifiedAt: null }) ||
      priorPlan.jobs.length !== plan.jobs.length ||
      priorPlan.jobs.some(
        (job, i) =>
          job.id !== plan.jobs[i]?.id ||
          job.blindId !== plan.jobs[i]?.blindId ||
          job.promptHash !== plan.jobs[i]?.promptHash ||
          job.upperMicroUsd !== plan.jobs[i]?.upperMicroUsd,
      )
    )
      throw new Error("RECOVERY_EVIDENCE_OR_PLAN_DRIFT");
    const directory = `${output}/live`;
    const ledgerPath = `${directory}/ledger.json`;
    const rawLedger = readFileSync(ledgerPath, "utf8");
    const originalHash = hash(rawLedger);
    if (originalHash !== options.expectedLedgerHash)
      throw new Error("RECOVERY_LEDGER_HASH_MISMATCH");
    const ledger = ledgerSchema.parse(JSON.parse(rawLedger));
    if (
      ledger.fingerprint !== priorPlan.fingerprint ||
      ledger.entries.length !== 7 ||
      ledger.entries.filter((entry) => entry.state === "completed").length !== 6 ||
      ledger.entries.filter((entry) => entry.state === "reserved").length !== 1 ||
      ledger.entries[6]?.id !== options.recoverJob ||
      ledger.entries[6]?.chargedMicroUsd !== null ||
      ledger.entries[6]?.resultHash !== null ||
      ledger.entries[6]?.error !== null ||
      ledger.entries.some(
        (entry, i) =>
          entry.id !== priorPlan.jobs[i]?.id ||
          entry.blindId !== priorPlan.jobs[i]?.blindId ||
          entry.reservedMicroUsd !== priorPlan.jobs[i]?.upperMicroUsd,
      )
    )
      throw new Error("RECOVERY_UNEXPECTED_LEDGER");
    for (const entry of ledger.entries.slice(0, 6)) {
      if (!entry.resultHash || entry.chargedMicroUsd === null || entry.error !== null)
        throw new Error("RECOVERY_COMPLETED_ENTRY_INVALID");
      const result = JSON.parse(readFileSync(`${directory}/${entry.blindId}.json`, "utf8"));
      const blind = JSON.parse(readFileSync(`${directory}/blind/${entry.blindId}.json`, "utf8"));
      if (
        hash(JSON.stringify(result)) !== entry.resultHash ||
        result.fingerprint !== priorPlan.fingerprint ||
        blind.id !== entry.blindId ||
        blind.lyrics !== result.renderedLyrics
      )
        throw new Error("RECOVERY_ARTIFACT_MISMATCH");
    }
    // A stale lock must exist and the operator must independently confirm
    // that its process is gone. Never silently remove it.
    if (!existsSync(`${directory}/runner.lock`)) throw new Error("RECOVERY_LOCK_MISSING");
    const backupPath = `${directory}/ledger.pre-recovery-${originalHash}.json`;
    const auditPath = `${directory}/recovery-${originalHash}.json`;
    if (existsSync(backupPath) || existsSync(auditPath))
      throw new Error("RECOVERY_ALREADY_ATTEMPTED");
    const updated: Ledger = {
      fingerprint: plan.fingerprint,
      entries: ledger.entries.map((entry) =>
        entry.id === options.recoverJob
          ? { ...entry, state: "abandoned", error: "MANUALLY_ABANDONED_UNCERTAIN_BILLING" }
          : entry,
      ),
    };
    // Preserve original bytes and provenance; historic result hashes never change.
    const backup = openSync(backupPath, "wx", 0o600);
    try {
      writeFileSync(backup, rawLedger);
      fsyncSync(backup);
    } finally {
      closeSync(backup);
    }
    durableJson(
      auditPath,
      {
        originalLedgerSha256: originalHash,
        originalFingerprint: priorPlan.fingerprint,
        refreshedFingerprint: plan.fingerprint,
        abandonedJob: options.recoverJob,
        reservationMicroUsd: ledger.entries[6]!.reservedMicroUsd,
        originalEvidenceVerifiedAt: priorEvidence.verifiedAt,
        refreshedEvidenceVerifiedAt: evidence.verifiedAt,
        originalResultHashes: ledger.entries.slice(0, 6).map((entry) => entry.resultHash),
        note: "Historic result artifacts retain the original fingerprint and hashes.",
      },
      true,
    );
    durableJson(ledgerPath, updated);
    console.log(
      JSON.stringify(
        {
          recovered: true,
          completed: 6,
          abandoned: 1,
          pending: 17,
          originalLedgerSha256: originalHash,
          fingerprint: plan.fingerprint,
          backupPath,
          auditPath,
          lockStillPresent: true,
          providerCalls: 0,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!options.live) {
    const report = dryRun(plan);
    mkdirSync(`${output}/offline`, { recursive: true, mode: 0o700 });
    // Deterministic output: no keys, time, generated content, or environment state.
    writeFileSync(`${output}/offline/manifest.json`, `${JSON.stringify(report, null, 2)}\n`, {
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
      priorExposureMicroUsd: options.dOnly
        ? D_PRIOR_EXPOSURE_MICRO_USD
        : PRIOR_BENCHMARK_EXPOSURE_MICRO_USD,
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
          priorExposureUsd:
            (options.dOnly ? D_PRIOR_EXPOSURE_MICRO_USD : PRIOR_BENCHMARK_EXPOSURE_MICRO_USD) / 1e6,
          estimatedTotalExposureUsd:
            ((options.dOnly ? D_PRIOR_EXPOSURE_MICRO_USD : PRIOR_BENCHMARK_EXPOSURE_MICRO_USD) +
              ledger.entries.reduce(
                (sum, entry) => sum + (entry.chargedMicroUsd ?? entry.reservedMicroUsd),
                0,
              )) /
            1e6,
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
