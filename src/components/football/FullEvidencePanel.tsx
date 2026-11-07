import { useI18n } from "@/i18n";
import { footballEvidenceMarketLabel } from "@/i18n/football-evidence-v2";
import { descriptiveMarketKey, descriptiveMarketFamily } from "@/lib/football-evidence-v2.shared";
import type { FullEvidenceReport } from "@/lib/football-full-evidence.shared";
const reasons: Record<string, string> = {
  authorization_changed: "Η πρόσβαση ή η διαθεσιμότητα του μοντέλου άλλαξε πριν από την κλήση.",
  capacity_unknown: "Δεν υπάρχουν επιβεβαιωμένα όρια context/εξόδου για το επιλεγμένο μοντέλο.",
  capacity_exceeded: "Το υλικό δεν χώρεσε στον εγκεκριμένο προϋπολογισμό πλήρους ανάγνωσης.",
  deadline: "Ο χρόνος δεν επέτρεψε την ολοκλήρωση της ανάγνωσης.",
  model_uncertain: "Δεν επιβεβαιώθηκε η έκβαση κλήσης AI. Δεν γίνεται αυτόματη επανάληψη.",
  invalid_extraction: "Δεν επιβεβαιώθηκε η εξαγωγή προβλέψεων από τις πηγές.",
  invalid_judgment: "Δεν επιβεβαιώθηκε η τεκμηρίωση της τελικής εκτίμησης.",
  pending: "Η ανάγνωση δεν ολοκληρώθηκε.",
};
const exclusions: Record<string, string> = {
  unknown_source: "Μη επιβεβαιωμένη πηγή",
  quote_mismatch: "Δεν επιβεβαιώθηκε το ακριβές απόσπασμα",
  fixture_unverified: "Δεν επιβεβαιώθηκε ο αγώνας",
  limited_source_text: "Περιορισμένο κείμενο",
  copied_publication: "Πιθανή αναδημοσίευση",
  independence_unconfirmed: "Ανεξαρτησία μη επιβεβαιωμένη",
  not_verified_editorial: "Δεν επιβεβαιώθηκε ρητή σύσταση συντάκτη",
  market_stance_unconfirmed: "Η ερμηνεία της αγοράς χρειάζεται επιβεβαίωση",
  candidate_limit: "Πολλές επιλογές της ίδιας πηγής",
};
export function FullEvidencePanel({ report }: { report: FullEvidenceReport }) {
  const { language } = useI18n(),
    en = language === "en",
    locale = en ? "en" : "el";
  const t = (el: string, english: string) => (en ? english : el);
  const j = report.coverage === "complete" ? report.judgment : undefined;
  const source = (id: string) => report.sources.find((s) => s.id === id);
  const origins = new Map<string, Set<string>>();
  if (j?.selection)
    for (const c of report.candidates.filter(
      (c) =>
        c.eligibleForConsensus &&
        descriptiveMarketFamily(c.market) === descriptiveMarketFamily(j.selection!),
    )) {
      const origin = source(c.sourceId)?.publisherFamily;
      if (origin) {
        const picks = origins.get(origin) ?? new Set<string>();
        picks.add(descriptiveMarketKey(c.market));
        origins.set(origin, picks);
      }
    }
  const votes = j?.selection
    ? [...origins.values()].filter((p) => p.size === 1 && p.has(descriptiveMarketKey(j.selection!)))
        .length
    : 0;
  const independent = [...origins.values()].filter((p) => p.size === 1).length;
  const rows =
    "max-h-72 min-w-0 space-y-3 overflow-y-auto text-xs [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]";
  const link = (url: string, title: string) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-primary underline [overflow-wrap:anywhere]"
    >
      {title || new URL(url).hostname}
    </a>
  );
  return (
    <section
      aria-label={t("Ανεξάρτητη εκτίμηση AI", "Independent AI assessment")}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card/80 p-4 text-card-foreground"
    >
      <h3 className="font-semibold">{t("Ανεξάρτητη εκτίμηση AI", "Independent AI assessment")}</h3>
      {report.coverage !== "complete" ? (
        <p role="status" className="break-words text-sm text-amber-500">
          {t(
            "Ατελής κάλυψη πηγών. Δεν εφαρμόζεται τελική εκτίμηση.",
            "Source coverage is incomplete. No final assessment is applied.",
          )}{" "}
          {en ? "See available sources below." : reasons[report.reason]}
        </p>
      ) : (
        <>
          <p className="break-words font-semibold text-primary">
            {j?.selection
              ? footballEvidenceMarketLabel(j.selection, locale)
              : t("Αποχή: ανεπαρκή στοιχεία.", "Abstention: insufficient evidence.")}
          </p>
          <p className="break-words text-sm">{j?.rationale}</p>
        </>
      )}
      <p className="break-words text-xs text-muted-foreground">
        {t("Αποτελέσματα αναζήτησης", "Search results")}: {report.counts.discovered} ·{" "}
        {t("Πηγές με raw κείμενο", "Raw-readable sources")}: {report.counts.readable} ·{" "}
        {t("Μόνο απόσπασμα", "Snippet only")}: {report.counts.snippetOnly} ·{" "}
        {t("Υποψήφιες συντακτικές επιλογές", "Editorial candidates")}:{" "}
        {report.counts.editorialCandidates} · {t("Ανεξάρτητοι εκδότες", "Independent publishers")}:{" "}
        {report.counts.independentPublishers} · {t("Παραπομπές εκτίμησης", "Cited")}:{" "}
        {report.counts.cited}
      </p>
      {report.counts.independentPublishers === 1 && (
        <p className="text-xs">
          {t("Μία ανεξάρτητη επαληθευμένη πηγή.", "One independently verified publisher.")}
        </p>
      )}
      {independent > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("Συμφωνία αναλυτών", "Publisher agreement")}: {votes}/{independent} ·{" "}
          {t("Διαφορετικές εκτιμήσεις", "Different opinions")}: {origins.size - votes}.{" "}
          {t(
            "Γνώμες πηγών, όχι πιθανότητα επιτυχίας.",
            "Source opinions, not success probability.",
          )}
        </p>
      )}
      <details className="rounded-lg border border-border p-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          {t("Πηγές αναζήτησης", "Search sources")} ({report.sources.length})
        </summary>
        <ul
          tabIndex={0}
          aria-label={t("Πηγές αναζήτησης", "Search sources")}
          className={
            rows + " focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          }
        >
          {report.sources.map((s, i) => (
            <li key={s.id} className="break-words [overflow-wrap:anywhere]">
              {s.url
                ? link(s.url, s.title)
                : t("Μη ασφαλής σύνδεσμος αποκλείστηκε", "Unsafe URL omitted") + " " + (i + 1)}
              <p>
                {s.language.toUpperCase()} ·{" "}
                {s.status === "duplicate"
                  ? t("Διπλότυπος σύνδεσμος", "Duplicate URL")
                  : s.status === "snippet_only"
                    ? t("Μόνο απόσπασμα αναζήτησης", "Snippet only")
                    : s.status === "invalid_or_unsafe_url"
                      ? t("Μη διαθέσιμη", "Unavailable")
                      : t(
                          "Raw κείμενο παρόχου — άγνωστη πληρότητα άρθρου",
                          "Provider raw text — article completeness unknown",
                        )}{" "}
                ·{" "}
                {s.readBytes > 0 && s.readBytes === s.availableBytes
                  ? t(
                      "Δόθηκε σε ολοκληρωμένο στάδιο ανάγνωσης",
                      "Supplied to completed reading stage",
                    )
                  : s.readBytes > 0
                    ? t("Μερική ανάγνωση", "Partially read")
                    : t("Η ανάγνωση δεν επιβεβαιώθηκε", "Reading not confirmed")}
              </p>
            </li>
          ))}
        </ul>
      </details>
      <details className="rounded-lg border border-border p-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          {t("Δημοσιευμένες προβλέψεις που εντοπίστηκαν", "Published prediction candidates")} (
          {report.candidates.length})
        </summary>
        {!report.candidates.length ? (
          <p className="text-xs">
            {t(
              "Δεν εντοπίστηκε τεκμηριωμένη υποψήφια πρόβλεψη.",
              "No source-grounded prediction was identified.",
            )}
          </p>
        ) : (
          <ul
            tabIndex={0}
            aria-label={t(
              "Δημοσιευμένες προβλέψεις που εντοπίστηκαν",
              "Published prediction candidates",
            )}
            className={
              rows + " focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            }
          >
            {report.candidates.map((c) => (
              <li key={c.id} className="space-y-1 break-words [overflow-wrap:anywhere]">
                <p className="font-semibold">
                  {source(c.sourceId)?.title} · {footballEvidenceMarketLabel(c.market, locale)}
                </p>
                {c.quoteVerified ? (
                  <blockquote className="border-l-2 border-border pl-2">{c.quote}</blockquote>
                ) : (
                  <p>
                    {t(
                      "Το μη επαληθευμένο απόσπασμα δεν εμφανίζεται.",
                      "Unverified quotation withheld.",
                    )}
                  </p>
                )}
                <p>
                  {c.eligibleForConsensus
                    ? t(
                        "Αποδεκτή ανεξάρτητη συντακτική επιλογή",
                        "Accepted independent editorial pick",
                      )
                    : c.quoteVerified && c.fixtureVerified
                      ? t("Προσωρινή ερμηνεία", "Provisional interpretation")
                      : t("Απορρίφθηκε", "Rejected")}
                </p>
                <p>
                  {c.reasons
                    .map((r) =>
                      en
                        ? "Evidence needs verification"
                        : (exclusions[r] ?? "Χρειάζεται επιβεβαίωση"),
                    )
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details className="rounded-lg border border-border p-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          {t("Πηγές τελικής ανεξάρτητης εκτίμησης", "Sources cited by the final assessment")} (
          {report.counts.cited})
        </summary>
        <ul className="min-w-0 space-y-2 text-xs">
          {report.citedSourceIds
            .map(source)
            .filter(Boolean)
            .filter((s, i, a) => a.findIndex((v) => v?.url === s?.url) === i)
            .map((s) => (
              <li key={s!.id}>{link(s!.url!, s!.title)}</li>
            ))}
          {report.providerCitations.map((url) => (
            <li key={url}>
              {link(
                url,
                t("Δομημένα στοιχεία παρόχου", "Structured provider evidence") +
                  " · " +
                  new URL(url).hostname,
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
