/** Offline integrity and quarantine report. Quarantine is explicit, not clean research. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import source from "../research/atlas-v4-merged-evidence-20261027.json";
import template from "../research/atlas-v4-636-evidence-tasks.json";
import library from "../src/data/song-atlas/v4/library.json";
import manifest from "../research/atlas-v4-merged-evidence-20261027.manifest.json";
import { ATLAS_RESEARCH_SHA, validateAtlasResearch } from "../src/lib/atlas-research";
import { readAtlasResearch } from "../src/lib/atlas-research.server";
import worksheet from "../research/atlas-v4-123-technique-review.json";
import independentReview from "../research/atlas-v4-123-technique-independent-review.json";
import { validateAtlasTechniqueReview } from "../src/lib/atlas-technique-review";
import { validateAtlasV4 } from "../src/lib/song-atlas-v4";
import resumeManifest from "../research/atlas-v4-resume-20261031.manifest.json";

if (manifest.files[0]?.sha256 !== ATLAS_RESEARCH_SHA)
  throw new Error("Original archive digest pin changed");
for (const file of manifest.files) {
  const b = readFileSync(new URL("../" + file.path, import.meta.url));
  if (b.length !== file.bytes || createHash("sha256").update(b).digest("hex") !== file.sha256)
    throw new Error("Manifest mismatch: " + file.path);
}
const result = validateAtlasResearch(source, template, library);
console.log("PASS structural ingestion: 636 tasks; exact bytes, metadata, order and V4 parity.");
console.log(JSON.stringify(result.validation, null, 2));
console.log("Research is NOT clean: quarantined tasks expose no statements or citations.");
for (const task of result.tasks.filter((t) => t.quarantined))
  console.log(task.gapId + ": " + task.validationIssues.join("; "));
const revised = readAtlasResearch();
if (
  resumeManifest.sourceArchiveSha256 !== ATLAS_RESEARCH_SHA ||
  resumeManifest.liveGeneratorTransfer ||
  !resumeManifest.independentMusicologicalReviewRequired ||
  resumeManifest.files.length !== 2
)
  throw new Error("Invalid resumption manifest boundary");
for (const file of resumeManifest.files) {
  const bytes = readFileSync(new URL("../" + file.path, import.meta.url));
  if (
    bytes.length !== file.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  )
    throw new Error("Resumption artifact mismatch: " + file.path);
}
if (revised.validation.eligibleTaskCount !== 636 || revised.validation.quarantinedGapIds.length)
  throw new Error("Metadata overlay does not resolve the exact eighteen quarantines");
console.log(
  "PASS metadata-only revision: 636 schema-eligible records; claims/approvals not certified",
);
console.log(
  JSON.stringify(
    validateAtlasTechniqueReview(validateAtlasV4(library), worksheet, independentReview),
  ),
);
