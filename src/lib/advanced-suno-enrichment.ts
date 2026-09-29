type AdvancedSunoRuntimeInput = {
  operation: string;
  targetPlatform: string;
  instructions: string;
  inputSnapshot?: { generatorMode?: string } | null;
};

export const ADVANCED_SUNO_ENRICHMENT_INSTRUCTION = `PROMPTBEATS INTERNAL MODE — ADVANCED SUNO
- This is an Advanced Generator creation. Apply the Suno Advanced Production Enrichment rules in this same and only generation call.
- The final Music Style ("tags") must keep its essential musical identity and must be enriched with the most useful production/arrangement information represented by the generated Producer's Note whenever that information is not already present and there is available character space.
- Work in this order: (1) compose the essential Music Style core, (2) compose the Producer's Note, (3) compare the Producer's Note against Music Style, (4) identify useful production cues missing from Music Style, (5) rank those missing cues by how much they can improve the generated Suno result, and (6) add the highest-value missing cues back into Music Style in concise ENGLISH.
- Prioritize actionable musical direction such as instrument entrances/exits, lead-instrument moments, section-specific instrumental behavior, verse/chorus contrast, builds, drops, breakdowns, pauses, dynamics, vocal phrasing/treatment, ambience, production texture, arrangement transitions, intro/outro behavior and meaningful energy changes.
- Prefer concrete behavior over generic adjectives. For example, "brass and handclaps lift the chorus", "accordion-led instrumental break", "rhythmically tight clipped vocal phrasing", "near-silent breakdown", or "drops carry full dancefloor energy" are more useful than vague wording such as "powerful", "epic" or "dynamic" when the Producer's Note provides the concrete behavior.
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
