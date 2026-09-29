type AdvancedSunoRuntimeInput = {
  operation: string;
  targetPlatform: string;
  instructions: string;
  inputSnapshot?: { generatorMode?: string } | null;
};

export const ADVANCED_SUNO_ENRICHMENT_INSTRUCTION = `PROMPTBEATS INTERNAL MODE — ADVANCED SUNO
- This is an Advanced Generator creation. Apply the Suno Advanced Production Enrichment rules in this same and only generation call.
- Work in this strict order: (1) compose the Producer's Note first in the requested song language, (2) treat that Producer's Note as the authoritative source for the song's specific production and arrangement decisions, (3) compose the essential Music Style ("tags") core, (4) extract the most useful production/arrangement instructions from the Producer's Note that are not already represented in Music Style, and (5) translate/adapt those extracted instructions into concise ENGLISH and integrate them into the final Music Style.
- Preserve the exact musical relationship expressed in the Producer's Note whenever it is transferred: instrument or vocal element + action/behavior + section + timing/dynamic role when those details are present. Do not replace a specific instruction with a broader stylistic approximation.
- Example: if the Producer's Note says the Instrumental Break features an accordion solo over dynamic timbales, prefer "accordion solo over dynamic timbales in the instrumental break" rather than a generic phrase such as "playful accordion hooks".
- Example: if the Producer's Note says the Breakdown strips down to bass and voice immediately before the Final Chorus, prefer "stripped bass-and-vocal breakdown immediately before the final chorus" rather than a generic phrase such as "tight energetic breakdown".
- Prioritize actionable musical direction such as instrument entrances/exits, lead-instrument moments, section-specific instrumental behavior, verse/chorus contrast, builds, drops, breakdowns, pauses, dynamics, vocal phrasing/treatment, ambience, production texture, arrangement transitions, intro/outro behavior and meaningful energy changes.
- Prefer concrete behavior over generic adjectives. Preserve section names and relative timing when they materially affect the arrangement.
- Do not copy narrative/story commentary from the Producer's Note into Music Style. Transfer only generator-useful musical/production information.
- Producer's Note itself must remain in the requested song language.
- Do not repeat information already present in Music Style with different wording merely to make the prompt longer.
- If the Producer's Note contains at least two genuinely useful production/arrangement cues that are not already represented in Music Style and the remaining character budget allows them to fit naturally, include at least two such cues in the final Music Style.
- If only one useful missing cue fits, include that one. If no useful missing cue exists, do not invent one.
- Use only the remaining Suno character budget. Keep the complete final Music Style at 1000 characters or fewer, counting spaces and punctuation, and prefer complete concise cues rather than cutting words or leaving partial instructions.`;

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
