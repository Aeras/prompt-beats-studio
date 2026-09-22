import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Visual Arrangement Batch 3 UI", () => {
  test("desktop reorder uses dnd-kit with stable section IDs and keyboard coordinates", async () => {
    const visual = await source("src/components/promptbeats/VisualSongArrangement.tsx");

    expect(visual).toContain('from "@dnd-kit/core"');
    expect(visual).toContain('from "@dnd-kit/sortable"');
    expect(visual).toContain("KeyboardSensor");
    expect(visual).toContain("sortableKeyboardCoordinates");
    expect(visual).toContain("items={sections.map((section) => section.sectionId)}");
    expect(visual).toContain("commitMove(String(active.id), overIndex)");
  });

  test("desktop cards expose a dedicated accessible drag handle", async () => {
    const card = await source("src/components/promptbeats/ArrangementSectionCard.tsx");

    expect(card).toContain("dragHandleProps");
    expect(card).toContain('generator.arrangement.dragHandle');
    expect(card).toContain("GripVertical");
    expect(card).toContain("touch-none");
  });

  test("energy timeline renders both visual curve and non-color energy sequence", async () => {
    const timeline = await source("src/components/promptbeats/EnergyTimeline.tsx");

    expect(timeline).toContain("<polyline");
    expect(timeline).toContain('generator.arrangement.energySequence');
    expect(timeline).toContain('section.energy ?? "—"');
    expect(timeline).toContain('role="img"');
  });

  test("Song Structure keeps simple section tags separate from the Advanced arrangement", async () => {
    const generate = await source("src/routes/generate.tsx");

    expect(generate).toContain("showStructureTags");
    expect(generate).toContain("showArrangementAdvanced");
    expect(generate).toContain("addSimpleStructureSection");
    expect(generate).toContain('generator.arrangement.advanced');
    expect(generate).toContain("setShowStructureTags((value) => !value)");
    expect(generate).toContain("setShowArrangementAdvanced((value) => !value)");
  });

  test("mobile section editor keeps explicit Move Up and Move Down controls", async () => {
    const editor = await source("src/components/promptbeats/ArrangementSectionEditor.tsx");

    expect(editor).toContain('generator.arrangement.moveUp');
    expect(editor).toContain('generator.arrangement.moveDown');
    expect(editor).toContain("onMove(section.sectionId, index - 1)");
    expect(editor).toContain("onMove(section.sectionId, index + 1)");
  });
});
