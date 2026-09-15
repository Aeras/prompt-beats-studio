export const AI_TARGET_PLATFORMS = ["suno", "udio"] as const;

export type AiTargetPlatform = (typeof AI_TARGET_PLATFORMS)[number];

export const DEFAULT_AI_TARGET_PLATFORM: AiTargetPlatform = "suno";
