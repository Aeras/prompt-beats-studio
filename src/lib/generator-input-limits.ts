export type GeneratorInputLimitSubject = {
  theme: string;
  genre: string;
  mood: string;
  advanced: boolean;
  baseMusicStyle: string;
  instruments: string;
  operation: "generate" | "revision";
};

/**
 * PB-009 authoring limits for generation admission.
 *
 * `genre` is the later composed music-direction string. Normal Advanced mode
 * validates the actual user-facing fields instead; Revision intentionally
 * preserves its existing composed-direction ceiling.
 */
export function assertGenerationInputLimits(
  input: GeneratorInputLimitSubject,
  isAdminLevel: boolean,
) {
  if (isAdminLevel) return;

  if (input.operation === "revision") {
    if (input.theme.length > 500) throw new Error("Theme must be 500 characters or fewer.");
    if (!input.baseMusicStyle || input.baseMusicStyle.length > 500)
      throw new Error("Music Style must be 500 characters or fewer.");
    if (input.genre.length > 500)
      throw new Error("The composed music direction must be 500 characters or fewer.");
    if (input.mood.length > 120) throw new Error("Mood must be 120 characters or fewer.");
    if (input.instruments.length > 200)
      throw new Error("Instruments must be 200 characters or fewer.");
    return;
  }

  if (input.advanced) {
    if (input.theme.length > 500) throw new Error("Theme must be 500 characters or fewer.");
    if (!input.baseMusicStyle || input.baseMusicStyle.length > 150)
      throw new Error("Music Style must be 150 characters or fewer.");
    if (input.mood.length > 120) throw new Error("Mood must be 120 characters or fewer.");
    if (input.instruments.length > 200)
      throw new Error("Instruments must be 200 characters or fewer.");
    return;
  }

  if (input.theme.length > 300) throw new Error("Theme must be 300 characters or fewer.");
  if (input.genre.length > 400) throw new Error("Music Style must be 400 characters or fewer.");
  if (input.mood.length > 60) throw new Error("Mood must be 60 characters or fewer.");
}
