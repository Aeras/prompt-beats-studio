const AVATAR_PATH_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(avatar-\d+\.(?:jpg|png|webp))$/i;

const STORAGE_PATH_PREFIXES = [
  "/storage/v1/object/sign/avatars/",
  "/storage/v1/object/public/avatars/",
];

export function isSafeAvatarObjectPath(value: string): boolean {
  return AVATAR_PATH_PATTERN.test(value.trim());
}

export function avatarOwnerId(value: string): string | null {
  const match = AVATAR_PATH_PATTERN.exec(value.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function extractAvatarObjectPath(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (isSafeAvatarObjectPath(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed, "https://promptbeats.invalid");
    if (parsed.pathname === "/api/avatar") {
      const path = parsed.searchParams.get("path");
      return path && isSafeAvatarObjectPath(path) ? path : null;
    }

    for (const prefix of STORAGE_PATH_PREFIXES) {
      if (!parsed.pathname.startsWith(prefix)) continue;
      const encodedPath = parsed.pathname.slice(prefix.length);
      const path = decodeURIComponent(encodedPath);
      return isSafeAvatarObjectPath(path) ? path : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function avatarProxyUrl(value?: string | null): string | null {
  const path = extractAvatarObjectPath(value);
  return path ? `/api/avatar?path=${encodeURIComponent(path)}` : null;
}
