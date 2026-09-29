import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { songUniverseStatusLabel, songUniverseTypeLabel } from "./song-universe-labels";

describe("Song Universe mobile editor and localized labels", () => {
  test("translates universe type and status options to Greek", () => {
    expect(songUniverseTypeLabel("album", "el")).toBe("Άλμπουμ");
    expect(songUniverseTypeLabel("song_series", "el")).toBe("Σειρά τραγουδιών");
    expect(songUniverseTypeLabel("creative_era", "el")).toBe("Δημιουργική περίοδος");
    expect(songUniverseTypeLabel("other", "el")).toBe("Άλλο");

    expect(songUniverseStatusLabel("planning", "el")).toBe("Σχεδιασμός");
    expect(songUniverseStatusLabel("writing", "el")).toBe("Συγγραφή");
    expect(songUniverseStatusLabel("production", "el")).toBe("Παραγωγή");
    expect(songUniverseStatusLabel("review", "el")).toBe("Έλεγχος");
    expect(songUniverseStatusLabel("complete", "el")).toBe("Ολοκληρωμένο");
    expect(songUniverseStatusLabel("archived", "el")).toBe("Αρχειοθετημένο");
  });

  test("keeps the description textarea full-width below the title actions", async () => {
    const route = await readFile("src/routes/song-universe.tsx", "utf8");

    expect(route).toContain('className="mt-3 min-h-24 w-full resize-y rounded-xl');
    expect(route).toContain('songUniverseTypeLabel("other", locale)');
    expect(route).toContain('songUniverseStatusLabel("planning", locale)');
  });
});
