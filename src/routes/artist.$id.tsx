import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { getPublicArtistById } from "@/lib/profile.functions";
import { ArtistProfileView } from "@/components/promptbeats/ArtistProfileView";
import { AppShell } from "@/components/promptbeats/AppShell";

export const Route = createFileRoute("/artist/$id")({
  head: () => ({
    meta: [
      { title: "Artist — PromptBeats" },
      {
        name: "description",
        content: "Explore this creator's AI tracks, copy their prompts and support their work.",
      },
      { property: "og:title", content: "Artist on PromptBeats" },
      {
        property: "og:description",
        content: "AI tracks and prompt recipes from this PromptBeats creator.",
      },
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

  const profile = data?.profile ?? null;
  return (
    <AppShell
      header={
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-foreground">
            {profile ? `@${profile.handle}` : "PromptBeats"}
          </p>
        </div>
      }
    >
      <div className="[&>div]:min-h-0 [&>div]:bg-transparent [&>div]:px-4 [&>div]:py-6 md:[&>div]:px-8 md:[&>div]:py-8 [&>div>div]:max-w-[1400px] [&>div>div>a:first-child]:hidden">
        <ArtistProfileView profile={profile} tracks={data?.tracks ?? []} isLoading={isLoading} />
      </div>
    </AppShell>
  );
}
