export type SongLanguageOption = {
  code: string;
  value: string;
  label: string;
  englishLabel: string;
};

export const CUSTOM_LANGUAGE_VALUE = "Custom…";

const ISO_639_1_CODES = [
  "aa","ab","ae","af","ak","am","an","ar","as","av","ay","az","ba","be","bg","bh","bi","bm","bn","bo","br","bs",
  "ca","ce","ch","co","cr","cs","cu","cv","cy","da","de","dv","dz","ee","el","en","eo","es","et","eu","fa","ff",
  "fi","fj","fo","fr","fy","ga","gd","gl","gn","gu","gv","ha","he","hi","ho","hr","ht","hu","hy","hz","ia","id",
  "ie","ig","ii","ik","io","is","it","iu","ja","jv","ka","kg","ki","kj","kk","kl","km","kn","ko","kr","ks","ku",
  "kv","kw","ky","la","lb","lg","li","ln","lo","lt","lu","lv","mg","mh","mi","mk","ml","mn","mr","ms","mt","my",
  "na","nb","nd","ne","ng","nl","nn","no","nr","nv","ny","oc","oj","om","or","os","pa","pi","pl","ps","pt","qu",
  "rm","rn","ro","ru","rw","sa","sc","sd","se","sg","si","sk","sl","sm","sn","so","sq","sr","ss","st","su","sv",
  "sw","ta","te","tg","th","ti","tk","tl","tn","to","tr","ts","tt","tw","ty","ug","uk","ur","uz","ve","vi","vo",
  "wa","wo","xh","yi","yo","za","zh","zu",
] as const;

const FALLBACK_ENGLISH_NAMES: Record<string, string> = {
  el: "Greek",
  en: "English",
  es: "Spanish",
  ru: "Russian",
  it: "Italian",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  tr: "Turkish",
  uk: "Ukrainian",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  cs: "Czech",
  ro: "Romanian",
  hu: "Hungarian",
  bg: "Bulgarian",
  sr: "Serbian",
  hr: "Croatian",
  sk: "Slovak",
  sl: "Slovenian",
  he: "Hebrew",
  hi: "Hindi",
  bn: "Bengali",
  ur: "Urdu",
  fa: "Persian",
  id: "Indonesian",
  ms: "Malay",
  vi: "Vietnamese",
  th: "Thai",
  sw: "Swahili",
};

function displayName(code: string, locale: "en" | "el") {
  try {
    const names = new Intl.DisplayNames([locale], { type: "language" });
    return names.of(code) || FALLBACK_ENGLISH_NAMES[code] || code.toUpperCase();
  } catch {
    return FALLBACK_ENGLISH_NAMES[code] || code.toUpperCase();
  }
}

export function getSongLanguageOptions(locale: "en" | "el"): SongLanguageOption[] {
  return ISO_639_1_CODES.map((code) => {
    const englishLabel = displayName(code, "en");
    return {
      code,
      value: englishLabel,
      label: displayName(code, locale),
      englishLabel,
    };
  }).sort((a, b) => a.label.localeCompare(b.label, locale));
}

export const SONG_LANGUAGE_VALUES = ISO_639_1_CODES.map((code) => displayName(code, "en"));

export function findSongLanguageByCanonicalValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return getSongLanguageOptions("en").find(
    (item) => item.value.toLocaleLowerCase() === normalized || item.englishLabel.toLocaleLowerCase() === normalized,
  ) ?? null;
}
