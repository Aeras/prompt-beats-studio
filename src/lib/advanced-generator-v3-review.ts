/**
 * V3-only adaptive musical phrasing. One provider call, no post-generation
 * reviewer or lyric rewrite. V1 and V2 keep their original prompts.
 */
export function withV3MusicalPlanning(prompt: string): string {
  return `${prompt}

ADAPTIVE MUSICAL PHRASING — COMPOSE, DO NOT POST-EDIT (V3)
Before composing, silently choose a coherent phrasing approach for the requested
language, genre, mood, tempo when specified, groove, vocal delivery and Blueprint.
Plan musical identity and words together rather than shortening finished lyrics.
When tempo is unspecified, choose it coherently; do not attribute it to the user.
Honor explicit user settings, story facts, section roles, voice assignments and
required hooks. Distribute details across appropriate sections.
Give melodic hooks room for held notes and breaths where useful; allow naturally
dense rap or spoken-sung lines when intended. Preserve idiomatic language,
meaning, vivid specifics and intentional rhythmic contrasts in every language.
Never impose fixed syllable counts, equal line lengths, mandatory rhymes,
universal BPM-to-syllable formulas or an imagined note/bar map.
Music Style must reflect the same intended musical approach.
Return only the existing song output schema. Do not output planning or reviews.
`;
}
