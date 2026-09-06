import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLikes } from "@/lib/likes";

/** Heart toggle with a live like counter. `enabled` false for demo tracks with no DB row. */
export function LikeButton({ trackId, enabled = true }: { trackId: string; enabled?: boolean }) {
  const { count, liked, canLike, toggle } = useLikes(trackId, enabled);

  return (
    <button
      aria-label={liked ? "Remove like" : "Like track"}
      aria-pressed={liked}
      title={canLike ? (liked ? "Remove like" : "Like track") : "Sign in to like"}
      disabled={!enabled}
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
