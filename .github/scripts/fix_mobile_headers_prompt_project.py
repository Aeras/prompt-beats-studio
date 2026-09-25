from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing pattern in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, count))

# 1) Lyrics Review header icon.
path = "src/routes/lyrics-review.tsx"
replace(path, "  Languages,\n  Loader2,", "  Languages,\n  ListMusic,\n  Loader2,")
replace(
    path,
    '''function HeaderTitle({ el }: { el: boolean }) {\n  return (\n    <div>\n      <p className="font-display text-lg font-bold">Lyrics Review</p>\n      <p className="text-[11px] text-muted-foreground">\n        {el ? "Meter, Rhyme & Singability" : "Meter, Rhyme & Singability"}\n      </p>\n    </div>\n  );\n}''',
    '''function HeaderTitle({ el }: { el: boolean }) {\n  return (\n    <div className="flex items-center gap-2.5">\n      <ListMusic className="h-5 w-5 shrink-0 text-accent" />\n      <div className="min-w-0">\n        <p className="font-display text-lg font-bold">Lyrics Review</p>\n        <p className="text-[11px] text-muted-foreground">\n          {el ? "Meter, Rhyme & Singability" : "Meter, Rhyme & Singability"}\n        </p>\n      </div>\n    </div>\n  );\n}''',
)

# 1b) Song Universes header icon.
path = "src/routes/song-universe.tsx"
replace(
    path,
    'import { Archive, ChevronDown, ChevronUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";',
    'import { Archive, ChevronDown, ChevronUp, Loader2, Orbit, Plus, Sparkles, Trash2 } from "lucide-react";',
)
replace(
    path,
    '''      header={\n        <div>\n          <h1 className="font-display text-xl font-bold">Song Universes</h1>\n          <p className="text-xs text-muted-foreground">\n            {el\n              ? "Κοινή δημιουργική ταυτότητα για πολλά τραγούδια."\n              : "Build a shared creative world across multiple songs."}\n          </p>\n        </div>\n      }''',
    '''      header={\n        <div className="flex items-center gap-2.5">\n          <Orbit className="h-5 w-5 shrink-0 text-accent" />\n          <div className="min-w-0">\n            <h1 className="font-display text-xl font-bold">Song Universes</h1>\n            <p className="text-xs text-muted-foreground">\n              {el\n                ? "Κοινή δημιουργική ταυτότητα για πολλά τραγούδια."\n                : "Build a shared creative world across multiple songs."}\n            </p>\n          </div>\n        </div>\n      }''',
)

# 2) AI Generator: one header only, start directly at target platform.
path = "src/routes/generate.tsx"
replace(path, "  Wand2,\n  ArrowLeft,\n} from \"lucide-react\";\nimport logoAsset from \"@/assets/logo.png.asset.json\";", "  Wand2,\n} from \"lucide-react\";")
replace(
    path,
    '''        <div className="mx-auto max-w-3xl">\n          <Link\n            to="/"\n            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"\n          >\n            <ArrowLeft className="h-4 w-4" /> {t("generator.backToFeed")}\n          </Link>\n          <div className="mt-4 flex items-center gap-3">\n            <img\n              src={logoAsset.url}\n              alt="PromptBeats logo"\n              width={40}\n              height={40}\n              className="h-10 w-10 shrink-0 rounded-xl glow-neon"\n            />\n            <div className="min-w-0">\n              <h1 className="font-display text-2xl font-bold tracking-tight">\n                {t("generator.title")}\n              </h1>\n              <p className="truncate text-xs text-muted-foreground">\n                {t("generator.optimizedFor")}\n              </p>\n            </div>\n          </div>\n\n          <div className="glass-strong mt-6 space-y-4 rounded-3xl p-5 sm:p-6">''',
    '''        <div className="mx-auto max-w-3xl">\n          <div className="glass-strong space-y-4 rounded-3xl p-5 sm:p-6">''',
)

# 2b) Trending: remove duplicated page title/subtitle; controls become first content row.
path = "src/routes/trending.tsx"
replace(
    path,
    '''        <div>\n          <h1 className="font-display text-2xl font-bold md:text-3xl">\n            <span className="text-gradient-neon">{t("trending.title")}</span>\n          </h1>\n          <p className="mt-1 text-sm text-muted-foreground">{t("trending.subtitle")}</p>\n          <div className="mt-3 flex w-full items-center justify-between gap-3">\n            <TrackSourceFilter value={trackSource} onChange={setTrackSource} language={language} />\n            <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />\n          </div>\n        </div>''',
    '''        <div className="flex w-full items-center justify-between gap-3">\n          <TrackSourceFilter value={trackSource} onChange={setTrackSource} language={language} />\n          <TrackGridModeToggle mode={gridMode} onChange={setGridMode} />\n        </div>''',
)

# 3) Prompt -> Project assignment: invalidate folder-backed views and verify DB update.
path = "src/routes/library.tsx"
replace(
    path,
    '''  const refresh = () =>\n    Promise.all([\n      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),\n      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),\n    ]);''',
    '''  const refresh = () =>\n    Promise.all([\n      queryClient.invalidateQueries({ queryKey: ["library", "prompts"], exact: false }),\n      queryClient.invalidateQueries({ queryKey: ["library", "prompt-projects"], exact: false }),\n      queryClient.invalidateQueries({ queryKey: ["library", "folder-contents"], exact: false }),\n      queryClient.invalidateQueries({ queryKey: ["library", "folder-scope-search"], exact: false }),\n    ]);''',
    1,
)
replace(
    path,
    '''  const move = async (projectId: string) => {\n    const next = projectId || null;\n    await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next } });\n    await refresh();\n  };''',
    '''  const move = async (projectId: string) => {\n    const next = projectId || null;\n    setMovingToProject(true);\n    try {\n      await updateSavedPromptOrganization({ data: { id: prompt.id, project_id: next } });\n      await refresh();\n    } finally {\n      setMovingToProject(false);\n    }\n  };''',
)
replace(
    path,
    '''              value={prompt.project_id ?? ""}\n              onChange={(e) => move(e.target.value)}\n              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs"''',
    '''              value={prompt.project_id ?? ""}\n              onChange={(e) => void move(e.target.value)}\n              disabled={movingToProject}\n              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs disabled:opacity-60"''',
)

path = "src/lib/ai.functions.ts"
replace(
    path,
    '''    const { error } = await context.supabase\n      .from("saved_prompts")\n      .update(patch)\n      .eq("id", data.id)\n      .eq("user_id", context.userId);\n    if (error) throw new Error(error.message);\n    return { ok: true };''',
    '''    const { data: updated, error } = await context.supabase\n      .from("saved_prompts")\n      .update(patch)\n      .eq("id", data.id)\n      .eq("user_id", context.userId)\n      .select("id, project_id, version_number")\n      .maybeSingle();\n    if (error) throw new Error(error.message);\n    if (!updated) throw new Error("Prompt update did not persist.");\n    if (data.project_id !== undefined && updated.project_id !== data.project_id) {\n      throw new Error("Prompt project assignment did not persist.");\n    }\n    return {\n      ok: true,\n      projectId: updated.project_id,\n      versionNumber: updated.version_number,\n    };''',
)

# Focused regression coverage for the agreed UI and cache behavior.
test_path = Path("src/lib/mobile-page-consistency.test.ts")
test_path.write_text('''import { describe, expect, test } from "bun:test";\nimport { readFile } from "node:fs/promises";\n\nconst source = (path: string) => readFile(path, "utf8");\n\ndescribe("mobile page header consistency and prompt assignment", () => {\n  test("Lyrics Review and Song Universes have header icons", async () => {\n    const lyrics = await source("src/routes/lyrics-review.tsx");\n    const universe = await source("src/routes/song-universe.tsx");\n    expect(lyrics).toContain("<ListMusic");\n    expect(universe).toContain("<Orbit");\n  });\n\n  test("Generator and Trending do not repeat their page headers", async () => {\n    const generator = await source("src/routes/generate.tsx");\n    const trending = await source("src/routes/trending.tsx");\n    expect(generator).not.toContain('t("generator.backToFeed")');\n    expect(generator).not.toContain('t("generator.optimizedFor")');\n    expect(generator).not.toContain('t("generator.title")');\n    expect(trending).not.toContain('t("trending.subtitle")');\n    expect((trending.match(/t\\(\"trending.title\"\\)/g) ?? []).length).toBe(1);\n  });\n\n  test("Prompt assignment refreshes folder-backed library views and verifies persistence", async () => {\n    const library = await source("src/routes/library.tsx");\n    const ai = await source("src/lib/ai.functions.ts");\n    expect(library).toContain('["library", "folder-contents"]');\n    expect(library).toContain('["library", "folder-scope-search"]');\n    expect(library).toContain("disabled={movingToProject}");\n    expect(ai).toContain("Prompt project assignment did not persist.");\n    expect(ai).toContain('.select("id, project_id, version_number")');\n  });\n});\n''')
print("patch applied")
