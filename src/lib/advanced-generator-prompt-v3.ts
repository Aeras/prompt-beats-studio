import { buildAdvancedGeneratorPromptV2 } from "./advanced-generator-prompt-v2";
import { withV3MusicalPlanning } from "./advanced-generator-v3-review";

/** V3 is V2 with one short composition-time phrasing instruction. */
export function buildAdvancedGeneratorPromptV3(original: string): string {
  return withV3MusicalPlanning(buildAdvancedGeneratorPromptV2(original));
}
