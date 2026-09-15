import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, UserRoundPen } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";

export function ProfileBanner() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const hasName = Boolean((profile?.artist_alias ?? profile?.display_name ?? "").trim());
  const hasAvatar = Boolean(profile?.avatar_url);

  if (!user || dismissed || !profile || (hasName && hasAvatar)) return null;

  return (
    <div className="glass mx-auto flex max-w-[1600px] items-center gap-3 rounded-2xl px-4 py-3 text-sm">
      <UserRoundPen className="h-4 w-4 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        {t("banner.completeProfile")}{" "}
        <Link to="/onboarding" className="text-primary hover:underline">[{t("banner.editProfile")}]</Link>
      </p>
      <button aria-label={t("banner.dismiss")} onClick={() => setDismissed(true)} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}
