import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
const home = readFileSync("src/routes/index.tsx", "utf8");
const library = readFileSync("src/routes/library.tsx", "utf8");
const generator = readFileSync("src/routes/generate.tsx", "utf8");
describe("PB-007 Follow-up II route contracts", () => {
  it("keeps continuation and exact deep links", () => {
    for (const token of [
      "resolveHomeCreatorState",
      "const primary = items[0]",
      "const secondary = items.slice(1)",
      "project: item.id",
      "universe: item.id",
      "map: item.id",
      "wall: item.id",
      'view: "projects"',
      'useFeatureAccess("ai_generator")',
      "openTrackSubmission",
      'state.kind === "verified-empty"',
      'state.kind === "degraded"',
    ])
      expect(home).toContain(token);
  });
  it("accepts a typed Projects view without changing the default", () => {
    for (const token of [
      'type LibraryView = "all" | "projects" | "analyses"',
      "view: requestedView",
      'requestedView ?? "all"',
      "projectSelection={projectSelection}",
    ])
      expect(library).toContain(token);
  });
  it("isolates fresh session drafts, jobs and handoffs", () => {
    for (const token of [
      'start: z.enum(["new"]).optional()',
      "session: z.string().uuid().optional()",
      "generator:fresh:",
      "pb:generation-job:fresh:",
      "if (freshSession) return;",
      "window.localStorage.getItem(jobStorageKey)",
      "window.localStorage.setItem(jobStorageKey, id)",
      "window.localStorage.removeItem(jobStorageKey)",
      "if (freshSession) throw err;",
      '"generator:new"',
    ])
      expect(generator).toContain(token);
  });
});
