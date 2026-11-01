import { fetchFootballWeek } from "./football-fixtures.server";
import type { FootballFixture, FootballLeagueId } from "./football-research.shared";
import { footballWeekBounds } from "./football-fixtures.server";

/**
 * Small process-local cache for the private, read-only fixture feed.
 * Does not guarantee cross-instance quota enforcement. No credentials stored.
 */
const cache = new Map<string, { expiresAt: number; fixtures: FootballFixture[] }>();
const inFlight = new Map<string, Promise<FootballFixture[]>>();
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 48;

export async function getCachedFootballWeek(
  leagueId: FootballLeagueId,
  date: string,
  loader: typeof fetchFootballWeek = fetchFootballWeek,
  now: () => number = Date.now,
): Promise<FootballFixture[]> {
  const { from } = footballWeekBounds(date);
  const key = `${leagueId}:${from}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.fixtures.map((f) => ({ ...f }));
  const pending = inFlight.get(key);
  if (pending) return (await pending).map((f) => ({ ...f }));
  const task = (async () => {
    const fixtures = await loader(leagueId, date);
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { fixtures: fixtures.map((f) => ({ ...f })), expiresAt: now() + TTL_MS });
    return fixtures;
  })();
  inFlight.set(key, task);
  try {
    return (await task).map((f) => ({ ...f }));
  } finally {
    if (inFlight.get(key) === task) inFlight.delete(key);
  }
}
