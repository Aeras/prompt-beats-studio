import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PB-003 follow-up acceptance boundary", () => {
  test("AI proposal is copied into local editable state only after explicit user action", async () => {
    const ui = await source("src/components/promptbeats/AudioOutcomeIntentControls.tsx");
    expect(ui).toContain("const acceptProposal = () =>");
    expect(ui).toContain("onClick={acceptProposal}");
    expect(ui).toContain("setKeep(proposal.proposal.keep)");
    expect(ui).not.toContain(
      "updateAudioRevisionIntent({\n        data: {\n          acceptedKeep: proposal",
    );
  });
});
