/** Offline only: validate the package, emit/check JSON Schema and content manifest. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { atlasV4StructuralSchema, validateAtlasV4 } from "../src/lib/song-atlas-v4";

const root = new URL("../", import.meta.url);
const path = "src/data/song-atlas/v4/";
const read = (p: string) => readFileSync(new URL(p, root));
const sha = (p: string) => createHash("sha256").update(read(p)).digest("hex");
const d = validateAtlasV4(JSON.parse(read(path + "library.json").toString("utf8")));
if (sha(d.source.rc1Path) !== d.source.rc1Sha256) throw new Error("RC1 bytes changed");
const original = JSON.parse(read(d.source.rc1Path).toString("utf8"));
const navigation = JSON.parse(read("src/data/song-atlas/navigation.json").toString("utf8"));
if (JSON.stringify(d.profiles.map((p) => p.taxonomy)) !== JSON.stringify(navigation.entries))
  throw new Error("V4 taxonomy no longer matches the reviewed Atlas navigation sidecar");
for (const p of original.profiles) {
  const v = d.profiles.find((v) => v.id === p.id);
  if (
    !v ||
    v.nameRu !== p.name_ru ||
    JSON.stringify(v.inheritedKnowledge) !== JSON.stringify(p.knowledge)
  )
    throw new Error("Lost RC1 identity/knowledge");
  for (const t of p.creative_techniques) {
    const v = d.techniques.find((v) => v.id === t.id);
    if (!v || v.instruction.en !== t.instruction_en) throw new Error("Lost RC1 technique wording");
  }
  for (const c of p.historical_claims) {
    if (
      JSON.stringify(d.inheritedClaimReviews.find((v) => v.id === c.id)?.original) !==
      JSON.stringify(c)
    )
      throw new Error("Lost RC1 claim provenance");
  }
}
for (const s of original.sources) {
  if (
    JSON.stringify(d.sources.find((v) => v.id === s.id)?.inheritedMetadata) !==
    JSON.stringify(s.metadata)
  )
    throw new Error("Lost RC1 source provenance");
}
const access = JSON.parse(read(path + "source-access.json").toString("utf8"));
const expectedUrls = new Set(
  original.sources.map((s: { metadata: { url?: string } }) => s.metadata.url).filter(Boolean),
);
if (
  access.receipts.length !== expectedUrls.size ||
  new Set(access.receipts.map((r: { requestedUrl: string }) => r.requestedUrl)).size !==
    expectedUrls.size
)
  throw new Error("Incomplete source access inventory");
for (const url of expectedUrls)
  if (!access.receipts.some((r: { requestedUrl: string }) => r.requestedUrl === url))
    throw new Error("Missing source access receipt");

const schema =
  JSON.stringify(
    {
      ...z.toJSONSchema(atlasV4StructuralSchema),
      $id: "https://promptbeats.app/schemas/song-atlas-library-v4.schema.json",
    },
    null,
    2,
  ) + "\n";
const manifest =
  JSON.stringify(
    {
      format: "promptbeats-atlas-v4-manifest",
      version: 1,
      libraryVersion: d.libraryVersion,
      baseMain: d.source.baseMain,
      files: [d.source.rc1Path, path + "library.json", path + "source-access.json"].map((p) => ({
        path: p,
        sha256: sha(p),
        bytes: read(p).length,
      })),
      counts: {
        profiles: d.profiles.length,
        legacyTechniques: d.techniques.filter((t) => t.origin === "rc1").length,
        newTechniques: d.techniques.filter((t) => t.origin === "v4").length,
        inheritedSources: original.sources.length,
        totalSources: d.sources.length,
        sourcePassages: d.evidence.length,
        inheritedClaims: d.inheritedClaimReviews.length,
        excludedCandidates: d.excludedCandidates.length,
        specificKnowledgeGaps: d.unresolvedEvidence.length,
      },
      readiness: {
        technicalContract: "validated",
        independentEditorialReview: "required",
        generatorTransfer: "blocked",
        productionChanges: "none",
      },
    },
    null,
    2,
  ) + "\n";
// Format generated artifacts through the same formatter used by the repository.
const { format, resolveConfig } = await import("prettier");
const formatterConfig = await resolveConfig(fileURLToPath(new URL("package.json", root)));
for (const [name, content] of [
  ["schema.json", schema],
  ["manifest.json", manifest],
]) {
  const formatted = await format(content, { ...formatterConfig, parser: "json" });
  if (process.argv.includes("--write")) writeFileSync(new URL(path + name, root), formatted);
  else if (
    read(path + name)
      .toString("utf8")
      .replace(/\r\n/g, "\n") !== formatted
  )
    throw new Error(`Stale V4 ${name}; run bun scripts/validate-atlas-v4.ts --write`);
}
console.log(
  JSON.stringify({
    status: "PASS",
    profiles: d.profiles.length,
    techniques: d.techniques.length,
    sourcePassages: d.evidence.length,
    generatorTransfer: false,
    editorialCertification: false,
  }),
);
