// Service binding only: no sockets, secrets or external network access.
const seen = new Set();
export default {
  async fetch(request) {
    if (request.url !== "https://api.tavily.com/search" || request.method !== "POST")
      throw new Error("Unexpected outbound request, including redirect destination");
    if (request.headers.get("authorization") !== "Bearer offline-fixture-key")
      throw new Error("Unexpected fixture authorization");
    const body = await request.json();
    if (seen.has(body.query)) throw new Error("Duplicate search dispatch");
    seen.add(body.query);
    if (
      body.search_depth !== "basic" ||
      body.include_usage !== true ||
      body.auto_parameters !== false
    )
      throw new Error("Unexpected request contract");
    if (body.query.startsWith("status-"))
      return new Response("sensitive-marker", {
        status: Number(body.query.slice(7)),
        headers: { Location: "https://untrusted.example/sensitive-marker" },
      });
    if (body.query === "invalid-json") return new Response("{sensitive-marker");
    if (body.query === "invalid-schema") return Response.json({ results: "sensitive-marker" });
    return Response.json({
      ...(body.query === "missing-usage" ? {} : { usage: { credits: 1 } }),
      request_id: "offline-receipt",
      results: [
        {
          title: "Offline credits",
          url: "https://example.org/source",
          raw_content: "Offline guitar and synth evidence.",
        },
      ],
    });
  },
};
