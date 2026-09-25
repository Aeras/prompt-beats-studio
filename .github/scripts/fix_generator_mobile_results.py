from pathlib import Path

path = Path('src/routes/generate.tsx')
text = path.read_text()

old = '      <div className="hidden items-center gap-3 md:flex">'
new = '      <div className="flex items-center gap-3">'
if old not in text:
    raise SystemExit('ResultSection desktop-only header pattern not found')
text = text.replace(old, new, 1)

old = '''            <div className="flex items-center justify-between gap-3">
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label={t("generator.mode")}
              >
                {[
                  { key: "basic" as const, label: t("generator.basic") },
                  { key: "advanced" as const, label: t("generator.advanced") },
                  { key: "revision" as const, label: t("generator.revision") },
                ].map((mode) => {
                  const active =
                    mode.key === "revision"
                      ? revisionMode
                      : !revisionMode && advanced === (mode.key === "advanced");
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => changeGeneratorMode(mode.key)}
                      className={
                        active
                          ? "rounded-full border border-transparent bg-gradient-neon px-4 py-1.5 text-xs font-semibold text-primary-foreground glow-neon"
                          : "rounded-full border border-white/10 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                      }
                    >
                      {mode.label}
                    </button>
                  );
                })}
                {advanced && !revisionMode && songSetupFeature.allowed && (
                  <button
                    type="button"
                    onClick={() => setSongSetupAssistantOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("generator.songSetupAssistant")}
                  </button>
                )}
              </div>
              {canClear && !revisionMode && (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={busy || checking}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("generator.clear")}
                </button>
              )}
            </div>'''

new = '''            <div className="space-y-2">
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label={t("generator.mode")}
              >
                {[
                  { key: "basic" as const, label: t("generator.basic") },
                  { key: "advanced" as const, label: t("generator.advanced") },
                  { key: "revision" as const, label: t("generator.revision") },
                ].map((mode) => {
                  const active =
                    mode.key === "revision"
                      ? revisionMode
                      : !revisionMode && advanced === (mode.key === "advanced");
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => changeGeneratorMode(mode.key)}
                      className={
                        active
                          ? "whitespace-nowrap rounded-full border border-transparent bg-gradient-neon px-3 py-1.5 text-xs font-semibold text-primary-foreground glow-neon sm:px-4"
                          : "whitespace-nowrap rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent sm:px-4"
                      }
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              {(advanced && !revisionMode && songSetupFeature.allowed) ||
              (canClear && !revisionMode) ? (
                <div className="flex flex-wrap items-center gap-2">
                  {advanced && !revisionMode && songSetupFeature.allowed && (
                    <button
                      type="button"
                      onClick={() => setSongSetupAssistantOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("generator.songSetupAssistant")}
                    </button>
                  )}
                  {canClear && !revisionMode && (
                    <button
                      onClick={() => setConfirmClear(true)}
                      disabled={busy || checking}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("generator.clear")}
                    </button>
                  )}
                </div>
              ) : null}
            </div>'''

if old not in text:
    raise SystemExit('Generator mode/clear toolbar pattern not found')
text = text.replace(old, new, 1)
path.write_text(text)

# Add focused regression coverage.
test = Path('src/lib/generator-mobile-regression.test.ts')
test.write_text('''import { describe, expect, test } from "bun:test";\nimport { readFile } from "node:fs/promises";\n\nconst source = () => readFile("src/routes/generate.tsx", "utf8");\n\ndescribe("Generator mobile result layout", () => {\n  test("result section headers and copy controls remain visible on mobile", async () => {\n    const generator = await source();\n    expect(generator).toContain('<div className="flex items-center gap-3">');\n    expect(generator).not.toContain('<div className="hidden items-center gap-3 md:flex">');\n    expect(generator).toContain('<CopyButton value={value} />');\n  });\n\n  test("mode controls wrap independently from secondary actions", async () => {\n    const generator = await source();\n    expect(generator).toContain('className="flex flex-wrap items-center gap-2"');\n    expect(generator).toContain('whitespace-nowrap rounded-full');\n    expect(generator).toContain('className="ml-auto inline-flex items-center gap-1.5 rounded-lg');\n  });\n});\n''')

print('Generator mobile results patch applied')
