import { createHash } from "node:crypto";
import { publisherFor } from "./football-prediction-consensus.shared";
import {
  claimLedgerSchema,
  traceFootballFixture,
  extractLiteralPicks,
  descriptiveMarketKey,
  descriptiveMarketFamily,
  detectArticleLanguage,
  type FootballClaimLedger,
} from "./football-evidence-v2.shared";
import type { OddsTarget } from "./football-odds.shared";
export type FootballEvidenceDocument = {
  title: string;
  url: string;
  accessedAt: string;
  publishedAtUtc?: string;
  text: string;
  truncated?: boolean;
  queryLanguage?: "el" | "en" | "ru" | "mixed" | "unknown";
};
export const canonicalFootballText = (text: string) =>
  text.replace(/\r\n?/g, "\n").split(String.fromCharCode(0)).join("");
function nearDuplicate(a: string, b: string) {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter(Boolean);
  const grams = (s: string) => {
    const w = words(s);
    return new Set(w.slice(0, -4).map((_, i) => w.slice(i, i + 5).join(" ")));
  };
  const x = grams(a),
    y = grams(b);
  return (
    Math.min(x.size, y.size) >= 12 &&
    [...x].filter((v) => y.has(v)).length / Math.min(x.size, y.size) >= 0.85
  );
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
/** Only an explicit single-match preview envelope may scope later editorial paragraphs.
 * Unstructured/multi-fixture material retains the original strict whole-section trace. */
function sections(text: string, f: OddsTarget, cutoff: string) {
  const headers = [...text.matchAll(/^#{1,4}\s+.+$/gm)].map((m) => m.index!);
  const starts = [...new Set([0, ...headers])].sort((a, b) => a - b);
  let establishedMetadata: string | undefined;
  return starts.map((start, i) => {
    const end = starts[i + 1] ?? text.length;
    const body = text.slice(start, end);
    const lines = body.split("\n");
    let boundary = 0;
    for (const line of lines) {
      if (boundary > 200 && line.length > 180 && !/prediction.*(?:20\d{2}|preview)/iu.test(line))
        break;
      boundary += line.length + 1;
      if (boundary >= 1800) break;
    }
    const metadata = body.slice(0, Math.min(boundary, 2000));
    const eligible =
      /(?:prediction and betting tips|prediction, preview|match preview and expert tips|προγνωστικά αγώνα|прогноз на матч|прогноз и ставка на)/iu.test(
        metadata,
      ) && traceFootballFixture(metadata, f, cutoff).status === "verified";
    // H2H, related fixtures and navigation cannot lend their dates/picks to this article.
    const footer = eligible
      ? body.search(
          /^(?:#{1,4}\s*)?(?:\|\s*»)?(?:head.to.head|now trending|most recent soccer picks|related (?:matches|predictions)|get all of today's)/imu,
        )
      : -1;
    const scoped = body.slice(0, footer < 0 ? undefined : footer);
    // Preserve explicit wrong-fixture headings even inside an otherwise relevant article.
    const foreignHeading = scoped
      .split("\n")
      .some(
        (line) =>
          line.length < 180 &&
          /\s(?:vs\.?|v\.?)\s/iu.test(line) &&
          traceFootballFixture(line, f, cutoff).failures.some((v) =>
            [
              "home_missing",
              "away_missing",
              "reversed_venue",
              "qualified_team",
              "competition_conflict",
              "date_conflict",
              "weekday_conflict",
              "timestamp_conflict",
            ].includes(v),
          ),
      );
    const standalone = traceFootballFixture(scoped, f, cutoff);
    const forecastSubsection =
      /^#{1,4}\s+(?:our\s+)?(?:predictions?|picks?|betting tips|προγνωστικά|πρόβλεψη|прогноз|наш выбор)(?:\s|:|$)/iu.test(
        scoped,
      );
    const contradictions = standalone.failures.some(
      (v) =>
        ![
          "home_missing",
          "away_missing",
          "venue_unknown",
          "date_missing",
          "competition_missing",
        ].includes(v),
    );
    const ownBinding =
      eligible &&
      !foreignHeading &&
      !standalone.failures.some((v) => v === "timestamp_conflict" || v === "weekday_conflict");
    const binding = ownBinding
      ? metadata
      : establishedMetadata && forecastSubsection && !contradictions && !foreignHeading
        ? establishedMetadata + "\n" + scoped
        : scoped;
    if (ownBinding) establishedMetadata = metadata;
    else if (!forecastSubsection || contradictions || foreignHeading)
      establishedMetadata = undefined;
    return {
      start,
      end: start + scoped.length,
      text: scoped,
      binding,
    };
  });
}
/** No full article persistence: exact windows, canonical digest and UTF-16 offsets only. */
export function buildFootballClaimLedger(
  f: OddsTarget,
  docs: readonly FootballEvidenceDocument[],
  cutoff: string,
  queries: FootballClaimLedger["queries"] = [],
  profile: FootballClaimLedger["profile"] = "legacy-3",
): FootballClaimLedger {
  const sources: FootballClaimLedger["sources"] = [],
    claims: FootballClaimLedger["claims"] = [];
  const seen = new Set<string>(),
    copies: { text: string; original: string; origin: string | null }[] = [];
  for (const doc of docs.slice(0, 25)) {
    let url: URL;
    try {
      url = new URL(doc.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        /^(\d|\[|localhost)/u.test(url.hostname) ||
        /\.(test|invalid|local|internal)$/u.test(url.hostname)
      )
        continue;
      url.hash = "";
    } catch {
      continue;
    }
    // Tracking URL variants never become independent documents.
    for (const k of [...url.searchParams.keys()])
      if (/^utm_|^(fbclid|gclid)$/u.test(k)) url.searchParams.delete(k);
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    if (!Number.isFinite(Date.parse(doc.accessedAt))) continue;
    const text = canonicalFootballText(doc.text).slice(0, 24000),
      sourceIndex = sources.length;
    const trace = traceFootballFixture(text, f, cutoff);
    if (
      Date.parse(doc.accessedAt) > Date.parse(cutoff) ||
      (doc.publishedAtUtc &&
        (Date.parse(doc.publishedAtUtc) > Date.parse(doc.accessedAt) ||
          Date.parse(doc.publishedAtUtc) >= Date.parse(f.kickoffUtc)))
    ) {
      trace.failures.push("after_kickoff");
      trace.firstFailure ??= "after_kickoff";
      trace.status = "rejected";
    }
    const p = publisherFor(url.href),
      community = /forum|community|reddit|comments|discussion/iu.test(url.hostname + url.pathname),
      attributed =
        /according to|republished|syndicated|courtesy of|originally published|σύμφωνα με|по данным/iu.test(
          text,
        );
    const fingerprint = text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[^\p{L}\p{N}]/gu, "");
    const copy = copies.find(
      (c) =>
        (c.text === fingerprint && fingerprint.length > 120) || nearDuplicate(c.original, text),
    );
    const origin = copy?.origin ?? p?.origin ?? null;
    const originStatus = community
      ? "community"
      : attributed
        ? "attributed"
        : copy
          ? "copy"
          : p
            ? "reviewed"
            : "independence_unknown";
    copies.push({ text: fingerprint, original: text, origin });
    const windows: FootballClaimLedger["sources"][number]["windows"] = [];
    const addWindow = (start: number, end: number) => {
      start = Math.max(0, start);
      end = Math.min(text.length, end, start + 2000);
      const overlapping = windows.find(
        (w) =>
          start <= w.end &&
          end >= w.start &&
          Math.max(end, w.end) - Math.min(start, w.start) <= 2000,
      );
      if (overlapping) {
        overlapping.start = Math.min(start, overlapping.start);
        overlapping.end = Math.max(end, overlapping.end);
        overlapping.text = text.slice(overlapping.start, overlapping.end);
      } else if (windows.length < 6) windows.push({ start, end, text: text.slice(start, end) });
    };
    addWindow(0, Math.min(text.length, 1200));
    let omittedClaims = 0;
    for (const section of sections(text, f, cutoff)) {
      const sectionTrace = traceFootballFixture(section.binding, f, cutoff);
      // Do not join a heading from one fixture to a pick from another.
      const discovered = extractLiteralPicks(section.text, f);
      omittedClaims += Math.max(0, discovered.length - 12);
      for (const pick of discovered.slice(0, 12)) {
        if (claims.length >= 300) break;
        const start = section.start + pick.start,
          end = section.start + pick.end;
        addWindow(Math.max(section.start, start - 400), Math.min(section.end, end + 400));
        const reasons = [...sectionTrace.failures, ...pick.reasons];
        if (originStatus !== "reviewed") reasons.push(originStatus);
        if (trace.failures.includes("after_kickoff")) reasons.push("after_kickoff");
        const exact = text.slice(start, end) === pick.quote;
        if (!exact) reasons.push("quote_mismatch");
        const retained = windows.some((w) => start >= w.start && end <= w.end);
        if (!retained) reasons.push("window_limit");
        claims.push({
          sourceIndex,
          quote: pick.quote,
          start,
          end,
          sectionStart: section.start,
          sectionEnd: section.end,
          market: pick.market,
          stance: pick.stance,
          trace: sectionTrace,
          countable:
            exact &&
            retained &&
            sectionTrace.status === "verified" &&
            pick.stance === "authored" &&
            originStatus === "reviewed" &&
            !trace.failures.includes("after_kickoff"),
          reasons: [...new Set(reasons)],
        });
      }
    }
    sources.push({
      url: url.href,
      title: doc.title.slice(0, 180),
      accessedAt: new Date(doc.accessedAt).toISOString(),
      ...(doc.publishedAtUtc ? { publishedAtUtc: doc.publishedAtUtc } : {}),
      publicationOrigin: doc.publishedAtUtc ? "search_provider" : "unknown",
      queryLanguage: doc.queryLanguage ?? "unknown",
      detectedLanguage: detectArticleLanguage(text),
      contentDigest: digest(text),
      representation: "football-clean-v2",
      availableChars: text.length,
      truncated: !!doc.truncated || doc.text.length > 24000,
      windows,
      origin,
      originStatus,
      trace,
      omittedClaims,
      claimDetection: claims.some((c) => c.sourceIndex === sourceIndex && c.stance === "authored")
        ? "authored"
        : claims.some((c) => c.sourceIndex === sourceIndex && c.stance === "unsafe")
          ? "unsafe"
          : claims.some((c) => c.sourceIndex === sourceIndex)
            ? "unmapped"
            : "none",
    });
  }
  const families = new Set<string>();
  for (const claim of claims)
    if (claim.countable) {
      const family = descriptiveMarketFamily(claim.market);
      if (!families.has(family) && families.size >= 40) {
        claim.countable = false;
        claim.reasons.push("group_limit");
      } else families.add(family);
    }
  const groups: FootballClaimLedger["groups"] = [];
  for (const family of [
    ...new Set(claims.filter((c) => c.countable).map((c) => descriptiveMarketFamily(c.market))),
  ]) {
    const entries = claims.filter(
      (c) => c.countable && descriptiveMarketFamily(c.market) === family,
    );
    const origins = [...new Set(entries.map((c) => sources[c.sourceIndex]!.origin!))];
    const support = new Map<string, number>();
    let conflictingOrigins = 0,
      eligibleOrigins = 0;
    for (const origin of origins) {
      const keys = [
        ...new Set(
          entries
            .filter((c) => sources[c.sourceIndex]!.origin === origin)
            .map((c) => descriptiveMarketKey(c.market)),
        ),
      ];
      if (keys.length > 1 && !family.includes(":dc")) {
        conflictingOrigins++;
        continue;
      }
      eligibleOrigins++;
      for (const key of keys) support.set(key, (support.get(key) ?? 0) + 1);
    }
    groups.push({
      family,
      eligibleOrigins,
      conflictingOrigins,
      support: [...support]
        .map(([market, votes]) => ({ market, votes }))
        .sort((a, b) => b.votes - a.votes || a.market.localeCompare(b.market)),
    });
  }
  return claimLedgerSchema.parse({
    version: 2,
    fixture: f,
    profile,
    cutoff,
    queries,
    sources,
    claims,
    groups,
    sourceCount: new Set(
      claims.filter((c) => c.countable).map((c) => sources[c.sourceIndex]!.origin),
    ).size,
  });
}
