import type { TranslationKey } from "@/i18n/locales/en";
import { SONG_LANGUAGE_VALUES } from "@/catalog/song-languages";

export type LocalizedGeneratorOption = {
  id: string;
  /** Canonical value consumed by the existing generator/backend. Never translate this. */
  value: string;
  /** User-facing label resolved from the active locale when present. */
  labelKey?: TranslationKey;
  /** Fixed display label for values that do not need translation, such as numeric BPM values. */
  label?: string;
};

const option = (id: string, value: string, labelKey: TranslationKey): LocalizedGeneratorOption => ({
  id,
  value,
  labelKey,
});

const fixedOption = (value: string): LocalizedGeneratorOption => ({
  id: value,
  value,
  label: value,
});

export const BASIC_MUSIC_STYLES = [
  option("reggaeton", "Reggaeton", "generator.genre.reggaeton"),
  option("cumbia", "Cumbia", "generator.genre.cumbia"),
  option("latin-pop", "Latin Pop", "generator.genre.latinPop"),
  option("italo-disco", "Italo Disco", "generator.genre.italoDisco"),
  option("synthwave", "Synthwave", "generator.genre.synthwave"),
  option("acoustic", "Acoustic", "generator.genre.acoustic"),
  option("hip-hop", "Hip-Hop", "generator.genre.hipHop"),
  option("pop", "Pop", "generator.genre.pop"),
  option("rock", "Rock", "generator.genre.rock"),
  option("rnb", "R&B", "generator.genre.rnb"),
  option("house", "House", "generator.genre.house"),
  option("techno", "Techno", "generator.genre.techno"),
  option("electronic-edm", "Electronic / EDM", "generator.genre.electronicEdm"),
  option("drum-bass", "Drum & Bass", "generator.genre.drumBass"),
  option("trap", "Trap", "generator.genre.trap"),
  option("jazz", "Jazz", "generator.genre.jazz"),
  option("lofi", "Lo-fi", "generator.genre.lofi"),
  option("country", "Country", "generator.genre.country"),
  option("metal", "Metal", "generator.genre.metal"),
  option("afrobeats", "Afrobeats", "generator.genre.afrobeats"),
  option("custom", "Custom…", "generator.option.custom"),
] as const;

export const BASIC_MOODS = [
  option("energetic", "Energetic", "generator.mood.energetic"),
  option("melancholic", "Melancholic", "generator.mood.melancholic"),
  option("dark", "Dark", "generator.mood.dark"),
  option("uplifting", "Uplifting", "generator.mood.uplifting"),
  option("romantic", "Romantic", "generator.mood.romantic"),
  option("dreamy", "Dreamy", "generator.mood.dreamy"),
  option("aggressive", "Aggressive", "generator.mood.aggressive"),
  option("nostalgic", "Nostalgic", "generator.mood.nostalgic"),
  option("custom", "Custom…", "generator.option.custom"),
] as const;

export const SONG_LANGUAGES: readonly LocalizedGeneratorOption[] = [
  ...SONG_LANGUAGE_VALUES.map((value) => fixedOption(value)),
  option("custom", "Custom…", "generator.option.custom"),
] as const;

export const ADVANCED_MUSIC_STYLES = [
  option("reggaeton", "Reggaeton", "generator.genre.reggaeton"),
  option("pop", "Pop", "generator.genre.pop"),
  option("rock", "Rock", "generator.genre.rock"),
  option("rnb", "R&B", "generator.genre.rnb"),
  option("hip-hop", "Hip-Hop", "generator.genre.hipHop"),
  option("trap", "Trap", "generator.genre.trap"),
  option("soul", "Soul", "generator.genre.soul"),
  option("funk", "Funk", "generator.genre.funk"),
  option("jazz", "Jazz", "generator.genre.jazz"),
  option("blues", "Blues", "generator.genre.blues"),
  option("disco", "Disco", "generator.genre.disco"),
  option("house", "House", "generator.genre.house"),
  option("techno", "Techno", "generator.genre.techno"),
  option("edm", "EDM", "generator.genre.edm"),
  option("latin", "Latin", "generator.genre.latin"),
  option("cumbia", "Cumbia", "generator.genre.cumbia"),
  option("salsa", "Salsa", "generator.genre.salsa"),
  option("bachata", "Bachata", "generator.genre.bachata"),
  option("reggae", "Reggae", "generator.genre.reggae"),
  option("dancehall", "Dancehall", "generator.genre.dancehall"),
  option("afrobeat", "Afrobeat", "generator.genre.afrobeat"),
  option("country", "Country", "generator.genre.country"),
  option("folk", "Folk", "generator.genre.folk"),
  option("acoustic", "Acoustic", "generator.genre.acoustic"),
  option("ballad", "Ballad", "generator.genre.ballad"),
  option("metal", "Metal", "generator.genre.metal"),
  option("punk", "Punk", "generator.genre.punk"),
  option("indie", "Indie", "generator.genre.indie"),
  option("alternative", "Alternative", "generator.genre.alternative"),
  option("lofi", "Lo-fi", "generator.genre.lofi"),
  option("k-pop", "K-Pop", "generator.genre.kpop"),
  option("j-pop", "J-Pop", "generator.genre.jpop"),
  option("classical", "Classical", "generator.genre.classical"),
  option("orchestral", "Orchestral", "generator.genre.orchestral"),
  option("cinematic", "Cinematic", "generator.genre.cinematic"),
  option("custom", "Custom…", "generator.option.custom"),
] as const;

export const ADVANCED_MOODS = [
  option("romantic", "Romantic", "generator.mood.romantic"),
  option("happy", "Happy", "generator.mood.happy"),
  option("sad", "Sad", "generator.mood.sad"),
  option("melancholic", "Melancholic", "generator.mood.melancholic"),
  option("emotional", "Emotional", "generator.mood.emotional"),
  option("nostalgic", "Nostalgic", "generator.mood.nostalgic"),
  option("passionate", "Passionate", "generator.mood.passionate"),
  option("energetic", "Energetic", "generator.mood.energetic"),
  option("uplifting", "Uplifting", "generator.mood.uplifting"),
  option("euphoric", "Euphoric", "generator.mood.euphoric"),
  option("dreamy", "Dreamy", "generator.mood.dreamy"),
  option("chill", "Chill", "generator.mood.chill"),
  option("relaxed", "Relaxed", "generator.mood.relaxed"),
  option("intimate", "Intimate", "generator.mood.intimate"),
  option("sensual", "Sensual", "generator.mood.sensual"),
  option("hopeful", "Hopeful", "generator.mood.hopeful"),
  option("bittersweet", "Bittersweet", "generator.mood.bittersweet"),
  option("dark", "Dark", "generator.mood.dark"),
  option("mysterious", "Mysterious", "generator.mood.mysterious"),
  option("dramatic", "Dramatic", "generator.mood.dramatic"),
  option("powerful", "Powerful", "generator.mood.powerful"),
  option("aggressive", "Aggressive", "generator.mood.aggressive"),
  option("angry", "Angry", "generator.mood.angry"),
  option("playful", "Playful", "generator.mood.playful"),
  option("joyful", "Joyful", "generator.mood.joyful"),
  option("peaceful", "Peaceful", "generator.mood.peaceful"),
  option("tender", "Tender", "generator.mood.tender"),
  option("warm", "Warm", "generator.mood.warm"),
  option("lonely", "Lonely", "generator.mood.lonely"),
  option("heartbroken", "Heartbroken", "generator.mood.heartbroken"),
  option("reflective", "Reflective", "generator.mood.reflective"),
  option("inspirational", "Inspirational", "generator.mood.inspirational"),
  option("epic", "Epic", "generator.mood.epic"),
  option("triumphant", "Triumphant", "generator.mood.triumphant"),
  option("confident", "Confident", "generator.mood.confident"),
  option("rebellious", "Rebellious", "generator.mood.rebellious"),
  option("soulful", "Soulful", "generator.mood.soulful"),
  option("atmospheric", "Atmospheric", "generator.mood.atmospheric"),
  option("hypnotic", "Hypnotic", "generator.mood.hypnotic"),
  option("party", "Party", "generator.mood.party"),
  option("festive", "Festive", "generator.mood.festive"),
] as const;

export const INSTRUMENTS = [
  option("piano", "Piano", "generator.instrument.piano"),
  option("acoustic-piano", "Acoustic Piano", "generator.instrument.acousticPiano"),
  option("electric-piano", "Electric Piano", "generator.instrument.electricPiano"),
  option("grand-piano", "Grand Piano", "generator.instrument.grandPiano"),
  option("organ", "Organ", "generator.instrument.organ"),
  option("synth", "Synth", "generator.instrument.synth"),
  option("synth-bass", "Synth Bass", "generator.instrument.synthBass"),
  option("acoustic-guitar", "Acoustic Guitar", "generator.instrument.acousticGuitar"),
  option("electric-guitar", "Electric Guitar", "generator.instrument.electricGuitar"),
  option("classical-guitar", "Classical Guitar", "generator.instrument.classicalGuitar"),
  option("bass", "Bass", "generator.instrument.bass"),
  option("electric-bass", "Electric Bass", "generator.instrument.electricBass"),
  option("upright-bass", "Upright Bass", "generator.instrument.uprightBass"),
  option("drums", "Drums", "generator.instrument.drums"),
  option("electronic-drums", "Electronic Drums", "generator.instrument.electronicDrums"),
  option("percussion", "Percussion", "generator.instrument.percussion"),
  option("congas", "Congas", "generator.instrument.congas"),
  option("bongos", "Bongos", "generator.instrument.bongos"),
  option("timbales", "Timbales", "generator.instrument.timbales"),
  option("hand-claps", "Hand Claps", "generator.instrument.handClaps"),
  option("violin", "Violin", "generator.instrument.violin"),
  option("viola", "Viola", "generator.instrument.viola"),
  option("cello", "Cello", "generator.instrument.cello"),
  option("double-bass", "Double Bass", "generator.instrument.doubleBass"),
  option("strings", "Strings", "generator.instrument.strings"),
  option("trumpet", "Trumpet", "generator.instrument.trumpet"),
  option("trombone", "Trombone", "generator.instrument.trombone"),
  option("saxophone", "Saxophone", "generator.instrument.saxophone"),
  option("flute", "Flute", "generator.instrument.flute"),
  option("clarinet", "Clarinet", "generator.instrument.clarinet"),
  option("oboe", "Oboe", "generator.instrument.oboe"),
  option("harmonica", "Harmonica", "generator.instrument.harmonica"),
  option("accordion", "Accordion", "generator.instrument.accordion"),
  option("banjo", "Banjo", "generator.instrument.banjo"),
  option("mandolin", "Mandolin", "generator.instrument.mandolin"),
  option("ukulele", "Ukulele", "generator.instrument.ukulele"),
  option("harp", "Harp", "generator.instrument.harp"),
  option("marimba", "Marimba", "generator.instrument.marimba"),
  option("xylophone", "Xylophone", "generator.instrument.xylophone"),
  option("brass", "Brass", "generator.instrument.brass"),
  option("choir", "Choir", "generator.instrument.choir"),
] as const;

export const SONG_STRUCTURE_TAGS = [
  option("intro", "Intro", "generator.structure.intro"),
  option("verse", "Verse", "generator.structure.verse"),
  option("pre-chorus", "Pre-Chorus", "generator.structure.preChorus"),
  option("chorus", "Chorus", "generator.structure.chorus"),
  option("post-chorus", "Post-Chorus", "generator.structure.postChorus"),
  option("hook", "Hook", "generator.structure.hook"),
  option("refrain", "Refrain", "generator.structure.refrain"),
  option("bridge", "Bridge", "generator.structure.bridge"),
  option("breakdown", "Breakdown", "generator.structure.breakdown"),
  option("build", "Build", "generator.structure.build"),
  option("drop", "Drop", "generator.structure.drop"),
  option("interlude", "Interlude", "generator.structure.interlude"),
  option("instrumental", "Instrumental", "generator.structure.instrumental"),
  option("instrumental-break", "Instrumental Break", "generator.structure.instrumentalBreak"),
  option("solo", "Solo", "generator.structure.solo"),
  option("final-chorus", "Final Chorus", "generator.structure.finalChorus"),
  option("outro", "Outro", "generator.structure.outro"),
  option("coda", "Coda", "generator.structure.coda"),
] as const;

export const BPM_OPTIONS = [
  option("auto", "Auto", "generator.option.auto"),
  ...[
    "60",
    "70",
    "80",
    "90",
    "100",
    "110",
    "120",
    "125",
    "128",
    "130",
    "135",
    "140",
    "145",
    "150",
    "160",
    "170",
    "180",
    "190",
    "200",
  ].map(fixedOption),
  option("custom", "Custom", "common.custom"),
] as const;

export function optionLabel(
  optionValue: LocalizedGeneratorOption,
  t: (key: TranslationKey) => string,
) {
  return optionValue.labelKey ? t(optionValue.labelKey) : (optionValue.label ?? optionValue.value);
}

/**
 * Returns the canonical value for backend/AI payloads. Custom free text should
 * bypass these catalogs and be sent exactly as the user typed it.
 */
export function canonicalValue(optionValue: LocalizedGeneratorOption) {
  return optionValue.value;
}
