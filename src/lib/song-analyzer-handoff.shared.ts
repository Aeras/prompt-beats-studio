import { z } from "zod";
import { buildSongBlueprint } from "./song-blueprint.shared";

const text = z.string().trim().max(4000).optional();
/** Whitelist musical fields. Theme/language are deliberately not in this contract. */
const v2HandoffSchema = z.object({
  analyzerVersion: z.literal("v2"),
  musicStyle: text,
  mood: text,
  instruments: z.array(z.string().trim().min(1).max(1000)).max(30).optional(),
  songStructure: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  productionStyle: text,
  additionalInstructions: text,
  bpm: z
    .object({
      approximate: z.number().finite().min(20).max(300).nullable().optional(),
      rangeMin: z.number().finite().min(20).max(300).nullable().optional(),
      rangeMax: z.number().finite().min(20).max(300).nullable().optional(),
      confidence: z.enum(["high", "medium", "low"]),
    })
    .optional(),
});

export function analyzerV2GeneratorPatch(value: unknown) {
  const handoff = v2HandoffSchema.parse(value);
  const useful = (value: string | undefined) =>
    Boolean(
      value &&
      !/^(?:unknown|uncertain|unavailable|insufficient evidence|not (?:audible|available|enough|reliably)|cannot (?:determine|identify))\b/i.test(
        value,
      ),
    );
  const sections = handoff.songStructure;
  const structure =
    sections?.length && sections.every(useful) && sections.join(" → ").length <= 600
      ? sections
      : undefined;
  const instruments = handoff.instruments?.filter(useful);
  // No point estimate is invented from a low-confidence or ambiguous range.
  const bpm =
    handoff.bpm?.confidence !== "low" && handoff.bpm?.approximate != null
      ? Math.round(handoff.bpm.approximate)
      : undefined;
  return {
    ...(useful(handoff.musicStyle) ? { genres: [], customGenre: handoff.musicStyle! } : {}),
    ...(useful(handoff.mood) ? { moods: [], customMood: handoff.mood! } : {}),
    ...(instruments?.length ? { instruments: [], customInstruments: instruments.join(", ") } : {}),
    ...(structure ? { structure, songBlueprint: buildSongBlueprint(structure) } : {}),
    ...(useful(handoff.productionStyle)
      ? { production: handoff.productionStyle!.slice(0, 2000) }
      : {}),
    ...(useful(handoff.additionalInstructions)
      ? { instructions: handoff.additionalInstructions!.slice(0, 2000) }
      : {}),
    ...(bpm != null ? { bpm: "Custom", customBpm: String(bpm) } : {}),
  };
}
