import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getMyModeration } from "@/lib/moderation.functions";

/** Admin / banned status for the signed-in user (false for signed-out visitors). */
export function useModeration() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["moderation", user?.id ?? "anon"],
    queryFn: () => getMyModeration(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  return { isAdmin: Boolean(data?.isAdmin), isBanned: Boolean(data?.isBanned) };
}
