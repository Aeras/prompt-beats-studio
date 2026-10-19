import { describe, expect, test } from "bun:test";
import { buildAdvancedGeneratorPromptV2 } from "./advanced-generator-prompt-v2";

const original = [
  "USER INPUTS — AUTHORITATIVE:",
  "==================================================",
  "CREATIVE PRIORITY",
  "==================================================",
  "V1 priority untouched",
  "==================================================",
  "PROFESSIONAL CREATIVE DIRECTION",
  "==================================================",
  "V1 mature instructions",
  "Do not add vocal tags unnecessarily.",
].join("\n");

describe("Advanced Generator prompt versioning", () => {
  test("V2 is a separate composition; never mutates the V1 input", () => {
    const v1 = original;
    const v2 = buildAdvancedGeneratorPromptV2(v1);
    expect(v1).toContain("V1 priority untouched");
    expect(v2).not.toContain("V1 priority untouched");
    expect(v2).toContain("V2 CREATIVE AUTHORITY");
    expect(v2).toContain("V1 mature instructions");
  });

  test("V2 gives narrative, voice, production and energy independent destinations", () => {
    const v2 = buildAdvancedGeneratorPromptV2(original);
    for (const phrase of [
      "LYRICAL/NARRATIVE",
      "VOCAL/CASTING",
      "ARRANGEMENT/PERFORMANCE",
      "ENERGY (1-5)",
      "Producer's Note",
      "same generation call",
    ]) {
      expect(v2).toContain(phrase);
    }
    expect(v2).toContain("explicit Blueprint voice assignments");
  });

  test("V2 fails closed if V1 anchors unexpectedly change", () => {
    expect(() => buildAdvancedGeneratorPromptV2("No anchors")).toThrow("anchors missing");
  });
});
