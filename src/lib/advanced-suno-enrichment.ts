type AdvancedSunoRuntimeInput = {
  operation: string;
  targetPlatform: string;
  instructions: string;
  inputSnapshot?: { generatorMode?: string } | null | undefined;
};

export const ADVANCED_SUNO_ENRICHMENT_INSTRUCTION = `PROMPTBEATS INTERNAL MODE — ADVANCED SUNO
- This is an Advanced Generator creation. Apply the Suno Advanced Production Enrichment rules in this same and only generation call.
- Work in this strict order: (1) compose the Producer's Note first in the requested song language, (2) treat that Producer's Note as the authoritative source for the song's specific production and arrangement decisions, (3) compose the essential Music Style ("tags") core, (4) extract the most useful production/arrangement instructions from the Producer's Note that are not already represented in Music Style, and (5) translate/adapt those extracted instructions into concise ENGLISH and integrate them into the final Music Style.
- Preserve the exact musical relationship expressed in the Producer's Note whenever it is transferred: instrument or vocal element + action/behavior + section + timing/dynamic role when those details are present. Do not replace a specific instruction with a broader stylistic approximation.
- When transferring a specific production cue from the Producer's Note into Music Style, do not add, substitute, merge, or infer an instrument, vocal layer, texture, or section element that is not actually present in that Producer's Note cue. Preserve the listed elements faithfully unless a shorter wording is required for the character budget.
- If a transferred cue lists multiple elements, keep the same element set and their roles. Never replace a missing element with a nearby or stylistically plausible one merely because it also appears elsewhere in the song.
- When the Producer's Note distinguishes behavior between repeated or neighboring sections, preserve that distinction in Music Style when it materially affects the arrangement and the character budget allows it. Do not collapse a specific First Chorus / Second Chorus / Final Chorus contrast into one generic chorus description if the difference is generator-useful.
- Give high priority to relative timing and section-to-section relationships such as "before the Build", "after the Interlude", "in the second Chorus", "only in the Final Chorus", "enters during the Pre-Chorus", or "drops out before the Breakdown". When such timing is musically meaningful, keep it attached to the transferred cue rather than relying only on word order in Music Style.
- Example: if the Producer's Note says the Instrumental Break features an accordion solo over dynamic timbales, prefer "accordion solo over dynamic timbales in the instrumental break" rather than a generic phrase such as "playful accordion hooks".
- Example: if the Producer's Note says the Breakdown strips down to bass and voice immediately before the Final Chorus, prefer "stripped bass-and-vocal breakdown immediately before the final chorus" rather than a generic phrase such as "tight energetic breakdown".
- Example: if the Producer's Note says the Breakdown strips down to voice, piano and low pad before the Build, preserve exactly those elements, e.g. "stripped voice, piano and low-pad breakdown immediately before the build". Do not invent bass or omit the low pad.
- Example: if the Producer's Note says the first Chorus stays wide but restrained while the second Chorus adds electric guitars and punchy live drums, preserve the contrast explicitly, e.g. "restrained wide first chorus; second chorus adds electric guitars and punchy live drums", rather than reducing both to a generic "dynamic chorus".
- Prioritize actionable musical direction such as instrument entrances/exits, lead-instrument moments, section-specific instrumental behavior, verse/chorus contrast, repeated-section contrast, builds, drops, breakdowns, pauses, dynamics, vocal phrasing/treatment, ambience, production texture, arrangement transitions, intro/outro behavior and meaningful energy changes.
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
