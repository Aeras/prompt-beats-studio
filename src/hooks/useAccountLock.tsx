import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type AccountLockStatus = {
  status: "active" | "blocked" | "invalid";
  is_banned: boolean;
  reason: string | null;
  blocked_at: string | null;
};

export function useAccountLock() {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["account-lock", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc("get_my_account_status");
      if (error) throw new Error(error.message);
      const status = (result as { status?: unknown } | null)?.status;
      if (status !== "active" && status !== "blocked" && status !== "invalid") {
        return { status: "invalid", is_banned: false, reason: null, blocked_at: null };
      }
      if (status === "invalid") return { status, is_banned: false, reason: null, blocked_at: null };
      const typedResult = result as {
        status: "active" | "blocked";
        is_banned?: unknown;
        reason?: unknown;
        blocked_at?: unknown;
      };
      return {
        status: typedResult.status,
        is_banned: typedResult.is_banned === true,
        reason: typeof typedResult.reason === "string" ? typedResult.reason : null,
        blocked_at: typeof typedResult.blocked_at === "string" ? typedResult.blocked_at : null,
      };
    },
  });
  return {
    isLocked: Boolean(data?.is_banned),
    isInvalid: data?.status === "invalid",
    reason: data?.reason ?? null,
    blockedAt: data?.blocked_at ?? null,
    loading: authLoading || (Boolean(user) && isLoading),
    error: Boolean(user) && isError,
    authenticated: Boolean(user),
  };
}
