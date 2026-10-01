export type SeoIndexPolicy = "index" | "noindex-follow" | "noindex" | "token";

export type SeoRuntimeConfig = {
  canonicalOrigin: string | null;
  indexingEnabled: boolean;
};

export function normalizeCanonicalOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveSeoRuntimeConfig(input: {
  canonicalOrigin?: string | null;
  indexingEnabled?: string | boolean | null;
}): SeoRuntimeConfig {
  const canonicalOrigin = normalizeCanonicalOrigin(input.canonicalOrigin);
  const enabled =
    input.indexingEnabled === true ||
    (typeof input.indexingEnabled === "string" &&
      input.indexingEnabled.trim().toLowerCase() === "true");
  return {
    canonicalOrigin,
    indexingEnabled: Boolean(enabled && canonicalOrigin),
  };
}

export function getSeoRuntimeConfig(): SeoRuntimeConfig {
  return resolveSeoRuntimeConfig({
    canonicalOrigin: import.meta.env.VITE_PROMPTBEATS_CANONICAL_ORIGIN,
    indexingEnabled: import.meta.env.VITE_PROMPTBEATS_INDEXING_ENABLED,
  });
}

export function canonicalUrl(pathname: string, config = getSeoRuntimeConfig()): string | null {
  if (!config.indexingEnabled || !config.canonicalOrigin) return null;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(path, `${config.canonicalOrigin}/`);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function robotsContent(
  policy: SeoIndexPolicy,
  config = getSeoRuntimeConfig(),
): string {
  if (!config.indexingEnabled) return "noindex,nofollow";
  switch (policy) {
    case "index":
      return "index,follow";
    case "noindex-follow":
      return "noindex,follow";
    case "token":
      return "noindex,nofollow,noarchive";
    default:
      return "noindex,nofollow";
  }
}

export function canonicalLink(
  pathname: string,
  config = getSeoRuntimeConfig(),
): { rel: "canonical"; href: string } | null {
  const href = canonicalUrl(pathname, config);
  return href ? { rel: "canonical", href } : null;
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/ /g, "\\u2028")
    .replace(/ /g, "\\u2029");
}
