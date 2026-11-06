import dataset from "./football-team-registry.data.json" with { type: "json" };

export type FootballTeam = Readonly<{
  id: string;
  country: string;
  squad: string;
  domesticLeague: string;
  season: string;
  name: string;
  nameEl: string;
  aliases: readonly string[];
  providers: Readonly<Record<string, string>>;
  source: string;
}>;
export type TeamResolution =
  | { status: "matched"; team: FootballTeam; via: "provider_id" | "alias" }
  | { status: "unknown" | "ambiguous" | "conflict" };

/** Only Unicode/case/whitespace equivalence. Never strip squad, age, city or punctuation. */
export function normalizeFootballTeamName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function createFootballTeamRegistry(input: readonly FootballTeam[]) {
  const byId = new Map<string, FootballTeam>();
  const byProvider = new Map<string, FootballTeam>();
  const byAlias = new Map<string, Set<FootballTeam>>();
  for (const raw of input) {
    if (!raw.id || byId.has(raw.id) || !raw.nameEl || raw.squad !== "men-first")
      throw new Error("Invalid football team registry identity");
    const team: FootballTeam = Object.freeze({
      ...raw,
      aliases: Object.freeze([...raw.aliases]),
      providers: Object.freeze({ ...raw.providers }),
    });
    byId.set(team.id, team);
    for (const [provider, id] of Object.entries(team.providers)) {
      const key = `${provider}:${id}`;
      if (!id || byProvider.has(key)) throw new Error("Duplicate football provider identity");
      byProvider.set(key, team);
    }
    for (const alias of [team.name, ...team.aliases]) {
      const key = normalizeFootballTeamName(alias);
      if (!key) throw new Error("Empty football alias");
      const candidates = byAlias.get(key) ?? new Set<FootballTeam>();
      candidates.add(team);
      byAlias.set(key, candidates);
    }
  }
  return Object.freeze({
    teams: Object.freeze([...byId.values()]),
    resolve(name: string, provider?: string, providerId?: string): TeamResolution {
      const candidates = byAlias.get(normalizeFootballTeamName(name));
      const identified =
        provider && providerId ? byProvider.get(`${provider}:${providerId}`) : undefined;
      if (identified) {
        // A valid ID with a changed/qualified/contradictory name requires editorial review.
        if (!candidates?.has(identified) || candidates.size !== 1) return { status: "conflict" };
        return { status: "matched", team: identified, via: "provider_id" };
      }
      if (!candidates?.size) return { status: "unknown" };
      if (candidates.size !== 1) return { status: "ambiguous" };
      return { status: "matched", team: candidates.values().next().value!, via: "alias" };
    },
  });
}

export const footballTeamRegistry = createFootballTeamRegistry(dataset.teams);
export const FOOTBALL_REGISTERED_TEAMS = footballTeamRegistry.teams;

export function registeredFootballTeamKey(name: string): string | null {
  const result = footballTeamRegistry.resolve(name);
  return result.status === "matched" ? `club:${result.team.id}` : null;
}

/** Provider IDs corroborate names; they never override a contradictory/qualified name. */
export function sameRegisteredFootballTeam(
  target: string,
  candidate: string,
  provider?: string,
  providerId?: string,
): boolean | null {
  const a = footballTeamRegistry.resolve(target);
  const b = footballTeamRegistry.resolve(candidate, provider, providerId);
  if ([a.status, b.status].some((s) => s === "conflict" || s === "ambiguous")) return false;
  if (a.status === "matched" && b.status === "matched") return a.team.id === b.team.id;
  if (a.status === "matched" || b.status === "matched") return false;
  return null; // Unknown legacy clubs retain the caller's pre-existing exact alias rules.
}
