from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: target not found")
    return text.replace(old, new, 1)

# Library: use the branded onboarding empty state only when the account has no tracks at all.
p = Path("src/routes/library.tsx")
s = p.read_text()
s = replace_once(
    s,
    'import { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";',
    'import { DeletePromptProjectDialog } from "@/components/promptbeats/DeletePromptProjectDialog";\nimport { LibraryTracksEmptyState } from "@/components/promptbeats/LibraryTracksEmptyState";',
    "library empty import",
)
old = '''            <Section
              empty={emptyMyTracks}
              tracks={filteredMyTracks}
              playing={playing}
              currentId={current?.id}
              onPlay={(track) => play(track, myTracks)}
              gridMode={gridMode}
            />'''
new = '''            {myTracks.length === 0 ? (
              <LibraryTracksEmptyState language={language} />
            ) : (
              <Section
                empty={emptyMyTracks}
                tracks={filteredMyTracks}
                playing={playing}
                currentId={current?.id}
                onPlay={(track) => play(track, myTracks)}
                gridMode={gridMode}
              />
            )}'''
s = replace_once(s, old, new, "library track empty state")
p.write_text(s)

# Smart Presets: allow a deep-link to start open and smoothly bring the panel into view.
p = Path("src/components/promptbeats/SmartPresetsPanel.tsx")
s = p.read_text()
s = replace_once(
    s,
    '  onApply: (preset: SmartPreset) => void;\n};',
    '  onApply: (preset: SmartPreset) => void;\n  initiallyOpen?: boolean;\n};',
    "preset prop type",
)
s = replace_once(
    s,
    '  onCulturalStyleChange,\n  onApply,\n}: Props) {',
    '  onCulturalStyleChange,\n  onApply,\n  initiallyOpen = false,\n}: Props) {',
    "preset props destructure",
)
s = replace_once(s, '  const [open, setOpen] = useState(false);', '  const [open, setOpen] = useState(initiallyOpen);\n  const panelRef = useRef<HTMLDivElement>(null);', "preset open state")
needle = '''  useEffect(() => {
    const styleId = culturalStyleId.startsWith("custom:") ? "custom" : culturalStyleId;'''
effect = '''  useEffect(() => {
    if (!initiallyOpen) return;
    setOpen(true);
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initiallyOpen]);

'''
if needle not in s:
    raise SystemExit("preset effect anchor not found")
s = s.replace(needle, effect + needle, 1)
s = replace_once(
    s,
    '    <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">',
    '    <div ref={panelRef} className="scroll-mt-36 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">',
    "preset root ref",
)
p.write_text(s)

# Generator: explicit deep-link contract. Smart Presets are Advanced-only, so deep-link opens Advanced too.
p = Path("src/routes/generate.tsx")
s = p.read_text()
s = replace_once(
    s,
    '    base: z.string().uuid().optional(),\n  }),',
    '    base: z.string().uuid().optional(),\n    presets: z.enum(["open"]).optional(),\n  }),',
    "generate search presets",
)
s = replace_once(
    s,
    '  const [advanced, setAdvanced] = useState(search.mode === "revision");',
    '  const [advanced, setAdvanced] = useState(\n    search.mode === "revision" || search.presets === "open",\n  );',
    "generate advanced init",
)
s = replace_once(
    s,
    '                onCulturalStyleChange={setPresetCulturalStyleId}\n                onApply={applySmartPreset}',
    '                onCulturalStyleChange={setPresetCulturalStyleId}\n                onApply={applySmartPreset}\n                initiallyOpen={search.presets === "open"}',
    "generate preset deep link",
)
p.write_text(s)

# Regression coverage in the existing library suite.
p = Path("src/lib/library-folders.test.ts")
s = p.read_text()
needle = '\n});\n'
test = '''

  test("empty Library guides first-time users to Generator and open Smart Presets", async () => {
    const library = await source("src/routes/library.tsx");
    const emptyState = await source("src/components/promptbeats/LibraryTracksEmptyState.tsx");
    const generator = await source("src/routes/generate.tsx");
    const presets = await source("src/components/promptbeats/SmartPresetsPanel.tsx");

    expect(library).toContain("myTracks.length === 0");
    expect(library).toContain("LibraryTracksEmptyState");
    expect(emptyState).toContain('search={{ presets: "open" }}');
    expect(emptyState).toContain("Χρειάζεσαι έμπνευση;");
    expect(generator).toContain('presets: z.enum(["open"]).optional()');
    expect(generator).toContain('search.presets === "open"');
    expect(generator).toContain('initiallyOpen={search.presets === "open"}');
    expect(presets).toContain("scrollIntoView");
  });'''
idx = s.rfind(needle)
if idx < 0:
    raise SystemExit("library test end not found")
s = s[:idx] + test + s[idx:]
p.write_text(s)

print("library empty state patch applied")
