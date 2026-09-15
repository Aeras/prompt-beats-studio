import type { AppTranslationKey } from "@/i18n";
import type { CatalogTranslationKey } from "@/i18n/locales/en-catalog";

export const GENRE_LABEL_KEYS: Record<string, CatalogTranslationKey> = {
  All: "genre.all",
  Pop: "genre.pop",
  "Hip-Hop / Rap": "genre.hipHopRap",
  Rock: "genre.rock",
  Metal: "genre.metal",
  "Electronic / EDM": "genre.electronicEdm",
  House: "genre.house",
  Techno: "genre.techno",
  Trance: "genre.trance",
  "Drum & Bass": "genre.drumBass",
  "Lo-Fi / Chill": "genre.lofiChill",
  "R&B / Soul": "genre.rnbSoul",
  "Funk / Disco": "genre.funkDisco",
  Jazz: "genre.jazz",
  Blues: "genre.blues",
  "Acoustic / Folk": "genre.acousticFolk",
  Country: "genre.country",
  Reggae: "genre.reggae",
  Latin: "genre.latin",
  Classical: "genre.classical",
  "Cinematic / Soundtrack": "genre.cinematicSoundtrack",
  "World / Traditional": "genre.worldTraditional",
  Experimental: "genre.experimental",
  Custom: "genre.custom",
};

export const ACCOUNT_REASON_LABEL_KEYS: Record<string, CatalogTranslationKey> = {
  platform_rules: "reason.account.platformRules",
  copyright_or_third_party_rights: "reason.account.copyright",
  abuse_spam_or_harmful_activity: "reason.account.abuseSpam",
  ai_or_platform_misuse: "reason.account.aiMisuse",
  security_concern: "reason.account.security",
  other: "reason.account.other",
};

export const TRACK_REASON_LABEL_KEYS: Record<string, CatalogTranslationKey> = {
  reported_third_party_rights: "reason.track.thirdPartyRights",
  suspected_copyright_rights: "reason.track.copyright",
  policy_violation: "reason.track.policy",
  harassment_abusive_content: "reason.track.harassment",
  spam_deceptive_content: "reason.track.spam",
  other: "reason.track.other",
};

type Translate = (key: AppTranslationKey, values?: Record<string, string | number>) => string;

export function localizedGenreLabel(value: string, t: Translate) {
  const key = GENRE_LABEL_KEYS[value];
  return key ? t(key) : value;
}

export function localizedAccountReasonLabel(code: string, fallback: string, t: Translate) {
  const key = ACCOUNT_REASON_LABEL_KEYS[code];
  return key ? t(key) : fallback;
}

export function localizedTrackReasonLabel(code: string, fallback: string, t: Translate) {
  const key = TRACK_REASON_LABEL_KEYS[code];
  return key ? t(key) : fallback;
}
