import { buildAdvancedGeneratorPromptV2 } from "./advanced-generator-prompt-v2";

/**
 * Experimental Super Admin Advanced Generator V3.
 * V2 is the canonical songwriting baseline. V3 adds only a narrowly scoped,
 * conservative singability check; it does not replace V2's creative rules.
 */
export function buildAdvancedGeneratorPromptV3(original: string): string {
  const v2 = buildAdvancedGeneratorPromptV2(original);
  const anchor =
    "==================================================\nPROFESSIONAL CREATIVE DIRECTION\n==================================================";
  if (!v2.includes(anchor)) throw new Error("Generator V3 creative direction anchor missing");

  const guidance = `==================================================
V3 CONSERVATIVE SINGABILITY CHECK — V2-FIRST
==================================================

KEEP THE V2 SONGWRITING APPROACH. Compose naturally, as a fluent native
songwriter in the user's requested language, with the same narrative richness,
emotional truth, original imagery, idiomatic phrasing and creative freedom as V2.
This V3 addition is a narrowly targeted CHECK, not a competing writing style,
new rhyme scheme, length template, or instruction to shorten the whole song.

FIRST draft the full song naturally using all V2 instructions and the explicit
user Blueprint. THEN silently review ONLY genuinely troublesome sung phrases
for likely rushed delivery. Consider genre, subgenre, language-specific
pronunciation and stress/tone, BPM when supplied, perceived groove (including
half-time), intended vocal style and section purpose. These are contextual
signals, not proof of exact note durations or available bars. Never infer the
unwritten melody or impose universal numerical syllable limits.

Make the SMALLEST possible edit only when a line is clearly overloaded for
its intended delivery compared with surrounding phrases. Prefer more natural
wording, a meaningful pause or phrase boundary, or removal of redundant
words. Leave long lines alone if they are comfortable as expressive phrases;
leave short lines alone when they provide emphasis. Preserve explicit structure,
Blueprint requirements, voice, perspective, meaning and natural breath.

HARD QUALITY INVARIANTS — EVERY REQUESTED LANGUAGE:
- Never substitute awkward idioms, literal translation, broken grammar,
  unnatural word order, implausible imagery or semantic contradictions just
  to improve apparent meter or rhyme.
- Never manufacture end rhymes, increase rhyme frequency or make the poem
  more symmetrical merely because V3 is selected. Retain V2's organic rhyme
  choices; imperfect rhyme or no rhyme is better than forced language.
- Avoid meaningless filler, tautology, unexplained abstractions and unnatural
  gender/person/tense changes. Intentional, meaningful poetic language is fine.
- In a conflict, native-language fluency and intended meaning win over
  any estimated rhythmic or syllable optimization.
- If no clearly safe improvement exists, KEEP the original V2-like line.

As a final silent check, read the actual sung lines as a native speaker would:
can they be understood on first hearing, do they sound idiomatic, and is the
story coherent? Reject any editing that makes a line less natural than the
original. Do not output a report, syllable counts or self-critique. Perform
the review within the same generation call, without a second provider request.

`;
  return v2.replace(anchor, guidance + anchor);
}
