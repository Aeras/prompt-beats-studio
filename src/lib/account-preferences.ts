import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_START_SCREEN,
  parseStartScreenPreference,
  type StartScreenPreference,
} from "@/lib/pb012-starting-screen.shared";
import { supabase } from "@/integrations/supabase/client";
import type { ExportFormat } from "@/lib/export-center.shared";
import { isLibraryTab, type LibraryTab } from "@/lib/library-tabs";

export type GeneratorDefaultMode = "basic" | "advanced";

export type AccountPreferences = {
  defaultStartScreen: StartScreenPreference;
  generatorLanguage: string;
  generatorMode: GeneratorDefaultMode;
  libraryTab: LibraryTab;
  trackPublished: boolean;
  promptPublic: boolean;
  lyricsPublic: boolean;
  allowDownload: boolean;
  exportFormat: ExportFormat;
  autoSaveDrafts: boolean;
};

type AccountPreferenceState = {
  ownerId: string | null;
  preferences: AccountPreferences;
};

export const ACCOUNT_PREFERENCE_KEYS = {
  defaultStartScreen: "default_start_screen",
  generatorLanguage: "default_generator_language",
  generatorMode: "default_generator_mode",
  libraryTab: "default_library_tab",
  trackPublished: "default_track_published",
  promptPublic: "default_prompt_public",
  lyricsPublic: "default_lyrics_public",
  allowDownload: "default_allow_download",
  exportFormat: "default_export_format",
  autoSaveDrafts: "auto_save_drafts",
} as const;

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  defaultStartScreen: DEFAULT_START_SCREEN,
  generatorLanguage: "",
  generatorMode: "basic",
  libraryTab: "tracks",
  trackPublished: true,
  promptPublic: true,
  lyricsPublic: true,
  allowDownload: false,
  exportFormat: "md",
  autoSaveDrafts: true,
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
    defaultStartScreen: parseStartScreenPreference(
      data[ACCOUNT_PREFERENCE_KEYS.defaultStartScreen],
    ),
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
    autoSaveDrafts: bool(
      data[ACCOUNT_PREFERENCE_KEYS.autoSaveDrafts],
      DEFAULT_ACCOUNT_PREFERENCES.autoSaveDrafts,
    ),
  } satisfies AccountPreferences;
}

export function useAccountPreferences() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const accountPreferences = useMemo(
    () => readAccountPreferences(user?.user_metadata as Record<string, unknown> | undefined),
    [user?.user_metadata],
  );
  const [preferenceState, setPreferenceState] = useState<AccountPreferenceState>({
    ownerId: userId,
    preferences: accountPreferences,
  });

  // A hook instance can render once as signed-out and then receive the existing session.
  // Do not expose that signed-out fallback for the newly resolved user while the effect
  // below is still waiting to synchronize local optimistic state. This prevents a fresh
  // Generator from consuming the fallback "basic" mode before persisted metadata.
  const preferences =
    preferenceState.ownerId === userId ? preferenceState.preferences : accountPreferences;

  useEffect(
    () => setPreferenceState({ ownerId: userId, preferences: accountPreferences }),
    [accountPreferences, userId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (event: Event) => {
      const next = (event as CustomEvent<AccountPreferences>).detail;
      if (next) setPreferenceState({ ownerId: userId, preferences: next });
    };
    window.addEventListener(EVENT_NAME, sync);
    return () => window.removeEventListener(EVENT_NAME, sync);
  }, [userId]);

  const setPreference = useCallback(
    async <K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) => {
      if (!user) throw new Error("Sign in to save account preferences.");
      const next = { ...preferences, [key]: value };
      setPreferenceState({ ownerId: user.id, preferences: next });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
      }
      const metadataKey = ACCOUNT_PREFERENCE_KEYS[key];
      const { error } = await supabase.auth.updateUser({ data: { [metadataKey]: value } });
      if (error) {
        setPreferenceState({ ownerId: user.id, preferences });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: preferences }));
        }
        throw new Error(error.message);
      }
    },
    [preferences, user],
  );

  return { preferences, setPreference, signedIn: Boolean(user), userId };
}
