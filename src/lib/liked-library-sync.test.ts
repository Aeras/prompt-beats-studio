import { describe, expect, test } from "bun:test";

// Contract guard for cross-surface likes synchronization.
describe("Liked Tracks library synchronization", () => {
  test("like toggles invalidate both the per-track state and the library projection", async () => {
    const likes = await Bun.file("src/lib/likes.ts").text();
    const library = await Bun.file("src/routes/library.tsx").text();
    expect(likes).toContain('queryClient.invalidateQueries({ queryKey: ["library", "liked", userId] })');
    expect(likes).toContain('tracks: previousLibrary.tracks.filter((track) => track.id !== trackId)');
    expect(likes).toContain("if (ctx?.previousLibrary) queryClient.setQueryData(ctx.libraryKey, ctx.previousLibrary)");
    expect(library).toContain('queryKey: ["library", "liked", user?.id]');
  });
});
