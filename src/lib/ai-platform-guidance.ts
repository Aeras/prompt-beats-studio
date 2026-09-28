import type { AiTargetPlatform } from "@/lib/ai-target-platforms";

const HUMAN_SONGWRITING_GUIDANCE = `HUMAN SONGWRITING / ANTI-GENERIC LYRIC RULES
- Write lyrics that feel naturally human-written, emotionally specific and contemporary.
- Prefer concrete, believable details, actions, objects, places, physical sensations and conversational observations over abstract poetic filler.
- Do not try to make every line sound poetic. Simple, direct lines are often more believable and more singable.
- Specificity is preferred over poetic abstraction: when possible, show the emotion through a believable action, object, place, conversation or physical detail instead of naming the emotion through a generic metaphor.
- Avoid stereotypical AI-song wording and overused imagery unless it is genuinely appropriate to the user's brief. Do not repeatedly fall back on images such as neon lights, echoes, ghosts, shadows, whispers, city lights, fading memories, broken hearts, stars, rain, fire, scars, silence, empty streets or dancing in the dark merely because they sound lyrical.
- These words are not forbidden. Use them only when they are specific, meaningful and earned by the song.
- Avoid vague lines that are grammatically correct but say little, generic emotional statements, stock contrasts and poetic phrases that exist mainly to sound impressive.
- Never add a word or phrase only to complete a rhyme. Natural meaning, native phrasing, emotional truth and singability are more important than perfect rhyme.
- Prefer fresh phrasing over predictable constructions such as "ghost of us", "echo of what we were", "lost in the night", "whispers in the dark" or similar formulaic wording unless the brief clearly calls for them and the line feels natural.
- Keep the emotional perspective grounded and internally consistent. Let the song sound like one believable person speaking, remembering, reacting or deciding.
- Before finalizing, silently review every sung line and ask: Would a skilled human songwriter plausibly write this? Does it communicate something specific? Is any word present only for rhyme? Does it sound natural when sung aloud? Is it generic, vague, clichéd or unnecessarily poetic? Rewrite any weak line before returning the result.`;

const STRICT_LYRIC_FORMATTING_GUIDANCE = `STRICT SUNG / NON-SUNG FORMATTING — NON-NEGOTIABLE
- Square brackets [ ] are the ONLY allowed format for structural tags and any text that is NOT intended to be sung.
- Use square brackets for song sections, instrumental directions, arrangement directions, production directions, vocal-performance directions, transitions, dynamics and sound-design instructions.
- Examples of valid non-sung directions: [Intro], [Instrumental Break], [Soft piano enters], [Clean electric guitar], [Female lead vocal], [Build], [Drums drop out], [Full stereo spread], [Fade out].
- NEVER place a non-sung instruction inside round parentheses.
- INVALID: (Instrumental fade-in), (Soft piano), (Guitar solo), (Drums enter), (Female vocal), (Building intensity).
- VALID: [Instrumental fade-in], [Soft piano], [Guitar solo], [Drums enter], [Female vocal], [Building intensity].
- Round parentheses ( ) are reserved ONLY for words that are literally intended to be sung, such as backing vocals, vocal echoes, responses or ad-libs.
- Example of valid sung parentheses: I still remember you / (remember you).
- If parenthesized text would not be audibly sung by a vocalist, it MUST be converted to square brackets or removed.
- Before returning the lyrics, silently scan every pair of round parentheses. For each one ask: "Is this text intended to be audibly sung?" If the answer is no, convert it to square brackets or remove it.
- No instrumental, structural, production, arrangement, sound-design or performance instruction may remain inside round parentheses in the final lyrics.`;

export function generationPlatformGuidance(platform: AiTargetPlatform): string {
  if (platform === "udio") {
    return `TARGET PLATFORM — UDIO

Optimize the result specifically for Udio's Create flow with a text Prompt plus Custom Lyrics.

${HUMAN_SONGWRITING_GUIDANCE}

${STRICT_LYRIC_FORMATTING_GUIDANCE}

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
- Avoid excessive guidance tags. They are guidance, not guaranteed hard commands.
- Use displayed lyric lines as deliberate phrasing cues and avoid prose-length lyric lines that depend on the platform to discover appropriate internal phrasing automatically.

UDIO LENGTH
- By default, make the lyric set compact enough to fit a single Udio ~130-second creation reasonably well.
- Prefer a focused structure and concise verses/choruses over a 3–4 minute lyric sheet that would likely require manual splitting or extension.
- If the user explicitly requests a longer or more complex structure, preserve that requirement, but do not add filler merely to increase duration.`;
  }

  return `TARGET PLATFORM — SUNO

Optimize the result specifically for Suno Custom mode.

${HUMAN_SONGWRITING_GUIDANCE}

${STRICT_LYRIC_FORMATTING_GUIDANCE}

SUNO STYLE PROMPT
- The "tags" field is the Suno Style Prompt.
- Write it in concise, information-dense English.
- Describe the finished song's genre/subgenre, tempo/BPM feel, groove, instrumentation, bass, drums, vocal character, vocal arrangement, production texture, atmosphere, dynamics and arrangement arc.
- Use concrete musical information rather than disconnected keyword spam, filler adjectives, artist names or contradictory directions.
- The complete final Suno Style Prompt must never exceed 1000 characters, including spaces and punctuation. Do not pad it merely to approach the limit.

SUNO ADVANCED PRODUCTION ENRICHMENT — SAME GENERATION CALL
- When the brief above contains Advanced user direction, a requested production/arrangement treatment, a detailed structure/Blueprint, additional instructions, or other clearly detailed Advanced musical direction, make the final "tags" field the complete platform-ready Music Style result in this same response.
- Keep the Producer's Note in the requested song language exactly as required elsewhere in the prompt.
- At the same time, select the most generator-useful production choices represented by the song and Producer's Note — for example important instrument entrances/exits, vocal character, dynamics, arrangement arc, intro/outro treatment, builds, breakdowns, ambience, production texture, space/mix character and meaningful section-specific contrasts — and incorporate the highest-value ones into "tags" in ENGLISH.
- Do not translate or copy the Producer's Note wholesale into "tags". Condense only the production information that materially helps Suno generate the intended song.
- Treat the existing musical identity in "tags" as essential. Add production detail only within the remaining 1000-character budget and prioritize the most important cues when space is limited.
- If the existing Music Style already uses most of the budget, include only the highest-value production cues that fit naturally. Never exceed 1000 characters.
- If the brief is not using detailed Advanced direction, keep the normal concise Suno Style Prompt behavior above rather than artificially expanding it.

SUNO LYRICS / DIRECTIONS
- Keep the existing PromptBeats Suno lyric conventions that already work well: clear square-bracketed structural tags and concise vocal/production directions when useful.
- Use round parentheses only for sung backing vocals, echoes, responses or ad-libs.
- Never use round parentheses for non-sung structural, instrumental, vocal-performance, arrangement, production or sound-design directions.
- Avoid unnecessary tags or directions that could be sung accidentally.
- Use lyric line breaks as meaningful phrasing cues.
- Do not rely on Suno to repair an overcrowded lyric line through automatically accelerated delivery.`;
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
- The Suno Style Prompt must be no more than 1000 characters including spaces and punctuation.
- English production detail inside the Suno Style Prompt is correct even when the lyrics and Producer's Note use another requested language.
- Square-bracketed structural, vocal and production directions are allowed when coherent and useful.
- Round parentheses are allowed only for words literally intended to be sung as backing vocals, echoes, responses or ad-libs.
- Round parentheses must not be used for non-sung structural, instrumental, vocal-performance, arrangement, production or sound-design directions.
- Do not penalize valid Suno-oriented formatting merely because Udio would format the same idea differently.`;
}
