import { createRestorationPolicy } from "./football-independent-restoration.server";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ModelCaller, ModelResult } from "./ai-provider.server";
import type { OddsTarget } from "./football-odds.shared";
import { publisherFor } from "./football-prediction-consensus.shared";
import {
  traceFootballFixture,
  extractLiteralPicks,
  descriptiveMarketKey,
  independentAssessmentSchema,
  coherentDescriptiveSelection,
} from "./football-evidence-v2.shared";
import {
  FULL_READING_RULES,
  FULL_EXTRACTION_TOKENS,
  FULL_FINAL_TOKENS,
  utf8Bytes,
  fullCandidateSchema,
  fullEvidenceSchema,
  FullEvidenceValidationError,
  fullJudgmentSchema,
  validateFullReport,
  type FullEvidenceHit,
  type FullEvidenceReport,
  type FullCandidate,
} from "./football-full-evidence.shared";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export function fullExecutionId(run: string, index: number) {
  const x = digest(`football-full-v1:${run}:${index}`);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}
export async function footballFullModelCapacity(
  model: string,
  signal?: AbortSignal,
): Promise<{ context: number | null; output: number | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_models" as never)
    .select("context_window,max_output_tokens")
    .eq("provider", "openrouter")
    .eq("provider_model_id", model)
    .abortSignal(AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(5000)]))
    .maybeSingle();
  const r = data as { context_window?: number; max_output_tokens?: number } | null;
  return error
    ? { context: null, output: null }
    : { context: r?.context_window ?? null, output: r?.max_output_tokens ?? null };
}
export function makeFullSources(hits: FullEvidenceHit[]) {
  const seen = new Map<string, { id: string; digest: string }>();
  return hits.map((h, i) => {
    const id = `src-${digest((h.url ?? "unsafe") + ":" + i).slice(0, 24)}`;
    const prior = h.url ? seen.get(h.url) : undefined;
    const duplicateOf = prior?.digest === digest(h.text) ? prior.id : undefined;
    if (h.url && !prior) seen.set(h.url, { id, digest: digest(h.text) });
    return {
      ...h,
      id,
      fingerprint: digest(h.text.replace(/\s+/g, " ")),
      text: duplicateOf ? "" : h.text,
      manifest: {
        id,
        url: h.url,
        title: h.title.slice(0, 180),
        language: h.language ?? "en",
        accessedAt: h.accessedAt,
        ...(h.publishedAtUtc ? { publishedAtUtc: h.publishedAtUtc } : {}),
        status: duplicateOf ? ("duplicate" as const) : h.status,
        ...(duplicateOf ? { duplicateOf } : {}),
        publisherFamily: h.url ? (publisherFor(h.url)?.origin ?? null) : null,
        digest: digest(h.text),
        rawChars: h.rawChars,
        cleanedChars: h.cleanedChars,
        snippetChars: h.snippetChars,
        availableBytes: utf8Bytes(h.text),
        readBytes: 0,
        readBy: [] as number[],
        providerCompleteness: "unknown" as const,
      },
    };
  });
}
export function verifyFullCandidates(
  raw: unknown,
  docs: ReturnType<typeof makeFullSources>,
  fixture: OddsTarget,
  cutoff: string,
): FullCandidate[] {
  const checked = z.array(fullCandidateSchema).max(80).safeParse(raw);
  if (!checked.success) throw Error("invalid_extraction");
  const traces = new Map(
    docs.map((d) => [
      d.id,
      traceFootballFixture(d.text, fixture, cutoff, { searchProfileVersion: "v2_experimental" }),
    ]),
  );
  const per = new Map<string, number>();
  return checked.data.map((c, id) => {
    const s = docs.find((s) => s.id === c.sourceId);
    const reasons: string[] = [];
    const quoteVerified = !!s?.text.includes(c.quote);
    const fixtureVerified =
      !!s &&
      traces.get(s.id)?.status === "verified" &&
      (!s.publishedAtUtc || Date.parse(s.publishedAtUtc) <= Date.parse(cutoff)) &&
      Date.parse(s.accessedAt) <= Date.parse(cutoff);
    const copy =
      !!s &&
      docs.some(
        (d) =>
          d.id !== s.id &&
          d.text.length > 120 &&
          d.fingerprint === s.fingerprint &&
          docs.indexOf(d) < docs.indexOf(s),
      );
    const attributed =
      !!s &&
      /according to|originally published|syndicated|courtesy of|σύμφωνα με|по данным/iu.test(
        s.text,
      );
    const unsafe =
      /\b(?:not|avoid|maybe|perhaps|odds|coefficient)\b|δεν|όχι|ίσως|не\s|возможно|коэффициент/iu.test(
        c.quote,
      );
    const literal = extractLiteralPicks(c.quote, fixture, "v2_experimental").some(
      (p) =>
        p.stance === "authored" &&
        descriptiveMarketKey(p.market) === descriptiveMarketKey(c.market),
    );
    const independenceConfirmed = !!s?.manifest.publisherFamily && !copy && !attributed;
    if (!s) reasons.push("unknown_source");
    if (!quoteVerified) reasons.push("quote_mismatch");
    if (!fixtureVerified) reasons.push("fixture_unverified");
    if (s?.status !== "full_or_partial_raw_text") reasons.push("limited_source_text");
    if (!independenceConfirmed)
      reasons.push(copy ? "copied_publication" : "independence_unconfirmed");
    if (c.kind !== "editorial" || unsafe) reasons.push("not_verified_editorial");
    if (!literal) reasons.push("market_stance_unconfirmed");
    const n = (per.get(c.sourceId) ?? 0) + 1;
    per.set(c.sourceId, n);
    if (n > 4) reasons.push("candidate_limit");
    return {
      ...c,
      id,
      quoteVerified,
      fixtureVerified,
      independenceConfirmed,
      eligibleForConsensus: reasons.length === 0,
      reasons,
    };
  });
}
type Chunk = { sourceId: string; start: number; end: number; text: string };
const EXTRACTION_SYSTEM =
  FULL_READING_RULES +
  " Return only {evidenceCandidates:[...]} for these chunks; do not synthesize or fetch anything.";
function extractionPrompt(
  chunks: Chunk[],
  docs: ReturnType<typeof makeFullSources>,
  fixture: unknown,
) {
  const ids = new Set(chunks.map((c) => c.sourceId));
  return JSON.stringify({
    fixture,
    sourceManifest: docs
      .filter((d) => ids.has(d.id))
      .map((d) => {
        const { readBytes: _, readBy: __, ...metadata } = d.manifest;
        return metadata;
      }),
    readingChunks: chunks,
  });
}
export function fullCoveragePlan(
  docs: ReturnType<typeof makeFullSources>,
  system: string,
  context: unknown,
  capacity: { context: number | null; output: number | null },
  readingRules = FULL_READING_RULES,
  extractionRules = EXTRACTION_SYSTEM,
) {
  if (
    !Number.isSafeInteger(capacity.context) ||
    !capacity.context ||
    capacity.context <= 20480 ||
    !capacity.output ||
    capacity.output < FULL_FINAL_TOKENS
  )
    return { reason: "capacity_unknown" as const };
  const limit = Math.min(262144, capacity.context - FULL_FINAL_TOKENS - 4096),
    base = {
      context,
      sources: docs
        .filter((d) => d.text)
        .map((d) => ({
          sourceId: d.id,
          url: d.url,
          title: d.title,
          queryLanguage: d.manifest.language,
          accessedAt: d.accessedAt,
          ...(d.publishedAtUtc ? { publishedAtUtc: d.publishedAtUtc } : {}),
          digest: d.manifest.digest,
          providerCompleteness: "unknown",
          textKind: d.status,
          text: d.text,
        })),
    };
  const prompt = JSON.stringify(base);
  if (utf8Bytes(system + readingRules + prompt) <= limit)
    return { mode: "single_full_text" as const, prompt, limit };
  if (
    utf8Bytes(
      system +
        readingRules +
        JSON.stringify({ context, sources: docs.map((d) => d.manifest), validatedCandidates: [] }),
    ) > limit
  )
    return { reason: "capacity_exceeded" as const };
  const groups: Chunk[][] = [];
  let group: Chunk[] = [];
  const fits = (v: Chunk[]) =>
    utf8Bytes(
      extractionRules + extractionPrompt(v, docs, (context as { fixture?: unknown }).fixture),
    ) <= limit;
  for (const d of docs.filter((d) => d.text))
    for (let start = 0; start < d.text.length;) {
      let lo = start + 1,
        hi = d.text.length,
        best = start;
      while (lo <= hi) {
        const midpoint = Math.floor((lo + hi) / 2);
        let end = midpoint;
        if (end < d.text.length && /[\uD800-\uDBFF]/u.test(d.text[end - 1]!)) end--;
        if (end <= start) {
          lo = midpoint + 1;
          continue;
        }
        const ch = { sourceId: d.id, start, end, text: d.text.slice(start, end) };
        if (fits([...group, ch])) {
          best = end;
          lo = midpoint + 1;
        } else hi = midpoint - 1;
      }
      if (best === start) {
        if (!group.length) return { reason: "capacity_exceeded" as const };
        groups.push(group);
        group = [];
        if (groups.length >= 4) return { reason: "capacity_exceeded" as const };
        continue;
      }
      group.push({ sourceId: d.id, start, end: best, text: d.text.slice(start, best) });
      start = best;
      if (start < d.text.length) {
        groups.push(group);
        group = [];
        if (groups.length >= 4) return { reason: "capacity_exceeded" as const };
      }
    }
  if (group.length) groups.push(group);
  if (groups.length > 4) return { reason: "capacity_exceeded" as const };
  return { mode: "staged_extraction" as const, groups, limit };
}
export type FullEvidencePolicy = {
  readingRules: string;
  candidateSchema?: z.ZodType<{ sourceId: string; quote: string }>;
  prepareDocs?: (docs: ReturnType<typeof makeFullSources>) => void;
  verify: typeof verifyFullCandidates;
  synthesisData?: () => unknown;
  judge: (
    raw: unknown,
    docs: ReturnType<typeof makeFullSources>,
    report: FullEvidenceReport,
  ) => import("zod").infer<typeof fullJudgmentSchema>;
};
export type FullEvidenceRunInput = {
  policy?: FullEvidencePolicy;
  restoration?: boolean;
  fixture: OddsTarget;
  cutoff: string;
  runId: string;
  hits: FullEvidenceHit[];
  context: Record<string, unknown>;
  system: string;
  providerUrls: string[];
  capacity: { context: number | null; output: number | null };
  signal: AbortSignal;
  caller: (id: string) => ModelCaller;
  authorize: () => Promise<void>;
  journal: (r: FullEvidenceReport) => Promise<void>;
};
export class FullCoverageError extends Error {
  constructor(
    public report: FullEvidenceReport,
    public failureDetail?: import("./football-full-evidence.shared").FullEvidenceFailureDetail,
  ) {
    super("incomplete_coverage");
  }
}
export async function runFullFootballEvidence(
  input: FullEvidenceRunInput,
): Promise<{ receipt: ModelResult; report: FullEvidenceReport }> {
  if (input.restoration) {
    const { policy, decorate } = createRestorationPolicy(input);
    try {
      const result = await runFullFootballEvidence({
        ...input,
        restoration: false,
        policy,
        journal: (r) => input.journal(decorate(r)),
      });
      return { ...result, report: decorate(result.report) };
    } catch (e) {
      if (e instanceof FullCoverageError)
        throw new FullCoverageError(decorate(e.report), e.failureDetail);
      throw e;
    }
  }
  const docs = makeFullSources(input.hits);
  input.policy?.prepareDocs?.(docs);
  const readingRules = input.policy?.readingRules ?? FULL_READING_RULES;
  const verify = input.policy?.verify ?? verifyFullCandidates;
  const report: FullEvidenceReport = {
    version: 1,
    fixture: input.fixture,
    cutoff: input.cutoff,
    coverage: "incomplete_coverage",
    reason: "pending",
    mode: "not_dispatched",
    sources: docs.map((d) => d.manifest),
    candidates: [],
    calls: [],
    citedSourceIds: [],
    providerCitations: [],
    counts: {
      discovered: docs.length,
      readable: docs.filter(
        (d) => d.status === "full_or_partial_raw_text" && !d.manifest.duplicateOf,
      ).length,
      snippetOnly: docs.filter((d) => d.manifest.status === "snippet_only").length,
      uniqueRead: 0,
      editorialCandidates: 0,
      independentPublishers: 0,
      cited: 0,
    },
  };
  const checkpoint = async () => {
    report.counts.uniqueRead = report.sources.filter(
      (s) => s.readBytes > 0 && s.readBytes === s.availableBytes,
    ).length;
    report.counts.editorialCandidates = report.candidates.filter(
      (c) => c.kind === "editorial" && c.quoteVerified && c.fixtureVerified,
    ).length;
    report.counts.independentPublishers = new Set(
      report.candidates
        .filter((c) => c.eligibleForConsensus)
        .map((c) => docs.find((d) => d.id === c.sourceId)?.manifest.publisherFamily),
    ).size;
    report.counts.cited = new Set([
      ...report.citedSourceIds.map((id) => report.sources.find((s) => s.id === id)?.url),
      ...report.providerCitations,
    ]).size;
    const checked = fullEvidenceSchema.parse(report);
    if (!validateFullReport(checked)) throw Error("Invalid coverage journal");
    await input.journal(checked);
  };
  const fail = async (
    reason: FullEvidenceReport["reason"],
    failureDetail?: import("./football-full-evidence.shared").FullEvidenceFailureDetail,
  ) => {
    report.reason = reason;
    await checkpoint();
    throw new FullCoverageError(report, failureDetail);
  };
  const plan = fullCoveragePlan(
    docs,
    input.system,
    input.context,
    input.capacity,
    readingRules,
    input.policy
      ? readingRules + " Return only {evidenceCandidates:[...]} for these chunks."
      : EXTRACTION_SYSTEM,
  );
  await checkpoint();
  if ("reason" in plan) return await fail(plan.reason);
  report.mode = plan.mode;
  if (!docs.some((d) => d.text)) return await fail("capacity_exceeded");
  const call = async (
    stage: "extract" | "read_and_synthesize" | "synthesize",
    system: string,
    prompt: string,
    chunks: Chunk[],
  ) => {
    if (input.signal.aborted) return await fail("deadline");
    try {
      await input.authorize();
    } catch {
      return await fail("authorization_changed");
    }
    const index = report.calls.length;
    if (index >= 5 || utf8Bytes(system + prompt) > plan.limit)
      return await fail("capacity_exceeded");
    const id = fullExecutionId(input.runId, index),
      maxTokens = stage === "extract" ? FULL_EXTRACTION_TOKENS : FULL_FINAL_TOKENS;
    const record: FullEvidenceReport["calls"][number] = {
      index,
      executionId: id,
      stage,
      state: "unconfirmed",
      inputBytes: utf8Bytes(system + prompt),
      inputDigest: digest(system + prompt),
      inputTokenUpperBound: utf8Bytes(system + prompt) + 4096,
      maxOutputTokens: maxTokens,
      sourceIds: [...new Set(chunks.map((c) => c.sourceId))],
      usage: null,
    };
    report.calls.push(record);
    await checkpoint();
    let receipt: ModelResult;
    try {
      receipt = await new Promise<ModelResult>((resolve, reject) => {
        const aborted = () => reject(new Error("deadline"));
        input.signal.addEventListener("abort", aborted, { once: true });
        if (input.signal.aborted) {
          input.signal.removeEventListener("abort", aborted);
          reject(Error("deadline"));
          return;
        }
        Promise.resolve()
          .then(() =>
            input.caller(id)({
              system,
              prompt,
              maxTokens,
              abortSignal: input.signal,
              requestTimeoutMs: 90000,
              jsonObjectOutput: true,
            }),
          )
          .then(resolve, reject)
          .finally(() => input.signal.removeEventListener("abort", aborted));
      });
    } catch {
      return await fail(input.signal.aborted ? "deadline" : "model_uncertain");
    }
    record.state = "observed";
    record.usage = receipt.usage
      ? {
          inputTokens: receipt.usage.inputTokens,
          outputTokens: receipt.usage.outputTokens,
          totalTokens: receipt.usage.totalTokens,
          ...(receipt.usage.providerReportedCostUsd !== undefined
            ? { providerReportedCostUsd: receipt.usage.providerReportedCostUsd }
            : {}),
        }
      : null;
    for (const c of chunks) {
      const s = report.sources.find((s) => s.id === c.sourceId)!;
      s.readBytes += utf8Bytes(c.text);
      if (!s.readBy.includes(index)) s.readBy.push(index);
    }
    await checkpoint();
    if (receipt.stopReason !== "end_turn") return await fail("invalid_extraction");
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(receipt.text);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    } catch {
      return await fail("invalid_extraction");
    }
    return { receipt, raw };
  };
  let final: { receipt: ModelResult; raw: Record<string, unknown> };
  if (plan.mode === "single_full_text")
    final = await call(
      "read_and_synthesize",
      input.system + "\n" + readingRules,
      plan.prompt,
      docs
        .filter((d) => d.text)
        .map((d) => ({ sourceId: d.id, start: 0, end: d.text.length, text: d.text })),
    );
  else {
    const candidates: unknown[] = [];
    for (const group of plan.groups) {
      const r = await call(
        "extract",
        input.policy
          ? readingRules + " Return only {evidenceCandidates:[...]} for these chunks."
          : EXTRACTION_SYSTEM,
        extractionPrompt(group, docs, input.fixture),
        group,
      );
      const c = z
        .array(input.policy?.candidateSchema ?? fullCandidateSchema)
        .max(80)
        .safeParse(r.raw["evidenceCandidates"]);
      if (!c.success) return await fail("invalid_extraction");
      for (const v of c.data) {
        const d = docs.find((d) => d.id === v.sourceId);
        if (!d || !group.some((g) => g.sourceId === d.id && g.text.includes(v.quote)))
          return await fail("invalid_extraction");
        candidates.push(v);
      }
    }
    if (candidates.length > 80) return await fail("invalid_extraction");
    try {
      report.candidates = verify(candidates, docs, input.fixture, input.cutoff);
    } catch {
      return await fail("invalid_extraction");
    }
    await checkpoint();
    const prompt = JSON.stringify({
      context: input.context,
      readingMode: "staged_validated_extraction_not_raw",
      sources: report.sources,
      ...(input.policy?.synthesisData ? {} : { validatedCandidates: report.candidates }),
      ...(input.policy?.synthesisData ? { restoredEvidence: input.policy.synthesisData() } : {}),
    });
    final = await call(
      "synthesize",
      input.system +
        "\n" +
        readingRules +
        " All source chunks were examined in prior stages. Return the main assessment and independentAssessment; do not replace server validated candidates.",
      prompt,
      [],
    );
  }
  if (plan.mode === "single_full_text") {
    try {
      report.candidates = verify(
        final.raw["evidenceCandidates"],
        docs,
        input.fixture,
        input.cutoff,
      );
    } catch {
      return await fail("invalid_extraction");
    }
  }
  let j: import("zod").infer<typeof fullJudgmentSchema>;
  if (input.policy) {
    try {
      j = input.policy.judge(final.raw["independentAssessment"], docs, report);
    } catch (error) {
      return await fail(
        "invalid_judgment",
        error instanceof FullEvidenceValidationError
          ? error.detail
          : "assessment_validation_failed",
      );
    }
  } else {
    const judgment = fullJudgmentSchema.safeParse(final.raw["independentAssessment"]);
    if (!judgment.success) return await fail("invalid_judgment", "judgment_schema_invalid");
    j = judgment.data;
    const allowed = new Set([
      ...docs
        .filter(
          (d) =>
            d.url &&
            d.text &&
            Date.parse(d.accessedAt) <= Date.parse(input.cutoff) &&
            (!d.publishedAtUtc || Date.parse(d.publishedAtUtc) <= Date.parse(input.cutoff)) &&
            traceFootballFixture(d.text, input.fixture, input.cutoff, {
              searchProfileVersion: "v2_experimental",
            }).status === "verified",
        )
        .map((d) => d.url!),
      ...input.providerUrls,
    ]);
    if (
      j.evidenceUrls.some((u) => !allowed.has(u)) ||
      j.supportingClaimIds.length ||
      /guaranteed|sure bet|\+ev|%|εγγυημέν|гарантир/iu.test(
        j.rationale + (j.jointRationale ?? ""),
      ) ||
      (j.selection && j.selection.kind !== "other" && !coherentDescriptiveSelection(j.selection))
    )
      return await fail(
        "invalid_judgment",
        j.evidenceUrls.some((u) => !allowed.has(u))
          ? "unapproved_source_reference"
          : j.supportingClaimIds.length
            ? "unknown_source_reference"
            : "prohibited_claim",
      );
    if (
      j.selection?.kind === "and" &&
      (!j.jointRationale ||
        !j.evidenceUrls.some((u) => input.providerUrls.includes(u)) ||
        !report.candidates.some(
          (c) =>
            c.eligibleForConsensus &&
            descriptiveMarketKey(c.market) === descriptiveMarketKey(j.selection!) &&
            j.evidenceUrls.includes(docs.find((d) => d.id === c.sourceId)?.url ?? ""),
        ))
    )
      return await fail("invalid_judgment", "invalid_combination");
    if (
      report.candidates.some(
        (c) => c.kind === "editorial" && c.quoteVerified && c.fixtureVerified,
      ) &&
      /no (?:published )?(?:predictions?|picks?)|δεν (?:βρέθηκε|βρέθηκαν|υπάρχει|υπάρχουν).{0,35}(?:πρόβλεψη|προβλέψεις|προγνωστικ)/iu.test(
        j.rationale,
      )
    )
      return await fail("invalid_judgment", "published_prediction_conflict");
  }
  const citedDocs = docs.filter((d) => d.url && d.text && j.evidenceUrls.includes(d.url));
  for (const url of new Set(citedDocs.map((d) => d.url))) {
    const versions = citedDocs.filter((d) => d.url === url);
    if (versions.length > 1 && !versions.some((d) => j.evidenceSourceIds?.includes(d.id)))
      return await fail("invalid_judgment", "ambiguous_source_reference");
  }
  if (j.evidenceSourceIds?.some((id) => !citedDocs.some((d) => d.id === id)))
    return await fail("invalid_judgment", "unknown_source_reference");
  report.judgment = j;
  report.citedSourceIds = j.evidenceSourceIds ?? citedDocs.map((d) => d.id);
  report.providerCitations = j.evidenceUrls.filter((u) => input.providerUrls.includes(u));
  report.coverage = "complete";
  report.reason = "complete";
  await checkpoint();
  const total = (key: "inputTokens" | "outputTokens" | "totalTokens") =>
    report.calls.some((c) => c.usage?.[key] == null)
      ? null
      : report.calls.reduce((s, c) => s + (c.usage?.[key] ?? 0), 0);
  return {
    receipt: {
      ...final.receipt,
      usage: {
        inputTokens: total("inputTokens"),
        outputTokens: total("outputTokens"),
        totalTokens: total("totalTokens"),
      },
    },
    report: fullEvidenceSchema.parse(report),
  };
}
