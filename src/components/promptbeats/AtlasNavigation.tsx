import { useState } from "react";
import { useI18n } from "@/i18n";
import {
  atlasFilterPlaceholder,
  atlasNavigationCopy,
  atlasTaxonLabel,
} from "@/i18n/atlas-navigation";
import {
  ATLAS_NAV_LEVELS,
  atlasNavOptions,
  atlasProfileName,
  changeAtlasFilter,
  type AtlasFilters,
} from "@/lib/atlas-navigation";
import type { AtlasCatalog } from "@/lib/song-atlas.shared";
import { CompactDropdown } from "@/components/ui/compact-dropdown";
import { Button } from "@/components/ui/button";
import {
  atlasMusicalCategoryLabel,
  atlasMusicalCategoryDescription,
} from "@/i18n/atlas-musical-categories";
export function AtlasNavigation({
  catalog,
  filters,
  onChange,
}: {
  catalog: AtlasCatalog;
  filters: AtlasFilters;
  onChange: (next: AtlasFilters) => void;
}) {
  const { language } = useI18n();
  const t = atlasNavigationCopy[language];
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label={t.navigation} className="space-y-3">
      <p className="text-sm text-muted-foreground">{t.scope}</p>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {ATLAS_NAV_LEVELS.map((level) => {
          const ids = atlasNavOptions(catalog.navigation, filters, level);
          const options = ids.map((id) => {
            if (level === "subcategoryId")
              return {
                value: id,
                label: atlasMusicalCategoryLabel(id, language),
                secondary:
                  language === "el"
                    ? atlasMusicalCategoryLabel(id, "en")
                    : atlasMusicalCategoryDescription(id, language),
                secondaryLang: "en",
              };
            if (level !== "profileId") return { value: id, label: atlasTaxonLabel(id, language) };
            const card = catalog.cards.find((c) => c.id === id)!;
            const entry = catalog.navigation.find((e) => e.profileId === id)!;
            const name = atlasProfileName(card, entry);
            return {
              value: id,
              label: name.primary,
              secondary: name.secondary,
              lang: name.primaryLang,
              secondaryLang: name.secondaryLang,
              keywords: [id],
            };
          });
          return (
            <CompactDropdown
              key={level}
              placeholder={atlasFilterPlaceholder(level, language)}
              searchPlaceholder={t.search}
              emptyText={t.empty}
              options={options}
              value={filters[level]}
              disabled={ids.length === 0}
              open={open === level}
              onOpenChange={(next) => setOpen(next ? level : null)}
              onValueChange={(value) => onChange(changeAtlasFilter(filters, level, value))}
            />
          );
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          onChange({
            continentId: "",
            countryId: "",
            genreId: "",
            subcategoryId: "",
            profileId: "",
          });
          setOpen(null);
        }}
      >
        {t.reset}
      </Button>
    </section>
  );
}
