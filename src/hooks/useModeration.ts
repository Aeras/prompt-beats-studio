import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { getMyModeration, type ModerationContext } from "@/lib/moderation.functions";

/** Admin / banned status for the signed-in user (false for signed-out visitors). */
export function useModeration() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["moderation", user?.id ?? "anon"],
    queryFn: () => getMyModeration() as Promise<ModerationContext>,
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  return {
    isAdmin: data?.role === "admin",
    isBanned: false,
    role: data?.role ?? "user",
    moderationStatus: data?.status ?? "active",
    canViewUsers: data?.can_view_users === true,
    canBlockUsers: data?.can_block_users === true,
    canUnblockUsers: data?.can_unblock_users === true,
    canSuspendModerator: data?.can_suspend_moderator === true,
    canManageRoles: data?.can_manage_roles === true,
    canDeleteUsers: data?.can_delete_users === true,
    canManageRegistrationBlocks: data?.can_manage_registration_blocks === true,
    canManageModelAccess: data?.can_manage_model_access === true,
    canAccessAdminSettings: data?.can_access_admin_settings === true,
  };
}
