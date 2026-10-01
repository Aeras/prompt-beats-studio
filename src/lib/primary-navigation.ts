export const PRIMARY_DOMAINS = ["home", "create", "discover", "library"] as const;

export type PrimaryDomain = (typeof PRIMARY_DOMAINS)[number];

export const PRIMARY_DOMAIN_PATHS: Record<PrimaryDomain, string> = {
  home: "/",
  create: "/create",
  discover: "/discover",
  library: "/library",
};

const CREATE_ROUTE_PREFIXES = [
  "/create",
  "/generate",
  "/audio-revision",
  "/lyrics-review",
  "/song-analyzer",
  "/inspiration-wall",
  "/story-map",
  "/song-universe",
] as const;

const DISCOVER_ROUTE_PREFIXES = ["/discover", "/trending"] as const;

function matchesRoutePrefix(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function getPrimaryDomain(pathname: string): PrimaryDomain | null {
  if (pathname === "/") return "home";
  if (CREATE_ROUTE_PREFIXES.some((route) => matchesRoutePrefix(pathname, route))) {
    return "create";
  }
  if (DISCOVER_ROUTE_PREFIXES.some((route) => matchesRoutePrefix(pathname, route))) {
    return "discover";
  }
  if (matchesRoutePrefix(pathname, "/library")) return "library";
  return null;
}
