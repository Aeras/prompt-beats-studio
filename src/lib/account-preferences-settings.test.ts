import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Settings account defaults", () => {
  test("Settings stays compact, supports horizontal swipe close, and uses outside-dismiss info popovers", async () => {
    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");

    expect(settings).toContain("max-h-[86dvh]");
    expect(settings).toContain("touch-pan-y");
    expect(settings).toContain("Math.abs(dx) >= 90");
    expect(settings).toContain("Math.abs(dx) > Math.abs(dy) * 1.35");
    expect(settings).toContain("CircleAlert");
    expect(settings).toContain('data-settings-info="true"');
    expect(settings).toContain("setInfo(null)");
    expect(settings).toContain("flex flex-nowrap gap-2");
  });

  test("Generator defaults are the first account settings and language uses the canonical catalog", async () => {
    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    const languageIndex = settings.indexOf("Προεπιλεγμένη γλώσσα Generator");
    const modeIndex = settings.indexOf("Προεπιλεγμένο Generator mode");
    const libraryIndex = settings.indexOf("Προεπιλεγμένη καρτέλα Βιβλιοθήκης");

    expect(languageIndex).toBeGreaterThan(-1);
    expect(modeIndex).toBeGreaterThan(languageIndex);
    expect(libraryIndex).toBeGreaterThan(modeIndex);
    expect(settings).toContain("getSongLanguageOptions(language)");
    expect(settings).toContain("songLanguages.map");
  });

  test("all new preferences persist through account metadata", async () => {
    const preferences = await source("src/lib/account-preferences.ts");

    for (const key of [
      "default_generator_language",
      "default_generator_mode",
      "default_library_tab",
      "default_track_published",
      "default_prompt_public",
      "default_lyrics_public",
      "default_allow_download",
      "default_export_format",
    ]) {
      expect(preferences).toContain(key);
    }
    expect(preferences).toContain("supabase.auth.updateUser");
  });

  test("Library and Settings share one canonical tab registry", async () => {
    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    const library = await source("src/routes/library.tsx");

    expect(settings).toContain("LIBRARY_TABS.map");
    expect(library).toContain("const TABS = LIBRARY_TAB_IDS");
    expect(library).toContain("accountPreferences.libraryTab");
    expect(library).toContain("isLibraryTab(value)");
  });

  test("Generator, Submit Track, and Export consume the saved defaults", async () => {
    const generate = await source("src/routes/generate.tsx");
    const languagePicker = await source("src/components/promptbeats/LanguagePicker.tsx");
    const studio = await source("src/components/promptbeats/StudioModal.tsx");
    const exportControl = await source("src/components/promptbeats/ExportControl.tsx");

    expect(generate).toContain('accountPreferences.generatorMode === "advanced"');
    expect(languagePicker).toContain("preferences.generatorLanguage");
    expect(studio).toContain("defaults.trackPublished");
    expect(studio).toContain("defaults.promptPublic");
    expect(studio).toContain("defaults.lyricsPublic");
    expect(studio).toContain("defaults.allowDownload");
    expect(exportControl).toContain("preferences.exportFormat");
  });
});
