import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { getServerSupabasePublicConfig } from "@/integrations/supabase/config.server";

/** Publishable-key client for public (anon) reads and token verification on the server. */
export function createPublicServerClient(accessToken?: string) {
  const { url, publishableKey: key } = getServerSupabasePublicConfig();

  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        if (accessToken) h.set("Authorization", `Bearer ${accessToken}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Verifies a bearer token from a raw HTTP request and returns the user id. */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const supabase = createPublicServerClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile, error: profileError } = await supabase
    .from("profile_private")
    .select("is_banned")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.is_banned === true) return null;
  return data.user.id;
}
