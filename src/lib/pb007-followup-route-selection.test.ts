import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function source(route: string) {
  return (await readFile(new URL(`../routes/${route}.tsx`, import.meta.url), "utf8"))
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ");
}

describe("PB-007 exact workspace URL selection", () => {
  test("Library preserves explicit Project identity and clears it only intentionally", async () => {
    const route = await source("library");
    expect(route).toContain("project?: string");
    expect(route).toContain('preserveExplicitObjectSearch(search["project"])');
    expect(route).toContain("parseExplicitObjectSelection(projectSearch)");
    expect(route).toContain('projectSelection.mode === "valid" ? projectSelection.id : null');
    expect(route).toContain(
      'search: id === null ? { tab: "prompts" } : { tab: "prompts", project: id }',
    );
    expect(route).toContain(
      "if (deleteProjectDialog.id === openProjectId) await setOpenProjectId(null)",
    );
    expect(route).toContain('if (projectSelection.mode !== "absent" && !openProject)');
    expect(route).toContain('projectSelection.mode === "absent" && (view === "all"');
    expect(route).toContain("search: { tab: item }");
    expect(route).not.toMatch(/\[openProjectId,\s*setOpenProjectId\]\s*=\s*useState/);
    expect(route).not.toMatch(/projects\[0\]|projects\.at\(0\)/);
  });

  test("Universe uses only its explicit identity and rejects archived/unavailable results", async () => {
    const route = await source("song-universe");
    expect(route).toContain("universe?: string");
    expect(route).toContain('preserveExplicitObjectSearch(search["universe"])');
    expect(route).toContain("parseExplicitObjectSelection(universe)");
    expect(route).toContain('selection.mode === "valid" ? selection.id : null');
    expect(route).toContain("search: { universe: id }");
    expect(route).toContain("await selectUniverse(result.universe.id)");
    expect(route).toContain('navigate({ to: "/song-universe", search: {} })');
    expect(route).toContain('selection.mode === "invalid"');
    expect(route).toContain("selected.data?.universe.id !== selectedId");
    expect(route).toContain('selected.data?.universe.status === "archived"');
    expect(route).not.toContain("setSelectedId");
    expect(route).not.toMatch(/universes\[0\]|universes\?\.\[0\]/);
  });

  for (const [routeName, param, listName, firstName, selectedId, selectFn, createId] of [
    [
      "story-map",
      "map",
      "mapsQuery.data?.storyMaps",
      "firstMap",
      "selectedId",
      "selectMap",
      "result.storyMap.id",
    ],
    [
      "inspiration-wall",
      "wall",
      "walls.data?.walls",
      "firstWall",
      "selectedWallId",
      "selectWall",
      "created.wall.id",
    ],
  ] as const) {
    test(`${routeName} bounds first-item normalization to absent selection and suppresses deletion fallback`, async () => {
      const route = await source(routeName);
      expect(route).toContain(`${param}?: string`);
      expect(route).toContain(`preserveExplicitObjectSearch(search["${param}"])`);
      expect(route).toContain("parseExplicitObjectSelection(");
      expect(route).toContain(
        `const ${selectedId} = selection.mode === "valid" ? selection.id : null`,
      );
      const genericEffect = route.slice(
        route.indexOf('if (selection.mode !== "absent")'),
        route.indexOf('if (selection.mode !== "absent")') + 650,
      );
      expect(genericEffect).toMatch(/selection\.mode !== "absent".*return;/);
      expect(genericEffect).toContain(`const ${firstName} = ${listName}?.[0]`);
      expect(genericEffect).toContain(
        "user && access.allowed && !suppressGenericSelection.current",
      );
      expect(genericEffect).toContain(`search: { ${param}: ${firstName}.id }, replace: true`);
      expect(route).toContain(`search: { ${param}: id }`);
      expect(route).toContain(`await ${selectFn}(${createId})`);
      expect(route).toContain(`void ${selectFn}(item.id)`);
      expect(route).toContain(
        `suppressGenericSelection.current = true; await navigate({ to: "/${routeName}", search: {} })`,
      );
      expect(route).toContain('selection.mode === "invalid"');
      expect(route).toContain("is unavailable.");
      expect(route).toContain(`id === ${selectedId}`);
      expect(route).not.toMatch(/setSelected(?:Wall)?Id/);
    });
  }

  test("all routes reuse the canonical parser and typed router navigation", async () => {
    for (const name of ["library", "song-universe", "story-map", "inspiration-wall"]) {
      const route = await source(name);
      expect(route).toContain('from "@/lib/pb007-followup-deep-link"');
      expect(route).toContain(`createFileRoute("/${name}")`);
      expect(route).not.toMatch(/window\.location(?:\.|\s*=)/);
      expect(route).not.toContain("UUID_PATTERN");
    }
  });
});
