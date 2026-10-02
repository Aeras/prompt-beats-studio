import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("PB-010 — surface convergence without semantic redesign", () => {
  test("Compact TrackCard keeps frequent actions direct and lower-frequency actions in the existing overflow", async () => {
    const card = await source("src/components/promptbeats/TrackCard.tsx");
    expect(card).toContain('data-track-actions="left"');
    expect(card).toContain('data-track-actions="right"');
    expect(card).toContain('toggleContent("prompt"');
    expect(card).toContain('toggleContent("lyrics"');
    expect(card).toContain("<LikeButton");
    expect(card).toContain("openExternalPlayback({");
    expect(card).toContain("<TrackLibraryActions");
    expect(card).toContain("<SimilarSongsMenuItem");
    expect(card).toContain("menuItem");
    expect(card).toContain("<ReportTrackControl");
    expect(card).toContain("<TrackOwnerActions");
  });

  test("Version History remains vertical and keeps Preferred, Continue, Compare and linked audio visible", async () => {
    const history = await source("src/components/promptbeats/ProjectVersionHistory.tsx");
    expect(history).toContain('className="space-y-3"');
    expect(history).toContain('el ? "Προτιμώμενη" : "Preferred"');
    expect(history).toContain('el ? "Συνέχεια από αυτή" : "Continue from this Version"');
    expect(history).toContain('el ? "Σύγκριση" : "Compare"');
    expect(history).toContain("<ProjectVersionLinkedTracks");
    expect(history).toContain("<ProjectVersionAudioOutcomeIntentPanel");
  });

  test("Linked Audio stays relation-oriented with play, primary and unlink confirmation", async () => {
    const linked = await source("src/components/promptbeats/ProjectVersionLinkedTracks.tsx");
    expect(linked).toContain("listProjectVersionLinkedTracks");
    expect(linked).toContain("setPrimaryProjectVersionTrack");
    expect(linked).toContain("unlinkProjectVersionTrack");
    expect(linked).toContain("window.confirm(");
    expect(linked).toContain("The track will not be deleted from PromptBeats.");
    expect(linked).toContain("countPlay: false");
    expect(linked).not.toContain("<TrackCard");
  });

  test("PB-003 Outcome and Revision Intent remain a dedicated private panel with one batched outcome lookup", async () => {
    const panel = await source(
      "src/components/promptbeats/ProjectVersionAudioOutcomeIntentPanel.tsx",
    );
    expect(panel).toContain("listAudioOutcomeEvaluations");
    expect(panel).toContain("ProjectVersionAudioOutcomeIntentPanel");
    expect(panel).toContain("<AudioOutcomeIntentControls");
    expect(panel).toContain('"Private Outcome & Revision Intent"');
    expect(panel).toContain("outcomeRows.map");
  });
});
