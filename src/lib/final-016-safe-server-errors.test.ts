import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

const protectedBoundaries = [
  "src/lib/tracks.functions.ts",
  "src/lib/track-sharing.functions.ts",
  "src/lib/profile.functions.ts",
] as const;

describe("FINAL-016 safe server error boundaries", () => {
  test("central mapper logs internal details and throws only a caller-supplied public message", async () => {
    const helper = await source("src/lib/server-error.ts");

    expect(helper).toContain("console.error(`[PromptBeats:${scope}] ${reference}`, error)");
    expect(helper).toContain("throw new Error(publicMessage)");
    expect(helper).not.toContain("throw new Error(error.message)");
  });

  test("core public/user-facing boundaries no longer propagate raw database messages", async () => {
    for (const path of protectedBoundaries) {
      const contents = await source(path);
      expect(contents).not.toContain("throw new Error(error.message)");
      expect(contents).not.toContain("error: error.message");
      expect(contents).toContain("throwSafeServerError");
    }
  });

  test("expected validation errors remain explicit rather than being flattened", async () => {
    const tracks = await source("src/lib/tracks.functions.ts");

    expect(tracks).toContain('throw new Error("Invalid uploaded audio reference")');
    expect(tracks).toContain('throw new Error("Invalid external track link")');
    expect(tracks).toContain('throw new Error("Track not found")');
  });
});
