import { describe, expect, test } from "bun:test";

import { parseAdvancedSetup, serializeAdvancedSetup, type AdvancedGeneratorSetup } from "./advanced-generator-setup";
import { assertGenerationInputLimits, type GeneratorInputLimitSubject } from "./generator-input-limits";

function subject(patch: Partial<GeneratorInputLimitSubject> = {}): GeneratorInputLimitSubject {
  return {
    theme: "t".repeat(3),
    genre: "Pop",
    mood: "Warm",
    advanced: true,
    baseMusicStyle: "Pop",
    instruments: "Guitar",
    operation: "generate",
    ...patch,
  };
}

function expectAccepted(input: GeneratorInputLimitSubject, isAdminLevel = false) {
  expect(() => assertGenerationInputLimits(input, isAdminLevel)).not.toThrow();
}

function expectRejected(input: GeneratorInputLimitSubject, message: string) {
  expect(() => assertGenerationInputLimits(input, false)).toThrow(message);
}

function setupFixture(): AdvancedGeneratorSetup {
  return {
    targetPlatform: "suno",
    theme: "Theme",
    selectedMusicStyles: ["Pop"],
    customMusicStyle: "",
    selectedMoods: ["Warm"],
    customMood: "",
    selectedInstruments: ["Guitar"],
    customInstruments: "",
    bpmMode: "Auto",
    customBpm: "",
    songStructure: ["Verse", "Chorus"],
    songBlueprint: [],
    productionStyle: "",
    additionalInstructions: "",
    language: "English",
    languageVariant: "",
    customLanguage: "",
    smartPresetId: "",
    culturalStyleId: "",
  };
}

async function source(path: string) {
  return Bun.file(path).text();
}

describe("PB-009 — Advanced Generator Input Limits Consistency", () => {
  test("Advanced non-admin exact boundaries are 500 / 150 / 120 / 200", () => {
    expectAccepted(subject({ theme: "t".repeat(500) }));
    expectRejected(subject({ theme: "t".repeat(501) }), "Theme must be 500 characters or fewer.");

    expectAccepted(subject({ baseMusicStyle: "s".repeat(150) }));
    expectRejected(
      subject({ baseMusicStyle: "s".repeat(151) }),
      "Music Style must be 150 characters or fewer.",
    );

    expectAccepted(subject({ mood: "m".repeat(120) }));
    expectRejected(subject({ mood: "m".repeat(121) }), "Mood must be 120 characters or fewer.");

    expectAccepted(subject({ instruments: "i".repeat(200) }));
    expectRejected(
      subject({ instruments: "i".repeat(201) }),
      "Instruments must be 200 characters or fewer.",
    );
  });

  test("normal Advanced accepts a composed direction over the former 500-character guard", () => {
    expectAccepted(
      subject({
        baseMusicStyle: "s".repeat(150),
        mood: "m".repeat(120),
        instruments: "i".repeat(200),
        genre: "g".repeat(900),
      }),
    );
  });

  test("Revision preserves the existing composed-direction policy", () => {
    expectAccepted(subject({ operation: "revision", baseMusicStyle: "s".repeat(500), genre: "g".repeat(500) }));
    expectRejected(
      subject({ operation: "revision", baseMusicStyle: "s".repeat(500), genre: "g".repeat(501) }),
      "The composed music direction must be 500 characters or fewer.",
    );
  });

  test("Basic limits remain unchanged", () => {
    expectAccepted(subject({ advanced: false, theme: "t".repeat(300), genre: "g".repeat(400), mood: "m".repeat(60) }));
    expectRejected(subject({ advanced: false, theme: "t".repeat(301) }), "Theme must be 300 characters or fewer.");
    expectRejected(subject({ advanced: false, genre: "g".repeat(401) }), "Music Style must be 400 characters or fewer.");
    expectRejected(subject({ advanced: false, mood: "m".repeat(61) }), "Mood must be 60 characters or fewer.");
  });

  test("role matrix keeps user/moderator/senior moderator limited and admin/super_admin bypassed", () => {
    const oversized = subject({ theme: "t".repeat(501) });
    const matrix = [
      ["user", false],
      ["moderator", false],
      ["senior_moderator", false],
      ["admin", true],
      ["super_admin", true],
    ] as const;

    for (const [role, bypass] of matrix) {
      if (bypass) {
        expect(() => assertGenerationInputLimits(oversized, true), role).not.toThrow();
      } else {
        expect(() => assertGenerationInputLimits(oversized, false), role).toThrow(
          "Theme must be 500 characters or fewer.",
        );
      }
    }
  });

  test("Advanced Setup file schema accepts admin-sized state but retains technical safety ceilings", () => {
    const adminSized = setupFixture();
    adminSized.theme = "t".repeat(501);
    adminSized.customMusicStyle = "s".repeat(151);
    adminSized.customMood = "m".repeat(121);
    adminSized.customInstruments = "i".repeat(201);

    const parsed = parseAdvancedSetup(serializeAdvancedSetup(adminSized));
    expect(parsed.ok).toBe(true);

    const unsafe = setupFixture();
    unsafe.theme = "t".repeat(32_001);
    expect(() => serializeAdvancedSetup(unsafe)).toThrow();
  });

  test("Generator keeps field-specific Advanced errors and unchanged Custom BPM 40-260 validation", async () => {
    const route = await source("src/routes/generate.tsx");
    const advancedBranch = route.slice(route.indexOf(": advanced"), route.indexOf("const currentSnapshot"));
    expect(advancedBranch).toContain('t("generator.musicStyleTooLong"');
    expect(advancedBranch).toContain('t("generator.instrumentsTooLong"');
    expect(route).toContain("bpmNumber < 40 || bpmNumber > 260");
    expect(route).toContain('min={40}');
    expect(route).toContain('max={260}');
  });

  test("Song Setup uses admin-level bypass only for PB-009 fields and keeps super-admin-only policies", async () => {
    const setup = await source("src/lib/song-setup-assistant.functions.ts");
    expect(setup).toContain('rpc("current_user_is_admin_level")');
    expect(setup).toContain('rpc("current_user_is_super_admin")');
    expect(setup).toContain("isAdminLevel === true");
    expect(setup).toContain("adminSongSetupDraftSchema.parse(parsed)");
    expect(setup).toContain("superAdminSongSetupDraftSchema.parse(parsed)");
    expect(setup).toContain("isSuperAdmin === true ? 4096 : 1800");
    expect(setup).toContain("isSuperAdmin !== true && data.description.length > SONG_SETUP_DESCRIPTION_LIMIT");

    const adminSchema = setup.slice(
      setup.indexOf("const adminSongSetupDraftSchema"),
      setup.indexOf("const superAdminSongSetupDraftSchema"),
    );
    expect(adminSchema).not.toContain("theme: z.string().trim().min(3).max(500)");
    expect(adminSchema).not.toContain("musicStyle: z.string().trim().min(1).max(150)");
    expect(adminSchema).not.toContain("mood: z.string().trim().min(1).max(120)");
    expect(adminSchema).not.toContain("instruments: z.string().trim().max(200)");
    expect(adminSchema).toContain("bpm: z.string().trim().min(1).max(8)");
    expect(adminSchema).toContain("songStructure: z.string().trim().min(1).max(600)");
    expect(adminSchema).toContain("productionStyle: z.string().trim().max(2000)");
    expect(adminSchema).toContain("additionalInstructions: z.string().trim().max(2000)");
    expect(adminSchema).toContain("language: z.string().trim().min(1).max(80)");
  });

  test("localized field-specific Music Style errors remain present in EN and EL", async () => {
    const [en, el] = await Promise.all([
      source("src/i18n/locales/en-app.ts"),
      source("src/i18n/locales/el-app.ts"),
    ]);
    expect(en).toContain('"generator.musicStyleTooLong"');
    expect(el).toContain('"generator.musicStyleTooLong"');
  });
});
