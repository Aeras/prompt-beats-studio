/**
 * Experimental Advanced Generator prompt V2.
 * V1's buildPrompt and its original prompt text remain untouched.
 * This composition intentionally replaces only conflicting policy sections,
 * while retaining all mature songwriting, platform and formatting guidance.
 */
export function buildAdvancedGeneratorPromptV2(original: string): string {
  const priorityStart = "==================================================\nCREATIVE PRIORITY\n==================================================";
  const priorityEnd = "==================================================\nPROFESSIONAL CREATIVE DIRECTION\n==================================================";
  const priority = `==================================================
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

`;
  const a = original.indexOf(priorityStart);
  const b = original.indexOf(priorityEnd, a + priorityStart.length);
  if (a < 0 || b < 0 || b <= a) throw new Error("Generator V2 priority anchors missing");
  let output = original.slice(0, a) + priority + original.slice(b);
  output = output.replace(
    "Translate each natural-language Blueprint instruction into one or, only when genuinely necessary, two concise square-bracketed production/performance directions inside that exact lyric section.",
    "Implement each Blueprint requirement in its correct destination: sung story details in lyrics, vocal handoffs in vocal tags, local arrangement actions in concise bracketed production directions and relative energy in section dynamics. Do not omit requirements to satisfy a tag count."
  );
  output = output.replace(
    "Blueprint instructions are production/performance direction, never sung lyric content.",
    "Blueprint text is an instruction, not itself lyric content; narrative requirements must nevertheless be realized as actual sung lyrics."
  );
  output = output.replace(
    "Do not add vocal tags unnecessarily.",
    "Do not add vocal tags unnecessarily; explicit Blueprint voice assignments and handoffs always require unambiguous tags."
  );
  output = output.replace(
    /Use square-bracketed non-sung directions sparingly and only when they provide meaningful structural, vocal or production guidance that cannot be communicated more cleanly through the (?:Style Prompt|Udio Prompt) or normal lyric formatting\./,
    "Use concise square-bracketed directions for required vocal changes and section-specific arrangement actions. Avoid optional/redundant tags, but never omit a tag that is necessary to execute an explicit Blueprint requirement."
  );
  return output;
}
