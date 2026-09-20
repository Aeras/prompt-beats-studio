import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, Sparkles } from "lucide-react";

import {
  CULTURAL_REGIONS,
  CULTURAL_STYLES,
  SMART_PRESETS,
  type CulturalRegionId,
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
  const [appliedPresetId, setAppliedPresetId] = useState("");
  const feedbackTimerRef = useRef<number | null>(null);
  const selectedStyleId = culturalStyleId.startsWith("custom:") ? "custom" : culturalStyleId;
  const selectedStyle = CULTURAL_STYLES.find((item) => item.id === selectedStyleId);
  const [culturalRegionId, setCulturalRegionId] = useState<CulturalRegionId | "">(
    selectedStyle?.region ?? "",
  );
  const customCulturalStyle = culturalStyleId.startsWith("custom:")
    ? culturalStyleId.slice("custom:".length)
    : "";

  useEffect(() => {
    const styleId = culturalStyleId.startsWith("custom:") ? "custom" : culturalStyleId;
    const style = CULTURAL_STYLES.find((item) => item.id === styleId);
    setCulturalRegionId(style?.region ?? "");
  }, [culturalStyleId]);

  useEffect(() => () => {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const applyPresetWithFeedback = (preset: SmartPreset) => {
    onApply(preset);
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    setAppliedPresetId(preset.id);
    feedbackTimerRef.current = window.setTimeout(() => {
      setAppliedPresetId("");
      feedbackTimerRef.current = null;
    }, 1200);
  };

  const regionalStyles = useMemo(
    () => CULTURAL_STYLES.filter((style) => style.region === culturalRegionId),
    [culturalRegionId],
  );

  const changeCulturalRegion = (value: string) => {
    const regionId = value as CulturalRegionId;
    setCulturalRegionId(regionId);
    const firstStyle = CULTURAL_STYLES.find((style) => style.region === regionId);
    onCulturalStyleChange(firstStyle?.id === "custom" ? "custom:" : firstStyle?.id ?? "");
  };

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
                    <div className="mt-3 space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-muted-foreground">{t("generator.presets.culturalRegion")}</span>
                        <select
                          value={culturalRegionId}
                          onChange={(event) => changeCulturalRegion(event.target.value)}
                          className="h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-xs outline-none focus:border-primary/60"
                        >
                          <option value="" disabled className="bg-[#0a0a0c]">{t("generator.presets.selectCulturalRegion")}</option>
                          {CULTURAL_REGIONS.map((region) => (
                            <option key={region.id} value={region.id} className="bg-[#0a0a0c]">{region.name[language]}</option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] text-muted-foreground">{t("generator.presets.culturalStyle")}</span>
                        <select
                          value={selectedStyleId}
                          disabled={!culturalRegionId}
                          onChange={(event) => {
                            const next = event.target.value;
                            onCulturalStyleChange(next === "custom" ? "custom:" : next);
                          }}
                          className="h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:border-primary/60"
                        >
                          <option value="" disabled className="bg-[#0a0a0c]">{t("generator.presets.selectCulturalStyle")}</option>
                          {regionalStyles.map((style) => (
                            <option key={style.id} value={style.id} className="bg-[#0a0a0c]">{style.name[language]}</option>
                          ))}
                        </select>
                      </label>

                      {selectedStyleId === "custom" && (
                        <input
                          value={customCulturalStyle}
                          onChange={(event) => onCulturalStyleChange(`custom:${event.target.value.slice(0, 60)}`)}
                          maxLength={60}
                          placeholder={t("generator.presets.customCulturalStylePlaceholder")}
                          aria-label={t("generator.presets.customCulturalStylePlaceholder")}
                          className="h-9 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/60"
                        />
                      )}

                      <p className="text-[10px] text-muted-foreground">{t("generator.presets.languageIndependent")}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => applyPresetWithFeedback(preset)}
                    disabled={Boolean(
                      preset.cultural &&
                      (!culturalRegionId ||
                        !selectedStyleId ||
                        (selectedStyleId === "custom" && !customCulturalStyle.trim()))
                    )}
                    className={
                      appliedPresetId === preset.id
                        ? "mt-3 w-full rounded-lg border border-accent/50 bg-accent/15 px-3 py-2 text-xs font-semibold text-accent ring-1 ring-accent/30 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        : "mt-3 w-full rounded-lg border border-accent/40 px-3 py-2 text-xs font-semibold text-accent transition-all hover:bg-accent/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    }
                  >
                    {appliedPresetId === preset.id ? (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <Check className="h-3.5 w-3.5" />
                        {t("generator.presets.applied")}
                      </span>
                    ) : active ? (
                      t("generator.presets.reapply")
                    ) : (
                      t("generator.presets.apply")
                    )}
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
