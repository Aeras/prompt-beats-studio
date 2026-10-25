import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
type BetaRpcArgs = {
  beta_features_list: Record<string, never>;
  beta_feature_transition: {
    _feature_key: string;
    _action: string;
    _expected_revision: number;
    _confirmed: boolean;
  };
  beta_tester_detail: { _user_id: string };
  beta_tester_set: { _user_id: string; _enabled: boolean; _expected_enabled: boolean };
};
/** Narrow additive-RPC bridge until managed types regenerate. SQL tests verify
 * signatures/authorization; callers parse JSON. Preserve the caller JWT client.
 */
export function betaRpc<Name extends keyof BetaRpcArgs>(
  client: SupabaseClient<Database>,
  name: Name,
  args: BetaRpcArgs[Name],
) {
  const rpc = client.rpc as unknown as (
    name: Name,
    args: BetaRpcArgs[Name],
  ) => PromiseLike<{ data: Json | null; error: PostgrestError | null }>;
  return rpc.call(client, name, args);
}
