import { useCallback, useEffect, useId, useRef, useState } from "react";
import { registerExternalIframe } from "@/lib/media-coordinator";
import { getTrackEmbedUrl } from "@/lib/track-sources";

const UDIO_WIDTH = 700;
const UDIO_HEIGHT = 228;

export function ExternalTrackEmbed({
  sourceType,
  sourceId,
  title,
}: {
  sourceType: string | null | undefined;
  sourceId: string | null | undefined;
  title: string;
}) {
  const embedUrl = getTrackEmbedUrl(sourceType, sourceId);
  const instanceId = `external-track-${useId()}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const isUdio = sourceType === "udio";

  const reset = useCallback(() => {
    // Discard the old browsing context before React mounts the replacement.
    if (iframeRef.current) iframeRef.current.src = "about:blank";
    setResetKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !embedUrl) return;
    return registerExternalIframe(instanceId, { iframe, sourceType: sourceType ?? "", reset });
  }, [embedUrl, instanceId, reset, resetKey, sourceType]);

  useEffect(() => {
    if (!isUdio || !containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry?.contentRect.width ?? 0));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isUdio]);

  if (!embedUrl) return null;

  const aspectRatio = sourceType === "youtube" ? "16 / 9" : "760 / 240";
  const udioScale = containerWidth > 0 ? containerWidth / UDIO_WIDTH : 1;

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 bottom-0 w-full overflow-hidden"
      style={isUdio ? { aspectRatio: `${UDIO_WIDTH} / ${UDIO_HEIGHT}` } : { aspectRatio }}
    >
      <iframe
        ref={iframeRef}
        key={resetKey}
        src={embedUrl}
        title={title}
        className={isUdio ? "absolute bottom-0 left-0 block border-0" : "block h-full w-full border-0"}
        style={isUdio ? {
          width: UDIO_WIDTH,
          height: UDIO_HEIGHT,
          transform: `scale(${udioScale})`,
          transformOrigin: "bottom left",
        } : undefined}
        allow="encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
