import { useMemo, useState } from "react";
import { Check, Search, Sparkles } from "lucide-react";

import {
  CULTURAL_STYLES,
  SMART_PRESETS,
  type SmartPreset,
  type SmartPresetCategory,
} from "@/catalog/smart-presets";
import { useI18n } from "@/i18n";

type Props = {
  activePresetId: string;
  culturalStyleId: string;
  onCulturalStyleChange: (value: string) => void;
  onApply: (preset: SmartPreset) => void;
};

const categories: SmartPresetCategory[] = ["pop", "rock", "electronic", "hiphop", "acoustic", "global"];

export function SmartPresetsPanel({
  activePresetId,
  culturalStyleId,
  onCulturalStyleChange,
  onApply,
}: Props) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SmartPresetCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return SMART_PRESETS.filter((preset) => {
      if (category !== "all" && preset.category !== category) return false;
      if (!q) return true;
      const searchable = [
        preset.name.en,
        preset.name.el,
        preset.description.en,
        preset.description.el,
        preset.fingerprint,
        ...(preset.searchTerms ?? []),
        ...preset.musicStyles,
        ...preset.moods,
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(q);
    });
  }, [category, query]);

  const activePreset = SMART_PRESETS.find((preset) => preset.id === activePresetId);

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-accent" />
            <h3 className="font-display text-sm font-semibold text-foreground">{t("generator.presets.title")}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("generator.presets.description")}</p>
          {activePreset && (
            <p className="mt-1 text-[11px] text-accent">
              {t("generator.presets.active", { preset: activePreset.name[language] })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-xl border border-accent/40 px-4 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          {open ? t("generator.presets.close") : t("generator.presets.browse")}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("generator.presets.search")}
              aria-label={t("generator.presets.search")}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={category === "all" ? "shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground" : "shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground"}
            >
              {t("generator.presets.category.all")}
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={category === item ? "shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground" : "shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground"}
              >
                {t(`generator.presets.category.${item}`)}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((preset) => {
              const active = preset.id === activePresetId;
              return (
                <div key={preset.id} className={active ? "rounded-xl border border-accent/60 bg-accent/10 p-3" : "rounded-xl border border-white/10 bg-black/25 p-3"}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-foreground">{preset.name[language]}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{preset.description[language]}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/80">{preset.fingerprint}</p>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-accent" />}
                  </div>

                  {preset.cultural && (
                    <label className="mt-3 block">
                      <span className="mb-1 block text-[11px] text-muted-foreground">{t("generator.presets.culturalStyle")}</span>
                      <select
                        value={culturalStyleId}
                        onChange={(event) => onCulturalStyleChange(event.target.value)}
                        className="h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-xs outline-none focus:border-primary/60"
                      >
                        {CULTURAL_STYLES.map((style) => (
                          <option key={style.id} value={style.id} className="bg-[#0a0a0c]">{style.name[language]}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] text-muted-foreground">{t("generator.presets.languageIndependent")}</p>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() => onApply(preset)}
                    className="mt-3 w-full rounded-lg border border-accent/40 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
                  >
                    {active ? t("generator.presets.reapply") : t("generator.presets.apply")}
                  </button>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <p className="py-5 text-center text-xs text-muted-foreground">{t("generator.presets.noResults")}</p>
          )}
        </div>
      )}
    </div>
  );
}
