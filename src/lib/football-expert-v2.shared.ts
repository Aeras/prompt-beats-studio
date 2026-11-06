import { z } from "zod";
import { footballExpertDecisionSchema } from "./football-ai-research-phases.shared";
import { QUOTED_MARKETS, usableOdds, type BookmakerOddsSnapshot } from "./football-odds.shared";
const markets = new Set<string>([
  ...QUOTED_MARKETS,
  "corners_over_8_5",
  "corners_under_8_5",
  "corners_over_9_5",
  "corners_under_9_5",
]);
/** Historical parser stays compatible; only new writes require canonical identities. */
export function validateFootballExpertV2(
  decision: z.infer<typeof footballExpertDecisionSchema>,
  snapshot: BookmakerOddsSnapshot | undefined,
  cutoffUtc: string,
): boolean {
  const usable = usableOdds(snapshot, cutoffUtc);
  return [decision.primary, decision.planB].every(
    (p) =>
      !p ||
      (markets.has(p.market) &&
        (!p.offeredSelectionId ||
          !!usable?.quotes.some(
            (q) => q.selectionId === p.offeredSelectionId && q.market === p.market,
          ))),
  );
}
