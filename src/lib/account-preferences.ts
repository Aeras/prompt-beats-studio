import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { ExportFormat } from "@/lib/export-center.shared";
import { isLibraryTab, type LibraryTab } from "@/lib/library-tabs";

export type GeneratorDefaultMode = "basic" | "advanced";

export type AccountPreferences = {
  generatorLanguage: string;
  generatorMode: GeneratorDefaultMode;
  libraryTab: LibraryTab;
  trackPublished: boolean;
  promptPublic: boolean;
  lyricsPublic: boolean;
  allowDownload: boolean;
  exportFormat: ExportFormat;
};

export const ACCOUNT_PREFERENCE_KEYS = {
  generatorLanguage: "default_generator_language",
  generatorMode: "default_generator_mode",
  libraryTab: "default_library_tab",
  trackPublished: "default_track_published",
  promptPublic: "default_prompt_public",
  lyricsPublic: "default_lyrics_public",
  allowDownload: "default_allow_download",
  exportFormat: "default_export_format",
} as const;

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  generatorLanguage: "",
  generatorMode: "basic",
  libraryTab: "tracks",
  trackPublished: true,
  promptPublic: true,
  lyricsPublic: true,
  allowDownload: false,
  exportFormat: "md",
};

const EVENT_NAME = "promptbeats:account-preferences";
const EXPORT_FORMATS = new Set<ExportFormat>(["txt", "md", "html", "json"]);

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function readAccountPreferences(metadata: Record<string, unknown> | null | undefined) {
  const data = metadata ?? {};
  const generatorMode = data[ACCOUNT_PREFERENCE_KEYS.generatorMode];
  const libraryTab = data[ACCOUNT_PREFERENCE_KEYS.libraryTab];
  const exportFormat = data[ACCOUNT_PREFERENCE_KEYS.exportFormat];
  const generatorLanguage = data[ACCOUNT_PREFERENCE_KEYS.generatorLanguage];
  return {
    generatorLanguage: typeof generatorLanguage === "string" ? generatorLanguage : "",
    generatorMode: generatorMode === "advanced" ? "advanced" : "basic",
    libraryTab: isLibraryTab(libraryTab) ? libraryTab : "tracks",
    trackPublished: bool(
      data[ACCOUNT_PREFERENCE_KEYS.trackPublished],
      DEFAULT_ACCOUNT_PREFERENCES.trackPublished,
    ),
    promptPublic: bool(
      data[ACCOUNT_PREFERENCE_KEYS.promptPublic],
      DEFAULT_ACCOUNT_PREFERENCES.promptPublic,
    ),
    lyricsPublic: bool(
      data[ACCOUNT_PREFERENCE_KEYS.lyricsPublic],
      DEFAULT_ACCOUNT_PREFERENCES.lyricsPublic,
    ),
    allowDownload: bool(
      data[ACCOUNT_PREFERENCE_KEYS.allowDownload],
      DEFAULT_ACCOUNT_PREFERENCES.allowDownload,
    ),
    exportFormat:
      typeof exportFormat === "string" && EXPORT_FORMATS.has(exportFormat as ExportFormat)
        ? (exportFormat as ExportFormat)
        : DEFAULT_ACCOUNT_PREFERENCES.exportFormat,
  } satisfies AccountPreferences;
}

export function useAccountPreferences() {
  const { user } = useAuth();
  const accountPreferences = useMemo(
    () => readAccountPreferences(user?.user_metadata as Record<string, unknown> | undefined),
    [user?.user_metadata],
  );
  const [preferences, setPreferences] = useState<AccountPreferences>(accountPreferences);

  useEffect(() => setPreferences(accountPreferences), [accountPreferences]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (event: Event) => {
      const next = (event as CustomEvent<AccountPreferences>).detail;
      if (next) setPreferences(next);
    };
    window.addEventListener(EVENT_NAME, sync);
    return () => window.removeEventListener(EVENT_NAME, sync);
  }, []);

  const setPreference = useCallback(
    async <K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) => {
      if (!user) throw new Error("Sign in to save account preferences.");
      const next = { ...preferences, [key]: value };
      setPreferences(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
      }
      const metadataKey = ACCOUNT_PREFERENCE_KEYS[key];
      const { error } = await supabase.auth.updateUser({ data: { [metadataKey]: value } });
      if (error) {
        setPreferences(preferences);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: preferences }));
        }
        throw new Error(error.message);
      }
    },
    [preferences, user],
  );

  return { preferences, setPreference, signedIn: Boolean(user) };
}
