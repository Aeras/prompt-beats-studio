import { cn } from "@/lib/utils";
import type { ArrangementSection } from "@/lib/song-arrangement.shared";

type Props = {
  section: ArrangementSection;
  label: string;
  selected: boolean;
  onSelect: () => void;
};

export function ArrangementSectionCard({
  section,
  label,
  selected,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "min-w-[9.5rem] rounded-2xl border p-3 text-left transition-colors",
        selected
          ? "border-accent/60 bg-accent/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_30%,transparent)]"
          : "border-white/10 bg-black/30 hover:border-accent/35",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">{label}</span>
        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
          E {section.energy ?? "—"}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">
        {section.instruction.trim() || "No Blueprint direction"}
      </p>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{section.instruction.trim() ? "Blueprint ✓" : "Blueprint —"}</span>
      </div>
    </button>
  );
}
