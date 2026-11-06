import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { descriptiveMarketKey } from "../../src/lib/football-evidence-v2.shared";
import { buildFootballClaimLedger } from "../../src/lib/football-evidence-v2.server";
import {
  buildFootballPredictionConsensus,
  extractFootballPredictionReferences,
} from "../../src/lib/football-prediction-consensus.shared";
import { buildFootballSourceSnapshot } from "../../src/lib/football-ai-source-snapshot.shared";
import { oddsTargetSchema } from "../../src/lib/football-odds.shared";
import { z } from "zod";
const document = z.object({
  title: z.string().max(2000),
  url: z.string().url(),
  accessedAt: z.string().datetime(),
  text: z.string().max(24000),
  truncated: z.boolean().optional(),
  researchIntent: z.enum(["match_facts", "external_forecasts"]).optional(),
  publishedAtUtc: z.string().datetime().optional(),
  queryLanguage: z.enum(["el", "en", "ru", "mixed", "unknown"]).optional(),
  annotation: z
    .object({
      authoredMarkets: z.array(z.string()),
      fixtureCountable: z.boolean(),
      reviewer: z.string().min(1),
      reviewedAt: z.string().datetime(),
    })
    .strict()
    .optional(),
});
const corpusSchema = z.object({
  fixture: oddsTargetSchema,
  cutoff: z
    .string()
    .refine((s) => Number.isFinite(Date.parse(s)))
    .transform((s) => new Date(s).toISOString()),
  provenance: z.string().min(1),
  documents: z.array(document).min(1).max(1000),
});
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: bun scripts/tests/football-evidence-replay.ts <local-corpus.json> <outside-repository-output-directory>",
  );
const root = resolve(import.meta.dir, "../.."),
  out = resolve(output);
if (out === root || out.startsWith(root + "\\") || out.startsWith(root + "/"))
  throw Error("Artifacts must be outside repository");
const bytes = readFileSync(input),
  corpus = corpusSchema.parse(JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")));
const rows = corpus.documents.map((d) => {
  const v1 = buildFootballSourceSnapshot([
    {
      ...d,
      excerpt: d.text.slice(0, 2500),
      researchIntent: d.researchIntent ?? "external_forecasts",
    },
  ]);
  const baseline = buildFootballPredictionConsensus(
    corpus.fixture,
    v1,
    { onlinePredictions: extractFootballPredictionReferences(corpus.fixture, v1) },
    corpus.cutoff,
  );
  const candidate = buildFootballClaimLedger(corpus.fixture, [d], corpus.cutoff);
  const prefixAblations = Object.fromEntries(
    [650, 2500, 4000].map((limit) => [
      String(limit),
      buildFootballClaimLedger(
        corpus.fixture,
        [{ ...d, text: d.text.slice(0, limit), truncated: d.text.length > limit }],
        corpus.cutoff,
      ).sourceCount,
    ]),
  );
  return {
    url: d.url,
    sha256: createHash("sha256").update(d.text).digest("hex"),
    savedTruncated: !!d.truncated,
    prefixAblations,
    queryLanguage: d.queryLanguage ?? "unknown",
    baseline: { sourceCount: baseline.sourceCount, exclusions: baseline.excluded },
    candidate,
    annotation: d.annotation ?? null,
  };
});
const confusion = rows
  .filter((r) => r.annotation)
  .reduce(
    (totals, r) => {
      const expected = new Set(r.annotation!.fixtureCountable ? r.annotation!.authoredMarkets : []);
      const actual = new Set(
        r.candidate.claims.filter((c) => c.countable).map((c) => descriptiveMarketKey(c.market)),
      );
      for (const key of actual)
        if (expected.has(key)) totals.tp++;
        else totals.fp++;
      for (const key of expected) if (!actual.has(key)) totals.fn++;
      return totals;
    },
    { tp: 0, fp: 0, fn: 0 },
  );
const metrics = {
  ...confusion,
  precision: confusion.tp + confusion.fp ? confusion.tp / (confusion.tp + confusion.fp) : null,
  recall: confusion.tp + confusion.fn ? confusion.tp / (confusion.tp + confusion.fn) : null,
  scope: "Only explicit supplied annotations; not full-article/discovery quality",
};
const result = {
  metrics,
  corpusSha256: createHash("sha256").update(bytes).digest("hex"),
  provenance: corpus.provenance,
  documents: rows.length,
  annotated: rows.filter((r) => r.annotation).length,
  queryLanguageCoverage: Object.fromEntries(
    ["el", "en", "ru", "mixed", "unknown"].map((language) => [
      language,
      {
        documents: rows.filter((r) => r.queryLanguage === language).length,
        annotated: rows.filter((r) => r.queryLanguage === language && r.annotation).length,
      },
    ]),
  ),
  ablations: {
    prefixOnlyOrigins: Object.fromEntries(
      [650, 2500, 4000].map((limit) => [
        String(limit),
        rows.reduce((total, r) => total + Number(r.prefixAblations[String(limit)]), 0),
      ]),
    ),
    fullBoundedOrigins: rows.reduce((total, r) => total + r.candidate.sourceCount, 0),
    legacyFixtureAndParserProjection: rows.reduce((total, r) => total + r.baseline.sourceCount, 0),
  },
  realDiscoveryBenchmark: "NOT_MEASURED",
  resultsPerSearchAB: "NOT_MEASURED",
  nativeLatinAB: "NOT_MEASURED",
  extractExperiment: "DISABLED_UNMEASURED",
  llmExtraction: "DISABLED_UNMEASURED",
  rows,
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "replay.json"), JSON.stringify(result, null, 2));
writeFileSync(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      inputSha256: result.corpusSha256,
      sourceHashes: rows.map((r) => ({ url: r.url, sha256: r.sha256 })),
      schema: "saved-text-corpus-v1",
      notRawApiReplay: true,
    },
    null,
    2,
  ),
);
writeFileSync(
  join(out, "replay.md"),
  `# Offline frozen evidence replay\n\nDocuments: ${rows.length}. Supplied annotations: ${result.annotated} (see provenance/reviewer; synthetic labels are not human web ground truth).\nProvenance: ${corpus.provenance}\nNot a raw API replay or query discovery benchmark. No network calls.\n\n|Source|V1 origins|V2 origins|V2 predicate failures|\n|---|---:|---:|---|\n${rows.map((r) => `|${new URL(r.url).hostname}|${r.baseline.sourceCount}|${r.candidate.sourceCount}|${r.candidate.sources[0]?.trace.failures.join(", ") ?? "unavailable"}|`).join("\n")}\n\nPrecision/recall is NOT_ESTIMABLE without reviewed authored-pick ground truth. Discovery/results-per-search/extract/LLM experiments are unmeasured and disabled.\n`,
);
console.log(
  JSON.stringify({
    documents: rows.length,
    annotated: result.annotated,
    v1Origins: rows.reduce((a, r) => a + r.baseline.sourceCount, 0),
    v2Origins: rows.reduce((a, r) => a + r.candidate.sourceCount, 0),
    output: out,
  }),
);
