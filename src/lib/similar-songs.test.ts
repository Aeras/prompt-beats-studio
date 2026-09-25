import { describe, expect, test } from "bun:test";

import { scoreSimilarSong, similarityTokens } from "@/lib/similar-songs.shared";

describe("similar songs scoring", () => {
  test("ranks prompt overlap above genre-only fallback", () => {
    const source = {
      prompt: "dark cinematic rock with male vocals electric guitars orchestral strings driving drums",
      genre: "Rock",
    };
    const promptMatch = scoreSimilarSong(source, {
      prompt: "cinematic dark rock, driving drums, electric guitar and orchestral strings",
      genre: "Rock",
    });
    const genreOnly = scoreSimilarSong(source, { prompt: "", genre: "Rock" });
    expect(promptMatch.score).toBeGreaterThan(genreOnly.score);
    expect(promptMatch.matchedOn).toBe("prompt_genre");
  });

  test("falls back to genre when prompt evidence is unavailable", () => {
    const result = scoreSimilarSong(
      { prompt: "", genre: "Pop" },
      { prompt: "totally unrelated long candidate prompt", genre: "Pop" },
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.matchedOn).toBe("genre");
  });

  test("tokenization removes common filler words", () => {
    const tokens = similarityTokens("Rock with the drums and guitar");
    expect(tokens).toContain("rock");
    expect(tokens).toContain("drums");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
  });
});