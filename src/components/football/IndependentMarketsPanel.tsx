import { useI18n } from "@/i18n";
import { aggregateVerifiedMarkets } from "@/lib/football-independent-restoration.shared";
import { researchMarketLabel } from "@/lib/football-independent-markets.shared";
import type { FullEvidenceReport } from "@/lib/football-full-evidence.shared";

/** New version only. The legacy full-evidence panel remains the historical reader. */
export function IndependentMarketsPanel({
  report,
  audit,
}: {
  report: FullEvidenceReport;
  audit: React.ReactNode;
}) {
  const { language } = useI18n();
  const en = language === "en";
  const t = (el: string, english: string) => (en ? english : el);
  const marketLabel = (m: Parameters<typeof researchMarketLabel>[0]) =>
    researchMarketLabel(m, en ? "en" : "el");
  const quoteText = (q: string) => {
    const at = q.search(
      /\(\s*(?:odds|price|коэффициент)|@\s*\d|\b(?:odds|price)\s*[:–—-]?\s*\d|\s+\d+[.,]\d{2}\s+(?:Stake|Bet365|Melbet)/iu,
    );
    return at < 0 ? q : q.slice(0, at).trimEnd() + "…";
  };
  const r = report.restoration!;
  const a = report.coverage === "complete" ? r.assessment : undefined;
  const { rows, conflicts } = aggregateVerifiedMarkets(r.candidates);
  const source = (id: string) => report.sources.find((s) => s.id === id);
  const anchor = (url: string, title: string) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-primary underline [overflow-wrap:anywhere]"
    >
      {title}
    </a>
  );
  const provisional = r.candidates.filter((c) => !c.eligibleForConsensus);
  return (
    <section
      aria-label={t("Ανεξάρτητη εκτίμηση AI", "Independent AI assessment")}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card/80 p-4 text-card-foreground [overflow-wrap:anywhere]"
    >
      <h3 className="font-semibold">{t("Ανεξάρτητη εκτίμηση AI", "Independent AI assessment")}</h3>
      {report.coverage !== "complete" && (
        <p role="status" className="text-sm">
          {t(
            "Ατελής κάλυψη πηγών. Δεν εφαρμόζεται τελική εκτίμηση.",
            "Source coverage incomplete. No final judgment is applied.",
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {r.onlineComparisonStatus === "verified"
          ? t(
              "Συγκρίθηκαν επαληθευμένες ανεξάρτητες δημοσιευμένες επιλογές.",
              "Independently verified published picks were compared.",
            )
          : t(
              `Βρέθηκαν ${r.candidates.length} υποψήφιες προβλέψεις· 0 καταμετρήσιμες ανεξάρτητες πηγές. Η εκτίμηση δεν αποτελεί διαδικτυακή συναίνεση.`,
              `${r.candidates.length} candidate predictions; 0 countable independent sources. The assessment is not online consensus.`,
            )}
      </p>
      {rows.length > 0 && (
        <div
          className="space-y-2"
          aria-label={t("Συμφωνία εκδοτών ανά αγορά", "Publisher agreement by market")}
        >
          <p className="text-xs text-muted-foreground">
            {t(
              "Πηγές, όχι πιθανότητες. Ο παρονομαστής αφορά εκδότες με συγκρίσιμη αγορά.",
              "Sources, not probabilities. Denominator counts publishers with a comparable market.",
            )}
          </p>
          {rows.map((row) => (
            <details key={row.marketKey} className="rounded-md border border-border p-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span>
                  {marketLabel(row.market)} — {row.count}/{row.denominator}{" "}
                  {t("εκδότες", "publishers")}
                </span>
                <span
                  role="meter"
                  aria-label={marketLabel(row.market)}
                  aria-valuemin={0}
                  aria-valuemax={row.denominator}
                  aria-valuenow={row.count}
                  aria-valuetext={`${row.count}/${row.denominator} ${t("εκδότες", "publishers")}`}
                  className="mt-2 block h-2 overflow-hidden rounded bg-muted"
                >
                  <span
                    className="block h-full bg-primary"
                    style={{ width: `${(100 * row.count) / row.denominator}%` }}
                  />
                </span>
              </summary>
              <ul className="space-y-3 text-xs">
                {row.candidateIds.map((id) => {
                  const c = r.candidates[id]!;
                  const s = source(c.sourceId);
                  return (
                    <li key={id}>
                      {s?.url && anchor(s.url, s.title)}
                      <p>
                        {t("Επαληθευμένη δημοσιευμένη επιλογή", "Verified published pick")}:{" "}
                        {marketLabel(c.market)}
                      </p>
                      <blockquote className="border-l-2 border-border pl-2">
                        {quoteText(c.quote)}
                      </blockquote>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      )}
      {a && (
        <div className="space-y-3 border-t border-border pt-3">
          <h4 className="text-sm font-semibold">{t("Η δική μας εκτίμηση", "Our assessment")}</h4>
          {a.primary?.evidenceUrls.every((u) => report.providerCitations.includes(u)) && (
            <p className="text-xs text-muted-foreground">
              {t(
                "Η κύρια εκτίμηση στηρίζεται σε στοιχεία παρόχων· οι δημοσιευμένες επιλογές παρουσιάζονται χωριστά.",
                "The primary assessment cites provider evidence; published picks are shown separately.",
              )}
            </p>
          )}
          {a.primary ? (
            <>
              <p className="font-semibold text-primary">{marketLabel(a.primary.market)}</p>
              <p className="text-sm">{a.primary.rationale}</p>
              <p className="text-xs text-muted-foreground">
                {t("Κύριος κίνδυνος", "Main risk")}: {a.primary.risk}
              </p>
            </>
          ) : (
            <p className="text-sm">
              {t("Αποχή", "Abstention")}: {a.rationale}
            </p>
          )}
          {a.alternative && (
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">
                {t("Εναλλακτική", "Alternative")}: {marketLabel(a.alternative.market)}
              </h4>
              <p className="text-sm">{a.alternative.rationale}</p>
              <p className="text-xs text-muted-foreground">{a.alternative.risk}</p>
              {a.alternative.jointRationale && (
                <p className="text-xs">{a.alternative.jointRationale}</p>
              )}
            </div>
          )}
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm">
              {t("Πηγές της εκτίμησης", "Sources cited by the assessment")}
            </summary>
            <ul className="space-y-2 text-xs">
              {[
                ...new Set([
                  ...(a.primary?.evidenceUrls ?? []),
                  ...(a.alternative?.evidenceUrls ?? []),
                ]),
              ].map((url) => (
                <li key={url}>
                  {anchor(
                    url,
                    report.sources.find((s) => s.url === url)?.title ?? new URL(url).hostname,
                  )}
                  {report.providerCitations.includes(url) && (
                    <span> · {t("Στοιχεία παρόχου", "Provider evidence")}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {provisional.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm">
            {t(
              "Λοιπές δημοσιευμένες επιλογές — μη καταμετρημένες",
              "Other published candidates — not counted",
            )}{" "}
            ({provisional.length})
          </summary>
          <ul className="space-y-3 text-xs">
            {provisional.map((c) => {
              const s = source(c.sourceId);
              return (
                <li key={c.id}>
                  {s?.url && anchor(s.url, s.title)}
                  <p>
                    {marketLabel(c.market)} ·{" "}
                    {c.kind === "algorithm"
                      ? t("Αλγοριθμική", "Algorithmic")
                      : t("Χρειάζεται επαλήθευση", "Needs verification")}
                  </p>
                  {c.quoteVerified && <blockquote>{quoteText(c.quote)}</blockquote>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {conflicts.length > 0 && (
        <p className="text-xs">
          {t(
            "Αντικρουόμενες επιλογές του ίδιου εκδότη εξαιρέθηκαν από τις μπάρες.",
            "Conflicting picks by the same publisher were excluded from bars.",
          )}
        </p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-xs text-muted-foreground">
          {t("Έλεγχος πηγών και κάλυψης", "Source and coverage audit")}
        </summary>
        {audit}
      </details>
    </section>
  );
}
