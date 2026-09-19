import logoAsset from "@/assets/logo.png.asset.json";

/**
 * Canonical user-avatar fallback for PromptBeats.
 *
 * Keep all user-avatar rendering on this helper so accounts without a custom
 * avatar never fall back to random/external avatar services.
 */
export const DEFAULT_PROMPTBEATS_AVATAR = logoAsset.url;

export function getUserAvatarUrl(avatarUrl?: string | null) {
  return avatarUrl?.trim() || DEFAULT_PROMPTBEATS_AVATAR;
}
