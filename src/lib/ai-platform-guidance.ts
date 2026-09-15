import type { AiTargetPlatform } from "@/lib/ai-target-platforms";

export function generationPlatformGuidance(platform: AiTargetPlatform): string {
  if (platform === "udio") {
    return `TARGET PLATFORM — UDIO

Optimize the result specifically for Udio's Create flow with a text Prompt plus Custom Lyrics.

UDIO PROMPT
- The "tags" field is the Udio Prompt, not a Suno-style keyword dump.
- Write it in concise, information-dense English.
- Prioritize: genre/subgenre, vocalist type, mood, instrumentation, tempo/groove, production character, and arrangement shape.
- Prefer a clear Udio-friendly ordering similar to: Genre -> Vocalist -> Mood -> Instrumentation -> What/How/Where.
- Keep related concepts grouped and avoid redundant synonyms, filler adjectives, artist names, or conflicting directions.
- The Udio Prompt must accurately describe the generated lyrics and arrangement.

UDIO LYRICS / GUIDANCE TAGS
- Write lyrics for Udio Custom Lyrics.
- Prefer Udio-recognized guidance tags when they fit naturally, including [Intro], [Verse], [Pre-chorus], [Chorus], [Post-chorus], [Hook], [Refrain], [Bridge], [Break], [Breakdown], [Build], [Drop], [Interlude], [Instrumental], [Instrumental Break], [Instrumental Bridge], [Solo], [Ensemble], [Choir], [Spoken Word] and [Outro].
- Do not depend on nonstandard speaker labels such as [Male], [Female], [Both] or [Duet] to control singer identity. Put the intended vocalist identity in the Udio Prompt instead.
- Parentheses are reserved ONLY for words that are actually sung as backing vocals, ad-libs or echoes.
- NEVER put instrumental, arrangement, structural, production, performance or sound-design instructions inside parentheses.
- Any non-sung direction must use square brackets.
- Example VALID: [Atmospheric synths swell], [Soft electric piano chords], [Deep sub bass pulses].
- Example VALID sung echo: (Το φως σου μόνο ζητώ)
- Example INVALID: (Atmospheric synths swelling), (Soft electric piano chords), (Deep sub bass pulses).
- Before returning the lyrics, perform a formatting audit: if any parenthesized text is not intended to be literally sung, convert it to a square-bracketed direction.
- Avoid excessive guidance tags. They are guidance, not guaranteed hard commands.

UDIO LENGTH
- By default, make the lyric set compact enough to fit a single Udio ~130-second creation reasonably well.
- Prefer a focused structure and concise verses/choruses over a 3–4 minute lyric sheet that would likely require manual splitting or extension.
- If the user explicitly requests a longer or more complex structure, preserve that requirement, but do not add filler merely to increase duration.`;
  }

  return `TARGET PLATFORM — SUNO

Optimize the result specifically for Suno Custom mode.

SUNO STYLE PROMPT
- The "tags" field is the Suno Style Prompt.
- Write it in concise, information-dense English.
- Describe the finished song's genre/subgenre, tempo/BPM feel, groove, instrumentation, bass, drums, vocal character, vocal arrangement, production texture, atmosphere, dynamics and arrangement arc.
- Use concrete musical information rather than disconnected keyword spam, filler adjectives, artist names or contradictory directions.

SUNO LYRICS / DIRECTIONS
- Keep the existing PromptBeats Suno lyric conventions that already work well: clear square-bracketed structural tags and concise vocal/production directions when useful.
- Do not use round parentheses for non-sung structural or production directions.
- Avoid unnecessary tags or directions that could be sung accidentally.`;
}

export function qualityPlatformGuidance(platform: AiTargetPlatform): string {
  if (platform === "udio") {
    return `TARGET PLATFORM VALIDATION — UDIO

The song was generated specifically for Udio. Evaluate platform formatting and prompt compatibility accordingly.

- Treat the "tags" field as the Udio Prompt.
- It should coherently describe genre, vocalist, mood, instrumentation, tempo/groove, production character and arrangement shape without contradictory or redundant directions.
- Udio Custom Lyrics may use square-bracketed guidance tags such as [Verse], [Chorus], [Bridge], [Intro], [Outro], [Hook], [Pre-chorus], [Post-chorus], [Instrumental Break], [Breakdown], [Solo], [Choir], [Spoken Word] and related Udio guidance tags.
- Parentheses are allowed ONLY for words actually intended to be sung as backing vocals, ad-libs or echoes and must NOT be flagged merely for being parentheses.
- Parenthesized instrumental, arrangement, structural, production, performance or sound-design directions are a genuine Udio formatting defect and should be reported.
- Non-sung directions should use square brackets.
- Do not require Suno-specific vocal labels such as [Male], [Female], [Both] or [Duet]. Vocalist identity may instead be expressed in the Udio Prompt.
- Do not flag a harmless platform formatting difference as a lyric defect.
- Do report a genuine platform mismatch when the output relies on contradictory, malformed or clearly inappropriate directions for Udio.`;
  }

  return `TARGET PLATFORM VALIDATION — SUNO

The song was generated specifically for Suno. Evaluate platform formatting and Style Prompt compatibility accordingly.

- Treat the "tags" field as the Suno Style Prompt.
- Square-bracketed structural, vocal and production directions are allowed when coherent and useful.
- Round parentheses must not be used for non-sung structural or production directions.
- Do not penalize valid Suno-oriented formatting merely because Udio would format the same idea differently.`;
}
