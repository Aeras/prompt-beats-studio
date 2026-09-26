import logoAsset from "@/assets/logo.png.asset.json";

import { avatarProxyUrl } from "@/lib/avatar-reference";

/**
 * Canonical user-avatar fallback for PromptBeats.
 *
 * Keep all user-avatar rendering on this helper so accounts without a custom
 * avatar never fall back to random/external avatar services.
 */
export const DEFAULT_PROMPTBEATS_AVATAR = logoAsset.url;

export function getUserAvatarUrl(avatarUrl?: string | null) {
  const trimmed = avatarUrl?.trim();
  if (!trimmed) return DEFAULT_PROMPTBEATS_AVATAR;
  return avatarProxyUrl(trimmed) ?? trimmed;
}
