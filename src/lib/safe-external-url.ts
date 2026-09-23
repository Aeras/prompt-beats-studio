export type SupportedSocialPlatform = "instagram" | "tiktok" | "youtube" | "x";

const PLATFORM_HOSTS: Record<SupportedSocialPlatform, ReadonlySet<string>> = {
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  tiktok: new Set(["tiktok.com", "www.tiktok.com"]),
  youtube: new Set(["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"]),
  x: new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]),
};

/** Returns a clickable URL only for safe, supported external links. */
export function getSafeExternalUrl(
  value: unknown,
  platform?: SupportedSocialPlatform,
): string | null {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  if (/\s|[\u0000-\u001f\u007f]/.test(value) || value.includes("\\")) return null;
  if (value.startsWith("/")) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") return null;
  if (!parsed.hostname || parsed.username || parsed.password) return null;

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (platform && !PLATFORM_HOSTS[platform].has(hostname)) return null;

  return parsed.toString();
}
