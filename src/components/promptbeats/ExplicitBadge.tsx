import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useExplicitContentPreference } from "@/components/promptbeats/TrackSourceFilter";

export function ExplicitBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { hideExplicit } = useExplicitContentPreference();
  const markerRef = useRef<HTMLSpanElement>(null);
  const label = t("explicit.tooltip");

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    let surface = marker.closest<HTMLElement>("article");

    if (!surface && pathname.startsWith("/track/")) {
      surface = marker.closest<HTMLElement>("div.mx-auto");
    }
    if (!surface && pathname.startsWith("/share/")) {
      surface = marker.closest<HTMLElement>("main");
    }
    if (!surface) {
      surface = marker.closest<HTMLElement>("div.glass-strong");
    }
    if (!surface) return;

    surface.hidden = hideExplicit;
    return () => {
      surface.hidden = false;
    };
  }, [hideExplicit]);

  return (
    <span
      ref={markerRef}
      data-pb-explicit-badge="true"
      title={label}
      aria-label={label}
      hidden={hideExplicit}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border border-white/20 bg-black/65 font-bold uppercase tracking-wide text-white/85 backdrop-blur-sm",
        compact ? "h-4 min-w-4 px-1 text-[8px]" : "h-5 min-w-5 px-1.5 text-[9px]",
      )}
    >
      E
    </span>
  );
}
