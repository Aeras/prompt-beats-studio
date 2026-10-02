import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GripHorizontal, X } from "lucide-react";

import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import { subscribeToMediaActivation } from "@/lib/media-coordinator";

export type ExternalPlaybackRequest = {
  trackId: string;
  title: string;
  sourceType: string | null | undefined;
  sourceId: string | null | undefined;
  returnFocusElement?: HTMLElement | null;
};

type ExternalPlaybackContextValue = {
  openExternalPlayback: (request: ExternalPlaybackRequest) => void;
  closeExternalPlayback: () => void;
};

type DesktopPosition = {
  x: number;
  y: number;
};

const ExternalPlaybackContext = createContext<ExternalPlaybackContextValue | null>(null);
const MOBILE_QUERY = "(max-width: 639px)";
const DESKTOP_PANEL_MARGIN = 12;

function makeHistoryToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pb-external-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ExternalPlaybackProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ExternalPlaybackRequest | null>(null);
  const [desktopPosition, setDesktopPosition] = useState<DesktopPosition | null>(null);
  const requestRef = useRef<ExternalPlaybackRequest | null>(null);
  const historyTokenRef = useRef<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const finishClose = useCallback(() => {
    const returnFocusElement = returnFocusRef.current;
    requestRef.current = null;
    returnFocusRef.current = null;
    historyTokenRef.current = null;
    dragRef.current = null;
    setDesktopPosition(null);
    setRequest(null);
    window.setTimeout(() => returnFocusElement?.focus(), 0);
  }, []);

  const closeExternalPlayback = useCallback(() => {
    if (typeof window === "undefined") return;
    const token = historyTokenRef.current;
    if (token && window.history.state?.pbExternalPlayback === token) {
      window.history.back();
      return;
    }
    finishClose();
  }, [finishClose]);

  const openExternalPlayback = useCallback((nextRequest: ExternalPlaybackRequest) => {
    if (typeof window === "undefined") return;
    const replacingOpenPlayer = Boolean(requestRef.current);
    returnFocusRef.current = nextRequest.returnFocusElement ?? null;
    requestRef.current = nextRequest;
    setRequest(nextRequest);
    if (!replacingOpenPlayer) setDesktopPosition(null);

    if (!historyTokenRef.current) {
      const token = makeHistoryToken();
      historyTokenRef.current = token;
      window.history.pushState(
        { ...window.history.state, pbExternalPlayback: token },
        "",
        window.location.href,
      );
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (!requestRef.current) return;
      finishClose();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [finishClose]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeExternalPlayback();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeExternalPlayback, request]);

  useEffect(
    () =>
      subscribeToMediaActivation((activation) => {
        if (activation.kind === "native" && requestRef.current) closeExternalPlayback();
      }),
    [closeExternalPlayback],
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;
    const media = window.matchMedia(MOBILE_QUERY);
    const mobileNav = document.querySelector<HTMLElement>('[data-pb-mobile-nav="true"]');
    const appContent = document.querySelector<HTMLElement>(
      '[data-pb-search-highlight-root="true"]',
    );
    const originalNavDisplay = mobileNav?.style.display ?? "";
    const originalContentPaddingBottom = appContent?.style.paddingBottom ?? "";

    const restoreMobilePage = () => {
      if (mobileNav) mobileNav.style.display = originalNavDisplay;
      if (appContent) appContent.style.paddingBottom = originalContentPaddingBottom;
      root.style.setProperty("--pb-external-player-clearance", "0px");
      delete body.dataset.pbExternalPlaybackOpen;
    };

    const syncLayoutState = () => {
      if (!request || !media.matches || !panelRef.current) {
        restoreMobilePage();
        return;
      }
      body.dataset.pbExternalPlaybackOpen = "true";
      const height = Math.ceil(panelRef.current.getBoundingClientRect().height);
      const clearance = height + 12;
      root.style.setProperty("--pb-external-player-clearance", `${clearance}px`);
      if (mobileNav) mobileNav.style.display = "none";
      if (appContent) appContent.style.paddingBottom = `${clearance}px`;
    };

    syncLayoutState();
    const observer = new ResizeObserver(syncLayoutState);
    if (panelRef.current) observer.observe(panelRef.current);
    media.addEventListener("change", syncLayoutState);
    window.addEventListener("resize", syncLayoutState);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", syncLayoutState);
      window.removeEventListener("resize", syncLayoutState);
      restoreMobilePage();
    };
  }, [request]);

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (typeof window === "undefined" || window.matchMedia(MOBILE_QUERY).matches) return;
    if (event.button !== 0 || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    const rect = panel.getBoundingClientRect();
    const maxX = Math.max(
      DESKTOP_PANEL_MARGIN,
      window.innerWidth - rect.width - DESKTOP_PANEL_MARGIN,
    );
    const maxY = Math.max(
      DESKTOP_PANEL_MARGIN,
      window.innerHeight - rect.height - DESKTOP_PANEL_MARGIN,
    );
    setDesktopPosition({
      x: Math.min(Math.max(DESKTOP_PANEL_MARGIN, event.clientX - drag.offsetX), maxX),
      y: Math.min(Math.max(DESKTOP_PANEL_MARGIN, event.clientY - drag.offsetY), maxY),
    });
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <ExternalPlaybackContext.Provider value={{ openExternalPlayback, closeExternalPlayback }}>
      {children}
      {request && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={`${request.title} external player`}
          data-pb-external-playback="true"
          className="fixed z-[65] overflow-hidden border border-white/10 bg-background/95 shadow-2xl backdrop-blur-xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:w-full max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 sm:bottom-3 sm:right-3 sm:w-[min(460px,calc(100vw-1.5rem))] sm:rounded-2xl"
          style={
            desktopPosition
              ? {
                  left: desktopPosition.x,
                  top: desktopPosition.y,
                  right: "auto",
                  bottom: "auto",
                }
              : undefined
          }
        >
          <div
            className="flex min-h-12 touch-none select-none items-center gap-2 border-b border-white/10 px-3 py-2 max-sm:min-h-11 sm:cursor-move"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <GripHorizontal className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{request.title}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {request.sourceType === "suno"
                  ? "Suno external playback"
                  : request.sourceType === "udio"
                    ? "Udio external playback"
                    : "External playback"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close external player"
              title="Close"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={closeExternalPlayback}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative w-full overflow-hidden bg-black/30 pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="relative aspect-[760/240] w-full min-h-[132px] max-sm:min-h-[148px]">
              <ExternalTrackEmbed
                sourceType={request.sourceType}
                sourceId={request.sourceId}
                title={`${request.title} external player`}
              />
            </div>
          </div>
        </div>
      )}
    </ExternalPlaybackContext.Provider>
  );
}

export function useExternalPlayback() {
  const context = useContext(ExternalPlaybackContext);
  if (!context) {
    throw new Error("useExternalPlayback must be used within ExternalPlaybackProvider");
  }
  return context;
}
