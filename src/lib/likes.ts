import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LikeState = { count: number; liked: boolean };

/** Live like count + whether the signed-in user has liked this track. */
export function useLikes(trackId: string, enabled = true) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const mutationInFlightRef = useRef(false);
  const key = ["likes", trackId, userId];

  const query = useQuery<LikeState>({
    queryKey: key,
    enabled,
    queryFn: async () => {
      // Public like totals come from a count-only view; who liked what is never
      // exposed (the likes table only reveals the signed-in user's own rows).
      const { data: countData, error: countError } = await supabase
        .from("track_like_counts")
        .select("like_count")
        .eq("track_id", trackId)
        .maybeSingle();
      if (countError) throw countError;
      const raw = (countData as { like_count: number | string | null } | null)?.like_count;
      const count = raw == null ? 0 : Number(raw);
      let liked = false;
      if (userId) {
        const { data, error: ownLikeError } = await supabase
          .from("likes")
          .select("id")
          .eq("track_id", trackId)
          .eq("user_id", userId)
          .maybeSingle();
        if (ownLikeError) throw ownLikeError;
        liked = Boolean(data);
      }
      return { count: count ?? 0, liked };
    },
  });

  const toggle = useMutation({
    mutationFn: async (wasLiked: boolean) => {
      if (!userId) throw new Error("Sign in to like tracks");
      if (wasLiked) {
        const { error } = await supabase
          .from("likes")
          .delete()
          .eq("track_id", trackId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("likes")
          .insert({ track_id: trackId, user_id: userId });
        if (error) throw error;
      }
    },
    onMutate: async (wasLiked) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<LikeState>(key);
      if (prev) {
        queryClient.setQueryData<LikeState>(key, {
          liked: !wasLiked,
          count: Math.max(0, prev.count + (wasLiked ? -1 : 1)),
        });
      }
      // Keep the Liked Tracks library immediately in sync when removing a like.
      // For additions, refetch the authorized server projection (visibility and
      // moderation filters must not be bypassed by inserting a raw card).
      const libraryKey = ["library", "liked", userId];
      await queryClient.cancelQueries({ queryKey: libraryKey });
      const previousLibrary = queryClient.getQueryData<{ tracks: Array<{ id: string }> }>(libraryKey);
      if (wasLiked && previousLibrary) {
        queryClient.setQueryData(libraryKey, {
          ...previousLibrary,
          tracks: previousLibrary.tracks.filter((track) => track.id !== trackId),
        });
      }
      return { prev, previousLibrary, libraryKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
      if (ctx?.previousLibrary) queryClient.setQueryData(ctx.libraryKey, ctx.previousLibrary);
    },
    onSettled: () => {
      mutationInFlightRef.current = false;
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["library", "liked", userId] }),
      ]);
    },
  });

  return {
    count: query.data?.count ?? 0,
    liked: query.data?.liked ?? false,
    canLike: Boolean(userId),
    isPending: toggle.isPending,
    toggle: () => {
      if (mutationInFlightRef.current) return;
      const wasLiked = queryClient.getQueryData<LikeState>(key)?.liked ?? false;
      mutationInFlightRef.current = true;
      try {
        toggle.mutate(wasLiked);
      } catch (error) {
        mutationInFlightRef.current = false;
        throw error;
      }
    },
  };
}
