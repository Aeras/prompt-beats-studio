import { getSongLanguageVariants } from "@/catalog/song-languages";
import { useI18n } from "@/i18n";

type Props = {
  language: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function LanguageVariantPicker({ language, value, onChange, className = "" }: Props) {
  const { t, language: appLanguage } = useI18n();
  const variants = getSongLanguageVariants(language);
  if (!variants.length) return null;

  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
        {t("generator.languageVariant")}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t("generator.languageVariant")}
        className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm outline-none transition-shadow focus:border-primary/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--neon)_22%,transparent)]"
      >
        <option value="" className="bg-[#0a0a0c]">
          {t("generator.languageVariantAuto")}
        </option>
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id} className="bg-[#0a0a0c]">
            {variant.label[appLanguage]}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[10px] text-muted-foreground">
        {t("generator.languageVariantHint")}
      </span>
    </label>
  );
}
