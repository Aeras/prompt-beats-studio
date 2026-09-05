import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, UserRoundPen } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";

export function ProfileBanner() {
  const { user, profile } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!user || dismissed || !profile || profile.profile_completed) return null;

  return (
    <div className="glass mx-auto flex max-w-[1600px] items-center gap-3 rounded-2xl px-4 py-3 text-sm">
      <UserRoundPen className="h-4 w-4 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        Complete your artist profile to customize your public creator page{" "}
        <Link to="/onboarding" className="text-primary hover:underline">
          [Edit Profile]
        </Link>
      </p>
      <button
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
