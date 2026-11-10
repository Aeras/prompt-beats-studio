import type { ChineseScript, LanguageProfileId, ResolvedLanguageProfile } from "./types";
import { getLanguageProfile, RESEARCH_VERSION } from "./repository";

/**
 * Resolves the appropriate Language Intelligence v1.2 profile based on language and variant.
 *
 * Strict runtime rules:
 * - pt-BR and pt-PT are isolated spoken profiles; ambiguous "Portuguese" returns null (no silent default).
 * - zh-cmn (Mandarin) and yue (Cantonese) are isolated spoken profiles; ambiguous "Chinese" returns null.
 * - Simplified and Traditional are script choices for Mandarin, not different spoken profiles.
 * - Unsupported languages and variants return null (safe bypass).
 * - Zero cross-profile fallback.
 */
export function resolveLanguageProfile(
  language: string,
  variantId?: string | null,
): ResolvedLanguageProfile | null {
  const normalizedLang = (language ?? "").trim();
  const normalizedVariant = (variantId ?? "").trim().toLowerCase();

  if (!normalizedLang) return null;

  // 1. English
  if (
    normalizedLang.toLowerCase() === "english" ||
    normalizedLang.toLowerCase().startsWith("english")
  ) {
    const profile = getLanguageProfile("en");
    if (!profile) return null;
    return {
      profileId: "en",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: normalizedVariant || null,
      content: profile.content,
    };
  }

  // 2. German
  if (
    normalizedLang.toLowerCase() === "german" ||
    normalizedLang.toLowerCase().startsWith("german")
  ) {
    const profile = getLanguageProfile("de");
    if (!profile) return null;
    return {
      profileId: "de",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: normalizedVariant || null,
      content: profile.content,
    };
  }

  // 3. Russian (base only)
  if (normalizedLang.toLowerCase() === "russian") {
    const profile = getLanguageProfile("ru");
    if (!profile) return null;
    return {
      profileId: "ru",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: null,
      content: profile.content,
    };
  }

  // 4. Greek
  if (
    normalizedLang.toLowerCase() === "greek" ||
    normalizedLang.toLowerCase().startsWith("greek")
  ) {
    const profile = getLanguageProfile("el");
    if (!profile) return null;
    return {
      profileId: "el",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: normalizedVariant || null,
      content: profile.content,
    };
  }

  // 5. French
  if (
    normalizedLang.toLowerCase() === "french" ||
    normalizedLang.toLowerCase().startsWith("french")
  ) {
    const profile = getLanguageProfile("fr");
    if (!profile) return null;
    return {
      profileId: "fr",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: normalizedVariant || null,
      content: profile.content,
    };
  }

  // 6. Spanish
  if (
    normalizedLang.toLowerCase() === "spanish" ||
    normalizedLang.toLowerCase().startsWith("spanish")
  ) {
    const profile = getLanguageProfile("es");
    if (!profile) return null;
    return {
      profileId: "es",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: normalizedVariant || null,
      content: profile.content,
    };
  }

  // 7. Portuguese (Strict isolation: pt-BR vs pt-PT)
  if (
    normalizedLang.toLowerCase() === "portuguese" ||
    normalizedLang.toLowerCase().startsWith("portuguese")
  ) {
    const isBrazil =
      normalizedVariant === "br" ||
      normalizedVariant === "pt-br" ||
      normalizedVariant.includes("brazil") ||
      normalizedLang.toLowerCase().includes("brazil");
    const isPortugal =
      normalizedVariant === "pt" ||
      normalizedVariant === "pt-pt" ||
      normalizedVariant.includes("portugal") ||
      normalizedLang.toLowerCase().includes("portugal");

    if (isBrazil) {
      const profile = getLanguageProfile("pt-BR");
      if (!profile) return null;
      return {
        profileId: "pt-BR",
        researchVersion: RESEARCH_VERSION,
        cleanLanguage: normalizedLang,
        variantId: normalizedVariant || "br",
        content: profile.content,
      };
    }

    if (isPortugal) {
      const profile = getLanguageProfile("pt-PT");
      if (!profile) return null;
      return {
        profileId: "pt-PT",
        researchVersion: RESEARCH_VERSION,
        cleanLanguage: normalizedLang,
        variantId: normalizedVariant || "pt",
        content: profile.content,
      };
    }

    // Ambiguous Portuguese without variant: do NOT guess or merge; return null
    return null;
  }

  // 8. Chinese (Strict isolation: zh-cmn vs yue; script: Hans vs Hant)
  if (
    normalizedLang.toLowerCase() === "chinese" ||
    normalizedLang.toLowerCase().startsWith("chinese")
  ) {
    const isCantonese =
      normalizedVariant === "cantonese-traditional" ||
      normalizedVariant === "zh-yue" ||
      normalizedVariant === "yue" ||
      normalizedVariant.includes("cantonese") ||
      normalizedLang.toLowerCase().includes("cantonese");

    if (isCantonese) {
      const profile = getLanguageProfile("yue");
      if (!profile) return null;
      return {
        profileId: "yue",
        researchVersion: RESEARCH_VERSION,
        cleanLanguage: normalizedLang,
        variantId: normalizedVariant || "cantonese-traditional",
        script: "Hant",
        content: profile.content,
      };
    }

    const isMandarinSimp =
      normalizedVariant === "mandarin-simplified" ||
      normalizedVariant === "zh-cmn-hans" ||
      normalizedVariant === "zh-cmn" ||
      normalizedVariant === "hans" ||
      normalizedVariant === "simplified" ||
      (normalizedVariant.includes("mandarin") && normalizedVariant.includes("simplified")) ||
      (normalizedLang.toLowerCase().includes("mandarin") &&
        normalizedLang.toLowerCase().includes("simplified"));

    if (isMandarinSimp) {
      const profile = getLanguageProfile("zh-cmn");
      if (!profile) return null;
      return {
        profileId: "zh-cmn",
        researchVersion: RESEARCH_VERSION,
        cleanLanguage: normalizedLang,
        variantId: normalizedVariant || "mandarin-simplified",
        script: "Hans",
        content: profile.content,
      };
    }

    const isMandarinTrad =
      normalizedVariant === "mandarin-traditional" ||
      normalizedVariant === "zh-cmn-hant" ||
      normalizedVariant === "hant" ||
      normalizedVariant === "traditional" ||
      (normalizedVariant.includes("mandarin") && normalizedVariant.includes("traditional")) ||
      (normalizedLang.toLowerCase().includes("mandarin") &&
        normalizedLang.toLowerCase().includes("traditional"));

    if (isMandarinTrad) {
      const profile = getLanguageProfile("zh-cmn");
      if (!profile) return null;
      return {
        profileId: "zh-cmn",
        researchVersion: RESEARCH_VERSION,
        cleanLanguage: normalizedLang,
        variantId: normalizedVariant || "mandarin-traditional",
        script: "Hant",
        content: profile.content,
      };
    }

    // Ambiguous Chinese without dialect/variant: do NOT guess; return null
    return null;
  }

  // 9. Turkish (base only)
  if (normalizedLang.toLowerCase() === "turkish") {
    const profile = getLanguageProfile("tr");
    if (!profile) return null;
    return {
      profileId: "tr",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: null,
      content: profile.content,
    };
  }

  // 10. Italian (base only)
  if (normalizedLang.toLowerCase() === "italian") {
    const profile = getLanguageProfile("it");
    if (!profile) return null;
    return {
      profileId: "it",
      researchVersion: RESEARCH_VERSION,
      cleanLanguage: normalizedLang,
      variantId: null,
      content: profile.content,
    };
  }

  // Any other language: unsupported
  return null;
}
