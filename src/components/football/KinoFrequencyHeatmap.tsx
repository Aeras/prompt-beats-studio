import { Fragment, useMemo } from "react";
import { formatKinoCount, kinoHeatmapLevels } from "@/lib/kino-lab.presentation";

const intensity = ["bg-primary/5", "bg-primary/15", "bg-primary/30", "bg-primary/50"] as const;

export default function KinoFrequencyHeatmap({
  counts,
  label,
}: {
  counts: readonly number[];
  label: string;
}) {
  const levels = useMemo(() => kinoHeatmapLevels(counts), [counts]);
  return (
    <div className="min-w-0 space-y-2">
      <div className="grid min-w-0 grid-cols-10 gap-0.5 sm:gap-1" aria-label={label}>
        {counts.map((count, i) => (
          <div
            key={i}
            data-intensity={levels[i]}
            className={`flex min-w-0 flex-col items-center justify-center rounded border border-border px-0 py-1 text-foreground tabular-nums ${intensity[levels[i]!]}`}
            aria-label={`Αριθμός ${i + 1}: ${formatKinoCount(count)} εμφανίσεις · Ένταση ${levels[i]! + 1}/4`}
          >
            <strong className="text-xs leading-5 sm:text-sm">{i + 1}</strong>
            <span className="min-h-6 w-full text-center text-[10px] leading-3 sm:min-h-4 sm:text-xs">
              {formatKinoCount(count)
                .split(".")
                .map((group, index, groups) => (
                  <Fragment key={index}>
                    {index > 0 && <wbr />}
                    {group}
                    {index < groups.length - 1 ? "." : ""}
                  </Fragment>
                ))}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Κλίμακα έντασης">
        <span>Σχετική συχνότητα</span>
        {intensity.map((color, i) => (
          <span key={color} className={`rounded border border-border px-2 py-1 ${color}`}>
            {i + 1}/4
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Από τη χαμηλότερη στην υψηλότερη συχνότητα του δείγματος, σε τέσσερα ίσα διαστήματα. Ίσα
        πλήθη έχουν ίδια ένταση· αν όλα είναι ίσα, ένταση 1/4. Δεν αποτελεί πρόβλεψη.
      </p>
    </div>
  );
}
