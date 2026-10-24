import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const lock = readFileSync(new URL("../../bun.lock", import.meta.url), "utf8");

// Inspect every locked copy, not only the hoisted node_modules version.
// Separate brace-expansion majors retain their consumers' original API contracts.
const patchedVersions = [
  { name: "zod", major: 4, minor: 6, patch: 6 },
  { name: "vite", major: 8, minor: 1, patch: 6 },
  { name: "shell-quote", major: 1, minor: 11, patch: 0 },
  { name: "launch-editor", major: 2, minor: 14, patch: 2 },
  { name: "brace-expansion", major: 1, minor: 1, patch: 21 },
  { name: "brace-expansion", major: 5, minor: 0, patch: 12 },
  { name: "nanoid", major: 3, minor: 3, patch: 18 },
  { name: "source-map-js", major: 1, minor: 2, patch: 2 },
];

describe("PB-AUD-020 compatible dependency security floors", () => {
  test("no vulnerable Zod 3 package remains in the lockfile", () => {
    expect(lock).not.toMatch(/\["zod@3\./);
  });
  test("the retired Drizzle loader and its esbuild dependency are absent", () => {
    expect(lock).not.toMatch(/\["(?:drizzle-kit|drizzle-orm|@esbuild-kit\/[^@"]+|esbuild)@/);
  });
  for (const { name, major, minor, patch } of patchedVersions) {
    test(`${name} ${major}.x has no pre-patch locked copies`, () => {
      const copies = [
        ...lock.matchAll(new RegExp(`\\["${name}@(${major})\\.(\\d+)\\.(\\d+)"`, "g")),
      ];
      expect(copies.length).toBeGreaterThan(0);
      for (const copy of copies) {
        const installedMinor = Number(copy[2]);
        const installedPatch = Number(copy[3]);
        expect(
          installedMinor > minor || (installedMinor === minor && installedPatch >= patch),
        ).toBe(true);
      }
    });
  }
});
