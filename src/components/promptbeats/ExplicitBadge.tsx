import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function ExplicitBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const label = t("explicit.tooltip");
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border border-white/20 bg-black/65 font-bold uppercase tracking-wide text-white/85 backdrop-blur-sm",
        compact ? "h-4 min-w-4 px-1 text-[8px]" : "h-5 min-w-5 px-1.5 text-[9px]",
      )}
    >
      E
    </span>
  );
}
