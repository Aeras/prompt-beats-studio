import { searchInspirationWeb } from "../../../../src/lib/music-inspiration-research.server";
import { InspirationFailure } from "../../../../src/lib/music-inspiration-diagnostics.shared";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export default {
  async test() {
    // This is deliberately native fetch in workerd, not a Node/Bun fetch mock.
    const search = (query: string) =>
      searchInspirationWeb(query, new AbortController().signal, fetch, "offline-fixture-key");
    const found = await search("success");
    check(found.credits === 1 && found.requestId === "offline-receipt", "Usage receipt lost");
    check(
      found.documents.length === 1 &&
        /^[a-f0-9]{64}$/.test(found.documents[0]?.source.receipt?.contentSha256 ?? ""),
      "Evidence or hash missing",
    );
    check((await search("missing-usage")).credits === null, "Missing usage must remain unknown");
    for (const status of [301, 302, 303, 307, 308, 401, 429, 500]) {
      let failure: unknown;
      try {
        await search("status-" + status);
      } catch (error) {
        failure = error;
      }
      check(failure instanceof InspirationFailure, "Expected safe HTTP failure");
      check(
        failure.diagnostic.stage === "search_response" &&
          failure.diagnostic.code === "http" &&
          failure.diagnostic.httpStatus === status,
        "Redirect followed or HTTP status lost",
      );
      check(!String(failure).includes("sensitive-marker"), "Unsafe failure details");
    }
    for (const [query, stage] of [
      ["invalid-json", "search_parse"],
      ["invalid-schema", "search_schema"],
    ] as const) {
      let failure: unknown;
      try {
        await search(query);
      } catch (error) {
        failure = error;
      }
      check(
        failure instanceof InspirationFailure && failure.diagnostic.stage === stage,
        "Unsafe parser failure",
      );
    }
    console.log(
      "PASS: 12 real-adapter workerd cases; native fetch; all outbound requests bound to local fixture; zero external requests",
    );
  },
};
