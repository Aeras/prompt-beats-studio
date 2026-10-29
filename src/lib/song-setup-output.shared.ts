import { z } from "zod";

const fields = {
  theme: "Theme",
  musicStyle: "Music Style",
  mood: "Mood",
  instruments: "Instruments",
  bpm: "BPM",
  songStructure: "Song Structure",
  productionStyle: "Production Style",
  additionalInstructions: "Additional Instructions",
  language: "Language",
} as const;
type Failure = "incomplete" | "invalid_json" | "invalid_schema" | "invalid_bpm";
const fail = (code: Failure): never => {
  throw new Error(`song_setup_output:${code}`);
};

/** One known complete wire dialect only; no missing-value repair or fuzzy aliases. */
export function parseSongSetupOutput<T extends { bpm: string }>(
  receipt: { text: string; stopReason: string | null },
  validate: (raw: unknown) => T,
): T {
  if (receipt.stopReason !== "end_turn") fail("incomplete");
  let raw: unknown;
  try {
    raw = JSON.parse(receipt.text);
  } catch {
    return fail("invalid_json");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("invalid_schema");
  const object = raw as Record<string, unknown>;
  const keys = Object.keys(object);
  const canonical = Object.keys(fields);
  const labels = Object.values(fields);
  if (keys.length !== canonical.length) return fail("invalid_schema");
  if (keys.every((k) => labels.includes(k as (typeof labels)[number]))) {
    raw = Object.fromEntries(
      Object.entries(fields).map(([key, label]) => {
        const value = object[label];
        // Only this complete known dialect accepts lists/numeric BPM. Preserve
        // every supplied item; never fill missing or repair invalid values.
        if (["musicStyle", "mood", "instruments"].includes(key) && Array.isArray(value)) {
          if (!value.length || value.some((v) => typeof v !== "string" || !v.trim()))
            return fail("invalid_schema");
          return [key, value.join(", ")];
        }
        if (key === "bpm" && typeof value === "number") {
          if (!Number.isInteger(value)) return fail("invalid_bpm");
          return [key, String(value)];
        }
        return [key, value];
      }),
    );
  } else if (!keys.every((k) => canonical.includes(k))) return fail("invalid_schema");
  let setup: T;
  try {
    setup = validate(raw);
  } catch (error) {
    if (error instanceof z.ZodError) return fail("invalid_schema");
    throw error;
  }
  if (
    setup.bpm !== "Auto" &&
    !(/^\d{2,3}$/.test(setup.bpm) && Number(setup.bpm) >= 40 && Number(setup.bpm) <= 260)
  )
    return fail("invalid_bpm");
  return setup;
}

export const songSetupOutputCopy = {
  en: {
    incomplete:
      "The AI response was incomplete. No setup was applied. A new attempt may incur additional cost.",
    invalid_json: "The AI response was not valid JSON. No setup was applied.",
    invalid_schema:
      "The AI did not return all nine setup fields in the required format. No setup was applied.",
    invalid_bpm: "The AI returned an invalid tempo. No setup was applied.",
  },
  el: {
    incomplete:
      "Η απόκριση AI ήταν ημιτελής. Δεν εφαρμόστηκε ρύθμιση. Μια νέα προσπάθεια μπορεί να έχει επιπλέον κόστος.",
    invalid_json: "Η απόκριση AI δεν ήταν έγκυρο JSON. Δεν εφαρμόστηκε ρύθμιση.",
    invalid_schema:
      "Το AI δεν επέστρεψε και τα εννέα πεδία στην απαιτούμενη μορφή. Δεν εφαρμόστηκε ρύθμιση.",
    invalid_bpm: "Το AI επέστρεψε μη έγκυρο τέμπο. Δεν εφαρμόστηκε ρύθμιση.",
  },
} as const;
export function songSetupOutputMessage(error: unknown, language: "en" | "el"): string | null {
  const message = error instanceof Error ? error.message : "";
  const code = message.startsWith("song_setup_output:") ? message.slice(18) : "";
  return Object.hasOwn(songSetupOutputCopy[language], code)
    ? songSetupOutputCopy[language][code as Failure]
    : null;
}
