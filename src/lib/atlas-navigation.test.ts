import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readAtlasCatalog } from "./song-atlas-data.server";
import { ATLAS_SOURCE_SHA, compileAtlasSelection } from "./song-atlas.shared";
import {
  ATLAS_NAV_LEVELS,
  atlasNavOptions,
  changeAtlasFilter,
  emptyAtlasFilters,
  matchesAtlasFilters,
  atlasProfileName,
  atlasSubcategoryIds,
  atlasCategoryKind,
  ATLAS_CATEGORY_KINDS,
  type AtlasNavEntry,
} from "./atlas-navigation";
import {
  atlasNavigationCopy,
  atlasOptionCopy,
  atlasTaxonNames,
  atlasKnowledgeCopy,
} from "../i18n/atlas-navigation";
import source from "../data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json";
import {
  atlasMusicalCategoryNames,
  atlasMusicalCategoryLabel,
  atlasCategoryKindCopy,
} from "../i18n/atlas-musical-categories";
const catalog = readAtlasCatalog();
const base = { ...emptyAtlasFilters(), continentId: "europe-asia", countryId: "ru-collection" };
const paths = (genreId: string) =>
  atlasNavOptions(catalog.navigation, { ...base, genreId }, "subcategoryId");
const profiles = (genreId: string, subcategoryId: string) =>
  atlasNavOptions(catalog.navigation, { ...base, genreId, subcategoryId }, "profileId");
describe("independent-review musical navigation acceptance", () => {
  test("Rock exposes real Alternative/Punk/Post-Punk and preserves overlapping named styles", () => {
    expect(
      paths("rock")
        .filter((id) => id.startsWith("subgenre."))
        .sort(),
    ).toEqual([
      "subgenre.alternative-rock",
      "subgenre.art-rock",
      "subgenre.dream-pop",
      "subgenre.experimental-rock",
      "subgenre.folk-metal",
      "subgenre.indie-rock",
      "subgenre.new-wave",
      "subgenre.post-punk",
      "subgenre.punk-rock",
      "subgenre.shoegaze",
    ]);
    expect(profiles("rock", "subgenre.alternative-rock")).toEqual(["ru.russian_alt_rock"]);
    expect(paths("rock")[0]).toBe("subgenre.alternative-rock");
    expect(profiles("rock", "subgenre.punk-rock")).toEqual(["ru.russian_punk"]);
    expect(profiles("rock", "subgenre.post-punk")).toEqual(["ru.soviet_postpunk"]);
    expect(profiles("rock", "subgenre.new-wave")).toEqual(["ru.soviet_postpunk"]);
    expect(profiles("rock", "subgenre.dream-pop")).toEqual(["ru.shoegaze"]);
    expect(profiles("pop", "subgenre.dream-pop")).toEqual([]); // retain source family, do not infer another parent
  });
  test("Pop offers Dance/Indie/Synth; ballads and eras are not misrepresented as subgenres", () => {
    expect(
      paths("pop")
        .filter((id) => id.startsWith("subgenre."))
        .sort(),
    ).toEqual(["subgenre.dance-pop", "subgenre.indie-pop", "subgenre.synth-pop"]);
    expect(profiles("pop", "subgenre.dance-pop")).toEqual(["ru.russian_dance_pop_00"]);
    expect(profiles("pop", "form.pop-ballad")).toEqual(["ru.russian_pop_ballad"]);
    expect(profiles("pop", "scene.russian-pop-1990s")).toEqual(["ru.russian_pop_90"]);
    expect(profiles("pop", "general.pop")).toEqual(["ru.modern_russian_pop"]);
  });
  test("Rap exposes actual musical styles separately from battles, social themes and eras", () => {
    expect(
      paths("rap")
        .filter((id) => id.startsWith("subgenre."))
        .sort(),
    ).toEqual([
      "subgenre.cloud-rap",
      "subgenre.drill",
      "subgenre.melodic-rap",
      "subgenre.pop-rap",
      "subgenre.trap",
    ]);
    expect(profiles("rap", "subgenre.trap")).toEqual(["ru.trap"]);
    expect(profiles("rap", "subgenre.melodic-rap")).toEqual(["ru.melodic_rap"]);
    expect(profiles("rap", "subgenre.pop-rap")).toEqual(["ru.melodic_rap"]);
    expect(profiles("rap", "form.battle-rap")).toEqual(["ru.battle_rap"]);
    expect(profiles("rap", "context.social-conceptual-rap")).toEqual(["ru.conscious_rap"]);
  });
  test("Folk offers documented named forms/repertoires without manufacturing Folk subgenres", () => {
    expect(paths("folk").filter((id) => id.startsWith("subgenre."))).toEqual([]);
    expect(paths("folk").sort()).toEqual([
      "context.calendar-ritual",
      "context.cossack-repertoire",
      "context.wedding-ritual",
      "form.bylina-epic-singing",
      "form.chastushka",
      "form.khorovod-song",
      "form.protyazhnaya-song",
      "general.lyrical-folk",
    ]);
    expect(profiles("folk", "form.chastushka")).toEqual(["ru.chastushka"]);
    expect(profiles("folk", "context.wedding-ritual")).toEqual(["ru.wedding_folk"]);
  });
  test("ambiguous song traditions remain conservative while explicit vocal genres stay musical", () => {
    expect(profiles("romance", "style.urban-romance")).toEqual(["ru.urban_romance"]);
    expect(profiles("romance", "subgenre.chamber-romance")).toEqual(["ru.classical_romance"]);
    expect(profiles("romance", "form.cruel-romance")).toEqual(["ru.cruel_romance"]);
    expect(profiles("bard", "general.bard")).toEqual(["ru.bard_song"]);
    expect(profiles("chanson", "context.blatnaya-repertoire")).toEqual(["ru.blatnaya"]);
    expect(profiles("chanson", "style.post-chanson-critical-label")).toEqual(["ru.post_chanson"]);
    expect(profiles("folk", "general.lyrical-folk")).toEqual(["ru.lyrical_folk"]);
  });
  test("all 58 profiles have typed, evidence-backed paths and never use entity_type as a category", () => {
    const entityTypes = new Set(source.profiles.map((p) => p.entity_type));
    for (const entry of catalog.navigation) {
      const routeIds = atlasSubcategoryIds(entry);
      expect(routeIds.length).toBeGreaterThan(0);
      for (const id of routeIds) {
        expect(entityTypes.has(id)).toBe(false);
        const kind = atlasCategoryKind(id)!;
        expect(entry.classification[kind]).toContain(id);
        for (const language of ["en", "el"] as const) {
          const label = atlasMusicalCategoryLabel(id, language);
          expect(label).not.toContain(entry.sourceEntityType);
          if (kind !== "subgenre")
            expect(label).toContain(atlasCategoryKindCopy[kind][language === "el" ? 0 : 1]);
        }
      }
    }
    const postpunk = catalog.navigation.find((e) => e.profileId === "ru.soviet_postpunk")!;
    expect(postpunk.classification.scene).toEqual(["scene.soviet-post-punk-new-wave"]);
    expect(atlasSubcategoryIds(postpunk)).not.toContain(postpunk.classification.scene[0]!);
    expect(atlasCategoryKind("historical_scene")).toBeNull();
  });
});
describe("Atlas presentation taxonomy and cascading filters", () => {
  test("exact 58-profile coverage, no excluded candidates or invented family/type relationships", () => {
    expect(catalog.navigation).toHaveLength(58);
    expect(new Set(catalog.navigation.map((e) => e.profileId)).size).toBe(58);
    for (const p of source.profiles) {
      const entries = catalog.navigation.filter((e) => e.profileId === p.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        genreId: p.family_ids[0],
        sourceEntityType: p.entity_type,
        evidence: { field: "name_ru", quote: p.name_ru },
      });
      expect(atlasSubcategoryIds(entries[0]!)).not.toContain(p.entity_type);
      expect(atlasSubcategoryIds(entries[0]!).length).toBeGreaterThan(0);
      expect(entries[0]?.romanizedName.trim()).not.toBe("");
    }
    for (const c of source.candidates)
      expect(catalog.navigation.some((e) => e.profileId === c.id)).toBe(false);
  });
  test("only actual children appear, and no empty/placeholder subcategory", () => {
    let filters = emptyAtlasFilters();
    expect(atlasNavOptions(catalog.navigation, filters, "countryId")).toEqual([]);
    for (const level of ATLAS_NAV_LEVELS) {
      const options = atlasNavOptions(catalog.navigation, filters, level);
      expect(options.length).toBeGreaterThan(0);
      expect(options.every((id) => id.trim().length > 0)).toBe(true);
      filters = changeAtlasFilter(filters, level, options[0]!);
    }
    expect(catalog.navigation.filter((e) => matchesAtlasFilters(e, filters))).toHaveLength(1);
    expect(
      atlasNavOptions(
        catalog.navigation,
        { ...filters, genreId: "invented", subcategoryId: "" },
        "subcategoryId",
      ),
    ).toEqual([]);
  });
  test("every real branch has reachable profiles; subtype never crosses families", () => {
    const base = { ...emptyAtlasFilters(), continentId: "europe-asia", countryId: "ru-collection" };
    for (const genreId of atlasNavOptions(catalog.navigation, base, "genreId")) {
      const filters = { ...base, genreId };
      for (const subcategoryId of atlasNavOptions(catalog.navigation, filters, "subcategoryId")) {
        const ids = atlasNavOptions(catalog.navigation, { ...filters, subcategoryId }, "profileId");
        expect(ids.length).toBeGreaterThan(0);
        expect(
          ids.every((id) =>
            catalog.navigation.some(
              (e) =>
                e.profileId === id &&
                e.genreId === genreId &&
                atlasSubcategoryIds(e).includes(subcategoryId),
            ),
          ),
        ).toBe(true);
      }
    }
  });
  test("parent changes clear only dependent filters; identical selection is idempotent", () => {
    const entry = catalog.navigation[0]!;
    const full = {
      continentId: entry.continentId,
      countryId: entry.countryId,
      genreId: entry.genreId,
      profileId: entry.profileId,
      subcategoryId: atlasSubcategoryIds(entry)[0]!,
    };
    const next = changeAtlasFilter(full, "genreId", "rap");
    expect(next).toMatchObject({
      continentId: full.continentId,
      countryId: full.countryId,
      genreId: "rap",
      subcategoryId: "",
      profileId: "",
    });
    expect(changeAtlasFilter(next, "genreId", "rap")).toBe(next);
    expect(changeAtlasFilter(full, "continentId", "other")).toMatchObject({
      countryId: "",
      genreId: "",
      subcategoryId: "",
      profileId: "",
    });
    expect(full.profileId).toBe("ru.protyazhnaya");
  });
  test("data-driven geography supports additional paths without inventing current availability", () => {
    const f = emptyAtlasFilters();
    const fixture: AtlasNavEntry[] = [
      { ...catalog.navigation[0]!, continentId: "fixture", countryId: "fixture-country" },
    ];
    expect(atlasNavOptions(fixture, f, "continentId")).toEqual(["fixture"]);
    expect(atlasNavOptions(catalog.navigation, f, "continentId")).toEqual(["europe-asia"]);
  });
  test("locale labels never change IDs, coverage or filter results", () => {
    for (const e of catalog.navigation) {
      for (const level of ["continentId", "countryId", "genreId"] as const) {
        const label = atlasTaxonNames[e[level]];
        expect(label?.[0]).toBeTruthy();
        expect(label?.[1]).toBeTruthy();
      }
      for (const kind of ATLAS_CATEGORY_KINDS)
        for (const id of e.classification[kind]) {
          expect(atlasCategoryKind(id)).toBe(kind);
          expect(atlasMusicalCategoryNames[id]?.[0]).toBeTruthy();
          expect(atlasMusicalCategoryNames[id]?.[1]).toBeTruthy();
        }
    }
    expect(Object.keys(atlasNavigationCopy.el).sort()).toEqual(
      Object.keys(atlasNavigationCopy.en).sort(),
    );
    for (const p of catalog.cards) {
      const names = atlasProfileName(
        p,
        catalog.navigation.find((e) => e.profileId === p.id)!,
      );
      expect(names.primary).toBe(p.name);
      expect(names.primaryLang).toBe("ru");
      expect(names.secondary).not.toMatch(/[А-Яа-яЁё]/);
      for (const k of p.knowledge) {
        expect(atlasKnowledgeCopy[k.dimension]).toBeDefined();
        expect(atlasKnowledgeCopy[k.evidence]).toBeDefined();
      }
      for (const c of p.claims) expect(atlasKnowledgeCopy[c.review]).toBeDefined();
    }
    for (const option of catalog.options.filter((o) => !o.instruction))
      expect(atlasOptionCopy[option.label]).toBeDefined();
  });
  test("duplicate secondary names hidden; both source claim languages retained", () => {
    expect(
      atlasProfileName({ name: "Rock" }, { ...catalog.navigation[0]!, romanizedName: "Rock" })
        .secondary,
    ).toBeNull();
    for (const p of source.profiles)
      for (const claim of p.historical_claims) {
        expect(
          catalog.cards.find((c) => c.id === p.id)?.claims.find((c) => c.id === claim.id)
            ?.localizedText,
        ).toEqual({ el: claim.statement_el ?? null, en: claim.statement_en ?? null });
      }
  });
  test("navigation cannot activate instructions or mutate source / Generator contracts", () => {
    expect(
      createHash("sha256")
        .update(readFileSync("src/data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json"))
        .digest("hex"),
    ).toBe(ATLAS_SOURCE_SHA);
    expect(catalog.options.every((o) => !o.approved)).toBe(true);
    expect(source.profiles.flatMap((p) => p.creative_techniques)).toHaveLength(65);
    for (const e of catalog.navigation) {
      expect(
        compileAtlasSelection({ profileIds: [e.profileId], optionIds: [] }, catalog).instructions,
      ).toBe("");
    }
    const route = readFileSync("src/routes/song-atlas.tsx", "utf8");
    expect(route).not.toContain("<select");
    const dropdown = readFileSync("src/components/ui/compact-dropdown.tsx", "utf8");
    expect(dropdown).not.toMatch(/#[0-9a-fA-F]{3,8}|bg-(purple|white|black|amber)-/);
  });
});
