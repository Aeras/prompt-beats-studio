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
  /** Read-only: never reserves a provider request. */
  read?: (file: string) => Promise<{ status: string; payload?: unknown; retrievedAtUtc?: string }>;
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
    cacheOnly?: boolean;
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
  let stage = "journal_claim";
  try {
    journal = options.journal ?? (await databaseJournal());
    let claim: Awaited<ReturnType<OddsJournal["claim"]>> = options.cacheOnly
      ? ((await journal.read?.(file)) ?? { status: "unavailable" })
      : await journal.claim(file);
    if (claim.status === "busy" && journal.read) claim = await journal.read(file);

    if (claim.status !== "cached" && claim.status !== "claimed")
      return empty(
        claim.status === "quota_exhausted"
          ? "quota_exhausted"
          : claim.status === "rate_limited"
            ? "rate_limited"
            : ["busy", "recovery_pending", "stale"].includes(claim.status)
              ? (claim.status as "busy" | "recovery_pending" | "stale")
              : "unavailable",
      );
    token = claim.token;
    let payload = claim.payload,
      retrievedAtUtc = claim.retrievedAtUtc;
    if (claim.status === "claimed") {
      if (!token) throw new Error("Missing reservation");
      stage = "source_request";
      payload = await footballSourceJson(new URL("https://stoiximan.jojapi.net/v1/data/" + file), {
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        maxBytes: 4_000_000,
        headers: { "X-JoJAPI-Key": env["ARBPLAY_API_KEY"]!.trim() },
      });
      stage = "source_validation";
      failure = "invalid_response";
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as Record<string, unknown>)["file"] !== file
      )
        throw new Error("Wrong feed");
      parseJoJLeagueDataset(payload); // validate before caching; no raw feed delivered to browser
      retrievedAtUtc = new Date(now()).toISOString();
      failure = "unavailable";
      stage = "journal_receipt";
      const receiptToken = token;
      token = undefined; // An uncertain receipt is NEVER overwritten with a failure.
      try {
        await journal.finish(receiptToken, payload, "ok", 0);
      } catch {
        console.warn("[football-odds]", { file, stage, status: "recovery_pending" });
        // A committed receipt with a lost acknowledgement is recoverable without another GET.
        const recovered = await journal.read?.(file);
        if (recovered?.status !== "cached") return empty("recovery_pending");
        payload = recovered.payload;
        retrievedAtUtc = recovered.retrievedAtUtc;
      }
    }
    stage = "cache_validation";
    failure = "invalid_response";
    if (
      !retrievedAtUtc ||
      !Number.isFinite(Date.parse(retrievedAtUtc)) ||
      !payload ||
      typeof payload !== "object" ||
      (payload as Record<string, unknown>)["file"] !== file
    )
      throw new Error("Invalid cache receipt");
    const retrieved = Date.parse(retrievedAtUtc);
    const observed = Date.parse((payload as Record<string, unknown>)["updated_at"] as string);
    if (
      retrieved > now() ||
      now() - retrieved >= 15 * 60000 ||
      !Number.isFinite(observed) ||
      observed > retrieved ||
      now() - observed > 15 * 60000
    )
      return empty("stale");
    const candidates = parseJoJLeagueDataset(payload);
    stage = "fixture_matching";
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
    console.warn("[football-odds]", { file, stage, status });
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
    read: async (file) => {
      const r = await supabaseAdmin
        .rpc("read_private_football_odds_feed" as never, { _file: file } as never)
        .abortSignal(AbortSignal.timeout(8000));
      if (r.error) throw new Error("Odds recovery unavailable");
      return r.data as unknown as Awaited<ReturnType<NonNullable<OddsJournal["read"]>>>;
    },
    claim: async (file) => {
      const r = await supabaseAdmin
        .rpc("claim_private_football_odds_feed" as never, { _file: file } as never)
        .abortSignal(AbortSignal.timeout(8000));
      if (r.error) throw new Error("Odds journal unavailable");
      return r.data as unknown as Awaited<ReturnType<OddsJournal["claim"]>>;
    },
    finish: async (token, payload, status, retryAfterMs) => {
      const r = await supabaseAdmin
        .rpc(
          "finish_private_football_odds_feed" as never,
          {
            _token: token,
            _payload: payload,
            _status: status,
            _retry_after_ms: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, retryAfterMs)),
          } as never,
        )
        .abortSignal(AbortSignal.timeout(8000));
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
  const feedStatuses = [
    { file: FILE, status: long.status },
    { file: "site_pregame_stoiximan_soccer.json" as const, status: near.status },
  ];
  if (long.status === "missing" && near.status !== "missing" && near.status !== "matched")
    return { ...near, feedStatuses, notes: [...near.notes, "Πηγή soccer_leagues: missing"] };
  if (near.status !== "matched")
    return {
      ...long,
      feedStatuses,
      notes: [...long.notes, `Πρόσθετη πηγή soccer: ${near.status}`],
    };
  if (long.status !== "matched")
    return { ...near, feedStatuses, notes: [...near.notes, `Πηγή soccer_leagues: ${long.status}`] };
  if (long.providerFixtureId !== near.providerFixtureId)
    return {
      ...long,
      feedStatuses,
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
    feedStatuses,
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
