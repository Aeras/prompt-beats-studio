import type { OddsTarget } from "./football-odds.shared";
import { extractLiteralPicks } from "./football-evidence-v2.shared";
import {
  researchMarketSchema,
  researchMarketKey,
  type ResearchMarket,
} from "./football-independent-markets.shared";

/** Never treats model prose as proof: only the exact quoted source clause is parsed. */
export function normalizeAuthoredMarkets(
  quote: string,
  fixture: OddsTarget,
  authorialHeading?: string,
): ResearchMarket[] {
  const results: ResearchMarket[] = [];
  let inherited =
    !!authorialHeading &&
    /our (?:pick|prediction|best bet)|expert prediction|reason for tip|прогноз аналитика|наш выбор|η πρότασή μας/iu.test(
      authorialHeading,
    );
  for (const clause of quote.split(/(?<=[.!?;])\s+|\n/u)) {
    if (
      /\b(?:not|avoid|maybe|perhaps|might|could|according to|computer|algorithm|simulation|historical|previous|yesterday|last meeting|finished|ended)\b|δεν|όχι\s+(?:over|under|πάνω|κάτω)|ίσως|σύμφωνα με|не\s|возможно|алгоритм|компьютер/iu.test(
        clause,
      )
    ) {
      inherited = false;
      continue;
    }
    const contextual = inherited;
    inherited = false;
    const authored =
      contextual ||
      /\b(?:our (?:pick|prediction|tip|bet)|we (?:are )?(?:back|backing|recommend|predict|expect)|recommend(?:ation|ed)?|best bet|betting tip|top pick|reason for tip|correct score prediction|take|back|pick:)\b|προτείν|επιλογή μας|ποντάρουμε|наш (?:прогноз|выбор)|прогноз аналитика|рекомендуем|советуем|ставка:|ставим/iu.test(
        clause,
      );
    if (!authored) continue;
    if (
      /^(?:[👤#*\s]*)(?:our (?:pick|prediction|best bet)|expert prediction|reason for tip|прогноз аналитика|наш выбор|η πρότασή μας)[:\s]*$/iu.test(
        clause,
      )
    )
      inherited = true;
    const period = /\b(?:first half|half.time|HT)\b|ημίχρονο|первый тайм/iu.test(clause)
      ? ("HT" as const)
      : ("FT" as const);
    const found: ResearchMarket[] = [];
    let unsupportedSubject = false;
    // Period-separated HT/FT is not a double-chance token.
    for (const m of clause.matchAll(
      /(?:^|[^\p{L}\p{N}])([1XΧХ2])\s*\/\s*([1XΧХ2])(?=$|[^\p{L}\p{N}])/giu,
    )) {
      const token = (v: string) => v.replace(/[ΧХxхχ]/gu, "X") as "1" | "X" | "2";
      found.push({ kind: "htft", half: token(m[1]!), full: token(m[2]!) });
    }
    for (const m of clause.matchAll(
      /(?:over|under|тб|тм|πάνω από|κάτω από)\s*["«(]?\s*(\d{1,2}[.,][05]|\d{1,2})(?:["»)]|\s)*((?:yellow |red )?cards?|goals?|corners?|shots?(?: on target)?|углов\p{L}*|карт\p{L}*|гол\p{L}*|κόρνερ|κάρτες|γκολ)?/giu,
    )) {
      const selection = /^(?:under|тм|κάτω)/iu.test(m[0]) ? ("under" as const) : ("over" as const);
      const statistic = /corner|углов|κόρνερ/iu.test(m[2] ?? "")
        ? "corners"
        : /card|карт|κάρτ/iu.test(m[2] ?? "")
          ? /yellow/iu.test(m[2]!)
            ? "yellow_cards"
            : /red/iu.test(m[2]!)
              ? "red_cards"
              : "cards"
          : /shot/iu.test(m[2] ?? "")
            ? /on target/iu.test(m[2]!)
              ? "shots_on_target"
              : "shots"
            : null;
      const line = Number(m[1]!.replace(",", "."));
      const lead = clause.slice(0, m.index).trim();
      const tail = clause.slice(m.index! + m[0].length).trim();
      const teamSubject =
        (" " + lead.toLowerCase()).endsWith(" " + fixture.homeTeam.toLowerCase()) ||
        tail.toLowerCase().startsWith("for " + fixture.homeTeam.toLowerCase())
          ? ("home" as const)
          : (" " + lead.toLowerCase()).endsWith(" " + fixture.awayTeam.toLowerCase()) ||
              tail.toLowerCase().startsWith("for " + fixture.awayTeam.toLowerCase())
            ? ("away" as const)
            : ("match" as const);
      if (
        (!m[2] && /^\p{L}/u.test(tail) && !/^(?:in\b|goals?\b|гол|γκολ)/iu.test(tail)) ||
        (!statistic && teamSubject !== "match")
      ) {
        unsupportedSubject = true;
        continue;
      }
      if (statistic) {
        const player = /shots/u.test(statistic)
          ? clause
              .slice(0, m.index)
              .match(/(?:top pick:|our pick:)\s*([\p{L}][\p{L} .'-]{2,80})\s*$/iu)?.[1]
              ?.trim()
          : undefined;
        found.push({
          kind: "stat_total",
          statistic,
          period,
          subject: player ? "player" : teamSubject,
          selection,
          line,
          ...(player ? { player } : {}),
        });
      } else if (line <= 20) found.push({ kind: "total", period, selection, line });
    }
    if (unsupportedSubject) continue;
    const btts = clause.match(
      /(?<!\p{L})(?:BTTS|both teams (?:to )?score|Goal\/Goal|GG|NG|обе забьют|ОЗ|αμφίσκορο)(?!\p{L})(?:\s*[-—:]?\s*(yes|no|да|нет))?/iu,
    );
    if (btts)
      found.push({
        kind: "btts",
        period,
        selection: /^(?:no|нет)$/iu.test(btts[1] ?? "") || /^NG$/iu.test(btts[0]) ? "no" : "yes",
      });
    const dc = clause.match(/(?:^|[^\p{L}\p{N}])(1[XΧХ]|[XΧХ]2|12)(?=$|[^\p{L}\p{N}])/iu);
    const ambiguous12 =
      dc?.[1] === "12" &&
      !(
        /double chance|διπλή ευκαιρία|двойной шанс/iu.test(clause) ||
        /(?:pick|tip|выбор|прогноз|επιλογή)\s*:\s*12(?:\s*[.;]?\s*$)/iu.test(clause)
      );
    if (dc && !ambiguous12)
      found.push({
        kind: "dc",
        period,
        selection: dc[1]!.replace(/[xхχ]/giu, "X").toUpperCase() as "1X" | "X2" | "12",
      });
    const handicap = clause.match(
      /(asian|european|азиатск\p{L}*|европейск\p{L}*)\s+(?:handicap|фора)\s*(?:[(:]\s*)?([12])\s*[:(]?\s*([+-]?\d+(?:[.,]5)?)\s*\)?/iu,
    );
    if (handicap)
      found.push({
        kind: "handicap",
        period,
        settlement: /asian|азиат/iu.test(handicap[1]!) ? "asian" : "european",
        selection: handicap[2] as "1" | "2",
        line: Number(handicap[3]!.replace(",", ".")),
      });
    const escapeTeam = (v: string) =>
      [...v].map((c) => (".*+?^\u0024{}()|[]\\".includes(c) ? "\\" + c : c)).join("");
    for (const [team, selection] of [
      [fixture.homeTeam, "1"],
      [fixture.awayTeam, "2"],
    ] as const)
      if (
        new RegExp("(?:^|[^\\p{L}])" + escapeTeam(team) + "\\s+to win(?:$|[^\\p{L}])", "iu").test(
          clause,
        )
      )
        found.push({ kind: "1x2", period, selection });
    for (const [team, selection] of [
      [fixture.homeTeam, "1X"],
      [fixture.awayTeam, "X2"],
    ] as const)
      if (
        new RegExp(
          "(?:" +
            escapeTeam(team) +
            "\\s+or\\s+(?:the\\s+)?draw|draw\\s+or\\s+" +
            escapeTeam(team) +
            ")",
          "iu",
        ).test(clause)
      )
        found.push({ kind: "dc", period, selection });
    const result = clause.match(
      /(?:pick|result|исход|ставка)\s*[:—-]?\s*(?:П\s*)?([12XХΧ])(?!(?:[\p{L}\p{N}/—–:-]|[.,]\d))/iu,
    );
    if (result && !handicap)
      found.push({
        kind: "1x2",
        period,
        selection: result[1]!.replace(/[xхχ]/giu, "X").toUpperCase() as "1" | "X" | "2",
      });
    const score = clause.match(
      /(?:correct score|score prediction|точный сч[её]т|ακριβές σκορ|prediction for this match)[^\n]{0,80}?\b(\d{1,2})\s*[-–:]\s*(\d{1,2})\b/iu,
    );
    if (score && Number(score[1]) <= 15 && Number(score[2]) <= 15)
      found.push({ kind: "score", period, home: Number(score[1]), away: Number(score[2]) });
    // Existing reviewed parser supplies team-name picks and further legacy expressions.
    for (const p of extractLiteralPicks(clause, fixture, "v2_experimental"))
      if (
        !ambiguous12 &&
        !found.length &&
        p.stance === "authored" &&
        p.market.kind !== "other" &&
        p.market.kind !== "and" &&
        !found.some((v) => researchMarketKey(v) === researchMarketKey(p.market))
      )
        found.push(p.market);
    const unique = [...new Map(found.map((m) => [researchMarketKey(m), m])).values()];
    if (
      unique.length === 2 &&
      /(?:our (?:pick|tip|bet)|we recommend|προτείνουμε|наш (?:выбор|прогноз))\s*[:—-]?\s*[^!?;\n]{1,100}\s(?:&|and|и|και)\s[^!?;\n]{1,100}$/iu.test(
        clause,
      ) &&
      !/alternative|alternatively|или|εναλλακτικ/iu.test(clause)
    )
      results.push(researchMarketSchema.parse({ kind: "and", legs: unique }));
    else results.push(...unique);
  }
  return [...new Map(results.map((m) => [researchMarketKey(m), m])).values()];
}
