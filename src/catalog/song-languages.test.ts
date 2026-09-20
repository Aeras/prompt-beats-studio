import { describe, expect, test } from "bun:test";

import {
  CUSTOM_LANGUAGE_VALUE,
  getSongLanguageOptions,
  SONG_LANGUAGE_VALUES,
} from "@/catalog/song-languages";

describe("song language catalog", () => {
  test("contains the complete ISO 639-1 language set used by the picker", () => {
    const options = getSongLanguageOptions("en");
    expect(options.length).toBeGreaterThanOrEqual(180);
    expect(options.some((item) => item.value === "Greek")).toBe(true);
    expect(options.some((item) => item.value === "English")).toBe(true);
  });

  test("uses unique canonical backend values", () => {
    expect(new Set(SONG_LANGUAGE_VALUES).size).toBe(SONG_LANGUAGE_VALUES.length);
  });

  test("provides Greek and English display labels for the same canonical value", () => {
    const english = getSongLanguageOptions("en").find((item) => item.value === "Greek");
    const greek = getSongLanguageOptions("el").find((item) => item.value === "Greek");

    expect(english?.label).toBe("Greek");
    expect(greek?.label).not.toBe("");
    expect(greek?.value).toBe("Greek");
  });

  test("keeps Custom outside the canonical language list", () => {
    expect(SONG_LANGUAGE_VALUES.includes(CUSTOM_LANGUAGE_VALUE)).toBe(false);
  });
});
