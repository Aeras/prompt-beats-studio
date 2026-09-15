import { useCallback, useEffect, useId, useRef, useState } from "react";
import { registerExternalIframe } from "@/lib/media-coordinator";
import { getTrackEmbedUrl, getTrackProviderUrl } from "@/lib/track-sources";
import { useI18n } from "@/i18n";

const UDIO_WIDTH = 700;
const UDIO_HEIGHT = 228;
const EXTERNAL_MEDIA_CONSENT_KEY = "promptbeats:external-media-consent";
let externalMediaConsent = false;
const consentListeners = new Set<(enabled: boolean) => void>();
const nearViewportListeners = new Map<Element, () => void>();
let nearViewportObserver: IntersectionObserver | null = null;

function readExternalMediaConsent() {
  if (typeof window === "undefined") return false;
  externalMediaConsent = window.localStorage.getItem(EXTERNAL_MEDIA_CONSENT_KEY) === "enabled";
  return externalMediaConsent;
}
function setExternalMediaConsent() {
  externalMediaConsent = true;
  window.localStorage.setItem(EXTERNAL_MEDIA_CONSENT_KEY, "enabled");
  consentListeners.forEach((listener) => listener(true));
}
function observeNearViewport(element: Element, onVisible: () => void) {
  if (typeof IntersectionObserver === "undefined") { onVisible(); return () => undefined; }
  if (!nearViewportObserver) {
    nearViewportObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const listener = nearViewportListeners.get(entry.target);
        nearViewportListeners.delete(entry.target);
        nearViewportObserver?.unobserve(entry.target);
        listener?.();
      }
    }, { rootMargin: "320px 0px" });
  }
  nearViewportListeners.set(element, onVisible);
  nearViewportObserver.observe(element);
  return () => { nearViewportListeners.delete(element); nearViewportObserver?.unobserve(element); };
}
function useExternalMediaConsent() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { setEnabled(readExternalMediaConsent()); consentListeners.add(setEnabled); return () => consentListeners.delete(setEnabled); }, []);
  return { enabled, allow: setExternalMediaConsent };
}

export function ExternalTrackEmbed({ sourceType, sourceId, title, compact = false }: { sourceType: string | null | undefined; sourceId: string | null | undefined; title: string; compact?: boolean }) {
  const { t } = useI18n();
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

  const reset = useCallback(() => { if (iframeRef.current) iframeRef.current.src = "about:blank"; setResetKey((key) => key + 1); }, []);
  useEffect(() => { const iframe = iframeRef.current; if (!iframe || !embedUrl || !shouldMount) return; return registerExternalIframe(instanceId, { iframe, sourceType: sourceType ?? "", reset }); }, [embedUrl, instanceId, reset, resetKey, shouldMount, sourceType]);
  useEffect(() => { if (!externalMediaAllowed || !embedUrl || shouldMount || !containerRef.current) return; return observeNearViewport(containerRef.current, () => setShouldMount(true)); }, [embedUrl, externalMediaAllowed, shouldMount]);
  useEffect(() => { if (!isUdio || !containerRef.current) return; const observer = new ResizeObserver(([entry]) => setContainerWidth(entry?.contentRect.width ?? 0)); observer.observe(containerRef.current); return () => observer.disconnect(); }, [isUdio]);

  if (!embedUrl) return null;
  const aspectRatio = isCompactSuno ? "1 / 1" : "760 / 240";
  const udioScale = containerWidth > 0 ? containerWidth / UDIO_WIDTH : 1;
  const showIframe = externalMediaAllowed && shouldMount;

  return (
    <div ref={containerRef} className="absolute inset-x-0 bottom-0 w-full max-w-full overflow-hidden" style={isUdio ? { aspectRatio: `${UDIO_WIDTH} / ${UDIO_HEIGHT}` } : { aspectRatio }}>
      {showIframe ? (
        <iframe ref={iframeRef} key={resetKey} src={embedUrl} title={title} className={isUdio ? "absolute bottom-0 left-0 block border-0" : "block h-full w-full border-0"} style={isUdio ? { width: UDIO_WIDTH, height: UDIO_HEIGHT, transform: `scale(${udioScale})`, transformOrigin: "bottom left" } : undefined} allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black/40 px-4 text-center">
          {!externalMediaAllowed ? <><p className="text-xs text-muted-foreground">{t("external.notice")}</p><button type="button" onClick={allowExternalMedia} className="rounded-full border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25">{t("external.allow")}</button></> : <p className="text-xs text-muted-foreground">{t("external.loading")}</p>}
        </div>
      )}
      {providerUrl && providerName && <a href={providerUrl} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-2 z-10 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:border-accent/60 hover:text-accent">{t("external.openIn", { provider: providerName })}</a>}
    </div>
  );
}
