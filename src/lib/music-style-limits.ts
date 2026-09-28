import type { AITargetPlatform } from "@/lib/ai-target-platforms";

export const MUSIC_STYLE_CHARACTER_LIMITS: Record<AITargetPlatform, number | null> = {
  suno: 1000,
  udio: null,
};

export function musicStyleCharacterLimit(platform: AITargetPlatform): number | null {
  return MUSIC_STYLE_CHARACTER_LIMITS[platform];
}

/**
 * Final defensive cap for platform-facing Music Style text.
 *
 * The model is instructed to stay within the platform budget itself. This
 * helper is only the deterministic safety net when a provider returns a few
 * characters too many. It prefers a nearby natural separator/word boundary
 * and never adds ellipsis or filler that would consume the remaining budget.
 */
export function fitMusicStyleToPlatform(
  value: string,
  platform: AITargetPlatform,
): string {
  const text = value.trim();
  const limit = musicStyleCharacterLimit(platform);
  if (limit == null || text.length <= limit) return text;

  const hard = text.slice(0, limit).trimEnd();
  const minimumNaturalCut = Math.floor(limit * 0.9);
  const separators = [", ", "; ", ". ", " — ", " - ", " "];
  let boundary = -1;

  for (const separator of separators) {
    boundary = Math.max(boundary, hard.lastIndexOf(separator));
  }

  if (boundary >= minimumNaturalCut) {
    return hard.slice(0, boundary).replace(/[\s,;.—-]+$/u, "").trimEnd();
  }

  return hard;
}
