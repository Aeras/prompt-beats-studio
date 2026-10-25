import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getMyFeatureAccess, type FeatureKey } from "@/lib/feature-access.functions";
import { isBetaFeatureKey } from "@/lib/beta-feature-registry";

const LIBRARY_FEATURE_TABS: Partial<Record<FeatureKey, string>> = {
  playlists: "playlists",
  favorites: "favorites",
  likes: "likes",
};

export function shouldPreserveRequestedLibraryTab(featureKey: FeatureKey, isPending: boolean) {
  if (!isPending || typeof window === "undefined") return false;

  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const featureTab = LIBRARY_FEATURE_TABS[featureKey];

  return (
    window.location.pathname === "/library" && Boolean(featureTab && requestedTab === featureTab)
  );
}

export function useFeatureAccess(featureKey: FeatureKey) {
  const { user, loading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: ["feature-access", featureKey, user?.id ?? "anon"],
    queryFn: () => getMyFeatureAccess({ data: { featureKey } }),
    enabled: Boolean(user),
    staleTime: isBetaFeatureKey(featureKey) ? 0 : 30_000,
    refetchInterval: isBetaFeatureKey(featureKey) ? 15_000 : false,
    refetchOnWindowFocus: "always",
  });

  // On a hard refresh, auth can still be hydrating before the feature query is
  // enabled. Preserve a gated Library tab from the URL through both phases so
  // LibraryPage does not erase it and fall back to My Tracks. Once access has
  // resolved, the authoritative result takes over immediately.
  const preserveRequestedLibraryTab =
    query.data === undefined &&
    shouldPreserveRequestedLibraryTab(featureKey, authLoading || query.isLoading);

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    allowed: isBetaFeatureKey(featureKey)
      ? Boolean(user) && query.data?.allowed === true && !query.isError
      : query.data?.allowed === true || preserveRequestedLibraryTab,
    refetch: query.refetch,
  };
}
