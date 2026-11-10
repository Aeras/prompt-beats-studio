import { createHash } from "node:crypto";
import type { LanguageIntelligenceExecutionMeta, ResolvedLanguageProfile } from "./types";

export function sha256Digest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
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
      ? { profileId: params.resolved.profileId, profileVersion: params.resolved.researchVersion }
      : {}),
    ...(params.resolved?.variantId ? { resolvedVariant: params.resolved.variantId } : {}),
    ...(params.resolved?.script ? { script: params.resolved.script } : {}),
    promptVersion: params.promptVersion,
    promptDigest: sha256Digest(params.assembledPrompt),
    masterPromptDigest: sha256Digest(params.masterPromptTemplate),
    provider: params.provider,
    model: params.model,
  };
}
