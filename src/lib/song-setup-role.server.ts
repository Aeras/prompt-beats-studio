import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export async function getSongSetupRoleFlags(supabase: SupabaseClient<Database>) {
  const [{ data: isAdminLevel }, { data: isSuperAdmin }] = await Promise.all([
    supabase.rpc("current_user_is_admin_level"),
    supabase.rpc("current_user_is_super_admin"),
  ]);

  return {
    isAdminLevel: isAdminLevel === true,
    isSuperAdmin: isSuperAdmin === true,
  };
}
