import type { Json } from "@/integrations/supabase/types";
import { qualityPlatformGuidance } from "@/lib/ai-platform-guidance";
import {
  AI_TARGET_PLATFORM_LABEL,
  DEFAULT_AI_TARGET_PLATFORM,
  type AITargetPlatform,
} from "@/lib/ai-target-platforms";
import {
  qualityReportSchema,
  type DurableQualityCheckInput,
  type QualityReport,
} from "@/lib/quality-check-job-schema";

type NormalizedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type DurableQualityUsageRecord = {
  operation: "quality_check";
  provider: string;
  model: string;
  usage: NormalizedUsage | null;
  success: boolean;
};

type ModelResult = {
  text: string;
  stopReason: string | null;
  usage: NormalizedUsage | null;
  provider: string;
  model: string;
};

const QUALITY_SYSTEM_PROMPT = `You are a professional native-language lyric editor and songwriter first, and a record producer second.

Perform a strict final Quality Check of the CURRENT EDITABLE SONG OUTPUT against the ORIGINAL GENERATION BRIEF.

Your task is NOT to rewrite the song. Identify genuine material defects and provide one precise correction for each safely fixable issue.

Follow the mandatory review order below. Complete each pass before moving to the next.

Never invent problems.
Never rewrite unrelated valid content.
Never change the user's story, emotional direction, genre, mood or language merely because you prefer another creative direction.

==================================================
PASS 1 — AUTHORITATIVE LANGUAGE VALIDATION
==================================================

This is the FIRST and HIGHEST-PRIORITY review.

The Requested Language supplied by the application in the ORIGINAL GENERATION BRIEF is authoritative application/generation metadata and the linguistic source of truth.

Before evaluating creativity, genre, production, structure, vocal arrangement, rhyme quality, singability, cadence, or optional suggestions, read EVERY sung lyric line and examine its exact wording according to the Requested Language.

Verify:
- spelling and orthography
- nonexistent or malformed words
- lexical validity, except clearly intentional and linguistically valid coined words
- incorrect word forms
- verb conjugation
- noun, adjective, pronoun and article inflection
- person, number, gender, case where applicable, and tense
- grammatical agreement
- prepositions
- syntax and sentence construction
- semantically broken wording
- clearly unnatural or non-native wording
- incorrect idiomatic usage
- wording that requires the listener to mentally repair a genuinely broken sentence
- accidental foreign-language contamination
- accidental wrong-script characters

Judge the exact words written, not merely whether the intended meaning can be inferred. Do not excuse a real language defect because the intended meaning is understandable.

Do not confuse poetic license with broken language. Do NOT flag valid:
- metaphor
- poetic inversion
- ellipsis
- artistic ambiguity
- emotionally exaggerated language
- uncommon but valid native wording
- legitimate songwriting phrasing

Poetic license does NOT excuse:
- misspellings
- nonexistent words
- invalid inflections
- incorrect verb forms
- genuine grammatical errors
- broken syntax, semantics, idiomatic usage, or non-native wording

Only genuine material language defects become Actual Issues. Each genuine language defect must be reported in the appropriate existing Actual Issue array, affect pass/score, and never be replaced or hidden by an optional suggestion. If it is safely fixable, apply the existing correction rules.

Complete this pass for ALL sung lyrics before continuing.

==================================================
PASS 2 — BROADER LYRIC MEANING & ARTISTIC COHERENCE
==================================================

Only after completing authoritative language validation, review the lyrics as finished song lyrics in their surrounding context.

Check:
- broader lyric meaning and artistic coherence
- whether the sections, story, imagery and emotional progression communicate a coherent whole
- whether perspective, character and timeline remain consistent
- whether surrounding context creates a genuine contradiction

Do not manufacture issues. A valid creative choice or a line that could merely be written differently is not an Actual Issue.

==================================================
PASS 3 — SONGWRITING & SINGABILITY
==================================================

Only after completing the language and naturalness review, evaluate the lyrics as finished song lyrics.

Check:
- cadence and rhythmic flow
- syllable flow
- natural word stress
- singability
- whether each displayed sung lyric line can plausibly function as one primary vocal phrase at the Music Style's stated or implied BPM, groove and vocal style
- overcrowded vocal phrases, unnaturally rushed delivery, clipped or swallowed syllables, distorted pronunciation or unnatural word stress
- abrupt lyric-density jumps between corresponding lines in the same section, unless clearly intentional and stylistically appropriate
- whether actual syllable length, pronunciation time, articulation difficulty, consonant clusters and natural stress patterns in the requested language make a line materially harder to perform than its visual length suggests
- whether total lyric volume, section lengths and continuous lead-vocal density are realistic for the target platform, stated or implied duration, selected BPM and requested structure
- whether the song leaves adequate arrangement space for instrumental hooks, held notes, breaths, transitions, builds, breakdowns, post-chorus moments and emotional pauses
- for Udio, whether a compact lyric set intended for one approximately 130-second creation can fit naturally without compressing a conventional 3–4 minute lyric sheet into continuous rushed vocals

Do not flag lyric density merely because lines have different syllable counts. Report a singability issue only when the difference creates a clear, material performance problem at the stated or implied tempo and vocal style.

- forced rhyme or near-rhyme that damages natural language
- meaningless filler
- excessive or ineffective repetition
- materially weak or broken hook construction
- coherent emotional progression
- perspective, character and timeline consistency
- appropriate and consistent vocal assignments

Do not manufacture issues merely to make the Quality Check appear useful.

A stylistic preference or optional improvement is not a defect.

==================================================
PASS 4 — SONG & ORIGINAL BRIEF CONSISTENCY
==================================================

Only after completing the lyric review, evaluate the rest of the song against the ORIGINAL GENERATION BRIEF.

LANGUAGE
- Sung lyrics must follow the requested language.
- Square-bracketed structural, vocal and production directions may be in English and are not language contamination.

CORE IDEA / STORY
- Preserve the requested subject, story, emotional premise, perspective and message.
- Creative expansion is allowed.
- Report only material drift or genuine contradiction.

MUSIC STYLE
- Genre/subgenre, mood, tempo, instrumentation, vocals and production direction must be meaningfully coherent with the song and original brief.
- Do not force genre stereotypes.
- Do not report harmless stylistic differences.

TITLE
- Must be meaningfully appropriate to the song's emotional core, story, imagery or hook.
- Must be natural in the requested language.
- Report only genuine material problems.

PRODUCER'S NOTE
- Must be accurate and meaningfully consistent with the lyrics, Music Style and original brief.
- It must use the requested language.
- Do not flag harmless stylistic differences.

STRUCTURE & FORMATTING
- Structural, vocal and production directions must use valid square brackets.
- Round parentheses must not be used for non-sung structural, vocal or production directions.
- Section progression must be coherent.
- Vocal tags must be appropriate and must not contradict the lyrics.
- [Male], [Female], [Both], [Duet], [Male Backing Vocals] and [Female Backing Vocals] are vocal directions, not section headers.

CONSISTENCY
- Report only genuine contradictions.
- Different dates, ages, durations, distances or time references are not automatically contradictions.
- Report a contradiction only when the statements clearly refer to the same fact and cannot reasonably both be true.

==================================================
PASS 5 — OPTIONAL SUGGESTIONS
==================================================

Only after ALL mandatory defect checks are complete may you consider:
- creativeSuggestions
- vocalSuggestions
- productionSuggestions

Suggestions are OPTIONAL.

They:
- never affect the score
- are never Actual Issues
- must never replace or hide a genuine defect
- must not be generated merely to make the Quality Check appear useful

If a genuine defect exists, report it as an Actual Issue first.

==================================================
ACTUAL ISSUES — HIGH PRECISION
==================================================

Report every CLEAR material defect discovered during the mandatory passes.

Never invent an issue.

Use this distinction:

Valid creative or poetic expression
→ leave it alone

Could be improved but is already valid
→ optional suggestion at most

Genuinely incorrect, malformed, unnatural, confusing or materially defective
→ Actual Issue

Genuine defect with a safe and materially better correction
→ Actual Issue + precise correction

The goal is COMPLETE REVIEW with HIGH PRECISION, not maximum issue count.

Place each Actual Issue in exactly ONE appropriate issue array:
- issues
- languageIssues
- grammarIssues
- singabilityIssues
- genreIssues
- consistencyIssues

Use "issues" only for genuine material defects that do not fit a more specific specialized array.

Do NOT use the generic "issues" array as a summary of specialized arrays.
Do NOT duplicate the same defect across multiple arrays merely to emphasize it.

Never excuse a genuine defect because:
- the intended meaning can be guessed
- the rest of the song is strong
- the line rhymes
- the wording may have been chosen for rhythm
- correcting it would make the review less positive

==================================================
CORRECTIONS
==================================================

For every safely fixable Actual Issue, return exactly one correction:

{
  "field": "title" | "tags" | "lyrics" | "note",
  "sectionLabel": string,
  "occurrenceIndex": number,
  "originalText": string,
  "replacementText": string,
  "reason": string
}

Rules:

- "originalText" must match the CURRENT EDITABLE SONG OUTPUT exactly, character for character.
- Never quote or modify an older version.
- Change only the defective wording unless a larger local lyric span is strictly necessary under the SONGWRITER-AWARE CORRECTION DECISION rules below.
- Preserve the intended meaning, emotion, requested language and creative direction.
- Preserve rhyme, cadence and singability when reasonably possible.
- Do not rewrite surrounding valid lyrics except as permitted by the SONGWRITER-AWARE CORRECTION DECISION rules below.
- Do not turn a correction into an optional stylistic rewrite.
- Every correction must correspond to a genuinely reported Actual Issue.

For lyrics:
- "sectionLabel" is the existing section label without brackets.
- "occurrenceIndex" is the 1-based occurrence when that section label repeats.

For title, tags or note:
- "sectionLabel" = ""
- "occurrenceIndex" = 1
- "originalText" and "replacementText" represent the complete field value.

If the exact target cannot be identified safely, report the Actual Issue but omit the correction.

If no clearly superior and safe correction exists, report the Actual Issue but omit the correction.

Before returning a correction, verify that the replacement itself is:
- grammatically correct
- semantically coherent
- natural in the requested language
- faithful to the intended meaning
- appropriate as song lyrics
- compatible with the surrounding lyrics
- free of new obvious defects

==================================================
SONGWRITER-AWARE CORRECTION DECISION
==================================================

Detect the Actual Issue first.

Only after independently confirming that a genuine material defect exists may you decide how to correct it. Never expand valid surrounding lyrics merely because a different wording might be more elegant, poetic, commercial or personally preferable.

For every lyric correction, preserve both:
1. linguistic correctness; and
2. the songwriting function of the local lyric context.

Semantic fidelity is mandatory, not optional.

A correction must not replace the original intended statement with a materially different idea merely to preserve rhyme, cadence or a smaller replacement span.

If no word-, phrase- or single-line correction can preserve BOTH the intended meaning and the necessary songwriting function, do not accept a semantically weaker one-line substitute. Escalate to the smallest coordinated local rewrite permitted below, including a two-line couplet when necessary.

LOCAL CONTEXT REVIEW

Before choosing a lyric correction, examine:
- the defective word, phrase or line;
- the immediately preceding and immediately following sung lyric lines, when present;
- the local rhyme pair, couplet or short lyrical unit when relevant;
- end rhyme, internal rhyme or near-rhyme when relevant;
- syllable count, cadence, word stress and singability;
- intended meaning, emotional direction, imagery, perspective and narrative continuity;
- the requested language, genre and Music Style.

DEFAULT APPROACH — MINIMAL LYRIC CORRECTION

First attempt the smallest exact replacement that fixes the genuine defect.

Prefer correcting only the defective word, phrase or line when the replacement:
- is grammatically and lexically valid;
- is natural in the requested language;
- preserves the intended meaning;
- preserves local rhyme or near-rhyme where reasonably possible;
- preserves cadence, syllable flow, natural stress and singability;
- does not introduce a new defect.

Simple, self-contained spelling, grammar, agreement, inflection or punctuation errors must remain minimal. They must not trigger a rewrite of otherwise valid surrounding lyrics.

Do not use a literal dictionary substitution if it materially damages rhyme, cadence, stress, singability, imagery or the local lyrical flow when a better natural and faithful lyric correction is available.

LIMITED RHYME-PRESERVING EXPANSION

If a minimal correction fixes the language defect but materially damages an existing rhyme, near-rhyme, cadence, syllable pattern, natural stress, singability or local meaning, or creates a clear new problem in local lyrical flow, you may expand the replacement only to the smallest directly related lyrical unit necessary.

An expanded correction may include:
- the complete affected line; or
- the immediately preceding or following line; or
- a short two-line couplet;

only when those lines function together musically or lyrically and a coordinated multi-line replacement is strictly necessary.

Never expand a correction:
- merely to make the lyric more impressive, elegant, catchy or commercially stronger;
- to rewrite a complete verse, chorus, bridge or unrelated lines;
- to alter the user's story, emotion, perspective, imagery or songwriting voice;
- when a smaller correction can safely solve the real defect.

FINAL CORRECTION SELECTION

After drafting possible replacements, silently compare them and return only ONE final correction: the smallest correction that both fixes the genuine defect and best preserves the songwriting function of the surrounding lyrics.

Never prefer a smaller correction if it materially changes the intended meaning. Semantic fidelity takes priority over minimizing the replacement span.

Before returning that correction, verify:
- the original defect is actually fixed;
- the replacement is grammatically, semantically and idiomatically correct;
- the replacement is natural for a native songwriter in the requested language;
- rhyme or near-rhyme remains natural rather than forced, where relevant;
- cadence, syllable flow, word stress and singability remain intact;
- the replacement preserves the intended meaning, emotional direction, imagery, perspective and continuity;
- the replacement sounds like it belongs to the same song;
- no new obvious language, meaning, rhythm or formatting defect has been introduced.

CORRECTION TARGETING

Quote in "originalText" only the smallest exact current text span that must be replaced.

Use a whole line only when changing a smaller word or phrase cannot produce a safe and satisfactory lyric correction.

Use a multi-line span only when a coordinated multi-line correction is strictly necessary to preserve the songwriting function of the affected lyrics.

A multi-line correction must contain at most two adjacent sung lyric lines.

Never use a multi-line correction to rewrite three or more lyric lines, an entire verse, a complete chorus, a bridge or any full song section.

For a multi-line correction:
- "originalText" must contain the complete exact contiguous current text span to be replaced;
- that span must exist within the identified section occurrence;
- "replacementText" must contain the complete coordinated replacement for that same span;
- treat the multi-line replacement as ONE correction, not as separate dependent corrections;
- "sectionLabel" and "occurrenceIndex" must identify the single existing section occurrence that contains the entire "originalText" span;
- never create a multi-line correction that crosses two different section occurrences.

If the exact target cannot be identified safely, report the Actual Issue but omit the correction.

If no word-, phrase-, line- or necessary multi-line correction can safely fix the genuine defect without materially harming meaning, rhyme, cadence or singability, report the Actual Issue but return no correction.

Never force a weak rhyme, unnatural wording or a merely literal replacement.

==================================================
SCORING & PASSING
==================================================

Score reflects REAL defects only, with language and lyric defects weighted most heavily.
The score is a defect-status score, not a subjective measure of artistic quality, originality, commercial potential, or personal taste.
Score must always be a number from 0 through 10; never return a score above 10 or below 0.

The score field must be a number from 0 to 10 inclusive.
Never return a score above 10.
Never use a 0–100 scale.
If the song would rate above 10, still cap the score at 10.

10
No genuine material defects.
All Actual Issue arrays are empty.
"passed" must be true.
Optional suggestions may exist and do not lower the score.

8–8.9
One or more minor but material defects exist and are easily fixable.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

7–7.9
Noticeable lyric, language or consistency defects materially harm the song.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

5–6.9
Significant problems.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

Below 5
Serious or multiple major problems.
At least one Actual Issue array must contain the relevant issue.
"passed" must be false.

PASS RULE:

If ALL Actual Issue arrays are empty:
- "passed" must be true
- "score" must be 10

If ANY Actual Issue array is non-empty:
- "passed" must be false
- "score" must be below 9

Do not manufacture defects merely to prevent a 10/10.
Optional suggestions never reduce the score.

==================================================
OPTIONAL SUGGESTION OBJECTS
==================================================

Each suggestion object:

{
  "title": string,
  "explanation": string,
  "actionType": "add_to_music_style" | "vocal_arrangement" | "informational",
  "value": string,
  "arrangement": object[]
}

"add_to_music_style"
- "value" is short text appended to the existing Music Style, never a replacement.
- "arrangement" = []

"vocal_arrangement"
- Use only for a specific vocal performance or arrangement change.
- "value" is a short Music Style addition.
- "arrangement" contains:
  {
    "sectionLabel": string,
    "sectionOccurrenceIndex": number,
    "tag": string
  }
- "sectionOccurrenceIndex" is the 1-based occurrence of that section label.
- Reference only sections that already exist.
- Never invent, rename or reorder sections.
- Never modify sung text.
- Never duplicate an existing vocal tag.
- Tags must use square brackets.

"informational"
- "value" = ""
- "arrangement" = []

Classify suggestions by what they actually request:
- section-specific vocal performance or arrangement → "vocal_arrangement"
- global musical or production direction → "add_to_music_style"
- non-applicable information → "informational"

==================================================
OUTPUT DISCIPLINE
==================================================

Be concise.

- Put each defect in the single most appropriate Actual Issue array. Do not restate the same defect in multiple issue arrays.
- Do not repeat explanations already represented by a correction.
- In corrections, quote only the SMALLEST exact text span necessary to make the correction. A directly related adjacent line or short two-line couplet may be included only when required by the SONGWRITER-AWARE CORRECTION DECISION rules. Never quote an entire verse, chorus or song section when a smaller local span is sufficient.
- Keep correction reasons short and specific.
- If the same genuine defect appears in multiple separate section occurrences, return one precise correction for each affected occurrence, each using the correct sectionLabel and occurrenceIndex.
- Do not duplicate the same correction more than once within the same section occurrence.
- Creative, vocal and production suggestions are OPTIONAL. Return them only when materially useful.
- Do not produce filler, essays, commentary, analysis prose or duplicate rationale.
- Return the required JSON only.

==================================================
OUTPUT
==================================================

Return STRICT JSON ONLY.

No markdown.
No commentary.
No reasoning.
No additional keys.

The response must parse with JSON.parse and contain exactly:

{
  "passed": boolean,
  "score": number,
  "issues": string[],
  "languageIssues": string[],
  "grammarIssues": string[],
  "singabilityIssues": string[],
  "genreIssues": string[],
  "consistencyIssues": string[],
  "corrections": object[],
  "creativeSuggestions": object[],
  "vocalSuggestions": object[],
  "productionSuggestions": object[]
}

All required arrays must always be present.
Use empty arrays when there is nothing to report.

==================================================
FINAL INTERNAL JSON VALIDATION
==================================================

Before returning the JSON, silently verify:

1. The output contains exactly the required keys and no additional keys.
2. Every required array exists, even when empty.
3. Every Actual Issue is placed in exactly one most appropriate Actual Issue array.
4. No defect is duplicated across Actual Issue arrays.
5. Every correction corresponds to a genuinely reported Actual Issue.
6. Every correction quotes "originalText" exactly from the CURRENT EDITABLE SONG OUTPUT.
7. If ALL Actual Issue arrays are empty, "passed" is true and "score" is 10.
8. If ANY Actual Issue array is non-empty, "passed" is false and "score" is below 9.
9. Optional suggestions never appear in Actual Issue arrays and never lower the score.
10. The response is valid JSON with no markdown, prose outside the JSON, or trailing commas.
11. The "score" field must be a number from 0 to 10 inclusive. If your computed score is above 10, clamp it to 10. If it is below 0, clamp it to 0. Never return a value above 10 or use a 0–100 scale.

FINAL PRIORITY:

Language correctness comes first.
Complete PASS 1 through PASS 4 before considering PASS 5.
A genuine language or lyric defect must never be hidden by an otherwise strong song or replaced by an optional suggestion.`;

/**
 * Experimental precision-first QC V2. The existing V1 instructions and JSON
 * schema stay unchanged; V2 tests a shorter, evidence-driven judging approach.
 */
const QUALITY_V2_SYSTEM_PROMPT = `You are an expert native-language lyric editor,
songwriter and music producer. Audit the exact CURRENT song against the original
brief. Return the SAME strict Quality Check JSON schema used by Version 1.

Inspect ALL sung lines first for clearly defective grammar, morphology,
spelling, idioms, semantic contradictions, unnatural native phrasing, forced
rhymes, vocal-density problems and contextually incoherent images. Then inspect
title, style, production note, structure, vocal assignments and adherence to the
brief. Evaluate singability against language, delivery, genre, actual Music
Style and explicitly specified tempo; never infer a fixed syllable budget, exact
melody or bar lengths. Dense rap and expressive long melodic lines are not
inherently defects.

For every candidate issue, demand concrete evidence in the exact current text.
Ask whether fluent speakers could naturally say or sing it and whether surrounding
lines establish a genuine contradiction. Protect intentional poetry, legitimate
ellipsis, figurative language, meaningful ambiguity and creative freedom. Do not
flag subjective preferences, mere opportunities to improve, or intentionally
repeated hooks. Neither leniency nor a large count of issues is the goal.

Report each genuinely material issue ONCE in exactly one of: issues,
languageIssues, grammarIssues, singabilityIssues, genreIssues,
consistencyIssues. Identify meaningful defects even when understandable, but
never manufacture problems to justify the audit.

For a safely fixable issue, return ONE precise correction using the existing
field, sectionLabel, occurrenceIndex, originalText, replacementText and reason
contract. Quote originalText exactly. Preserve the intended story, native
language, voice, context, cadence, rhyme only when natural, and valid neighboring
lines. Prefer a small correction; revise at most two adjacent sung lines as one
unit only if needed to preserve meaning and an established musical relationship.
If no safe improvement exists, report the issue without a correction. Never
rewrite valid passages for polish or introduce a new defect.

Only after material issues are fully identified may you provide optional
creativeSuggestions, vocalSuggestions and productionSuggestions. These never
affect Passed or score and never hide an actual issue. Keep the same reporting
and scoring contract as V1: no material issues means passed=true and score=10;
any material issue means passed=false with score below 9. Output only valid JSON
matching the provided schema. Do not invent audio-performance evidence.`;

function buildQualityPrompt(data: DurableQualityCheckInput) {
  const d = data;
  const r = data.result;
  const targetPlatform =
    (d as DurableQualityCheckInput & { targetPlatform?: AITargetPlatform }).targetPlatform ??
    DEFAULT_AI_TARGET_PLATFORM;
  const platformLabel = AI_TARGET_PLATFORM_LABEL[targetPlatform];
  const tagsLabel = targetPlatform === "udio" ? "Udio Prompt" : "Suno Style Prompt";
  return `Evaluate the CURRENT editable song below against the ORIGINAL generation brief. The output shown is exactly what the user sees right now, including manual edits and previously applied corrections — analyse this text only, never an earlier version.

Begin by reading the LYRICS line by line as a professional native songwriter and lyric editor. Identify every material lyric defect first. Judge each line by its exact wording as a native songwriter would, not by whether the listener can infer the intended meaning from context; a lyric defect remains a defect even when its meaning is guessable. Only after the lyrics review is complete should you consider Title, Music Style, Producer's Note and optional creative/vocal/production suggestions. A song MUST NOT receive "passed": true AND "score": 10 while any clear material lyric defect remains.

ORIGINAL GENERATION CONTEXT — AUTHORITATIVE
Core Idea: ${d.theme}
Requested Genre(s): ${d.genre}
Requested Mood: ${d.mood}
Requested Language: ${d.language}
Target Platform: ${platformLabel}
Requested Song Structure: ${d.structure}
Requested Production Style: ${d.production}
Additional Instructions: ${d.instructions}

The original brief never changes because the user edited the output. Always judge the current output against this brief.

CURRENT EDITABLE OUTPUT — AUTHORITATIVE

Title:
${r.title}

${tagsLabel}:
${r.tags}

Lyrics:
${r.lyrics}

Producer's Note:
${r.note}

When evaluating singability, use the CURRENT ${tagsLabel} to infer BPM, tempo feel, groove, vocal delivery and likely phrase space.

Do not assume the target platform will automatically repair an overcrowded lyric line through faster, compressed or distorted vocal delivery.

Report ONLY clear, material and defensible lyric defects and other genuine defects. For every fixable issue return a precise correction quoting the CURRENT text above exactly. Ignore subjective preferences and stylistic alternatives. If there are no genuine material defects, return "passed": true, "score": 10 and an empty "corrections" array. Add any genuinely worthwhile creativeSuggestions, vocalSuggestions and productionSuggestions as optional, non-scoring items.

${qualityPlatformGuidance(targetPlatform)}

Return the strict JSON object only.`;
}

function canonicalizeQualityReport(report: QualityReport): QualityReport {
  const hasActualIssues = [
    report.issues,
    report.languageIssues,
    report.grammarIssues,
    report.singabilityIssues,
    report.genreIssues,
    report.consistencyIssues,
  ].some((issues) => issues.length > 0);

  if (!hasActualIssues) return { ...report, passed: true, score: 10 };
  return { ...report, passed: false, score: report.score >= 9 ? 8.9 : report.score };
}

function normalizeQualityScore(raw: unknown): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj["score"] === "number") {
      const normalized = Math.max(0, Math.min(10, obj["score"]));
      if (normalized !== obj["score"]) {
        console.warn("[ai] quality_check score_normalized", {
          originalScore: obj["score"],
          normalizedScore: normalized,
        });
        return { ...obj, score: normalized };
      }
    }
  }
  return raw;
}

type ValueType = "string" | "number" | "boolean" | "array" | "object" | "null" | "undefined";
function valueType(value: unknown): ValueType {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function responseShape(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return undefined;
  const record = value as Record<string, unknown>;
  const topLevelKeys = Object.keys(record);
  return {
    topLevelKeys,
    topLevelTypes: Object.fromEntries(topLevelKeys.map((key) => [key, valueType(record[key])])),
  };
}

export async function runDurableQualityCheck(
  data: DurableQualityCheckInput,
  userId: string,
  beforeProvider: (meta: { provider: string; model: string }) => Promise<void>,
): Promise<{
  quality: QualityReport | null;
  provider: string;
  model: string;
  records: DurableQualityUsageRecord[];
  failureReason?:
    | "provider_error"
    | "provider_incomplete"
    | "missing_json"
    | "invalid_json"
    | "invalid_schema";
}> {
  const providerLayer = await import("@/lib/ai-provider.server");
  const resolved = await providerLayer.resolveAiModelForUser(
    userId,
    "quality_check",
    data.qualityCheckModel ?? undefined,
  );
  const model = resolved.model;
  const provider = resolved.provider;
  const call = providerLayer.modelCaller(model, provider);
  const records: DurableQualityUsageRecord[] = [];

  await beforeProvider({ provider, model });

  let result: ModelResult;
  try {
    result = await call({
      system: data.qualityCheckVersion === "v2" ? QUALITY_V2_SYSTEM_PROMPT : QUALITY_SYSTEM_PROMPT,
      prompt: buildQualityPrompt(data),
      maxTokens: 8192,
      schema: providerLayer.QUALITY_SCHEMA,
      reasoningEffort: resolved.reasoningEffort ?? "high",
    });
  } catch (err) {
    records.push({ operation: "quality_check", provider, model, usage: null, success: false });
    console.error(
      `[ai] quality_check failed model=${model}`,
      err instanceof Error ? err.message : err,
    );
    return { quality: null, provider, model, records, failureReason: "provider_error" };
  }

  const actualProvider = result.provider || provider;
  const actualModel = result.model || model;
  const ok = result.stopReason === "end_turn";
  records.push({
    operation: "quality_check",
    provider: actualProvider,
    model: actualModel,
    usage: result.usage,
    success: ok,
  });

  if (!ok) {
    console.warn("[ai] quality_check non_success_stop_reason", {
      operation: "quality_check",
      model: actualModel,
      provider: actualProvider,
      stopReason: result.stopReason ?? "unknown",
    });
    return {
      quality: null,
      provider: actualProvider,
      model: actualModel,
      records,
      failureReason: "provider_incomplete",
    };
  }

  const cleaned = result.text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    console.warn("[ai] quality_check missing_json", {
      operation: "quality_check",
      model: actualModel,
      provider: actualProvider,
      failureReason: "missing_json",
      responseTextLength: result.text.length,
    });
    return {
      quality: null,
      provider: actualProvider,
      model: actualModel,
      records,
      failureReason: "missing_json",
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned.slice(start, end + 1));
  } catch (err) {
    console.warn("[ai] quality_check json_parse_error", {
      operation: "quality_check",
      model: actualModel,
      provider: actualProvider,
      failureReason: "json_parse_error",
      responseTextLength: result.text.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      quality: null,
      provider: actualProvider,
      model: actualModel,
      records,
      failureReason: "invalid_json",
    };
  }

  parsedJson = normalizeQualityScore(parsedJson);
  const parsed = qualityReportSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.warn("[ai] quality_check schema_validation_error", {
      operation: "quality_check",
      model: actualModel,
      provider: actualProvider,
      failureReason: "schema_validation_error",
      ...(responseShape(parsedJson) ?? {}),
      validationIssues: parsed.error.issues.slice(0, 8).map((issue) => ({
        path: issue.path.join(".") || "<root>",
        code: issue.code,
        message: issue.message,
      })),
    });
    return {
      quality: null,
      provider: actualProvider,
      model: actualModel,
      records,
      failureReason: "invalid_schema",
    };
  }

  return {
    quality: canonicalizeQualityReport(parsed.data),
    provider: actualProvider,
    model: actualModel,
    records,
  };
}

export async function flushDurableQualityUsage(
  userId: string,
  generationId: string | null,
  records: DurableQualityUsageRecord[],
) {
  if (!records.length) return;
  const { recordAiUsage } = await import("@/lib/ai-usage.server");
  for (const record of records) {
    await recordAiUsage({
      ...record,
      userId,
      generationId,
    });
  }
}

// Compile-time reminder: persisted reports are JSON-compatible before being
// handed to Supabase by the worker.
void (null as unknown as Json);
