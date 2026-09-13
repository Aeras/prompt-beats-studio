export const TRACK_SOURCE_TYPES = ["upload", "suno", "udio", "youtube"] as const;

export type TrackSourceType = (typeof TRACK_SOURCE_TYPES)[number];
export type ExternalTrackSourceType = Exclude<TrackSourceType, "upload">;
/** Database-only compatibility state for generic links created before Phase 1. */
export type PersistedTrackSourceType = TrackSourceType | "legacy_link";

export type NormalizedExternalTrackSource = {
  sourceType: ExternalTrackSourceType;
  sourceId: string;
  sourceUrl: string;
};

const SUNO_HOSTS = new Set(["suno.com", "www.suno.com"]);
const UDIO_HOSTS = new Set(["udio.com", "www.udio.com"]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const PROVIDER_ID = /^[A-Za-z0-9_-]{6,128}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function pathId(url: URL, allowedPrefixes: readonly string[]): string | null {
  const [prefix, sourceId, ...rest] = url.pathname.split("/").filter(Boolean);
  if (!prefix || !sourceId || rest.length !== 0 || !allowedPrefixes.includes(prefix)) return null;
  return PROVIDER_ID.test(sourceId) ? sourceId : null;
}

/** Client-side format validation only; server-side resolution remains authoritative. */
export function isSupportedExternalTrackUrl(sourceType: ExternalTrackSourceType, rawUrl: string): boolean {
  const url = parseHttpsUrl(rawUrl);
  if (!url || url.username || url.password) return false;

  if (sourceType === "suno") {
    if (!SUNO_HOSTS.has(url.hostname.toLowerCase())) return false;
    return pathId(url, ["song", "embed", "s"]) !== null;
  }
  return normalizeExternalTrackSource(sourceType, rawUrl) !== null;
}

/**
 * Accepts normal provider song/share URLs and reduces them to a provider-owned
 * canonical URL plus opaque provider ID. Never return a user-controlled URL.
 */
export function normalizeExternalTrackSource(
  sourceType: ExternalTrackSourceType,
  rawUrl: string,
): NormalizedExternalTrackSource | null {
  const url = parseHttpsUrl(rawUrl);
  if (!url || url.username || url.password) return null;

  if (sourceType === "suno") {
    if (!SUNO_HOSTS.has(url.hostname.toLowerCase())) return null;
    const sourceId = pathId(url, ["song", "embed"]);
    return sourceId
      ? { sourceType, sourceId, sourceUrl: `https://suno.com/song/${sourceId}` }
      : null;
  }

  if (sourceType === "udio") {
    if (!UDIO_HOSTS.has(url.hostname.toLowerCase())) return null;
    const sourceId = pathId(url, ["songs", "s"]);
    return sourceId
      ? { sourceType, sourceId, sourceUrl: `https://www.udio.com/songs/${sourceId}` }
      : null;
  }

  let sourceId: string | null = null;
  if (YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) && url.pathname === "/watch") {
    const candidate = url.searchParams.get("v");
    sourceId = candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
  } else if (YOUTUBE_SHORT_HOSTS.has(url.hostname.toLowerCase())) {
    const [candidate, ...rest] = url.pathname.split("/").filter(Boolean);
    sourceId = candidate && rest.length === 0 && YOUTUBE_ID.test(candidate) ? candidate : null;
  }
  return sourceId
    ? { sourceType, sourceId, sourceUrl: `https://www.youtube.com/watch?v=${sourceId}` }
    : null;
}

/** Only validated source IDs are ever turned into iframe URLs. */
export function getTrackEmbedUrl(
  sourceType: string | null | undefined,
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId) return null;
  if (sourceType === "suno" && PROVIDER_ID.test(sourceId)) {
    return `https://suno.com/embed/${sourceId}`;
  }
  if (sourceType === "udio" && PROVIDER_ID.test(sourceId)) {
    return `https://www.udio.com/embed/${sourceId}?embedVariant=default&utm_source=generator`;
  }
  if (sourceType === "youtube" && YOUTUBE_ID.test(sourceId)) {
    return `https://www.youtube.com/embed/${sourceId}?autoplay=0&playsinline=1&enablejsapi=1`;
  }
  return null;
}
