import type { ResolvedLanguageProfile } from "./types";

/**
 * Pure composer that structures the transient prompt language block.
 * Prepend the clean language name first, followed by clear delimiter and the research-backed profile block.
 */
export function composeLanguagePromptBlock(
  cleanLanguage: string,
  resolved: ResolvedLanguageProfile,
): string {
  const scriptHeader =
    resolved.script === "Hans"
      ? "\n\n[SCRIPT REQUIREMENT: SIMPLIFIED CHINESE (Hans)]\nWrite all lyrics and song text using Simplified Chinese characters (简体中文) exclusively."
      : resolved.script === "Hant"
        ? "\n\n[SCRIPT REQUIREMENT: TRADITIONAL CHINESE (Hant)]\nWrite all lyrics and song text using Traditional Chinese characters (繁體中文) exclusively."
        : "";

  return `${cleanLanguage}

==================================================
LANGUAGE INTELLIGENCE v1.2 — ${resolved.profileId.toUpperCase()} GUIDELINES (AUTHORITATIVE FOR LYRICAL PHRASING & PROSODY)${scriptHeader}
==================================================

${resolved.content.trim()}

==================================================
END LANGUAGE INTELLIGENCE GUIDELINES
==================================================`;
}
