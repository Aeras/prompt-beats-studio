import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Generator EN/EL localization", () => {
  test("confirmed user-visible generator messages use stable translation keys", async () => {
    const route = await source("src/routes/generate.tsx");
    const requiredKeys = [
      "quality.featureUnavailable",
      "generator.featureUnavailable",
      "lyricsWorkspace.featureUnavailable",
      "generator.songAnalyzerLoaded",
      "generator.songAnalyzerLoadFailed",
      "generator.storyDrivenLyrics",
      "generator.storyDrivenLyricsDescription",
      "generator.songSetupAssistant",
    ];

    for (const key of requiredKeys) expect(route).toContain(`t("${key}")`);

    for (const leakedText of [
      "Quality Check is currently unavailable.",
      "AI Generator is currently unavailable.",
      "Lyrics Workspace is currently unavailable.",
      "Song Analyzer fields loaded. Review or edit them before generating.",
      "Could not load Song Analyzer fields.",
      "Story-driven lyrics",
      "Could not save Story Map.",
    ]) {
      expect(route).not.toContain(leakedText);
    }
  });

  test("English and Greek app dictionaries contain the generator cleanup keys", async () => {
    const en = await source("src/i18n/locales/en-app.ts");
    const el = await source("src/i18n/locales/el-app.ts");
    const requiredKeys = [
      "generator.featureUnavailable",
      "generator.songAnalyzerLoaded",
      "generator.songAnalyzerLoadFailed",
      "generator.songSetupAssistant",
      "generator.storyDrivenLyrics",
      "generator.storyDrivenLyricsDescription",
      "generator.storyMapSaveFailed",
      "generator.error.providerUnavailable",
      "generator.error.registryUnavailable",
      "generator.error.accountUnavailable",
      "generator.error.aiNotAllowed",
      "generator.error.invalidResponse",
      "quality.featureUnavailable",
      "lyricsWorkspace.featureUnavailable",
    ];

    for (const key of requiredKeys) {
      expect(en).toContain(`"${key}"`);
      expect(el).toContain(`"${key}"`);
    }
  });

  test("known generation and quality errors are normalized before display", async () => {
    const route = await source("src/routes/generate.tsx");
    expect(route).toContain("localizeAiError");
    expect(route).toContain('"generator.error.providerUnavailable"');
    expect(route).toContain('"generator.error.registryUnavailable"');
    expect(route).toContain('"generator.error.accountUnavailable"');
    expect(route).toContain('"generator.error.aiNotAllowed"');
    expect(route).toContain('"generator.error.invalidResponse"');
    expect(route).toContain('"quality.unavailable"');
    expect(route).not.toContain("setStatus(job.error ??");
    expect(route).not.toContain("setCheckError(job.error ??");
  });
});
