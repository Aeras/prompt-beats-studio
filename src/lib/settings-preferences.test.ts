import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Settings and track source preferences", () => {
  test("Settings keeps global preferences only", async () => {
    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    expect(settings).toContain("<LanguageSelector");
    expect(settings).toContain("useExternalMediaConsent()");
    expect(settings).toContain("useExplicitContentPreference()");
    expect(settings).not.toContain("useTrackSourcePreference()");
    expect(settings).not.toContain("<TrackSourceFilter");
    expect(settings).not.toContain("ποια πηγή τραγουδιών θα εμφανίζεται από προεπιλογή");
    expect(settings).toContain("Απόκρυψη explicit τραγουδιών");
    expect(settings).toContain("Hide explicit tracks");

    const sidebar = await source("src/components/promptbeats/Sidebar.tsx");
    expect(sidebar).toContain("<SettingsPanel");
    expect(sidebar).toContain("setSettingsOpen(true)");

    const profile = await source("src/components/promptbeats/EditProfileModal.tsx");
    expect(profile).not.toContain("<LanguageSelector");
  });

  test("External media consent is reversible and compact cards use compact consent UI", async () => {
    const consent = await source("src/lib/external-media-consent.ts");
    expect(consent).toContain("removeItem(EXTERNAL_MEDIA_CONSENT_KEY)");
    expect(consent).toContain("setExternalMediaConsent(enabled: boolean)");

    const embed = await source("src/components/promptbeats/ExternalTrackEmbed.tsx");
    expect(embed).toContain("useExternalMediaConsent");
    expect(embed).toContain('"External player blocked"');
    expect(embed).toContain('"Εξωτερικό player μπλοκαρισμένο"');
  });

  test("Track source filters persist independently for Feed, Trending, Library and Creator", async () => {
    const filter = await source("src/components/promptbeats/TrackSourceFilter.tsx");
    expect(filter).toContain('feed: "track_source_preference_feed"');
    expect(filter).toContain('trending: "track_source_preference_trending"');
    expect(filter).toContain('library: "track_source_preference_library"');
    expect(filter).toContain('creator: "track_source_preference_creator"');
    expect(filter).toContain('pathname.startsWith("/trending")');
    expect(filter).toContain('pathname.startsWith("/library")');
    expect(filter).toContain('pathname === "/"');
    expect(filter).toContain("supabase.auth.updateUser");
    expect(filter).toContain("surfaceLocalKey(surface)");
    expect(filter).toContain("persistence.setPreference(item)");
    expect(filter).toContain("filterByTrackSource");
  });

  test("Source filter binds to the current route immediately instead of booting as Feed", async () => {
    const filter = await source("src/components/promptbeats/TrackSourceFilter.tsx");
    expect(filter).toContain("forcedSurface?: TrackSourceSurface");
    expect(filter).toContain("const surface = forcedSurface ?? inferTrackSourceSurface()");
    expect(filter).not.toContain('useState<TrackSourceSurface>("feed")');
    expect(filter).not.toContain("setSurface(inferTrackSourceSurface())");
    expect(filter).toContain("writeLocalPreference(surface, next)");
    expect(filter).toContain("SURFACE_ACCOUNT_KEYS[surface]");
  });

  test("Persisted per-surface value remains authoritative when account metadata is stale", async () => {
    const filter = await source("src/components/promptbeats/TrackSourceFilter.tsx");
    const localIndex = filter.indexOf(
      "const localSurfaceValue = readSurfaceLocalPreference(surface)",
    );
    const accountIndex = filter.indexOf(
      "if (isPreference(surfaceAccountValue)) return surfaceAccountValue",
    );
    expect(localIndex).toBeGreaterThan(-1);
    expect(accountIndex).toBeGreaterThan(localIndex);
    expect(filter).toContain("if (!localSurfaceValue && isPreference(surfaceAccountValue)");
    expect(filter).toContain(
      "if (value !== persistence.preference) onChange(persistence.preference)",
    );
  });

  test("Explicit preference persists to the account and filters both normalized and DB track shapes", async () => {
    const filter = await source("src/components/promptbeats/TrackSourceFilter.tsx");
    expect(filter).toContain('EXPLICIT_ACCOUNT_KEY = "hide_explicit_tracks"');
    expect(filter).toContain('EXPLICIT_EVENT_KEY = "promptbeats:hide-explicit-tracks"');
    expect(filter).toContain("useExplicitContentPreference");
    expect(filter).toContain("setHideExplicit");
    expect(filter).toContain("supabase.auth.updateUser");
    expect(filter).toContain("track.containsExplicitLyrics !== true");
    expect(filter).toContain("track.contains_explicit_lyrics !== true");
    expect(filter).toContain("filterExplicitTracks");
    expect(filter).toContain("const visibleTracks = filterExplicitTracks");
  });

  test("Explicit badge acts as a global safety gate for track surfaces not using list filtering", async () => {
    const badge = await source("src/components/promptbeats/ExplicitBadge.tsx");
    expect(badge).toContain("useExplicitContentPreference");
    expect(badge).toContain('closest<HTMLElement>("article")');
    expect(badge).toContain('pathname.startsWith("/track/")');
    expect(badge).toContain('pathname.startsWith("/share/")');
    expect(badge).toContain("surface.hidden = hideExplicit");
    expect(badge).toContain('data-pb-explicit-badge="true"');
  });

  test("Auto-save drafts is account-backed and covers all creative editors", async () => {
    const preferences = await source("src/lib/account-preferences.ts");
    expect(preferences).toContain("autoSaveDrafts: boolean");
    expect(preferences).toContain('autoSaveDrafts: "auto_save_drafts"');
    expect(preferences).toContain("autoSaveDrafts: true");

    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    expect(settings).toContain('"Auto-save drafts"');
    expect(settings).toContain('"Αυτόματη αποθήκευση drafts"');
    expect(settings).toContain("clearAllDraftAutosaves(userId)");

    const helper = await source("src/lib/draft-autosave.ts");
    expect(helper).toContain('const DRAFT_PREFIX = "pb:draft:v1"');
    expect(helper).toContain("DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(helper).toContain("export function useDraftAutosave");

    for (const file of [
      "src/routes/generate.tsx",
      "src/components/promptbeats/LyricsWorkspace.tsx",
      "src/routes/lyrics-review.tsx",
      "src/components/promptbeats/SongSetupAssistantModal.tsx",
      "src/components/promptbeats/StudioModal.tsx",
      "src/components/promptbeats/PromptStandaloneDialogs.tsx",
      "src/components/promptbeats/TrackOwnerActions.tsx",
      "src/routes/song-universe.tsx",
      "src/routes/library.tsx",
      "src/routes/story-map.tsx",
      "src/routes/inspiration-wall.tsx",
    ]) {
      expect(await source(file)).toContain("useDraftAutosave");
    }
  });

  test("Settings orders App language before Generator defaults", async () => {
    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    const appLanguage = settings.indexOf('"Γλώσσα εφαρμογής"');
    const generatorLanguage = settings.indexOf('"Προεπιλεγμένη γλώσσα Generator"');
    const generatorMode = settings.indexOf('"Προεπιλεγμένο Generator mode"');
    expect(appLanguage).toBeGreaterThan(-1);
    expect(generatorLanguage).toBeGreaterThan(appLanguage);
    expect(generatorMode).toBeGreaterThan(generatorLanguage);
  });

  test("Generator waits for persisted account mode and clears drafts only on intentional route exit", async () => {
    const generator = await source("src/routes/generate.tsx");
    expect(generator).toContain("signedIn: accountPreferencesReady");
    expect(generator).toContain(
      "if (defaultGeneratorModeAppliedRef.current || !accountPreferencesReady) return",
    );
    expect(generator).toContain('accountPreferences.generatorMode === "advanced"');
    expect(generator).toContain('window.addEventListener("beforeunload", markPageUnload)');
    expect(generator).toContain("if (!generatorPageUnloadRef.current) clearGeneratorDraft()");
  });
});
