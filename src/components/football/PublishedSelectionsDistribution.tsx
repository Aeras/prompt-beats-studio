import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/i18n";
import { researchMarketLabel } from "@/lib/football-independent-markets.shared";
import type { aggregatePublishedSelections } from "@/lib/football-published-distribution.shared";

export function PublishedSelectionsDistribution({
  distribution,
}: {
  distribution: ReturnType<typeof aggregatePublishedSelections>;
}) {
  const { language } = useI18n();
  const en = language === "en";
  if (!distribution.total) return null;
  const number = new Intl.NumberFormat(en ? "en" : "el", { maximumFractionDigits: 1 });
  return (
    <div className="min-w-0 space-y-3 border-b border-border pb-4">
      <h4 className="text-sm font-semibold">
        {en ? "Published prediction distribution" : "Κατανομή δημοσιευμένων προβλέψεων"}
      </h4>
      <p className="text-xs text-muted-foreground">
        {en
          ? "Frequency in the collected sample, not outcome probability or independent consensus. Each choice counts once per publication."
          : "Συχνότητα στο συλλεγμένο δείγμα, όχι πιθανότητα έκβασης ή ανεξάρτητη συναίνεση. Κάθε επιλογή μετρά μία φορά ανά δημοσίευση."}
      </p>
      <ul className="space-y-3">
        {distribution.rows.map((row) => {
          const label = researchMarketLabel(row.market, en ? "en" : "el");
          const valueText = `${row.count} / ${distribution.total} · ${number.format(row.percentage)}%`;
          return (
            <li key={row.marketKey} className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                <span className="min-w-0 flex-1 break-words font-medium [overflow-wrap:anywhere]">
                  {label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{valueText}</span>
              </div>
              <Progress
                value={row.percentage}
                aria-label={label}
                aria-valuetext={valueText}
                className="h-2 bg-muted"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
