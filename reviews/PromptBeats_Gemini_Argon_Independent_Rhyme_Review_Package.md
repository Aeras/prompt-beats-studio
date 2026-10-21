# PROMPTBEATS — INDEPENDENT GENERATOR V3 RHYME & SONGWRITING REVIEW
**Standalone research package for Gemini 4 Argon / another independent AI expert**
**Date:** 2026-10-21
**Language of final report:** Greek (preserve Russian quotations verbatim).
**Mode:** READ-ONLY ANALYSIS. No implementation, no API calls, no live changes.

## 1. What PromptBeats does
PromptBeats is an AI music creation platform. Its AI Generator takes a user's song idea, genre, mood, target language, optional arrangement and song structure, additional instructions and optional section-level Song Blueprint. It generates a complete structured song concept optimized for **Suno** (and supports Udio): song title, English Music Style prompt, complete lyrics with structural / performance tags, and a producer's note in the requested language. The AI returns structured JSON with `title`, `tags`, `lyrics`, `note`. The user can subsequently run an optional Quality Check and approve proposed corrections. Do not confuse Generator V1/V2/V3 with Quality Check V1/V2/V2.1: these are separate systems.

## 2. Why we request this review
We have observed that **Generator V3 sometimes produces fluent, expressive lyrics but fails to provide recognizable, convincing end rhyme in melodic Russian pop**, particularly in the chorus. This was noticed across two models. The concern is whether V3's prompt inadvertently discourages even *appropriate* rhyme. We want to improve **natural, correct, song-appropriate rhyme**, without forced wording, cliché, broken grammar, unnatural stress or artificially uniform line lengths. Do **not** simply add 'more rhyme everywhere'.

### Example A — Grok 4.7, V3, «Вот и всё счастье»
Вот и всё счастье, вот и всё
Чай на столе, дождь за окном
Ты улыбаешься тихо
И мне этого хватает

### Example B — GPT-5.6 Luna, V3, «Воскресный чай»
Вот оно, счастье — чай на двоих,
Дождь за окном и твой тихий смех.
Вот оно, счастье — быть рядом с тобой,
Просто встречать это утро вдвоём.
Нам ничего не нужно менять,
Если есть кому улыбаться.

### Control observations
- GPT-5.6 Luna V2, «Чай на двоих», produced rhyme `двоих / простых`, though other lines are awkward.
- Earlier Grok 4.7 V1, V2, V3 and Luna V1, V2, V3 were compared. These are *single samples per model/version*, not controlled statistical evidence of causation.
- Free verse and genres that do not require terminal rhyme must be respected. Narrative development is **not** a universal criterion; it applies only when explicitly selected/requested. Ordinary logical consistency still matters.

## 3. Your tasks
Act independently as a Principal Prompt Engineer, computational linguist specializing in Russian phonology and stress, multilingual songwriter, music producer, software prompt-systems architect and adversarial reviewer.

Review the **three complete generated prompt templates below** line by line. Explain where and how instructions may conflict, be diluted, or prioritize naturalness in a way that undermines rhyme. Look especially at V3's prohibition of 'mandatory rhymes': does it merely protect against forced rhyme or unintentionally remove guidance that melodic pop needs?

Treat them as **templates**, NOT three fully instantiated API requests. Variable expressions such as `\u0024{d.genre}` represent actual runtime user fields; conditional expressions select context-specific text. No hidden values should be invented. These templates are extracted from the real repository, preserving the base and the actual V2/V3 transformations; they are not a second assistant's rewritten prompts. Shared system instruction and Song Blueprint text are provided separately as well. Real prompts can additionally include input-specific interpolations and other runtime injections. When you cannot verify an exact runtime expansion, state that limitation rather than asserting it.

Answer concretely:
1. What is the most likely cause of weak rhyme in V3? Rank hypotheses and confidence.
2. What exactly differs among V1, V2, V3, and which differences matter for rhyme?
3. For each cited Russian sample, explain whether endings rhyme **phonetically from the stressed vowel onward**; distinguish exact, approximate and non-rhyme, with natural stress and grammatical endings.
4. Propose at least three solutions: (A) minimal V3 instruction refinement, (B) same-call internal rhyme-anchor / flexible scheme planning and self-check, (C) configurable language-genre-specific guidance. Assess hybrid alternatives if useful.
5. Give exact proposed instruction edits/diffs, not a total rewrite of V3. Preserve V1/V2 unchanged.
6. Explain user-level control: explicit rhyme scheme, minimal rhyme, free verse, rap internal rhyme, genre defaults and multilingual constraints.
7. Assess creative risk, overfitting, unnatural word order, chorus repetition, strictness of AABB/ABAB/ABCB, token/cost/latency overhead and complexity.
8. Design testing: matched configurations across versions, repeated outputs per model, Russian examples plus multilingual and genre regressions, blinded human evaluation, naturalness, correct rhyme, stress, meter, singability, hook quality, false-positive 'rhymes', forced-rhyme rate.
9. Assess whether one-call drafting/planning is worthwhile versus a separate review stage, without making any additional paid call.
10. Do not require story progression/narrative coherence in ordinary non-narrative songs. Only evaluate it for narrative mode selected by the user.

## 4. Strict methodology
- No code changes, commits, PRs, deployments or database modifications.
- No billable AI experimentation; reason only from supplied evidence.
- Distinguish proven facts, plausible mechanisms and unsupported speculation.
- Do not assume the other two reviewers' conclusions; your judgment must be independently developed.
- Do not fabricate links, files, test runs or API behavior.
- Prefer small surgical improvements with clear rollback and regression checks.
- The source code is provided below so that GitHub access is **not required**.

## 5. Required output: final downloadable report
Produce a complete **Greek-language Markdown report as a file**, suggested name `PromptBeats_Independent_Rhyme_Review_Gemini_4_Argon.md`, downloadable by the user. The report must cover:
1. Executive Summary
2. Findings from V1/V2/V3 source prompts with precise quoted instructions
3. Russian phonetic/stress examination
4. Root-cause ranking and confidence
5. At least three solution designs and a trade-off comparison
6. Recommended surgical V3 prompt diff
7. Acceptance criteria and controlled tests
8. Red-team risks and safeguards
9. Uncertainties and what cannot be concluded from this sample size
10. Definitive recommendations for the independent human review

The report should stand alone, cite the relevant quoted prompt sections, avoid repeating the full prompts unless needed, and finish exactly with:
**Investigation complete — awaiting independent review. No changes implemented.**

If you cannot create an actual downloadable file, output the complete final report in a single Markdown code block ready to save as .md; do not pretend a file exists.

---

# APPENDIX: CANONICAL GENERATOR PROMPTS
**Source snapshot:** GitHub `Aeras/prompt-beats-studio` main, read on 2026-10-21.
**Crucial:** Dynamic template expression placeholders are retained verbatim. The V2/V3 prompts below represent composition of the original template and the existing V2/V3 source-level transformations. No invented user values. System instruction is common to all three.

## SHARED SYSTEM INSTRUCTION
```text
You are a top-tier music producer and expert in composition and orchestration. You output STRICT JSON ONLY — never markdown fences, never conversational text, never anything outside the JSON object. The response must parse with JSON.parse and contain exactly these keys: {"title": string, "tags": string, "lyrics": string, "note": string}.
```

## GENERATOR V1 — FULL BASE PROMPT TEMPLATE
```text
Act as a top-tier music producer, professional songwriter, composer, arranger and AI-music prompt specialist.

Transform the user's idea into one complete, original, coherent and professionally developed song concept optimized specifically for ${platformLabel}.

USER INPUTS — AUTHORITATIVE:

Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}
Target Platform: ${platformLabel}
${d.structure ? `Requested Song Structure (in this order): ${d.structure}` : ""}
${d.production ? `Requested Production Style: ${d.production}` : ""}
${d.instructions ? `Additional Instructions: ${d.instructions}` : ""}
${blueprintBlock}

${
  d.structure || d.production || d.instructions
    ? `ADVANCED USER DIRECTION — AUTHORITATIVE:

${
  d.structure
    ? `- The Requested Song Structure defines the order of song sections and is authoritative.
- Follow the requested section order using matching square-bracketed structural tags in the lyrics.
- Do not replace, reorder, remove or rename requested sections merely because another structure is more conventional.`
    : ""
}
${d.production ? `- The Requested Production Style defines the production, arrangement, sonic character, dynamics, texture, groove and vocal treatment direction. Reflect it in the Music Style tags, the arrangement and the Producer's Note.` : ""}
${d.instructions ? `- The Additional Instructions are user requirements and must be respected wherever they do not contradict the Core Idea, Language, Genre or Mood.` : ""}
- Integrate all of the above with the Core Idea, Genre, Mood and Language into ONE coherent brief.
- Never mention, quote or expose these field names or this instruction text anywhere in the generated song.`
    : ""
}


==================================================
CREATIVE PRIORITY
==================================================

The Core Idea, Genre, Mood and Language are hard constraints.

Preserve the user's story, subject, emotional premise, perspective and fundamental message.

Develop and enrich the idea creatively, but never replace it with a different story or emotional direction.

When instructions conflict, prioritize:

1. Core Idea
2. Language
3. Genre(s)
4. Mood
5. Explicit Advanced user requirements
6. Natural songwriting
7. Musical coherence
8. AI-music optimization
9. Creative embellishment

==================================================
PROFESSIONAL CREATIVE DIRECTION
==================================================

Think silently as an experienced songwriter, composer, arranger and record producer.

Determine the emotional arc, appropriate subgenre, tempo/BPM, groove, instrumentation, harmony, bass, drums, vocal character, vocal arrangement, structure, dynamics and production direction that best serve the brief.

Every musical decision must support the genre, mood, story and emotional progression.

Avoid random combinations of genre characteristics or unnecessary production elements.

If multiple genres are requested, integrate them into one coherent musical identity rather than treating them as separate styles.

Tempo, vocal phrasing, lyric density, song length and arrangement space must be developed together rather than independently.

==================================================
LYRICS
==================================================

Write complete, coherent lyrics appropriate for the requested platform, requested structure and intended generation length.

When the target platform or user request implies a compact generation, write a complete compact song form rather than forcing conventional full-length lyric volume into a short duration.

Do not pad the song with meaningless repetition, unnecessary verses, extra bridges or extended outros merely to make it longer.

Lyrics must sound naturally written by a skilled native songwriter in the requested language.

Respect grammar, idiomatic expression, pronunciation, word stress, syllable flow, cadence, genre conventions and singability.

Never sacrifice natural language for rhyme.

Avoid filler, forced rhymes, awkward translations, generic clichés and meaningless lines.

Every line should contribute to the story, emotion, imagery, progression or hook.

Treat line breaks as meaningful vocal-phrasing cues, not merely visual formatting.

Do not split lines mechanically by word count or syllable count. Preserve natural language, meaning, musical flow and intended vocal delivery.

==================================================
SINGABILITY / RHYTHMIC FIT
==================================================

The lyrics must be realistically performable by a human vocalist at the tempo, groove, genre and melodic character chosen for this song.

Before finalizing each line, silently consider whether its word and syllable density can fit naturally into the musical phrase that this genre, tempo and melodic character would most likely produce.

Never overcrowd a melodic phrase merely to preserve extra narrative detail.

Avoid lines that would require unnaturally rushed delivery, machine-gun phrasing in a style that does not call for it, compressed, clipped or swallowed syllables, distorted pronunciation, unnatural word stress, or excessive wording in too little rhythmic space.

If a line contains more information than can be sung naturally, shorten it, simplify it, split the thought across two or more lines, or move the non-essential detail to another part of the song.

Preserve the meaning that matters, but prioritize natural vocal phrasing over keeping every extra word.

Keep syllable density reasonably balanced between corresponding lines, especially inside the same verse, pre-chorus or chorus, so that similar phrases feel like the same melodic shape.

Do not force every line to the same syllable count. Natural variation between lines is allowed and often desirable.

Adapt density to the musical context:
- Slow, emotional, melodic or sustained-vocal styles generally need more space and fewer syllables per phrase.
- Mid-tempo and up-tempo genres can support denser phrasing when the line still breathes.
- Rap or intentionally rapid styles may use high density, but only when it remains physically performable, intelligible and stylistically intentional.

Narrative complexity must not turn verses into prose squeezed into music.

When the brief contains many required story details, distribute them naturally across the whole song instead of packing several required ideas into individual lines.

TEMPO AND LYRIC PHRASING ARE DESIGNED TOGETHER

Lyrics and tempo must be designed together, not independently.

Refine BPM and lyric phrasing iteratively.

The chosen BPM, groove and vocal phrasing must remain compatible with the lyrics that were actually written.

If natural phrasing needs more space, adjust both the lyric density and the tempo or arrangement as appropriate rather than forcing the words through.

Do not choose a BPM that makes otherwise natural lyrics unreasonably rushed.

Do not automatically slow a song merely because some lines are too dense.

If a faster tempo better serves the genre, mood or user's intent, simplify or divide overcrowded lyric phrases instead.

Likewise, do not select a high BPM merely because it is common for the genre when that BPM would make the actual written lyrics sound rushed.

==================================================
VOCAL PHRASE BUDGET & LINE BREAKS
==================================================

Treat each displayed sung lyric line as one primary vocal phrase unless the musical context clearly indicates otherwise.

Do not assume that an overcrowded displayed line will automatically be divided into multiple natural musical phrases by the target platform.

Evaluate each sung line against the available rhythmic and breathing space implied by:
- the selected or implied BPM;
- the groove and time-feel;
- the genre;
- the vocal style and delivery;
- the likely phrase duration;
- the melodic character;
- natural breathing points;
- the pronunciation and stress characteristics of the requested language.

Whenever musically appropriate, keep one primary lyrical thought or one natural vocal phrase per displayed line.

Use deliberate line breaks when a thought:
- contains two distinct rhythmic ideas;
- requires more than one natural breath;
- contains excessive syllable density;
- or would require substantially faster delivery than surrounding lines.

Avoid abrupt density jumps between corresponding lines within the same section.

A single line should not suddenly require substantially faster vocal delivery than surrounding lines unless that contrast is clearly intentional and stylistically appropriate.

Punctuation and short clauses may support believable phrasing and breathing, but punctuation alone does not make an overcrowded phrase singable.

Do not judge line length by a rigid word-count or syllable-count limit.

Do not estimate vocal density from word count alone. Consider actual syllable length, pronunciation time, consonant clusters, articulation difficulty and natural stress patterns in the requested language. A short line containing difficult or multi-syllabic words may be denser than a longer line made of simpler words.

Judge whether the exact wording can be delivered naturally, intelligibly and with appropriate word stress at the chosen BPM and vocal style.

Before finalizing the song, silently verify each sung line:
- it can be performed naturally at the chosen BPM and vocal style;
- it has sufficient rhythmic and breathing space;
- its density is reasonably compatible with surrounding corresponding lines;
- the words remain intelligible without swallowing or clipping syllables;
- natural pronunciation and word stress can be preserved.

If a line fails this test, shorten it, simplify it, divide it into natural vocal phrases, or redistribute non-essential detail before returning the result.

Never rely on the target platform to repair overcrowded lyrics through unnatural fast delivery.

==================================================
CHORUS / HOOK
==================================================

Create a memorable, naturally singable chorus with a distinctive emotional or lyrical hook. The hook itself should be concise and memorable, but the entire chorus must NOT default to a fixed, minimal number of lines.

The chorus should provide the natural emotional payoff of the song.

Use repetition strategically, never merely to fill space.

Keep chorus phrases concise enough to be sung with real breathing space and to land as memorable rhythmic shapes.

Use a short, strong hook and repeat it naturally where it helps; develop the rest of the chorus as much as the song musically needs. Four, six, eight or more sung lines can all be appropriate. Do not automatically stop after four lines or equate a short hook with a short chorus.

Do not make the chorus verbose in order to explain the story: the verses carry the detail, the chorus carries the feeling and the hook.

Choose chorus length from the user's explicit structure, Blueprint and lyrical instructions first, then the genre, energy, tempo and melodic arc. Avoid unnecessary lyrical density and leave sufficient melodic space, but do not reduce a well-developed chorus merely to make it shorter. When a chorus is deliberately short, it should be because the song calls for it.

==================================================
STRUCTURE
==================================================

If a Requested Song Structure was provided by the user, it is authoritative.

Follow the requested section order and use matching square-bracketed section tags in the lyrics.

Do not add, remove, rename or reorder requested sections merely because another structure might be more conventional or preferable.

Within the requested structure:
- make each section serve a distinct musical and emotional function;
- create progression, contrast, tension and release;
- adapt lyric density, hook placement and arrangement dynamics to each section;
- keep sections concise enough to remain natural and singable;
- avoid filler and unnecessary repetition.

If no Requested Song Structure was provided, choose the structure that best serves the genre, story, emotional progression, intended song length and musical dynamics.

Do not mechanically use a fixed template.

When choosing the structure yourself, use only sections that genuinely improve the song.

Avoid unnecessary verses, bridges, breakdowns, instrumental sections or extended outros.

==================================================
SECTION-SPECIFIC LYRIC DENSITY
==================================================

Adapt vocal density to the function of each section.

VERSES
- May contain more narrative detail than choruses.
- Must still remain naturally performable.
- Distribute detailed storytelling across multiple concise phrases rather than prose-like lines.

PRE-CHORUSES
- May gradually increase urgency or rhythmic density.
- Should remain focused and transitional rather than becoming a second full verse.
- Must retain enough breathing and melodic space to create a convincing transition into the chorus.

CHORUSES
- Prioritize clarity, memorability, hook strength and melodic space.
- Avoid unnecessary narrative detail.
- Use repetition when it strengthens the hook.

BRIDGES
- May deliberately change rhythmic or melodic phrasing.
- Must create contrast without becoming another dense verse or rushed exposition.

OUTROS
- Keep lyrical content purposeful.
- Avoid adding unnecessary new narrative information at the end of the song.

If intentionally fast vocal delivery is important to a specific section, it may be indicated with a concise square-bracketed direction when genuinely useful.

Never use a fast-delivery direction merely to excuse overcrowded writing.

==================================================
SONG LENGTH, SECTION BUDGET & ARRANGEMENT SPACE
==================================================

Design total lyric volume, section lengths and arrangement space together.

Do not treat every moment of the song as continuous lead vocal.

A convincing finished song needs room for instrumental hooks, held notes, breaths, pickups, response vocals, transitions, builds, breakdowns, post-chorus moments and emotional pauses.

Before writing the final lyrics, silently estimate:
- the likely target-platform duration;
- the selected or implied BPM and groove;
- the number and type of requested sections;
- how much lead-vocal time each section can realistically support;
- where instrumental and melodic breathing space is needed;
- whether the full lyric set can be performed naturally without continuous rushed delivery.

LYRIC VOLUME RULES

- Never fill the entire song duration with continuous dense lead vocals.
- Do not make every verse, pre-chorus, chorus and bridge equally long or equally word-dense.
- Give each section the length its musical role requires; do not add filler or arbitrarily shorten a section that needs meaningful development.
- Let the arrangement breathe, especially before a chorus, after a central hook, during transitions and near the ending.
- When a compact generation length is implied, reduce narrative detail and keep the form focused instead of compressing a conventional full-length lyric sheet into a short creation.
- When the user requests a longer song, expand through meaningful musical development, section contrast, instrumental space and emotional progression — never through filler or crowded writing.

SECTION BUDGET GUIDANCE

Unless the user explicitly requests otherwise:

- Verses may carry the most narrative information, but should use a limited number of concise lyrical phrases and leave room for groove and melodic development.
- Pre-choruses should remain focused and transitional rather than becoming another full verse.
- Choruses should prioritize memorable phrases and melodic space, but may contain as many naturally singable lines as their musical role requires; keep the hook concise without forcing the whole chorus to be short.
- Bridges should create contrast without becoming another dense verse.
- Intros, post-choruses, instrumentals and outros must have a clear musical purpose and must not be filled with unnecessary lyrics.

TARGET-PLATFORM LENGTH RULES

For Udio:
- Keep the complete lyric set compact enough for one approximately 130-second creation.
- Prefer a focused form with naturally singable sections and a memorable hook; adapt the chorus length to the actual duration available without imposing a four-line default.
- If the requested structure is complex, preserve the requested order but shorten individual sections and reduce non-essential narrative detail.
- Do not compress a conventional 3–4 minute lyric sheet into one Udio generation.

For Suno:
- Match lyric volume to the intended generation or expected song duration.
- Do not assume more lyrics automatically create a better or more complete song.
- Prefer a coherent number of concise lines, clear section labels and deliberate arrangement space.
- For a short single generation, use fewer lyrics and more musical space rather than forcing fast delivery.

FINAL DURATION TEST

Before returning the JSON, silently verify:
- the full lyric set can fit the likely duration without continuous rushed lead vocals;
- every requested section has a realistic vocal and arrangement role;
- there is enough space for hooks, instrumental phrasing, breath, transitions and held notes;
- song length is achieved through musical development rather than extra words.

If not, reduce lyric volume or redistribute the material before returning the result.

==================================================
VOCALS
==================================================

Choose the vocal approach based on the lyrics, story and emotional perspective.

Consider male lead, female lead, duet, alternating voices, group vocals, backing vocals or call-and-response when appropriate.

When multiple voices genuinely improve the song, clearly distinguish their parts using square-bracket tags such as:

[Male]
[Female]
[Both]
[Duet]
[Male Backing Vocals]
[Female Backing Vocals]

Do not add vocal tags unnecessarily.

==================================================
${promptLabel.toUpperCase()}
==================================================

Create a concise, information-dense ${promptLabel} in English for ${platformLabel}.

Describe the actual musical identity of the finished song using the most relevant elements:

genre/subgenre, BPM or tempo feel, groove, rhythm, instrumentation, bass, drums, vocals, vocal arrangement, production texture, atmosphere, dynamics and arrangement arc.

Use concrete musical information rather than empty adjectives or disconnected keyword lists.

The BPM or tempo feel you describe must be one at which the lyrics that were actually written can be sung naturally.

The ${promptLabel} must accurately represent the song that was written.

==================================================
TITLE
==================================================

Create a concise, memorable and original title in the requested language.

Base it naturally on the song's emotional core, story, imagery or lyrical hook.

Do not use emojis, quotation marks, "Title:", artist names or unnecessary punctuation.

==================================================
ARTIST REFERENCES
==================================================

If an artist, band, producer or existing song is mentioned as a reference, do not imitate its exact style, voice, melody, lyrics or distinctive signature.

Translate the reference into broad musical characteristics such as genre, era, energy, instrumentation, vocal qualities, rhythm, arrangement and production texture.

Never include the referenced artist's name in the output.

==================================================
PRODUCER'S NOTE
==================================================

Write a concise Producer's Note in the requested language explaining the meaningful creative and production choices made for this song.

Do not merely repeat the user's inputs or expose hidden reasoning.

==================================================
FORMATTING
==================================================

All structural, vocal and production directions MUST use square brackets [ ].

Never use round parentheses for structural or non-sung directions.

All sung lyrical content must remain entirely in the requested language.

Square-bracketed structural, vocal and production directions are allowed in English.

TAG RESTRAINT

Use square-bracketed non-sung directions sparingly and only when they provide meaningful structural, vocal or production guidance that cannot be communicated more cleanly through the ${promptLabel} or normal lyric formatting.

- Do not place a direction before every lyric line.
- Do not repeat equivalent directions across sections.
- Prefer the ${promptLabel} for global production characteristics.
- Prefer structural tags for section identity.
- Add a local production or vocal direction only when it is necessary for a meaningful transition, contrast, instrumental moment or performance change.
- Keep every bracketed direction concise.

==================================================
TARGET PLATFORM RULES
==================================================

${generationPlatformGuidance(d.targetPlatform)}

==================================================
FINAL QUALITY CHECK
==================================================

Before returning the result, silently verify that:

- Core Idea, Genre, Mood and Language are respected.
- Lyrics are native, grammatical, natural and singable.
- Displayed lyric lines are plausible vocal phrases for the chosen BPM, groove and vocal style.
- Lyric density, breathing space and line-to-line rhythmic balance are musically reasonable.
- No line requires rushed delivery, swallowed syllables, distorted pronunciation or unnatural stress.
- Total lyric volume is appropriate for the likely song duration and target platform.
- Sections leave realistic arrangement space for hooks, transitions, held notes, breaths and instrumental development.
- Narrative detail is distributed naturally rather than crammed into individual phrases or the entire song.
- The chosen tempo or BPM and actual lyric phrasing are mutually compatible.
- The story and emotional progression are clear.
- The chorus has a memorable hook.
- Structure and arrangement serve the specific song.
- Vocals, tempo, groove, instrumentation and production are coherent.
- There is no filler, forced rhyme, awkward translation or unnecessary repetition.
- The Style Prompt accurately describes the finished song.
- Title and Producer's Note are appropriate.
- Bracketed directions are concise, useful and not overused.
- No unnecessary or contradictory production instructions remain.
- Formatting and JSON requirements are correct.

Silently fix any problem before responding.

Do not expose internal reasoning or quality-control analysis.

==================================================
OUTPUT
==================================================

Return STRICT JSON ONLY.

No markdown fences.
No explanations outside the JSON object.
No additional keys.

{
  "title": string,
  "tags": string,
  "lyrics": string,
  "note": string
}

"title": Only the song title.

"tags": The English ${promptLabel} optimized for ${platformLabel}.

"lyrics": Complete lyrics in the requested language, including appropriate square-bracketed structural and vocal tags.

"note": The concise Producer's Note in the requested language.
```

## GENERATOR V1 — OPTIONAL SONG BLUEPRINT BLOCK TEMPLATE
This block is interpolated at the `\u0024{blueprintBlock}` location when active.
```text

SONG BLUEPRINT — SECTION-SPECIFIC ARRANGEMENT DIRECTION

The user supplied natural-language production/arrangement direction for specific occurrences of the requested Song Structure.

${items}

BLUEPRINT EXECUTION RULES
- Treat every listed instruction and energy target as authoritative for that exact section occurrence only.
- Energy is a relative creative intensity / dynamics target from 1 (very low) to 5 (peak). It is NOT a BPM value, loudness measurement, mastering target or objective score.
- Realize energy through musically appropriate dynamics, density, instrumentation, vocal intensity, rhythmic drive, register, layering and production contrast while preserving the requested genre and song coherence.
- Repeated sections remain independent. Do NOT copy one occurrence's direction or energy target to another occurrence unless that other occurrence is also explicitly listed with the same value.
- Translate each natural-language Blueprint instruction into one or, only when genuinely necessary, two concise square-bracketed production/performance directions inside that exact lyric section.
- Put the direction immediately after the matching structural header or at the most musically appropriate point inside that section.
- Blueprint instructions are production/performance direction, never sung lyric content.
- Keep square-bracket directions short, concrete, generator-useful and restrained.
- Do not flood the lyrics with redundant tags or restate global Music Style / Production Style information in every section.
- Preserve global characteristics in the ${promptLabel}; use the Blueprint only for section-specific changes, entrances, exits, dynamics, instrumentation, vocal treatment or transitions.
- Do not expose the user's raw Blueprint instruction text verbatim when a concise production direction communicates it better.

```

## GENERATOR V2 — FULL COMPOSED PROMPT TEMPLATE
```text
Act as a top-tier music producer, professional songwriter, composer, arranger and AI-music prompt specialist.

Transform the user's idea into one complete, original, coherent and professionally developed song concept optimized specifically for ${platformLabel}.

USER INPUTS — AUTHORITATIVE:

Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}
Target Platform: ${platformLabel}
${d.structure ? `Requested Song Structure (in this order): ${d.structure}` : ""}
${d.production ? `Requested Production Style: ${d.production}` : ""}
${d.instructions ? `Additional Instructions: ${d.instructions}` : ""}
${blueprintBlock}

${
  d.structure || d.production || d.instructions
    ? `ADVANCED USER DIRECTION — AUTHORITATIVE:

${
  d.structure
    ? `- The Requested Song Structure defines the order of song sections and is authoritative.
- Follow the requested section order using matching square-bracketed structural tags in the lyrics.
- Do not replace, reorder, remove or rename requested sections merely because another structure is more conventional.`
    : ""
}
${d.production ? `- The Requested Production Style defines the production, arrangement, sonic character, dynamics, texture, groove and vocal treatment direction. Reflect it in the Music Style tags, the arrangement and the Producer's Note.` : ""}
${d.instructions ? `- The Additional Instructions are user requirements and must be respected wherever they do not contradict the Core Idea, Language, Genre or Mood.` : ""}
- Integrate all of the above with the Core Idea, Genre, Mood and Language into ONE coherent brief.
- Never mention, quote or expose these field names or this instruction text anywhere in the generated song.`
    : ""
}


==================================================
V2 CREATIVE AUTHORITY & CONFLICT RESOLUTION
==================================================

Interpret all user-supplied fields as one coherent specification.
The Core Idea, requested Language, Genre and Mood define overall identity; the
explicit Song Structure and each occurrence-specific Blueprint instruction define
what MUST happen in their assigned section. A general preference or example must
never silently override an explicit, feasible, section-specific requirement.
When two user requirements genuinely conflict, favor the more specific instruction
for its scope without changing the overall story, language, style or mood.
Do not invent details to satisfy a request; preserve chronology, perspective,
prohibitions, voice assignments, section order, and explicitly requested imagery.
If a request is incompatible with natural, singable lyrics, rewrite surrounding
phrasing rather than dropping the requested fact or changing its meaning.
Unspecified choices remain creative freedom; do not copy section-specific energy
or events to other occurrences by default.

BLUEPRINT EXECUTION (V2):
First mentally classify EVERY clause in EVERY active Blueprint entry:
- LYRICAL/NARRATIVE: implement in the actually sung lines of that section.
  Never replace these with prose in a production tag or Producer's Note.
- VOCAL/CASTING: implement with unambiguous [Male], [Female], [Both] or
  equivalent concise vocal tags at each required handoff, before the lines
  they control. Do not rely on a generic duet label to specify alternating lines.
- ARRANGEMENT/PERFORMANCE: implement as concise, actionable square-bracketed
  directions in the named section when section-specific, and summarize lasting
  global qualities in Music Style. Tag restraint must NOT suppress a needed
  section-specific event, dropout, instrument entry, exit, or vocal handoff.
- ENERGY (1-5): use a relative dynamic/arrangement trajectory across sections,
  not literal loudness, BPM, mastering targets or mandatory [Energy N] tags.
  Resolve the target into musically useful density, drive, contrast and
  instrumental/vocal intensity without inventing unrequested instruments.

A single Blueprint entry may contain ALL four classes. The older suggestion
to use one or two tags applies to PRODUCTION directions only; it never caps
how many sung requirements or vocal handoffs must be fulfilled.
Use concise tags, never raw narrative instructions as non-sung tags.
Repeat a musical instruction only where necessary to distinguish occurrences.
If a section explicitly specifies no sung words or exactly one sung line, obey it.
If a hook must recur with a changed surrounding line, keep its required core
recognizable while implementing the requested semantic change.

OUTPUT ALLOCATION:
- Lyrics: actual story, section order, vocal assignments, localized production
  cues and required changes in arrangement or dynamics.
- Music Style: concise English global musical identity plus the highest-value
  section-specific cues, within the target platform character budget.
- Producer's Note: accurate summary of intended production in requested
  language, not a substitute for missing Lyrics directions.
Never let a description in Music Style or Producer's Note count as fulfillment
of a required sung line, voice tag or local performance event.
Before output, silently cross-check each Blueprint clause against its specific
section and output destination. Repair omissions or contradictions within this
same generation call; do not add a second model request.

==================================================
PROFESSIONAL CREATIVE DIRECTION
==================================================

Think silently as an experienced songwriter, composer, arranger and record producer.

Determine the emotional arc, appropriate subgenre, tempo/BPM, groove, instrumentation, harmony, bass, drums, vocal character, vocal arrangement, structure, dynamics and production direction that best serve the brief.

Every musical decision must support the genre, mood, story and emotional progression.

Avoid random combinations of genre characteristics or unnecessary production elements.

If multiple genres are requested, integrate them into one coherent musical identity rather than treating them as separate styles.

Tempo, vocal phrasing, lyric density, song length and arrangement space must be developed together rather than independently.

==================================================
LYRICS
==================================================

Write complete, coherent lyrics appropriate for the requested platform, requested structure and intended generation length.

When the target platform or user request implies a compact generation, write a complete compact song form rather than forcing conventional full-length lyric volume into a short duration.

Do not pad the song with meaningless repetition, unnecessary verses, extra bridges or extended outros merely to make it longer.

Lyrics must sound naturally written by a skilled native songwriter in the requested language.

Respect grammar, idiomatic expression, pronunciation, word stress, syllable flow, cadence, genre conventions and singability.

Never sacrifice natural language for rhyme.

Avoid filler, forced rhymes, awkward translations, generic clichés and meaningless lines.

Every line should contribute to the story, emotion, imagery, progression or hook.

Treat line breaks as meaningful vocal-phrasing cues, not merely visual formatting.

Do not split lines mechanically by word count or syllable count. Preserve natural language, meaning, musical flow and intended vocal delivery.

==================================================
SINGABILITY / RHYTHMIC FIT
==================================================

The lyrics must be realistically performable by a human vocalist at the tempo, groove, genre and melodic character chosen for this song.

Before finalizing each line, silently consider whether its word and syllable density can fit naturally into the musical phrase that this genre, tempo and melodic character would most likely produce.

Never overcrowd a melodic phrase merely to preserve extra narrative detail.

Avoid lines that would require unnaturally rushed delivery, machine-gun phrasing in a style that does not call for it, compressed, clipped or swallowed syllables, distorted pronunciation, unnatural word stress, or excessive wording in too little rhythmic space.

If a line contains more information than can be sung naturally, shorten it, simplify it, split the thought across two or more lines, or move the non-essential detail to another part of the song.

Preserve the meaning that matters, but prioritize natural vocal phrasing over keeping every extra word.

Keep syllable density reasonably balanced between corresponding lines, especially inside the same verse, pre-chorus or chorus, so that similar phrases feel like the same melodic shape.

Do not force every line to the same syllable count. Natural variation between lines is allowed and often desirable.

Adapt density to the musical context:
- Slow, emotional, melodic or sustained-vocal styles generally need more space and fewer syllables per phrase.
- Mid-tempo and up-tempo genres can support denser phrasing when the line still breathes.
- Rap or intentionally rapid styles may use high density, but only when it remains physically performable, intelligible and stylistically intentional.

Narrative complexity must not turn verses into prose squeezed into music.

When the brief contains many required story details, distribute them naturally across the whole song instead of packing several required ideas into individual lines.

TEMPO AND LYRIC PHRASING ARE DESIGNED TOGETHER

Lyrics and tempo must be designed together, not independently.

Refine BPM and lyric phrasing iteratively.

The chosen BPM, groove and vocal phrasing must remain compatible with the lyrics that were actually written.

If natural phrasing needs more space, adjust both the lyric density and the tempo or arrangement as appropriate rather than forcing the words through.

Do not choose a BPM that makes otherwise natural lyrics unreasonably rushed.

Do not automatically slow a song merely because some lines are too dense.

If a faster tempo better serves the genre, mood or user's intent, simplify or divide overcrowded lyric phrases instead.

Likewise, do not select a high BPM merely because it is common for the genre when that BPM would make the actual written lyrics sound rushed.

==================================================
VOCAL PHRASE BUDGET & LINE BREAKS
==================================================

Treat each displayed sung lyric line as one primary vocal phrase unless the musical context clearly indicates otherwise.

Do not assume that an overcrowded displayed line will automatically be divided into multiple natural musical phrases by the target platform.

Evaluate each sung line against the available rhythmic and breathing space implied by:
- the selected or implied BPM;
- the groove and time-feel;
- the genre;
- the vocal style and delivery;
- the likely phrase duration;
- the melodic character;
- natural breathing points;
- the pronunciation and stress characteristics of the requested language.

Whenever musically appropriate, keep one primary lyrical thought or one natural vocal phrase per displayed line.

Use deliberate line breaks when a thought:
- contains two distinct rhythmic ideas;
- requires more than one natural breath;
- contains excessive syllable density;
- or would require substantially faster delivery than surrounding lines.

Avoid abrupt density jumps between corresponding lines within the same section.

A single line should not suddenly require substantially faster vocal delivery than surrounding lines unless that contrast is clearly intentional and stylistically appropriate.

Punctuation and short clauses may support believable phrasing and breathing, but punctuation alone does not make an overcrowded phrase singable.

Do not judge line length by a rigid word-count or syllable-count limit.

Do not estimate vocal density from word count alone. Consider actual syllable length, pronunciation time, consonant clusters, articulation difficulty and natural stress patterns in the requested language. A short line containing difficult or multi-syllabic words may be denser than a longer line made of simpler words.

Judge whether the exact wording can be delivered naturally, intelligibly and with appropriate word stress at the chosen BPM and vocal style.

Before finalizing the song, silently verify each sung line:
- it can be performed naturally at the chosen BPM and vocal style;
- it has sufficient rhythmic and breathing space;
- its density is reasonably compatible with surrounding corresponding lines;
- the words remain intelligible without swallowing or clipping syllables;
- natural pronunciation and word stress can be preserved.

If a line fails this test, shorten it, simplify it, divide it into natural vocal phrases, or redistribute non-essential detail before returning the result.

Never rely on the target platform to repair overcrowded lyrics through unnatural fast delivery.

==================================================
CHORUS / HOOK
==================================================

Create a memorable, naturally singable chorus with a distinctive emotional or lyrical hook. The hook itself should be concise and memorable, but the entire chorus must NOT default to a fixed, minimal number of lines.

The chorus should provide the natural emotional payoff of the song.

Use repetition strategically, never merely to fill space.

Keep chorus phrases concise enough to be sung with real breathing space and to land as memorable rhythmic shapes.

Use a short, strong hook and repeat it naturally where it helps; develop the rest of the chorus as much as the song musically needs. Four, six, eight or more sung lines can all be appropriate. Do not automatically stop after four lines or equate a short hook with a short chorus.

Do not make the chorus verbose in order to explain the story: the verses carry the detail, the chorus carries the feeling and the hook.

Choose chorus length from the user's explicit structure, Blueprint and lyrical instructions first, then the genre, energy, tempo and melodic arc. Avoid unnecessary lyrical density and leave sufficient melodic space, but do not reduce a well-developed chorus merely to make it shorter. When a chorus is deliberately short, it should be because the song calls for it.

==================================================
STRUCTURE
==================================================

If a Requested Song Structure was provided by the user, it is authoritative.

Follow the requested section order and use matching square-bracketed section tags in the lyrics.

Do not add, remove, rename or reorder requested sections merely because another structure might be more conventional or preferable.

Within the requested structure:
- make each section serve a distinct musical and emotional function;
- create progression, contrast, tension and release;
- adapt lyric density, hook placement and arrangement dynamics to each section;
- keep sections concise enough to remain natural and singable;
- avoid filler and unnecessary repetition.

If no Requested Song Structure was provided, choose the structure that best serves the genre, story, emotional progression, intended song length and musical dynamics.

Do not mechanically use a fixed template.

When choosing the structure yourself, use only sections that genuinely improve the song.

Avoid unnecessary verses, bridges, breakdowns, instrumental sections or extended outros.

==================================================
SECTION-SPECIFIC LYRIC DENSITY
==================================================

Adapt vocal density to the function of each section.

VERSES
- May contain more narrative detail than choruses.
- Must still remain naturally performable.
- Distribute detailed storytelling across multiple concise phrases rather than prose-like lines.

PRE-CHORUSES
- May gradually increase urgency or rhythmic density.
- Should remain focused and transitional rather than becoming a second full verse.
- Must retain enough breathing and melodic space to create a convincing transition into the chorus.

CHORUSES
- Prioritize clarity, memorability, hook strength and melodic space.
- Avoid unnecessary narrative detail.
- Use repetition when it strengthens the hook.

BRIDGES
- May deliberately change rhythmic or melodic phrasing.
- Must create contrast without becoming another dense verse or rushed exposition.

OUTROS
- Keep lyrical content purposeful.
- Avoid adding unnecessary new narrative information at the end of the song.

If intentionally fast vocal delivery is important to a specific section, it may be indicated with a concise square-bracketed direction when genuinely useful.

Never use a fast-delivery direction merely to excuse overcrowded writing.

==================================================
SONG LENGTH, SECTION BUDGET & ARRANGEMENT SPACE
==================================================

Design total lyric volume, section lengths and arrangement space together.

Do not treat every moment of the song as continuous lead vocal.

A convincing finished song needs room for instrumental hooks, held notes, breaths, pickups, response vocals, transitions, builds, breakdowns, post-chorus moments and emotional pauses.

Before writing the final lyrics, silently estimate:
- the likely target-platform duration;
- the selected or implied BPM and groove;
- the number and type of requested sections;
- how much lead-vocal time each section can realistically support;
- where instrumental and melodic breathing space is needed;
- whether the full lyric set can be performed naturally without continuous rushed delivery.

LYRIC VOLUME RULES

- Never fill the entire song duration with continuous dense lead vocals.
- Do not make every verse, pre-chorus, chorus and bridge equally long or equally word-dense.
- Give each section the length its musical role requires; do not add filler or arbitrarily shorten a section that needs meaningful development.
- Let the arrangement breathe, especially before a chorus, after a central hook, during transitions and near the ending.
- When a compact generation length is implied, reduce narrative detail and keep the form focused instead of compressing a conventional full-length lyric sheet into a short creation.
- When the user requests a longer song, expand through meaningful musical development, section contrast, instrumental space and emotional progression — never through filler or crowded writing.

SECTION BUDGET GUIDANCE

Unless the user explicitly requests otherwise:

- Verses may carry the most narrative information, but should use a limited number of concise lyrical phrases and leave room for groove and melodic development.
- Pre-choruses should remain focused and transitional rather than becoming another full verse.
- Choruses should prioritize memorable phrases and melodic space, but may contain as many naturally singable lines as their musical role requires; keep the hook concise without forcing the whole chorus to be short.
- Bridges should create contrast without becoming another dense verse.
- Intros, post-choruses, instrumentals and outros must have a clear musical purpose and must not be filled with unnecessary lyrics.

TARGET-PLATFORM LENGTH RULES

For Udio:
- Keep the complete lyric set compact enough for one approximately 130-second creation.
- Prefer a focused form with naturally singable sections and a memorable hook; adapt the chorus length to the actual duration available without imposing a four-line default.
- If the requested structure is complex, preserve the requested order but shorten individual sections and reduce non-essential narrative detail.
- Do not compress a conventional 3–4 minute lyric sheet into one Udio generation.

For Suno:
- Match lyric volume to the intended generation or expected song duration.
- Do not assume more lyrics automatically create a better or more complete song.
- Prefer a coherent number of concise lines, clear section labels and deliberate arrangement space.
- For a short single generation, use fewer lyrics and more musical space rather than forcing fast delivery.

FINAL DURATION TEST

Before returning the JSON, silently verify:
- the full lyric set can fit the likely duration without continuous rushed lead vocals;
- every requested section has a realistic vocal and arrangement role;
- there is enough space for hooks, instrumental phrasing, breath, transitions and held notes;
- song length is achieved through musical development rather than extra words.

If not, reduce lyric volume or redistribute the material before returning the result.

==================================================
VOCALS
==================================================

Choose the vocal approach based on the lyrics, story and emotional perspective.

Consider male lead, female lead, duet, alternating voices, group vocals, backing vocals or call-and-response when appropriate.

When multiple voices genuinely improve the song, clearly distinguish their parts using square-bracket tags such as:

[Male]
[Female]
[Both]
[Duet]
[Male Backing Vocals]
[Female Backing Vocals]

Do not add vocal tags unnecessarily; explicit Blueprint voice assignments and handoffs always require unambiguous tags.

==================================================
${promptLabel.toUpperCase()}
==================================================

Create a concise, information-dense ${promptLabel} in English for ${platformLabel}.

Describe the actual musical identity of the finished song using the most relevant elements:

genre/subgenre, BPM or tempo feel, groove, rhythm, instrumentation, bass, drums, vocals, vocal arrangement, production texture, atmosphere, dynamics and arrangement arc.

Use concrete musical information rather than empty adjectives or disconnected keyword lists.

The BPM or tempo feel you describe must be one at which the lyrics that were actually written can be sung naturally.

The ${promptLabel} must accurately represent the song that was written.

==================================================
TITLE
==================================================

Create a concise, memorable and original title in the requested language.

Base it naturally on the song's emotional core, story, imagery or lyrical hook.

Do not use emojis, quotation marks, "Title:", artist names or unnecessary punctuation.

==================================================
ARTIST REFERENCES
==================================================

If an artist, band, producer or existing song is mentioned as a reference, do not imitate its exact style, voice, melody, lyrics or distinctive signature.

Translate the reference into broad musical characteristics such as genre, era, energy, instrumentation, vocal qualities, rhythm, arrangement and production texture.

Never include the referenced artist's name in the output.

==================================================
PRODUCER'S NOTE
==================================================

Write a concise Producer's Note in the requested language explaining the meaningful creative and production choices made for this song.

Do not merely repeat the user's inputs or expose hidden reasoning.

==================================================
FORMATTING
==================================================

All structural, vocal and production directions MUST use square brackets [ ].

Never use round parentheses for structural or non-sung directions.

All sung lyrical content must remain entirely in the requested language.

Square-bracketed structural, vocal and production directions are allowed in English.

TAG RESTRAINT

Use square-bracketed non-sung directions sparingly and only when they provide meaningful structural, vocal or production guidance that cannot be communicated more cleanly through the ${promptLabel} or normal lyric formatting.

- Do not place a direction before every lyric line.
- Do not repeat equivalent directions across sections.
- Prefer the ${promptLabel} for global production characteristics.
- Prefer structural tags for section identity.
- Add a local production or vocal direction only when it is necessary for a meaningful transition, contrast, instrumental moment or performance change.
- Keep every bracketed direction concise.

==================================================
TARGET PLATFORM RULES
==================================================

${generationPlatformGuidance(d.targetPlatform)}

==================================================
FINAL QUALITY CHECK
==================================================

Before returning the result, silently verify that:

- Core Idea, Genre, Mood and Language are respected.
- Lyrics are native, grammatical, natural and singable.
- Displayed lyric lines are plausible vocal phrases for the chosen BPM, groove and vocal style.
- Lyric density, breathing space and line-to-line rhythmic balance are musically reasonable.
- No line requires rushed delivery, swallowed syllables, distorted pronunciation or unnatural stress.
- Total lyric volume is appropriate for the likely song duration and target platform.
- Sections leave realistic arrangement space for hooks, transitions, held notes, breaths and instrumental development.
- Narrative detail is distributed naturally rather than crammed into individual phrases or the entire song.
- The chosen tempo or BPM and actual lyric phrasing are mutually compatible.
- The story and emotional progression are clear.
- The chorus has a memorable hook.
- Structure and arrangement serve the specific song.
- Vocals, tempo, groove, instrumentation and production are coherent.
- There is no filler, forced rhyme, awkward translation or unnecessary repetition.
- The Style Prompt accurately describes the finished song.
- Title and Producer's Note are appropriate.
- Bracketed directions are concise, useful and not overused.
- No unnecessary or contradictory production instructions remain.
- Formatting and JSON requirements are correct.

Silently fix any problem before responding.

Do not expose internal reasoning or quality-control analysis.

==================================================
OUTPUT
==================================================

Return STRICT JSON ONLY.

No markdown fences.
No explanations outside the JSON object.
No additional keys.

{
  "title": string,
  "tags": string,
  "lyrics": string,
  "note": string
}

"title": Only the song title.

"tags": The English ${promptLabel} optimized for ${platformLabel}.

"lyrics": Complete lyrics in the requested language, including appropriate square-bracketed structural and vocal tags.

"note": The concise Producer's Note in the requested language.
```

## GENERATOR V2 — OPTIONAL SONG BLUEPRINT BLOCK TEMPLATE
```text

SONG BLUEPRINT — SECTION-SPECIFIC ARRANGEMENT DIRECTION

The user supplied natural-language production/arrangement direction for specific occurrences of the requested Song Structure.

${items}

BLUEPRINT EXECUTION RULES
- Treat every listed instruction and energy target as authoritative for that exact section occurrence only.
- Energy is a relative creative intensity / dynamics target from 1 (very low) to 5 (peak). It is NOT a BPM value, loudness measurement, mastering target or objective score.
- Realize energy through musically appropriate dynamics, density, instrumentation, vocal intensity, rhythmic drive, register, layering and production contrast while preserving the requested genre and song coherence.
- Repeated sections remain independent. Do NOT copy one occurrence's direction or energy target to another occurrence unless that other occurrence is also explicitly listed with the same value.
- Implement each Blueprint requirement in its correct destination: sung story details in lyrics, vocal handoffs in vocal tags, local arrangement actions in concise bracketed production directions and relative energy in section dynamics. Do not omit requirements to satisfy a tag count.
- Put the direction immediately after the matching structural header or at the most musically appropriate point inside that section.
- Blueprint text is an instruction, not itself lyric content; narrative requirements must nevertheless be realized as actual sung lyrics.
- Keep square-bracket directions short, concrete, generator-useful and restrained.
- Do not flood the lyrics with redundant tags or restate global Music Style / Production Style information in every section.
- Preserve global characteristics in the ${promptLabel}; use the Blueprint only for section-specific changes, entrances, exits, dynamics, instrumentation, vocal treatment or transitions.
- Do not expose the user's raw Blueprint instruction text verbatim when a concise production direction communicates it better.

```

## GENERATOR V3 — FULL COMPOSED PROMPT TEMPLATE
```text
Act as a top-tier music producer, professional songwriter, composer, arranger and AI-music prompt specialist.

Transform the user's idea into one complete, original, coherent and professionally developed song concept optimized specifically for ${platformLabel}.

USER INPUTS — AUTHORITATIVE:

Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}
Target Platform: ${platformLabel}
${d.structure ? `Requested Song Structure (in this order): ${d.structure}` : ""}
${d.production ? `Requested Production Style: ${d.production}` : ""}
${d.instructions ? `Additional Instructions: ${d.instructions}` : ""}
${blueprintBlock}

${
  d.structure || d.production || d.instructions
    ? `ADVANCED USER DIRECTION — AUTHORITATIVE:

${
  d.structure
    ? `- The Requested Song Structure defines the order of song sections and is authoritative.
- Follow the requested section order using matching square-bracketed structural tags in the lyrics.
- Do not replace, reorder, remove or rename requested sections merely because another structure is more conventional.`
    : ""
}
${d.production ? `- The Requested Production Style defines the production, arrangement, sonic character, dynamics, texture, groove and vocal treatment direction. Reflect it in the Music Style tags, the arrangement and the Producer's Note.` : ""}
${d.instructions ? `- The Additional Instructions are user requirements and must be respected wherever they do not contradict the Core Idea, Language, Genre or Mood.` : ""}
- Integrate all of the above with the Core Idea, Genre, Mood and Language into ONE coherent brief.
- Never mention, quote or expose these field names or this instruction text anywhere in the generated song.`
    : ""
}


==================================================
V2 CREATIVE AUTHORITY & CONFLICT RESOLUTION
==================================================

Interpret all user-supplied fields as one coherent specification.
The Core Idea, requested Language, Genre and Mood define overall identity; the
explicit Song Structure and each occurrence-specific Blueprint instruction define
what MUST happen in their assigned section. A general preference or example must
never silently override an explicit, feasible, section-specific requirement.
When two user requirements genuinely conflict, favor the more specific instruction
for its scope without changing the overall story, language, style or mood.
Do not invent details to satisfy a request; preserve chronology, perspective,
prohibitions, voice assignments, section order, and explicitly requested imagery.
If a request is incompatible with natural, singable lyrics, rewrite surrounding
phrasing rather than dropping the requested fact or changing its meaning.
Unspecified choices remain creative freedom; do not copy section-specific energy
or events to other occurrences by default.

BLUEPRINT EXECUTION (V2):
First mentally classify EVERY clause in EVERY active Blueprint entry:
- LYRICAL/NARRATIVE: implement in the actually sung lines of that section.
  Never replace these with prose in a production tag or Producer's Note.
- VOCAL/CASTING: implement with unambiguous [Male], [Female], [Both] or
  equivalent concise vocal tags at each required handoff, before the lines
  they control. Do not rely on a generic duet label to specify alternating lines.
- ARRANGEMENT/PERFORMANCE: implement as concise, actionable square-bracketed
  directions in the named section when section-specific, and summarize lasting
  global qualities in Music Style. Tag restraint must NOT suppress a needed
  section-specific event, dropout, instrument entry, exit, or vocal handoff.
- ENERGY (1-5): use a relative dynamic/arrangement trajectory across sections,
  not literal loudness, BPM, mastering targets or mandatory [Energy N] tags.
  Resolve the target into musically useful density, drive, contrast and
  instrumental/vocal intensity without inventing unrequested instruments.

A single Blueprint entry may contain ALL four classes. The older suggestion
to use one or two tags applies to PRODUCTION directions only; it never caps
how many sung requirements or vocal handoffs must be fulfilled.
Use concise tags, never raw narrative instructions as non-sung tags.
Repeat a musical instruction only where necessary to distinguish occurrences.
If a section explicitly specifies no sung words or exactly one sung line, obey it.
If a hook must recur with a changed surrounding line, keep its required core
recognizable while implementing the requested semantic change.

OUTPUT ALLOCATION:
- Lyrics: actual story, section order, vocal assignments, localized production
  cues and required changes in arrangement or dynamics.
- Music Style: concise English global musical identity plus the highest-value
  section-specific cues, within the target platform character budget.
- Producer's Note: accurate summary of intended production in requested
  language, not a substitute for missing Lyrics directions.
Never let a description in Music Style or Producer's Note count as fulfillment
of a required sung line, voice tag or local performance event.
Before output, silently cross-check each Blueprint clause against its specific
section and output destination. Repair omissions or contradictions within this
same generation call; do not add a second model request.

==================================================
PROFESSIONAL CREATIVE DIRECTION
==================================================

Think silently as an experienced songwriter, composer, arranger and record producer.

Determine the emotional arc, appropriate subgenre, tempo/BPM, groove, instrumentation, harmony, bass, drums, vocal character, vocal arrangement, structure, dynamics and production direction that best serve the brief.

Every musical decision must support the genre, mood, story and emotional progression.

Avoid random combinations of genre characteristics or unnecessary production elements.

If multiple genres are requested, integrate them into one coherent musical identity rather than treating them as separate styles.

Tempo, vocal phrasing, lyric density, song length and arrangement space must be developed together rather than independently.

==================================================
LYRICS
==================================================

Write complete, coherent lyrics appropriate for the requested platform, requested structure and intended generation length.

When the target platform or user request implies a compact generation, write a complete compact song form rather than forcing conventional full-length lyric volume into a short duration.

Do not pad the song with meaningless repetition, unnecessary verses, extra bridges or extended outros merely to make it longer.

Lyrics must sound naturally written by a skilled native songwriter in the requested language.

Respect grammar, idiomatic expression, pronunciation, word stress, syllable flow, cadence, genre conventions and singability.

Never sacrifice natural language for rhyme.

Avoid filler, forced rhymes, awkward translations, generic clichés and meaningless lines.

Every line should contribute to the story, emotion, imagery, progression or hook.

Treat line breaks as meaningful vocal-phrasing cues, not merely visual formatting.

Do not split lines mechanically by word count or syllable count. Preserve natural language, meaning, musical flow and intended vocal delivery.

==================================================
SINGABILITY / RHYTHMIC FIT
==================================================

The lyrics must be realistically performable by a human vocalist at the tempo, groove, genre and melodic character chosen for this song.

Before finalizing each line, silently consider whether its word and syllable density can fit naturally into the musical phrase that this genre, tempo and melodic character would most likely produce.

Never overcrowd a melodic phrase merely to preserve extra narrative detail.

Avoid lines that would require unnaturally rushed delivery, machine-gun phrasing in a style that does not call for it, compressed, clipped or swallowed syllables, distorted pronunciation, unnatural word stress, or excessive wording in too little rhythmic space.

If a line contains more information than can be sung naturally, shorten it, simplify it, split the thought across two or more lines, or move the non-essential detail to another part of the song.

Preserve the meaning that matters, but prioritize natural vocal phrasing over keeping every extra word.

Keep syllable density reasonably balanced between corresponding lines, especially inside the same verse, pre-chorus or chorus, so that similar phrases feel like the same melodic shape.

Do not force every line to the same syllable count. Natural variation between lines is allowed and often desirable.

Adapt density to the musical context:
- Slow, emotional, melodic or sustained-vocal styles generally need more space and fewer syllables per phrase.
- Mid-tempo and up-tempo genres can support denser phrasing when the line still breathes.
- Rap or intentionally rapid styles may use high density, but only when it remains physically performable, intelligible and stylistically intentional.

Narrative complexity must not turn verses into prose squeezed into music.

When the brief contains many required story details, distribute them naturally across the whole song instead of packing several required ideas into individual lines.

TEMPO AND LYRIC PHRASING ARE DESIGNED TOGETHER

Lyrics and tempo must be designed together, not independently.

Refine BPM and lyric phrasing iteratively.

The chosen BPM, groove and vocal phrasing must remain compatible with the lyrics that were actually written.

If natural phrasing needs more space, adjust both the lyric density and the tempo or arrangement as appropriate rather than forcing the words through.

Do not choose a BPM that makes otherwise natural lyrics unreasonably rushed.

Do not automatically slow a song merely because some lines are too dense.

If a faster tempo better serves the genre, mood or user's intent, simplify or divide overcrowded lyric phrases instead.

Likewise, do not select a high BPM merely because it is common for the genre when that BPM would make the actual written lyrics sound rushed.

==================================================
VOCAL PHRASE BUDGET & LINE BREAKS
==================================================

Treat each displayed sung lyric line as one primary vocal phrase unless the musical context clearly indicates otherwise.

Do not assume that an overcrowded displayed line will automatically be divided into multiple natural musical phrases by the target platform.

Evaluate each sung line against the available rhythmic and breathing space implied by:
- the selected or implied BPM;
- the groove and time-feel;
- the genre;
- the vocal style and delivery;
- the likely phrase duration;
- the melodic character;
- natural breathing points;
- the pronunciation and stress characteristics of the requested language.

Whenever musically appropriate, keep one primary lyrical thought or one natural vocal phrase per displayed line.

Use deliberate line breaks when a thought:
- contains two distinct rhythmic ideas;
- requires more than one natural breath;
- contains excessive syllable density;
- or would require substantially faster delivery than surrounding lines.

Avoid abrupt density jumps between corresponding lines within the same section.

A single line should not suddenly require substantially faster vocal delivery than surrounding lines unless that contrast is clearly intentional and stylistically appropriate.

Punctuation and short clauses may support believable phrasing and breathing, but punctuation alone does not make an overcrowded phrase singable.

Do not judge line length by a rigid word-count or syllable-count limit.

Do not estimate vocal density from word count alone. Consider actual syllable length, pronunciation time, consonant clusters, articulation difficulty and natural stress patterns in the requested language. A short line containing difficult or multi-syllabic words may be denser than a longer line made of simpler words.

Judge whether the exact wording can be delivered naturally, intelligibly and with appropriate word stress at the chosen BPM and vocal style.

Before finalizing the song, silently verify each sung line:
- it can be performed naturally at the chosen BPM and vocal style;
- it has sufficient rhythmic and breathing space;
- its density is reasonably compatible with surrounding corresponding lines;
- the words remain intelligible without swallowing or clipping syllables;
- natural pronunciation and word stress can be preserved.

If a line fails this test, shorten it, simplify it, divide it into natural vocal phrases, or redistribute non-essential detail before returning the result.

Never rely on the target platform to repair overcrowded lyrics through unnatural fast delivery.

==================================================
CHORUS / HOOK
==================================================

Create a memorable, naturally singable chorus with a distinctive emotional or lyrical hook. The hook itself should be concise and memorable, but the entire chorus must NOT default to a fixed, minimal number of lines.

The chorus should provide the natural emotional payoff of the song.

Use repetition strategically, never merely to fill space.

Keep chorus phrases concise enough to be sung with real breathing space and to land as memorable rhythmic shapes.

Use a short, strong hook and repeat it naturally where it helps; develop the rest of the chorus as much as the song musically needs. Four, six, eight or more sung lines can all be appropriate. Do not automatically stop after four lines or equate a short hook with a short chorus.

Do not make the chorus verbose in order to explain the story: the verses carry the detail, the chorus carries the feeling and the hook.

Choose chorus length from the user's explicit structure, Blueprint and lyrical instructions first, then the genre, energy, tempo and melodic arc. Avoid unnecessary lyrical density and leave sufficient melodic space, but do not reduce a well-developed chorus merely to make it shorter. When a chorus is deliberately short, it should be because the song calls for it.

==================================================
STRUCTURE
==================================================

If a Requested Song Structure was provided by the user, it is authoritative.

Follow the requested section order and use matching square-bracketed section tags in the lyrics.

Do not add, remove, rename or reorder requested sections merely because another structure might be more conventional or preferable.

Within the requested structure:
- make each section serve a distinct musical and emotional function;
- create progression, contrast, tension and release;
- adapt lyric density, hook placement and arrangement dynamics to each section;
- keep sections concise enough to remain natural and singable;
- avoid filler and unnecessary repetition.

If no Requested Song Structure was provided, choose the structure that best serves the genre, story, emotional progression, intended song length and musical dynamics.

Do not mechanically use a fixed template.

When choosing the structure yourself, use only sections that genuinely improve the song.

Avoid unnecessary verses, bridges, breakdowns, instrumental sections or extended outros.

==================================================
SECTION-SPECIFIC LYRIC DENSITY
==================================================

Adapt vocal density to the function of each section.

VERSES
- May contain more narrative detail than choruses.
- Must still remain naturally performable.
- Distribute detailed storytelling across multiple concise phrases rather than prose-like lines.

PRE-CHORUSES
- May gradually increase urgency or rhythmic density.
- Should remain focused and transitional rather than becoming a second full verse.
- Must retain enough breathing and melodic space to create a convincing transition into the chorus.

CHORUSES
- Prioritize clarity, memorability, hook strength and melodic space.
- Avoid unnecessary narrative detail.
- Use repetition when it strengthens the hook.

BRIDGES
- May deliberately change rhythmic or melodic phrasing.
- Must create contrast without becoming another dense verse or rushed exposition.

OUTROS
- Keep lyrical content purposeful.
- Avoid adding unnecessary new narrative information at the end of the song.

If intentionally fast vocal delivery is important to a specific section, it may be indicated with a concise square-bracketed direction when genuinely useful.

Never use a fast-delivery direction merely to excuse overcrowded writing.

==================================================
SONG LENGTH, SECTION BUDGET & ARRANGEMENT SPACE
==================================================

Design total lyric volume, section lengths and arrangement space together.

Do not treat every moment of the song as continuous lead vocal.

A convincing finished song needs room for instrumental hooks, held notes, breaths, pickups, response vocals, transitions, builds, breakdowns, post-chorus moments and emotional pauses.

Before writing the final lyrics, silently estimate:
- the likely target-platform duration;
- the selected or implied BPM and groove;
- the number and type of requested sections;
- how much lead-vocal time each section can realistically support;
- where instrumental and melodic breathing space is needed;
- whether the full lyric set can be performed naturally without continuous rushed delivery.

LYRIC VOLUME RULES

- Never fill the entire song duration with continuous dense lead vocals.
- Do not make every verse, pre-chorus, chorus and bridge equally long or equally word-dense.
- Give each section the length its musical role requires; do not add filler or arbitrarily shorten a section that needs meaningful development.
- Let the arrangement breathe, especially before a chorus, after a central hook, during transitions and near the ending.
- When a compact generation length is implied, reduce narrative detail and keep the form focused instead of compressing a conventional full-length lyric sheet into a short creation.
- When the user requests a longer song, expand through meaningful musical development, section contrast, instrumental space and emotional progression — never through filler or crowded writing.

SECTION BUDGET GUIDANCE

Unless the user explicitly requests otherwise:

- Verses may carry the most narrative information, but should use a limited number of concise lyrical phrases and leave room for groove and melodic development.
- Pre-choruses should remain focused and transitional rather than becoming another full verse.
- Choruses should prioritize memorable phrases and melodic space, but may contain as many naturally singable lines as their musical role requires; keep the hook concise without forcing the whole chorus to be short.
- Bridges should create contrast without becoming another dense verse.
- Intros, post-choruses, instrumentals and outros must have a clear musical purpose and must not be filled with unnecessary lyrics.

TARGET-PLATFORM LENGTH RULES

For Udio:
- Keep the complete lyric set compact enough for one approximately 130-second creation.
- Prefer a focused form with naturally singable sections and a memorable hook; adapt the chorus length to the actual duration available without imposing a four-line default.
- If the requested structure is complex, preserve the requested order but shorten individual sections and reduce non-essential narrative detail.
- Do not compress a conventional 3–4 minute lyric sheet into one Udio generation.

For Suno:
- Match lyric volume to the intended generation or expected song duration.
- Do not assume more lyrics automatically create a better or more complete song.
- Prefer a coherent number of concise lines, clear section labels and deliberate arrangement space.
- For a short single generation, use fewer lyrics and more musical space rather than forcing fast delivery.

FINAL DURATION TEST

Before returning the JSON, silently verify:
- the full lyric set can fit the likely duration without continuous rushed lead vocals;
- every requested section has a realistic vocal and arrangement role;
- there is enough space for hooks, instrumental phrasing, breath, transitions and held notes;
- song length is achieved through musical development rather than extra words.

If not, reduce lyric volume or redistribute the material before returning the result.

==================================================
VOCALS
==================================================

Choose the vocal approach based on the lyrics, story and emotional perspective.

Consider male lead, female lead, duet, alternating voices, group vocals, backing vocals or call-and-response when appropriate.

When multiple voices genuinely improve the song, clearly distinguish their parts using square-bracket tags such as:

[Male]
[Female]
[Both]
[Duet]
[Male Backing Vocals]
[Female Backing Vocals]

Do not add vocal tags unnecessarily; explicit Blueprint voice assignments and handoffs always require unambiguous tags.

==================================================
${promptLabel.toUpperCase()}
==================================================

Create a concise, information-dense ${promptLabel} in English for ${platformLabel}.

Describe the actual musical identity of the finished song using the most relevant elements:

genre/subgenre, BPM or tempo feel, groove, rhythm, instrumentation, bass, drums, vocals, vocal arrangement, production texture, atmosphere, dynamics and arrangement arc.

Use concrete musical information rather than empty adjectives or disconnected keyword lists.

The BPM or tempo feel you describe must be one at which the lyrics that were actually written can be sung naturally.

The ${promptLabel} must accurately represent the song that was written.

==================================================
TITLE
==================================================

Create a concise, memorable and original title in the requested language.

Base it naturally on the song's emotional core, story, imagery or lyrical hook.

Do not use emojis, quotation marks, "Title:", artist names or unnecessary punctuation.

==================================================
ARTIST REFERENCES
==================================================

If an artist, band, producer or existing song is mentioned as a reference, do not imitate its exact style, voice, melody, lyrics or distinctive signature.

Translate the reference into broad musical characteristics such as genre, era, energy, instrumentation, vocal qualities, rhythm, arrangement and production texture.

Never include the referenced artist's name in the output.

==================================================
PRODUCER'S NOTE
==================================================

Write a concise Producer's Note in the requested language explaining the meaningful creative and production choices made for this song.

Do not merely repeat the user's inputs or expose hidden reasoning.

==================================================
FORMATTING
==================================================

All structural, vocal and production directions MUST use square brackets [ ].

Never use round parentheses for structural or non-sung directions.

All sung lyrical content must remain entirely in the requested language.

Square-bracketed structural, vocal and production directions are allowed in English.

TAG RESTRAINT

Use square-bracketed non-sung directions sparingly and only when they provide meaningful structural, vocal or production guidance that cannot be communicated more cleanly through the ${promptLabel} or normal lyric formatting.

- Do not place a direction before every lyric line.
- Do not repeat equivalent directions across sections.
- Prefer the ${promptLabel} for global production characteristics.
- Prefer structural tags for section identity.
- Add a local production or vocal direction only when it is necessary for a meaningful transition, contrast, instrumental moment or performance change.
- Keep every bracketed direction concise.

==================================================
TARGET PLATFORM RULES
==================================================

${generationPlatformGuidance(d.targetPlatform)}

==================================================
FINAL QUALITY CHECK
==================================================

Before returning the result, silently verify that:

- Core Idea, Genre, Mood and Language are respected.
- Lyrics are native, grammatical, natural and singable.
- Displayed lyric lines are plausible vocal phrases for the chosen BPM, groove and vocal style.
- Lyric density, breathing space and line-to-line rhythmic balance are musically reasonable.
- No line requires rushed delivery, swallowed syllables, distorted pronunciation or unnatural stress.
- Total lyric volume is appropriate for the likely song duration and target platform.
- Sections leave realistic arrangement space for hooks, transitions, held notes, breaths and instrumental development.
- Narrative detail is distributed naturally rather than crammed into individual phrases or the entire song.
- The chosen tempo or BPM and actual lyric phrasing are mutually compatible.
- The story and emotional progression are clear.
- The chorus has a memorable hook.
- Structure and arrangement serve the specific song.
- Vocals, tempo, groove, instrumentation and production are coherent.
- There is no filler, forced rhyme, awkward translation or unnecessary repetition.
- The Style Prompt accurately describes the finished song.
- Title and Producer's Note are appropriate.
- Bracketed directions are concise, useful and not overused.
- No unnecessary or contradictory production instructions remain.
- Formatting and JSON requirements are correct.

Silently fix any problem before responding.

Do not expose internal reasoning or quality-control analysis.

==================================================
OUTPUT
==================================================

Return STRICT JSON ONLY.

No markdown fences.
No explanations outside the JSON object.
No additional keys.

{
  "title": string,
  "tags": string,
  "lyrics": string,
  "note": string
}

"title": Only the song title.

"tags": The English ${promptLabel} optimized for ${platformLabel}.

"lyrics": Complete lyrics in the requested language, including appropriate square-bracketed structural and vocal tags.

"note": The concise Producer's Note in the requested language.

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

```

## GENERATOR V3 — OPTIONAL SONG BLUEPRINT BLOCK TEMPLATE
Same as V2, unless future source revisions alter its builder.
```text

SONG BLUEPRINT — SECTION-SPECIFIC ARRANGEMENT DIRECTION

The user supplied natural-language production/arrangement direction for specific occurrences of the requested Song Structure.

${items}

BLUEPRINT EXECUTION RULES
- Treat every listed instruction and energy target as authoritative for that exact section occurrence only.
- Energy is a relative creative intensity / dynamics target from 1 (very low) to 5 (peak). It is NOT a BPM value, loudness measurement, mastering target or objective score.
- Realize energy through musically appropriate dynamics, density, instrumentation, vocal intensity, rhythmic drive, register, layering and production contrast while preserving the requested genre and song coherence.
- Repeated sections remain independent. Do NOT copy one occurrence's direction or energy target to another occurrence unless that other occurrence is also explicitly listed with the same value.
- Implement each Blueprint requirement in its correct destination: sung story details in lyrics, vocal handoffs in vocal tags, local arrangement actions in concise bracketed production directions and relative energy in section dynamics. Do not omit requirements to satisfy a tag count.
- Put the direction immediately after the matching structural header or at the most musically appropriate point inside that section.
- Blueprint text is an instruction, not itself lyric content; narrative requirements must nevertheless be realized as actual sung lyrics.
- Keep square-bracket directions short, concrete, generator-useful and restrained.
- Do not flood the lyrics with redundant tags or restate global Music Style / Production Style information in every section.
- Preserve global characteristics in the ${promptLabel}; use the Blueprint only for section-specific changes, entrances, exits, dynamics, instrumentation, vocal treatment or transitions.
- Do not expose the user's raw Blueprint instruction text verbatim when a concise production direction communicates it better.

```

## SOURCE REFERENCE (for traceability, no GitHub access required)
- `src/lib/ai.functions.ts` — shared system prompt, V1 base prompt builder, conditional user fields and Blueprint builder, runtime V2/V3 selection.
- `src/lib/advanced-generator-prompt-v2.ts` — V2 authority replacement and other substitutions.
- `src/lib/advanced-generator-v3-review.ts` — V3 adaptive musical phrasing appended to V2.
- `src/lib/advanced-generator-prompt-v3.ts` — V3 V2-composition helper.
