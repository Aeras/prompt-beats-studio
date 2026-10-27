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
  type AtlasNavEntry,
} from "./atlas-navigation";
import {
  atlasNavigationCopy,
  atlasOptionCopy,
  atlasTaxonNames,
  atlasKnowledgeCopy,
} from "../i18n/atlas-navigation";
import source from "../data/song-atlas/RU_LIBRARY_V3_RELEASE_CANDIDATE.json";
const catalog = readAtlasCatalog();
describe("Atlas presentation taxonomy and cascading filters", () => {
  test("exact 58-profile coverage, no excluded candidates or invented family/type relationships", () => {
    expect(catalog.navigation).toHaveLength(58);
    expect(new Set(catalog.navigation.map((e) => e.profileId)).size).toBe(58);
    for (const p of source.profiles) {
      const entries = catalog.navigation.filter((e) => e.profileId === p.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ genreId: p.family_ids[0], subcategoryId: p.entity_type });
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
                e.profileId === id && e.genreId === genreId && e.subcategoryId === subcategoryId,
            ),
          ),
        ).toBe(true);
      }
    }
  });
  test("parent changes clear only dependent filters; identical selection is idempotent", () => {
    const full = { ...catalog.navigation[0]! };
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
      for (const level of ATLAS_NAV_LEVELS.slice(0, 4)) {
        const label = atlasTaxonNames[e[level]];
        expect(label?.[0]).toBeTruthy();
        expect(label?.[1]).toBeTruthy();
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
