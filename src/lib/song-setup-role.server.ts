type SongSetupRoleClient = {
  rpc: (
    fn: "current_user_is_admin_level" | "current_user_is_super_admin",
  ) => PromiseLike<{ data: boolean | null }>;
};

export async function getSongSetupRoleFlags(supabase: SongSetupRoleClient) {
  const [{ data: isAdminLevel }, { data: isSuperAdmin }] = await Promise.all([
    supabase.rpc("current_user_is_admin_level"),
    supabase.rpc("current_user_is_super_admin"),
  ]);

  return {
    isAdminLevel: isAdminLevel === true,
    isSuperAdmin: isSuperAdmin === true,
  };
}
