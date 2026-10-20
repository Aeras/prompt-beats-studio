import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { buildAdvancedGeneratorPromptV2 } from "./advanced-generator-prompt-v2";

const source = readFileSync("src/lib/ai.functions.ts", "utf8");

describe("Generator chorus length guidance", () => {
  it("keeps a concise hook without constraining the entire chorus to four lines", () => {
    expect(source).toContain(
      "the entire chorus must NOT default to a fixed, minimal number of lines",
    );
    expect(source).toContain("Four, six, eight or more sung lines can all be appropriate");
    expect(source).toContain("Choose chorus length from the user's explicit structure, Blueprint");
    expect(source).not.toContain("a short memorable chorus and only essential sections");
  });

  it("preserves inherited guidance in V2's composed prompt", () => {
    const commonPrompt = `==================================================
CREATIVE PRIORITY
==================================================
Previous priority
==================================================
PROFESSIONAL CREATIVE DIRECTION
==================================================
${source.match(/Create a memorable, naturally singable chorus[^\n]*/)?.[0] ?? ""}`;
    expect(buildAdvancedGeneratorPromptV2(commonPrompt)).toContain(
      "the entire chorus must NOT default to a fixed, minimal number of lines",
    );
  });
});
