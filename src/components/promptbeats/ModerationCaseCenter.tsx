import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Loader2, MessageSquareWarning, X } from "lucide-react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ModerationCaseThread } from "@/components/promptbeats/ModerationCaseThread";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import {
  getModerationCaseUnreadCount,
  listMyModerationCases,
} from "@/lib/moderation-cases.functions";
import { cn } from "@/lib/utils";

function CaseButton({ unread }: { unread: number }) {
  const { language } = useI18n();
  return <button
    type="button"
    aria-label={language === "el" ? "Υποθέσεις και μηνύματα" : "Cases and messages"}
    className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
  >
    <MessageSquareWarning className="h-5 w-5" />
    {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[9px] font-bold leading-4 text-black shadow-lg">{unread > 99 ? "99+" : unread}</span>}
  </button>;
}

function CasePanel({ onClose }: { onClose: () => void }) {
  const { language } = useI18n();
  const el = language === "el";
  const [selected, setSelected] = useState<string | null>(null);
  const cases = useQuery({
    queryKey: ["my-moderation-cases"],
    queryFn: () => listMyModerationCases(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });

  if (selected) return <div className="flex max-h-[82dvh] min-h-[28rem] flex-col">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-accent">← {el ? "Υποθέσεις" : "Cases"}</button>
      <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5"><X className="h-4 w-4" /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <ModerationCaseThread caseId={selected} />
    </div>
  </div>;

  return <div className="flex max-h-[72dvh] min-h-[22rem] flex-col">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div>
        <h2 className="font-display text-base font-bold">{el ? "Υποθέσεις & Μηνύματα" : "Cases & Messages"}</h2>
        <p className="text-[11px] text-muted-foreground">{el ? "Επικοινωνία που συνδέεται μόνο με υποθέσεις moderation" : "Communication tied only to moderation cases"}</p>
      </div>
      <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5"><X className="h-4 w-4" /></button>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto">
      {cases.isLoading && <div className="grid min-h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>}
      {cases.isError && <div className="p-5 text-center text-sm text-red-200">{el ? "Δεν ήταν δυνατή η φόρτωση των υποθέσεων." : "Could not load cases."}</div>}
      {!cases.isLoading && !cases.isError && (cases.data ?? []).length === 0 && <div className="p-6 text-center">
        <MessageSquareWarning className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-semibold">{el ? "Δεν υπάρχουν υποθέσεις." : "No moderation cases."}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{el ? "Δεν μπορείτε να ξεκινήσετε νέα συνομιλία. Μια συνομιλία εμφανίζεται εδώ μόνο όταν υπάρχει έγκυρη υπόθεση moderation." : "You cannot start a new conversation. A thread appears here only when there is a valid moderation case."}</p>
      </div>}

      {(cases.data ?? []).map((item) => <button
        key={item.id}
        type="button"
        onClick={() => setSelected(item.id)}
        className={cn("flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left hover:bg-white/[0.035]", item.unread_count > 0 && "bg-amber-300/[0.04]")}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5"><MessageSquareWarning className="h-4 w-4 text-accent" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{el ? "Υπόθεση Moderation" : "Moderation Case"} — {item.track_title}</span>
          <span className="mt-1 block text-[11px] text-muted-foreground">{item.status.replaceAll("_"," ")} · {new Date(item.updated_at).toLocaleString(el ? "el-GR" : "en-US")}</span>
        </span>
        {item.unread_count > 0 && <span className="mt-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black">{item.unread_count}</span>}
      </button>)}
    </div>
  </div>;
}

export function ModerationCaseCenter() {
  const { user } = useAuth();
  const { language } = useI18n();
  const qc = useQueryClient();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const unread = useQuery({
    queryKey: ["moderation-case-unread-count", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: () => getModerationCaseUnreadCount(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
    staleTime: 20_000,
  });
  if (!user) return null;
  const count = unread.data?.count ?? 0;
  const opened = () => {
    void qc.invalidateQueries({ queryKey: ["my-moderation-cases"] });
    void qc.invalidateQueries({ queryKey: ["moderation-case-unread-count"] });
  };

  return <>
    <div className="hidden sm:block">
      <PopoverPrimitive.Root open={desktopOpen} onOpenChange={(open) => { setDesktopOpen(open); if (open) opened(); }}>
        <PopoverPrimitive.Trigger asChild><span><CaseButton unread={count} /></span></PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content side="bottom" align="end" sideOffset={8} className="glass-strong z-50 w-[430px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
            <CasePanel onClose={() => setDesktopOpen(false)} />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
    <div className="sm:hidden">
      <Drawer open={mobileOpen} onOpenChange={(open) => { setMobileOpen(open); if (open) opened(); }}>
        <DrawerTrigger asChild><span><CaseButton unread={count} /></span></DrawerTrigger>
        <DrawerContent className="max-h-[92dvh] border-white/10 bg-[#0d0d12]">
          <DrawerHeader className="sr-only"><DrawerTitle>{language === "el" ? "Υποθέσεις και μηνύματα" : "Cases and messages"}</DrawerTitle></DrawerHeader>
          <DrawerClose asChild><span className="hidden" /></DrawerClose>
          <CasePanel onClose={() => setMobileOpen(false)} />
        </DrawerContent>
      </Drawer>
    </div>
  </>;
}
