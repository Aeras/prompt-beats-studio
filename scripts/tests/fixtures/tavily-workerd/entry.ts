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
    const football = await searchInspirationWeb(
      "football-opt-in",
      new AbortController().signal,
      fetch,
      "offline-fixture-key",
      "basic",
      { football: { textChars: 24000, maxResults: 3, format: "text" } },
    );
    check(
      football.documents[0]?.footballRetrieval?.version === 2 && football.credits === 1,
      "Football opt-in lost metadata/usage",
    );
    const abort = new AbortController();
    abort.abort();
    let stopped = false;
    try {
      await searchInspirationWeb(
        "never-dispatched",
        abort.signal,
        fetch,
        "offline-fixture-key",
        "basic",
        { football: {} },
      );
    } catch {
      stopped = true;
    }
    check(stopped, "Pre-aborted Football search dispatched");
    let total = 0;
    for (let i = 0; i < 5; i++) {
      const result = await searchInspirationWeb(
        "football-five-" + i,
        new AbortController().signal,
        fetch,
        "offline-fixture-key",
        "basic",
        { football: { textChars: 24000, maxResults: 5, format: "text" } },
      );
      check(
        result.documents.length === 5 && result.credits === 1,
        "Five-result profile lost documents/receipt",
      );
      total += result.documents.length;
    }
    check(total === 25, "Expected 25 offline transport records");
    for (const depth of ["basic", "advanced"] as const) {
      let docs = 0,
        credits = 0;
      for (const language of ["en", "ru"]) {
        const r = await searchInspirationWeb(
          `football-ten-${depth}-${language}`,
          new AbortController().signal,
          fetch,
          "offline-fixture-key",
          depth,
          { football: { maxResults: 10, textChars: 24000, format: "text" } },
        );
        check(
          r.documents.length === 10 &&
            r.footballAudit?.receivedResults === 10 &&
            r.footballAudit?.discoveredSources.length === 10,
          "Ten-result transport lost candidates",
        );
        docs += r.documents.length;
        credits += r.credits ?? 0;
      }
      check(docs === 20 && credits === (depth === "basic" ? 2 : 4), "V2 counts/credits mismatch");
    }
    console.log(
      "PASS: 23 real-adapter workerd cases; native fetch; all outbound requests bound to local fixture; zero external requests",
    );
  },
};
