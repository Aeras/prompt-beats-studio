import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLikes } from "@/lib/likes";
import { useI18n } from "@/i18n";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

/** Heart toggle with a live like counter. */
export function LikeButton({
  trackId,
  enabled = true,
  compact = false,
}: {
  trackId: string;
  enabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const featureAccess = useFeatureAccess("likes");
  const { count, liked, canLike, isPending, toggle } = useLikes(
    trackId,
    enabled && featureAccess.allowed,
  );
  const label = liked ? t("like.remove") : t("like.add");

  if (!featureAccess.allowed) return null;

  return (
    <button
      aria-label={label}
      aria-pressed={liked}
      title={canLike ? label : t("nav.signIn")}
      disabled={!enabled || isPending}
      onClick={() => {
        if (canLike) toggle();
      }}
      className={cn(
        "flex shrink-0 items-center justify-center text-xs transition-colors",
        compact ? "h-9 w-8" : "h-9 min-w-7 gap-1",
        liked ? "text-primary" : "text-muted-foreground hover:text-primary",
      )}
    >
      <Heart
        className={cn(
          compact ? "h-[15px] w-[15px]" : "h-[17px] w-[17px]",
          liked && "fill-current drop-shadow-[0_0_8px_var(--neon)]",
        )}
      />
      {!compact && count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
