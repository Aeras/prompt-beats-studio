import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LikeState = { count: number; liked: boolean };

/** Live like count + whether the signed-in user has liked this track. */
export function useLikes(trackId: string, enabled = true) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const key = ["likes", trackId, userId];

  const query = useQuery<LikeState>({
    queryKey: key,
    enabled,
    queryFn: async () => {
      // Public like counts come from a count-only function; the likes table
      // itself is only readable for the signed-in user's own rows.
      const { data: countData } = await supabase.rpc("like_count", { _track_id: trackId });
      const count = typeof countData === "number" ? countData : 0;
      let liked = false;
      if (userId) {
        const { data } = await supabase
          .from("likes")
          .select("id")
          .eq("track_id", trackId)
          .eq("user_id", userId)
          .maybeSingle();
        liked = Boolean(data);
      }
      return { count: count ?? 0, liked };
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in to like tracks");
      const liked = queryClient.getQueryData<LikeState>(key)?.liked ?? false;
      if (liked) {
        const { error } = await supabase
          .from("likes")
          .delete()
          .eq("track_id", trackId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("likes").insert({ track_id: trackId, user_id: userId });
        if (error) throw error;
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<LikeState>(key);
      if (prev) {
        queryClient.setQueryData<LikeState>(key, {
          liked: !prev.liked,
          count: Math.max(0, prev.count + (prev.liked ? -1 : 1)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return {
    count: query.data?.count ?? 0,
    liked: query.data?.liked ?? false,
    canLike: Boolean(userId),
    toggle: () => toggle.mutate(),
  };
}
