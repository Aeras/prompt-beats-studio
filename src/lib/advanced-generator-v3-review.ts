/**
 * V3-only adaptive musical phrasing and experimental rhyme refinements.
 * Both candidates are one-pass instructions, not a second reviewer or rewrite.
 * V1/V2 and revisions do not call this helper.
 */
export type V3RhymeCandidate = "a" | "a+b" | "c" | "d";

const RHYME_INTENT = `RHYME INTENT (V3):
Follow explicit user and occurrence-specific Blueprint preferences for a rhyme
scheme, free verse, minimal rhyme, or internal rhyme over genre defaults.
Otherwise, when the requested genre and section favor audible rhyme — especially
melodic pop, ballad, or dance-pop choruses — aim for natural recurring end-rhyme
relationships. Do not equate natural phrasing with avoiding rhyme. Adapt the
density to the genre and section; do not demand end rhyme on every line.
Rap may prioritize internal or multisyllabic patterns; spoken/experimental
sections may deliberately avoid end rhyme.`;

const RHYME_PLANNING = `For sections where rhyme serves the brief, silently consider a few meaningful,
compatible ending words or phrases together before composing the lines.
Keep the endings provisional: choose another ending or rephrase the line rather
than distort grammar, idiom, lexical stress, required imagery, meaning, or delivery.
Relax only a self-chosen pattern, never an explicit user or Blueprint rhyme scheme.
Judge the sound in the requested language, not spelling or shared grammatical
suffixes alone. For Russian, check the stressed vowel and following sounds;
distinguish exact from deliberate slant rhyme or assonance. Do not apply
Russian stress rules universally to other languages.
Before returning the JSON, briefly verify intended sound relationships and
natural phrasing together. Do not output an analysis, rhyme plan or new fields.`;

const LANGUAGE_FIRST = `LANGUAGE-FIRST QUALITY (V3-C):
Compose each sung line as a complete, idiomatic thought in the requested
language before treating its ending as a rhyme target. Test the full phrase
in natural speech and imagined melody, including agreement, prepositions,
collocations, word order and lexical stress. Reject a rhyme if obtaining it
requires semantically empty filler, reversed syntax, stock sentiment or a
contradiction of the scene. Prefer a specific, truthful line with a looser
rhyme to a polished-sounding but unnatural couplet.
In Russian, watch for unnatural prepositions/case, agreement mismatches and
phrases that only exist to land an ending. Repeated grammatical suffixes or
recycling the same easy end sound are not sufficient musical development.
Create an economical chorus: each sung line should bring a connected thought;
let the hook be short enough to remember and deliver without cramming.
Keep explicit rhyme schemes, exact sung-line counts, section identities and
required hooks authoritative. Repeat the recognizable core hook in its assigned
later section; do not replace its meaning or wording just to vary the rhyme.
Silently check the complete sung lines, not only their final words. Do not
output commentary or an internal quality checklist.`;

const PHONETIC_FLOW_D = `PHONETIC RHYME, VOCAL FLOW & SECTION DYNAMICS — V3-D EXPERIMENT:
Compose naturally in the requested language and register; preserve the user's
exact brief, section count and order, required hooks and explicit rhyme scheme.
When rhyme is appropriate, judge audible sounds from the naturally STRESSED
vowel onward in that language, not spelling; allow deliberate near-rhyme and
assonance when genre and user instructions permit. Do not mistake repeated
grammatical endings for a compelling rhyme, but do not ban them categorically.
Never bend word stress, syntax, case, agreement, idiom or meaning for an ending.
For English, distinguish sound from spelling; for Russian, account for real
lexical stress and spoken vowel reduction; for Greek, maintain natural tonic
accent and spoken endings; for Spanish and French, use their own connected
speech and rhyme conventions, never rules copied from another language.
Do not invent stress marks or claim phonetic certainty for uncertain words.

Shape sung phrases for comfortable delivery: consider natural breath groups,
spoken stress, groove and vocal style, with room for held notes and pauses.
Do not impose fixed syllable counts, equal line lengths, a universal BPM-to-
syllable ratio or an assumed number of notes per bar. Dense lines may suit rap,
while an intimate ballad can sustain fewer words. Avoid filler inserted solely
to pad a meter; meaningful vocables and repetition remain allowed by style.

Use each USER-REQUESTED section for its musical function: verses can develop
specific images; a pre-chorus, IF PRESENT, can build anticipation; a chorus
can carry a recognizable hook; a bridge, IF PRESENT, may provide contrast.
Never add or remove sections, invent a mandatory story arc, or require a bridge.
Preserve hook wording in explicitly specified returns. If the user requests
a fixed scheme (such as ABAB) or a sung-line count, honor it even when that
requires revising the wording naturally. Distinguish section metadata and
performance cues from sung lines; never place instructional prose in lyrics.

Before returning the existing JSON schema, silently check full-line idiom,
audible rhyme where requested, natural stress/breath, section structure and
hook continuity. Revise locally rather than forcing a rhyme. No analysis,
scansion, IPA, rhyme plan or extra JSON fields in the output.`;

/**
 * The optional argument isolates A, A+B, C and D for controlled offline tests.
 * Runtime's existing call uses the default A+B candidate on this branch.
 * Nothing reaches production without explicitly merging this branch.
 */
export function withV3MusicalPlanning(
  prompt: string,
  rhymeCandidate: V3RhymeCandidate = "a+b",
): string {
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
Never impose fixed syllable counts, equal line lengths, or a rhyme scheme as
automatic defaults; honor explicit requests for a particular metrical form.
Never impose universal BPM-to-syllable formulas or an imagined note/bar map.
${RHYME_INTENT}
${rhymeCandidate === "a+b" ? RHYME_PLANNING : ""}
${rhymeCandidate === "c" ? LANGUAGE_FIRST : ""}
${rhymeCandidate === "d" ? PHONETIC_FLOW_D : ""}
Require narrative development only when the user requests it or enables narrative
direction. Otherwise maintain thematic and logical consistency without inventing
a story arc. Preserve explicit section lengths, order, vocal handoffs and hooks.
Music Style must reflect the same intended musical approach.
Return only the existing song output schema. Do not output planning or reviews.
`;
}
