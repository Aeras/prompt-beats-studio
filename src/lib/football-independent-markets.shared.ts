import { z } from "zod";
import {
  descriptiveMarketSchema,
  descriptiveMarketKey,
  type DescriptiveMarket,
} from "./football-evidence-v2.shared";

const period = z.enum(["FT", "HT"]);
const extraLeaf = z.union([
  z
    .object({
      kind: z.literal("stat_total"),
      statistic: z.enum([
        "corners",
        "cards",
        "yellow_cards",
        "red_cards",
        "shots",
        "shots_on_target",
      ]),
      period,
      subject: z.literal("player"),
      selection: z.enum(["over", "under"]),
      line: z.number().min(0).max(100).multipleOf(0.5),
      player: z.string().trim().min(2).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("stat_total"),
      statistic: z.enum([
        "corners",
        "cards",
        "yellow_cards",
        "red_cards",
        "shots",
        "shots_on_target",
      ]),
      period,
      subject: z.enum(["match", "home", "away"]),
      selection: z.enum(["over", "under"]),
      line: z.number().min(0).max(100).multipleOf(0.5),
      // Retained for compatibility with historical V2 snapshots.
      player: z.string().trim().min(2).max(100).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("handicap"),
      period,
      settlement: z.enum(["asian", "european"]),
      selection: z.enum(["1", "2"]),
      line: z.number().min(-10).max(10).multipleOf(0.5),
    })
    .strict(),
]);
// Deliberately independent of QUOTED_MARKETS: these are descriptions, never bookmaker quotes.
export const researchLeafSchema = z.union([
  descriptiveMarketSchema.refine((m) => m.kind !== "and" && m.kind !== "other"),
  extraLeaf,
]);
export const researchMarketSchema = z.union([
  descriptiveMarketSchema,
  extraLeaf,
  z
    .object({ kind: z.literal("and"), legs: z.tuple([researchLeafSchema, researchLeafSchema]) })
    .strict(),
]);
export type ResearchMarket = z.infer<typeof researchMarketSchema>;
export function researchMarketKey(m: ResearchMarket): string {
  if (m.kind === "and") return `and:${m.legs.map(researchMarketKey).sort().join("&")}`;
  if (m.kind === "stat_total")
    return `${m.kind}:${m.statistic}:${m.period}:${m.subject}:${m.player?.normalize("NFKC").toLowerCase() ?? ""}:${m.line}:${m.selection}`;
  if (m.kind === "handicap")
    return `${m.kind}:${m.settlement}:${m.period}:${m.line}:${m.selection}`;
  return descriptiveMarketKey(m);
}
export function researchMarketFamily(m: ResearchMarket): string {
  if (m.kind === "stat_total")
    return `${m.kind}:${m.statistic}:${m.period}:${m.subject}:${m.player?.normalize("NFKC").toLowerCase() ?? ""}:${m.line}`;
  if (m.kind === "handicap")
    return `${m.kind}:${m.settlement}:${m.period}:${m.selection === "1" ? m.line : -m.line}`;
  if (m.kind === "and") return `and:${m.legs.map(researchMarketFamily).sort().join("&")}`;
  return `${m.kind}:${"period" in m ? m.period : "FT"}:${m.kind === "total" ? m.line : ""}`;
}
export function legacyMarket(m: ResearchMarket): DescriptiveMarket {
  const p = descriptiveMarketSchema.safeParse(m);
  return p.success ? p.data : { kind: "other", label: researchMarketLabel(m).slice(0, 140) };
}
export function researchMarketLabel(m: ResearchMarket, locale: "el" | "en" = "en"): string {
  if (m.kind === "and") return m.legs.map((v) => researchMarketLabel(v, locale)).join(" & ");
  if (m.kind === "other") return m.label;
  if (m.kind === "htft") return `${m.half}/${m.full}`;
  const prefix = m.period === "HT" ? (locale === "el" ? "Ημίχρονο " : "HT ") : "";
  if (m.kind === "total") return `${prefix}${m.selection === "over" ? "Over" : "Under"} ${m.line}`;
  if (m.kind === "btts") return `${prefix}${m.selection === "yes" ? "GG" : "NG"}`;
  if (m.kind === "score") return `${prefix}${m.home}–${m.away}`;
  if (m.kind === "handicap")
    return `${prefix}${locale === "el" ? (m.settlement === "asian" ? "Ασιατικό χάντικαπ" : "Ευρωπαϊκό χάντικαπ") : m.settlement + " handicap"} ${m.selection} (${m.line > 0 ? "+" : ""}${m.line})`;
  if (m.kind === "stat_total") {
    const subject =
      m.subject === "player"
        ? m.player
        : m.player ??
          (locale === "el"
            ? { match: "Αγώνα", home: "Γηπεδούχου", away: "Φιλοξενούμενου" }[m.subject]
            : m.subject);
    return `${prefix}${subject} ${locale === "el" ? { corners: "κόρνερ", cards: "κάρτες", yellow_cards: "κίτρινες κάρτες", red_cards: "κόκκινες κάρτες", shots: "σουτ", shots_on_target: "σουτ στην εστία" }[m.statistic] : m.statistic.replaceAll("_", " ")} ${m.selection === "over" ? "Over" : "Under"} ${m.line}`;
  }
  return prefix + m.selection;
}
/** Settlement feasibility, not estimated joint probability or bookmaker availability. */
export function compatibleResearchLegs(legs: ResearchMarket[]): boolean {
  if (legs.length !== 2 || researchMarketKey(legs[0]!) === researchMarketKey(legs[1]!))
    return false;
  if (
    legs.some(
      (m) =>
        m.kind === "other" ||
        m.kind === "and" ||
        m.kind === "htft" ||
        ("period" in m && m.period !== "FT"),
    )
  )
    return false;
  const stats = legs.filter((m) => m.kind === "stat_total");
  if (stats.length === 2) {
    const [a, b] = stats;
    if (a!.statistic === b!.statistic && a!.subject === b!.subject && a!.player === b!.player) {
      if (a!.selection === b!.selection) return false; // redundant nested recommendation
      const low = a!.selection === "over" ? a!.line : b!.line;
      const high = a!.selection === "under" ? a!.line : b!.line;
      return Math.floor(low) + 1 < high;
    }
  }
  const accepts = (m: ResearchMarket, h: number, a: number): boolean => {
    if (m.kind === "stat_total") return true;
    if (m.kind === "total") return m.selection === "over" ? h + a > m.line : h + a < m.line;
    if (m.kind === "btts") return m.selection === "yes" ? h > 0 && a > 0 : h === 0 || a === 0;
    if (m.kind === "score") return h === m.home && a === m.away;
    const result = h > a ? "1" : h === a ? "X" : "2";
    if (m.kind === "1x2") return m.selection === result;
    if (m.kind === "dc") return m.selection.includes(result);
    if (m.kind === "handicap") return m.selection === "1" ? h + m.line > a : a + m.line > h;
    return false;
  };
  for (let h = 0; h <= 30; h++)
    for (let a = 0; a <= 30; a++) if (legs.every((m) => accepts(m, h, a))) return true;
  return false;
}
export const RESEARCH_MARKET_GRAMMAR = `Use EXACT market ASTs. FT/HT is period, not a guess. {kind:"1x2",period:"FT",selection:"1"|"X"|"2"}; {kind:"dc",period,selection:"1X"|"X2"|"12"}; {kind:"total",period,selection:"over"|"under",line:2.5}; {kind:"btts",period,selection:"yes"|"no"}; {kind:"htft",half:"1"|"X"|"2",full:"1"|"X"|"2"}; {kind:"score",period,home:1,away:2}; {kind:"stat_total",statistic:"corners"|"cards"|"yellow_cards"|"red_cards"|"shots"|"shots_on_target",period,subject:"match"|"home"|"away",selection:"over"|"under",line:9.5,player?:exact name}; {kind:"handicap",period,settlement:"asian"|"european",selection:"1"|"2",line:-1}. Never infer Asian/European settlement from an ambiguous handicap. AND is {kind:"and",legs:[two distinct compatible leaf ASTs]}, only if author explicitly recommends the whole conjunction. Separate main/alternative picks are separate candidates. Use {kind:"other",label:literal description} only for truly unsupported/ambiguous settlement, not for a paragraph containing several recognizable picks. X/2 is HT/FT, X2 is double chance. Corners/cards/player markets are not goals. Model market is provisional: server normalizes the literal recommendation independently.`;
