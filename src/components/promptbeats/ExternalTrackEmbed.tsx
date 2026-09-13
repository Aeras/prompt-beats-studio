import { getTrackEmbedUrl } from "@/lib/track-sources";

export function ExternalTrackEmbed({
  sourceType,
  sourceId,
  title,
  className = "h-full w-full border-0",
}: {
  sourceType: string | null | undefined;
  sourceId: string | null | undefined;
  title: string;
  className?: string;
}) {
  const embedUrl = getTrackEmbedUrl(sourceType, sourceId);
  if (!embedUrl) return null;

  return (
    <iframe
      src={embedUrl}
      title={title}
      className={className}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
