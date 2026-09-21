import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getMyFeatureAccess, type FeatureKey } from "@/lib/feature-access.functions";

export function useFeatureAccess(featureKey: FeatureKey) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["feature-access", featureKey, user?.id ?? "anon"],
    queryFn: () => getMyFeatureAccess({ data: { featureKey } }),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
  });

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    allowed: query.data?.allowed === true,
    refetch: query.refetch,
  };
}
