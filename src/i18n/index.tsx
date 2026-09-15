import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type TranslationKey } from "@/i18n/locales/en";
import { el } from "@/i18n/locales/el";

export type AppLanguage = "en" | "el";

const STORAGE_KEY = "pb:interface-language";

const dictionaries: Record<AppLanguage, Record<TranslationKey, string>> = {
  en,
  el,
};

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`,
  );
}

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "el" ? "el" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) => {
      const value = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
      return interpolate(value, values);
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
