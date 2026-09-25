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
});
