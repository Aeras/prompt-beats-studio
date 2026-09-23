import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Orbit } from "lucide-react";

import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { getProjectSongUniverseMembership } from "@/lib/song-universe-membership.functions";

export function SongUniverseProjectBadge({ projectId }: { projectId: string }) {
  const { language } = useI18n();
  const access = useFeatureAccess("song_universe");
  const membership = useQuery({
    queryKey: ["song-universe-project-membership", projectId],
    queryFn: () => getProjectSongUniverseMembership({ data: { projectId } }),
    enabled: access.allowed,
  });

  if (!access.allowed || !membership.data?.membership) return null;
  const value = membership.data.membership;

  return (
    <Link
      to="/song-universe"
      className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[11px] font-medium text-accent hover:border-accent/50"
      title={language === "el" ? "Άνοιγμα Song Universes" : "Open Song Universes"}
    >
      <Orbit className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {language === "el" ? "Universe" : "Universe"}: {value.universeTitle}
      </span>
      {value.intentionalOutlier && (
        <span className="shrink-0 text-muted-foreground">
          · {language === "el" ? "σκόπιμη απόκλιση" : "intentional outlier"}
        </span>
      )}
    </Link>
  );
}
