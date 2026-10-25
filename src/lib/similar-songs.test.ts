import { describe, expect, test } from "bun:test";

import { scoreSimilarSong, similarityTokens } from "@/lib/similar-songs.shared";

describe("similar songs scoring", () => {
  test("ranks prompt overlap above genre-only fallback", () => {
    const source = {
      prompt:
        "dark cinematic rock with male vocals electric guitars orchestral strings driving drums",
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

// Prevent regressing to a dialog owned by an auto-unmounting dropdown item.
test("similar songs dialog is owned by the persistent track card", async () => {
  const card = await Bun.file("src/components/promptbeats/TrackCard.tsx").text();
  const menuItem = await Bun.file("src/components/promptbeats/SimilarSongsMenuItem.tsx").text();
  expect(card).toContain("const [similarSongsOpen, setSimilarSongsOpen] = useState(false)");
  expect(card).toContain("<SimilarSongsDialog");
  expect(card).toContain("<SimilarSongsMenuItem onOpen={() => setSimilarSongsOpen(true)} />");
  expect(menuItem).not.toContain("<SimilarSongsDialog");
});
