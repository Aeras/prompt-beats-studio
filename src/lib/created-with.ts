export const CREATED_WITH_OPTIONS = [
  "Suno",
  "Udio",
  "TopMediai",
  "Google Lyria 3.5",
  "Stable Audio",
  "ElevenLabs Music",
  "Mureka",
  "Riffusion",
  "MusicFX",
  "Boomy",
  "Soundraw",
  "AIVA",
  "Loudly",
  "Other",
] as const;

export type CreatedWith = (typeof CREATED_WITH_OPTIONS)[number];

export function isCreatedWith(value: unknown): value is CreatedWith {
  return typeof value === "string" && (CREATED_WITH_OPTIONS as readonly string[]).includes(value);
}
