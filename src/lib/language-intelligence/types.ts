import { z } from "zod";

export const LANGUAGE_PROFILE_IDS = [
  "en",
  "de",
  "ru",
  "el",
  "fr",
  "es",
  "pt-BR",
  "pt-PT",
  "zh-cmn",
  "yue",
  "tr",
  "it",
] as const;

export type LanguageProfileId = (typeof LANGUAGE_PROFILE_IDS)[number];

export type ChineseScript = "Hans" | "Hant";

export interface LanguageProfileAsset {
  readonly id: LanguageProfileId;
  readonly languageKey: string;
  readonly name: string;
  readonly researchVersion: string;
  readonly profileVersion: string;
  readonly content: string;
}

export interface ResolvedLanguageProfile {
  readonly profileId: LanguageProfileId;
  readonly researchVersion: string;
  readonly profileVersion: string;
  readonly cleanLanguage: string;
  readonly variantId: string | null;
  readonly script?: ChineseScript | undefined;
  readonly content: string;
}

export interface LanguageIntelligenceRequest {
  readonly language: string;
  readonly variantId?: string | null | undefined;
  readonly promptVersion?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export interface LanguageIntelligenceResolution {
  readonly active: boolean;
  readonly applied: boolean;
  readonly profileId: LanguageProfileId | null;
  readonly profileVersion: string | null;
  readonly researchVersion: string | null;
  readonly cleanLanguage: string;
  readonly promptLanguageBlock: string;
  readonly script?: ChineseScript | undefined;
}

export const languageIntelligenceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  pairId: z.string().uuid().optional(),
  pairRole: z.enum(["control", "treatment"]).optional(),
});

export type LanguageIntelligenceConfig = z.infer<typeof languageIntelligenceConfigSchema>;

export interface LanguageIntelligenceExecutionMeta {
  readonly enabled: boolean;
  readonly applied: boolean;
  readonly pairId?: string | undefined;
  readonly pairRole?: "control" | "treatment" | undefined;
  readonly profileId?: string | undefined;
  readonly profileVersion?: string | undefined;
  readonly researchVersion?: string | undefined;
  readonly resolvedVariant?: string | undefined;
  readonly script?: string | undefined;
  readonly promptVersion: string;
  readonly promptDigest: string;
  readonly masterPromptTemplate?: string | undefined;
  readonly masterPromptDigest: string;
  readonly provider: string;
  readonly model: string;
}
