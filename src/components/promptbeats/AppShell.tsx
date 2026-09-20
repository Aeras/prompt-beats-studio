import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Menu, ShieldAlert, X } from "lucide-react";
import { SidebarNav, NAV, type NavId } from "@/components/promptbeats/Sidebar";
import { StudioModal } from "@/components/promptbeats/StudioModal";
import { NotificationCenter } from "@/components/promptbeats/NotificationCenter";
import { cn } from "@/lib/utils";
import { useAccountLock } from "@/hooks/useAccountLock";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/locales/en";

export const NAV_PATHS: Record<NavId, string> = {
  discover: "/",
  trending: "/trending",
  studio: "/generate",
  musicLab: "/ai-music-lab",
  songAnalyzer: "/song-analyzer",
  library: "/library",
  management: "/management",
};

const MOBILE_TABS = [
  { id: "discover", labelKey: "nav.feedShort" },
  { id: "trending", labelKey: "nav.trending" },
  { id: "studio", labelKey: "nav.studioShort" },
  { id: "library", labelKey: "nav.libraryShort" },
] as const satisfies ReadonlyArray<{ id: Exclude<NavId, "musicLab" | "songAnalyzer" | "management">; labelKey: TranslationKey }>;

const DESKTOP_SIDEBAR_STORAGE_KEY = "pb:desktop-sidebar-open";

export function useActiveNav(): NavId {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/trending")) return "trending";
  if (pathname.startsWith("/ai-music-lab")) return "musicLab";
  if (pathname.startsWith("/song-analyzer")) return "songAnalyzer";
  if (pathname.startsWith("/generate")) return "studio";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/management")) return "management";
  return "discover";
}

export function AppShell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [studio, setStudio] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const active = useActiveNav();
  const { t } = useI18n();
  const { isLocked, isInvalid, reason, loading: lockLoading, error: lockError, authenticated } = useAccountLock();

  useEffect(() => {
    if (!isInvalid) return;
    void supabase.auth.signOut().then(() => window.location.assign("/auth"));
  }, [isInvalid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
    if (saved === "false") setDesktopSidebarOpen(false);
    if (saved === "true") setDesktopSidebarOpen(true);
  }, []);

  if (lockLoading) return <AccountStatusLoading />;
  if (authenticated && lockError) return <AccountStatusUnavailable />;
  if (authenticated && isInvalid) return <AccountSessionExpired />;
  if (authenticated && isLocked) return <AccountLockedScreen reason={reason} />;

  const openStudio = () => {
    setStudio(true);
    setDrawer(false);
  };

  const toggleDesktopSidebar = () => {
    setDesktopSidebarOpen((open) => {
      const next = !open;
      if (typeof window !== "undefined") window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 bg-black/40 backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block",
          desktopSidebarOpen ? "w-[270px]" : "w-5",
        )}
      >
        <div
          className={cn(
            "h-full overflow-hidden transition-opacity duration-150 ease-out motion-reduce:transition-none",
            desktopSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <div className="h-full w-[270px]">
            <SidebarNav active={active} onNavigate={() => setDrawer(false)} onSubmit={openStudio} />
          </div>
        </div>
        <button
          type="button"
          aria-label={desktopSidebarOpen ? t("shell.closeMenu") : t("shell.openMenu")}
          aria-expanded={desktopSidebarOpen}
          onClick={toggleDesktopSidebar}
          className="absolute right-0 top-5 z-40 grid h-8 w-8 translate-x-1/2 place-items-center rounded-full border border-white/10 bg-[#111116]/95 text-muted-foreground shadow-lg transition-[color,background-color] duration-200 ease-out hover:border-accent/40 hover:text-accent motion-reduce:transition-none"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
              !desktopSidebarOpen && "rotate-180",
            )}
          />
        </button>
      </aside>

      <div className="fixed inset-y-0 left-0 z-30 hidden w-5 border-r border-white/10 bg-black/30 backdrop-blur-md md:block lg:hidden">
        <button
          type="button"
          aria-label={t("shell.openMenu")}
          aria-expanded={drawer}
          onClick={() => setDrawer(true)}
          className="absolute right-0 top-5 grid h-8 w-8 translate-x-1/2 place-items-center rounded-full border border-white/10 bg-[#111116]/95 text-muted-foreground shadow-lg transition-colors duration-200 hover:border-accent/40 hover:text-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className={cn("fixed inset-0 z-50 lg:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")}>
        <div
          onClick={() => setDrawer(false)}
          className={cn(
            "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none",
            drawer ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "glass-strong absolute inset-y-0 left-0 w-[80%] max-w-[300px] transition-transform duration-200 ease-out motion-reduce:transition-none",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            aria-label={t("shell.closeMenu")}
            onClick={() => setDrawer(false)}
            className="absolute right-3 top-4 text-muted-foreground transition-colors hover:text-accent"
          >
            <X className="h-5 w-5 md:hidden" />
            <ChevronLeft className="hidden h-5 w-5 md:block" />
          </button>
          <SidebarNav active={active} onNavigate={() => setDrawer(false)} onSubmit={openStudio} />
        </div>
      </div>

      <div
        data-studio-layout={active === "studio" ? "true" : undefined}
        className={cn(
          "relative z-10 pb-[calc(64px+env(safe-area-inset-bottom))] transition-[padding-left] duration-200 ease-out motion-reduce:transition-none sm:pb-0 md:pl-5",
          desktopSidebarOpen ? "lg:pl-[270px]" : "lg:pl-5",
        )}
      >
        <header className="glass-strong sticky top-0 z-20 border-b">
          <div className="relative mx-auto max-w-[1900px] px-4 py-3 md:px-8 md:py-4">
            <div className="flex items-start gap-3">
              <button
                aria-label={t("shell.openMenu")}
                onClick={() => setDrawer(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className={cn("min-w-0 flex-1", authenticated && "pr-14 md:pr-16")}>{header}</div>
            </div>
            {authenticated && (
              <div className="absolute right-4 top-3 z-10 md:right-8 md:top-4">
                <NotificationCenter />
              </div>
            )}
          </div>
        </header>

        {children}
      </div>

      <style>{`
        @media (min-width: 1280px) {
          [data-studio-layout="true"] > div > div {
            display: grid;
            width: 100%;
            max-width: none;
            grid-template-columns: minmax(0, 7fr) minmax(300px, 3fr);
            column-gap: 1.5rem;
            align-items: start;
          }

          [data-studio-layout="true"] > div > div > a,
          [data-studio-layout="true"] > div > div > a + div {
            grid-column: 1 / -1;
          }

          [data-studio-layout="true"] > div > div > :nth-child(3) {
            grid-column: 1;
          }

          [data-studio-layout="true"] > div > div > :nth-child(n + 4) {
            grid-column: 2;
            grid-row: 3;
            position: sticky;
            top: 6rem;
            max-height: calc(100vh - 7rem);
            overflow-y: auto;
            padding-right: 0.25rem;
            scrollbar-gutter: stable;
          }
        }
      `}</style>

      <nav className="glass-strong fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-center border-t pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="grid h-full w-full grid-cols-4 items-center">
          {MOBILE_TABS.map((tab) => {
            const item = NAV.find((n) => n.id === tab.id)!;
            const isActive = active === tab.id;
            return (
              <Link
                key={tab.id}
                to={NAV_PATHS[tab.id]}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px]",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_8px_var(--neon)]")} />
                {t(tab.labelKey)}
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
  const { t } = useI18n();
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };
  return (
    <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4 py-10">
      <div className="glass-strong w-full max-w-lg rounded-3xl p-7 text-center sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-200">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold">{t("shell.accountLocked")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("shell.accountLockedBody")}</p>
        {reason && (
          <p className="mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground">
            <span className="text-muted-foreground">{t("shell.reason")} </span>{reason}
          </p>
        )}
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {t("shell.accountHelp")}<br />
          <a href="mailto:support@promptbeats.app" className="text-primary hover:underline">support@promptbeats.app</a>
        </p>
        <button onClick={signOut} className="mt-7 inline-flex items-center justify-center rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon">
          {t("shell.logOut")}
        </button>
      </div>
    </main>
  );
}

function AccountStatusLoading() {
  const { t } = useI18n();
  return <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4"><p className="text-sm text-muted-foreground">{t("shell.checkingAccount")}</p></main>;
}

function AccountStatusUnavailable() {
  const { t } = useI18n();
  return <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4"><div className="glass-strong w-full max-w-md rounded-3xl p-7 text-center"><h1 className="font-display text-2xl font-bold">{t("shell.accountUnavailable")}</h1><p className="mt-3 text-sm text-muted-foreground">{t("shell.accountUnavailableBody")}</p><button onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground">{t("common.retry")}</button></div></main>;
}

function AccountSessionExpired() {
  const { t } = useI18n();
  return <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4"><div className="glass-strong w-full max-w-md rounded-3xl p-7 text-center"><h1 className="font-display text-2xl font-bold">{t("shell.sessionEnded")}</h1><p className="mt-3 text-sm text-muted-foreground">{t("shell.sessionEndedBody")}</p></div></main>;
}
