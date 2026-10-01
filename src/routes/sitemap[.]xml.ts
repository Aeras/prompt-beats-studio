import { createFileRoute } from "@tanstack/react-router";

import { listEligiblePublicSitemapIdentities } from "@/lib/public-content.server";
import { getSeoRuntimeConfig } from "@/lib/seo-policy";
import { buildSitemapXml } from "@/lib/seo-sitemap.shared";

const PUBLIC_STATIC_PATHS = ["/", "/discover", "/terms", "/privacy", "/copyright-ip"] as const;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const config = getSeoRuntimeConfig();
        if (!config.indexingEnabled || !config.canonicalOrigin) {
          return new Response("Not Found", {
            status: 404,
            headers: { "X-Robots-Tag": "noindex, nofollow" },
          });
        }

        const { trackIds, creatorHandles } = await listEligiblePublicSitemapIdentities();
        const urls = [
          ...PUBLIC_STATIC_PATHS.map((path) => new URL(path, `${config.canonicalOrigin}/`).toString()),
          ...trackIds.map((id) =>
            new URL(`/track/${encodeURIComponent(id)}`, `${config.canonicalOrigin}/`).toString(),
          ),
          ...creatorHandles.map((handle) =>
            new URL(`/@${encodeURIComponent(handle)}`, `${config.canonicalOrigin}/`).toString(),
          ),
        ];

        return new Response(buildSitemapXml(urls), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
          },
        });
      },
    },
  },
});
