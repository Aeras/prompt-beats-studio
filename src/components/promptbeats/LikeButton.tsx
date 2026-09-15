import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLikes } from "@/lib/likes";
import { useI18n } from "@/i18n";

/** Heart toggle with a live like counter. */
export function LikeButton({ trackId, enabled = true }: { trackId: string; enabled?: boolean }) {
  const { t } = useI18n();
  const { count, liked, canLike, isPending, toggle } = useLikes(trackId, enabled);
  const label = liked ? t("like.remove") : t("like.add");

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
