import type { SongBlueprintSection } from "@/lib/song-blueprint.shared";

export type SongEnergyLevel = 1 | 2 | 3 | 4 | 5;

export type ArrangementSection = {
  sectionId: string;
  structureIndex: number;
  sectionType: string;
  occurrence: number;
  instruction: string;
  energy: SongEnergyLevel | null;
};

type SectionIdFactory = () => string;

const defaultSectionIdFactory: SectionIdFactory = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `section-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

function nextUniqueSectionId(
  usedIds: Set<string>,
  idFactory: SectionIdFactory,
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = idFactory().trim();
    if (candidate && !usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
  }
  throw new Error("Could not create a unique song section id.");
}

export function recalculateArrangementMetadata(
  sections: ArrangementSection[],
): ArrangementSection[] {
  const seen = new Map<string, number>();
  return sections.slice(0, 40).map((section, structureIndex) => {
    const normalizedType = section.sectionType.trim().toLowerCase();
    const occurrence = (seen.get(normalizedType) ?? 0) + 1;
    seen.set(normalizedType, occurrence);
    return {
      ...section,
      structureIndex,
      occurrence,
    };
  });
}

export function normalizeSongArrangement(
  structure: string[],
  storedBlueprint: SongBlueprintSection[] = [],
  idFactory: SectionIdFactory = defaultSectionIdFactory,
): ArrangementSection[] {
  const usedIds = new Set<string>();
  const normalized = structure.slice(0, 40).map((sectionType, structureIndex) => {
    const stored = storedBlueprint.find(
      (item) =>
        item.structureIndex === structureIndex &&
        item.sectionType === sectionType,
    );
    const storedId = stored?.sectionId?.trim();
    let sectionId: string;
    if (storedId && !usedIds.has(storedId)) {
      usedIds.add(storedId);
      sectionId = storedId;
    } else {
      sectionId = nextUniqueSectionId(usedIds, idFactory);
    }

    return {
      sectionId,
      structureIndex,
      sectionType,
      occurrence: 1,
      instruction: stored?.instruction ?? "",
      energy: stored?.energy ?? null,
    };
  });

  return recalculateArrangementMetadata(normalized);
}

export function arrangementToSongStructure(
  sections: ArrangementSection[],
): string[] {
  return sections.map((section) => section.sectionType);
}

export function arrangementToSongBlueprint(
  sections: ArrangementSection[],
): SongBlueprintSection[] {
  return recalculateArrangementMetadata(sections).map((section) => ({
    sectionId: section.sectionId,
    structureIndex: section.structureIndex,
    sectionType: section.sectionType,
    occurrence: section.occurrence,
    instruction: section.instruction,
    energy: section.energy,
  }));
}

export function moveArrangementSection(
  sections: ArrangementSection[],
  sectionId: string,
  toIndex: number,
): ArrangementSection[] {
  const fromIndex = sections.findIndex((section) => section.sectionId === sectionId);
  if (fromIndex < 0 || sections.length < 2) return sections;

  const targetIndex = Math.max(0, Math.min(toIndex, sections.length - 1));
  if (targetIndex === fromIndex) return sections;

  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return sections;
  next.splice(targetIndex, 0, moved);
  return recalculateArrangementMetadata(next);
}

export function duplicateArrangementSection(
  sections: ArrangementSection[],
  sectionId: string,
  idFactory: SectionIdFactory = defaultSectionIdFactory,
): ArrangementSection[] {
  if (sections.length >= 40) return sections;
  const sourceIndex = sections.findIndex((section) => section.sectionId === sectionId);
  if (sourceIndex < 0) return sections;

  const source = sections[sourceIndex];
  if (!source) return sections;

  const usedIds = new Set(sections.map((section) => section.sectionId));
  const duplicate: ArrangementSection = {
    ...source,
    sectionId: nextUniqueSectionId(usedIds, idFactory),
  };
  const next = [...sections];
  next.splice(sourceIndex + 1, 0, duplicate);
  return recalculateArrangementMetadata(next);
}

export function removeArrangementSection(
  sections: ArrangementSection[],
  sectionId: string,
): ArrangementSection[] {
  if (!sections.some((section) => section.sectionId === sectionId)) return sections;
  return recalculateArrangementMetadata(
    sections.filter((section) => section.sectionId !== sectionId),
  );
}

export function appendArrangementSection(
  sections: ArrangementSection[],
  sectionType: string,
  idFactory: SectionIdFactory = defaultSectionIdFactory,
): ArrangementSection[] {
  if (sections.length >= 40) return sections;
  const trimmedType = sectionType.trim();
  if (!trimmedType) return sections;

  const usedIds = new Set(sections.map((section) => section.sectionId));
  return recalculateArrangementMetadata([
    ...sections,
    {
      sectionId: nextUniqueSectionId(usedIds, idFactory),
      structureIndex: sections.length,
      sectionType: trimmedType,
      occurrence: 1,
      instruction: "",
      energy: null,
    },
  ]);
}

export function updateArrangementInstruction(
  sections: ArrangementSection[],
  sectionId: string,
  instruction: string,
): ArrangementSection[] {
  return sections.map((section) =>
    section.sectionId === sectionId
      ? { ...section, instruction: instruction.slice(0, 800) }
      : section,
  );
}

export function updateArrangementEnergy(
  sections: ArrangementSection[],
  sectionId: string,
  energy: SongEnergyLevel | null,
): ArrangementSection[] {
  return sections.map((section) =>
    section.sectionId === sectionId
      ? { ...section, energy }
      : section,
  );
}

export function applyInstructionToAllRegularChoruses(
  sections: ArrangementSection[],
  instruction: string,
): ArrangementSection[] {
  return sections.map((section) =>
    section.sectionType === "Chorus"
      ? { ...section, instruction: instruction.slice(0, 800) }
      : section,
  );
}

export function applyEnergyToAllRegularChoruses(
  sections: ArrangementSection[],
  energy: SongEnergyLevel | null,
): ArrangementSection[] {
  return sections.map((section) =>
    section.sectionType === "Chorus"
      ? { ...section, energy }
      : section,
  );
}
