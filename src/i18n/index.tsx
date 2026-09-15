import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { en, type TranslationKey } from "@/i18n/locales/en";
import { el } from "@/i18n/locales/el";
import { enApp, type AppUiTranslationKey } from "@/i18n/locales/en-app";
import { elApp } from "@/i18n/locales/el-app";
import { enExtra, type ExtraTranslationKey } from "@/i18n/locales/en-extra";
import { elExtra } from "@/i18n/locales/el-extra";
import { enProfile, type ProfileTranslationKey } from "@/i18n/locales/en-profile";
import { elProfile } from "@/i18n/locales/el-profile";
import { enFinal, type FinalTranslationKey } from "@/i18n/locales/en-final";
import { elFinal } from "@/i18n/locales/el-final";
import { enCatalog, type CatalogTranslationKey } from "@/i18n/locales/en-catalog";
import { elCatalog } from "@/i18n/locales/el-catalog";
import { enDiscover, type DiscoverTranslationKey } from "@/i18n/locales/en-discover";
import { elDiscover } from "@/i18n/locales/el-discover";
import { enPreferences, type PreferencesTranslationKey } from "@/i18n/locales/en-preferences";
import { elPreferences } from "@/i18n/locales/el-preferences";

export type AppLanguage = "en" | "el";
export type AppTranslationKey = TranslationKey | AppUiTranslationKey | ExtraTranslationKey | ProfileTranslationKey | FinalTranslationKey | CatalogTranslationKey | DiscoverTranslationKey | PreferencesTranslationKey;

const STORAGE_KEY = "pb:interface-language";
const ACCOUNT_LANGUAGE_KEY = "interface_language";

const dictionaries: Record<AppLanguage, Readonly<Record<AppTranslationKey, string>>> = {
  en: { ...en, ...enApp, ...enExtra, ...enProfile, ...enFinal, ...enCatalog, ...enDiscover, ...enPreferences },
  el: { ...el, ...elApp, ...elExtra, ...elProfile, ...elFinal, ...elCatalog, ...elDiscover, ...elPreferences },
};

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "en" || value === "el";
}

function storedLanguage(): AppLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isAppLanguage(stored) ? stored : "en";
}

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`,
  );
}

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: AppTranslationKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [signedIn, setSignedIn] = useState(false);

  const applyLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    let active = true;

    const applySession = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      if (!active) return;
      const accountLanguage = session?.user?.user_metadata?.[ACCOUNT_LANGUAGE_KEY];
      setSignedIn(Boolean(session?.user));
      applyLanguage(isAppLanguage(accountLanguage) ? accountLanguage : storedLanguage());
    };

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applyLanguage]);

  const setLanguage = useCallback((next: AppLanguage) => {
    applyLanguage(next);
    if (!signedIn) return;

    void supabase.auth.updateUser({
      data: { [ACCOUNT_LANGUAGE_KEY]: next },
    }).then(({ error }) => {
      if (error) console.error("[i18n] Failed to save account language preference:", error.message);
    });
  }, [applyLanguage, signedIn]);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: AppTranslationKey, values?: Record<string, string | number>) => {
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
