import { describe, expect, test } from "bun:test";
import * as sharedFacade from "../index";
import {
  resolveLanguageProfile,
  resolveLanguageIntelligencePrompt,
  composeLanguagePromptBlock,
  injectPromptLanguage,
  isLanguageIntelligenceKillSwitchActive,
  getLanguageProfile,
  LANGUAGE_PROFILES,
} from "../index";
import { buildLanguageIntelligenceProvenance, sha256Digest } from "../provenance.server";
import { buildPrompt } from "../../ai.functions";
import { buildAdvancedGeneratorPromptV4Beta } from "../../advanced-generator-prompt-v4-beta";
import { buildAdvancedGeneratorPromptV5Beta1 } from "../../advanced-generator-prompt-v5-beta-1";
import { buildRegistryPrompt } from "../../prompt-registry.server";

describe("Language Intelligence v1.2 — Core Engine & Profile Resolution", () => {
  // Test 1: resolveLanguageProfile resolves all 10 target languages
  test("1. resolveLanguageProfile resolves all 10 target languages correctly", () => {
    const targets = [
      { lang: "English", variant: null, expected: "en" },
      { lang: "German", variant: null, expected: "de" },
      { lang: "Russian", variant: null, expected: "ru" },
      { lang: "Greek", variant: null, expected: "el" },
      { lang: "French", variant: null, expected: "fr" },
      { lang: "Spanish", variant: null, expected: "es" },
      { lang: "Portuguese", variant: "pt-BR", expected: "pt-BR" },
      { lang: "Portuguese", variant: "pt-PT", expected: "pt-PT" },
      { lang: "Chinese", variant: "zh-cmn", expected: "zh-cmn" },
      { lang: "Chinese", variant: "zh-yue", expected: "yue" },
      { lang: "Turkish", variant: null, expected: "tr" },
      { lang: "Italian", variant: null, expected: "it" },
    ];
    for (const t of targets) {
      const res = resolveLanguageProfile(t.lang, t.variant);
      expect(res).not.toBeNull();
      expect(res?.profileId).toBe(t.expected as any);
    }
  });

  // Test 2: English returns profile en with version 1.2
  test("2. English returns profile en with version 1.2", () => {
    const res = resolveLanguageProfile("English");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("en");
    expect(res?.researchVersion).toBe("1.2");
    expect(res?.content.length).toBeGreaterThan(100);
  });

  // Test 3: German returns profile de with version 1.2
  test("3. German returns profile de with version 1.2", () => {
    const res = resolveLanguageProfile("German");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("de");
    expect(res?.researchVersion).toBe("1.2");
  });

  // Test 4: Russian returns profile ru with version 1.2
  test("4. Russian returns profile ru with version 1.2", () => {
    const res = resolveLanguageProfile("Russian");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("ru");
    expect(res?.researchVersion).toBe("1.2");
  });

  // Test 5: Greek returns profile el with version 1.2
  test("5. Greek returns profile el with version 1.2", () => {
    const res = resolveLanguageProfile("Greek");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("el");
    expect(res?.researchVersion).toBe("1.2");
  });

  // Test 6: French returns profile fr with version 1.2
  test("6. French returns profile fr with version 1.2", () => {
    const res = resolveLanguageProfile("French");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("fr");
    expect(res?.researchVersion).toBe("1.2");
  });

  // Test 7: Spanish returns profile es with version 1.2
  test("7. Spanish returns profile es with version 1.2", () => {
    const res = resolveLanguageProfile("Spanish");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("es");
    expect(res?.researchVersion).toBe("1.2");
  });

  // Test 8: Portuguese with pt-BR resolves to pt-BR
  test("8. Portuguese with pt-BR resolves to pt-BR", () => {
    const res = resolveLanguageProfile("Portuguese", "pt-BR");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("pt-BR");
    expect(res?.researchVersion).toBe("1.2");
    expect(res?.content).toContain("Brazilian Portuguese");
  });

  // Test 9: Portuguese with pt-PT resolves to pt-PT
  test("9. Portuguese with pt-PT resolves to pt-PT", () => {
    const res = resolveLanguageProfile("Portuguese", "pt-PT");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("pt-PT");
    expect(res?.researchVersion).toBe("1.2");
    expect(res?.content).toContain("European Portuguese");
  });

  // Test 10: Portuguese with variant null returns null (requires explicit variety)
  test("10. Portuguese with variant null returns null (requires explicit variety)", () => {
    const res = resolveLanguageProfile("Portuguese", null);
    expect(res).toBeNull();
  });

  // Test 11: Chinese Mandarin with Hans sets script: 'Hans'
  test("11. Chinese Mandarin (zh-cmn) with Hans sets script: 'Hans'", () => {
    const res = resolveLanguageProfile("Chinese", "zh-cmn-Hans");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("zh-cmn");
    expect(res?.script).toBe("Hans");
  });

  // Test 12: Chinese Mandarin with Hant sets script: 'Hant'
  test("12. Chinese Mandarin (zh-cmn) with Hant sets script: 'Hant'", () => {
    const res = resolveLanguageProfile("Chinese", "zh-cmn-Hant");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("zh-cmn");
    expect(res?.script).toBe("Hant");
  });

  // Test 13: Chinese Cantonese resolves to yue and Hant script
  test("13. Chinese Cantonese (yue) resolves to yue and Hant script", () => {
    const res = resolveLanguageProfile("Chinese", "zh-yue");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("yue");
    expect(res?.script).toBe("Hant");
    expect(res?.content).toContain("Cantonese");
  });

  // Test 14: Turkish returns profile tr with version 1.2
  test("14. Turkish returns profile tr with version 1.2", () => {
    const res = resolveLanguageProfile("Turkish");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("tr");
    expect(res?.researchVersion).toBe("1.2");
  });

  // Test 15: Italian returns profile it with version 1.2
  test("15. Italian returns profile it with version 1.2", () => {
    const res = resolveLanguageProfile("Italian");
    expect(res).not.toBeNull();
    expect(res?.profileId).toBe("it");
    expect(res?.researchVersion).toBe("1.2");
  });

  // Test 16: Unsupported language returns null
  test("16. Unsupported language returns null", () => {
    expect(resolveLanguageProfile("Swahili")).toBeNull();
    expect(resolveLanguageProfile("Klingon")).toBeNull();
    expect(resolveLanguageProfile("")).toBeNull();
  });
});

describe("Language Intelligence v1.2 — Parity, Kill Switch, & Composition", () => {
  // Test 17: OFF parity: when enabled: false, promptLanguageBlock === cleanLanguage byte-for-byte
  test("17. OFF parity: when enabled: false, promptLanguageBlock === cleanLanguage byte-for-byte", () => {
    const clean = "Greek (Greece)";
    const res = resolveLanguageIntelligencePrompt({ language: clean }, false);
    expect(res.active).toBe(false);
    expect(res.applied).toBe(false);
    expect(res.profileId).toBeNull();
    expect(res.cleanLanguage).toBe(clean);
    expect(res.promptLanguageBlock).toBe(clean);
    expect(res.promptLanguageBlock === clean).toBe(true);
  });

  // Test 18: Kill switch active falls back to clean language
  test("18. Central emergency kill switch falls back safely", () => {
    const original = process.env["PROMPTBEATS_LANGUAGE_INTELLIGENCE_DISABLED"];
    try {
      process.env["PROMPTBEATS_LANGUAGE_INTELLIGENCE_DISABLED"] = "true";
      expect(isLanguageIntelligenceKillSwitchActive()).toBe(true);

      const killSwitchActive = isLanguageIntelligenceKillSwitchActive();
      const res = resolveLanguageIntelligencePrompt({ language: "English" }, !killSwitchActive);
      expect(res.applied).toBe(false);
      expect(res.promptLanguageBlock).toBe("English");
    } finally {
      if (original !== undefined) {
        process.env["PROMPTBEATS_LANGUAGE_INTELLIGENCE_DISABLED"] = original;
      } else {
        delete process.env["PROMPTBEATS_LANGUAGE_INTELLIGENCE_DISABLED"];
      }
    }
  });

  // Test 19: composeLanguagePromptBlock contains clean language header
  test("19. composeLanguagePromptBlock contains clean language header", () => {
    const resolved = resolveLanguageProfile("Greek")!;
    const block = composeLanguagePromptBlock("Greek (Greece)", resolved);
    expect(block.startsWith("Greek (Greece)")).toBe(true);
  });

  // Test 20: composeLanguagePromptBlock contains profile research content
  test("20. composeLanguagePromptBlock contains profile research content", () => {
    const resolved = resolveLanguageProfile("German")!;
    const block = composeLanguagePromptBlock("German", resolved);
    expect(block).toContain(resolved.content.trim());
  });

  // Test 21: composeLanguagePromptBlock wraps content in delimiters
  test("21. composeLanguagePromptBlock wraps content in LANGUAGE INTELLIGENCE guidelines delimiters", () => {
    const resolved = resolveLanguageProfile("French")!;
    const block = composeLanguagePromptBlock("French", resolved);
    expect(block).toContain("LANGUAGE INTELLIGENCE v1.2 — FR GUIDELINES");
    expect(block).toContain("END LANGUAGE INTELLIGENCE GUIDELINES");
  });

  // Test 22: injectPromptLanguage with isApplied: false returns cleanLanguage
  test("22. injectPromptLanguage with isApplied: false returns cleanLanguage byte-for-byte", () => {
    const clean = "Spanish (Spain)";
    const out = injectPromptLanguage("v5_beta_1", clean, "ENRICHED BLOCK", false);
    expect(out).toBe(clean);
  });

  // Test 23: injectPromptLanguage with isApplied: true returns promptLanguageBlock
  test("23. injectPromptLanguage with isApplied: true returns promptLanguageBlock", () => {
    const clean = "Spanish (Spain)";
    const enriched = "Spanish (Spain)\nLANGUAGE INTELLIGENCE v1.2";
    const out = injectPromptLanguage("v5_beta_1", clean, enriched, true);
    expect(out).toBe(enriched);
  });
});

describe("Language Intelligence v1.2 — Multi-Prompt Integration", () => {
  const dummyBlueprint = [
    {
      structureIndex: 0,
      sectionType: "Verse",
      occurrence: 1,
      instruction: "Setup atmosphere and story intro",
      energy: 3 as const,
    },
  ];

  // Test 24: Integration with V1 prompt
  test("24. Integration with V1 prompt: buildPrompt receives promptLanguageBlock when applied", () => {
    const clean = "Greek";
    const resolved = resolveLanguageProfile(clean)!;
    const block = composeLanguagePromptBlock(clean, resolved);

    const promptOff = buildPrompt({
      promptVersion: "v1",
      operation: "generate",
      theme: "Summer sea",
      genre: "Laiko",
      mood: "Joyful",
      language: clean,
      targetPlatform: "suno",
      structure: "Verse → Chorus",
      songBlueprint: dummyBlueprint,
      production: "Acoustic",
      instructions: "Keep it bright",
    });

    const promptOn = buildPrompt({
      promptVersion: "v1",
      operation: "generate",
      theme: "Summer sea",
      genre: "Laiko",
      mood: "Joyful",
      language: block,
      targetPlatform: "suno",
      structure: "Verse → Chorus",
      songBlueprint: dummyBlueprint,
      production: "Acoustic",
      instructions: "Keep it bright",
    });

    expect(promptOff).toContain("Requested Language: Greek");
    expect(promptOn).toContain("Requested Language: Greek");
    expect(promptOn).toContain("LANGUAGE INTELLIGENCE v1.2 — EL GUIDELINES");
    expect(promptOff).not.toContain("LANGUAGE INTELLIGENCE v1.2 — EL GUIDELINES");
  });

  // Test 25: Integration with V4 Beta
  test("25. Integration with V4 Beta receives promptLanguageBlock", () => {
    const clean = "Italian";
    const resolved = resolveLanguageProfile(clean)!;
    const block = composeLanguagePromptBlock(clean, resolved);

    const promptOn = buildAdvancedGeneratorPromptV4Beta({
      theme: "Rome sunset",
      genre: "Canzone d'autore",
      mood: "Nostalgic",
      language: block,
      targetPlatform: "suno",
      structure: "Verse → Chorus",
      songBlueprint: dummyBlueprint,
      production: "Strings and piano",
      instructions: "Deep lyrics",
    });

    expect(promptOn).toContain("LANGUAGE INTELLIGENCE v1.2 — IT GUIDELINES");
    expect(promptOn).toContain("Rome sunset");
  });

  // Test 26: Integration with V5 Beta 1
  test("26. Integration with V5 Beta 1 receives promptLanguageBlock", () => {
    const clean = "English";
    const resolved = resolveLanguageProfile(clean)!;
    const block = composeLanguagePromptBlock(clean, resolved);

    const promptOn = buildAdvancedGeneratorPromptV5Beta1({
      theme: "Midnight rain",
      genre: "Soul",
      mood: "Melancholic",
      language: block,
      targetPlatform: "suno",
      structure: "Verse → Chorus",
      songBlueprint: dummyBlueprint,
      production: "Warm analog",
      instructions: "Slow groove",
    });

    expect(promptOn).toContain("LANGUAGE INTELLIGENCE v1.2 — EN GUIDELINES");
    expect(promptOn).toContain("Midnight rain");
  });

  // Test 27: Integration with Registry
  test("27. Integration with Registry replaces {{LANGUAGE}} with promptLanguageBlock", () => {
    const template = `PROMPT TEMPLATE FOR ADVANCED GENERATOR REGISTRY TESTING
Idea: {{CORE_IDEA}}
Genres: {{GENRES}}
Mood: {{MOOD}}
Language: {{LANGUAGE}}
Platform: {{TARGET_PLATFORM}}
Structure: {{SONG_STRUCTURE}}
Production: {{PRODUCTION_STYLE}}
Instructions: {{ADDITIONAL_INSTRUCTIONS}}
Blueprint: {{SONG_BLUEPRINT}}

{"title": "Song Title", "tags": "pop, rock", "lyrics": "Hello world", "note": "Producer note"}
`;
    const clean = "Russian";
    const resolved = resolveLanguageProfile(clean)!;
    const block = composeLanguagePromptBlock(clean, resolved);

    const rendered = buildRegistryPrompt(template, {
      theme: "Winter journey",
      genre: "Bard",
      mood: "Thoughtful",
      language: block,
      targetPlatform: "suno",
      structure: "Verse → Chorus",
      songBlueprint: dummyBlueprint,
      production: "Acoustic guitar",
      instructions: "",
    });

    expect(rendered).toContain("Russian");
    expect(rendered).toContain("LANGUAGE INTELLIGENCE v1.2 — RU GUIDELINES");
  });
});

describe("Language Intelligence v1.2 — Provenance & Clean Language Invariant", () => {
  // Test 28: Provenance metadata and sha256 digests
  test("28. buildLanguageIntelligenceProvenance produces sha256 digests and matching metadata", () => {
    const resolved = resolveLanguageProfile("Greek")!;
    const prov = buildLanguageIntelligenceProvenance({
      enabled: true,
      applied: true,
      pairId: "123e4567-e89b-12d3-a456-426614174000",
      pairRole: "treatment",
      resolved,
      promptVersion: "v5_beta_1",
      assembledPrompt: "Assembled prompt content test",
      masterPromptTemplate: "Master prompt template test",
      provider: "google",
      model: "gemini-2.5-pro",
    });

    expect(prov.enabled).toBe(true);
    expect(prov.applied).toBe(true);
    expect(prov.pairId).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(prov.pairRole).toBe("treatment");
    expect(prov.profileId).toBe("el");
    expect(prov.profileVersion).toBe("1.2");
    // Deterministic golden digest expectations:
    expect(prov.promptDigest).toBe(
      "3d4bf3637e0c049b1825658af0a4b9f02a4feb56635ba573e64c8785c6831922",
    );
    expect(prov.masterPromptDigest).toBe(
      "57b2acbc2dd5225f8182783141b5176883a34db15a08c89d403ed97e362e77aa",
    );
    expect(prov.promptDigest).toBe(sha256Digest("Assembled prompt content test"));
    expect(prov.masterPromptDigest).toBe(sha256Digest("Master prompt template test"));
    expect(prov.provider).toBe("google");
    expect(prov.model).toBe("gemini-2.5-pro");
  });

  // Test 29: Clean Language Invariant
  test("29. Clean Language Invariant: cleanLanguage and snapshot language are never mutated", () => {
    const originalLanguage = "Greek (Greece)";
    const snapshot = {
      generatorMode: "advanced",
      language: originalLanguage,
      languageVariant: "el-GR",
    };

    const res = resolveLanguageIntelligencePrompt(
      {
        language: snapshot.language,
        variantId: snapshot.languageVariant,
        enabled: true,
      },
      true,
    );

    // Prompt block is enriched:
    expect(res.applied).toBe(true);
    expect(res.promptLanguageBlock).toContain("LANGUAGE INTELLIGENCE v1.2 — EL GUIDELINES");

    // But cleanLanguage in resolution and in the original snapshot remain strictly clean:
    expect(res.cleanLanguage).toBe(originalLanguage);
    expect(snapshot.language).toBe(originalLanguage);
    expect(snapshot.language.length).toBeLessThanOrEqual(40);
  });

  // Test 30: Deterministic golden digests for multilingual UTF-8 inputs
  test("30. sha256Digest deterministic golden digests for multilingual UTF-8", () => {
    expect(sha256Digest("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Digest("Ελληνικό κείμενο δοκιμής")).toBe(
      "965baaa32007e8a1dd92a6bd42de49e7b11458563dd39bb9499d99667b659b3b",
    );
    expect(sha256Digest("Русский текст")).toBe(
      "71a631c26669714ea79a98c183253778f2b4488f41ef08fe79cdbe4939b91b6e",
    );
    expect(sha256Digest("中文测试")).toBe(
      "e350545d18735c5dd2dec50dcb971f3eb4cdda24b95a79bdb6b553f6a01ceb87",
    );
  });

  // Test 31: Architectural boundary protection - shared facade does not export server provenance or node:crypto
  test("31. Shared Language Intelligence facade does not export server provenance or node:crypto", () => {
    expect("buildLanguageIntelligenceProvenance" in sharedFacade).toBe(false);
    expect("sha256Digest" in sharedFacade).toBe(false);
    expect(typeof sharedFacade.resolveLanguageIntelligencePrompt).toBe("function");
    expect(typeof sharedFacade.resolveLanguageProfile).toBe("function");
    expect(typeof sharedFacade.composeLanguagePromptBlock).toBe("function");
    expect(typeof sharedFacade.injectPromptLanguage).toBe("function");
  });
});
