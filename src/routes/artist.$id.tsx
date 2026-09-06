import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { getPublicArtistById } from "@/lib/profile.functions";
import { ArtistProfileView } from "@/components/promptbeats/ArtistProfileView";

export const Route = createFileRoute("/artist/$id")({
  head: () => ({
    meta: [
      { title: "Artist — PromptBeats" },
      { name: "description", content: "Explore this creator's AI tracks, copy their prompts and support their work." },
      { property: "og:title", content: "Artist on PromptBeats" },
      { property: "og:description", content: "AI tracks and prompt recipes from this PromptBeats creator." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArtistPage,
});

function ArtistPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["public-artist", id],
    queryFn: () => getPublicArtistById({ data: { id } }),
  });

  return <ArtistProfileView profile={data?.profile ?? null} tracks={data?.tracks ?? []} isLoading={isLoading} />;
}
