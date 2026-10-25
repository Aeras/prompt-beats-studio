import type { ReactNode } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import type { BetaFeatureKey } from "@/lib/beta-feature-registry";
import { useI18n } from "@/i18n";
import { betaCopy } from "@/i18n/beta";

/** Presentation only. Every sensitive server/SQL entry must check the same key. */
export function BetaFeatureGate({
  featureKey,
  children,
}: {
  featureKey: BetaFeatureKey;
  children: ReactNode;
}) {
  const access = useFeatureAccess(featureKey);
  const { language } = useI18n();
  if (access.isLoading) return <p role="status">{betaCopy[language].loading}</p>;
  if (!access.allowed) return <p role="alert">{betaCopy[language].unavailable}</p>;
  return <>{children}</>;
}
