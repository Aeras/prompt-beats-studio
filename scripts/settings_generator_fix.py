from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Generator: wait for account-preference auth instance before applying default mode.
path = "src/routes/generate.tsx"
replace_once(
    path,
    '  const { preferences: accountPreferences } = useAccountPreferences();',
    '  const { preferences: accountPreferences, signedIn: accountPreferencesReady } =\n    useAccountPreferences();',
)
replace_once(
    path,
    '''  useEffect(() => {
    if (defaultGeneratorModeAppliedRef.current || !user) return;
    defaultGeneratorModeAppliedRef.current = true;
    if (search.mode === "revision" || search.presets === "open" || search.workspace === "lyrics")
      return;
    // Never downgrade a mode already promoted by a handoff/recovery path. The account
    // default only upgrades an otherwise fresh Basic Generator to Advanced.
    if (!advanced && accountPreferences.generatorMode === "advanced") setAdvanced(true);
  }, [
    accountPreferences.generatorMode,
    advanced,
    search.mode,
    search.presets,
    search.workspace,
    user,
  ]);''',
    '''  useEffect(() => {
    if (defaultGeneratorModeAppliedRef.current || !accountPreferencesReady) return;
    defaultGeneratorModeAppliedRef.current = true;
    if (search.mode === "revision" || search.presets === "open" || search.workspace === "lyrics")
      return;
    // useAccountPreferences has its own auth subscription. Wait until that subscription
    // has the signed-in user's metadata before consuming the account default; otherwise
    // the initial fallback "basic" can win the one-time initialization race.
    if (!advanced && accountPreferences.generatorMode === "advanced") setAdvanced(true);
  }, [
    accountPreferences.generatorMode,
    accountPreferencesReady,
    advanced,
    search.mode,
    search.presets,
    search.workspace,
  ]);''',
)

# Generator drafts: keep recovery for refresh/window close, but intentional SPA navigation clears it.
anchor = '''  const revisionReady =
    !revisionMode ||'''
addition = '''  const generatorPageUnloadRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    generatorPageUnloadRef.current = false;
    const markPageUnload = () => {
      generatorPageUnloadRef.current = true;
    };
    window.addEventListener("beforeunload", markPageUnload);
    return () => {
      window.removeEventListener("beforeunload", markPageUnload);
      if (!generatorPageUnloadRef.current) clearGeneratorDraft();
    };
  }, [clearGeneratorDraft]);

'''
replace_once(path, anchor, addition + anchor)

# Settings: App language first, then Generator language and Generator mode.
path = "src/components/promptbeats/SettingsPanel.tsx"
p = Path(path)
text = p.read_text()
app_section = '''          <section className="relative py-3.5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{el ? "Γλώσσα εφαρμογής" : "App language"}</h3>
              <InfoButton
                infoKey="appLanguage"
                active={info === "appLanguage"}
                onToggle={toggleInfo}
                label={infoLabel}
              />
            </div>
            <LanguageSelector className="mt-2 border-white/10 bg-black/20" />
            {info === "appLanguage" && (
              <InfoPopover>
                {el
                  ? "Αλλάζει τη γλώσσα του περιβάλλοντος του PromptBeats. Η επιλογή αποθηκεύεται στον λογαριασμό σου."
                  : "Changes the PromptBeats interface language. The choice is saved to your account."}
              </InfoPopover>
            )}
          </section>

'''
if app_section not in text:
    raise SystemExit("App language section not found")
text = text.replace(app_section, "", 1)
insert_anchor = '        <div className="divide-y divide-white/10 px-4 pb-5">\n'
if insert_anchor not in text:
    raise SystemExit("Settings list anchor not found")
text = text.replace(insert_anchor, insert_anchor + app_section, 1)
p.write_text(text)

# Regression contracts.
path = "src/lib/settings-preferences.test.ts"
p = Path(path)
text = p.read_text()
closing = "\n});\n"
addition = r'''

  test("Settings orders App language before Generator defaults", async () => {
    const settings = await source("src/components/promptbeats/SettingsPanel.tsx");
    const appLanguage = settings.indexOf('"Γλώσσα εφαρμογής"');
    const generatorLanguage = settings.indexOf('"Προεπιλεγμένη γλώσσα Generator"');
    const generatorMode = settings.indexOf('"Προεπιλεγμένο Generator mode"');
    expect(appLanguage).toBeGreaterThan(-1);
    expect(generatorLanguage).toBeGreaterThan(appLanguage);
    expect(generatorMode).toBeGreaterThan(generatorLanguage);
  });

  test("Generator waits for persisted account mode and clears drafts only on intentional route exit", async () => {
    const generator = await source("src/routes/generate.tsx");
    expect(generator).toContain("signedIn: accountPreferencesReady");
    expect(generator).toContain(
      "if (defaultGeneratorModeAppliedRef.current || !accountPreferencesReady) return",
    );
    expect(generator).toContain('accountPreferences.generatorMode === "advanced"');
    expect(generator).toContain('window.addEventListener("beforeunload", markPageUnload)');
    expect(generator).toContain("if (!generatorPageUnloadRef.current) clearGeneratorDraft()");
  });'''
idx = text.rfind(closing)
if idx < 0:
    raise SystemExit("settings test closing anchor not found")
p.write_text(text[:idx] + addition + text[idx:])
