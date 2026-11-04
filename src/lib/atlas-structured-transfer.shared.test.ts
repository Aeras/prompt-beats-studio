import { describe, expect, test } from "bun:test";
import {
  atlasReviewedProjectionSchema,
  atlasStructuredHandoffSchema,
  previewAtlasStructuredTransfer as preview,
  applyAtlasStructuredTransfer as apply,
  removeAtlasStructuredTransfer as remove,
  type AtlasReviewedProjection,
  type AtlasStructuredContext,
  type AtlasStructuredHandoff,
} from "./atlas-structured-transfer.shared";
import type { AdvancedGeneratorSetup } from "./advanced-generator-setup";

// Synthetic approvals ONLY. No real Atlas ID or claim is approved by these tests.
const d = "a".repeat(64);
function setup(): AdvancedGeneratorSetup {
  return {
    targetPlatform: "udio",
    theme: "manual theme",
    selectedMusicStyles: ["Manual"],
    customMusicStyle: "custom",
    selectedMoods: [],
    customMood: "",
    selectedInstruments: [],
    customInstruments: "",
    bpmMode: "Auto",
    customBpm: "",
    songStructure: [],
    songBlueprint: [],
    productionStyle: "",
    additionalInstructions: "",
    language: "",
    languageVariant: "",
    customLanguage: "",
    smartPresetId: "",
    culturalStyleId: "",
  };
}
function fixture(
  mapping: AtlasReviewedProjection["mapping"] = {
    selectedMusicStyles: ["Fixture"],
    productionStyle: "fixture production",
  },
) {
  const candidate: AtlasReviewedProjection = {
    schemaVersion: 2,
    profileId: "fixture-profile",
    techniqueId: "fixture-technique",
    sourceDigest: d,
    projectionDigest: "b".repeat(64),
    sourceEvidence: [{ sourceId: "fixture-source", locator: "test only" }],
    approval: {
      status: "approved",
      reviewId: "fixture-review",
      reviewerId: "fixture-reviewer",
      reviewedAt: 1,
      evidenceDigest: d,
    },
    conflictsWith: [],
    mapping,
  };
  const handoff: AtlasStructuredHandoff = {
    format: "promptbeats-atlas-structured-transfer",
    schemaVersion: 2,
    handoffId: "fixture-handoff",
    accountId: "account",
    sessionId: "tab-session",
    issuedAt: 2,
    expiresAt: 1000,
    candidates: [candidate],
  };
  const context: AtlasStructuredContext = {
    accountId: "account",
    sessionId: "tab-session",
    now: 3,
    sourceDigest: d,
    authorizedHandoff: structuredClone(handoff),
    registry: [structuredClone(candidate)],
    consumedHandoffIds: [],
    activeTechniqueIds: [],
  };
  return { candidate, handoff, context };
}
const pair = {
  songStructure: ["Verse"],
  songBlueprint: [
    {
      sectionId: "stable",
      structureIndex: 0,
      sectionType: "Verse",
      occurrence: 1,
      instruction: "manual",
      energy: 4 as const,
    },
  ],
};
describe("inert Atlas structured transfer v2", () => {
  test("staging language respects narrower worker ceiling", () => {
    expect(
      atlasReviewedProjectionSchema.safeParse({
        ...fixture().candidate,
        mapping: { language: "x".repeat(41) },
      }).success,
    ).toBe(false);
  });
  test("lost ACK retry requires exact trusted completed receipt and emits no consume", () => {
    const f = fixture(),
      p = preview(setup(), f.handoff, f.context),
      a = apply(setup(), f.handoff, f.context, p);
    f.context.consumedHandoffIds.push(f.handoff.handoffId);
    const edited = { ...a.setup, theme: "manual retry edit" };
    expect(() => apply(edited, f.handoff, f.context, p, a.ownership)).toThrow("replay");
    f.context.completedOwnership = structuredClone(a.ownership);
    const retry = apply(edited, f.handoff, f.context, p, a.ownership);
    expect(retry.setup).toEqual(edited);
    expect(retry.ownership).toEqual(a.ownership);
    expect(retry.consumeHandoffId).toBeNull();
    const forged = structuredClone(a.ownership);
    forged.before.theme = "forged";
    expect(() => apply(edited, f.handoff, f.context, p, forged)).toThrow("replay");
    expect(() => apply(edited, f.handoff, f.context, p)).toThrow("replay");
  });
  test("manual custom language and variant block language mapping", () => {
    const f = fixture({ language: "Fixture" });
    for (const s of [
      { ...setup(), customLanguage: "Manual" },
      { ...setup(), languageVariant: "Manual" },
    ]) {
      const p = preview(s, f.handoff, f.context);
      expect(p.after).toEqual(s);
      expect(p.decisions[0]?.reason).toBe("manual-language-detail");
    }
  });
  test("handoff token binds exact issued metadata and selection", () => {
    for (const patch of [{ handoffId: "minted" }, { issuedAt: 1 }, { expiresAt: 999 }]) {
      const f = fixture();
      Object.assign(f.handoff, patch);
      expect(() => preview(setup(), f.handoff, f.context)).toThrow("handoff-binding");
    }
  });
  test("result edits cannot corrupt ownership snapshots", () => {
    const f = fixture(),
      p = preview(setup(), f.handoff, f.context),
      a = apply(setup(), f.handoff, f.context, p);
    a.setup.selectedMusicStyles.push("manual");
    expect(a.ownership.after.selectedMusicStyles).toEqual(["Manual", "Fixture"]);
    expect(
      remove(a.setup, a.ownership, { accountId: "account", sessionId: "tab-session" }).ambiguous,
    ).toEqual(["selectedMusicStyles"]);
  });
  test("empty trusted registry blocks even an approval-shaped fixture", () => {
    const f = fixture();
    f.context.registry = [];
    expect(() => preview(setup(), f.handoff, f.context)).toThrow();
  });
  test("preview/apply/remove preserve manual fields, clone inputs and round trip", () => {
    const f = fixture(),
      s = setup(),
      original = structuredClone(s);
    const p = preview(s, f.handoff, f.context);
    expect(s).toEqual(original);
    expect(p.after.selectedMusicStyles).toEqual(["Manual", "Fixture"]);
    const a = apply(s, f.handoff, f.context, p);
    expect(a.setup.customMusicStyle).toBe("custom");
    expect(a.consumeHandoffId).toBe(f.handoff.handoffId);
    expect(
      remove(a.setup, a.ownership, { accountId: "account", sessionId: "tab-session" }).setup,
    ).toEqual(s);
    const r = remove(a.setup, a.ownership, { accountId: "account", sessionId: "tab-session" });
    expect(
      remove(r.setup, a.ownership, { accountId: "account", sessionId: "tab-session" }).setup,
    ).toEqual(s);
  });
  test("receipt-aware reapply preserves original ownership and intervening edits", () => {
    const f = fixture(),
      p = preview(setup(), f.handoff, f.context),
      a = apply(setup(), f.handoff, f.context, p);
    const edited = { ...a.setup, theme: "new", productionStyle: "manual edit" };
    const again = apply(edited, f.handoff, f.context, p, a.ownership);
    expect(again.setup).toEqual(edited);
    expect(again.ownership).toEqual(a.ownership);
    expect(
      remove(again.setup, again.ownership, { accountId: "account", sessionId: "tab-session" })
        .ambiguous,
    ).toEqual(["productionStyle"]);
  });
  test("reapplication has no duplicate or destructive effect", () => {
    const f = fixture(),
      p = preview(setup(), f.handoff, f.context);
    expect(preview(p.after, f.handoff, f.context).after).toEqual(p.after);
  });
  test.each(["accountId", "sessionId"] as const)(
    "rejects switched %s",
    (key: "accountId" | "sessionId") => {
      const f = fixture();
      f.context[key] = "other";
      expect(() => preview(setup(), f.handoff, f.context)).toThrow("identity");
    },
  );
  test.each([0, 1000, 1001])("rejects clock outside lifetime %i", (now: number) => {
    const f = fixture();
    f.context.now = now;
    expect(() => preview(setup(), f.handoff, f.context)).toThrow();
  });
  test("rejects replay at preview and apply", () => {
    const f = fixture(),
      p = preview(setup(), f.handoff, f.context);
    f.context.consumedHandoffIds.push(f.handoff.handoffId);
    expect(() => preview(setup(), f.handoff, f.context)).toThrow("replay");
    expect(() => apply(setup(), f.handoff, f.context, p)).toThrow("replay");
  });
  test.each(["profileId", "projectionDigest", "sourceDigest"] as const)(
    "rejects tampered %s",
    (key: "profileId" | "projectionDigest" | "sourceDigest") => {
      const f = fixture();
      f.candidate[key] = key === "profileId" ? "other" : "c".repeat(64);
      expect(() => preview(setup(), f.handoff, f.context)).toThrow();
    },
  );
  test("approval evidence and mapping must match full trusted projection", () => {
    for (const change of [
      (c: AtlasReviewedProjection) => {
        c.approval.reviewId = "forged";
      },
      (c: AtlasReviewedProjection) => {
        c.mapping.language = "forged";
      },
      (c: AtlasReviewedProjection) => {
        c.sourceEvidence[0]!.locator = "forged";
      },
    ]) {
      const f = fixture();
      change(f.candidate);
      expect(() => preview(setup(), f.handoff, f.context)).toThrow();
    }
  });
  test("strict contracts reject unknown nested fields and legacy version", () => {
    const f = fixture();
    for (const bad of [
      { ...f.handoff, extra: true },
      { ...f.handoff, schemaVersion: 1 },
      { ...f.handoff, candidates: [f.candidate, f.candidate] },
      { ...f.handoff, expiresAt: 1_000_000 },
    ])
      expect(atlasStructuredHandoffSchema.safeParse(bad).success).toBe(false);
    for (const bad of [
      { ...f.candidate, extra: true },
      { ...f.candidate, approval: { ...f.candidate.approval, extra: true } },
      { ...f.candidate, mapping: { vocals: "male" } },
      { ...f.candidate, mapping: {} },
      { ...f.candidate, sourceEvidence: [{ sourceId: "s", locator: "x", extra: 1 }] },
    ])
      expect(atlasReviewedProjectionSchema.safeParse(bad).success).toBe(false);
  });
  test("manual scalar and BPM conflicts skip explicitly; compatible chips append", () => {
    const f = fixture({
      productionStyle: "fixture",
      language: "Fixture",
      additionalInstructions: "Fixture",
      bpm: { bpmMode: "Custom", customBpm: "120" },
      selectedMoods: ["Fixture"],
    });
    const s = {
      ...setup(),
      productionStyle: "manual",
      language: "Manual",
      additionalInstructions: "manual",
      bpmMode: "Custom",
      customBpm: "99",
    };
    const p = preview(s, f.handoff, f.context);
    expect(p.decisions.filter((d) => d.status === "skipped")).toHaveLength(4);
    expect(p.after).toEqual({ ...s, selectedMoods: ["Fixture"] });
  });
  test("maps all supported fields including BPM atomically", () => {
    const f = fixture({
      selectedMusicStyles: ["A"],
      selectedMoods: ["B"],
      selectedInstruments: ["C"],
      productionStyle: "P",
      language: "L",
      additionalInstructions: "I",
      bpm: { bpmMode: "Custom", customBpm: "120" },
    });
    const p = preview(setup(), f.handoff, f.context);
    expect(p.decisions.every((d) => d.status === "added")).toBe(true);
    expect(p.after.customBpm).toBe("120");
    expect(p.after.bpmMode).toBe("Custom");
  });
  test("merged array limits skip entire unit, no truncation", () => {
    const f = fixture();
    const s = { ...setup(), selectedMusicStyles: Array.from({ length: 24 }, (_, i) => String(i)) };
    const p = preview(s, f.handoff, f.context);
    expect(p.after.selectedMusicStyles).toEqual(s.selectedMusicStyles);
    expect(p.decisions[0]?.reason).toBe("limit-or-invalid");
  });
  test("two selected conflicting candidates both skip, including one-way declarations", () => {
    const f = fixture();
    const other = structuredClone(f.candidate);
    other.techniqueId = "other";
    other.conflictsWith = [f.candidate.techniqueId];
    f.handoff.candidates.push(other);
    f.context.authorizedHandoff = structuredClone(f.handoff);
    f.context.registry.push(other);
    const p = preview(setup(), f.handoff, f.context);
    expect(p.after).toEqual(setup());
    expect(p.decisions.every((d) => d.reason === "technique-conflict")).toBe(true);
  });
  test("active candidate reverse conflict skips", () => {
    const f = fixture();
    const other = structuredClone(f.candidate);
    other.techniqueId = "active";
    other.conflictsWith = [f.candidate.techniqueId];
    f.context.registry.push(other);
    f.context.activeTechniqueIds.push("active");
    expect(preview(setup(), f.handoff, f.context).after).toEqual(setup());
  });
  test("CAS rejects edits, tampered preview, and approval revocation between preview/apply", () => {
    const f = fixture(),
      p = preview(setup(), f.handoff, f.context);
    expect(() => apply({ ...setup(), theme: "edited" }, f.handoff, f.context, p)).toThrow(
      "stale-preview",
    );
    const bad = structuredClone(p);
    bad.after.theme = "forged";
    expect(() => apply(setup(), f.handoff, f.context, bad)).toThrow();
    f.context.registry = [];
    expect(() => apply(setup(), f.handoff, f.context, p)).toThrow();
  });
  test("remove preserves edited owned units and reports ambiguity, including text", () => {
    const f = fixture({ selectedMoods: ["Fixture"], additionalInstructions: "Fixture" }),
      p = preview(setup(), f.handoff, f.context),
      a = apply(setup(), f.handoff, f.context, p);
    const edited = {
      ...a.setup,
      selectedMoods: ["Fixture", "manual"],
      additionalInstructions: "Fixture edited",
      theme: "new manual",
    };
    const r = remove(edited, a.ownership, { accountId: "account", sessionId: "tab-session" });
    expect(r.setup).toEqual(edited);
    expect(r.status).toBe("manual-remove-ambiguity");
    expect(r.ambiguous).toEqual(["selectedMoods", "additionalInstructions"]);
  });
  test("same preexisting values never become owned", () => {
    const f = fixture(),
      s = { ...setup(), selectedMusicStyles: ["Fixture"], productionStyle: "fixture production" },
      p = preview(s, f.handoff, f.context),
      a = apply(s, f.handoff, f.context, p);
    expect(a.ownership.units).toEqual([]);
    expect(
      remove(a.setup, a.ownership, { accountId: "account", sessionId: "tab-session" }).setup,
    ).toEqual(s);
  });
  test("removal identity is isolated and expiry does not trap owned fields", () => {
    const f = fixture(),
      p = preview(setup(), f.handoff, f.context),
      a = apply(setup(), f.handoff, f.context, p);
    expect(() =>
      remove(a.setup, a.ownership, { accountId: "other", sessionId: "tab-session" }),
    ).toThrow();
    expect(
      remove(a.setup, a.ownership, { accountId: "account", sessionId: "tab-session" }).status,
    ).toBe("removed");
  });
  test("initialize arrangement is whole-pair atomic; existing manual pair skipped", () => {
    const f = fixture({
      arrangement: {
        mode: "initialize",
        before: { songStructure: [], songBlueprint: [] },
        after: pair,
      },
    });
    expect(preview(setup(), f.handoff, f.context).after.songBlueprint).toEqual(pair.songBlueprint);
    const manual = { ...setup(), ...pair };
    const p = preview(manual, f.handoff, f.context);
    expect(p.after).toEqual(manual);
    expect(p.decisions[0]?.reason).toBe("manual-arrangement");
  });
  test("specific approved patch preserves ID and manual energy; removal CAS guards pair", () => {
    const after = structuredClone(pair);
    after.songBlueprint[0]!.instruction = "approved fixture";
    const f = fixture({ arrangement: { mode: "specific-patch", before: pair, after } }),
      s = { ...setup(), ...pair },
      p = preview(s, f.handoff, f.context),
      a = apply(s, f.handoff, f.context, p);
    expect(a.setup.songBlueprint[0]?.energy).toBe(4);
    expect(a.setup.songBlueprint[0]?.sectionId).toBe("stable");
    const edited = structuredClone(a.setup);
    edited.songBlueprint[0]!.energy = 2;
    expect(
      remove(edited, a.ownership, { accountId: "account", sessionId: "tab-session" }).status,
    ).toBe("manual-remove-ambiguity");
    expect(
      remove(a.setup, a.ownership, { accountId: "account", sessionId: "tab-session" }).setup,
    ).toEqual(s);
  });
  test("rejects broken blueprint IDs/indices/occurrences/extras and identity replacement", () => {
    for (const patch of [
      { sectionId: "new" },
      { structureIndex: 1 },
      { occurrence: 2 },
      { sectionType: "Chorus" },
      { extra: true },
    ]) {
      const after = structuredClone(pair);
      Object.assign(after.songBlueprint[0]!, patch);
      const f = fixture({ arrangement: { mode: "specific-patch", before: pair, after } });
      expect(() => preview({ ...setup(), ...pair }, f.handoff, f.context)).toThrow();
    }
  });
  test("rejects unsafe BPM, extra fields, duplicate chips, nested setup extras", () => {
    for (const mapping of [
      { bpm: { bpmMode: "Auto", customBpm: "120" } },
      { bpm: { bpmMode: "Custom", customBpm: "999" } },
      { selectedMoods: ["A", "A"] },
    ])
      expect(
        atlasReviewedProjectionSchema.safeParse({ ...fixture().candidate, mapping }).success,
      ).toBe(false);
    const f = fixture();
    expect(() =>
      preview(
        { ...setup(), songBlueprint: [{ ...pair.songBlueprint[0], extra: true }] },
        f.handoff,
        f.context,
      ),
    ).toThrow();
  });
});
