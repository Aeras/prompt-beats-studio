import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import source from "../../research/atlas-v4-merged-evidence-20261027.json";
import template from "../../research/atlas-v4-636-evidence-tasks.json";
import manifest from "../../research/atlas-v4-merged-evidence-20261027.manifest.json";
import library from "../data/song-atlas/v4/library.json";
import {
  ATLAS_RESEARCH_SHA,
  atlasResearchTaskSchema,
  atlasResearchCitationSchema,
  validateAtlasResearch,
  projectAtlasResearchProfile,
} from "./atlas-research";
import { assertAtlasResearchFingerprint, readAtlasResearchProfile } from "./atlas-research.server";
const validate = (input: unknown = source) => validateAtlasResearch(input, template, library);
describe("Atlas research integrity and task quarantine", () => {
  test("preserves exact archive bytes and pinned dependencies", () => {
    for (const file of manifest.files) {
      const b = readFileSync(new URL("../../" + file.path, import.meta.url));
      expect(b.length).toBe(file.bytes);
      expect(createHash("sha256").update(b).digest("hex")).toBe(file.sha256);
    }
    expect(manifest.files[0]!.sha256).toBe(ATLAS_RESEARCH_SHA);
    const templateBytes = readFileSync(
      new URL("../../research/atlas-v4-636-evidence-tasks.json", import.meta.url),
    );
    expect(templateBytes.length).toBe(894739);
    expect(templateBytes.includes(Buffer.from("\r\n"))).toBe(false);
    expect(createHash("sha256").update(templateBytes).digest("hex")).toBe(
      "296a7af7eaa8dce4b959fe196ec1a4b6b09ec380b40141c4c57baf15ef3ea48f",
    );
    expect(() => assertAtlasResearchFingerprint(source)).not.toThrow();
    const changed = structuredClone(source);
    changed.tasks[0]!.validityScope += "changed";
    expect(() => assertAtlasResearchFingerprint(changed)).toThrow("fingerprint");
  });
  test("ingests 636 ordered unique identities, original counts and 18 explicit quarantines", () => {
    const before = JSON.stringify(source);
    const d = validate();
    expect(d.tasks.map((t) => t.gapId)).toEqual(template.tasks.map((t) => t.gapId));
    expect(new Set(d.tasks.map((t) => t.gapId)).size).toBe(636);
    expect(d.validation.originalDecisionCounts).toEqual({
      source_supported_bounded: 396,
      supported_no_universal_rule: 20,
      insufficient_evidence: 220,
      not_applicable_with_reason: 0,
    });
    expect(d.validation.eligibleTaskCount).toBe(618);
    expect(d.validation.quarantinedGapIds).toHaveLength(18);
    expect(d.validation).toEqual(manifest.validation);
    d.tasks.forEach((t, i) => {
      expect(library.unresolvedEvidence.find((g) => g.id === t.gapId)).toMatchObject({
        profileId: t.profileId,
        dimension: t.dimension,
      });
      expect(t.originalResearchDecision).toBe(source.tasks[i]!.researchDecision);
      if (t.quarantined) {
        expect(t.researchDecision).toBeNull();
        expect(t.suggestedStatementEl).toBeNull();
        expect(t.suggestedStatementEn).toBeNull();
        expect(t.citations).toEqual([]);
        expect(t.validationIssues.length).toBeGreaterThan(0);
      } else {
        expect(t.validationIssues).toEqual([]);
        expect(t.citations).toEqual(source.tasks[i]!.citations);
        expect(t.suggestedStatementEn).toBe(source.tasks[i]!.suggestedStatementEn);
      }
    });
    expect(JSON.stringify(source)).toBe(before);
  });
  test("unknown years, author arrays and background citations remain explicit and unchanged", () => {
    const d = validate();
    for (const index of [9, 12, 47, 49, 52, 53, 251, 256, 263, 268]) {
      const task = d.tasks[index]!;
      expect(task.quarantined).toBe(false);
      expect(task.citations).toEqual(source.tasks[index]!.citations);
    }
    expect(d.tasks[9]!.citations[1]!.year).toBeNull();
    expect(Array.isArray(d.tasks[251]!.citations[0]!.authors)).toBe(true);
    expect(d.tasks[47]!.researchDecision).toBe("insufficient_evidence");
    expect(d.tasks[47]!.suggestedStatementEl).toBeNull();
    expect(d.tasks[47]!.citations.length).toBeGreaterThan(0);
  });
  test("quarantine distinguishes 12 noncanonical access, 2 empty authors and 4 string years", () => {
    const d = validate();
    const issues = d.tasks.flatMap((t) => t.validationIssues);
    expect(issues.filter((i) => i.includes(".accessedEvidence:"))).toHaveLength(12);
    expect(issues.filter((i) => i.includes(".authors:"))).toHaveLength(2);
    expect(issues.filter((i) => i.includes(".year:"))).toHaveLength(4);
    expect(d.tasks[404]!.quarantined).toBe(true);
    expect(source.tasks[404]!.citations[0]!.accessedEvidence).toBe(
      "web search indexed original album credit excerpt",
    );
    expect(d.tasks[404]!.citations).toEqual([]);
  });
  test("profile read works despite unrelated quarantines and clones selected data only", () => {
    const p = readAtlasResearchProfile("ru.protyazhnaya");
    expect(p.executable).toBe(false);
    expect(p.sourceSha).toBe(ATLAS_RESEARCH_SHA);
    expect(p.tasks.map((t) => t.gapId)).toEqual(
      template.tasks.filter((t) => t.profileId === p.profileId).map((t) => t.gapId),
    );
    const via = readAtlasResearchProfile("ru.via");
    const author = via.tasks.flatMap((t) => t.citations).find((c) => Array.isArray(c.authors))!;
    (author.authors as string[]).push("mutation");
    expect(JSON.stringify(readAtlasResearchProfile("ru.via"))).not.toContain("mutation");
    expect(readAtlasResearchProfile("ru.social_rock").tasks.some((t) => t.quarantined)).toBe(false);
    expect(readAtlasResearchProfile("ru.social_rock").correctionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(() => readAtlasResearchProfile("unknown")).toThrow("Unknown");
    const d = validate();
    expect(Object.keys(projectAtlasResearchProfile(d, "ru.protyazhnaya")).sort()).toEqual(
      ["profileId", "sourceSha", "executable", "tasks"].sort(),
    );
  });
  const fatal: [string, (d: typeof source) => void][] = [
    [
      "missing task",
      (d) => {
        d.tasks.pop();
      },
    ],
    [
      "duplicate ID",
      (d) => {
        d.tasks[1]!.gapId = d.tasks[0]!.gapId;
      },
    ],
    [
      "order",
      (d) => {
        [d.tasks[0], d.tasks[1]] = [d.tasks[1]!, d.tasks[0]!];
      },
    ],
    [
      "profile",
      (d) => {
        d.tasks[0]!.profileId = "unknown";
      },
    ],
    [
      "dimension",
      (d) => {
        d.tasks[0]!.dimension = "rhythm";
      },
    ],
    [
      "context",
      (d) => {
        d.tasks[0]!.existingSummaryEl = "changed";
      },
    ],
    [
      "metadata",
      (d) => {
        d.notice = "changed";
      },
    ],
    [
      "missing identity",
      (d) => {
        Reflect.deleteProperty(d.tasks[0]!, "profileId");
      },
    ],
    [
      "approval",
      (d) => {
        d.tasks[0]!.musicologistReview = "approved";
      },
    ],
    [
      "candidate",
      (d) => {
        Object.assign(d.tasks[0]!, { creativeTechniqueCandidate: {} });
      },
    ],
    [
      "counts",
      (d) => {
        d.tasks[0]!.researchDecision = "supported_no_universal_rule";
      },
    ],
    [
      "unknown root",
      (d) => {
        Object.assign(d, { executable: true });
      },
    ],
  ];
  for (const [name, mutate] of fatal)
    test("fails whole envelope on " + name, () => {
      const d = structuredClone(source);
      mutate(d);
      expect(() => validate(d)).toThrow();
    });
  test("missing/duplicate V4 gaps fail closed", () => {
    const v = structuredClone(library);
    v.unresolvedEvidence.pop();
    expect(() => validateAtlasResearch(source, template, v)).toThrow();
    v.unresolvedEvidence.push(v.unresolvedEvidence[0]!);
    expect(() => validateAtlasResearch(source, template, v)).toThrow();
  });
  test("strict individual validation quarantines invalid answers without manufacturing evidence", () => {
    for (const change of [
      { citations: [] },
      { validityScope: " " },
      { suggestedStatementEn: " " },
      { executable: true },
      { citations: [{ ...source.tasks[0]!.citations[0], sourceType: "website" }] },
      { citations: [{ ...source.tasks[0]!.citations[0], approved: true }] },
    ]) {
      const d = structuredClone(source);
      Object.assign(d.tasks[0]!, change);
      expect(atlasResearchTaskSchema.safeParse(d.tasks[0]).success).toBe(false);
      const ingested = validate(d);
      expect(ingested.tasks[0]!.quarantined).toBe(true);
      expect(ingested.tasks[0]!.citations).toEqual([]);
      expect(ingested.tasks[1]!.quarantined).toBe(false);
    }
    const d = structuredClone(source);
    d.tasks[47]!.suggestedStatementEn = "Unsupported assertion";
    expect(validate(d).tasks[47]!.quarantined).toBe(true);
  });
  test("citation contract is exact, noncoercing and safe", () => {
    const c = source.tasks[0]!.citations[0]!;
    for (const authors of ["Author", ["Author"], ["First", "Second"]])
      expect(atlasResearchCitationSchema.parse({ ...c, authors, year: null }).authors).toEqual(
        authors,
      );
    for (const authors of ["", [], [" "]])
      expect(atlasResearchCitationSchema.safeParse({ ...c, authors }).success).toBe(false);
    for (const year of ["2016", 0, -1])
      expect(atlasResearchCitationSchema.safeParse({ ...c, year }).success).toBe(false);
    for (const url of ["javascript:alert(1)", "https://secret@example.org"])
      expect(atlasResearchCitationSchema.safeParse({ ...c, url }).success).toBe(false);
    expect(atlasResearchCitationSchema.parse({ ...c, url: "https://example.org/?x=1#p" }).url).toBe(
      "https://example.org/?x=1#p",
    );
  });
  test("every profile projection exposes only inert review fields and exact citation URLs", () => {
    const d = validate();
    const allowed = [
      "gapId",
      "dimension",
      "researchDecision",
      "originalResearchDecision",
      "quarantined",
      "validationIssues",
      "suggestedStatementEl",
      "suggestedStatementEn",
      "validityScope",
      "exceptionsAndCounterexamples",
      "citations",
    ].sort();
    for (const profileId of new Set(source.tasks.map((t) => t.profileId))) {
      const p = projectAtlasResearchProfile(d, profileId);
      expect(p.executable).toBe(false);
      for (const task of p.tasks) {
        expect(Object.keys(task).sort()).toEqual(allowed);
        const original = source.tasks.find((t) => t.gapId === task.gapId)!;
        if (!task.quarantined) {
          expect(task.citations.map((c) => c.url)).toEqual(original.citations.map((c) => c.url));
          expect(task.citations.map((c) => c.accessedEvidence)).toEqual(
            original.citations.map((c) => c.accessedEvidence),
          );
        } else {
          expect(task.researchDecision).toBeNull();
          expect(task.citations).toEqual([]);
        }
      }
    }
  });
  test("citation schema rejects missing/extra keys and noncanonical access without coercion", () => {
    const original = source.tasks[0]!.citations[0]!;
    for (const key of Object.keys(original)) {
      const missing = { ...original };
      Reflect.deleteProperty(missing, key);
      expect(atlasResearchCitationSchema.safeParse(missing).success).toBe(false);
    }
    expect(atlasResearchCitationSchema.safeParse({ ...original, approved: false }).success).toBe(
      false,
    );
    for (const accessedEvidence of ["search_extract", "full webpage, interview body", ""]) {
      expect(atlasResearchCitationSchema.safeParse({ ...original, accessedEvidence }).success).toBe(
        false,
      );
    }
    for (const key of ["title", "locator", "supports"]) {
      expect(atlasResearchCitationSchema.safeParse({ ...original, [key]: " " }).success).toBe(
        false,
      );
    }
  });
  test("shared client contract has no Node/server/archive imports", () => {
    const shared = readFileSync(new URL("./atlas-research.ts", import.meta.url), "utf8");
    expect(shared).not.toContain('from "node:');
    expect(shared).not.toContain('.server"');
    expect(shared).not.toContain('from "../../research/');
  });
});
