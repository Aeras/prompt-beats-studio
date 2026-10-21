import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PlayerProvider, usePlayer } from "@/lib/player";
import { PlayerBar } from "@/components/promptbeats/PlayerBar";
import { LanguageSelector } from "@/components/promptbeats/LanguageSelector";
import { ExternalPlaybackProvider } from "@/components/promptbeats/ExternalPlaybackProvider";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider, useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import logoAsset from "@/assets/logo.png.asset.json";
import { robotsContent } from "@/lib/seo-policy";

const DEVELOPMENT_NOTICE_STORAGE_KEY = "pb:development-preview-notice:v1";

function NotFoundContent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("root.notFoundTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("root.notFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("root.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <I18nProvider>
      <NotFoundContent />
    </I18nProvider>
  );
}

function ErrorContent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("root.errorTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("root.errorBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.retry")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("root.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <I18nProvider>
      <ErrorContent error={error} reset={reset} />
    </I18nProvider>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "PromptBeats" },
      {
        name: "description",
        content: "PromptBeats is an AI-assisted songwriting and song development platform.",
      },
      { name: "robots", content: robotsContent("noindex") },
      { property: "og:title", content: "PromptBeats" },
      {
        property: "og:description",
        content: "AI-assisted songwriting and song development platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <PlayerProvider>
          <ExternalPlaybackProvider>
            <Outlet />
            <DevelopmentPreviewNotice />
            <StandaloneLanguageControl />
            <GlobalPlayerBar />
            <Toaster />
          </ExternalPlaybackProvider>
        </PlayerProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function DevelopmentPreviewNotice() {
  const { user, loading } = useAuth();
  const { language } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      setOpen(false);
      return;
    }

    try {
      setOpen(window.localStorage.getItem(DEVELOPMENT_NOTICE_STORAGE_KEY) !== "acknowledged");
    } catch {
      setOpen(true);
    }
  }, [loading, user]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || loading || user) return null;

  const copy =
    language === "el"
      ? {
          badge: "Έκδοση ανάπτυξης",
          title: "Το PromptBeats βρίσκεται σε στάδιο ανάπτυξης και δοκιμών",
          body: "Το PromptBeats εξελίσσεται ενεργά. Ορισμένες λειτουργίες ενδέχεται να αλλάζουν, να μην είναι ακόμη πλήρως διαθέσιμες ή να παρουσιάζουν προσωρινή αστάθεια.",
          detail:
            "Η πρόσβαση παρέχεται αυτή τη στιγμή για δοκιμή και αξιολόγηση των διαθέσιμων λειτουργιών. Μπορείτε να συνεχίσετε στην πλατφόρμα και, εφόσον το επιθυμείτε, να δημιουργήσετε λογαριασμό.",
          continue: "Συνέχεια",
          leave: "Αποχώρηση",
        }
      : {
          badge: "Development preview",
          title: "PromptBeats is currently in development and testing",
          body: "PromptBeats is actively evolving. Some features may change, may not yet be fully available, or may occasionally be unstable.",
          detail:
            "Access is currently provided for testing and evaluation of the available features. You can continue to the platform and create an account if you wish.",
          continue: "Continue",
          leave: "Leave",
        };

  const acknowledge = () => {
    try {
      window.localStorage.setItem(DEVELOPMENT_NOTICE_STORAGE_KEY, "acknowledged");
    } catch {
      /* Continue even when storage is unavailable. */
    }
    setOpen(false);
  };

  const leave = () => {
    window.location.replace("about:blank");
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="development-preview-title"
      aria-describedby="development-preview-description"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d11]/95 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
        <div className="h-1 w-full bg-gradient-neon" />
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <img
              src={logoAsset.url}
              alt="PromptBeats logo"
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-2xl glow-neon"
            />
            <div className="mt-4 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {copy.badge}
            </div>
            <h2
              id="development-preview-title"
              className="mt-4 max-w-md font-display text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl"
            >
              {copy.title}
            </h2>
            <div id="development-preview-description" className="mt-4 space-y-3">
              <p className="text-sm leading-6 text-muted-foreground sm:text-[15px]">{copy.body}</p>
              <p className="text-sm leading-6 text-muted-foreground sm:text-[15px]">
                {copy.detail}
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={leave}
              className="order-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground sm:order-1"
            >
              {copy.leave}
            </button>
            <button
              type="button"
              onClick={acknowledge}
              autoFocus
              className="order-1 rounded-xl bg-gradient-neon px-4 py-3 text-sm font-semibold text-primary-foreground glow-neon transition-transform hover:scale-[1.01] active:scale-[0.98] sm:order-2"
            >
              {copy.continue}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StandaloneLanguageControl() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const usesAppShell =
    pathname === "/" ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/trending") ||
    pathname.startsWith("/generate") ||
    pathname.startsWith("/library") ||
    pathname.startsWith("/management");
  if (usesAppShell) return null;
  return (
    <div className="fixed right-3 top-3 z-[120]">
      <LanguageSelector compact />
    </div>
  );
}

function GlobalPlayerBar() {
  const { playerMode } = usePlayer();
  if (playerMode === "hidden") return null;
  return <PlayerBar />;
}
