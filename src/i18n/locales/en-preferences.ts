export const enPreferences = {
  "preferences.title": "Preferences",
  "preferences.languageHint": "Saved to your account and used on every device where you sign in.",
} as const;

export type PreferencesTranslationKey = keyof typeof enPreferences;
