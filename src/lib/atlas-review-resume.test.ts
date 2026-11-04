import { describe, expect, test } from "bun:test";
import source from "../../research/atlas-v4-merged-evidence-20261027.json";
import corrections from "../../research/atlas-v4-citation-corrections-20261031.json";
import template from "../../research/atlas-v4-636-evidence-tasks.json";
import library from "../data/song-atlas/v4/library.json";
import worksheet from "../../research/atlas-v4-123-technique-review.json";
import independent from "../../research/atlas-v4-123-technique-independent-review.json";
import { applyAtlasCitationCorrections } from "./atlas-research-corrections";
import { validateAtlasResearch } from "./atlas-research";
import { readAtlasResearch } from "./atlas-research.server";
import { validateAtlasTechniqueReview } from "./atlas-technique-review";
import { validateAtlasV4 } from "./song-atlas-v4";

describe("Atlas V4 resumed metadata and review audit", () => {
  test("corrects 18 metadata records without overwriting archive, claims or decisions", () => {
    const before = JSON.stringify(source);
    const corrected = applyAtlasCitationCorrections(source, corrections) as typeof source;
    const validated = validateAtlasResearch(corrected, template, library);
    expect(validated.validation.eligibleTaskCount).toBe(636);
    expect(validated.validation.quarantinedGapIds).toEqual([]);
    expect(validated.validation.eligibleDecisionCounts).toEqual(
      validated.validation.originalDecisionCounts,
    );
    for (let i = 0; i < source.tasks.length; i++) {
      const { citations: _original, ...a } = source.tasks[i]!;
      const { citations: _corrected, ...b } = corrected.tasks[i]!;
      expect(b).toEqual(a);
    }
    expect(JSON.stringify(source)).toBe(before);
    expect(readAtlasResearch().validation).toEqual(validated.validation);
  });
  test("rejects stale, duplicated, foreign or expanded corrections", () => {
    for (const mutation of [
      (d: typeof corrections) => {
        d.corrections[0]!.gapId = "missing";
      },
      (d: typeof corrections) => {
        d.corrections[1]!.gapId = d.corrections[0]!.gapId;
      },
      (d: typeof corrections) => {
        d.corrections[0]!.changes[0]!.expected = "changed";
      },
      (d: typeof corrections) => {
        d.corrections[0]!.changes[0]!.field = "suggestedStatementEn";
      },
      (d: typeof corrections) => {
        d.corrections[0]!.changes[0]!.value = "full_text";
      },
      (d: typeof corrections) => {
        d.executable = true;
      },
    ]) {
      const d = structuredClone(corrections);
      mutation(d);
      expect(() => applyAtlasCitationCorrections(source, d)).toThrow();
    }
  });
  test("verifies all 123 originals against canonical fields without fabricating compatibility", () => {
    const audit = validateAtlasTechniqueReview(validateAtlasV4(library), worksheet, independent);
    expect(audit.canonicalMatched).toBe(123);
    expect(audit.verdicts).toEqual({
      experimental_needs_pilot: 58,
      insufficient_evidence_to_decide: 60,
      needs_revision: 5,
    });
    expect(audit.pairs.total).toBe(7503);
    expect(audit.pairs.sameProfile + audit.pairs.crossProfile).toBe(7503);
    expect(audit.pairs.independentlyAssessed).toBe(0);
    expect(audit.approvedForGenerator).toBe(false);
  });
  test("rejects changed canonical wording, invented approvals and false compatibility claims", () => {
    const changed = structuredClone(independent);
    changed.techniques[0]!.immutableOriginal.englishInstruction += " altered";
    expect(() =>
      validateAtlasTechniqueReview(validateAtlasV4(library), worksheet, changed),
    ).toThrow();
    const approved = structuredClone(independent);
    approved.techniques[0]!.review.approved = true;
    expect(() =>
      validateAtlasTechniqueReview(validateAtlasV4(library), worksheet, approved),
    ).toThrow();
    const compatible = structuredClone(independent);
    compatible.compatibilityMatrix.validatedPairs.push([] as never);
    expect(() =>
      validateAtlasTechniqueReview(validateAtlasV4(library), worksheet, compatible),
    ).toThrow();
  });
});
