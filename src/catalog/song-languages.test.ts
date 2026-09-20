import { describe, expect, test } from "bun:test";

import {
  CUSTOM_LANGUAGE_VALUE,
  findSongLanguageVariantFromCanonical,
  getSongLanguageOptions,
  getSongLanguageVariants,
  resolveSongLanguage,
  SONG_LANGUAGE_VALUES,
} from "./song-languages";

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

  test("never exposes raw ISO codes as user-facing language names", () => {
    for (const locale of ["en", "el"] as const) {
      const options = getSongLanguageOptions(locale);
      for (const item of options) {
        expect(item.label.toLocaleLowerCase()).not.toBe(item.code.toLocaleLowerCase());
        expect(item.englishLabel.toLocaleLowerCase()).not.toBe(item.code.toLocaleLowerCase());
        expect(item.value.toLocaleLowerCase()).not.toBe(item.code.toLocaleLowerCase());
      }
    }
  });

  test("does not duplicate canonical languages in the picker", () => {
    for (const locale of ["en", "el"] as const) {
      const options = getSongLanguageOptions(locale);
      const canonical = options.map((item) => item.value.toLocaleLowerCase());
      expect(new Set(canonical).size).toBe(canonical.length);
    }
  });

  test("resolves rare ISO languages to full names", () => {
    const options = getSongLanguageOptions("en");
    expect(options.find((item) => item.code === "aa")?.value).toBe("Afar");
    expect(options.find((item) => item.code === "ab")?.value).toBe("Abkhazian");
    expect(options.find((item) => item.code === "ae")?.value).toBe("Avestan");
    expect(options.find((item) => item.code === "ak")?.value).toBe("Akan");
    expect(options.find((item) => item.code === "km")?.value).toBe("Khmer");
  });

  test("supports optional dialect variants without duplicating base languages", () => {
    expect(getSongLanguageVariants("English").map((item) => item.id)).toEqual([
      "us",
      "uk",
      "au",
      "ca",
      "ie",
    ]);
    expect(resolveSongLanguage("English", "")).toBe("English");
    expect(resolveSongLanguage("English", "uk")).toBe("English (United Kingdom)");
    expect(resolveSongLanguage("Portuguese", "br")).toBe("Portuguese (Brazil)");
    expect(resolveSongLanguage("Greek", "cy")).toBe("Greek (Cyprus)");
  });

  test("can recover base language and variant from persisted canonical text", () => {
    expect(findSongLanguageVariantFromCanonical("Spanish (Mexico)")).toEqual({
      language: "Spanish",
      variantId: "mx",
    });
    expect(findSongLanguageVariantFromCanonical("Chinese (Cantonese, Traditional)")).toEqual({
      language: "Chinese",
      variantId: "cantonese-traditional",
    });
    expect(findSongLanguageVariantFromCanonical("English")).toBeNull();
  });

  test("keeps Custom outside the canonical language list", () => {
    expect(SONG_LANGUAGE_VALUES.includes(CUSTOM_LANGUAGE_VALUE)).toBe(false);
  });
});
