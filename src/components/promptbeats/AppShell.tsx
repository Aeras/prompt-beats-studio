import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { SidebarNav, NAV, type NavId } from "@/components/promptbeats/Sidebar";
import { StudioModal } from "@/components/promptbeats/StudioModal";
import { cn } from "@/lib/utils";

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

      <div className="relative z-10 max-sm:pb-[calc(64px+env(safe-area-inset-bottom))] lg:pl-[270px]">
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
