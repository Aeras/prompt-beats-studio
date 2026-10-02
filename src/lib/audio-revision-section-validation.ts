import type {
  AudioRevisionIntentProposal,
  UnresolvedRevisionSuggestion,
} from "@/lib/audio-revision-intent.shared";

export const AUDIO_REVISION_SECTION_CONFIDENCE_MIN = 0.7;

export type ResolvedRevisionSectionSuggestion = {
  structureIndex: number;
  sectionLabel: string;
  occurrence: number;
  instruction: string;
  confidence: number;
};

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function occurrenceAt(structure: string[], index: number) {
  const label = normalizeLabel(structure[index] ?? "");
  let occurrence = 0;
  for (let i = 0; i <= index; i += 1) {
    if (normalizeLabel(structure[i] ?? "") === label) occurrence += 1;
  }
  return occurrence;
}

export function validateAudioRevisionSectionSuggestions(
  structure: string[],
  proposal: AudioRevisionIntentProposal,
) {
  const resolved: ResolvedRevisionSectionSuggestion[] = [];
  const unresolved: UnresolvedRevisionSuggestion[] = [];

  for (const suggestion of proposal.sectionSuggestions) {
    if (suggestion.structureIndex == null) {
      unresolved.push({
        structureIndex: null,
        modelLabel: suggestion.sectionLabel,
        instruction: suggestion.instruction,
        confidence: suggestion.confidence,
        reason: "missing_index",
      });
      continue;
    }

    const canonicalLabel = structure[suggestion.structureIndex];
    if (canonicalLabel == null) {
      unresolved.push({
        structureIndex: suggestion.structureIndex,
        modelLabel: suggestion.sectionLabel,
        instruction: suggestion.instruction,
        confidence: suggestion.confidence,
        reason: "out_of_range",
      });
      continue;
    }

    if (suggestion.confidence < AUDIO_REVISION_SECTION_CONFIDENCE_MIN) {
      unresolved.push({
        structureIndex: suggestion.structureIndex,
        modelLabel: suggestion.sectionLabel,
        instruction: suggestion.instruction,
        confidence: suggestion.confidence,
        reason: "low_confidence",
      });
      continue;
    }

    if (
      !suggestion.sectionLabel ||
      normalizeLabel(suggestion.sectionLabel) !== normalizeLabel(canonicalLabel)
    ) {
      unresolved.push({
        structureIndex: suggestion.structureIndex,
        modelLabel: suggestion.sectionLabel,
        instruction: suggestion.instruction,
        confidence: suggestion.confidence,
        reason: "label_mismatch",
      });
      continue;
    }

    resolved.push({
      structureIndex: suggestion.structureIndex,
      sectionLabel: canonicalLabel,
      occurrence: occurrenceAt(structure, suggestion.structureIndex),
      instruction: suggestion.instruction,
      confidence: suggestion.confidence,
    });
  }

  return { resolved, unresolved };
}
