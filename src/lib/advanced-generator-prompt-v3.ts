import { buildAdvancedGeneratorPromptV2 } from "./advanced-generator-prompt-v2";

/**
 * Experimental Super Admin-only Advanced Generator V3.
 * Compose on the proven V2 blueprint interpretation, adding adaptive
 * singability guidance without touching V1/V2 or making hard syllable caps.
 */
export function buildAdvancedGeneratorPromptV3(original: string): string {
  const v2 = buildAdvancedGeneratorPromptV2(original);
  const anchor = "==================================================\nPROFESSIONAL CREATIVE DIRECTION\n==================================================";
  if (!v2.includes(anchor)) throw new Error("Generator V3 creative direction anchor missing");
  const guidance = `==================================================
V3 ADAPTIVE SINGABILITY — MUSIC-AWARE LYRIC COMPOSITION
==================================================

Apply these instructions to EVERY sung section, not only Greek Pop. Adapt to
the selected language, genre/subgenre, mood, BPM if provided, groove, vocal
delivery, explicit structure, and each occurrence-specific Blueprint. If tempo,
meter or phrase duration are unknown, do not pretend that they are known.
BPM alone never determines how many syllables fit: half-time vs double-time,
beat subdivision, sustained notes, rests, meter and lyrical accents matter.
Never infer a fixed bars-per-line value or force a genre-specific template.

Before writing each section, mentally plan natural breath-length vocal phrases
appropriate to its role:
- Melodic verses: conversational, clear, emotionally natural delivery, with
  balanced adjacent line lengths and breathing room; not accidental fast rap.
- Pre-chorus: controlled build, intentional momentum, room for tension.
- Chorus/hook: memorable melodic phrases, space for held notes, vowels and
  repetition only where meaningful; refrain should not become syllable-dense.
- Bridge/breakdown: flexible expressive timing and deliberate pauses.
- Rap or deliberately fast rhythmic vocals: allow denser writing WHEN requested,
  but ensure articulable stresses and planned rests; do not impose sung-ballad
  pacing on an explicitly rap-focused section.

Treat syllable counts as SOFT diagnostic signals, never fixed minimums or caps.
Avoid both telegraphic two-word lines and lengthy prose squeezed into a short
musical phrase. Compare neighboring lines and repeated sections for likely
delivery density, stress placement and natural spoken Greek (or the requested
language). A longer line is welcome if its pacing, rests or extended phrase
can support it; a shorter one is welcome for emphasis. Never shorten a line
merely to match a number. Natural language and intended narrative outrank
mechanical syllable symmetry and forced rhyme.

Internally review the completed lyrics once within the SAME generation call:
1. Identify lines likely to require rushed/double-time articulation in a
   section intended for relaxed or sustained singing.
2. Look for hard-to-sing consonant clusters, unnatural stress, unclear breath
   placement, sharp density jumps and lengthy adjacent phrases.
3. Revise only genuinely risky phrases while preserving meaning, voice,
   emotional development, rhyme where natural and Blueprint requirements.
4. Keep lyrics expressive and complete; do not delete required narrative details,
   change genre or alter the requested sections to satisfy a syllable target.
Do not output counts, diagnostic notes or a singability report unless requested.
Do not claim to know the eventual Suno/Udio melody or guarantee its phrasing.

`;
  return v2.replace(anchor, guidance + anchor);
}
