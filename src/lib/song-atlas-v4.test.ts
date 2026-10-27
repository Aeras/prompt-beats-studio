import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import library from "../data/song-atlas/v4/library.json";
import original from "../data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json";
import { V4_DIMENSIONS, projectAtlasV4ForReview, validateAtlasV4 } from "./song-atlas-v4";

const clone = () => structuredClone(library);
describe("V4 inert editorial package", () => {
  test("covers every stable RC1 identity, technique and source without changing original bytes", () => {
    const d = validateAtlasV4(library);
    expect(d.profiles.map((p) => p.id)).toEqual(original.profiles.map((p) => p.id));
    expect(d.techniques.filter((t) => t.origin === "rc1").map((t) => t.id)).toEqual(
      original.profiles.flatMap((p) => p.creative_techniques.map((t) => t.id)),
    );
    expect(d.techniques.filter((t) => t.origin === "v4")).toHaveLength(58);
    expect(d.sources.slice(0, 97).map((s) => s.id)).toEqual(original.sources.map((s) => s.id));
    expect(
      createHash("sha256")
        .update(
          readFileSync(
            new URL("../data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json", import.meta.url),
          ),
        )
        .digest("hex"),
    ).toBe(d.source.rc1Sha256);
    expect(d.excludedCandidates).toHaveLength(14);
  });
  test("each profile covers all twelve dimensions with evidence or a named unknown", () => {
    for (const p of validateAtlasV4(library).profiles) {
      expect(new Set(p.knowledge.map((k) => k.dimension))).toEqual(new Set(V4_DIMENSIONS));
      for (const k of p.knowledge)
        expect(k.status === "specific_unknown" ? !!k.unknown : k.evidenceIds.length > 0).toBe(true);
    }
  });
  test("EL/EN projection preserves Russian/Latin names and never exposes instructions", () => {
    for (const locale of ["el", "en"] as const) {
      const p = projectAtlasV4ForReview(library, locale);
      expect(p.executable).toBe(false);
      expect(p.cards).toHaveLength(58);
      expect(JSON.stringify(p)).not.toContain('"instruction"');
      expect(p.cards[0]!.lang).toBe(locale);
      expect(p.cards[0]!.nameRu).toBe(original.profiles[0]!.name_ru);
    }
    expect(projectAtlasV4ForReview(library, "el").cards[0]!.name).not.toBe(
      projectAtlasV4ForReview(library, "en").cards[0]!.name,
    );
    for (const t of library.techniques) {
      expect(t.instruction.el).toBeTruthy();
      expect(t.instruction.en).toBeTruthy();
      expect(t.instruction.review).toBe("draft_translation_requires_independent_review");
    }
  });
  test("eras are explicitly scoped, never a publication-year inference", () => {
    const d = validateAtlasV4(library);
    expect(d.eras.map((e) => e.id)).toEqual(["1980s", "1990s", "2000s", "contemporary"]);
    expect(d.profiles.find((p) => p.id === "ru.odessa_song")!.eraRelations).toEqual([]);
    expect(d.profiles.find((p) => p.id === "ru.hyperpop")!.eraRelations[0]!.eraId).toBe(
      "contemporary",
    );
    expect(d.profiles.find((p) => p.id === "ru.rap_00")!.eraRelations).not.toContainEqual(
      expect.objectContaining({ eraId: "contemporary" }),
    );
  });
  const mutations: [string, (d: ReturnType<typeof clone>) => void][] = [
    [
      "duplicate profile",
      (d) => {
        d.profiles[1]!.id = d.profiles[0]!.id;
      },
    ],
    [
      "duplicate technique",
      (d) => {
        d.techniques[1]!.id = d.techniques[0]!.id;
      },
    ],
    [
      "missing profile",
      (d) => {
        d.profiles.pop();
      },
    ],
    [
      "unknown technique",
      (d) => {
        d.profiles[0]!.techniqueIds.push("missing");
      },
    ],
    [
      "cross-profile technique",
      (d) => {
        d.profiles[0]!.techniqueIds.push(d.profiles[1]!.techniqueIds[0]!);
      },
    ],
    [
      "duplicate dimension",
      (d) => {
        d.profiles[0]!.knowledge[0]!.dimension = d.profiles[0]!.knowledge[1]!.dimension;
      },
    ],
    [
      "false known",
      (d) => {
        const k = d.profiles[0]!.knowledge.find((k) => k.status === "specific_unknown")!;
        k.status = "bounded_evidence";
      },
    ],
    [
      "missing evidence",
      (d) => {
        d.evidence[0]!.sourceIds = ["missing"];
      },
    ],
    [
      "cross-profile evidence",
      (d) => {
        d.profiles[1]!.knowledge[0]!.evidenceIds = [d.evidence[0]!.id];
      },
    ],
    [
      "missing era evidence",
      (d) => {
        d.profiles.find((p) => p.id === "ru.hyperpop")!.eraRelations[0]!.evidenceId = null;
      },
    ],
    [
      "wrong era source",
      (d) => {
        d.profiles.find((p) => p.id === "ru.hyperpop")!.eraRelations[0]!.evidenceId =
          d.evidence[0]!.id;
      },
    ],
    [
      "broken supersession",
      (d) => {
        d.techniques[0]!.supersededBy = "missing";
      },
    ],
    [
      "self supersession",
      (d) => {
        d.techniques[0]!.supersededBy = d.techniques[0]!.id;
      },
    ],
    [
      "broken source group",
      (d) => {
        d.sources[0]!.documentId = "missing";
      },
    ],
    [
      "active-content source URL",
      (d) => {
        d.sources[0]!.url = "javascript:alert(1)";
      },
    ],
    [
      "credential-bearing source URL",
      (d) => {
        d.sources[0]!.url = "https://secret@example.com/paper";
      },
    ],
    [
      "extra undocumented field",
      (d) => {
        Object.assign(d, { autoCompile: true });
      },
    ],
    [
      "generator activation",
      (d) => {
        Object.assign(d.safety, { generatorTransfer: true });
      },
    ],
    [
      "individual activation",
      (d) => {
        Object.assign(d.techniques[0]!, { executable: true });
      },
    ],
    [
      "false source certification",
      (d) => {
        Object.assign(d.sources[0]!, { claimCertification: true });
      },
    ],
    [
      "false musicological signoff",
      (d) => {
        Object.assign(d.evidence[0]!, { independentMusicologicalSignoff: true });
      },
    ],
    [
      "changed source SHA",
      (d) => {
        d.source.rc1Sha256 = "0".repeat(64);
      },
    ],
    [
      "blank localized name",
      (d) => {
        d.profiles[0]!.name.el = " ";
      },
    ],
    [
      "missing technique translation",
      (d) => {
        Object.assign(d.techniques.find((t) => t.origin === "v4")!.instruction, { el: null });
      },
    ],
  ];
  for (const [name, mutate] of mutations)
    test(`rejects ${name}`, () => {
      const d = clone();
      mutate(d);
      expect(() => validateAtlasV4(d)).toThrow();
    });
  test("new package is not imported by live Atlas/Generator routes or guards", () => {
    for (const name of [
      "song-atlas-data.server.ts",
      "song-atlas.shared.ts",
      "song-atlas-generation.server.ts",
    ]) {
      const source = readFileSync(new URL(name, import.meta.url), "utf8");
      expect(source).not.toContain("song-atlas/v4");
      expect(source).not.toContain("song-atlas-v4");
    }
    const sql = readFileSync(
      new URL(
        "../../supabase/migrations/20261027011834_register_cultural_song_atlas.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("guard_atlas_generation_input");
  });
});
