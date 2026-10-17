export const START_SCREEN_VALUES = ["home", "last_work", "projects", "my_songs", "playlists", "generator", "song_universe", "inspiration_wall", "story_map", "discover", "create"] as const;
export type StartScreenPreference = (typeof START_SCREEN_VALUES)[number];
export const DEFAULT_START_SCREEN: StartScreenPreference = "home";
export function parseStartScreenPreference(value: unknown): StartScreenPreference {
  return typeof value === "string" && (START_SCREEN_VALUES as readonly string[]).includes(value)
    ? value as StartScreenPreference : DEFAULT_START_SCREEN;
}

export type LastWorkDestination =
  | { type: "project"; id: string }
  | { type: "song_universe"; id: string }
  | { type: "story_map"; id: string }
  | { type: "inspiration_wall"; id: string }
  | { type: "projects" }
  | { type: "my_songs" }
  | { type: "playlists" }
  | { type: "generator" };

export type LastWorkEnvelope = {
  version: 1;
  destination: LastWorkDestination;
  recordedAt?: string;
};

const EXACT_TYPES = new Set(["project", "song_universe", "story_map", "inspiration_wall"]);
const AREA_TYPES = new Set(["projects", "my_songs", "playlists", "generator"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseLastWorkEnvelope(value: unknown): LastWorkEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !raw.destination || typeof raw.destination !== "object" || Array.isArray(raw.destination)) return null;
  const dest = raw.destination as Record<string, unknown>;
  if (typeof dest.type !== "string") return null;
  if (EXACT_TYPES.has(dest.type)) {
    if (typeof dest.id !== "string" || !UUID.test(dest.id)) return null;
  } else if (!AREA_TYPES.has(dest.type)) return null;
  const destination = EXACT_TYPES.has(dest.type)
    ? { type: dest.type, id: dest.id } as LastWorkDestination
    : { type: dest.type } as LastWorkDestination;
  return { version: 1, destination, ...(typeof raw.recordedAt === "string" ? { recordedAt: raw.recordedAt } : {}) };
}
export function sameLastWorkDestination(a: LastWorkDestination, b: LastWorkDestination): boolean {
  return a.type === b.type && (!("id" in a) || ("id" in b && a.id === b.id));
}

export type Pb012ResolvedDestination =
  | { type: Exclude<StartScreenPreference, "last_work"> }
  | { type: "project"; id: string }
  | { type: "song_universe_exact"; id: string }
  | { type: "story_map_exact"; id: string }
  | { type: "inspiration_wall_exact"; id: string };

export const START_SCREEN_FEATURES: Partial<Record<StartScreenPreference, string>> = {
  generator: "ai_generator",
  playlists: "playlists",
  song_universe: "song_universe",
  inspiration_wall: "inspiration_wall",
  story_map: "story_map",
};

export type Pb012Route = { to: string; search?: Record<string, string> };
export function pb012RouteFor(destination: Pb012ResolvedDestination): Pb012Route {
  switch (destination.type) {
    case "home": return { to: "/" };
    case "projects": return { to: "/library", search: { tab: "prompts", view: "projects" } };
    case "my_songs": return { to: "/library", search: { tab: "tracks" } };
    case "playlists": return { to: "/library", search: { tab: "playlists" } };
    case "generator": return { to: "/generate" };
    case "create": return { to: "/create" };
    case "song_universe": return { to: "/song-universe" };
    case "inspiration_wall": return { to: "/inspiration-wall" };
    case "story_map": return { to: "/story-map" };
    case "discover": return { to: "/discover" };
    case "project": return { to: "/library", search: { tab: "prompts", project: destination.id } };
    case "song_universe_exact": return { to: "/song-universe", search: { universe: destination.id } };
    case "story_map_exact": return { to: "/story-map", search: { map: destination.id } };
    case "inspiration_wall_exact": return { to: "/inspiration-wall", search: { wall: destination.id } };
  }
}
