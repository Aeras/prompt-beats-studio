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
    expect(result.instructions).toContain("Producer's Note itself must remain in the requested song language");
    expect(result.instructions).toContain("include at least two such cues");
    expect(result.instructions).toContain("compare the Producer's Note against Music Style");
    expect(result.instructions).toContain("section-specific instrumental behavior");
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
