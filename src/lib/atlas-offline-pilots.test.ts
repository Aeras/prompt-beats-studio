import { expect, test } from "bun:test";
import plan from "../../research/atlas-v4-offline-pilots.json";
import library from "../data/song-atlas/v4/library.json";
import type { AdvancedGeneratorSetup } from "./advanced-generator-setup";
import {
  previewAtlasStructuredTransfer as preview,
  applyAtlasStructuredTransfer as apply,
  removeAtlasStructuredTransfer as remove,
  type AtlasReviewedProjection,
  type AtlasStructuredHandoff,
  type AtlasStructuredContext,
} from "./atlas-structured-transfer.shared";

function setup(): AdvancedGeneratorSetup {
  return {
    targetPlatform: "udio",
    theme: "My personal theme",
    selectedMusicStyles: ["Manual style"],
    customMusicStyle: "",
    selectedMoods: [],
    customMood: "",
    selectedInstruments: [],
    customInstruments: "",
    bpmMode: "Auto",
    customBpm: "",
    songStructure: [],
    songBlueprint: [],
    productionStyle: "My production",
    additionalInstructions: "",
    language: "Greek",
    languageVariant: "",
    customLanguage: "",
    smartPresetId: "",
    culturalStyleId: "",
  };
}

test("twelve offline pilots retain unique canonical references without authorizing execution", () => {
  expect(plan.cases).toHaveLength(12);
  expect(new Set(plan.cases.map((c) => c.techniqueId)).size).toBe(12);
  expect(plan.providerCalls).toBe(0);
  expect(plan.paidAuthorization).toBe(false);
  expect(plan.generatorActivation).toBe(false);
  for (const c of plan.cases) {
    expect(library.techniques.find((t) => t.id === c.techniqueId)?.profileId).toBe(c.profileId);
    expect(c.humanMusicalReview).toBe("not_performed");
  }
});

for (const pilot of plan.cases) {
  test(`${pilot.id}: manual preservation, conflict, Undo and denial (${pilot.profileId})`, () => {
    const canonical = library.techniques.find((t) => t.id === pilot.techniqueId)!;
    expect(canonical.executable).toBe(false);
    const digest = "a".repeat(64);
    // Synthetic fixture authority ONLY. Not a real approval, registry entry or field mapping.
    const candidate: AtlasReviewedProjection = {
      schemaVersion: 2,
      profileId: `synthetic:${pilot.profileId}`,
      techniqueId: `synthetic:${pilot.techniqueId}`,
      sourceDigest: digest,
      projectionDigest: "b".repeat(64),
      sourceEvidence: [{ sourceId: "synthetic-source", locator: "offline fixture only" }],
      approval: {
        status: "approved",
        reviewId: "synthetic-review",
        reviewerId: "synthetic-not-human-approval",
        reviewedAt: 1,
        evidenceDigest: digest,
      },
      conflictsWith: [],
      mapping: { additionalInstructions: canonical.instruction.en },
    };
    const handoff: AtlasStructuredHandoff = {
      format: "promptbeats-atlas-structured-transfer",
      schemaVersion: 2,
      handoffId: pilot.id,
      accountId: "fixture-account",
      sessionId: "fixture-session",
      issuedAt: 100,
      expiresAt: 1000,
      candidates: [candidate],
    };
    const context: AtlasStructuredContext = {
      accountId: handoff.accountId,
      sessionId: handoff.sessionId,
      now: 200,
      sourceDigest: digest,
      authorizedHandoff: structuredClone(handoff),
      registry: [candidate],
      consumedHandoffIds: [],
      activeTechniqueIds: [],
    };
    const before = setup(),
      p = preview(before, handoff, context);
    expect(p.after.additionalInstructions).toBe(canonical.instruction.en);
    for (const field of [
      "theme",
      "language",
      "bpmMode",
      "customBpm",
      "songStructure",
      "songBlueprint",
      "productionStyle",
      "selectedMusicStyles",
    ] as const)
      expect(p.after[field]).toEqual(before[field]);
    expect(preview(p.after, handoff, context).after).toEqual(p.after);
    const applied = apply(before, handoff, context, p);
    expect(
      remove(applied.setup, applied.ownership, {
        accountId: context.accountId,
        sessionId: context.sessionId,
      }).setup,
    ).toEqual(before);
    const manual = { ...before, additionalInstructions: "Keep my exact manual constraint" };
    const conflict = preview(manual, handoff, context);
    expect(conflict.after).toEqual(manual);
    expect(conflict.decisions[0]?.reason).toBe("manual-field");
    expect(() => preview(before, handoff, { ...context, registry: [] })).toThrow();
    expect(() => apply({ ...before, theme: "New manual edit" }, handoff, context, p)).toThrow(
      "stale-preview",
    );
  });
}
