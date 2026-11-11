import { createHash } from "node:crypto";
import type { LanguageIntelligenceExecutionMeta, ResolvedLanguageProfile } from "./types";

export function sha256Digest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Resolves the authoritative master prompt template identity for evaluation provenance.
 *
 * Identity mappings:
 * - V1: "advanced-generator-prompt-v1"
 * - V2: "advanced-generator-prompt-v2"
 * - V3: "advanced-generator-prompt-v2+v3-musical-planning" (V2 baseline + V3 phrasing layer)
 * - V4 Beta: "advanced-generator-prompt-v4-beta"
 * - V5 Beta 1: "advanced-generator-prompt-v5-beta-1"
 * - Registry: "registry-bound-template"
 * - Revision: "advanced-generator-revision-prompt"
 */
export function resolveMasterPromptTemplate(
  promptVersion: string | undefined,
  isRevision = false,
): string {
  if (isRevision) {
    return "advanced-generator-revision-prompt";
  }
  switch (promptVersion) {
    case "v5_beta_1":
      return "advanced-generator-prompt-v5-beta-1";
    case "v4_beta":
      return "advanced-generator-prompt-v4-beta";
    case "registry":
      return "registry-bound-template";
    case "v3":
      return "advanced-generator-prompt-v2+v3-musical-planning";
    case "v2":
      return "advanced-generator-prompt-v2";
    case "v1":
    default:
      return "advanced-generator-prompt-v1";
  }
}

export function buildLanguageIntelligenceProvenance(params: {
  enabled: boolean;
  applied: boolean;
  pairId?: string | undefined;
  pairRole?: "control" | "treatment" | undefined;
  resolved?: ResolvedLanguageProfile | null | undefined;
  promptVersion: string;
  assembledPrompt: string;
  masterPromptTemplate: string;
  provider: string;
  model: string;
}): LanguageIntelligenceExecutionMeta {
  return {
    enabled: params.enabled,
    applied: params.applied,
    ...(params.pairId ? { pairId: params.pairId } : {}),
    ...(params.pairRole ? { pairRole: params.pairRole } : {}),
    ...(params.resolved
      ? {
          profileId: params.resolved.profileId,
          profileVersion: params.resolved.profileVersion ?? "1.2",
          researchVersion: params.resolved.researchVersion ?? "1.1",
        }
      : {}),
    ...(params.resolved?.variantId ? { resolvedVariant: params.resolved.variantId } : {}),
    ...(params.resolved?.script ? { script: params.resolved.script } : {}),
    promptVersion: params.promptVersion,
    promptDigest: sha256Digest(params.assembledPrompt),
    masterPromptTemplate: params.masterPromptTemplate,
    masterPromptDigest: sha256Digest(params.masterPromptTemplate),
    provider: params.provider,
    model: params.model,
  };
}
