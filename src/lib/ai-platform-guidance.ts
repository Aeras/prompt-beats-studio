import {
  AI_TARGET_PLATFORM_LABEL,
  type AITargetPlatform,
} from "@/lib/ai-target-platforms";

export function generationPlatformGuidance(targetPlatform: AITargetPlatform): string {
  const platformLabel = AI_TARGET_PLATFORM_LABEL[targetPlatform];

  if (targetPlatform === "udio") {
    return `TARGET PLATFORM — ${platformLabel} (AUTHORITATIVE)
-
- Generate strictly for Udio only.
- "tags" must be an English Udio Prompt (not a Suno style prompt).
- Use Udio-appropriate prompt density and guidance formatting.
- Do not impose a generic 2.5–4 minute lyric target.
- Default to a compact song around ~130 seconds unless Advanced structure clearly requests more.
- Structural and non-sung directions still use square brackets.
- Sung backing vocals / echoes may use parentheses where musically appropriate.
- Do not require [Male], [Female], [Both], [Duet] for vocalist identity.
- If vocalist identity is useful, encode it naturally in the Udio Prompt or coherent vocal tags.`;
  }

  return `TARGET PLATFORM — ${platformLabel} (AUTHORITATIVE)
-
- Generate strictly for Suno only.
- "tags" must be an English Suno Style Prompt.
- Preserve the existing Suno-oriented behavior and structure.
- A natural song length around 2.5–4 minutes is preferred unless the brief strongly requires otherwise.
- Structural, vocal and production directions use square brackets.
- Non-sung structural, vocal or production directions in parentheses are invalid.`;
}

export function qualityPlatformGuidance(targetPlatform: AITargetPlatform): string {
  const platformLabel = AI_TARGET_PLATFORM_LABEL[targetPlatform];

  if (targetPlatform === "udio") {
    return `TARGET PLATFORM QUALITY RULES — ${platformLabel}
-
- Interpret "tags" as an Udio Prompt.
- Accept valid Udio guidance tags and prompt formatting.
- Do not flag harmless Udio-vs-Suno formatting differences as defects.
- Sung backing vocals / echoes in parentheses are allowed and should not be auto-flagged.
- Parentheses remain invalid for non-sung structural, vocal or production directions.
- Do not require [Male], [Female], [Both], [Duet] tags.
- Vocalist identity may appear in the Udio Prompt when coherent with the song.`;
  }

  return `TARGET PLATFORM QUALITY RULES — ${platformLabel}
-
- Interpret "tags" as a Suno Style Prompt.
- Coherent square-bracket structural/vocal/production directions are allowed.
- Parentheses for non-sung structural, vocal or production directions remain invalid.
- Evaluate with existing Suno-oriented formatting expectations.`;
}
