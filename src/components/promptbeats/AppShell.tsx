import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Menu, Search, ShieldAlert, X } from "lucide-react";
import { SidebarNav, NAV, type NavId } from "@/components/promptbeats/Sidebar";
import { StudioModal } from "@/components/promptbeats/StudioModal";
import { NotificationCenter } from "@/components/promptbeats/NotificationCenter";
import { ModerationCaseCenter } from "@/components/promptbeats/ModerationCaseCenter";
import { HelpMenu } from "@/components/promptbeats/HelpMenu";
import { SearchTermHighlighter } from "@/components/promptbeats/SearchTermHighlighter";
import { cn } from "@/lib/utils";
import { useAccountLock } from "@/hooks/useAccountLock";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/locales/en";

export const NAV_PATHS: Record<NavId, string> = {
  discover: "/",
  trending: "/trending",
  studio: "/create",
  songAnalyzer: "/song-analyzer",
  lyricsReview: "/lyrics-review",
  inspirationWall: "/inspiration-wall",
  storyMap: "/story-map",
  songUniverse: "/song-universe",
  library: "/library",
  management: "/management",
};

const MOBILE_TABS = [
  { id: "discover", labelKey: "nav.feedShort" },
  { id: "trending", labelKey: "nav.trending" },
  { id: "studio", labelKey: "nav.studioShort" },
  { id: "library", labelKey: "nav.libraryShort" },
] as const satisfies ReadonlyArray<{
  id: Exclude<
    NavId,
    "songAnalyzer" | "lyricsReview" | "inspirationWall" | "storyMap" | "songUniverse" | "management"
  >;
  labelKey: TranslationKey;
}>;

const DESKTOP_SIDEBAR_STORAGE_KEY = "pb:desktop-sidebar-open";
const LIVE_SEARCH_DEBOUNCE_MS = 250;
const TOUCH_TAB_SWIPE_THRESHOLD = 72;
const TOUCH_TAB_SWIPE_DOMINANCE = 1.25;
const TABLET_LANDSCAPE_QUERY =
  "(hover: none) and (pointer: coarse) and (min-width: 768px) and (min-height: 600px) and (max-width: 1366px) and (orientation: landscape)";
const TOUCH_TAB_QUERY = "(hover: none) and (pointer: coarse) and (max-width: 1366px)";
const DRAWER_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isSwipeInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="slider"], [data-swipe-ignore="true"]',
    ),
  );
}

export function useActiveNav(): NavId {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/trending")) return "trending";
  if (pathname.startsWith("/song-analyzer")) return "songAnalyzer";
  if (pathname.startsWith("/lyrics-review")) return "lyricsReview";
  if (pathname.startsWith("/inspiration-wall")) return "inspirationWall";
  if (pathname.startsWith("/story-map")) return "storyMap";
  if (pathname.startsWith("/song-universe")) return "songUniverse";
  if (pathname.startsWith("/create") || pathname.startsWith("/generate")) return "studio";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/management")) return "management";
  return "discover";
}

export function AppShell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [studio, setStudio] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [tabletLandscape, setTabletLandscape] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRestoreFocusRef = useRef<HTMLElement | null>(null);
  const liveSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSearchTouchedRef = useRef(false);
  const active = useActiveNav();
  const currentHref = useRouterState({ select: (state) => state.location.href });
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const generatorAccess = useFeatureAccess("ai_generator");
  const {
    isLocked,
    isInvalid,
    reason,
    loading: lockLoading,
    error: lockError,
    authenticated,
  } = useAccountLock();

  useEffect(() => {
    if (!isInvalid) return;
    void supabase.auth.signOut().then(() => window.location.assign("/auth"));
  }, [isInvalid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URL(currentHref, window.location.origin).searchParams.get("q") ?? "";
    liveSearchTouchedRef.current = false;
    setGlobalSearch((current) => (current === query ? current : query));
  }, [currentHref]);

  const runGlobalSearch = useCallback(
    (value: string) => {
      const query = value.trim();
      void navigate({
        to: "/",
        search: query ? { q: query } : {},
        replace: true,
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (!liveSearchTouchedRef.current) return;
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    liveSearchTimerRef.current = setTimeout(() => {
      liveSearchTouchedRef.current = false;
      runGlobalSearch(globalSearch);
    }, LIVE_SEARCH_DEBOUNCE_MS);
    return () => {
      if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    };
  }, [globalSearch, runGlobalSearch]);

  const handleGlobalSearchChange = (value: string) => {
    liveSearchTouchedRef.current = true;
    setGlobalSearch(value);
  };

  const submitGlobalSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveSearchTouchedRef.current = false;
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    runGlobalSearch(globalSearch);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
    if (saved === "false") setDesktopSidebarOpen(false);
    if (saved === "true") setDesktopSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(TABLET_LANDSCAPE_QUERY);
    const sync = () => {
      setTabletLandscape(media.matches);
      if (media.matches) setDrawer(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const openDrawer = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      drawerRestoreFocusRef.current = document.activeElement;
    }
    setDrawer(true);
  }, []);

  useEffect(() => {
    if (!drawer) {
      const restoreTarget = drawerRestoreFocusRef.current;
      drawerRestoreFocusRef.current = null;
      restoreTarget?.focus();
      return;
    }

    drawerCloseButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawer(false);
        return;
      }
      if (event.key !== "Tab") return;

      const panel = drawerPanelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawer]);

  useEffect(() => {
    if (typeof window === "undefined" || (active !== "studio" && active !== "library")) return;
    const media = window.matchMedia(TOUCH_TAB_QUERY);
    let startX = 0;
    let startY = 0;
    let eligible = false;

    const onTouchStart = (event: TouchEvent) => {
      if (!media.matches || event.touches.length !== 1 || isSwipeInteractiveTarget(event.target)) {
        eligible = false;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      if (touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24) {
        eligible = false;
        return;
      }
      startX = touch.clientX;
      startY = touch.clientY;
      eligible = true;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!eligible || !media.matches || event.changedTouches.length !== 1) return;
      eligible = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (
        Math.abs(deltaX) < TOUCH_TAB_SWIPE_THRESHOLD ||
        Math.abs(deltaX) < Math.abs(deltaY) * TOUCH_TAB_SWIPE_DOMINANCE
      )
        return;

      const selector = active === "studio" ? "[data-generator-mode]" : "[data-library-tab]";
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).filter(
        (button) => button.offsetParent !== null && !button.disabled,
      );
      const currentIndex = buttons.findIndex(
        (button) => button.getAttribute("aria-pressed") === "true",
      );
      if (currentIndex < 0) return;
      const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= buttons.length) return;
      buttons[nextIndex]?.click();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [active]);

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
      if (typeof window !== "undefined")
        window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c]">
      <SearchTermHighlighter />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 border-r border-white/10 bg-black/40 backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none",
          tabletLandscape ? "block" : "hidden lg:block",
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
          className="absolute right-0 top-5 z-40 grid min-h-11 min-w-11 translate-x-1/2 place-items-center rounded-full border border-white/10 bg-[#111116]/95 text-muted-foreground shadow-lg transition-[color,background-color] duration-200 ease-out hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
              !desktopSidebarOpen && "rotate-180",
            )}
          />
        </button>
      </aside>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-5 border-r border-white/10 bg-black/30 backdrop-blur-md md:block lg:hidden",
          tabletLandscape && "!hidden",
        )}
      >
        <button
          type="button"
          aria-label={t("shell.openMenu")}
          aria-expanded={drawer}
          onClick={openDrawer}
          className="absolute right-0 top-5 grid min-h-11 min-w-11 translate-x-1/2 place-items-center rounded-full border border-white/10 bg-[#111116]/95 text-muted-foreground shadow-lg transition-colors duration-200 hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        role="dialog"
        aria-modal={drawer ? true : undefined}
        aria-label={language === "el" ? "Κύριο μενού" : "Main menu"}
        aria-hidden={!drawer}
        inert={!drawer}
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          tabletLandscape && "hidden",
          drawer ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          onClick={() => setDrawer(false)}
          className={cn(
            "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none",
            drawer ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={drawerPanelRef}
          tabIndex={-1}
          className={cn(
            "glass-strong absolute inset-y-0 left-0 w-[80%] max-w-[300px] overflow-y-auto transition-transform duration-200 ease-out motion-reduce:transition-none",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            ref={drawerCloseButtonRef}
            type="button"
            aria-label={t("shell.closeMenu")}
            onClick={() => setDrawer(false)}
            className="absolute right-1.5 top-1.5 grid min-h-11 min-w-11 place-items-center rounded-full text-muted-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <X className="h-5 w-5 md:hidden" />
            <ChevronLeft className="hidden h-5 w-5 md:block" />
          </button>
          <SidebarNav active={active} onNavigate={() => setDrawer(false)} onSubmit={openStudio} />
        </div>
      </div>

      <div
        data-pb-search-highlight-root="true"
        data-studio-layout={active === "studio" ? "true" : undefined}
        className={cn(
          "relative z-10 pb-[var(--pb-mobile-nav-offset)] transition-[padding-left] duration-200 ease-out motion-reduce:transition-none sm:pb-0 md:pl-5",
          tabletLandscape && (desktopSidebarOpen ? "!pl-[270px]" : "!pl-5"),
          desktopSidebarOpen ? "lg:pl-[270px]" : "lg:pl-5",
        )}
      >
        <header className="glass-strong sticky top-0 z-20 border-b">
          <div className="mx-auto max-w-[1900px] md:px-8 md:py-4">
            <div className="flex items-center gap-2 px-3 py-2 md:hidden">
              <button
                type="button"
                aria-label={t("shell.openMenu")}
                aria-expanded={drawer}
                onClick={openDrawer}
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <Menu className="h-5 w-5" />
              </button>
              <form onSubmit={submitGlobalSearch} className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  type="search"
                  value={globalSearch}
                  onChange={(event) => handleGlobalSearchChange(event.target.value)}
                  aria-label={t("discover.searchAria")}
                  placeholder={t("discover.searchPlaceholder")}
                  autoComplete="off"
                  className="h-10 w-full rounded-full border border-white/10 bg-black/35 pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
                />
              </form>
              <div className="flex shrink-0 items-center gap-1.5">
                {authenticated && <ModerationCaseCenter />}
                {authenticated && <NotificationCenter />}
                <HelpMenu />
              </div>
            </div>
            {header && (
              <div className="border-t border-white/5 px-4 py-2.5 md:hidden">
                <div className="min-w-0">{header}</div>
              </div>
            )}

            <div className="relative hidden md:block">
              <div className="min-w-0 pr-44">{header}</div>
              <div className="absolute right-0 top-0 z-10 flex items-center gap-2">
                {authenticated && <ModerationCaseCenter />}
                {authenticated && <NotificationCenter />}
                <HelpMenu />
              </div>
            </div>
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

      <nav
        data-pb-mobile-nav="true"
        className="glass-strong fixed inset-x-0 bottom-0 z-30 flex min-h-[var(--pb-mobile-nav-content-height)] items-center border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="grid h-full w-full grid-flow-col auto-cols-fr items-center">
          {MOBILE_TABS.filter((tab) => tab.id !== "studio" || generatorAccess.allowed).map(
            (tab) => {
              const item = NAV.find((n) => n.id === tab.id)!;
              const isActive = active === tab.id;
              const label =
                tab.id === "studio"
                  ? language === "el"
                    ? "Δημιουργία"
                    : "Create"
                  : t(tab.labelKey);
              return (
                <Link
                  key={tab.id}
                  to={NAV_PATHS[tab.id]}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-[var(--pb-mobile-nav-content-height)] flex-col items-center justify-center gap-0.5 py-1.5 text-[9px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70",
                    isActive ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px]",
                      isActive && "drop-shadow-[0_0_8px_var(--neon)]",
                    )}
                  />
                  {label}
                </Link>
              );
            },
          )}
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
            <span className="text-muted-foreground">{t("shell.reason")} </span>
            {reason}
          </p>
        )}
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {t("shell.accountHelp")}
          <br />
          <a href="mailto:support@promptbeats.app" className="text-primary hover:underline">
            support@promptbeats.app
          </a>
        </p>
        <button
          onClick={signOut}
          className="mt-7 inline-flex items-center justify-center rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground glow-neon"
        >
          {t("shell.logOut")}
        </button>
      </div>
    </main>
  );
}

function AccountStatusLoading() {
  const { t } = useI18n();
  return (
    <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4">
      <p className="text-sm text-muted-foreground">{t("shell.checkingAccount")}</p>
    </main>
  );
}

function AccountStatusUnavailable() {
  const { t } = useI18n();
  return (
    <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4">
      <div className="glass-strong w-full max-w-md rounded-3xl p-7 text-center">
        <h1 className="font-display text-2xl font-bold">{t("shell.accountUnavailable")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("shell.accountUnavailableBody")}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl bg-gradient-neon px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          {t("common.retry")}
        </button>
      </div>
    </main>
  );
}

function AccountSessionExpired() {
  const { t } = useI18n();
  return (
    <main className="aurora flex min-h-screen items-center justify-center bg-[#0a0a0c] px-4">
      <div className="glass-strong w-full max-w-md rounded-3xl p-7 text-center">
        <h1 className="font-display text-2xl font-bold">{t("shell.sessionEnded")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("shell.sessionEndedBody")}</p>
      </div>
    </main>
  );
}
