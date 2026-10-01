import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { getTrackShareByToken } from "@/lib/track-sharing.functions";
import { robotsContent } from "@/lib/seo-policy";
import { ExternalTrackEmbed } from "@/components/promptbeats/ExternalTrackEmbed";
import { ExplicitBadge } from "@/components/promptbeats/ExplicitBadge";
import { ReportTrackControl } from "@/components/promptbeats/ReportTrackControl";
import { getTrackEmbedUrl } from "@/lib/track-sources";
import { useI18n } from "@/i18n";
import artFallback from "@/assets/art-3.jpg";
import { getUserAvatarUrl } from "@/lib/user-avatar";

export const Route = createFileRoute("/share/$token")({
  loader: ({ params }) => getTrackShareByToken({ data: { token: params.token } }),
  head: ({ loaderData }) => {
    const active = loaderData?.state === "active" ? loaderData : null;
    const artistName = active?.artist
      ? active.artist.artist_alias ||
        active.artist.display_name ||
        active.artist.handle ||
        "PromptBeats creator"
      : null;
    const title = active ? `${active.track.title} — Shared from PromptBeats` : "Shared Track — PromptBeats";
    const description = active
      ? `Listen to ${active.track.title}${artistName ? ` by ${artistName}` : ""}, shared from PromptBeats.`
      : "Listen to a track shared from PromptBeats.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: robotsContent("token") },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "music.song" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: SharedTrackPage,
});

function SharedTrackPage() {
  const { language } = useI18n();
  const data = Route.useLoaderData();

  if (!data || data.state === "unavailable") {
    return (
      <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
        <div className="glass mx-auto max-w-xl rounded-3xl p-8 text-center">
          <h1 className="font-display text-2xl font-bold">
            {language === "el"
              ? "Το link δεν είναι πλέον διαθέσιμο"
              : "This link is no longer available"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {language === "el"
              ? "Μπορεί να έχει ανακληθεί ή το τραγούδι να μην είναι πλέον διαθέσιμο."
              : "It may have been revoked or the track may no longer be available."}
          </p>
        </div>
      </div>
    );
  }

  if (data.state === "private") {
    return (
      <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-10">
        <div className="glass mx-auto max-w-xl rounded-3xl p-8 text-center">
          <h1 className="font-display text-2xl font-bold">{data.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {language === "el"
              ? "Ο δημιουργός έκανε αυτό το τραγούδι ιδιωτικό."
              : "The creator made this track private."}
          </p>
        </div>
      </div>
    );
  }

  const { track, artist } = data;
  const artistName =
    artist?.artist_alias ||
    artist?.display_name ||
    artist?.handle ||
    (language === "el" ? "Δημιουργός" : "Creator");
  const artwork =
    track.cover_url ?? (artist?.avatar_url ? getUserAvatarUrl(artist.avatar_url) : artFallback);
  const embedUrl = getTrackEmbedUrl(track.source_type, track.source_id);

  return (
    <div className="aurora min-h-screen bg-[#0a0a0c] px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="glass-strong overflow-hidden rounded-3xl p-5 sm:p-7">
          <div
            className={
              embedUrl
                ? "space-y-6"
                : "grid gap-6 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)] lg:items-center"
            }
          >
            {embedUrl ? (
              <div className="relative aspect-[760/240] overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <ExternalTrackEmbed
                  sourceType={track.source_type}
                  sourceId={track.source_id}
                  title={track.title}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <img src={artwork} alt={track.title} className="h-full w-full object-cover" />
                </div>
                {track.audio_type === "upload" && (
                  <audio controls src={track.audio_url} className="w-full" />
                )}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-accent">{track.genre}</p>
                {track.contains_explicit_lyrics && <ExplicitBadge />}
              </div>
              <h1 className="font-display text-3xl font-bold sm:text-4xl">{track.title}</h1>
              <p className="text-sm text-muted-foreground">
                {language === "el" ? "Από" : "By"} <span className="text-accent">{artistName}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/track/$id"
                  params={{ id: track.id }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground hover:border-accent/50 hover:text-accent"
                >
                  <ExternalLink className="h-4 w-4" />
                  {language === "el" ? "Άνοιγμα στο PromptBeats" : "Open in PromptBeats"}
                </Link>
                <ReportTrackControl
                  trackId={track.id}
                  ownerId={track.user_id}
                  isPublished
                  iconOnly={false}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {track.prompt && (
            <section className="glass rounded-2xl p-5">
              <h2 className="font-display text-xl font-semibold">Prompt</h2>
              <pre className="mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-sans text-sm text-muted-foreground">
                {track.prompt}
              </pre>
            </section>
          )}
          {track.lyrics && (
            <section className="glass rounded-2xl p-5">
              <h2 className="font-display text-xl font-semibold">Lyrics</h2>
              <pre className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-sans text-sm text-muted-foreground">
                {track.lyrics}
              </pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
