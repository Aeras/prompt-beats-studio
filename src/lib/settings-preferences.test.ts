import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("Settings and track source preferences", () => {
  test("Settings is the canonical preference surface", async () => {
    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    expect(settings).toContain("<LanguageSelector");
    expect(settings).toContain("useExternalMediaConsent()");
    expect(settings).toContain("useTrackSourcePreference()");
    expect(settings).toContain("useExplicitContentPreference()");
    expect(settings).toContain("<TrackSourceFilter");
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

  test("Track source preference is account-persistent while page filters remain local state", async () => {
    const filter = await source("src/components/promptbeats/TrackSourceFilter.tsx");
    expect(filter).toContain("track_source_preference");
    expect(filter).toContain("supabase.auth.updateUser");
    expect(filter).toContain("filterByTrackSource");

    for (const path of [
      "src/routes/index.tsx",
      "src/routes/trending.tsx",
      "src/routes/library.tsx",
      "src/components/promptbeats/PlaylistLibraryPanel.tsx",
    ]) {
      const code = await source(path);
      expect(code).toContain("useTrackSourcePreference");
      expect(code).toContain("TrackSourceFilter");
      expect(code).toContain("filterByTrackSource");
    }

    const artist = await source("src/components/promptbeats/ArtistProfileView.tsx");
    expect(artist).toContain("useTrackSourcePreference");
    expect(artist).toContain("TrackSourceFilter");
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
