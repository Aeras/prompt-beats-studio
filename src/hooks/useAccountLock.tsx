import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type AccountLockStatus = {
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
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc("get_my_account_status");
      if (error) throw new Error(error.message);
      return (result ?? { is_banned: false, reason: null, blocked_at: null }) as unknown as AccountLockStatus;
    },
  });
  return {
    isLocked: Boolean(data?.is_banned),
    reason: data?.reason ?? null,
    blockedAt: data?.blocked_at ?? null,
    loading: authLoading || (Boolean(user) && isLoading),
    error: Boolean(user) && isError,
    authenticated: Boolean(user),
  };
}
