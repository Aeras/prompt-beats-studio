import { footballSourceJson, FootballSourceError } from "./football-source-http.server";
import { parseJoJLeagueDataset, matchJoJOdds } from "./football-odds-core";
import {
  bookmakerOddsSnapshotSchema,
  snapshotFromOdds,
  type BookmakerOddsSnapshot,
  type OddsTarget,
} from "./football-odds.shared";
const FILE = "site_pregame_stoiximan_soccer_leagues.json" as const;
/** Event-bearing leagues verified in the owner-supplied 2026-11-05 JoJ samples (not navigation catalogue). */
export const ARBPLAY_COMPETITIONS: Readonly<Record<string, readonly string[]>> = {
  "EN-PL": ["1"],
  "ES-LL": ["5"],
  "IT-SA": ["1635"],
  "DE-BL": ["216"],
  "FR-L1": ["215"],
  "GR-SL": ["1636"],
  "NL-ED": ["17067"],
  "PT-PL": ["17083"],
  "UEFA-CL": ["182748"],
  "UEFA-EL": ["182761"],
};
export type OddsJournal = {
  claim: (
    file: string,
  ) => Promise<{ status: string; token?: string; payload?: unknown; retrievedAtUtc?: string }>;
  finish: (
    token: string,
    payload: unknown | null,
    status: string,
    retryAfterMs: number,
  ) => Promise<void>;
};
export async function collectBookmakerOdds(
  target: OddsTarget,
  options: {
    env?: Record<string, string | undefined>;
    journal?: OddsJournal;
    fetcher?: typeof fetch;
    now?: () => number;
    file?: "site_pregame_stoiximan_soccer_leagues.json" | "site_pregame_stoiximan_soccer.json";
  } = {},
): Promise<BookmakerOddsSnapshot> {
  const env = options.env ?? process.env,
    now = options.now ?? Date.now;
  const file = options.file ?? FILE;
  const empty = (status: BookmakerOddsSnapshot["status"], notes: string[] = []) =>
    bookmakerOddsSnapshotSchema.parse({
      version: 1,
      provider: "arbplay-stoiximan",
      status,
      fixture: target,
      retrievedAtUtc: new Date(now()).toISOString(),
      sourceFiles: [],
      quotes: [],
      notes,
    });
  if (
    !["site_pregame_stoiximan_soccer_leagues.json", "site_pregame_stoiximan_soccer.json"].includes(
      file,
    )
  )
    return empty("invalid_response");
  if (!env["ARBPLAY_API_KEY"]?.trim() || env["ARBPLAY_ENABLED"] === "false")
    return empty("not_configured");
  if (!ARBPLAY_COMPETITIONS[target.leagueId])
    return empty("missing", ["Δεν έχει επαληθευτεί αντιστοίχιση διοργάνωσης."]);
  if (Date.parse(target.kickoffUtc) <= now()) return empty("stale");
  let journal: OddsJournal | undefined;
  let token: string | undefined;
  let failure: BookmakerOddsSnapshot["status"] = "unavailable";
  try {
    journal = options.journal ?? (await databaseJournal());
    const claim = await journal.claim(file);
    if (claim.status !== "cached" && claim.status !== "claimed")
      return empty(
        claim.status === "quota_exhausted"
          ? "quota_exhausted"
          : claim.status === "rate_limited"
            ? "rate_limited"
            : "unavailable",
      );
    token = claim.token;
    let payload = claim.payload,
      retrievedAtUtc = claim.retrievedAtUtc;
    if (claim.status === "claimed") {
      if (!token) throw new Error("Missing reservation");
      payload = await footballSourceJson(new URL("https://stoiximan.jojapi.net/v1/data/" + file), {
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        maxBytes: 4_000_000,
        headers: { "X-JoJAPI-Key": env["ARBPLAY_API_KEY"]!.trim() },
      });
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as Record<string, unknown>)["file"] !== file
      )
        throw new Error("Wrong feed");
      failure = "invalid_response";
      parseJoJLeagueDataset(payload); // validate before caching; no raw feed delivered to browser
      retrievedAtUtc = new Date(now()).toISOString();
      failure = "unavailable";
      await journal.finish(token, payload, "ok", 0);
      token = undefined;
    }
    failure = "invalid_response";
    if (
      !retrievedAtUtc ||
      !Number.isFinite(Date.parse(retrievedAtUtc)) ||
      !payload ||
      typeof payload !== "object" ||
      (payload as Record<string, unknown>)["file"] !== file
    )
      throw new Error("Invalid cache receipt");
    const candidates = parseJoJLeagueDataset(payload);
    const match = matchJoJOdds(
      {
        leagueId: target.leagueId,
        home: target.homeTeam,
        away: target.awayTeam,
        kickoffUtc: target.kickoffUtc,
      },
      candidates,
      ARBPLAY_COMPETITIONS,
    );
    if (match.status !== "matched") return empty(match.status);
    return snapshotFromOdds(
      target,
      match.fixture,
      retrievedAtUtc ?? new Date(now()).toISOString(),
      [file],
    );
  } catch (e) {
    const status = e instanceof FootballSourceError ? e.status : failure;
    if (token && journal)
      await journal
        .finish(token, null, status, e instanceof FootballSourceError ? e.retryAfterMs : 0)
        .catch(() => undefined);
    return empty(
      ["rate_limited", "access_denied", "timeout", "too_large", "invalid_response"].includes(status)
        ? (status as
            "rate_limited" | "access_denied" | "timeout" | "too_large" | "invalid_response")
        : "unavailable",
    );
  }
}
async function databaseJournal(): Promise<OddsJournal> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    claim: async (file) => {
      const r = await supabaseAdmin.rpc(
        "claim_private_football_odds_feed" as never,
        { _file: file } as never,
      );
      if (r.error) throw new Error("Odds journal unavailable");
      return r.data as unknown as Awaited<ReturnType<OddsJournal["claim"]>>;
    },
    finish: async (token, payload, status, retryAfterMs) => {
      const r = await supabaseAdmin.rpc(
        "finish_private_football_odds_feed" as never,
        {
          _token: token,
          _payload: payload,
          _status: status,
          _retry_after_ms: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, retryAfterMs)),
        } as never,
      );
      if (r.error) throw new Error("Odds checkpoint unavailable");
    },
  };
}

/** Two complementary files. Never combine inconsistent prices or attach a different fixture. */
export async function collectFootballBookmakerOdds(
  target: OddsTarget,
  options: Parameters<typeof collectBookmakerOdds>[1] = {},
) {
  const long = await collectBookmakerOdds(target, options);
  const near = await collectBookmakerOdds(target, {
    ...options,
    file: "site_pregame_stoiximan_soccer.json",
  });
  if (near.status !== "matched")
    return { ...long, notes: [...long.notes, `Πρόσθετη πηγή soccer: ${near.status}`] };
  if (long.status !== "matched")
    return { ...near, notes: [...near.notes, `Πηγή soccer_leagues: ${long.status}`] };
  if (long.providerFixtureId !== near.providerFixtureId)
    return {
      ...long,
      status: "conflict" as const,
      quotes: [],
      notes: [...long.notes, "Τα δύο αρχεία διαφωνούν στην ταυτότητα αγώνα."],
    };
  const [newer, older] =
    Date.parse(near.observedAtUtc!) >= Date.parse(long.observedAtUtc!)
      ? [near, long]
      : [long, near];
  // Whole groups are chosen from the newer file; additional groups keep their own original timestamps.
  const quotes = [
    ...newer.quotes,
    ...older.quotes.filter((q) => !newer.quotes.some((n) => n.market === q.market)),
  ];
  const retrievedAtUtc = new Date(
    Math.max(Date.parse(long.retrievedAtUtc), Date.parse(near.retrievedAtUtc)),
  ).toISOString();
  const expired =
    Date.parse(retrievedAtUtc) >= Date.parse(target.kickoffUtc) ||
    quotes.some((q) => Date.parse(retrievedAtUtc) - Date.parse(q.observedAtUtc) > 15 * 60000);
  return bookmakerOddsSnapshotSchema.parse({
    ...newer,
    retrievedAtUtc,
    status: expired ? "stale" : "matched",
    quotes: expired ? [] : quotes,
    sourceFiles: [...new Set([...newer.sourceFiles, ...older.sourceFiles])],
    observedAtUtc: older.observedAtUtc,
    notes: [
      ...newer.notes,
      "Οι συμπληρωματικές αγορές διατηρούν τον δικό τους χρόνο αρχείου· κοινές αγορές χρησιμοποιούν τη νεότερη πλήρη ομάδα.",
    ],
  });
}
