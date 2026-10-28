/** Server-only local read adapter. Import via a server function, never from a client module. */
import { createHash } from "node:crypto";
import source from "../../research/atlas-v4-merged-evidence-20261027.json" with { type: "json" };
import template from "../../research/atlas-v4-636-evidence-tasks.json" with { type: "json" };
import library from "../data/song-atlas/v4/library.json" with { type: "json" };
import { validateAtlasResearch, projectAtlasResearchProfile } from "./atlas-research";
import type { AtlasResearch, AtlasResearchProfile } from "./atlas-research";

/** Digest of JSON.stringify(original parsed archive), distinct from the original byte SHA. */
export const ATLAS_RESEARCH_RUNTIME_FINGERPRINT =
  "1bc6804846f49d51163f00263103d628578de044af326cca54f3c614aa0afcf0";
export function assertAtlasResearchFingerprint(input: unknown): void {
  if (
    createHash("sha256").update(JSON.stringify(input)).digest("hex") !==
    ATLAS_RESEARCH_RUNTIME_FINGERPRINT
  )
    throw new Error("Atlas research runtime fingerprint mismatch");
}
let cached: AtlasResearch | undefined;
/**
 * Fail closed on fingerprint/envelope drift; quarantine invalid answers without repair. Static server-only JSON imports
 * survive bundling; the offline validator/tests attest the original byte hash.
 */
function validatedResearch(): AtlasResearch {
  if (!cached) {
    assertAtlasResearchFingerprint(source);
    cached = validateAtlasResearch(source, template, library);
  }
  return cached;
}
export function readAtlasResearch(): AtlasResearch {
  return structuredClone(validatedResearch());
}
export function readAtlasResearchProfile(profileId: string): AtlasResearchProfile {
  return projectAtlasResearchProfile(validatedResearch(), profileId);
}
