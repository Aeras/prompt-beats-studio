import { describe, expect, test } from "bun:test";

import { buildSongBlueprintPrompt } from "./ai.functions";

describe("Arrangement energy prompt integration", () => {
  test("energy-only section is sent as a relative 1-5 creative target", () => {
    const prompt = buildSongBlueprintPrompt(
      [
        {
          sectionId: "intro-a",
          structureIndex: 0,
          sectionType: "Intro",
          occurrence: 1,
          instruction: "",
          energy: 2,
        },
      ],
      "Style Prompt",
    );

    expect(prompt).toContain("Structure position 1: Intro #1");
    expect(prompt).toContain("Energy target: 2/5");
    expect(prompt).toContain("relative creative intensity / dynamics target");
    expect(prompt).toContain(
      "It is NOT a BPM value, loudness measurement, mastering target or objective score",
    );
  });

  test("instruction and energy remain bound to the same exact occurrence", () => {
    const prompt = buildSongBlueprintPrompt(
      [
        {
          sectionId: "chorus-a",
          structureIndex: 1,
          sectionType: "Chorus",
          occurrence: 1,
          instruction: "strip back the drums",
          energy: 3,
        },
        {
          sectionId: "chorus-b",
          structureIndex: 3,
          sectionType: "Chorus",
          occurrence: 2,
          instruction: "widest vocal stack",
          energy: 5,
        },
      ],
      "Style Prompt",
    );

    expect(prompt).toContain(
      "Structure position 2: Chorus #1 — Energy target: 3/5 — Direction: strip back the drums",
    );
    expect(prompt).toContain(
      "Structure position 4: Chorus #2 — Energy target: 5/5 — Direction: widest vocal stack",
    );
    expect(prompt).toContain("Repeated sections remain independent");
  });

  test("empty Blueprint produces no section-specific prompt block", () => {
    expect(buildSongBlueprintPrompt([], "Style Prompt")).toBe("");
  });
});
