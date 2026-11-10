import type { LanguageProfileAsset, LanguageProfileId } from "./types";
import { enProfile } from "./profiles/en";
import { deProfile } from "./profiles/de";
import { ruProfile } from "./profiles/ru";
import { elProfile } from "./profiles/el";
import { frProfile } from "./profiles/fr";
import { esProfile } from "./profiles/es";
import { ptBRProfile } from "./profiles/pt-br";
import { ptPTProfile } from "./profiles/pt-pt";
import { zhCmnProfile } from "./profiles/zh-cmn";
import { zhYueProfile } from "./profiles/zh-yue";
import { trProfile } from "./profiles/tr";
import { itProfile } from "./profiles/it";

export const RESEARCH_VERSION = "1.2";

export const LANGUAGE_PROFILES: Readonly<Record<LanguageProfileId, LanguageProfileAsset>> =
  Object.freeze({
    en: {
      id: "en",
      languageKey: "English",
      name: "English",
      researchVersion: RESEARCH_VERSION,
      content: enProfile,
    },
    de: {
      id: "de",
      languageKey: "German",
      name: "German",
      researchVersion: RESEARCH_VERSION,
      content: deProfile,
    },
    ru: {
      id: "ru",
      languageKey: "Russian",
      name: "Russian",
      researchVersion: RESEARCH_VERSION,
      content: ruProfile,
    },
    el: {
      id: "el",
      languageKey: "Greek",
      name: "Greek",
      researchVersion: RESEARCH_VERSION,
      content: elProfile,
    },
    fr: {
      id: "fr",
      languageKey: "French",
      name: "French",
      researchVersion: RESEARCH_VERSION,
      content: frProfile,
    },
    es: {
      id: "es",
      languageKey: "Spanish",
      name: "Spanish",
      researchVersion: RESEARCH_VERSION,
      content: esProfile,
    },
    "pt-BR": {
      id: "pt-BR",
      languageKey: "Portuguese",
      name: "Portuguese (Brazil)",
      researchVersion: RESEARCH_VERSION,
      content: ptBRProfile,
    },
    "pt-PT": {
      id: "pt-PT",
      languageKey: "Portuguese",
      name: "Portuguese (Portugal)",
      researchVersion: RESEARCH_VERSION,
      content: ptPTProfile,
    },
    "zh-cmn": {
      id: "zh-cmn",
      languageKey: "Chinese",
      name: "Chinese (Mandarin)",
      researchVersion: RESEARCH_VERSION,
      content: zhCmnProfile,
    },
    yue: {
      id: "yue",
      languageKey: "Chinese",
      name: "Chinese (Cantonese)",
      researchVersion: RESEARCH_VERSION,
      content: zhYueProfile,
    },
    tr: {
      id: "tr",
      languageKey: "Turkish",
      name: "Turkish",
      researchVersion: RESEARCH_VERSION,
      content: trProfile,
    },
    it: {
      id: "it",
      languageKey: "Italian",
      name: "Italian",
      researchVersion: RESEARCH_VERSION,
      content: itProfile,
    },
  });

export function getLanguageProfile(id: LanguageProfileId): LanguageProfileAsset | undefined {
  return LANGUAGE_PROFILES[id];
}
