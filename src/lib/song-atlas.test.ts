import { composeAtlasInstructions } from "./atlas-instructions.shared";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { readAtlasResearchProfile } from "./atlas-research.server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import source from "../data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json";
import { readAtlasCatalog, safeAtlasSourceUrl } from "./song-atlas-data.server";
import {
  ATLAS_SOURCE_SHA,
  atlasHandoffSchema,
  atlasSelectionSchema,
  compileAtlasSelection,
  inspectAtlasSelection,
  type AtlasCatalog,
} from "./song-atlas.shared";
import { advancedSetupSchema } from "./advanced-generator-setup";
import { validateAtlasGenerationOrigin } from "./song-atlas-generation.server";
const catalog = readAtlasCatalog();
const empty = { profileIds: [], optionIds: [] };
const fixture: AtlasCatalog = {
  ...catalog,
  options: [
    {
      id: "fixture.greek",
      profileId: null,
      dimension: "lyrics_language",
      label: "Greek",
      instruction: "Use natural Greek lexical stress.",
      approved: true,
      exclusiveGroup: "language",
      lyricsLanguage: null,
    },
    {
      id: "fixture.russian",
      profileId: null,
      dimension: "lyrics_language",
      label: "Russian",
      instruction: "Use natural Russian stress.",
      approved: true,
      exclusiveGroup: "language",
      lyricsLanguage: null,
    },
    {
      id: "fixture.rhythm",
      profileId: "ru.rap_90",
      dimension: "creative_technique",
      label: "Greek phrasing",
      instruction: "Follow the selected Greek phrasing.",
      approved: true,
      exclusiveGroup: null,
      lyricsLanguage: "Greek",
    },
  ],
};
describe("Song Atlas source and editorial boundary", () => {
  test("canonical source byte hash, stable IDs, source links and candidates", () => {
    expect(
      createHash("sha256")
        .update(readFileSync("src/data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json"))
        .digest("hex"),
    ).toBe(ATLAS_SOURCE_SHA);
    expect(catalog.cards).toHaveLength(58);
    expect(new Set(catalog.cards.map((c) => c.id)).size).toBe(58);
    expect(source.candidates).toHaveLength(14);
    expect(catalog.sources).toHaveLength(97);
    expect(source.profiles.flatMap((p) => p.creative_techniques)).toHaveLength(65);
    for (const c of catalog.cards) {
      expect(source.candidates.some((x) => x.id === c.id)).toBe(false);
      for (const claim of c.claims)
        for (const id of claim.sourceIds)
          expect(catalog.sources.some((s) => s.id === id)).toBe(true);
    }
  });
  test("all 65 creative instructions retained verbatim but none approved", () => {
    for (const p of source.profiles)
      for (const o of p.creative_techniques)
        expect(catalog.options.find((x) => x.id === o.id)).toMatchObject({
          instruction: o.instruction_en,
          approved: false,
        });
    expect(catalog.options.every((o) => !o.approved)).toBe(true);
    expect(source.ready_for_atlas_browse).toBe(false);
    expect(source.ready_for_generator_transfer).toBe(false);
  });
  test("context-only selections produce no musical, language or narrative directives", () => {
    for (const card of catalog.cards.filter((c) => c.contextOnly))
      expect(compileAtlasSelection({ profileIds: [card.id], optionIds: [] }, catalog)).toEqual({
        instructions: "",
        creativeTechniques: "",
      });
    expect(catalog.cards.find((c) => c.id === "ru.rap_90")?.contextOnly).toBe(true);
  });
  test("lively/legato, a cappella/beat and phonk variants are distinct disabled modes", () => {
    for (const id of ["ru.chastushka", "ru.battle_rap", "ru.phonk"]) {
      const options = catalog.options.filter((o) => o.id.startsWith(id + ".mode."));
      expect(options).toHaveLength(2);
      expect(options.every((o) => !o.approved)).toBe(true);
      expect(
        inspectAtlasSelection({ profileIds: [id], optionIds: options.map((o) => o.id) }, catalog)
          .conflicts,
      ).toHaveLength(1);
    }
  });
  test("pop and rock ballad preview does not inject a narrative requirement", () => {
    for (const id of ["ru.russian_pop_ballad", "ru.russian_rock_ballad"])
      expect(compileAtlasSelection({ profileIds: [id], optionIds: [] }, catalog).instructions).toBe(
        "",
      );
  });
  test("malicious source links are never exposed as active URLs", () => {
    for (const u of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:secret@example.com",
      "https://127.0.0.1/x",
      "https://example.com/?token=secret",
    ])
      expect(safeAtlasSourceUrl(u)).toBeNull();
    expect(safeAtlasSourceUrl("https://example.org/paper")).toBe("https://example.org/paper");
  });
});
describe("selected-only versioned handoff", () => {
  test("approved fixture compiles only selected dimensions and respects actual lyrics language", () => {
    expect(
      compileAtlasSelection(
        { profileIds: ["ru.rap_90"], optionIds: ["fixture.greek", "fixture.rhythm"] },
        fixture,
      ).instructions,
    ).toBe("Use natural Greek lexical stress.\nFollow the selected Greek phrasing.");
    expect(() =>
      compileAtlasSelection(
        { profileIds: ["ru.rap_90"], optionIds: ["fixture.russian", "fixture.rhythm"] },
        fixture,
      ),
    ).toThrow("Conflicting");
  });
  test("unapproved, invented and mismatched-profile options fail closed", () => {
    expect(() =>
      compileAtlasSelection(
        { profileIds: [catalog.cards[0]!.id], optionIds: [catalog.cards[0]!.techniqueIds[0]!] },
        catalog,
      ),
    ).toThrow("await independent");
    expect(() =>
      compileAtlasSelection({ profileIds: [], optionIds: ["invented"] }, catalog),
    ).toThrow();
    expect(() =>
      compileAtlasSelection({ profileIds: [], optionIds: ["fixture.rhythm"] }, fixture),
    ).toThrow();
  });
  test("duplicate, oversized, stale-version and uncontrolled fields are rejected", () => {
    expect(
      atlasSelectionSchema.safeParse({ profileIds: Array(9).fill("x"), optionIds: [] }).success,
    ).toBe(false);
    expect(atlasSelectionSchema.safeParse({ profileIds: [], optionIds: ["a", "a"] }).success).toBe(
      false,
    );
    expect(
      atlasHandoffSchema.safeParse({
        format: "promptbeats-atlas-handoff",
        schemaVersion: 2,
        id: crypto.randomUUID(),
        sourceSha: ATLAS_SOURCE_SHA,
        selection: empty,
      }).success,
    ).toBe(false);
    expect(atlasSelectionSchema.safeParse({ ...empty, dna: "injected" }).success).toBe(false);
    expect(advancedSetupSchema.shape).not.toHaveProperty("atlasOrigin");
  });
  test("empty Atlas leaves ordinary Generator instructions byte-identical", () => {
    const manual = "Keep my Blueprint.\nΕλληνικά / Русский";
    expect(compileAtlasSelection(empty, catalog).instructions).toBe("");
    expect(composeAtlasInstructions(manual, null)).toBe(manual);
  });
  test("server rejects denied access before reading compilation content", async () => {
    await expect(
      validateAtlasGenerationOrigin(
        {
          format: "promptbeats-atlas-handoff",
          schemaVersion: 1,
          id: crypto.randomUUID(),
          sourceSha: ATLAS_SOURCE_SHA,
          selection: empty,
        },
        { rpc: async () => ({ error: { code: "42501" } }) },
      ),
    ).rejects.toThrow("not available");
  });
  test("no live server path compiles an unapproved RC1 selection", async () => {
    await expect(
      validateAtlasGenerationOrigin(
        {
          format: "promptbeats-atlas-handoff",
          schemaVersion: 1,
          id: crypto.randomUUID(),
          sourceSha: ATLAS_SOURCE_SHA,
          selection: {
            profileIds: [catalog.cards[0]!.id],
            optionIds: [catalog.cards[0]!.techniqueIds[0]!],
          },
        },
        { rpc: async () => ({ error: null }) },
      ),
    ).rejects.toThrow("await independent");
  });
});

describe("real Atlas server entrypoints with isolated offline dependencies", () => {
  test("fresh authorization, editorial admission, no-store and fail-closed database errors", async () => {
    const ts = await import("typescript");
    const { runInNewContext } = await import("node:vm");
    const exported: Record<string, any> = {};
    const events: string[] = [];
    let entitled = true;
    let dbError = false;
    const auth = Symbol("auth");
    const headers: Record<string, string> = {};
    const client = {
      rpc: async (name: string) => {
        events.push(name);
        return { error: dbError ? { code: "42501" } : null };
      },
    };
    const compiled = ts.transpileModule(readFileSync("src/lib/song-atlas.functions.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    runInNewContext(compiled, {
      exports: exported,
      require(name: string) {
        if (name === "zod") return { z };
        if (name === "./atlas-research.server")
          return {
            readAtlasResearchProfile: (profileId: string) => {
              events.push("research-content");
              return readAtlasResearchProfile(profileId);
            },
          };
        if (name === "@tanstack/react-start/server")
          return {
            setResponseHeader: (k: string, v: string) => {
              headers[k] = v;
            },
          };
        if (name === "@/integrations/supabase/auth-middleware")
          return { requireSupabaseAuth: auth };
        if (name === "./song-atlas.shared") return { atlasHandoffSchema, compileAtlasSelection };
        if (name === "./song-atlas-data.server")
          return {
            readAtlasCatalog: () => {
              events.push("content");
              return catalog;
            },
          };
        if (name === "./feature-access.functions")
          return {
            requireFeatureAccess: async (s: unknown, key: string) => {
              expect(s).toBe(client);
              expect(key).toBe("cultural_song_atlas");
              events.push("feature");
              if (!entitled) throw new Error("Denied");
            },
          };
        if (name === "@tanstack/react-start")
          return {
            createServerFn: () => {
              let validate = (x: any) => x;
              const builder = {
                middleware: (m: unknown[]) => {
                  expect(m).toEqual([auth]);
                  return builder;
                },
                inputValidator: (v: typeof validate) => {
                  validate = v;
                  return builder;
                },
                handler: (f: any) => (args: any) => f({ ...args, data: validate(args.data) }),
              };
              return builder;
            },
          };
        throw new Error("Unexpected dependency");
      },
    });
    const context = { supabase: client };
    await exported["getSongAtlasPreview"]({ context });
    expect(events).toEqual(["feature", "atlas_preview_admission", "content"]);
    expect(headers["Cache-Control"]).toBe("private, no-store");
    events.length = 0;
    const research = await exported["getSongAtlasResearch"]({
      context,
      data: { profileId: "ru.bard_song" },
    });
    expect(events).toEqual(["feature", "atlas_preview_admission", "research-content"]);
    expect(research.executable).toBe(false);
    expect(research.tasks).toHaveLength(10);
    expect(research).not.toHaveProperty("instructions");
    expect(headers["Vary"]).toBe("Cookie, Authorization");
    events.length = 0;
    entitled = false;
    await expect(exported["getSongAtlasPreview"]({ context })).rejects.toThrow("Denied");
    expect(events).toEqual(["feature"]);
    events.length = 0;
    entitled = true;
    dbError = true;
    await expect(exported["getSongAtlasPreview"]({ context })).rejects.toThrow("not available");
    expect(events).toEqual(["feature", "atlas_preview_admission"]);
    await expect(
      exported["getSongAtlasResearch"]({ context, data: { profileId: "ru.bard_song" } }),
    ).rejects.toThrow("not available");
    expect(() =>
      exported["getSongAtlasResearch"]({
        context,
        data: { profileId: "ru.bard_song", approved: true },
      }),
    ).toThrow();
    dbError = false;
    await expect(
      exported["validateSongAtlasHandoff"]({
        context,
        data: {
          format: "promptbeats-atlas-handoff",
          schemaVersion: 1,
          id: crypto.randomUUID(),
          sourceSha: ATLAS_SOURCE_SHA,
          selection: {
            profileIds: [catalog.cards[0]!.id],
            optionIds: [catalog.cards[0]!.techniqueIds[0]!],
          },
        },
      }),
    ).rejects.toThrow("await independent");
  });
});
