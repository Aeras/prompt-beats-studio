import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type ProfileSummary = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  artist_alias: string | null;
  profile_completed: boolean;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const user: User | null = session?.user ?? null;

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let active = true;
    supabase
      .from("profiles")
      .select("handle, display_name, avatar_url, artist_alias, profile_completed")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfile(data ?? null);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return { session, user, profile, loading };
}
