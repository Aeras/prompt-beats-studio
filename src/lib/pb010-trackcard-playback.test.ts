import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("PB-010 — shared TrackCard external playback contract", () => {
  test("application root owns one shared external playback provider", async () => {
    const root = await source("src/routes/__root.tsx");
    expect(root).toContain("import { ExternalPlaybackProvider }");
    expect(root).toContain("<ExternalPlaybackProvider>");
    expect(root).toContain("</ExternalPlaybackProvider>");
  });

  test("Compact TrackCard does not mount the resting provider embed", async () => {
    const card = await source("src/components/promptbeats/TrackCard.tsx");
    expect(card).toContain("embedUrl && !compact");
    expect(card).toContain("openExternalPlayback({");
    expect(card).toContain("returnFocusElement: event.currentTarget");
    expect(card).toContain("compact && embedUrl");
  });

  test("Standard TrackCard keeps the existing inline ExternalTrackEmbed", async () => {
    const card = await source("src/components/promptbeats/TrackCard.tsx");
    expect(card).toContain("<ExternalTrackEmbed");
    expect(card).toContain('title={t("track.player", { title: track.title })}');
  });

  test("shared surface reuses the existing embed and media coordinator", async () => {
    const provider = await source("src/components/promptbeats/ExternalPlaybackProvider.tsx");
    expect(provider).toContain('from "@/components/promptbeats/ExternalTrackEmbed"');
    expect(provider).toContain('from "@/lib/media-coordinator"');
    expect(provider).toContain("subscribeToMediaActivation");
    expect(provider).toContain('activation.kind === "native"');
  });

  test("surface has one-owner replacement, mobile Back, Escape and focus-return contracts", async () => {
    const provider = await source("src/components/promptbeats/ExternalPlaybackProvider.tsx");
    expect(provider).toContain("requestRef.current = nextRequest");
    expect(provider).toContain("setRequest(nextRequest)");
    expect(provider).toContain("window.history.pushState");
    expect(provider).toContain('window.addEventListener("popstate"');
    expect(provider).toContain('event.key !== "Escape"');
    expect(provider).toContain("returnFocusElement?.focus()");
  });

  test("external player is non-modal and does not close from outside clicks", async () => {
    const provider = await source("src/components/promptbeats/ExternalPlaybackProvider.tsx");
    expect(provider).toContain('aria-modal="false"');
    expect(provider).toContain('data-pb-external-playback="true"');
    expect(provider).toContain('aria-label="Close external player"');
    expect(provider).not.toContain("onOpenChange");
    expect(provider).not.toContain("DialogContent");
  });

  test("mobile player hides bottom nav and reserves content clearance", async () => {
    const provider = await source("src/components/promptbeats/ExternalPlaybackProvider.tsx");
    expect(provider).toContain("MOBILE_QUERY");
    expect(provider).toContain('[data-pb-mobile-nav=\\"true\\"]');
    expect(provider).toContain('[data-pb-search-highlight-root=\\"true\\"]');
    expect(provider).toContain('mobileNav.style.display = "none"');
    expect(provider).toContain("appContent.style.paddingBottom");
    expect(provider).toContain("--pb-external-player-clearance");
  });

  test("desktop player defaults bottom-right and supports pointer dragging", async () => {
    const provider = await source("src/components/promptbeats/ExternalPlaybackProvider.tsx");
    expect(provider).toContain("sm:bottom-3 sm:right-3");
    expect(provider).toContain("sm:w-[min(460px,calc(100vw-1.5rem))]");
    expect(provider).toContain("handleDragStart");
    expect(provider).toContain("handleDragMove");
    expect(provider).toContain("handleDragEnd");
    expect(provider).toContain("setPointerCapture");
    expect(provider).toContain("releasePointerCapture");
    expect(provider).toContain("sm:cursor-move");
  });

  test("consent still gates iframe creation and provider fallback remains", async () => {
    const embed = await source("src/components/promptbeats/ExternalTrackEmbed.tsx");
    expect(embed).toContain("const showIframe = externalMediaAllowed && shouldMount");
    expect(embed).toContain("!externalMediaAllowed");
    expect(embed).toContain("allowExternalMedia");
    expect(embed).toContain("providerUrl && providerName");
  });

  test("creator Profile converges on the canonical TrackCard without a duplicate player stack", async () => {
    const profile = await source("src/components/promptbeats/ArtistProfileView.tsx");
    expect(profile).toContain('import { TrackCard } from "@/components/promptbeats/TrackCard"');
    expect(profile).toContain("<TrackCard");
    expect(profile).toContain("viewMode={gridMode}");
    expect(profile).toContain("promptIsPublic: track.prompt_is_public ?? true");
    expect(profile).toContain("lyricsIsPublic: track.lyrics_is_public ?? true");
    expect(profile).not.toContain("<ExternalTrackEmbed");
    expect(profile).not.toContain("<TrackOwnerActions");
    expect(profile).not.toContain("<TrackLibraryActions");
  });
});
