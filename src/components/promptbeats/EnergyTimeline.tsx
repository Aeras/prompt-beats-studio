import { useMemo } from "react";

import { useI18n } from "@/i18n";
import type { ArrangementSection } from "@/lib/song-arrangement.shared";

type Props = {
  sections: ArrangementSection[];
  labelForSection: (value: string) => string;
};

function displayLabel(
  sections: ArrangementSection[],
  section: ArrangementSection,
  labelForSection: (value: string) => string,
) {
  const sameTypeCount = sections.filter((item) => item.sectionType === section.sectionType).length;
  return sameTypeCount > 1
    ? `${labelForSection(section.sectionType)} ${section.occurrence}`
    : labelForSection(section.sectionType);
}

export function EnergyTimeline({ sections, labelForSection }: Props) {
  const { t } = useI18n();

  const points = useMemo(() => {
    if (!sections.length) return [];
    const width = Math.max(1, sections.length - 1);
    return sections.map((section, index) => ({
      section,
      x: sections.length === 1 ? 50 : (index / width) * 100,
      y: section.energy == null ? null : 92 - ((section.energy - 1) / 4) * 78,
    }));
  }, [sections]);

  const segments = useMemo(() => {
    const result: string[] = [];
    let active: string[] = [];
    for (const point of points) {
      if (point.y == null) {
        if (active.length > 1) result.push(active.join(" "));
        active = [];
        continue;
      }
      active.push(`${point.x},${point.y}`);
    }
    if (active.length > 1) result.push(active.join(" "));
    return result;
  }, [points]);

  if (!sections.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("generator.arrangement.energyCurve")}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {t("generator.arrangement.energyCurveHint")}
          </p>
        </div>
        <div className="text-[10px] text-muted-foreground" aria-label={t("generator.arrangement.energySequence")}>
          {sections.map((section) => section.energy ?? "—").join(" / ")}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[28rem]">
          <svg
            viewBox="0 0 100 108"
            role="img"
            aria-label={t("generator.arrangement.energyCurveAria")}
            className="h-36 w-full overflow-visible"
            preserveAspectRatio="none"
          >
            {[1, 2, 3, 4, 5].map((energy) => {
              const y = 92 - ((energy - 1) / 4) * 78;
              return (
                <g key={energy}>
                  <line
                    x1="0"
                    y1={y}
                    x2="100"
                    y2={y}
                    className="stroke-white/10"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x="0"
                    y={y - 2}
                    className="fill-muted-foreground text-[3px]"
                  >
                    {energy}
                  </text>
                </g>
              );
            })}

            {segments.map((segment, index) => (
              <polyline
                key={index}
                points={segment}
                fill="none"
                className="stroke-accent"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {points.map(({ section, x, y }) =>
              y == null ? (
                <circle
                  key={section.sectionId}
                  cx={x}
                  cy="101"
                  r="1.4"
                  className="fill-muted-foreground/50"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <circle
                  key={section.sectionId}
                  cx={x}
                  cy={y}
                  r="1.8"
                  className="fill-accent stroke-background"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ),
            )}
          </svg>

          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}>
            {sections.map((section) => (
              <div key={section.sectionId} className="min-w-0 text-center">
                <p className="truncate text-[9px] text-muted-foreground">
                  {displayLabel(sections, section, labelForSection)}
                </p>
                <p className="text-[10px] font-semibold text-foreground">
                  {section.energy ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
