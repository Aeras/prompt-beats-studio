import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { getPublicArtistByHandle } from "@/lib/profile.functions";
import { ArtistProfileView } from "@/components/promptbeats/ArtistProfileView";

export const Route = createFileRoute("/$handle")({
  beforeLoad: ({ params }) => {
    if (!params.handle.startsWith("@")) throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.handle} — Creator on PromptBeats` },
      {
        name: "description",
        content: `Listen to AI tracks by ${params.handle}, copy their prompts and support their work on PromptBeats.`,
      },
      { property: "og:title", content: `${params.handle} on PromptBeats` },
      { property: "og:description", content: `AI tracks and prompt recipes by ${params.handle}.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VanityArtistPage,
});

function VanityArtistPage() {
  const { handle } = Route.useParams();
  const clean = handle.replace(/^@/, "");
  const { data, isLoading } = useQuery({
    queryKey: ["public-artist-handle", clean],
    queryFn: () => getPublicArtistByHandle({ data: { handle: clean } }),
  });

  return (
    <ArtistProfileView
      profile={data?.profile ?? null}
      tracks={data?.tracks ?? []}
      isLoading={isLoading}
      notFoundLabel={`No creator found for @${clean}.`}
    />
  );
}
