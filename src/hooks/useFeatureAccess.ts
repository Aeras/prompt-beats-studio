import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getMyFeatureAccess, type FeatureKey } from "@/lib/feature-access.functions";

const LIBRARY_FEATURE_TABS: Partial<Record<FeatureKey, string>> = {
  playlists: "playlists",
  favorites: "favorites",
  likes: "likes",
};

export function shouldPreserveRequestedLibraryTab(featureKey: FeatureKey, isLoading: boolean) {
  if (!isLoading || typeof window === "undefined") return false;

  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const featureTab = LIBRARY_FEATURE_TABS[featureKey];

  return window.location.pathname === "/library" && Boolean(featureTab && requestedTab === featureTab);
}

export function useFeatureAccess(featureKey: FeatureKey) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["feature-access", featureKey, user?.id ?? "anon"],
    queryFn: () => getMyFeatureAccess({ data: { featureKey } }),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
  });

  // A gated Library tab can be present in the URL before its access query has
  // resolved after a hard refresh. Keep that requested tab mounted only during
  // the pending access check so LibraryPage does not erase the URL and fall
  // back to My Tracks. A resolved denial still wins immediately.
  const preserveRequestedLibraryTab =
    query.data === undefined && shouldPreserveRequestedLibraryTab(featureKey, query.isLoading);

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    allowed: query.data?.allowed === true || preserveRequestedLibraryTab,
    refetch: query.refetch,
  };
}
