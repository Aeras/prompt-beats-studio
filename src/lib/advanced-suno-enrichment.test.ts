import { describe, expect, test } from "bun:test";

import {
  ADVANCED_SUNO_ENRICHMENT_INSTRUCTION,
  withAdvancedSunoEnrichmentInstruction,
} from "./advanced-suno-enrichment";

describe("Advanced Suno enrichment runtime instruction", () => {
  test("appends the enrichment instruction only for normal Advanced Suno generation", () => {
    const input = {
      operation: "generate",
      targetPlatform: "suno",
      instructions: "Keep the chorus playful.",
      inputSnapshot: { generatorMode: "advanced" },
    };

    const result = withAdvancedSunoEnrichmentInstruction(input);

    expect(result.instructions).toContain("Keep the chorus playful.");
    expect(result.instructions).toContain(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION);
    expect(result.instructions).toContain("compose the Producer's Note first");
    expect(result.instructions).toContain("authoritative source");
    expect(result.instructions).toContain("Preserve the exact musical relationship");
    expect(result.instructions).toContain("include at least two such cues");
    expect(result.instructions).toContain("Producer's Note itself must remain in the requested song language");
  });

  test("requires faithful section-specific transfer instead of broad approximation", () => {
    expect(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION).toContain(
      'accordion solo over dynamic timbales in the instrumental break',
    );
    expect(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION).toContain(
      'stripped bass-and-vocal breakdown immediately before the final chorus',
    );
    expect(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION).toContain(
      "Do not replace a specific instruction with a broader stylistic approximation",
    );
  });

  test("forbids inventing or substituting instruments during faithful transfer", () => {
    expect(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION).toContain(
      "do not add, substitute, merge, or infer an instrument",
    );
    expect(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION).toContain(
      "Never replace a missing element with a nearby or stylistically plausible one",
    );
    expect(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION).toContain(
      'stripped voice, piano and low-pad breakdown immediately before the build',
    );
    expect(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION).toContain(
      "Do not invent bass or omit the low pad",
    );
  });

  test("keeps existing user instructions before the internal enrichment instruction", () => {
    const input = {
      operation: "generate",
      targetPlatform: "suno",
      instructions: "Keep the chorus playful.",
      inputSnapshot: { generatorMode: "advanced" },
    };

    const result = withAdvancedSunoEnrichmentInstruction(input);

    expect(result.instructions.startsWith("Keep the chorus playful.")).toBe(true);
    expect(result.instructions.indexOf(ADVANCED_SUNO_ENRICHMENT_INSTRUCTION)).toBeGreaterThan(0);
  });

  test("leaves Basic Suno generation unchanged", () => {
    const input = {
      operation: "generate",
      targetPlatform: "suno",
      instructions: "",
      inputSnapshot: { generatorMode: "basic" },
    };

    expect(withAdvancedSunoEnrichmentInstruction(input)).toEqual(input);
  });

  test("leaves Udio and revision jobs unchanged", () => {
    const udio = {
      operation: "generate",
      targetPlatform: "udio",
      instructions: "",
      inputSnapshot: { generatorMode: "advanced" },
    };
    const revision = {
      operation: "revision",
      targetPlatform: "suno",
      instructions: "",
      inputSnapshot: { generatorMode: "advanced" },
    };

    expect(withAdvancedSunoEnrichmentInstruction(udio)).toEqual(udio);
    expect(withAdvancedSunoEnrichmentInstruction(revision)).toEqual(revision);
  });
});
