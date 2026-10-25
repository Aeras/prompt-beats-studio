import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type LibraryRpcArgs = {
  create_playlist_with_track: {
    _name: string;
    _track_id: string | null;
    _cover_url: string | null;
  };
  add_playlist_track_atomic: { _playlist_id: string; _track_id: string };
};

/**
 * Narrow bridge for the additive migration pending regeneration of the managed
 * database types. SQL replay verifies these exact signatures; callers validate
 * the JSON result. Reuses the caller's client/JWT, never an admin client.
 */
export function libraryRpc<Name extends keyof LibraryRpcArgs>(
  client: SupabaseClient<Database>,
  name: Name,
  args: LibraryRpcArgs[Name],
) {
  const rpc = client.rpc as unknown as (
    name: Name,
    args: LibraryRpcArgs[Name],
  ) => PromiseLike<{ data: Json | null; error: PostgrestError | null }>;
  return rpc.call(client, name, args);
}
