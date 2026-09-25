import { expect, test } from "bun:test";

test("My Tracks source filter persists through the Library preference hook", async () => {
  const library = await Bun.file("src/routes/library.tsx").text();

  expect(library).toContain('useTrackSourcePreference("library")');
  expect(library).toContain("setPreference: persistTrackSource");
  expect(library).toContain("void persistTrackSource(value).catch(() => undefined)");
});
