type AdvancedSunoRuntimeInput = {
  operation: string;
  targetPlatform: string;
  instructions: string;
  inputSnapshot?: { generatorMode?: string } | null;
};

export const ADVANCED_SUNO_ENRICHMENT_INSTRUCTION = `PROMPTBEATS INTERNAL MODE — ADVANCED SUNO
- This is an Advanced Generator creation. Apply the Suno Advanced Production Enrichment rules in this same and only generation call.
- The final Music Style (\"tags\") must keep its essential musical identity and, when the generated Producer's Note contains useful production or arrangement information not already represented there, incorporate the highest-value such cues into Music Style in concise ENGLISH.
- Prioritize actionable musical direction such as instrument entrances/exits, lead-instrument moments, verse/chorus contrast, builds, drops, breakdowns, pauses, dynamics, vocal treatment, ambience, production texture, arrangement transitions and section-specific instrumental behavior.
- Do not copy narrative/story commentary from the Producer's Note into Music Style. Transfer only generator-useful musical/production information.
- Producer's Note itself must remain in the requested song language.
- Do not repeat information already present in Music Style. Use only the remaining Suno character budget and keep the complete final Music Style at 1000 characters or fewer.
- If there is available character space and the Producer's Note contains genuinely useful production information not already represented in Music Style, include at least the most important applicable cue rather than returning an unchanged minimal Music Style.`;

export function withAdvancedSunoEnrichmentInstruction<T extends AdvancedSunoRuntimeInput>(input: T): T {
  const isAdvancedSunoGeneration =
    input.operation === "generate" &&
    input.targetPlatform === "suno" &&
    input.inputSnapshot?.generatorMode === "advanced";

  if (!isAdvancedSunoGeneration) return input;

  const existing = input.instructions.trim();
  return {
    ...input,
    instructions: existing
      ? `${existing}\n\n${ADVANCED_SUNO_ENRICHMENT_INSTRUCTION}`
      : ADVANCED_SUNO_ENRICHMENT_INSTRUCTION,
  };
}
