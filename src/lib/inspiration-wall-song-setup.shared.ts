import { z } from "zod";

import {
  inspirationWallCreativeDirectionSchema,
  type InspirationWallCreativeDirection,
} from "@/lib/inspiration-wall.shared";

export const INSPIRATION_WALL_SONG_SETUP_HANDOFF_KEY = "pb:inspiration-wall-song-setup";

export const inspirationWallSongSetupHandoffSchema = z
  .object({
    version: z.literal(1),
    wallId: z.string().uuid(),
    wallTitle: z.string().trim().min(1).max(120),
    connectedProjectId: z.string().uuid().nullable(),
    direction: inspirationWallCreativeDirectionSchema,
  })
  .strict();

export type InspirationWallSongSetupHandoff = z.infer<typeof inspirationWallSongSetupHandoffSchema>;

const FIELD_LABELS: Record<keyof InspirationWallCreativeDirection, { en: string; el: string }> = {
  coreTheme: { en: "Core Theme", el: "Κεντρικό Θέμα" },
  moodPalette: { en: "Emotional / Mood Palette", el: "Συναισθηματική Παλέτα" },
  visualLanguage: { en: "Visual Language", el: "Οπτική Γλώσσα" },
  narrativeAngle: { en: "Possible Narrative Angle", el: "Πιθανή Αφηγηματική Κατεύθυνση" },
  musicalCharacter: { en: "Musical Character", el: "Μουσικός Χαρακτήρας" },
  productionTexture: { en: "Production Texture", el: "Υφή Παραγωγής" },
  vocalPersonality: { en: "Vocal Personality", el: "Φωνητική Προσωπικότητα" },
  lyricalKeywords: { en: "Lyrical Keywords / Motifs", el: "Λυρικές Λέξεις / Μοτίβα" },
  thingsToAvoid: { en: "Things to Avoid", el: "Τι να Αποφευχθεί" },
  contradictions: { en: "Contradictions / Tensions", el: "Αντιφάσεις / Εντάσεις" },
  openQuestions: { en: "Open Questions / Uncertainties", el: "Ανοιχτά Ερωτήματα / Αβεβαιότητες" },
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as Array<keyof InspirationWallCreativeDirection>;

export function buildInspirationWallSongSetupDescription(
  direction: InspirationWallCreativeDirection,
  language: "en" | "el",
) {
  const lines: string[] = [];
  for (const key of FIELD_ORDER) {
    const value = direction[key];
    const text = Array.isArray(value)
      ? value
          .map((item) => item.trim())
          .filter(Boolean)
          .join(", ")
      : typeof value === "string"
        ? value.trim()
        : "";
    if (!text) continue;
    lines.push(`${FIELD_LABELS[key][language]}: ${text}`);
  }
  return lines.join("\n");
}
