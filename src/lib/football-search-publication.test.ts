import { expect, test } from "bun:test";
import { searchInspirationWeb } from "./music-inspiration-research.server";
import { buildFootballSourceSnapshot } from "./football-ai-source-snapshot.shared";
test("existing Music Inspiration callers retain their exact document shape unless explicitly opted in", async () => {
  const r = await searchInspirationWeb(
    "offline",
    new AbortController().signal,
    async () =>
      Response.json({
        results: [
          {
            title: "Legacy",
            url: "https://sportsmole.co.uk/legacy",
            raw_content: "Unchanged retrieved document",
            published_date: "2026-11-05T10:00:00Z",
          },
        ],
      }),
    "offline",
  );
  expect(r.documents[0]).not.toHaveProperty("publishedAtUtc");
  expect(Object.keys(r.documents[0]!).sort()).toEqual(["source", "text"]);
});
for (const date of [
  "2026-11-05T10:30:00+02:00",
  "2026-11-05",
  "not-a-date",
  "2026-02-30T10:00:00Z",
  null,
])
  test(`publication metadata is optional, does not alter retrieval or invent a time: ${date}`, async () => {
    let calls = 0;
    const r = await searchInspirationWeb(
      "offline preview",
      new AbortController().signal,
      async (_url, init) => {
        calls++;
        expect(JSON.parse(String(init?.body)).max_results).toBe(3);
        return Response.json({
          results: [
            {
              title: "Offline article",
              url: "https://sportsmole.co.uk/offline",
              raw_content: "A bounded retrieved source passage.",
              published_date: date,
            },
          ],
        });
      },
      "offline",
      "basic",
      { includePublicationMetadata: true },
    );
    const d = r.documents[0]!;
    expect(calls).toBe(1);
    expect(d.text).toBe("A bounded retrieved source passage.");
    const snapshot = buildFootballSourceSnapshot([
      {
        title: d.source.title,
        url: d.source.url,
        accessedAt: d.source.accessedAt,
        excerpt: d.text,
        researchIntent: "external_forecasts",
        ...(d.publishedAtUtc ? { publishedAtUtc: d.publishedAtUtc } : {}),
      },
    ]);
    if (date === "2026-11-05T10:30:00+02:00")
      expect(snapshot[0]!.publishedAtUtc).toBe("2026-11-05T08:30:00.000Z");
    else expect(snapshot[0]).not.toHaveProperty("publishedAtUtc");
  });
