/** Offline integrity and quarantine report. Quarantine is explicit, not clean research. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import source from "../research/atlas-v4-merged-evidence-20261027.json";
import template from "../research/atlas-v4-636-evidence-tasks.json";
import library from "../src/data/song-atlas/v4/library.json";
import manifest from "../research/atlas-v4-merged-evidence-20261027.manifest.json";
import { ATLAS_RESEARCH_SHA, validateAtlasResearch } from "../src/lib/atlas-research";

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
