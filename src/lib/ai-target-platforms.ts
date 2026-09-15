export const AI_TARGET_PLATFORMS = ["suno", "udio"] as const;

export type AITargetPlatform = (typeof AI_TARGET_PLATFORMS)[number];

export const DEFAULT_AI_TARGET_PLATFORM: AITargetPlatform = "suno";

export const AI_TARGET_PLATFORM_LABEL: Record<AITargetPlatform, string> = {
  suno: "Suno",
  udio: "Udio",
};
