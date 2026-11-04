// Local service binding; the internet service has an empty network allowlist.
const seen = new Set();
export default {
  async fetch(request) {
    if (request.url !== "https://kino-api.promptbeats.app/lab-v1.php" || request.method !== "POST")
      throw new Error("Unexpected destination, including redirect leakage");
    if (request.headers.get("authorization") !== "Bearer " + "offline_fixture_token_".repeat(3))
      throw new Error("Invalid synthetic authorization");
    if (
      !/^[a-f0-9]{64}$/.test(request.headers.get("x-kino-owner") ?? "") ||
      request.headers.has("cookie") ||
      request.headers.has("origin")
    )
      throw new Error("Unsafe fixture request headers");
    const body = await request.json();
    const id = body.op === "status" ? "status" : body.seed;
    if (seen.has(id)) throw new Error("Duplicate dispatch");
    seen.add(id);
    if (id.startsWith("http-"))
      return new Response("SENSITIVE_MARKER", {
        status: Number(id.slice(5)),
        headers: { Location: "https://attacker.invalid/token-leak" },
      });
    return Response.json({
      version: 1,
      source: "polar55",
      stored: 77,
      lastObserved: null,
      coverage: "COMPLETENESS_UNVERIFIED",
      backfill: "DISABLED",
    });
  },
};
