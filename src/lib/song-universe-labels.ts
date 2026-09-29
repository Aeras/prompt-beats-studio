import type { SongUniverseRecord } from "@/lib/song-universe.shared";

type LocalizedLabel = { en: string; el: string };

export const SONG_UNIVERSE_TYPE_LABELS: Record<SongUniverseRecord["universeType"], LocalizedLabel> = {
  album: { en: "Album", el: "Άλμπουμ" },
  ep: { en: "EP", el: "EP" },
  song_series: { en: "Song Series", el: "Σειρά τραγουδιών" },
  creative_era: { en: "Creative Era", el: "Δημιουργική περίοδος" },
  other: { en: "Other", el: "Άλλο" },
};

export const SONG_UNIVERSE_STATUS_LABELS: Record<SongUniverseRecord["status"], LocalizedLabel> = {
  planning: { en: "Planning", el: "Σχεδιασμός" },
  writing: { en: "Writing", el: "Συγγραφή" },
  production: { en: "Production", el: "Παραγωγή" },
  review: { en: "Review", el: "Έλεγχος" },
  complete: { en: "Complete", el: "Ολοκληρωμένο" },
  archived: { en: "Archived", el: "Αρχειοθετημένο" },
};

export function songUniverseTypeLabel(type: SongUniverseRecord["universeType"], language: "en" | "el") {
  return SONG_UNIVERSE_TYPE_LABELS[type][language];
}

export function songUniverseStatusLabel(status: SongUniverseRecord["status"], language: "en" | "el") {
  return SONG_UNIVERSE_STATUS_LABELS[status][language];
}
