import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ExternalPlaybackContext = createContext<ExternalPlaybackContextValue | null>(null);

function makeHistoryToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pb-external-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ExternalPlaybackProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ExternalPlaybackRequest | null>(null);
  const requestRef = useRef<ExternalPlaybackRequest | null>(null);
  const historyTokenRef = useRef<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const finishClose = useCallback(() => {
    const returnFocusElement = returnFocusRef.current;
    requestRef.current = null;
    returnFocusRef.current = null;
    historyTokenRef.current = null;
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
    returnFocusRef.current = nextRequest.returnFocusElement ?? null;
    requestRef.current = nextRequest;
    setRequest(nextRequest);

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

  useEffect(
    () =>
      subscribeToMediaActivation((activation) => {
        if (activation.kind === "native" && requestRef.current) closeExternalPlayback();
      }),
    [closeExternalPlayback],
  );

  return (
    <ExternalPlaybackContext.Provider value={{ openExternalPlayback, closeExternalPlayback }}>
      {children}
      <Dialog
        open={Boolean(request)}
        onOpenChange={(open) => {
          if (!open) closeExternalPlayback();
        }}
      >
        {request && (
          <DialogContent
            className="w-[calc(100%-1rem)] max-w-3xl overflow-hidden rounded-2xl border-white/10 bg-background/95 p-0 shadow-2xl backdrop-blur-xl max-sm:left-0 max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader className="px-5 pb-0 pt-5 pr-12 max-sm:px-4 max-sm:pr-12">
              <DialogTitle className="truncate text-left">{request.title}</DialogTitle>
              <DialogDescription className="text-left">
                {request.sourceType === "suno"
                  ? "Suno external playback"
                  : request.sourceType === "udio"
                    ? "Udio external playback"
                    : "External playback"}
              </DialogDescription>
            </DialogHeader>
            <div className="relative mx-5 mb-5 mt-1 min-h-40 overflow-hidden rounded-xl border border-white/10 bg-black/30 max-sm:mx-0 max-sm:mb-0 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]">
              <div className="relative aspect-[760/240] w-full min-h-40">
                <ExternalTrackEmbed
                  sourceType={request.sourceType}
                  sourceId={request.sourceId}
                  title={`${request.title} external player`}
                />
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
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
