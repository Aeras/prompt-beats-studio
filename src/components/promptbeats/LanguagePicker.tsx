import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { CUSTOM_LANGUAGE_VALUE, getSongLanguageOptions } from "@/catalog/song-languages";
import { useAccountPreferences } from "@/lib/account-preferences";
import { useI18n } from "@/i18n";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

export function LanguagePicker({ value, onChange, className = "", ariaLabel }: Props) {
  const { t, language: appLanguage } = useI18n();
  const { preferences } = useAccountPreferences();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const defaultAppliedRef = useRef(false);

  const localized = useMemo(() => getSongLanguageOptions(appLanguage), [appLanguage]);
  const english = useMemo(() => getSongLanguageOptions("en"), []);
  const greek = useMemo(() => getSongLanguageOptions("el"), []);
  const englishIndex = useMemo(
    () => new Map(english.map((item) => [item.code, item.englishLabel.toLocaleLowerCase()])),
    [english],
  );
  const greekIndex = useMemo(
    () => new Map(greek.map((item) => [item.code, item.label.toLocaleLowerCase()])),
    [greek],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return localized;
    return localized.filter((item) => {
      const englishName = englishIndex.get(item.code) ?? "";
      const greekName = greekIndex.get(item.code) ?? "";
      return (
        item.label.toLocaleLowerCase().includes(q) ||
        item.englishLabel.toLocaleLowerCase().includes(q) ||
        englishName.includes(q) ||
        greekName.includes(q) ||
        item.code.toLocaleLowerCase().includes(q)
      );
    });
  }, [localized, query, englishIndex, greekIndex]);

  const selected = localized.find((item) => item.value === value);
  const displayValue =
    value === CUSTOM_LANGUAGE_VALUE
      ? t("generator.option.custom")
      : (selected?.label ?? value) || t("generator.selectLanguage");

  useEffect(() => {
    if (defaultAppliedRef.current) return;
    if (value) {
      defaultAppliedRef.current = true;
      return;
    }
    if (!preferences.generatorLanguage) return;
    defaultAppliedRef.current = true;
    onChange(preferences.generatorLanguage);
  }, [onChange, preferences.generatorLanguage, value]);

  useEffect(() => {
    if (!open || query) return;
    const frame = requestAnimationFrame(() => {
      selectedOptionRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, query, value]);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel ?? t("generator.language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() =>
          setOpen((current) => {
            const next = !current;
            if (next) setQuery("");
            return next;
          })
        }
        className="flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 text-left text-sm outline-none transition-shadow hover:border-white/20 focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{displayValue}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full min-w-[16rem] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0f] shadow-2xl">
          <div className="border-b border-white/10 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("generator.languageSearch")}
                aria-label={t("generator.languageSearch")}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div
            role="listbox"
            aria-label={ariaLabel ?? t("generator.language")}
            className="max-h-64 overflow-y-auto p-1"
          >
            {filtered.map((item) => {
              const active = item.value === value;
              return (
                <button
                  key={item.code}
                  ref={active ? selectedOptionRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {(() => {
                    const secondary =
                      appLanguage === "el"
                        ? item.englishLabel
                        : (greek.find((entry) => entry.code === item.code)?.label ?? "");
                    return secondary && secondary !== item.label ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {secondary}
                      </span>
                    ) : null;
                  })()}
                  {active && <Check className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("generator.languageNoResults")}
              </p>
            )}
            <div className="my-1 border-t border-white/10" />
            <button
              ref={value === CUSTOM_LANGUAGE_VALUE ? selectedOptionRef : undefined}
              type="button"
              role="option"
              aria-selected={value === CUSTOM_LANGUAGE_VALUE}
              onClick={() => {
                onChange(CUSTOM_LANGUAGE_VALUE);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5"
            >
              <span className="flex-1">{t("generator.option.custom")}</span>
              {value === CUSTOM_LANGUAGE_VALUE && <Check className="h-4 w-4 text-accent" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
