import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLikes } from "@/lib/likes";
import { useI18n } from "@/i18n";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

/** Heart toggle with a live like counter. */
export function LikeButton({ trackId, enabled = true }: { trackId: string; enabled?: boolean }) {
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
        "flex shrink-0 items-center gap-1.5 text-xs transition-colors",
        liked ? "text-primary" : "text-muted-foreground hover:text-primary",
      )}
    >
      <Heart className={cn("h-4 w-4", liked && "fill-current drop-shadow-[0_0_8px_var(--neon)]")} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
