import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ShieldAlert, X } from "lucide-react";
import { SidebarNav, NAV, type NavId } from "@/components/promptbeats/Sidebar";
import { StudioModal } from "@/components/promptbeats/StudioModal";
import { cn } from "@/lib/utils";
import { useAccountLock } from "@/hooks/useAccountLock";
import { supabase } from "@/integrations/supabase/client";

export const NAV_PATHS: Record<NavId, string> = {
  discover: "/",
  trending: "/trending",
  studio: "/generate",
  library: "/library",
  management: "/management",
};

const MOBILE_TABS = [
  { id: "discover", label: "Feed" },
  { id: "trending", label: "Trending" },
  { id: "studio", label: "Studio" },
  { id: "library", label: "Library" },
] as const;

export function useActiveNav(): NavId {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/trending")) return "trending";
  if (pathname.startsWith("/generate")) return "studio";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/management")) return "management";
  return "discover";
}


export function AppShell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [studio, setStudio] = useState(false);
  const active = useActiveNav();
  const { isLocked, reason, loading: lockLoading, error: lockError, authenticated } = useAccountLock();

  if (lockLoading) return <AccountStatusLoading />;
  if (authenticated && lockError) return <AccountStatusUnavailable />;
  if (authenticated && isLocked) return <AccountLockedScreen reason={reason} />;

  const openStudio = () => {
    setStudio(true);
    setDrawer(false);
  };

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[270px] border-r border-white/10 bg-black/40 backdrop-blur-xl lg:block">
        <SidebarNav active={active} onNavigate={() => setDrawer(false)} onSubmit={openStudio} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")}
      >
        <div
          onClick={() => setDrawer(false)}
          className={cn(
            "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity",
            drawer ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "glass-strong absolute inset-y-0 left-0 w-[80%] max-w-[300px] transition-transform duration-300",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
            className="absolute right-3 top-4 text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarNav active={active} onNavigate={() => setDrawer(false)} onSubmit={openStudio} />
        </div>
      </div>

      <div className="relative z-10 pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-0 lg:pl-[270px]">
        <header className="glass-strong sticky top-0 z-20 border-b">
          <div className="mx-auto max-w-[1600px] px-4 py-3 md:px-8 md:py-4">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <button
                aria-label="Open menu"
                onClick={() => setDrawer(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">{header}</div>
            </div>
          </div>
        </header>

        {children}
      </div>

      {/* Mobile bottom tabs */}
      <nav className="glass-strong fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-center border-t pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="grid h-full w-full grid-cols-4 items-center">
          {MOBILE_TABS.map((t) => {
            const item = NAV.find((n) => n.id === t.id)!;
            const isActive = active === t.id;
            return (
              <Link
                key={t.id}
                to={NAV_PATHS[t.id]}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px]",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_8px_var(--neon)]")} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <StudioModal open={studio} onClose={() => setStudio(false)} />
    </div>
  );
}

function AccountLockedScreen({ reason }: { reason: string | null }) {
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };
  return <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4 py-10"><div className="glass-strong w-full max-w-lg rounded-3xl p-7 text-center sm:p-10"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-200"><ShieldAlert className="h-7 w-7" /></div><h1 className="mt-5 font-display text-3xl font-bold">Account locked</h1><p className="mt-3 text-sm text-muted-foreground">Your PromptBeats account has been locked.</p>{reason && <p className="mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground"><span className="text-muted-foreground">Reason: </span>{reason}</p>}<p className="mt-5 text-sm leading-relaxed text-muted-foreground">If you believe this was a mistake or need assistance, contact:<br /><a href="mailto:support@promptbeats.app" className="text-primary hover:underline">support@promptbeats.app</a></p><button onClick={signOut} className="mt-7 inline-flex items-center justify-center rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon">Log out</button></div></main>;
}

function AccountStatusLoading() {
  return <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4"><p className="text-sm text-muted-foreground">Checking account status…</p></main>;
}

function AccountStatusUnavailable() {
  return <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4"><div className="glass-strong w-full max-w-md rounded-3xl p-7 text-center"><h1 className="font-display text-2xl font-bold">Account status unavailable</h1><p className="mt-3 text-sm text-muted-foreground">We could not verify your account status. Please try again.</p><button onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground">Try again</button></div></main>;
}
