export const AI_TARGET_PLATFORMS = ["suno", "udio"] as const;

export type AiTargetPlatform = (typeof AI_TARGET_PLATFORMS)[number];
export type AITargetPlatform = AiTargetPlatform;

export const DEFAULT_AI_TARGET_PLATFORM: AiTargetPlatform = "suno";

export const AI_TARGET_PLATFORM_LABEL: Record<AiTargetPlatform, string> = {
  suno: "Suno",
  udio: "Udio",
};
