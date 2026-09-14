export const TRACK_SOURCE_TYPES = ["upload", "suno", "udio"] as const;

export type TrackSourceType = (typeof TRACK_SOURCE_TYPES)[number];
export type ExternalTrackSourceType = Exclude<TrackSourceType, "upload">;
/** Database-only compatibility state for generic links created before Phase 1. */
export type PersistedTrackSourceType = TrackSourceType | "legacy_link";

export type NormalizedExternalTrackSource = {
  sourceType: ExternalTrackSourceType;
  sourceId: string;
  sourceUrl: string;
};

/** Only native uploads and pre-Phase-1 generic links may enter native playback. */
export function canUseNativeTrackPlayer(sourceType: string | null | undefined): boolean {
  return sourceType == null || sourceType === "upload" || sourceType === "legacy_link";
}

const SUNO_HOSTS = new Set(["suno.com", "www.suno.com"]);
const UDIO_HOSTS = new Set(["udio.com", "www.udio.com"]);
const PROVIDER_ID = /^[A-Za-z0-9_-]{6,128}$/;

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

  return null;
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
  return null;
}

/** A provider-owned canonical fallback page for a validated external source. */
export function getTrackProviderUrl(
  sourceType: string | null | undefined,
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId || !PROVIDER_ID.test(sourceId)) return null;
  if (sourceType === "suno") return `https://suno.com/song/${sourceId}`;
  if (sourceType === "udio") return `https://www.udio.com/songs/${sourceId}`;
  return null;
}
