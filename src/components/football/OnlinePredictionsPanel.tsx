import { useI18n } from "@/i18n";
import { independentMessages, legacyMarketAst } from "@/i18n/football-independent-assessment";
import { footballEvidenceMarketLabel } from "@/i18n/football-evidence-v2";
import {
  descriptiveMarketKey,
  descriptiveMarketFamily,
  type FootballClaimLedger,
} from "@/lib/football-evidence-v2.shared";
import {
  predictionMarketFamily,
  type FootballPredictionConsensus,
} from "@/lib/football-prediction-consensus.shared";
/** Read-only historical projection. No network, diagnostics, numeric model probability or dispatch. */
export function OnlinePredictionsPanel({
  data,
  evidenceV2,
}: {
  data?: FootballPredictionConsensus | undefined;
  evidenceV2?: FootballClaimLedger | undefined;
  estimates?: { market: string; percent: number }[] | undefined;
}) {
  const { language } = useI18n(),
    locale = language === "en" ? "en" : "el",
    t = independentMessages[locale];
  const judgment = evidenceV2?.judgment,
    legacy = evidenceV2 ? undefined : data?.judgment;
  const selection =
    judgment?.decision === "lean"
      ? judgment.selection
      : legacy?.decision === "lean" && legacy.primary
        ? legacyMarketAst(legacy.primary)
        : undefined;
  const rationale = judgment?.rationale ?? legacy?.rationale;
  const oldGroup =
    !evidenceV2 && legacy?.primary
      ? data?.groups.find((g) => g.family === predictionMarketFamily(legacy.primary!))
      : undefined;
  const group = selection
    ? (evidenceV2?.groups.find((g) => g.family === descriptiveMarketFamily(selection)) ??
      (oldGroup
        ? {
            eligibleOrigins: Math.max(0, oldGroup.sources - oldGroup.conflicts),
            conflictingOrigins: oldGroup.conflicts,
            support: oldGroup.support.map((s) => ({
              market: descriptiveMarketKey(legacyMarketAst(s.market)!),
              votes: s.count,
            })),
          }
        : undefined))
    : undefined;
  const votes =
    selection && group?.support.find((s) => s.market === descriptiveMarketKey(selection))?.votes;
  const urls = [
    ...new Set([
      ...(judgment?.evidenceUrls ?? legacy?.evidenceUrls ?? []),
      ...(evidenceV2?.claims
        .filter((c) => c.stance === "authored" && c.trace.status === "verified")
        .map((c) => evidenceV2.sources[c.sourceIndex]!.url) ??
        data?.predictions.map((p) => p.url) ??
        []),
    ]),
  ].slice(0, 25);
  return (
    <section
      aria-label={t.title}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card/80 p-4 text-card-foreground"
    >
      <h3 className="font-semibold">{t.title}</h3>
      {selection ? (
        <p className="break-words text-base font-semibold text-primary">
          {footballEvidenceMarketLabel(selection, locale)}
        </p>
      ) : (
        <p className="text-sm">{t.abstain}</p>
      )}
      {rationale && <p className="break-words text-sm">{rationale}</p>}
      {group && group.eligibleOrigins > 0 ? (
        <div className="text-xs text-muted-foreground">
          <p>
            {t.agreement}: {votes ?? 0}/{group.eligibleOrigins} · {t.opinions}
          </p>
          <p>
            {t.disagreement}: {group.eligibleOrigins - (votes ?? 0) + group.conflictingOrigins}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t.noConsensus}</p>
      )}
      <details className="rounded-lg border border-border p-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t.sources}</summary>
        {urls.length ? (
          <ul className="max-h-72 min-w-0 space-y-2 overflow-y-auto text-xs [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
            {urls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-words text-primary underline [overflow-wrap:anywhere]"
                >
                  {evidenceV2?.sources.find((s) => s.url === url)?.title ||
                    data?.predictions.find((s) => s.url === url)?.title ||
                    new URL(url).hostname}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t.none}</p>
        )}
      </details>
      <p className="text-xs text-muted-foreground">{t.qualitative}</p>
    </section>
  );
}
