import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Song Analyzer detail preservation", () => {
  test("preserves specific guitar technique and deduplicates verifier descriptors", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("preservesSpecificGuitarTechnique");
    expect(code).toContain("fingerpick|arpeggi");
    expect(code).toContain("joinUniqueDescriptors");
    expect(code).toContain(
      "NOT permission to rewrite an already well-supported fingerpicked/arpeggiated technique as generic strumming/comping",
    );
  });

  test("verifies keyboard family without treating a generic pad as Rhodes", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("KEYBOARD / ELECTRIC-PIANO CHECK");
    expect(code).toContain('"rhodes"');
    expect(code).toContain('"wurlitzer"');
    expect(code).toContain('"acoustic_piano"');
    expect(code).toContain('"synth_keys"');
    expect(code).toContain("Do not call a generic warm pad Rhodes");
    expect(code).toContain('instrument: "Rhodes Electric Piano"');
  });

  test("preserves only directly audible micro-production cues", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("MICRO-PRODUCTION CHECK");
    expect(code).toContain('"tape_saturation"');
    expect(code).toContain('"vinyl_crackle"');
    expect(code).toContain('"low_pass_filtered_guitar"');
    expect(code).toContain('"distant_electric_guitar_swell"');
    expect(code).toContain(
      "Do not infer any of them from genre, mood, lo-fi aesthetics, or a warm mix",
    );
  });

  test("recovers explicit late-section clocks and terminal outro boundaries conservatively", async () => {
    const code = await source("src/lib/song-analyzer-stage-a-guard.functions.ts");
    expect(code).toContain("explicitRecoveries");
    expect(code).toContain("recovered ${explicitRecoveries} explicit/terminal boundary value(s)");
    expect(code).toContain("/outro|ending|fade/i");
    expect(code).toContain("endSeconds: durationSeconds");
  });

  test("keeps broad hip-hop crossover evaluation from requiring stereotypical rap/trap cues", async () => {
    const code = await source("src/lib/song-analyzer-final.functions.ts");
    expect(code).toContain("Do NOT require overt rapping, aggressive 808s, trap hats");
    expect(code).toContain("Melodic alternative hip-hop can use intimate sung/sing-rap delivery");
    expect(code).toContain("must not be misused to erase a broader hybrid family");
    expect(code).toContain(
      "preserve the crossover explicitly instead of collapsing it to only indie/acoustic pop",
    );
  });
});
