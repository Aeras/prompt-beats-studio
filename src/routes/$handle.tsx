import { createFileRoute, notFound } from "@tanstack/react-router";

import { getEligiblePublicCreatorByHandle } from "@/lib/public-content.functions";
import { canonicalLink, canonicalUrl, robotsContent } from "@/lib/seo-policy";
import { ArtistProfileView } from "@/components/promptbeats/ArtistProfileView";
import { AppShell } from "@/components/promptbeats/AppShell";

export const Route = createFileRoute("/$handle")({
  beforeLoad: ({ params }) => {
    if (!params.handle.startsWith("@")) throw notFound();
  },
  loader: async ({ params }) => {
    const clean = params.handle.replace(/^@/, "");
    const creator = await getEligiblePublicCreatorByHandle({ data: { handle: clean } });
    if (!creator) throw notFound();
    return creator;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const profile = loaderData.profile;
    const handle = profile.handle || "creator";
    const name = profile.artist_alias || profile.display_name || `@${handle}`;
    const indexable = loaderData.state === "indexable";
    const canonical = indexable ? canonicalLink(`/@${encodeURIComponent(handle)}`) : null;
    const ogUrl = indexable ? canonicalUrl(`/@${encodeURIComponent(handle)}`) : null;
    const description = `${name} is a songwriting creator on PromptBeats, an AI-assisted songwriting and song development platform.`;
    return {
      meta: [
        { title: `${name} — Creator on PromptBeats` },
        { name: "description", content: description },
        { name: "robots", content: robotsContent(indexable ? "index" : "noindex-follow") },
        { property: "og:title", content: `${name} on PromptBeats` },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        ...(ogUrl ? [{ property: "og:url", content: ogUrl }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: canonical ? [canonical] : [],
    };
  },
  component: VanityArtistPage,
});

function VanityArtistPage() {
  const creator = Route.useLoaderData();
  const clean = creator.profile.handle || "creator";

  return (
    <AppShell
      header={
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-foreground">@{clean}</p>
        </div>
      }
    >
      <div className="[&>div]:min-h-0 [&>div]:bg-transparent [&>div]:px-4 [&>div]:py-6 md:[&>div]:px-8 md:[&>div]:py-8 [&>div>div]:max-w-[1400px] [&>div>div>a:first-child]:hidden">
        <ArtistProfileView profile={creator.profile} tracks={creator.tracks} isLoading={false} />
      </div>
    </AppShell>
  );
}
