import type { ButtonHTMLAttributes } from "react";
import { GripVertical } from "lucide-react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ArrangementSection } from "@/lib/song-arrangement.shared";

type Props = {
  section: ArrangementSection;
  label: string;
  selected: boolean;
  onSelect: () => void;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
};

export function ArrangementSectionCard({
  section,
  label,
  selected,
  onSelect,
  dragHandleProps,
}: Props) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "relative min-w-[9.5rem] rounded-2xl border transition-colors",
        selected
          ? "border-accent/60 bg-accent/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_30%,transparent)]"
          : "border-white/10 bg-black/30 hover:border-accent/35",
      )}
    >
      {dragHandleProps && (
        <button
          type="button"
          {...dragHandleProps}
          aria-label={t("generator.arrangement.dragHandle", { section: label })}
          className={cn(
            "absolute right-2 top-2 z-10 inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-lg border border-white/10 bg-black/35 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent active:cursor-grabbing",
            dragHandleProps.className,
          )}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full p-3 pr-11 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-xs font-semibold text-foreground">{label}</span>
          <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            E {section.energy ?? "—"}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">
          {section.instruction.trim() || t("generator.arrangement.noBlueprint")}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            {section.instruction.trim()
              ? t("generator.arrangement.blueprintSet")
              : t("generator.arrangement.blueprintUnset")}
          </span>
        </div>
      </button>
    </div>
  );
}
