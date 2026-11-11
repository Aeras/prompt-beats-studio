import type { LanguageIntelligenceRequest, LanguageIntelligenceResolution } from "./types";
import { resolveLanguageProfile } from "./resolver";
import { composeLanguagePromptBlock } from "./composer";

export * from "./types";
export * from "./repository";
export * from "./resolver";
export * from "./composer";
export * from "./adapters";

/**
 * Public Engine Facade.
 * Resolves language and variety, checks enablement, and produces the transient promptLanguageBlock.
 */
export function resolveLanguageIntelligencePrompt(
  request: LanguageIntelligenceRequest,
  isEnabled: boolean,
): LanguageIntelligenceResolution {
  const clean = (request.language ?? "").trim();

  // If feature is disabled: return bare clean language (100% OFF parity)
  if (!isEnabled) {
    return {
      active: false,
      applied: false,
      profileId: null,
      profileVersion: null,
      cleanLanguage: clean,
      promptLanguageBlock: clean,
    };
  }

  // Attempt profile resolution
  const resolved = resolveLanguageProfile(clean, request.variantId);

  // If unsupported or ambiguous: return bare clean language (safe bypass)
  if (!resolved) {
    return {
      active: true,
      applied: false,
      profileId: null,
      profileVersion: null,
      cleanLanguage: clean,
      promptLanguageBlock: clean,
    };
  }

  // Successful resolution: compose the transient prompt block
  const block = composeLanguagePromptBlock(clean, resolved);
  return {
    active: true,
    applied: true,
    profileId: resolved.profileId,
    profileVersion: resolved.researchVersion,
    cleanLanguage: clean,
    promptLanguageBlock: block,
    ...(resolved.script ? { script: resolved.script } : {}),
  };
}

/** Central emergency kill-switch check (fail-closed) */
export function isLanguageIntelligenceKillSwitchActive(): boolean {
  return process.env["PROMPTBEATS_LANGUAGE_INTELLIGENCE_DISABLED"] === "true";
}
