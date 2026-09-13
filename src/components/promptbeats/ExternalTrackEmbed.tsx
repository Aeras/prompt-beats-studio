import { useEffect, useId, useState } from "react";
import { activateMedia, subscribeToMediaActivation } from "@/lib/media-coordinator";
import { getTrackEmbedUrl } from "@/lib/track-sources";

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
  const [resetKey, setResetKey] = useState(0);
  const aspectRatio = sourceType === "youtube" ? "16 / 9" : sourceType === "udio" ? "700 / 228" : "760 / 240";

  useEffect(() => subscribeToMediaActivation(({ id }) => {
    if (id !== instanceId) setResetKey((key) => key + 1);
  }), [instanceId]);

  if (!embedUrl) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 w-full overflow-hidden"
      style={{ aspectRatio }}
      onPointerDownCapture={() => activateMedia({ id: instanceId, kind: "external" })}
      onFocusCapture={() => activateMedia({ id: instanceId, kind: "external" })}
    >
      <iframe
        key={resetKey}
        src={embedUrl}
        title={title}
        className="block h-full w-full border-0"
        allow="encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
