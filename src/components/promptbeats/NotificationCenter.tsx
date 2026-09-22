import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Bell, CheckCheck, Flag, Loader2, Music2, Settings2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import {
  getNotificationPreferences,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
  type NotificationItem,
} from "@/lib/follow-notifications.functions";
import { cn } from "@/lib/utils";

function relativeTime(value: string, locale: "en" | "el") {
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return "";
  const seconds = Math.round((created - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(locale === "el" ? "el-GR" : "en-US", { numeric: "auto" });
  if (abs < 60) return rtf.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
}

function actorName(item: NotificationItem, fallback: string) {
  return item.actor?.artistAlias || item.actor?.displayName || item.actor?.handle || fallback;
}

function BellButton({ unread }: { unread: number }) {
  const { language } = useI18n();
  return (
    <button
      type="button"
      aria-label={language === "el" ? "Ειδοποιήσεις" : "Notifications"}
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[9px] font-bold leading-4 text-primary-foreground shadow-lg">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPreferences, setShowPreferences] = useState(false);

  const notifications = useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listNotifications({ data: { page: pageParam } }),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length : undefined,
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => getNotificationPreferences(),
  });
  const items = notifications.data?.pages.flatMap((page) => page.notifications) ?? [];

  const invalidateNotifications = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] }),
    ]);
  };

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidateNotifications,
    onError: () => toast.error(language === "el" ? "Δεν ήταν δυνατή η ενημέρωση." : "Could not update notifications."),
  });

  const savePreferences = useMutation({
    mutationFn: (next: { newTrackEnabled: boolean; newFollowerEnabled: boolean }) =>
      updateNotificationPreferences({ data: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["notification-preferences"] });
      const previous = queryClient.getQueryData(["notification-preferences"]);
      queryClient.setQueryData(["notification-preferences"], next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(["notification-preferences"], context.previous);
      toast.error(language === "el" ? "Δεν αποθηκεύτηκαν οι προτιμήσεις." : "Could not save preferences.");
    },
    onSuccess: (next) => queryClient.setQueryData(["notification-preferences"], next),
  });

  const openNotification = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await markNotificationRead({ data: { notificationId: item.id } });
        void invalidateNotifications();
      } catch {
        toast.error(language === "el" ? "Δεν ήταν δυνατή η ενημέρωση." : "Could not update notification.");
      }
    }
    if (!item.targetAvailable) return;
    onClose();
    if (item.type === "new_track" && item.track) {
      void navigate({ to: "/track/$id", params: { id: item.track.id } });
    } else if (item.type === "new_follower" && item.actor) {
      void navigate({ to: "/artist/$id", params: { id: item.actor.id } });
    } else if (item.type === "new_report" && item.reportId) {
      window.location.assign(`/management?reportId=${encodeURIComponent(item.reportId)}`);
    }
  };

  const pref = preferences.data ?? { newTrackEnabled: true, newFollowerEnabled: true };
  const fallbackCreator = language === "el" ? "Ένας δημιουργός" : "A creator";

  return (
    <div className="flex max-h-[72dvh] min-h-[22rem] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="font-display text-base font-bold">{language === "el" ? "Ειδοποιήσεις" : "Notifications"}</h2>
          <p className="text-[11px] text-muted-foreground">{language === "el" ? "Πρόσφατη δραστηριότητα" : "Recent activity"}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPreferences((value) => !value)}
            aria-label={language === "el" ? "Προτιμήσεις ειδοποιήσεων" : "Notification preferences"}
            className={cn("grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent", showPreferences && "border-accent/40 text-accent")}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
            title={language === "el" ? "Σήμανση όλων ως αναγνωσμένων" : "Mark all as read"}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent disabled:opacity-50"
          >
            {markAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {showPreferences && (
        <div className="space-y-3 border-b border-white/10 bg-black/20 px-4 py-3">
          <p className="text-xs font-semibold text-accent">{language === "el" ? "Προτιμήσεις" : "Preferences"}</p>
          {([
            ["newTrackEnabled", language === "el" ? "Νέα τραγούδια από δημιουργούς που ακολουθώ" : "New tracks from creators I follow"],
            ["newFollowerEnabled", language === "el" ? "Νέοι ακόλουθοι" : "New followers"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={pref[key]}
                disabled={savePreferences.isPending}
                onChange={(event) => savePreferences.mutate({ ...pref, [key]: event.target.checked })}
                className="h-4 w-4 accent-current"
              />
            </label>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {notifications.isLoading && <div className="grid min-h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>}
        {notifications.isError && (
          <div className="p-5 text-center">
            <p className="text-sm text-muted-foreground">{language === "el" ? "Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων." : "Could not load notifications."}</p>
            <button type="button" onClick={() => void notifications.refetch()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-accent">
              {language === "el" ? "Δοκιμή ξανά" : "Retry"}
            </button>
          </div>
        )}
        {!notifications.isLoading && !notifications.isError && items.length === 0 && (
          <div className="p-6 text-center">
            <Bell className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">{language === "el" ? "Δεν υπάρχουν ειδοποιήσεις ακόμη." : "No notifications yet."}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {language === "el"
                ? "Όταν κάποιος σε ακολουθήσει ή ένας δημιουργός που ακολουθείς δημοσιεύσει νέο τραγούδι, θα το δεις εδώ."
                : "When someone follows you or a creator you follow publishes a new track, you'll see it here."}
            </p>
          </div>
        )}

        {items.map((item) => {
          const name = actorName(item, fallbackCreator);
          const unavailable = !item.targetAvailable;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => void openNotification(item)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/[0.035]",
                !item.readAt && "bg-accent/[0.055]",
              )}
            >
              {item.actor
                ? <img src={getUserAvatarUrl(item.actor.avatarUrl)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground">
                    {item.type === "new_track"
                      ? <Music2 className="h-4 w-4" />
                      : item.type === "new_report"
                        ? <Flag className="h-4 w-4" />
                        : <UserPlus className="h-4 w-4" />}
                  </span>}
              <span className="min-w-0 flex-1">
                {item.type === "new_track" ? (
                  unavailable
                    ? <span className="block text-sm text-muted-foreground">{language === "el" ? "Αυτό το τραγούδι δεν είναι πλέον διαθέσιμο." : "This track is no longer available."}</span>
                    : <span className="block text-sm"><strong>{name}</strong> {language === "el" ? "δημοσίευσε" : "published"} <strong>“{item.track?.title}”</strong></span>
                ) : item.type === "new_report" ? (
                  unavailable
                    ? <span className="block text-sm text-muted-foreground">{language === "el" ? "Αυτή η αναφορά δεν είναι πλέον διαθέσιμη." : "This report is no longer available."}</span>
                    : <span className="block text-sm"><strong>{language === "el" ? "Νέα αναφορά περιεχομένου" : "New content report"}</strong>{item.track?.title ? <> · “{item.track.title}”</> : null}</span>
                ) : (
                  unavailable
                    ? <span className="block text-sm text-muted-foreground">{language === "el" ? "Αυτός ο δημιουργός δεν είναι πλέον διαθέσιμος." : "This creator is no longer available."}</span>
                    : <span className="block text-sm"><strong>{name}</strong> {language === "el" ? "άρχισε να σε ακολουθεί" : "started following you"}</span>
                )}
                <span className="mt-1 block text-[11px] text-muted-foreground">{relativeTime(item.createdAt, language)}</span>
              </span>
              {!item.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />}
            </button>
          );
        })}

        {notifications.hasNextPage && (
          <button
            type="button"
            disabled={notifications.isFetchingNextPage}
            onClick={() => void notifications.fetchNextPage()}
            className="w-full px-4 py-3 text-xs font-semibold text-accent hover:bg-white/[0.025] disabled:opacity-50"
          >
            {notifications.isFetchingNextPage ? (language === "el" ? "Φόρτωση…" : "Loading…") : (language === "el" ? "Περισσότερα" : "Load more")}
          </button>
        )}
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const { user } = useAuth();
  const featureAccess = useFeatureAccess("notifications");
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const unread = useQuery({
    queryKey: ["notification-unread-count", user?.id ?? "anon"],
    enabled: Boolean(user) && featureAccess.allowed,
    queryFn: () => getUnreadNotificationCount(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    staleTime: 20_000,
  });
  if (!user || !featureAccess.allowed) return null;
  const count = unread.data?.count ?? 0;

  const opened = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
    void queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
  };

  return (
    <>
      <div className="hidden sm:block">
        <PopoverPrimitive.Root
          open={desktopOpen}
          onOpenChange={(open) => {
            setDesktopOpen(open);
            if (open) opened();
          }}
        >
          <PopoverPrimitive.Trigger asChild><span><BellButton unread={count} /></span></PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              side="bottom"
              align="end"
              sideOffset={8}
              className="glass-strong z-50 w-[390px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50"
            >
              <NotificationPanel onClose={() => setDesktopOpen(false)} />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>

      <div className="sm:hidden">
        <Drawer
          open={mobileOpen}
          onOpenChange={(open) => {
            setMobileOpen(open);
            if (open) opened();
          }}
        >
          <DrawerTrigger asChild><span><BellButton unread={count} /></span></DrawerTrigger>
          <DrawerContent className="max-h-[88dvh] border-white/10 bg-[#0d0d12]">
            <DrawerHeader className="sr-only"><DrawerTitle>{language === "el" ? "Ειδοποιήσεις" : "Notifications"}</DrawerTitle></DrawerHeader>
            <DrawerClose asChild>
              <button type="button" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
            <NotificationPanel onClose={() => setMobileOpen(false)} />
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
