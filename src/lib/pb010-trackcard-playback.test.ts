import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("PB-010 — shared TrackCard external playback contract", () => {
  test("application root owns one shared external playback provider", async () => {
    const root = await source("src/routes/__root.tsx");
    expect(root).toContain('import { ExternalPlaybackProvider }');
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

  test("surface has one-owner replacement, mobile Back and focus-return contracts", async () => {
    const provider = await source("src/components/promptbeats/ExternalPlaybackProvider.tsx");
    expect(provider).toContain("requestRef.current = nextRequest");
    expect(provider).toContain("setRequest(nextRequest)");
    expect(provider).toContain("window.history.pushState");
    expect(provider).toContain('window.addEventListener("popstate"');
    expect(provider).toContain("returnFocusElement?.focus()");
    expect(provider).toContain("onCloseAutoFocus={(event) => event.preventDefault()}");
  });

  test("consent still gates iframe creation and provider fallback remains", async () => {
    const embed = await source("src/components/promptbeats/ExternalTrackEmbed.tsx");
    expect(embed).toContain("const showIframe = externalMediaAllowed && shouldMount");
    expect(embed).toContain("!externalMediaAllowed");
    expect(embed).toContain("allowExternalMedia");
    expect(embed).toContain("providerUrl && providerName");
  });
});
