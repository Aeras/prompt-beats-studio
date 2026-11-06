import { FootballEvidenceV2Panel } from "./FootballEvidenceV2Panel";
import type { FootballClaimLedger } from "@/lib/football-evidence-v2.shared";
import { useI18n } from "@/i18n";
import {
  footballOnlineMessages,
  footballOnlineMarketLabels,
} from "@/i18n/football-online-predictions";
import {
  predictionMarketFamily,
  type FootballPredictionConsensus,
} from "@/lib/football-prediction-consensus.shared";

/** Historical, server-validated data only. Opening/collapsing never dispatches work. */
export function OnlinePredictionsPanel({
  data,
  estimates = [],
  evidenceV2,
}: {
  data?: FootballPredictionConsensus | undefined;
  evidenceV2?: FootballClaimLedger | undefined;
  estimates?: { market: string; percent: number }[] | undefined;
}) {
  const { language } = useI18n();
  const t = footballOnlineMessages[language === "en" ? "en" : "el"];
  const likely = [...estimates].sort(
    (a, b) => b.percent - a.percent || a.market.localeCompare(b.market),
  )[0];
  // One compact document row even when the same source supports several markets.
  const sourceDocuments =
    data?.predictions.filter((p, i, all) => all.findIndex((other) => other.url === p.url) === i) ??
    [];
  const judgment = data?.judgment;
  const group = judgment?.primary
    ? data?.groups.find((g) => g.family === predictionMarketFamily(judgment.primary!))
    : undefined;
  const leading = group?.support[0]?.count;
  const agrees =
    judgment?.primary &&
    leading &&
    group?.support.some((s) => s.market === judgment.primary && s.count === leading);
  return (
    <section
      aria-label={t.title}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card/80 p-4 text-card-foreground"
    >
      <h3 className="font-semibold">{t.title}</h3>
      {!data ? (
        <p className="text-sm text-muted-foreground">{t.legacy}</p>
      ) : (
        <>
          {evidenceV2 && <FootballEvidenceV2Panel data={evidenceV2} />}
          {!evidenceV2 && (
            <div className="space-y-2" aria-label={t.consensus}>
              <h4 className="font-medium">{t.consensus}</h4>
              <p className="break-words text-xs text-muted-foreground">
                {t.collected}: {data.collectedAtUtc}
              </p>
              <p className="text-sm">
                {t.sources}: {data.sourceCount}
              </p>
              {data.status === "insufficient" && <p className="text-sm">{t.empty}</p>}
              {data.sourceCount < 5 && <p className="text-xs text-muted-foreground">{t.small}</p>}
              {data.groups.map((g) => (
                <div key={g.family} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {g.support.map((s) => (
                    <span key={s.market}>
                      {footballOnlineMarketLabels[s.market]}:{" "}
                      <strong>
                        {s.count}/{g.sources}
                      </strong>{" "}
                      {t.votes}
                    </span>
                  ))}
                  {g.conflicts > 0 && (
                    <span>
                      {t.conflicts}: {g.conflicts}
                    </span>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{t.warning}</p>
              <details className="rounded-lg border border-border p-2">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                  {t.claims} ({sourceDocuments.length})
                </summary>
                <ul className="min-w-0 space-y-3 text-sm">
                  {sourceDocuments.map((p, i) => (
                    <li key={`${p.url}-${p.market}-${i}`} className="min-w-0 space-y-1 break-words">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-primary underline"
                      >
                        {p.title || p.publisher}
                      </a>
                      <p>
                        {data.predictions
                          .filter((other) => other.url === p.url)
                          .map((other) => footballOnlineMarketLabels[other.market])
                          .join(" · ")}{" "}
                        · {p.publisher}
                      </p>
                      <blockquote
                        lang="und"
                        className="border-l-2 border-border pl-2 text-xs text-muted-foreground"
                      >
                        {p.passage}
                      </blockquote>
                      <p className="text-xs text-muted-foreground">
                        {t.accessed}: {p.accessedAt} ·{" "}
                        {p.publishedAtUtc
                          ? `${t.publicationReported}: ${p.publishedAtUtc}`
                          : t.publication}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
              {data.excluded.length > 0 && (
                <details className="rounded-lg border border-border p-2">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm">
                    {t.excluded} ({data.excluded.length})
                  </summary>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {data.excluded.map((e, i) => (
                      <li key={i}>
                        #{e.sourceIndex + 1}: {t.reasons[e.reason]}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <div className="space-y-2 border-t border-border pt-3" aria-label={t.ai}>
            <h4 className="font-medium">{t.ai}</h4>
            {likely && (
              <p className="text-sm">
                {t.likely}: {footballOnlineMarketLabels[likely.market]} ({likely.percent}%)
              </p>
            )}
            {judgment?.decision === "lean" && judgment.primary ? (
              <>
                <p className="text-sm font-semibold">
                  {t.interesting}: {footballOnlineMarketLabels[judgment.primary]}
                </p>
                <p className="break-words text-sm">{judgment.rationale}</p>
                {judgment.alternative && (
                  <p className="text-sm">
                    {t.alternative}: {footballOnlineMarketLabels[judgment.alternative]}
                  </p>
                )}
                {!evidenceV2 && leading && (
                  <p className="text-xs text-muted-foreground">
                    {agrees ? t.agreement : t.disagreement}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm">{judgment?.rationale ?? t.abstain}</p>
            )}
            {judgment && (
              <>
                <p className="break-words text-sm">
                  {t.counter}: {judgment.counterargument}
                </p>
                <p className="break-words text-sm">
                  {t.risk}: {judgment.risk}
                </p>
              </>
            )}
            {judgment && judgment.evidenceUrls.length > 0 && (
              <details className="rounded-lg border border-border p-2">
                <summary className="min-h-11 cursor-pointer py-2 text-sm">{t.evidence}</summary>
                <ul className="space-y-2 text-xs">
                  {judgment.evidenceUrls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-primary underline"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-muted-foreground">{t.noEdge}</p>
          </div>
        </>
      )}
    </section>
  );
}
