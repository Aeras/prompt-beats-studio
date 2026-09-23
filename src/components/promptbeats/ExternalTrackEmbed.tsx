import { useCallback, useEffect, useId, useRef, useState } from "react";
import { registerExternalIframe } from "@/lib/media-coordinator";
import { getTrackEmbedUrl, getTrackProviderUrl } from "@/lib/track-sources";
import { useI18n } from "@/i18n";
import { useExternalMediaConsent } from "@/lib/external-media-consent";

const UDIO_WIDTH = 700;
const UDIO_HEIGHT = 228;
const nearViewportListeners = new Map<Element, () => void>();
let nearViewportObserver: IntersectionObserver | null = null;
function observeNearViewport(element: Element, onVisible: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return () => undefined;
  }
  if (!nearViewportObserver) {
    nearViewportObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const listener = nearViewportListeners.get(entry.target);
          nearViewportListeners.delete(entry.target);
          nearViewportObserver?.unobserve(entry.target);
          listener?.();
        }
      },
      { rootMargin: "320px 0px" },
    );
  }
  nearViewportListeners.set(element, onVisible);
  nearViewportObserver.observe(element);
  return () => {
    nearViewportListeners.delete(element);
    nearViewportObserver?.unobserve(element);
  };
}
export function ExternalTrackEmbed({
  sourceType,
  sourceId,
  title,
  compact = false,
}: {
  sourceType: string | null | undefined;
  sourceId: string | null | undefined;
  title: string;
  compact?: boolean;
}) {
  const { t, language } = useI18n();
  const embedUrl = getTrackEmbedUrl(sourceType, sourceId);
  const instanceId = `external-track-${useId()}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [shouldMount, setShouldMount] = useState(false);
  const { enabled: externalMediaAllowed, allow: allowExternalMedia } = useExternalMediaConsent();
  const isUdio = sourceType === "udio";
  const isCompactSuno = sourceType === "suno" && compact;
  const providerUrl = getTrackProviderUrl(sourceType, sourceId);
  const providerName = sourceType === "suno" ? "Suno" : sourceType === "udio" ? "Udio" : null;

  const reset = useCallback(() => {
    if (iframeRef.current) iframeRef.current.src = "about:blank";
    setResetKey((key) => key + 1);
  }, []);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !embedUrl || !shouldMount) return;
    return registerExternalIframe(instanceId, { iframe, sourceType: sourceType ?? "", reset });
  }, [embedUrl, instanceId, reset, resetKey, shouldMount, sourceType]);
  useEffect(() => {
    if (!externalMediaAllowed) {
      if (iframeRef.current) iframeRef.current.src = "about:blank";
      setShouldMount(false);
      return;
    }
    if (!embedUrl || shouldMount || !containerRef.current) return;
    return observeNearViewport(containerRef.current, () => setShouldMount(true));
  }, [embedUrl, externalMediaAllowed, shouldMount]);
  useEffect(() => {
    if (!isUdio || !containerRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setContainerWidth(entry?.contentRect.width ?? 0),
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isUdio]);

  if (!embedUrl) return null;
  const aspectRatio = isCompactSuno ? "1 / 1" : "760 / 240";
  const udioScale = containerWidth > 0 ? containerWidth / UDIO_WIDTH : 1;
  const showIframe = externalMediaAllowed && shouldMount;

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 bottom-0 w-full max-w-full overflow-hidden"
      style={isUdio ? { aspectRatio: `${UDIO_WIDTH} / ${UDIO_HEIGHT}` } : { aspectRatio }}
    >
      {showIframe ? (
        <iframe
          ref={iframeRef}
          key={resetKey}
          src={embedUrl}
          title={title}
          className={
            isUdio ? "absolute bottom-0 left-0 block border-0" : "block h-full w-full border-0"
          }
          style={
            isUdio
              ? {
                  width: UDIO_WIDTH,
                  height: UDIO_HEIGHT,
                  transform: `scale(${udioScale})`,
                  transformOrigin: "bottom left",
                }
              : undefined
          }
          allow="encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div
          className={
            compact
              ? "flex h-full w-full flex-col items-center justify-center gap-1.5 bg-black/45 px-2 text-center"
              : "flex h-full w-full flex-col items-center justify-center gap-3 bg-black/40 px-4 text-center"
          }
        >
          {!externalMediaAllowed ? (
            <>
              <p
                className={
                  compact
                    ? "max-w-[92%] text-[9px] leading-tight text-muted-foreground"
                    : "text-xs text-muted-foreground"
                }
              >
                {compact
                  ? language === "el"
                    ? "Εξωτερικό player μπλοκαρισμένο"
                    : "External player blocked"
                  : t("external.notice")}
              </p>
              <button
                type="button"
                onClick={allowExternalMedia}
                className={
                  compact
                    ? "rounded-full border border-accent/50 bg-accent/15 px-2 py-1 text-[9px] font-semibold leading-none text-accent transition-colors hover:bg-accent/25"
                    : "rounded-full border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
                }
              >
                {compact ? (language === "el" ? "Επιτρέπεται" : "Allow") : t("external.allow")}
              </button>
            </>
          ) : (
            <p
              className={
                compact ? "text-[9px] text-muted-foreground" : "text-xs text-muted-foreground"
              }
            >
              {t("external.loading")}
            </p>
          )}
        </div>
      )}
      {providerUrl && providerName && (
        <a
          href={providerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            compact
              ? "absolute right-1 top-1 z-20 max-w-[70%] truncate whitespace-nowrap rounded-full border border-white/15 bg-black/80 px-1.5 py-0.5 text-[8px] font-medium leading-tight text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:border-accent/60 hover:text-accent"
              : "absolute right-2 top-2 z-10 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:border-accent/60 hover:text-accent"
          }
        >
          {t("external.openIn", { provider: providerName })}
        </a>
      )}
    </div>
  );
}
