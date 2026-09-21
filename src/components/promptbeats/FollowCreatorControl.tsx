import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import {
  followCreator,
  getCreatorFollowSummary,
  listCreatorFollowProfiles,
  unfollowCreator,
  type FollowProfile,
} from "@/lib/follow-notifications.functions";

type FollowSummary = {
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

function FollowListDialog({
  userId,
  mode,
  open,
  onOpenChange,
}: {
  userId: string;
  mode: "followers" | "following";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { language } = useI18n();
  const query = useInfiniteQuery({
    queryKey: ["creator-follow-list", userId, mode],
    enabled: open,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listCreatorFollowProfiles({ data: { userId, mode, page: pageParam } }),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length : undefined,
  });
  const profiles = query.data?.pages.flatMap((page) => page.profiles) ?? [];
  const title = mode === "followers"
    ? (language === "el" ? "Ακόλουθοι" : "Followers")
    : (language === "el" ? "Ακολουθεί" : "Following");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {language === "el" ? "Δημόσια προφίλ δημιουργών." : "Public creator profiles."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[58dvh] space-y-2 overflow-y-auto pr-1">
          {query.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">{language === "el" ? "Φόρτωση…" : "Loading…"}</p>}
          {!query.isLoading && profiles.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{language === "el" ? "Δεν υπάρχουν ακόμη." : "None yet."}</p>}
          {profiles.map((profile: FollowProfile) => (
            <Link
              key={profile.id}
              to="/artist/$id"
              params={{ id: profile.id }}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 transition-colors hover:border-accent/35 hover:bg-accent/[0.04]"
            >
              <img src={getUserAvatarUrl(profile.avatarUrl)} alt="" className="h-10 w-10 rounded-full object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{profile.artistAlias || profile.displayName || profile.handle}</span>
                <span className="block truncate text-xs text-muted-foreground">@{profile.handle}</span>
              </span>
            </Link>
          ))}
          {query.hasNextPage && (
            <button
              type="button"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
              className="w-full rounded-xl border border-white/10 px-3 py-2.5 text-sm text-muted-foreground hover:text-accent disabled:opacity-50"
            >
              {query.isFetchingNextPage ? (language === "el" ? "Φόρτωση…" : "Loading…") : (language === "el" ? "Περισσότερα" : "Load more")}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FollowCreatorControl({ userId }: { userId: string }) {
  const { user } = useAuth();
  const featureAccess = useFeatureAccess("follow_creators");
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const [listMode, setListMode] = useState<"followers" | "following" | null>(null);
  const queryKey = ["creator-follow-summary", user?.id ?? "anon", userId];
  const summary = useQuery({
    queryKey,
    enabled: Boolean(user) && featureAccess.allowed,
    queryFn: () => getCreatorFollowSummary({ data: { userId } }),
    staleTime: 30_000,
  });
  const isSelf = user?.id === userId;

  const mutation = useMutation({
    mutationFn: async (following: boolean) =>
      following
        ? unfollowCreator({ data: { userId } })
        : followCreator({ data: { userId } }),
    onMutate: async (following) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FollowSummary>(queryKey);
      if (previous) {
        queryClient.setQueryData<FollowSummary>(queryKey, {
          ...previous,
          isFollowing: !following,
          followerCount: Math.max(0, previous.followerCount + (following ? -1 : 1)),
        });
      }
      return { previous };
    },
    onError: (error, _following, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(error instanceof Error ? error.message : (language === "el" ? "Η ενέργεια απέτυχε." : "Action failed."));
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      void queryClient.invalidateQueries({ queryKey: ["creator-follow-list", userId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
    },
  });

  if (!user || !featureAccess.allowed) return null;
  const data = summary.data;
  const hasKnownState = Boolean(data);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!isSelf && (
          <button
            type="button"
            disabled={!hasKnownState || mutation.isPending}
            onClick={() => data && mutation.mutate(data.isFollowing)}
            className={
              "inline-flex min-w-28 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 " +
              (data?.isFollowing
                ? "border-accent/50 bg-accent/12 text-accent shadow-[0_0_18px_color-mix(in_oklab,var(--neon)_16%,transparent)] hover:bg-accent/15"
                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15")
            }
          >
            {mutation.isPending || summary.isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : data?.isFollowing
                ? <UserCheck className="h-4 w-4" />
                : <UserPlus className="h-4 w-4" />}
            {data?.isFollowing
              ? (language === "el" ? "Ακολουθείς ✓" : "Following ✓")
              : hasKnownState
                ? (language === "el" ? "Ακολούθησε" : "Follow")
                : (language === "el" ? "Έλεγχος…" : "Checking…")}
          </button>
        )}

        {data && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <button type="button" onClick={() => setListMode("followers")} className="hover:text-accent">
              <strong className="text-foreground">{data.followerCount}</strong>{" "}
              {language === "el" ? "Ακόλουθοι" : "Followers"}
            </button>
            <button type="button" onClick={() => setListMode("following")} className="hover:text-accent">
              <strong className="text-foreground">{data.followingCount}</strong>{" "}
              {language === "el" ? "Ακολουθεί" : "Following"}
            </button>
          </div>
        )}
      </div>

      {summary.isError && (
        <button
          type="button"
          onClick={() => void summary.refetch()}
          className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-accent hover:underline"
        >
          {language === "el"
            ? (data ? "Προσωρινό πρόβλημα συγχρονισμού — επανάληψη" : "Δεν ήταν δυνατός ο έλεγχος — επανάληψη")
            : (data ? "Temporary sync issue — retry" : "Could not check follow status — retry")}
        </button>
      )}

      {listMode && (
        <FollowListDialog
          userId={userId}
          mode={listMode}
          open={Boolean(listMode)}
          onOpenChange={(open) => !open && setListMode(null)}
        />
      )}
    </>
  );
}
