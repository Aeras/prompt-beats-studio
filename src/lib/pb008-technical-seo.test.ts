import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("PB-008 technical SEO and public discoverability", () => {
  test("strict-public Track route is server-resolved with no owner-private fallback", async () => {
    const route = await source("src/routes/track.$id.tsx");
    const server = await source("src/lib/public-content.server.ts");
    expect(route).toContain("getEligiblePublicTrack");
    expect(route).toContain("throw notFound()");
    expect(route).not.toContain("getPublicTrackById");
    expect(server).toContain('.eq("is_published", true)');
    expect(server).toContain("moderationStatus: track.moderation_status");
    expect(server).toContain("creatorEligible: account.eligible");
    expect(server).toContain('select("user_id, moderation_status")');
    expect(server).toContain('select("user_id, is_banned")');
    expect(server).not.toContain("bearerToken");
    expect(server).not.toContain("isOwner");
  });

  test("Track metadata is canonical, public-safe, and shares route eligibility", async () => {
    const route = await source("src/routes/track.$id.tsx");
    const head = route.slice(route.indexOf("head:"), route.indexOf("component: TrackPage"));
    expect(head).toContain("canonicalLink(`/track/${encodeURIComponent(track.id)}`)");
    expect(head).toContain('robotsContent("index")');
    expect(head).not.toContain("track.prompt");
    expect(head).not.toContain("track.lyrics");
  });

  test("creator vanity route applies exact thin/indexable threshold", async () => {
    const route = await source("src/routes/$handle.tsx");
    const shared = await source("src/lib/public-eligibility.shared.ts");
    expect(route).toContain("getEligiblePublicCreatorByHandle");
    expect(route).toContain('loaderData.state === "indexable"');
    expect(route).toContain('"noindex-follow"');
    expect(route).toContain("canonicalLink");
    expect(shared).toContain('return eligiblePublicTrackCount > 0 ? "indexable" : "thin"');
  });

  test("creator aliases converge on vanity canonical identity", async () => {
    const byId = await source("src/routes/artist.$id.tsx");
    const legacy = await source("src/routes/u.$handle.tsx");
    expect(byId).toContain('to: "/$handle"');
    expect(byId).toContain("getEligiblePublicCreatorById");
    expect(legacy).toContain('to: "/$handle"');
  });

  test("Discover base/query policy and public results use shared eligibility", async () => {
    const discover = await source("src/routes/discover.tsx");
    expect(discover).toContain("listEligiblePublicTracksFn");
    expect(discover).toContain("searchEligiblePublicCreatorsFn");
    expect(discover).toContain('robotsContent(hasQuery ? "noindex-follow" : "index")');
    expect(discover).toContain('canonicalLink("/discover")');
  });

  test("token routes are excluded from canonical and indexing surfaces", async () => {
    const share = await source("src/routes/share.$token.tsx");
    const review = await source("src/routes/review.$token.tsx");
    const sitemap = await source("src/routes/sitemap[.]xml.ts");
    expect(share).toContain('robotsContent("token")');
    expect(share).not.toContain("canonicalLink");
    expect(share).not.toContain("safeJsonLd");
    expect(review).toContain("noindex,nofollow,noarchive");
    expect(review).not.toContain("canonical");
    expect(sitemap).not.toContain("share/");
    expect(sitemap).not.toContain("review/");
  });

  test("root is fail-closed while public routes explicitly opt into indexing", async () => {
    const root = await source("src/routes/__root.tsx");
    const home = await source("src/routes/index.tsx");
    expect(root).toContain('robotsContent("noindex")');
    expect(home).toContain('robotsContent("index")');
    expect(home).toContain('canonicalLink("/")');
    expect(root).toContain("AI-assisted songwriting and song development platform");
    expect(root).not.toContain("AI music sharing platform");
  });

  test("sitemap is environment-gated and derives Tracks/creators from shared eligibility", async () => {
    const sitemap = await source("src/routes/sitemap[.]xml.ts");
    const server = await source("src/lib/public-content.server.ts");
    expect(sitemap).toContain("listEligiblePublicSitemapIdentities");
    expect(sitemap).toContain("!config.indexingEnabled");
    expect(sitemap).toContain("/track/");
    expect(sitemap).toContain("/@");
    expect(sitemap).not.toContain("?q=");
    expect(server).toContain("listEligiblePublicSitemapIdentities");
    expect(server).toContain("isPublicTrackEligible");
  });

  test("robots is environment-aware and never exposes production sitemap when indexing is off", async () => {
    const robots = await source("src/routes/robots[.]txt.ts");
    expect(robots).toContain("Disallow: /");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("config.indexingEnabled && config.canonicalOrigin");
    expect(robots).toContain("/sitemap.xml");
  });

  test("Home WebSite JSON-LD uses the hardened serializer only when canonical indexing is active", async () => {
    const home = await source("src/routes/index.tsx");
    expect(home).toContain('type: "application/ld+json"');
    expect(home).toContain("safeJsonLd");
    expect(home).toContain('"@type": "WebSite"');
    expect(home).not.toContain("dangerouslySetInnerHTML");
  });

  test("PB-008 introduces no database migration or SEO database contract", async () => {
    const policy = await source("src/lib/seo-policy.ts");
    const sitemap = await source("src/routes/sitemap[.]xml.ts");
    expect(policy).not.toContain("is_indexable");
    expect(sitemap).not.toContain("seo_");
  });
});
