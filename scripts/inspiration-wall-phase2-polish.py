from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing expected source block: {label}")
    return text.replace(old, new, 1)


route = Path("src/routes/inspiration-wall.tsx")
s = route.read_text()

s = replace_once(
    s,
    '''  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);''',
    '''  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newWallOpen, setNewWallOpen] = useState(false);
  const [newWallTitle, setNewWallTitle] = useState("");
  const [newWallDescription, setNewWallDescription] = useState("");
  const [newWallTheme, setNewWallTheme] = useState<InspirationWallTheme>("neon_studio");''',
    "new wall state",
)

s = replace_once(
    s,
    '''  const createWall = async () => {
    const title = window.prompt(
      language === "el" ? "Όνομα Inspiration Wall" : "Inspiration Wall title",
    );
    if (!title?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createInspirationWall({
        data: { title: title.trim(), selectedTheme: "neon_studio" },
      });
      setSelectedWallId(created.wall.id);
      await refresh(created.wall.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create Inspiration Wall.");
    } finally {
      setBusy(false);
    }
  };''',
    '''  const createWall = async () => {
    const title = newWallTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createInspirationWall({
        data: {
          title,
          description: newWallDescription.trim() || null,
          selectedTheme: newWallTheme,
        },
      });
      setSelectedWallId(created.wall.id);
      setNewWallOpen(false);
      setNewWallTitle("");
      setNewWallDescription("");
      setNewWallTheme("neon_studio");
      await refresh(created.wall.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create Inspiration Wall.");
    } finally {
      setBusy(false);
    }
  };''',
    "new wall creation",
)

s = s.replace("onClick={createWall}", "onClick={() => setNewWallOpen(true)}", 2)
if s.count("onClick={createWall}"):
    raise RuntimeError("Unexpected remaining createWall button")

modal = '''
      {newWallOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-wall-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setNewWallOpen(false);
          }}
        >
          <div className="glass-strong w-full max-w-lg rounded-3xl p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="new-wall-title" className="font-display text-xl font-bold">
                  {language === "el" ? "Νέο Inspiration Wall" : "New Inspiration Wall"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {language === "el"
                    ? "Ξεκίνα από μια ιδέα. Project δεν απαιτείται."
                    : "Start from an idea. A Project is not required."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewWallOpen(false)}
                disabled={busy}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {language === "el" ? "Κλείσιμο" : "Close"}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="new-inspiration-wall-name" className="mb-1.5 block text-xs font-semibold">
                  {language === "el" ? "Τίτλος" : "Title"} *
                </label>
                <input
                  id="new-inspiration-wall-name"
                  autoFocus
                  value={newWallTitle}
                  maxLength={120}
                  onChange={(event) => setNewWallTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newWallTitle.trim() && !busy) void createWall();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-accent/60"
                  placeholder={language === "el" ? "π.χ. Νυχτερινή Θεσσαλονίκη" : "e.g. Midnight City"}
                />
              </div>
              <div>
                <label htmlFor="new-inspiration-wall-description" className="mb-1.5 block text-xs font-semibold">
                  {language === "el" ? "Περιγραφή (προαιρετική)" : "Description (optional)"}
                </label>
                <textarea
                  id="new-inspiration-wall-description"
                  value={newWallDescription}
                  maxLength={2000}
                  onChange={(event) => setNewWallDescription(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-accent/60"
                />
              </div>
              <fieldset>
                <legend className="mb-2 text-xs font-semibold">
                  {language === "el" ? "Θέμα" : "Theme"}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setNewWallTheme(theme.id)}
                      aria-pressed={newWallTheme === theme.id}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                        newWallTheme === theme.id
                          ? "border-accent/60 bg-accent/15 text-accent"
                          : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {theme[language]}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewWallOpen(false)}
                disabled={busy}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {language === "el" ? "Ακύρωση" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void createWall()}
                disabled={busy || !newWallTitle.trim()}
                className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {language === "el" ? "Δημιουργία" : "Create Wall"}
              </button>
            </div>
          </div>
        </div>
      )}
'''
needle = '''        </div>
      </main>
    </AppShell>
  );
}

function WallWorkspace({'''
replacement = '''        </div>
      </main>''' + modal + '''    </AppShell>
  );
}

function WallWorkspace({'''
s = replace_once(s, needle, replacement, "new wall dialog insertion")

s = replace_once(
    s,
    '''  const [adding, setAdding] = useState(false);
  const [wallTitle, setWallTitle] = useState(wall.title);''',
    '''  const [adding, setAdding] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [wallTitle, setWallTitle] = useState(wall.title);''',
    "add card menu state",
)

old_menu = '''          <div className="flex gap-2 overflow-x-auto pb-1">
            {INSPIRATION_WALL_CARD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                disabled={adding}
                onClick={() => void addCard(type)}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                + {CARD_LABELS[type][language]}
              </button>
            ))}
          </div>'''
new_menu = '''          <div className="relative self-start">
            <button
              type="button"
              disabled={adding}
              onClick={() => setAddMenuOpen((open) => !open)}
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/15 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {language === "el" ? "Προσθήκη κάρτας" : "Add Card"}
            </button>
            {addMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-2 grid w-64 grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-popover p-2 shadow-2xl"
              >
                {INSPIRATION_WALL_CARD_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      void addCard(type);
                    }}
                    className="min-h-10 rounded-xl px-3 py-2 text-left text-xs hover:bg-accent/10 hover:text-accent"
                  >
                    {CARD_LABELS[type][language]}
                  </button>
                ))}
              </div>
            )}
          </div>'''
s = replace_once(s, old_menu, new_menu, "add card fast menu")
route.write_text(s)

tests = Path("src/lib/inspiration-wall-phase2.test.ts")
t = tests.read_text()
if "uses an in-product New Wall dialog" not in t:
    insert = '''

  test("uses an in-product New Wall dialog and a compact Add Card fast menu", async () => {
    const code = await source("src/routes/inspiration-wall.tsx");
    expect(code).not.toContain("window.prompt(");
    expect(code).toContain('role="dialog"');
    expect(code).toContain("newWallDescription");
    expect(code).toContain("newWallTheme");
    expect(code).toContain('aria-haspopup="menu"');
    expect(code).toContain('role="menu"');
    expect(code).toContain('role="menuitem"');
  });
'''
    pos = t.rfind("\n});")
    if pos == -1:
        raise RuntimeError("Could not locate Phase 2 test suite end")
    t = t[:pos] + insert + t[pos:]
tests.write_text(t)
