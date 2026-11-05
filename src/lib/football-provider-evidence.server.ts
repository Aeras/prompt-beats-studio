import { parseEspnScoreboard, ESPN_LEAGUE_CODES } from "./football-espn.server";
import { fetchEspnMatchContext } from "./football-espn-context.server";
import { footballSourceJson, FootballSourceError } from "./football-source-http.server";
import {
  footballProviderEvidenceSchema,
  sameEvidenceFixture,
  FOOTBALL_EVIDENCE_PROVIDERS,
  footballEvidenceTeamKey,
  type FootballProviderEvidence,
  type ProviderEvidence,
  type EvidenceStatus,
} from "./football-provider-evidence.shared";
import type { FootballAiDiscoveryLeagueId } from "./football-research.shared";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 160) =>
  typeof v === "string"
    ? v.slice(0, max)
    : typeof v === "number" && Number.isFinite(v)
      ? String(v)
      : "";
const num = (v: unknown): number | null => {
  if ((typeof v !== "number" && typeof v !== "string") || v === "" || typeof v === "boolean")
    return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};
const score = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n <= 99 ? n : null;
};
const numericId = (v: unknown) => (/^\d{1,12}$/.test(text(v)) ? text(v) : "");
const pitchId = (v: unknown, kind: "m" | "l" | "t") =>
  new RegExp(`^${kind}_[A-Za-z0-9]{6}$`).test(text(v)) ? text(v) : "";
const side = (name: string, id: string | null): NonNullable<ProviderEvidence["home"]> => ({
  id,
  name: name.slice(0, 160),
  standing: null,
  teamStatistics: [],
  matchStatistics: [],
  recentResults: [],
  roster: [],
  injuries: [],
});
type Target = FootballProviderEvidence["fixture"];
type Config = {
  cache?: boolean;
  fetcher?: typeof fetch;
  now?: () => number;
  env?: Record<string, string | undefined>;
};
const leagueNames: Record<string, string[]> = {
  "EN-PL": ["premier league", "english premier league"],
  "IT-SA": ["serie a", "italian serie a"],
  "ES-LL": ["la liga", "laliga", "spanish laliga"],
  "DE-BL": ["bundesliga", "german bundesliga"],
  "FR-L1": ["ligue 1", "french ligue 1"],
  "GR-SL": ["super league", "super league 1", "greek super league"],
  "NL-ED": ["eredivisie", "dutch eredivisie"],
  "PT-PL": ["primeira liga", "liga portugal", "portuguese primeira liga"],
  "BE-PL": ["jupiler pro league", "pro league", "belgian pro league"],
  "UEFA-CL": ["uefa champions league", "champions league"],
  "UEFA-EL": ["uefa europa league", "europa league"],
};
const countries: Record<string, string[]> = {
  "EN-PL": ["eng", "england"],
  "IT-SA": ["ita", "italy"],
  "ES-LL": ["esp", "spain"],
  "DE-BL": ["ger", "deu", "germany"],
  "FR-L1": ["fra", "france"],
  "GR-SL": ["gre", "grc", "greece"],
  "NL-ED": ["ned", "nld", "netherlands"],
  "PT-PL": ["por", "prt", "portugal"],
  "BE-PL": ["bel", "belgium"],
};
function leagueMatches(leagueId: string, name: unknown, country?: unknown): boolean {
  if (!leagueNames[leagueId]?.includes(text(name).toLowerCase())) return false;
  return (
    leagueId.startsWith("UEFA-") || !!countries[leagueId]?.includes(text(country).toLowerCase())
  );
}
type Match = {
  id: string;
  homeId: string;
  awayId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  done: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  league?: Obj;
};
function uniqueMatch(target: Target, matches: Match[]): Match {
  const exact = matches.filter((m) => sameEvidenceFixture(target, m));
  if (exact.length > 1) throw new FootballSourceError("ambiguous");
  if (!exact[0]) {
    const sameTeams = matches.some(
      (m) =>
        footballEvidenceTeamKey(m.homeTeam) === footballEvidenceTeamKey(target.homeTeam) &&
        footballEvidenceTeamKey(m.awayTeam) === footballEvidenceTeamKey(target.awayTeam),
    );
    throw new FootballSourceError(sameTeams ? "conflict" : "not_found");
  }
  if (exact[0].done) throw new FootballSourceError("conflict");
  return exact[0];
}
function recent(matches: Match[], teamId: string, cutoff: number) {
  return [
    ...new Map(
      matches
        .filter(
          (m) =>
            m.done &&
            Date.parse(m.kickoffUtc) < cutoff &&
            Number.isFinite(Date.parse(m.kickoffUtc)) &&
            (m.homeId === teamId || m.awayId === teamId) &&
            m.homeGoals !== null &&
            m.awayGoals !== null,
        )
        .map((m) => [m.id, m]),
    ).values(),
  ]
    .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc))
    .slice(0, 5)
    .map((m) => {
      const home = m.homeId === teamId;
      return {
        id: m.id,
        kickoffUtc: new Date(m.kickoffUtc).toISOString(),
        opponent: home ? m.awayTeam : m.homeTeam,
        homeAway: home ? ("home" as const) : ("away" as const),
        goalsFor: (home ? m.homeGoals : m.awayGoals)!,
        goalsAgainst: (home ? m.awayGoals : m.homeGoals)!,
      };
    });
}
const resourceCache = new Map<
  string,
  { until: number; data: unknown; fetchedAtUtc: string; bytes: number }
>();
let resourceCacheBytes = 0;
const resourceFlights = new Map<string, Promise<unknown>>();
const cooldowns = new Map<string, number>();
let credentialGeneration = "";
const bundleCache = new Map<string, { until: number; data: FootballProviderEvidence }>();
const bundleFlights = new Map<string, Promise<FootballProviderEvidence>>();

/** Every configured source is independent of the fixture picker. No paid search/AI dispatch here. */
export async function collectFootballProviderEvidence(
  target: Target,
  config: Config = {},
): Promise<FootballProviderEvidence> {
  const useCache = config.cache ?? !config.fetcher;
  const now = config.now ?? Date.now,
    env = config.env ?? process.env,
    fetcher = config.fetcher ?? fetch;
  const generation = [
    env["API_FOOTBALL_KEY"],
    env["FOOTBALL_DATA_API_KEY"],
    env["PITCHAPI_API_KEY"],
  ].join("\0");
  if (useCache && generation !== credentialGeneration) {
    credentialGeneration = generation;
    resourceCache.clear();
    resourceCacheBytes = 0;
    resourceFlights.clear();
    bundleFlights.clear();
    bundleCache.clear();
    cooldowns.clear();
  }
  const key = JSON.stringify(target);
  if (useCache) {
    const cached = bundleCache.get(key);
    if (cached && cached.until > now()) return structuredClone(cached.data);
    const flight = bundleFlights.get(key);
    if (flight) return structuredClone(await flight);
  }
  const task = (async () => {
    const signal = AbortSignal.timeout(16000),
      collectedAtUtc = new Date(now()).toISOString();
    const providers = await Promise.all(
      FOOTBALL_EVIDENCE_PROVIDERS.map(async (provider) => {
        const result: ProviderEvidence = {
          provider,
          status: "partial",
          fixtureId: null,
          home: null,
          away: null,
          resources: [],
          notes: [],
        };
        const envKey =
          provider === "pitchapi"
            ? "PITCHAPI_API_KEY"
            : provider === "api-football"
              ? "API_FOOTBALL_KEY"
              : "FOOTBALL_DATA_API_KEY";
        const apiKey = env[envKey]?.trim();
        if (provider !== "espn" && !apiKey) return { ...result, status: "not_configured" as const };
        const get = async (url: string, headers: Record<string, string> = {}): Promise<unknown> => {
          const cacheKey = provider + ":" + url;
          const read = async () => {
            if (signal.aborted) throw new FootballSourceError("timeout");
            if (useCache && (cooldowns.get(provider) ?? 0) > now())
              throw new FootballSourceError("rate_limited");
            const body = await footballSourceJson(new URL(url), { fetcher, headers, signal });
            const root = obj(body);
            if (provider === "pitchapi" && (root["error"] || !root["data"]))
              throw new FootballSourceError("invalid_response");
            if (
              provider === "api-football" &&
              (Object.keys(obj(root["errors"])).length || arr(root["errors"]).length)
            )
              throw new FootballSourceError(
                Object.prototype.hasOwnProperty.call(obj(root["errors"]), "requests")
                  ? "rate_limited"
                  : "access_denied",
              );
            if (useCache && generation === credentialGeneration) {
              const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
              const old = resourceCache.get(cacheKey);
              if (old) {
                resourceCacheBytes -= old.bytes;
                resourceCache.delete(cacheKey);
              }
              while (
                resourceCache.size &&
                (resourceCache.size >= 32 || resourceCacheBytes + bytes > 4_000_000)
              ) {
                const oldest = resourceCache.entries().next().value!;
                resourceCacheBytes -= oldest[1].bytes;
                resourceCache.delete(oldest[0]);
              }
              resourceCacheBytes += bytes;
              resourceCache.set(cacheKey, {
                bytes,
                until: now() + 600000,
                data: body,
                fetchedAtUtc: collectedAtUtc,
              });
            }
            return body;
          };
          try {
            let body: unknown;
            const cached = useCache ? resourceCache.get(cacheKey) : undefined;
            if (cached && cached.until > now()) body = cached.data;
            else if (useCache) {
              let flight = resourceFlights.get(cacheKey);
              if (!flight) {
                flight = read();
                resourceFlights.set(cacheKey, flight);
              }
              try {
                body = await flight;
              } finally {
                if (resourceFlights.get(cacheKey) === flight) resourceFlights.delete(cacheKey);
              }
            } else body = await read();
            result.resources.push({
              url,
              status: "ok",
              fetchedAtUtc: cached && cached.until > now() ? cached.fetchedAtUtc : collectedAtUtc,
            });
            return provider === "pitchapi" ? obj(body)["data"] : body;
          } catch (error) {
            const status = error instanceof FootballSourceError ? error.status : "unavailable";
            if (useCache && generation === credentialGeneration && status === "rate_limited")
              cooldowns.set(
                provider,
                now() +
                  Math.max(600000, error instanceof FootballSourceError ? error.retryAfterMs : 0),
              );
            result.resources.push({ url, status, fetchedAtUtc: collectedAtUtc });
            throw new FootballSourceError(status);
          }
        };
        let partial = false;
        const optional = async (fn: () => Promise<void>) => {
          try {
            await fn();
          } catch (error) {
            partial = true;
            if (result.notes.length < 12)
              result.notes.push(
                `Αποτυχία επιμέρους ανάκτησης: ${error instanceof FootballSourceError ? error.status : "invalid_response"}`,
              );
          }
        };
        try {
          if (provider === "espn") {
            if (!leagueNames[target.leagueId]) throw new FootballSourceError("unsupported");
            const espnFetcher = ((input: RequestInfo | URL, init?: RequestInit) =>
              fetcher(input, {
                ...init,
                signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]),
              })) as typeof fetch;
            const slug = ESPN_LEAGUE_CODES[target.leagueId as FootballAiDiscoveryLeagueId];
            if (!slug) throw new FootballSourceError("unsupported");
            const day = target.kickoffUtc.slice(0, 10);
            const scoreboard = await get(
              `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${day.replaceAll("-", "")}`,
            );
            const fixtures = parseEspnScoreboard(
              scoreboard,
              target.leagueId as FootballAiDiscoveryLeagueId,
              day,
              day,
              collectedAtUtc,
            );
            const match = uniqueMatch(
              target,
              fixtures.map((f) => ({
                ...f,
                id: f.sourceFixtureId,
                homeId: "",
                awayId: "",
                done: f.state !== "scheduled",
                homeGoals: null,
                awayGoals: null,
              })),
            );
            const fixture = fixtures.find((f) => f.sourceFixtureId === match.id)!;
            const context = await fetchEspnMatchContext(
              target.leagueId as FootballAiDiscoveryLeagueId,
              fixture,
              espnFetcher,
              now,
            );
            result.fixtureId = fixture.sourceFixtureId;
            result.home = context.home;
            result.away = context.away;
            result.resources = (context.diagnostics ?? []).map((d) => ({
              url: "https://site.api.espn.com" + d.resource,
              status: d.status,
              fetchedAtUtc: context.fetchedAtUtc,
            }));
            result.notes = context.missing;
          } else if (provider === "api-football") {
            const origin = "https://v3.football.api-sports.io",
              headers = { "x-apisports-key": apiKey! };
            const parse = (body: unknown): Match[] =>
              arr(obj(body)["response"]).flatMap((raw) => {
                const x = obj(raw),
                  f = obj(x["fixture"]),
                  t = obj(x["teams"]),
                  h = obj(t["home"]),
                  a = obj(t["away"]),
                  g = obj(x["goals"]);
                const id = numericId(f["id"]),
                  homeId = numericId(h["id"]),
                  awayId = numericId(a["id"]);
                return id && homeId && awayId
                  ? [
                      {
                        id,
                        homeId,
                        awayId,
                        homeTeam: text(h["name"]),
                        awayTeam: text(a["name"]),
                        kickoffUtc: text(f["date"], 40),
                        done: ["FT", "AET", "PEN"].includes(text(obj(f["status"])["short"])),
                        homeGoals: score(g["home"]),
                        awayGoals: score(g["away"]),
                        league: obj(x["league"]),
                      },
                    ]
                  : [];
              });
            const body = await get(
              `${origin}/fixtures?date=${target.kickoffUtc.slice(0, 10)}&timezone=UTC`,
              headers,
            );
            const candidates = parse(body).filter((m) =>
              leagueMatches(target.leagueId, m.league?.["name"], m.league?.["country"]),
            );
            const match = uniqueMatch(target, candidates);
            result.fixtureId = match.id;
            const leagueId = numericId(match.league?.["id"]),
              season = numericId(match.league?.["season"]);
            if (!leagueId || !season) throw new FootballSourceError("invalid_response");
            result.home = side(target.homeTeam, match.homeId);
            result.away = side(target.awayTeam, match.awayId);
            await Promise.all(
              [result.home, result.away].map(async (team) => {
                await Promise.all([
                  optional(async () => {
                    const b = await get(
                      `${origin}/fixtures?team=${team.id}&last=5&status=FT`,
                      headers,
                    );
                    team.recentResults = recent(
                      parse(b),
                      team.id!,
                      Math.min(now(), Date.parse(target.kickoffUtc)),
                    );
                  }),
                  optional(async () => {
                    const b = obj(
                      obj(
                        await get(
                          `${origin}/teams/statistics?league=${leagueId}&season=${season}&team=${team.id}`,
                          headers,
                        ),
                      )["response"],
                    );
                    if (numericId(obj(b["team"])["id"]) !== team.id)
                      throw new FootballSourceError("invalid_response");
                    for (const [label, value] of Object.entries({
                      Αγώνες: obj(obj(b["fixtures"])["played"])["total"],
                      Νίκες: obj(obj(b["fixtures"])["wins"])["total"],
                      "Γκολ υπέρ": obj(obj(b["goals"])["for"])["total"],
                      "Γκολ κατά": obj(obj(b["goals"])["against"])["total"],
                    })) {
                      const total = obj(value)["total"] ?? value;
                      if (typeof total === "number" && Number.isFinite(total))
                        team.teamStatistics.push({ name: label, value: String(total) });
                    }
                  }),
                ]);
              }),
            );
            await optional(async () => {
              const b = await get(`${origin}/injuries?fixture=${match.id}`, headers);
              for (const raw of arr(obj(b)["response"])) {
                const x = obj(raw);
                if (numericId(obj(x["fixture"])["id"]) !== match.id) continue;
                const team = [result.home, result.away].find(
                  (t) => t!.id === numericId(obj(x["team"])["id"]),
                );
                const player = obj(x["player"]);
                if (team && text(player["name"]))
                  team.injuries.push({
                    name: text(player["name"], 120),
                    detail: text(player["reason"], 240),
                  });
              }
            });
            await optional(async () => {
              const b = await get(`${origin}/fixtures/lineups?fixture=${match.id}`, headers);
              for (const raw of arr(obj(b)["response"])) {
                const x = obj(raw),
                  team = [result.home, result.away].find(
                    (t) => t?.id === numericId(obj(x["team"])["id"]),
                  );
                if (!team) continue;
                team.roster = arr(x["startXI"])
                  .slice(0, 11)
                  .flatMap((rawPlayer) => {
                    const player = obj(obj(rawPlayer)["player"]),
                      name = text(player["name"], 120);
                    return name ? [{ name, detail: "Ενδεκάδα που αναφέρει το API-Football" }] : [];
                  });
              }
            });
            result.notes.push(
              "Ιστορικό και σύνολα API-Football με τη δική του κάλυψη. Η κενή λίστα απουσιών δεν αποδεικνύει πλήρες ρόστερ.",
            );
          } else if (provider === "football-data") {
            const codes: Record<string, string> = {
              "EN-PL": "PL",
              "ES-LL": "PD",
              "IT-SA": "SA",
              "DE-BL": "BL1",
              "FR-L1": "FL1",
              "NL-ED": "DED",
              "PT-PL": "PPL",
              "UEFA-CL": "CL",
            };
            const code = codes[target.leagueId];
            if (!code) throw new FootballSourceError("unsupported");
            const origin = "https://api.football-data.org/v4",
              headers = { "X-Auth-Token": apiKey! };
            const parse = (body: unknown): Match[] =>
              arr(obj(body)["matches"]).flatMap((raw) => {
                const x = obj(raw),
                  h = obj(x["homeTeam"]),
                  a = obj(x["awayTeam"]),
                  s = obj(obj(x["score"])["fullTime"]);
                const id = numericId(x["id"]),
                  homeId = numericId(h["id"]),
                  awayId = numericId(a["id"]);
                return id && homeId && awayId
                  ? [
                      {
                        id,
                        homeId,
                        awayId,
                        homeTeam: text(h["name"]),
                        awayTeam: text(a["name"]),
                        kickoffUtc: text(x["utcDate"], 40),
                        done: x["status"] === "FINISHED",
                        homeGoals: score(s["home"]),
                        awayGoals: score(s["away"]),
                      },
                    ]
                  : [];
              });
            const day = target.kickoffUtc.slice(0, 10),
              match = uniqueMatch(
                target,
                parse(
                  await get(
                    `${origin}/competitions/${code}/matches?dateFrom=${day}&dateTo=${day}`,
                    headers,
                  ),
                ),
              );
            result.fixtureId = match.id;
            result.home = side(target.homeTeam, match.homeId);
            result.away = side(target.awayTeam, match.awayId);
            await Promise.all(
              [result.home, result.away].map((team) =>
                optional(async () => {
                  team.recentResults = recent(
                    parse(
                      await get(
                        `${origin}/teams/${team.id}/matches?status=FINISHED&limit=10`,
                        headers,
                      ),
                    ),
                    team.id!,
                    Math.min(now(), Date.parse(target.kickoffUtc)),
                  );
                }),
              ),
            );
            await optional(async () => {
              const b = await get(`${origin}/competitions/${code}/standings`, headers);
              for (const raw of arr(obj(b)["standings"])) {
                const table = obj(raw);
                if (table["type"] !== "TOTAL") continue;
                for (const entry of arr(table["table"])) {
                  const x = obj(entry),
                    team = [result.home, result.away].find(
                      (t) => t!.id === numericId(obj(x["team"])["id"]),
                    );
                  if (!team) continue;
                  const rank = score(x["position"]);
                  team.standing = {
                    rank: rank && rank > 0 ? rank : null,
                    metrics: [
                      "points",
                      "playedGames",
                      "won",
                      "draw",
                      "lost",
                      "goalsFor",
                      "goalsAgainst",
                    ].flatMap((k) =>
                      typeof x[k] === "number" ? [{ name: k, value: text(x[k]) }] : [],
                    ),
                  };
                }
              }
            });
            result.notes.push(
              "football-data.org: ιστορικό και βαθμολογία σύμφωνα με τα δικαιώματα του κλειδιού· όχι εγγύηση xG ή απουσιών.",
            );
          } else {
            const origin = "https://api.pitchapi.dev/v1",
              headers = { "X-API-KEY": apiKey! };
            const leagues = arr(obj(await get(`${origin}/leagues`, headers))["leagues"])
              .map(obj)
              .filter((l) => leagueMatches(target.leagueId, l["name"], l["country_code"]));
            if (leagues.length !== 1)
              throw new FootballSourceError(leagues.length ? "ambiguous" : "unsupported");
            const lid = pitchId(leagues[0]!["id"], "l");
            if (!lid) throw new FootballSourceError("invalid_response");
            const parse = (body: unknown): Match[] =>
              arr(obj(body)["matches"]).flatMap((raw) => {
                const x = obj(raw),
                  h = obj(x["home_team"]),
                  a = obj(x["away_team"]);
                const id = pitchId(x["id"], "m"),
                  homeId = pitchId(h["id"], "t"),
                  awayId = pitchId(a["id"], "t");
                return id && homeId && awayId
                  ? [
                      {
                        id,
                        homeId,
                        awayId,
                        homeTeam: text(h["name"]),
                        awayTeam: text(a["name"]),
                        kickoffUtc: text(x["time_utc"], 40),
                        done: ["finished", "completed"].includes(text(x["status"])),
                        homeGoals: score(x["score_home"]),
                        awayGoals: score(x["score_away"]),
                        league: obj(x["league"]),
                      },
                    ]
                  : [];
              });
            const day = await get(
              `${origin}/date/${target.kickoffUtc.slice(0, 10)}?status=all`,
              headers,
            );
            const match = uniqueMatch(
              target,
              parse(day).filter((m) => m.league?.["id"] === lid),
            );
            result.fixtureId = match.id;
            result.home = side(target.homeTeam, match.homeId);
            result.away = side(target.awayTeam, match.awayId);
            const history = parse(
              await get(`${origin}/leagues/${lid}/matches?status=played`, headers),
            );
            for (const team of [result.home, result.away])
              team.recentResults = recent(
                history,
                team.id!,
                Math.min(now(), Date.parse(target.kickoffUtc)),
              );
            // Bounded concurrency; one stats request per distinct completed historical match, never the future target.
            const historyIds = [
              ...new Set(
                [result.home, result.away].flatMap((t) => t.recentResults.map((g) => g.id)),
              ),
            ];
            for (let start = 0; start < historyIds.length; start += 3)
              await Promise.all(
                historyIds.slice(start, start + 3).map((hid) =>
                  optional(async () => {
                    const b = obj(await get(`${origin}/matches/${hid}/stats`, headers));
                    const historical = history.find((m) => m.id === hid)!;
                    if (
                      b["match_id"] !== hid ||
                      obj(b["home_team"])["id"] !== historical.homeId ||
                      obj(b["away_team"])["id"] !== historical.awayId
                    )
                      throw new FootballSourceError("invalid_response");
                    const all = arr(b["periods"])
                      .map(obj)
                      .find((p) => p["period"] === "All");
                    const items = arr(all?.["groups"])
                      .flatMap((g) => arr(obj(g)["items"]))
                      .map(obj);
                    const xg = items.find((i) => i["key"] === "expected_goals");
                    if (!xg) return;
                    for (const team of [result.home, result.away]) {
                      if (!team) continue;
                      const game = team.recentResults.find((g) => g.id === hid);
                      if (!game) continue;
                      const home = team.id === historical.homeId,
                        forValue = num(xg[home ? "home" : "away"]),
                        against = num(xg[home ? "away" : "home"]);
                      if (forValue !== null && against !== null)
                        Object.assign(game, { xg: forValue, xga: against });
                    }
                  }),
                ),
              );
            await optional(async () => {
              const b = obj(await get(`${origin}/matches/${match.id}/lineups`, headers));
              if (
                b["match_id"] !== match.id ||
                obj(b["home_team"])["id"] !== match.homeId ||
                obj(b["away_team"])["id"] !== match.awayId
              )
                throw new FootballSourceError("invalid_response");
              for (const [direction, team] of [
                ["home", result.home],
                ["away", result.away],
              ] as const) {
                if (!team) continue;
                const line = obj(b[direction]);
                const detail =
                  line["confirmed"] === true
                    ? "Επιβεβαιωμένη ενδεκάδα κατά PitchAPI"
                    : "Πρόβλεψη ενδεκάδας — όχι επιβεβαιωμένη";
                team.roster = arr(line["starters"])
                  .slice(0, 11)
                  .flatMap((raw) => {
                    const name = text(obj(raw)["name"], 120);
                    return name ? [{ name, detail }] : [];
                  });
              }
            });
            result.notes.push(
              "PitchAPI: τελευταίοι έως 5 ολοκληρωμένοι αγώνες ανά ομάδα στην ίδια διοργάνωση. xGA = xG αντιπάλου στον ίδιο αγώνα/πάροχο. Όσα xG λείπουν δεν γίνονται μηδέν.",
            );
          }
          const failed = result.resources.find((r) => r.status !== "ok");
          const hasData = [result.home, result.away].some(
            (t) =>
              t &&
              (t.recentResults.length ||
                t.teamStatistics.length ||
                t.standing ||
                t.roster.length ||
                t.injuries.length ||
                t.previewStatistics?.length),
          );
          result.status = failed || partial || !hasData ? "partial" : "ok";
          for (const team of [result.home, result.away])
            if (team) {
              team.injuries = team.injuries.slice(0, 25);
              team.teamStatistics = team.teamStatistics.slice(0, 60);
            }
        } catch (error) {
          result.status = error instanceof FootballSourceError ? error.status : "unavailable";
          result.home = null;
          result.away = null;
        }
        return result;
      }),
    );
    const conflicts: string[] = [];
    // Scores stay source-separated. Compare only an exact dated, directed team pairing.
    const scores = new Map<string, string>();
    for (const p of providers)
      for (const team of [p.home, p.away])
        for (const g of team?.recentResults ?? []) {
          const identity = [
            footballEvidenceTeamKey(team!.name),
            footballEvidenceTeamKey(g.opponent),
            g.kickoffUtc,
            g.homeAway,
          ].join("|");
          const value = `${g.goalsFor}-${g.goalsAgainst}`,
            previous = scores.get(identity);
          if (previous && previous !== value && conflicts.length < 12)
            conflicts.push(
              `Διαφωνία σκορ: ${team!.name} – ${g.opponent}, ${g.kickoffUtc}. Δεν συγχωνεύτηκαν οι τιμές.`,
            );
          scores.set(identity, value);
        }
    return footballProviderEvidenceSchema.parse({
      version: 1,
      collectedAtUtc,
      fixture: target,
      providers,
      conflicts,
    });
  })();
  if (!useCache) return task;
  bundleFlights.set(key, task);
  try {
    const data = await task;
    if (bundleCache.size >= 16) bundleCache.delete(bundleCache.keys().next().value!);
    if (generation === credentialGeneration) bundleCache.set(key, { until: now() + 600000, data });
    return structuredClone(data);
  } finally {
    if (bundleFlights.get(key) === task) bundleFlights.delete(key);
  }
}
