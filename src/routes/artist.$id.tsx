import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { getEligiblePublicCreatorById } from "@/lib/public-content.functions";
import { robotsContent } from "@/lib/seo-policy";

export const Route = createFileRoute("/artist/$id")({
  loader: async ({ params }) => {
    const creator = await getEligiblePublicCreatorById({ data: { id: params.id } });
    if (!creator?.profile.handle) throw notFound();
    throw redirect({
      to: "/$handle",
      params: { handle: `@${creator.profile.handle}` },
      replace: true,
    });
  },
  head: () => ({
    meta: [{ name: "robots", content: robotsContent("noindex") }],
  }),
  component: () => null,
});
