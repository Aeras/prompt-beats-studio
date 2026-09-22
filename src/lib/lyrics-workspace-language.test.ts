import { describe, expect, test } from "bun:test";

import { CUSTOM_LANGUAGE_VALUE } from "@/catalog/song-languages";
import { resolveLyricsWorkspaceLanguage } from "./lyrics-workspace.shared";

describe("Lyrics Workspace language resolution", () => {
  test("keeps saved_prompts.language authoritative when present", () => {
    expect(resolveLyricsWorkspaceLanguage("Greek (Greece)", {
      language: "English",
      languageVariant: "uk",
      customLanguage: "",
    })).toBe("Greek (Greece)");
  });

  test("falls back to the legacy generator snapshot and preserves variants", () => {
    expect(resolveLyricsWorkspaceLanguage("", {
      language: "English",
      languageVariant: "uk",
      customLanguage: "",
    })).toBe("English (United Kingdom)");
  });

  test("uses the typed custom language for legacy Custom snapshots", () => {
    expect(resolveLyricsWorkspaceLanguage("   ", {
      language: CUSTOM_LANGUAGE_VALUE,
      languageVariant: "",
      customLanguage: "  Pontic Greek  ",
    })).toBe("Pontic Greek");
  });

  test("does not invent a language when stored metadata and snapshot are both missing", () => {
    expect(resolveLyricsWorkspaceLanguage("", null)).toBe("");
    expect(resolveLyricsWorkspaceLanguage("", {
      language: "",
      languageVariant: "",
      customLanguage: "",
    })).toBe("");
  });
});
