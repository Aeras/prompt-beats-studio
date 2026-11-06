import { z } from "zod";
import { footballTeamRegistry, normalizeFootballTeamName } from "./football-team-registry.shared";
import { oddsTargetSchema, type OddsTarget } from "./football-odds.shared";

const period = z.enum(["FT", "HT"]);
const leafSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("1x2"), period, selection: z.enum(["1", "X", "2"]) }).strict(),
  z.object({ kind: z.literal("dc"), period, selection: z.enum(["1X", "X2", "12"]) }).strict(),
  z
    .object({
      kind: z.literal("total"),
      period,
      selection: z.enum(["over", "under"]),
      line: z.number().min(0).max(20).multipleOf(0.5),
    })
    .strict(),
  z.object({ kind: z.literal("btts"), period, selection: z.enum(["yes", "no"]) }).strict(),
  z
    .object({
      kind: z.literal("htft"),
      half: z.enum(["1", "X", "2"]),
      full: z.enum(["1", "X", "2"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("score"),
      period,
      home: z.number().int().min(0).max(15),
      away: z.number().int().min(0).max(15),
    })
    .strict(),
]);
export const descriptiveMarketSchema = z.union([
  leafSchema,
  z.object({ kind: z.literal("and"), legs: z.tuple([leafSchema, leafSchema]) }).strict(),
  z.object({ kind: z.literal("other"), label: z.string().min(1).max(140) }).strict(),
]);
export type DescriptiveMarket = z.infer<typeof descriptiveMarketSchema>;
export const bindingCodes = [
  "home_missing",
  "away_missing",
  "same_team",
  "venue_unknown",
  "reversed_venue",
  "date_missing",
  "date_conflict",
  "competition_missing",
  "competition_conflict",
  "qualified_team",
  "multi_fixture",
  "timestamp_conflict",
  "after_kickoff",
  "truncated_context",
] as const;
export const fixtureTraceSchema = z
  .object({
    status: z.enum(["verified", "probable", "ambiguous", "rejected"]),
    failures: z.array(z.enum(bindingCodes)).max(16),
    firstFailure: z.enum(bindingCodes).nullable(),
    timezone: z.string().nullable(),
    localDate: z.string().nullable(),
    homeAliases: z.array(z.string().max(200)).max(30),
    awayAliases: z.array(z.string().max(200)).max(30),
  })
  .strict();
const zones: Record<string, string> = {
  "IT-SA": "Europe/Rome",
  "GR-SL": "Europe/Athens",
  "EN-PL": "Europe/London",
  "ES-LL": "Europe/Madrid",
  "DE-BL": "Europe/Berlin",
  "FR-L1": "Europe/Paris",
  "NL-ED": "Europe/Amsterdam",
  "PT-PL": "Europe/Lisbon",
};
const competitions: Record<string, string[]> = {
  "IT-SA": ["serie a", "σεριε α", "серия а"],
  "GR-SL": ["super league", "σουπερ λιγκ", "суперлига"],
  "EN-PL": ["premier league", "πρεμιερ λιγκ", "апл"],
  "ES-LL": ["la liga", "laliga", "λα λιγκα", "ла лига"],
  "DE-BL": ["bundesliga", "μπουντεσλιγκα", "бундеслига"],
  "FR-L1": ["ligue 1", "λιγκ 1", "лига 1"],
  "UEFA-CL": ["champions league", "τσαμπιονς λιγκ", "лига чемпионов"],
  "UEFA-EL": ["europa league", "γιουροπα λιγκ", "лига европы"],
};
const n = (s: string) => normalizeFootballTeamName(s).normalize("NFD").replace(/\p{M}/gu, "");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, value: string) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(value)}(?![\\p{L}\\p{N}])`, "u").test(text);
export function evidenceTeamAliases(name: string) {
  const r = footballTeamRegistry.resolve(name);
  return [
    ...new Set(
      (r.status === "matched" ? [r.team.name, r.team.nameEl, ...r.team.aliases] : [name]).map(n),
    ),
  ].slice(0, 30);
}
export function fixtureLocalDate(f: OddsTarget) {
  const home = normalizeFootballTeamName(f.homeTeam);
  const timezone = /las palmas|tenerife|santa clara/u.test(home) ? undefined : zones[f.leagueId];
  if (!timezone || !Number.isFinite(Date.parse(f.kickoffUtc)))
    return { timezone: null, date: null };
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(f.kickoffUtc));
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return { timezone, date: `${get("year")}-${get("month")}-${get("day")}` };
}
const monthNames = [
  "january|jan|ιανουαριου|января",
  "february|feb|φεβρουαριου|февраля",
  "march|mar|μαρτιου|марта",
  "april|apr|απριλιου|апреля",
  "may|μαιου|мая",
  "june|jun|ιουνιου|июня",
  "july|jul|ιουλιου|июля",
  "august|aug|αυγουστου|августа",
  "september|sep|sept|σεπτεμβριου|сентября",
  "october|oct|οκτωβριου|октября",
  "november|nov|νοεμβριου|ноября",
  "december|dec|δεκεμβριου|декабря",
];
function explicitDates(text: string) {
  const dates = [...text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})(?![\dTt])/gu)].map(
    (m) => `${m[1]}-${m[2]}-${m[3]}`,
  );
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})[tT]/gu))
    dates.push(`${m[1]}-${m[2]}-${m[3]}`);
  monthNames.forEach((names, i) => {
    for (const m of text.matchAll(
      new RegExp(`(?:^|[^\\p{L}\\p{N}])(\\d{1,2})\\s+(?:${names})\\s+(20\\d{2})(?!\\d)`, "gu"),
    ))
      dates.push(`${m[2]}-${String(i + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
    for (const m of text.matchAll(
      new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${names})\\s+(\\d{1,2}),?\\s+(20\\d{2})(?!\\d)`, "gu"),
    ))
      dates.push(`${m[2]}-${String(i + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  });
  return [...new Set(dates)];
}
/** All predicates are evaluated; title and URL are deliberately not fixture proof. */
export function traceFootballFixture(
  text: string,
  f: OddsTarget,
  cutoff: string,
  options: { truncated?: boolean } = {},
) {
  // Explicit publication/byline rows are not fixture kickoff declarations.
  const fixtureContext = text
    .split("\n")
    .filter(
      (line) =>
        !/min read|minute read|published|last updated|δημοσιεύ|обновлен|опубликован/iu.test(line),
    )
    .join("\n");
  const t = n(fixtureContext),
    home = evidenceTeamAliases(f.homeTeam),
    away = evidenceTeamAliases(f.awayTeam);
  const failures: z.infer<typeof fixtureTraceSchema>["failures"] = [];
  const add = (code: (typeof bindingCodes)[number], bad: boolean) => {
    if (bad) failures.push(code);
  };
  const local = fixtureLocalDate(f);
  add("home_missing", !home.some((a) => has(t, a)));
  add("away_missing", !away.some((a) => has(t, a)));
  add(
    "same_team",
    home.some((a) => away.includes(a)),
  );
  const pair = (h: string, a: string) =>
    new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${esc(h)}\\s+(?:vs\\.?|v\\.?|–|—|-|φιλοξενει|hosts)\\s+${esc(a)}(?=$|[^\\p{L}\\p{N}])`,
      "u",
    ).test(t);
  const at = (a: string, h: string) =>
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(a)}\\s+at\\s+${esc(h)}(?=$|[^\\p{L}\\p{N}])`, "u").test(
      t,
    );
  const forward = home.some((h) => away.some((a) => pair(h, a) || at(a, h))),
    reversed = home.some((h) => away.some((a) => pair(a, h) || at(h, a)));
  add("venue_unknown", !forward && !reversed);
  add("reversed_venue", reversed);
  const dates = explicitDates(t);
  add("date_missing", !dates.length || !local.date);
  add("date_conflict", !!local.date && dates.some((d) => d !== local.date));
  const kickDate = new Date(f.kickoffUtc);
  const seasonStart = kickDate.getUTCFullYear() - (kickDate.getUTCMonth() < 6 ? 1 : 0);
  const editionMismatch = [...t.matchAll(/\b(20\d{2})[/-](20\d{2}|\d{2})(?![-\d])/gu)].some(
    (m) =>
      Number(m[1]) !== seasonStart ||
      Number(m[2]) !== (m[2]!.length === 2 ? (seasonStart + 1) % 100 : seasonStart + 1),
  );
  const targetNames = competitions[f.leagueId] ?? [f.leagueId.toLowerCase()];
  add("competition_missing", !targetNames.some((a) => has(t, n(a))));
  add(
    "competition_conflict",
    editionMismatch ||
      Object.entries(competitions).some(
        ([id, names]) => id !== f.leagueId && names.some((a) => has(t, n(a))),
      ) ||
      /serie b|premier league 2(?!\d)|2\.? bundesliga|super league 2(?!\d)|la liga 2(?!\d)/u.test(
        t,
      ),
  );
  add(
    "qualified_team",
    /\b(?:u[-\s]?\d{2}|under[-\s]?\d{2}|women|womens|ladies|reserves|youth|femminile)\b|женщ|γυναικ/u.test(
      t,
    ) ||
      [...home, ...away].some((a) =>
        new RegExp(`${esc(a)}\\s+(?:ii|b)(?![\\p{L}\\p{N}])`, "u").test(t),
      ),
  );
  const pairMarkers = [...t.matchAll(/\s(?:vs\.?|v\.?|hosts)\s/gu)];
  add(
    "multi_fixture",
    pairMarkers.some((m) => {
      const left = t.slice(Math.max(0, m.index! - 120), m.index!).trim(),
        right = t.slice(m.index! + m[0].length, m.index! + m[0].length + 120).trim();
      return !home.some((h) =>
        away.some(
          (a) =>
            (left.endsWith(h) && right.startsWith(a)) || (left.endsWith(a) && right.startsWith(h)),
        ),
      );
    }),
  );
  const timestamps = [
    ...fixtureContext.matchAll(
      /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})\b/gu,
    ),
  ];
  const zoned = [
    ...t.matchAll(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(utc|gmt|cet|cest|eet|eest|bst)\b/gu),
  ];
  const offsets: Record<string, number> = {
    utc: 0,
    gmt: 0,
    cet: 60,
    cest: 120,
    eet: 120,
    eest: 180,
    bst: 60,
  };
  const localClock = local.timezone
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: local.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(f.kickoffUtc))
    : null;
  const naiveKickoffs = [
    ...t.matchAll(
      /(?:kickoff|kick-off|ωρα|начало|20\d{2}-\d{2}-\d{2}[ T]?)\s*:?\s*(\d{1,2}):(\d{2})(?::\d{2})?(?![\d:])(?!\s*(?:utc|gmt|cet|cest|eet|eest|bst))/gu,
    ),
  ];
  add(
    "timestamp_conflict",
    naiveKickoffs.some((m) => `${m[1]!.padStart(2, "0")}:${m[2]}` !== localClock) ||
      timestamps.some((m) => Date.parse(m[0]) !== Date.parse(f.kickoffUtc)) ||
      zoned.some(
        (m) =>
          !local.date ||
          new Date(`${local.date}T${m[1]!.padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}Z`).getTime() -
            offsets[m[4]!]! * 60000 !==
            Date.parse(f.kickoffUtc),
      ),
  );
  add(
    "after_kickoff",
    !Number.isFinite(Date.parse(cutoff)) || Date.parse(cutoff) >= Date.parse(f.kickoffUtc),
  );
  add("truncated_context", !!options.truncated);
  const uncertain = new Set([
    "date_missing",
    "competition_missing",
    "venue_unknown",
    "truncated_context",
  ]);
  const rejected = failures.some((v) => !uncertain.has(v));
  return fixtureTraceSchema.parse({
    status: rejected
      ? "rejected"
      : failures.length
        ? failures.includes("venue_unknown")
          ? "ambiguous"
          : "probable"
        : "verified",
    failures,
    firstFailure: failures[0] ?? null,
    timezone: local.timezone,
    localDate: local.date,
    homeAliases: home,
    awayAliases: away,
  });
}
/** Unicode folding is confined to market tokens; club/source strings are never rewritten. */
function token(value: string) {
  return n(value)
    .replace(/[χх]/g, "x")
    .replace(/,/g, ".")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseAuthoredMarket(value: string): DescriptiveMarket {
  const t = token(value).replace(/[.!]$/u, "");
  const combo = t.split(/\s+(?:&|and|και|и)\s+/u);
  if (combo.length === 2) {
    const legs = combo.map(parseAuthoredMarket);
    if (legs.every((l) => l.kind !== "other" && l.kind !== "and"))
      return descriptiveMarketSchema.parse({ kind: "and", legs });
  }
  const htft = t.match(/^([1x2])\s*\/\s*([1x2])$/u);
  if (htft)
    return descriptiveMarketSchema.parse({
      kind: "htft",
      half: htft[1]!.toUpperCase(),
      full: htft[2]!.toUpperCase(),
    });
  const p = /^(?:ht|first half|1st half|ημιχρονο|1-и таим)\s+/u.test(t) ? "HT" : "FT";
  const s = t.replace(/^(?:ft|full time|ht|first half|1st half|ημιχρονο|1-и таим)\s+/u, "");
  const selection = (
    {
      "1": "1",
      "home win": "1",
      п1: "1",
      x: "X",
      draw: "X",
      ισοπαλια: "X",
      "2": "2",
      "away win": "2",
      п2: "2",
    } as Record<string, string>
  )[s];
  if (selection) return descriptiveMarketSchema.parse({ kind: "1x2", period: p, selection });
  if (["1x", "x2", "12"].includes(s))
    return descriptiveMarketSchema.parse({ kind: "dc", period: p, selection: s.toUpperCase() });
  const total = s.match(
    /^(over|under|тб|тм|тотал больше|тотал меньше)\s*\(?([0-9]{1,2}(?:\.5|\.0)?)\)?(?:\s+goals)?$/u,
  );
  if (total && Number(total[2]) <= 20 && Number(total[2]) % 1 === 0.5)
    return descriptiveMarketSchema.parse({
      kind: "total",
      period: p,
      selection: /^(over|тб|тотал больше)$/u.test(total[1]!) ? "over" : "under",
      line: Number(total[2]),
    });
  if (
    /^(?:gg|btts(?: yes)?|both teams to score(?: yes)?|оз\s*-?\s*да|обе забьют\s*-?\s*да)$/u.test(s)
  )
    return { kind: "btts", period: p, selection: "yes" };
  if (/^(?:ng|btts no|both teams to score no|оз\s*-?\s*нет|обе забьют\s*-?\s*нет)$/u.test(s))
    return { kind: "btts", period: p, selection: "no" };
  const score = s.match(/^(?:correct score|ακριβες σκορ|точныи счет)\s*(\d{1,2})-(\d{1,2})$/u);
  if (score && Number(score[1]) <= 15 && Number(score[2]) <= 15)
    return { kind: "score", period: p, home: Number(score[1]), away: Number(score[2]) };
  return { kind: "other", label: value.slice(0, 140) || "unmapped" };
}
export function descriptiveMarketKey(m: DescriptiveMarket): string {
  if (m.kind === "and") return `AND(${m.legs.map(descriptiveMarketKey).sort().join(",")})`;
  if (m.kind === "other") return `other:${m.label}`;
  if (m.kind === "htft") return `HTFT:${m.half}/${m.full}`;
  if (m.kind === "score") return `${m.period}:score:${m.home}-${m.away}`;
  return `${m.period}:${m.kind}:${m.kind === "total" ? m.line + ":" : ""}${m.selection}`;
}
export function descriptiveMarketFamily(m: DescriptiveMarket): string {
  if (m.kind === "and" || m.kind === "other") return descriptiveMarketKey(m);
  if (m.kind === "htft") return "HTFT";
  return `${m.period}:${m.kind}${m.kind === "total" ? ":" + m.line : ""}`;
}
export function detectArticleLanguage(text: string): "el" | "en" | "ru" | "unknown" {
  const counts = [
    (text.match(/\p{Script=Greek}/gu) ?? []).length,
    (text.match(/\p{Script=Cyrillic}/gu) ?? []).length,
    (text.match(/[a-z]/gi) ?? []).length,
  ];
  const best = Math.max(...counts);
  return best < 15 ? "unknown" : counts[0] === best ? "el" : counts[1] === best ? "ru" : "en";
}
export type LiteralPick = {
  quote: string;
  start: number;
  end: number;
  market: DescriptiveMarket;
  stance: "authored" | "unsafe" | "unmapped";
  reasons: string[];
};
/** Sentence-level stance. No inference from odds, results, headlines or score predictions. */
export function extractLiteralPicks(text: string, fixture?: OddsTarget): LiteralPick[] {
  const result: LiteralPick[] = [];
  const pattern =
    /(?:^|[\n.!?;]\s*)([^\n.!?;]{0,450}(?:prediction|pick|tip|we predict|we recommend|our selection|we back|we expect|πιστεύουμε|наш выбор|πρόβλεψη|επιλογή|προτείνουμε|προγνωστικό|прогноз|ставка|рекомендуем)[^\n!?;]{0,450})/giu;
  for (const match of text.matchAll(pattern)) {
    const quote = match[1]!.trim(),
      start = match.index! + match[0].indexOf(quote);
    if (quote.length > 900) continue;
    const marker = quote.match(
      /(?:prediction|pick|tip|we predict|we recommend|our selection|we back|we expect|πιστεύουμε|наш выбор|πρόβλεψη|επιλογή|προτείνουμε|προγνωστικό|прогноз|ставка|рекомендуем)\s*(?::|[-–—]|is|είναι|на матч)?\s*(.+)$/iu,
    );
    if (!marker) continue;
    const value = marker[1]!
      .split(/(?:\s+because\b|\s+as\b|\s+γιατι\b|\s+επειδη\b|\s+потому\b)/iu)[0]!
      .trim()
      .replace(/\.$/, "");
    let market = parseAuthoredMarket(value);
    if (fixture && market.kind === "other") {
      const v = n(value);
      for (const [name, selection] of [
        [fixture.homeTeam, "1"],
        [fixture.awayTeam, "2"],
      ] as const)
        if (evidenceTeamAliases(name).some((a) => v === a + " to win" || v === a + " wins"))
          market = { kind: "1x2", period: "FT", selection };
    }
    const reasons: string[] = [];
    const precedingContext = text.slice(Math.max(0, start - 240), start);
    if (
      /odds table|bookmaker odds|decimal odds|historical results|last match result|do not follow|ignore (?:all |previous )?instructions|system prompt|αποδόσεις πίνακα|ιστορικά αποτελέσματα|коэффициенты|прошлые результаты/iu.test(
        precedingContext,
      )
    )
      reasons.push("unsafe_context");
    if (
      /\b(?:not|avoid|perhaps|maybe|might|if|conditional|odds|bookmaker|historical|last match|according to|courtesy|republished|syndicated)\b|\d+\.\d+\s*odds|δεν|όχι|ίσως|σύμφωνα με|не\s|возможно|коэффициент|по данным|ранее/iu.test(
        quote,
      )
    )
      reasons.push("unsafe_stance");
    if (
      /\b(?:ignore|instructions|system prompt|guaranteed|positive expected value)\b|\+ev/iu.test(
        quote,
      )
    )
      reasons.push("untrusted_instruction");
    if (market.kind === "other") reasons.push("unmapped_market");
    result.push({
      quote,
      start,
      end: start + quote.length,
      market,
      stance: reasons.some((v) => v !== "unmapped_market")
        ? "unsafe"
        : market.kind === "other"
          ? "unmapped"
          : "authored",
      reasons,
    });
    if (result.length >= 24) break;
  }
  return result;
}
const uncheckedClaimLedgerSchema = z
  .object({
    version: z.literal(2),
    fixture: oddsTargetSchema,
    profile: z.literal("legacy-3"),
    cutoff: z.string().datetime(),
    queries: z
      .array(
        z
          .object({
            query: z.string().max(2000),
            language: z.enum(["el", "en", "ru", "mixed", "unknown"]),
            intent: z.enum(["match_facts", "external_forecasts"]),
          })
          .strict(),
      )
      .max(5),
    sources: z
      .array(
        z
          .object({
            url: z.string().url().max(2000),
            title: z.string().max(180),
            accessedAt: z.string().datetime(),
            publishedAtUtc: z.string().datetime().optional(),
            publicationOrigin: z.enum(["unknown", "search_provider"]),
            queryLanguage: z.enum(["el", "en", "ru", "mixed", "unknown"]),
            detectedLanguage: z.enum(["el", "en", "ru", "unknown"]),
            contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
            representation: z.literal("football-clean-v2"),
            availableChars: z.number().int().max(24000),
            truncated: z.boolean(),
            windows: z
              .array(
                z
                  .object({
                    start: z.number().int().nonnegative(),
                    end: z.number().int().nonnegative(),
                    text: z.string().max(2000),
                  })
                  .strict(),
              )
              .max(6),
            origin: z.string().max(100).nullable(),
            originStatus: z.enum([
              "reviewed",
              "independence_unknown",
              "community",
              "attributed",
              "copy",
            ]),
            trace: fixtureTraceSchema,
            claimDetection: z.enum(["authored", "unsafe", "unmapped", "none"]),
            omittedClaims: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(18),
    claims: z
      .array(
        z
          .object({
            sourceIndex: z.number().int().min(0).max(17),
            quote: z.string().max(900),
            start: z.number().int().nonnegative(),
            end: z.number().int().nonnegative(),
            sectionStart: z.number().int().nonnegative(),
            sectionEnd: z.number().int().nonnegative(),
            market: descriptiveMarketSchema,
            stance: z.enum(["authored", "unsafe", "unmapped"]),
            trace: fixtureTraceSchema,
            countable: z.boolean(),
            reasons: z.array(z.string().max(60)).max(20),
          })
          .strict(),
      )
      .max(216),
    groups: z
      .array(
        z
          .object({
            family: z.string().max(200),
            eligibleOrigins: z.number().int().min(0).max(18),
            conflictingOrigins: z.number().int().min(0).max(18),
            support: z
              .array(
                z
                  .object({ market: z.string().max(200), votes: z.number().int().min(1).max(18) })
                  .strict(),
              )
              .max(18),
          })
          .strict(),
      )
      .max(40),
    sourceCount: z.number().int().min(0).max(18),
  })
  .strict();
export const claimLedgerSchema = uncheckedClaimLedgerSchema.superRefine((data, ctx) => {
  for (const [index, claim] of data.claims.entries()) {
    const source = data.sources[claim.sourceIndex];
    const exact = source?.windows.some(
      (w) =>
        claim.start >= w.start &&
        claim.end <= w.end &&
        w.text.slice(claim.start - w.start, claim.end - w.start) === claim.quote,
    );
    if (
      !source ||
      claim.end - claim.start !== claim.quote.length ||
      claim.sectionStart > claim.start ||
      claim.sectionEnd < claim.end ||
      claim.end > source.availableChars ||
      (claim.countable &&
        (!exact ||
          claim.trace.status !== "verified" ||
          claim.stance !== "authored" ||
          source.originStatus !== "reviewed" ||
          !source.origin ||
          claim.reasons.length))
    )
      ctx.addIssue({
        code: "custom",
        path: ["claims", index],
        message: "Claim provenance or eligibility mismatch",
      });
  }
  for (const [i, s] of data.sources.entries())
    if (s.windows.some((w) => w.end - w.start !== w.text.length || w.end > s.availableChars))
      ctx.addIssue({ code: "custom", path: ["sources", i], message: "Window offset mismatch" });
});
export type FootballClaimLedger = z.infer<typeof claimLedgerSchema>;

/** Whole-claim selection, never quotation truncation. Fixed additional prompt envelope. */
export function footballV2SynthesisBrief(ledger: FootballClaimLedger, maxChars = 8000) {
  const result: {
    version: 2;
    profile: "legacy-3";
    sourceCount: number;
    groups: FootballClaimLedger["groups"];
    claims: { url: string; market: DescriptiveMarket; quote: string; stance: "authored" }[];
    omittedGroups: number;
    omittedClaims: number;
  } = {
    version: 2,
    profile: ledger.profile,
    sourceCount: ledger.sourceCount,
    groups: [],
    claims: [],
    omittedGroups: 0,
    omittedClaims: 0,
  };
  for (const group of ledger.groups) {
    result.groups.push(group);
    if (JSON.stringify(result).length > maxChars) {
      result.groups.pop();
      result.omittedGroups++;
    }
  }
  for (const claim of ledger.claims.filter((c) => c.countable)) {
    result.claims.push({
      url: ledger.sources[claim.sourceIndex]!.url,
      market: claim.market,
      quote: claim.quote,
      stance: "authored",
    });
    if (JSON.stringify(result).length > maxChars) {
      result.claims.pop();
      result.omittedClaims++;
    }
  }
  // Omitted-counter digit growth also belongs to the envelope.
  while (
    JSON.stringify(result).length > maxChars &&
    (result.claims.length || result.groups.length)
  ) {
    if (result.claims.length) {
      result.claims.pop();
      result.omittedClaims++;
    } else {
      result.groups.pop();
      result.omittedGroups++;
    }
  }
  return result;
}

/** Citation eligibility is separate from origin-vote eligibility; cutoff applies to both. */
export function footballV2EvidenceUrls(ledger: FootballClaimLedger): string[] {
  return ledger.sources
    .filter(
      (source, i) =>
        !source.trace.failures.includes("after_kickoff") &&
        (source.trace.status === "verified" ||
          ledger.claims.some((c) => c.sourceIndex === i && c.trace.status === "verified")),
    )
    .map((source) => source.url);
}

const evidenceSidecarSchema = z
  .object({
    kind: z.literal("football-online-evidence"),
    version: z.literal(2),
    payload: claimLedgerSchema,
  })
  .strict();
/** Persist V2 outside the strict V1 analysis object, atomically in its existing source JSON. */
export function packFootballEvidenceV2<
  T extends { onlineEvidenceV2?: FootballClaimLedger | undefined },
>(analysis: T, sources: readonly unknown[]) {
  const { onlineEvidenceV2, ...legacyAnalysis } = analysis;
  return {
    analysis: legacyAnalysis,
    sources: onlineEvidenceV2
      ? [
          ...sources,
          evidenceSidecarSchema.parse({
            kind: "football-online-evidence",
            version: 2,
            payload: onlineEvidenceV2,
          }),
        ]
      : [...sources],
  };
}
/** Owner filtering happens before this projection; fixture/cutoff must independently agree. */
export function readFootballEvidenceV2(
  sources: unknown,
  fixture: OddsTarget,
  cutoff: string | null,
): FootballClaimLedger | undefined {
  if (!Array.isArray(sources) || !cutoff || !Number.isFinite(Date.parse(cutoff))) return undefined;
  const metadata = sources.filter(
    (s) => s && typeof s === "object" && s.kind === "football-online-evidence",
  );
  if (metadata.length !== 1) return undefined;
  const checked = evidenceSidecarSchema.safeParse(metadata[0]);
  if (!checked.success) return undefined;
  const data = checked.data.payload,
    f = data.sources;
  if (
    data.fixture.leagueId !== fixture.leagueId ||
    data.fixture.homeTeam !== fixture.homeTeam ||
    data.fixture.awayTeam !== fixture.awayTeam ||
    Date.parse(data.fixture.kickoffUtc) !== Date.parse(fixture.kickoffUtc) ||
    Date.parse(data.cutoff) !== Date.parse(cutoff) ||
    f.some((s) => Date.parse(s.accessedAt) > Date.parse(cutoff))
  )
    return undefined;
  return data;
}
