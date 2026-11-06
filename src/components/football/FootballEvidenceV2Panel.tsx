import { useI18n } from "@/i18n";
import {
  footballEvidenceV2Messages,
  footballEvidenceReasonLabels,
  footballEvidenceMarketLabel,
  footballEvidenceLanguages,
} from "@/i18n/football-evidence-v2";
import { descriptiveMarketKey, type FootballClaimLedger } from "@/lib/football-evidence-v2.shared";
export function FootballEvidenceV2Panel({ data }: { data: FootballClaimLedger }) {
  const { language } = useI18n(),
    locale = language === "en" ? "en" : "el",
    t = footballEvidenceV2Messages[locale];
  return (
    <div className="min-w-0 space-y-3" aria-label={t.title}>
      <h4 className="font-medium">{t.title}</h4>
      <p className="text-xs text-muted-foreground">{t.profile}</p>
      <p className="text-sm">
        {t.sources}: {data.sourceCount} · {t.urls}: {data.sources.length}
      </p>
      {!data.groups.some((g) => g.eligibleOrigins >= 2) && <p className="text-sm">{t.empty}</p>}
      {data.groups.map((g) => (
        <div key={g.family} className="min-w-0 break-words text-sm">
          {g.support.map((s) => (
            <p key={s.market}>
              <span>
                {data.claims.find((c) => descriptiveMarketKey(c.market) === s.market)
                  ? footballEvidenceMarketLabel(
                      data.claims.find((c) => descriptiveMarketKey(c.market) === s.market)!.market,
                      locale,
                    )
                  : t.unknown}
              </span>
              :{" "}
              <strong>
                {s.votes}/{g.eligibleOrigins}
              </strong>{" "}
              · {t.votes}
            </p>
          ))}
          {g.conflictingOrigins > 0 && (
            <p>
              {t.conflicts}: {g.conflictingOrigins}
            </p>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t.limited}</p>
      <details className="rounded-lg border border-border p-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          {t.claims} ({data.claims.length})
        </summary>
        <ul className="min-w-0 space-y-3 text-sm">
          {data.sources.map((s, i) => (
            <li className="min-w-0 space-y-1 break-words" key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary underline"
              >
                {s.title || new URL(s.url).hostname}
              </a>
              <p className="text-xs">
                {t.statuses[s.trace.status]} · {t.query}:{" "}
                {footballEvidenceLanguages[locale][s.queryLanguage]} · {t.detected}:{" "}
                {footballEvidenceLanguages[locale][s.detectedLanguage]}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.truncated ? t.truncated + " · " : ""}
                {t.access}: {s.accessedAt} ·{" "}
                {s.publishedAtUtc ? `${t.published}: ${s.publishedAtUtc}` : t.noDate}
              </p>
              <p className="text-xs">
                {s.originStatus === "reviewed"
                  ? t.reviewed
                  : (footballEvidenceReasonLabels[s.originStatus]?.[locale] ?? t.unknown)}
              </p>
              {s.omittedClaims > 0 && (
                <p className="text-xs">
                  {t.omitted}: {s.omittedClaims}
                </p>
              )}
              {s.claimDetection === "none" && (
                <p className="text-xs text-muted-foreground">{t.noPick}</p>
              )}
              {data.claims
                .filter((c) => c.sourceIndex === i)
                .map((c, j) => (
                  <div key={j} className="space-y-1 rounded border border-border p-2">
                    <p className="text-xs">
                      {c.countable ? t.counted : t.provisional} ·{" "}
                      <span>{footballEvidenceMarketLabel(c.market, locale)}</span>
                    </p>
                    <blockquote
                      lang={s.detectedLanguage === "unknown" ? "und" : s.detectedLanguage}
                      className="border-l-2 border-border pl-2 text-xs text-muted-foreground"
                    >
                      {c.quote}
                    </blockquote>
                    {c.reasons.length > 0 && (
                      <p className="text-xs">
                        {t.reasons}:{" "}
                        {c.reasons
                          .map((r) => footballEvidenceReasonLabels[r]?.[locale] ?? t.unknown)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              {s.trace.failures.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {s.trace.failures
                    .map((r) => footballEvidenceReasonLabels[r]?.[locale] ?? t.unknown)
                    .join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
