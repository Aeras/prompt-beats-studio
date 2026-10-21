import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  V4_BETA_PLACEHOLDERS,
  buildAdvancedGeneratorPromptV4Beta,
  normalizeV4Platform,
} from "./advanced-generator-prompt-v4-beta";
import {
  V4_BETA_MASTER_PROMPT_SHA256,
  V4_BETA_MASTER_PROMPT_TEMPLATE,
} from "./advanced-generator-prompt-v4-beta.template";

const base = {
  theme: "A night train leaving Thessaloniki",
  genre: "Indie folk",
  mood: "Bittersweet",
  language: "Greek",
  targetPlatform: "udio",
};

describe("V4 BETA prompt", () => {
  it("template is the frozen verbatim master prompt", () => {
    const sha = createHash("sha256").update(V4_BETA_MASTER_PROMPT_TEMPLATE, "utf8").digest("hex");
    expect(sha).toBe(V4_BETA_MASTER_PROMPT_SHA256);
    expect(sha).toBe("d9aa44af8d554b7721c4644bc50751cabf799fa6b887fe9e4ed7df8fbf9fad88");
  });

  it("template contains each placeholder exactly once", () => {
    for (const key of V4_BETA_PLACEHOLDERS) {
      expect(V4_BETA_MASTER_PROMPT_TEMPLATE.split(`{{${key}}}`).length - 1).toBe(1);
    }
  });

  it("fills every placeholder and leaves none behind", () => {
    const out = buildAdvancedGeneratorPromptV4Beta(base);
    expect(out).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(out).toContain("- **Core Idea / Theme:** A night train leaving Thessaloniki");
    expect(out).toContain("- **Requested Song Structure (if provided):** (not provided)");
  });

  it("normalizes platform to suno or udio only", () => {
    expect(normalizeV4Platform("Udio")).toBe("udio");
    expect(normalizeV4Platform("suno")).toBe("suno");
    expect(normalizeV4Platform("other")).toBe("suno");
    expect(buildAdvancedGeneratorPromptV4Beta(base)).toContain("(`suno` or `udio`):** udio");
  });

  it("does not re-substitute placeholders injected by user text", () => {
    const out = buildAdvancedGeneratorPromptV4Beta({ ...base, instructions: "{{CORE_IDEA}}" });
    expect(out).toContain("- **Additional Instructions (if provided):** {{CORE_IDEA}}");
  });

  it("serializes blueprint occurrences in order", () => {
    const out = buildAdvancedGeneratorPromptV4Beta({
      ...base,
      structure: "Verse, Chorus",
      songBlueprint: [
        { structureIndex: 1, sectionType: "Chorus", occurrence: 1, energy: 5, instruction: "Full band" },
      ],
    });
    expect(out).toContain("- Structure position 2: Chorus #1 — Energy target: 5/5 — Direction: Full band");
  });

  it("rejects empty required fields", () => {
    expect(() => buildAdvancedGeneratorPromptV4Beta({ ...base, mood: " " })).toThrow();
  });
});
