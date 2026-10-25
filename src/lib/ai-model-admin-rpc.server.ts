import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type Args = {
  admin_get_global_ai_usage: Record<string, never>;
  admin_set_global_ai_usage: { _enabled: boolean; _expected_revision: number };
  admin_ai_model_controls: Record<string, never>;
  admin_patch_ai_model: { _id: string; _patch: Json; _expected_revision: number };
  admin_uninstall_ai_models: { _models: Json; _confirmed: boolean };
  admin_set_ai_model_default: { _operation: string; _model: string };
};
// Additive, SQL-tested RPC signatures pending managed type regeneration. Keep
// the caller JWT: these functions authenticate and authorize inside PostgreSQL.
export function aiModelAdminRpc<N extends keyof Args>(
  client: SupabaseClient<Database>,
  name: N,
  args: Args[N],
) {
  const rpc = client.rpc as unknown as (
    name: N,
    args: Args[N],
  ) => PromiseLike<{ data: Json | null; error: PostgrestError | null }>;
  return rpc.call(client, name, args);
}
