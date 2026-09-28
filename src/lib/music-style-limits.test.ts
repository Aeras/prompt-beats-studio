import { describe, expect, test } from "bun:test";

import { fitMusicStyleToPlatform, musicStyleCharacterLimit } from "./music-style-limits";

describe("Music Style platform limits", () => {
  test("defines Suno at 1000 characters without inventing a Udio limit", () => {
    expect(musicStyleCharacterLimit("suno")).toBe(1000);
    expect(musicStyleCharacterLimit("udio")).toBeNull();
  });

  test("leaves Suno Music Style unchanged when already within budget", () => {
    const value = "Atmospheric alternative pop, intimate vocal, live drums";
    expect(fitMusicStyleToPlatform(value, "suno")).toBe(value);
  });

  test("caps an oversized Suno Music Style at or below 1000 characters", () => {
    const value = `${"cinematic texture, ".repeat(70)}wide final chorus`;
    const fitted = fitMusicStyleToPlatform(value, "suno");
    expect(fitted.length).toBeLessThanOrEqual(1000);
    expect(fitted.length).toBeGreaterThanOrEqual(900);
  });

  test("does not truncate Udio because no verified platform limit is configured", () => {
    const value = "x".repeat(1400);
    expect(fitMusicStyleToPlatform(value, "udio")).toBe(value);
  });
});
