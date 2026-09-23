from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing expected source block: {label}")
    return text.replace(old, new, 1)


styles = Path("src/styles.css")
s = styles.read_text()
marker = '@custom-variant dark (&:is(.dark *));\n'
fonts = '''@font-face {
  font-family: "Pecita";
  src: url("/fonts/inspiration-wall/pecita/Pecita.otf") format("opentype");
  font-display: swap;
}

@font-face {
  font-family: "Caveat";
  src: url("/fonts/inspiration-wall/caveat/Caveat[wght].ttf") format("truetype");
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
}
'''
if 'font-family: "Pecita"' not in s:
    if marker not in s:
        raise RuntimeError("Missing CSS custom variant marker")
    s = s.replace(marker, marker + "\n" + fonts + "\n", 1)

utility_marker = "@utility glass {"
utilities = '''.iw-artistic-title {
  font-family: "Pecita", "Caveat", cursive;
}

.iw-artistic-body {
  font-family: "Caveat", cursive;
}

'''
if ".iw-artistic-title" not in s:
    if utility_marker not in s:
        raise RuntimeError("Missing CSS utility marker")
    s = s.replace(utility_marker, utilities + utility_marker, 1)
styles.write_text(s)

route = Path("src/routes/inspiration-wall.tsx")
s = route.read_text()

s = replace_once(
    s,
    '''  const [adding, setAdding] = useState(false);
  const artistic = wall.selected_theme === "whiteboard" || wall.selected_theme === "corkboard";

  const changeTheme = async (theme: InspirationWallTheme) => {''',
    '''  const [adding, setAdding] = useState(false);
  const [wallTitle, setWallTitle] = useState(wall.title);
  const [wallDescription, setWallDescription] = useState(wall.description ?? "");
  const wallSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artistic = wall.selected_theme === "whiteboard" || wall.selected_theme === "corkboard";

  useEffect(() => {
    setWallTitle(wall.title);
    setWallDescription(wall.description ?? "");
  }, [wall.id, wall.title, wall.description]);

  useEffect(
    () => () => {
      if (wallSaveTimer.current) clearTimeout(wallSaveTimer.current);
    },
    [],
  );

  const queueWallSave = (changes: { title?: string; description?: string }) => {
    if (wallSaveTimer.current) clearTimeout(wallSaveTimer.current);
    wallSaveTimer.current = setTimeout(() => {
      void updateInspirationWall({ data: { wallId: wall.id, ...changes } });
    }, 650);
  };

  const changeTheme = async (theme: InspirationWallTheme) => {''',
    "wall metadata state",
)

s = replace_once(
    s,
    '''          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-bold sm:text-2xl">{wall.title}</h2>
            {wall.description && (
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{wall.description}</p>
            )}
          </div>''',
    '''          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor={`wall-title-${wall.id}`}>
              {language === "el" ? "Τίτλος Wall" : "Wall title"}
            </label>
            <input
              id={`wall-title-${wall.id}`}
              value={wallTitle}
              onChange={(event) => {
                setWallTitle(event.target.value);
                const nextTitle = event.target.value.trim();
                if (nextTitle) queueWallSave({ title: nextTitle });
              }}
              className="w-full bg-transparent font-display text-xl font-bold outline-none sm:text-2xl"
              aria-label={language === "el" ? "Τίτλος Wall" : "Wall title"}
            />
            <label className="sr-only" htmlFor={`wall-description-${wall.id}`}>
              {language === "el" ? "Περιγραφή Wall" : "Wall description"}
            </label>
            <textarea
              id={`wall-description-${wall.id}`}
              value={wallDescription}
              onChange={(event) => {
                setWallDescription(event.target.value);
                queueWallSave({ description: event.target.value });
              }}
              rows={2}
              className="mt-1 w-full max-w-3xl resize-none bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
              placeholder={language === "el" ? "Προαιρετική περιγραφή…" : "Optional description…"}
            />
          </div>''',
    "editable wall metadata",
)

s = replace_once(
    s,
    '''          "relative min-h-[68vh] overflow-hidden rounded-3xl border border-white/10 p-4 sm:p-6",
          themeSurface(wall.selected_theme),
          artistic ? "sm:min-h-[760px]" : "",''',
    '''          "relative min-h-[68vh] rounded-3xl border border-white/10 p-4 sm:p-6",
          themeSurface(wall.selected_theme),
          artistic ? "overflow-auto sm:min-h-[760px]" : "overflow-hidden",''',
    "mobile artistic overflow",
)
s = replace_once(
    s,
    '          <div className="relative min-h-[720px] w-full touch-none">',
    '          <div className="relative min-h-[720px] min-w-[900px] sm:min-w-full">',
    "mobile artistic canvas width",
)

s = replace_once(
    s,
    '''  const [uploading, setUploading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);''',
    '''  const [uploading, setUploading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);''',
    "card error state",
)

s = replace_once(
    s,
    '''    setUploading(true);
    try {
      const optimized = await optimizeInspirationWallImage(file);''',
    '''    setUploading(true);
    setCardError(null);
    try {
      const optimized = await optimizeInspirationWallImage(file);''',
    "upload start",
)
s = replace_once(
    s,
    '''      await updateInspirationWallCard({ data: { cardId: card.id, imageObjectKey: objectKey } });
      await onRefresh();
    } finally {
      setUploading(false);
    }''',
    '''      await updateInspirationWallCard({ data: { cardId: card.id, imageObjectKey: objectKey } });
      await onRefresh();
    } catch (cause) {
      setCardError(cause instanceof Error ? cause.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }''',
    "upload error handling",
)

s = replace_once(
    s,
    '''  const style = artistic
    ? {
        left: position.x,
        top: position.y,
        width:
          card.artistic_layout.size === "large"
            ? 320
            : card.artistic_layout.size === "small"
              ? 190
              : 250,
        transform: `rotate(${card.artistic_layout.rotation ?? 0}deg)`,
      }
    : undefined;

  return (''',
    '''  const changeArtisticLayout = async (
    changes: Partial<InspirationWallCardRecord["artistic_layout"]>,
  ) => {
    await updateInspirationWallCard({
      data: {
        cardId: card.id,
        artisticLayout: { ...card.artistic_layout, ...changes },
      },
    });
    await onRefresh();
  };

  const rotate = (delta: number) => {
    const current = card.artistic_layout.rotation ?? 0;
    const next = Math.max(-8, Math.min(8, current + delta));
    void changeArtisticLayout({ rotation: next });
  };

  const style = artistic
    ? {
        left: position.x,
        top: position.y,
        width:
          card.artistic_layout.size === "large"
            ? 320
            : card.artistic_layout.size === "small"
              ? 190
              : 250,
        transform: `rotate(${card.artistic_layout.rotation ?? 0}deg)`,
      }
    : undefined;

  return (''',
    "artistic layout controls",
)

s = replace_once(
    s,
    '''        "group rounded-2xl border border-black/10 p-3 shadow-xl",
        artistic
          ? "absolute cursor-grab active:cursor-grabbing"''',
    '''        "group rounded-2xl border border-black/10 p-3 shadow-xl",
        artistic
          ? "absolute touch-none cursor-grab active:cursor-grabbing"''',
    "card touch behavior",
)

s = replace_once(
    s,
    '''        <div className="ml-auto flex items-center gap-1">
          <button''',
    '''        <div className="ml-auto flex items-center gap-1">
          {artistic && (
            <>
              <button
                type="button"
                onClick={() => rotate(-2)}
                className="grid h-7 min-w-7 place-items-center rounded-lg px-1 text-xs hover:bg-black/10"
                aria-label={language === "el" ? "Περιστροφή αριστερά" : "Rotate left"}
              >
                ↶
              </button>
              <button
                type="button"
                onClick={() => rotate(2)}
                className="grid h-7 min-w-7 place-items-center rounded-lg px-1 text-xs hover:bg-black/10"
                aria-label={language === "el" ? "Περιστροφή δεξιά" : "Rotate right"}
              >
                ↷
              </button>
              <select
                value={card.artistic_layout.size ?? "medium"}
                onChange={(event) =>
                  void changeArtisticLayout({
                    size: event.target.value as "small" | "medium" | "large",
                  })
                }
                className="h-7 rounded-lg border border-current/15 bg-transparent px-1 text-[10px]"
                aria-label={language === "el" ? "Μέγεθος κάρτας" : "Card size"}
              >
                <option value="small">S</option>
                <option value="medium">M</option>
                <option value="large">L</option>
              </select>
            </>
          )}
          <button''',
    "rotation and size toolbar",
)

s = replace_once(
    s,
    '        className="mt-2 w-full bg-transparent font-semibold outline-none placeholder:opacity-50"',
    '''        className={cn(
          "mt-2 w-full bg-transparent font-semibold outline-none placeholder:opacity-50",
          artistic && "iw-artistic-title text-lg",
        )}''',
    "artistic title font",
)

s = replace_once(
    s,
    '          className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:opacity-50"',
    '''          className={cn(
            "mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:opacity-50",
            artistic && "iw-artistic-body text-base",
          )}''',
    "artistic body font",
)

image_label_end = '''          </label>
        </div>
      )}'''
image_label_error = '''          </label>
          {cardError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {cardError}
            </p>
          )}
        </div>
      )}'''
s = replace_once(s, image_label_end, image_label_error, "image upload error display")

s = replace_once(
    s,
    '''      {artistic && (
        <div
          className="pointer-events-none absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-zinc-300 shadow-md"
          aria-hidden="true"
        />
      )}''',
    '''      {artistic &&
        (theme === "whiteboard" ? (
          <div
            className="pointer-events-none absolute -top-1.5 left-1/2 h-3 w-10 -translate-x-1/2 rounded-md bg-sky-400 shadow-md"
            aria-hidden="true"
          />
        ) : (
          <div
            className="pointer-events-none absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-red-700 shadow-md ring-2 ring-red-300/40"
            aria-hidden="true"
          />
        ))}''',
    "theme fasteners",
)
route.write_text(s)

tests = Path("src/lib/inspiration-wall-phase2.test.ts")
t = tests.read_text()
if "self-host canonical Pecita" not in t:
    insert = '''

  test("artistic themes self-host canonical Pecita and Caveat fonts with OFL notices", async () => {
    const styles = await source("src/styles.css");
    expect(styles).toContain('font-family: "Pecita"');
    expect(styles).toContain('font-family: "Caveat"');
    expect(styles).toContain("/fonts/inspiration-wall/pecita/Pecita.otf");
    expect(styles).toContain("/fonts/inspiration-wall/caveat/Caveat[wght].ttf");
    const pecitaLicense = await source("public/fonts/inspiration-wall/pecita/OFL.txt");
    const caveatLicense = await source("public/fonts/inspiration-wall/caveat/OFL.txt");
    expect(pecitaLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(caveatLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  test("artistic cards expose bounded rotation, size controls and theme-specific fasteners", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    expect(code).toContain("Math.max(-8, Math.min(8, current + delta))");
    expect(code).toContain('option value="small"');
    expect(code).toContain('option value="medium"');
    expect(code).toContain('option value="large"');
    expect(code).toContain('theme === "whiteboard"');
    expect(code).toContain("bg-sky-400");
    expect(code).toContain("bg-red-700");
  });

  test("wall metadata is editable with debounced persistence and artistic mobile canvas scrolls", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    expect(code).toContain("queueWallSave");
    expect(code).toContain("Optional description");
    expect(code).toContain('artistic ? "overflow-auto sm:min-h-[760px]"');
    expect(code).toContain('min-w-[900px] sm:min-w-full');
  });
'''
    pos = t.rfind("\n});")
    if pos == -1:
        raise RuntimeError("Could not locate Phase 2 test suite end")
    t = t[:pos] + insert + t[pos:]
tests.write_text(t)
