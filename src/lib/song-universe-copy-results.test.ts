import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Song Universe AI result copy actions", () => {
  test("continuity and Project Fit expose copy-all actions", async () => {
    const code = await source("src/routes/song-universe.tsx");

    expect(code).toContain(
      'const [copiedResult, setCopiedResult] = useState<"continuity" | "fit" | null>(null)',
    );
    expect(code).toContain("navigator.clipboard.writeText(value)");
    expect(code).toContain("copyContinuity");
    expect(code).toContain("copyFit");
    expect(code).toContain('"Αντιγραφή όλων"');
    expect(code).toContain('"Copy all"');
  });

  test("continuity copy includes every structured analysis section", async () => {
    const code = await source("src/routes/song-universe.tsx");

    for (const field of [
      "summary",
      "strongContinuity",
      "possibleRepetition",
      "underusedDirections",
      "diversityNotes",
      "motifUsage",
      "intentionalOutliers",
      "opportunities",
    ]) {
      expect(code).toContain(`analysis.${field}`);
    }
  });

  test("Project Fit copy includes project name, matches, differences and interpretation", async () => {
    const code = await source("src/routes/song-universe.tsx");

    expect(code).toContain("fit.projectName");
    expect(code).toContain("fit.strongMatches");
    expect(code).toContain("fit.differences");
    expect(code).toContain("fit.interpretation");
  });
});
