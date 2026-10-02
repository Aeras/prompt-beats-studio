import { createFileRoute } from "@tanstack/react-router";

import { getSeoRuntimeConfig } from "@/lib/seo-policy";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const config = getSeoRuntimeConfig();
        const body =
          config.indexingEnabled && config.canonicalOrigin
            ? `User-agent: *\nAllow: /\n\nSitemap: ${config.canonicalOrigin}/sitemap.xml\n`
            : "User-agent: *\nDisallow: /\n";

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...(config.indexingEnabled ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
          },
        });
      },
    },
  },
});
