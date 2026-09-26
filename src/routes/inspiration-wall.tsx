import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Palette,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  Type,
} from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { InspirationWallDirectionPanel } from "@/components/promptbeats/InspirationWallDirectionPanel";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";
import { useAccountPreferences } from "@/lib/account-preferences";
import { useDraftAutosave } from "@/lib/draft-autosave";
import { supabase } from "@/integrations/supabase/client";
import {
  createInspirationWall,
  createInspirationWallCard,
  deleteInspirationWall,
  deleteInspirationWallCard,
  getInspirationWall,
  listInspirationWalls,
  updateInspirationWall,
  updateInspirationWallCard,
} from "@/lib/inspiration-wall.functions";
import {
  INSPIRATION_WALL_CARD_TYPES,
  inspirationWallImageObjectKey,
  type InspirationWallCardRecord,
  type InspirationWallCardType,
  type InspirationWallTheme,
} from "@/lib/inspiration-wall.shared";
import {
  INSPIRATION_WALL_IMAGE_ACCEPT,
  MAX_INSPIRATION_WALL_IMAGE_BYTES,
  optimizeInspirationWallImage,
} from "@/lib/inspiration-wall-image";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inspiration-wall")({
  head: () => ({
    meta: [
      { title: "Inspiration Wall — PromptBeats" },
      {
        name: "description",
        content:
          "Turn raw creative inspiration into a private visual direction board for your next song.",
      },
    ],
  }),
  component: InspirationWallPage,
});

const THEMES: Array<{ id: InspirationWallTheme; en: string; el: string }> = [
  { id: "whiteboard", en: "Whiteboard", el: "Λευκός πίνακας" },
  { id: "corkboard", en: "Corkboard", el: "Πίνακας φελλού" },
  { id: "neon_studio", en: "Neon Studio", el: "Neon Studio" },
  { id: "clean_studio", en: "Clean Studio", el: "Clean Studio" },
];

const CARD_LABELS: Record<InspirationWallCardType, { en: string; el: string }> = {
  image: { en: "Image", el: "Εικόνα" },
  note: { en: "Note", el: "Σημείωση" },
  text_fragment: { en: "Text Fragment", el: "Απόσπασμα" },
  word: { en: "Word", el: "Λέξη" },
  color: { en: "Color", el: "Χρώμα" },
  scene: { en: "Scene", el: "Σκηνή" },
  constraint: { en: "Constraint", el: "Περιορισμός" },
  question: { en: "Question", el: "Ερώτηση" },
};

function InspirationWallPage() {
  const { language } = useI18n();
  const { user, loading } = useAuth();
  const { preferences } = useAccountPreferences();
  const access = useFeatureAccess("inspiration_wall");
  const queryClient = useQueryClient();
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newWallOpen, setNewWallOpen] = useState(false);
  const [newWallTitle, setNewWallTitle] = useState("");
  const [newWallDescription, setNewWallDescription] = useState("");
  const [newWallTheme, setNewWallTheme] = useState<InspirationWallTheme>("neon_studio");
  const clearNewWallDraft = useDraftAutosave({
    ownerId: user?.id,
    scope: "inspiration-wall:new",
    enabled: newWallOpen && preferences.autoSaveDrafts,
    value: { title: newWallTitle, description: newWallDescription, theme: newWallTheme },
    onRestore: (draft) => {
      setNewWallTitle(draft.title);
      setNewWallDescription(draft.description);
      setNewWallTheme(draft.theme);
    },
    isEmpty: (draft) =>
      !draft.title.trim() && !draft.description.trim() && draft.theme === "neon_studio",
  });

  const walls = useQuery({
    queryKey: ["inspiration-walls", user?.id],
    queryFn: () => listInspirationWalls(),
    enabled: Boolean(user && access.allowed),
  });

  useEffect(() => {
    const firstWall = walls.data?.walls?.[0];
    if (!selectedWallId && firstWall) setSelectedWallId(firstWall.id);
  }, [selectedWallId, walls.data?.walls]);

  const wall = useQuery({
    queryKey: ["inspiration-wall", selectedWallId],
    queryFn: () => getInspirationWall({ data: { wallId: selectedWallId! } }),
    enabled: Boolean(selectedWallId && user && access.allowed),
  });

  const refresh = async (wallId = selectedWallId) => {
    await queryClient.invalidateQueries({ queryKey: ["inspiration-walls", user?.id] });
    if (wallId) await queryClient.invalidateQueries({ queryKey: ["inspiration-wall", wallId] });
  };

  const createWall = async () => {
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
      clearNewWallDraft();
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
  };

  const removeWall = async () => {
    if (!selectedWallId) return;
    if (
      !window.confirm(
        language === "el"
          ? "Διαγραφή αυτού του Inspiration Wall;"
          : "Delete this Inspiration Wall?",
      )
    )
      return;
    setBusy(true);
    try {
      await deleteInspirationWall({ data: { wallId: selectedWallId } });
      setSelectedWallId(null);
      await refresh(null);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <Lightbulb className="h-5 w-5 text-accent" />
      <span className="font-display text-lg font-bold">Inspiration Wall</span>
    </div>
  );

  if (!loading && !user) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
          <div className="glass rounded-3xl p-8 text-center">
            <h1 className="font-display text-2xl font-bold">Inspiration Wall</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {language === "el"
                ? "Συνδέσου για να χρησιμοποιήσεις τον ιδιωτικό δημιουργικό σου χώρο."
                : "Sign in to use your private creative workspace."}
            </p>
            <Link
              to="/auth"
              className="mt-5 inline-flex rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"
            >
              {language === "el" ? "Σύνδεση" : "Sign in"}
            </Link>
          </div>
        </main>
      </AppShell>
    );
  }

  if (!access.isLoading && !access.allowed) {
    return (
      <AppShell header={header}>
        <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
          <div className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground">
            {language === "el"
              ? "Το Inspiration Wall δεν είναι διαθέσιμο για αυτόν τον λογαριασμό."
              : "Inspiration Wall is not available for this account."}
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <main className="mx-auto max-w-[1900px] px-3 pb-20 pt-4 sm:px-4 md:px-8">
        <div className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="glass rounded-3xl p-3 xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)] xl:overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="font-display text-lg font-bold">Wall Library</h1>
                <p className="text-[11px] text-muted-foreground">
                  {language === "el"
                    ? "Ιδιωτικός δημιουργικός χώρος"
                    : "Private creative workspace"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewWallOpen(true)}
                disabled={busy}
                className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-neon text-primary-foreground disabled:opacity-50"
                aria-label={language === "el" ? "Νέο Wall" : "New Wall"}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
              {(walls.data?.walls ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedWallId(item.id)}
                  className={cn(
                    "min-w-[180px] rounded-2xl border px-3 py-3 text-left transition-colors xl:min-w-0",
                    selectedWallId === item.id
                      ? "border-accent/50 bg-accent/10"
                      : "border-white/10 bg-black/10 hover:bg-white/5",
                  )}
                >
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">
                    {
                      THEMES.find((theme) => theme.id === item.selected_theme)?.[
                        language === "el" ? "el" : "en"
                      ]
                    }
                  </div>
                </button>
              ))}
            </div>

            {!walls.isLoading && !(walls.data?.walls ?? []).length && (
              <button
                type="button"
                onClick={() => setNewWallOpen(true)}
                className="mt-5 w-full rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted-foreground hover:border-accent/50 hover:text-accent"
              >
                <Plus className="mx-auto mb-2 h-5 w-5" />
                {language === "el" ? "Δημιούργησε το πρώτο Wall" : "Create your first Wall"}
              </button>
            )}
          </aside>

          <section className="min-w-0">
            {error && (
              <div className="mb-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
            {selectedWallId && wall.data?.wall ? (
              <WallWorkspace
                wall={wall.data.wall}
                cards={wall.data.cards}
                trackLinks={wall.data.trackLinks}
                language={language}
                userId={user!.id}
                onRefresh={() => refresh(selectedWallId)}
                onDeleteWall={removeWall}
              />
            ) : (
              <div className="glass flex min-h-[60vh] items-center justify-center rounded-3xl p-8 text-center text-sm text-muted-foreground">
                {wall.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : language === "el" ? (
                  "Επίλεξε ή δημιούργησε ένα Inspiration Wall."
                ) : (
                  "Select or create an Inspiration Wall."
                )}
              </div>
            )}
          </section>
        </div>
      </main>
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
                <label
                  htmlFor="new-inspiration-wall-name"
                  className="mb-1.5 block text-xs font-semibold"
                >
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
                  placeholder={
                    language === "el" ? "π.χ. Νυχτερινή Θεσσαλονίκη" : "e.g. Midnight City"
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="new-inspiration-wall-description"
                  className="mb-1.5 block text-xs font-semibold"
                >
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
    </AppShell>
  );
}

function WallWorkspace({
  wall,
  cards,
  trackLinks,
  language,
  userId,
  onRefresh,
  onDeleteWall,
}: {
  wall: Awaited<ReturnType<typeof getInspirationWall>>["wall"];
  cards: InspirationWallCardRecord[];
  trackLinks: Awaited<ReturnType<typeof getInspirationWall>>["trackLinks"];
  language: "en" | "el";
  userId: string;
  onRefresh: () => Promise<void>;
  onDeleteWall: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
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

  const changeTheme = async (theme: InspirationWallTheme) => {
    await updateInspirationWall({ data: { wallId: wall.id, selectedTheme: theme } });
    await onRefresh();
  };

  const addCard = async (type: InspirationWallCardType) => {
    setAdding(true);
    try {
      const index = cards.length;
      await createInspirationWallCard({
        data: {
          wallId: wall.id,
          type,
          title: CARD_LABELS[type][language],
          body: type === "color" ? null : "",
          colorValue: type === "color" ? "#7c3aed" : null,
          sortOrder: index,
          artisticLayout: {
            x: 32 + (index % 4) * 210,
            y: 34 + Math.floor(index / 4) * 190,
            rotation: 0,
            size: "medium",
          },
          structuredLayout: { order: index, span: type === "image" ? "wide" : "normal" },
        },
      });
      await onRefresh();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="glass rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
          </div>
          <button
            type="button"
            onClick={() => void onDeleteWall()}
            className="rounded-xl border border-red-400/20 p-2 text-red-300 hover:bg-red-400/10"
            aria-label={language === "el" ? "Διαγραφή Wall" : "Delete Wall"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => void changeTheme(theme.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs",
                  wall.selected_theme === theme.id
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {theme[language]}
              </button>
            ))}
          </div>
          <div className="relative self-start">
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
          </div>
        </div>
      </div>

      <InspirationWallDirectionPanel
        wall={wall}
        trackLinks={trackLinks}
        language={language}
        onRefresh={onRefresh}
      />

      <div
        className={cn(
          "relative min-h-[68vh] rounded-3xl border border-white/10 p-4 sm:p-6",
          themeSurface(wall.selected_theme),
          artistic ? "overflow-auto sm:min-h-[760px]" : "overflow-hidden",
        )}
      >
        {artistic ? (
          <div className="relative min-h-[720px] min-w-[900px] sm:min-w-full">
            {cards.map((card) => (
              <WallCard
                key={card.id}
                card={card}
                wallId={wall.id}
                theme={wall.selected_theme}
                language={language}
                userId={userId}
                artistic
                onRefresh={onRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="grid auto-rows-min gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {[...cards]
              .sort(
                (a, b) =>
                  (a.structured_layout.order ?? a.sort_order) -
                  (b.structured_layout.order ?? b.sort_order),
              )
              .map((card) => (
                <WallCard
                  key={card.id}
                  card={card}
                  wallId={wall.id}
                  theme={wall.selected_theme}
                  language={language}
                  userId={userId}
                  artistic={false}
                  onRefresh={onRefresh}
                />
              ))}
          </div>
        )}

        {!cards.length && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-muted-foreground pointer-events-none">
            {language === "el"
              ? "Πρόσθεσε μια κάρτα για να ξεκινήσεις το Wall."
              : "Add a card to start building your Wall."}
          </div>
        )}
      </div>
    </div>
  );
}

function WallCard({
  card,
  wallId,
  theme,
  language,
  userId,
  artistic,
  onRefresh,
}: {
  card: InspirationWallCardRecord;
  wallId: string;
  theme: InspirationWallTheme;
  language: "en" | "el";
  userId: string;
  artistic: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(card.title ?? "");
  const [body, setBody] = useState(card.body ?? "");
  const [color, setColor] = useState(card.color_value ?? "#7c3aed");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  const [position, setPosition] = useState({
    x: card.artistic_layout.x ?? 24,
    y: card.artistic_layout.y ?? 24,
  });

  useEffect(() => {
    setTitle(card.title ?? "");
    setBody(card.body ?? "");
    setColor(card.color_value ?? "#7c3aed");
    setPosition({ x: card.artistic_layout.x ?? 24, y: card.artistic_layout.y ?? 24 });
  }, [card]);

  useEffect(() => {
    let cancelled = false;
    if (!card.image_object_key) {
      setImageUrl(null);
      return;
    }
    void supabase.storage
      .from("inspiration-wall-images")
      .createSignedUrl(card.image_object_key, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setImageUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [card.image_object_key]);

  const queueSave = (changes: { title?: string; body?: string; colorValue?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateInspirationWallCard({ data: { cardId: card.id, ...changes } });
    }, 650);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const togglePin = async () => {
    await updateInspirationWallCard({ data: { cardId: card.id, isPinned: !card.is_pinned } });
    await onRefresh();
  };

  const remove = async () => {
    await deleteInspirationWallCard({ data: { cardId: card.id } });
    await onRefresh();
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setCardError(null);
    try {
      const optimized = await optimizeInspirationWallImage(file);
      if (optimized.size > MAX_INSPIRATION_WALL_IMAGE_BYTES) throw new Error("Image exceeds 4 MB.");
      const objectKey = inspirationWallImageObjectKey({
        userId,
        wallId,
        cardId: card.id,
        fileName: optimized.name,
      });
      const { error } = await supabase.storage
        .from("inspiration-wall-images")
        .upload(objectKey, optimized, {
          contentType: optimized.type,
          upsert: true,
        });
      if (error) throw error;
      await updateInspirationWallCard({ data: { cardId: card.id, imageObjectKey: objectKey } });
      await onRefresh();
    } catch (cause) {
      setCardError(cause instanceof Error ? cause.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!artistic || (event.target as HTMLElement).closest("input,textarea,button,label")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition({
      x: Math.max(0, drag.baseX + event.clientX - drag.startX),
      y: Math.max(0, drag.baseY + event.clientY - drag.startY),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    void updateInspirationWallCard({
      data: {
        cardId: card.id,
        artisticLayout: { ...card.artistic_layout, x: position.x, y: position.y },
      },
    });
  };

  const changeArtisticLayout = async (
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

  return (
    <article
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={style}
      className={cn(
        "group rounded-2xl border border-black/10 p-3 shadow-xl",
        artistic
          ? "absolute touch-none cursor-grab active:cursor-grabbing"
          : card.structured_layout.span === "wide" && "sm:col-span-2",
        cardSurface(theme, card.type),
      )}
    >
      <div className="flex items-center gap-2">
        <CardIcon type={card.type} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">
          {CARD_LABELS[card.type][language]}
        </span>
        <div className="ml-auto flex items-center gap-1">
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
          <button
            type="button"
            onClick={() => void togglePin()}
            className="grid h-7 w-7 place-items-center rounded-lg hover:bg-black/10"
            aria-label={card.is_pinned ? "Unpin" : "Pin"}
          >
            {card.is_pinned ? (
              <Pin className="h-3.5 w-3.5" />
            ) : (
              <PinOff className="h-3.5 w-3.5 opacity-50" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            className="grid h-7 w-7 place-items-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
            aria-label={language === "el" ? "Διαγραφή κάρτας" : "Delete card"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <input
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          queueSave({ title: event.target.value });
        }}
        className={cn(
          "mt-2 w-full bg-transparent font-semibold outline-none placeholder:opacity-50",
          artistic && "iw-artistic-title text-lg",
        )}
        placeholder={language === "el" ? "Τίτλος" : "Title"}
      />

      {card.type === "image" && (
        <div className="mt-3">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title || "Inspiration"}
              loading="lazy"
              className="max-h-64 w-full rounded-xl object-contain"
            />
          ) : (
            <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-current/20 opacity-60">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
          <label className="mt-2 flex cursor-pointer items-center justify-center rounded-xl border border-current/15 px-3 py-2 text-xs hover:bg-black/5">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : language === "el" ? (
              "Επιλογή εικόνας"
            ) : (
              "Choose image"
            )}
            <input
              type="file"
              accept={INSPIRATION_WALL_IMAGE_ACCEPT}
              disabled={uploading}
              className="hidden"
              onChange={(event) => void uploadImage(event.target.files?.[0])}
            />
          </label>
          {cardError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {cardError}
            </p>
          )}
        </div>
      )}

      {card.type === "color" ? (
        <div className="mt-3 flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              queueSave({ colorValue: event.target.value });
            }}
            className="h-10 w-14 cursor-pointer rounded border-0 bg-transparent"
          />
          <span className="text-xs opacity-70">{color}</span>
        </div>
      ) : (
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            queueSave({ body: event.target.value });
          }}
          rows={card.type === "word" ? 2 : 5}
          className={cn(
            "mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:opacity-50",
            artistic && "iw-artistic-body text-base",
          )}
          placeholder={language === "el" ? "Γράψε την έμπνευσή σου…" : "Capture your inspiration…"}
        />
      )}

      {artistic &&
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
        ))}
    </article>
  );
}

function CardIcon({ type }: { type: InspirationWallCardType }) {
  if (type === "image") return <ImageIcon className="h-4 w-4" />;
  if (type === "color") return <Palette className="h-4 w-4" />;
  if (type === "note") return <StickyNote className="h-4 w-4" />;
  return <Type className="h-4 w-4" />;
}

function themeSurface(theme: InspirationWallTheme) {
  if (theme === "whiteboard") return "bg-[#f4f1e8] text-zinc-900";
  if (theme === "corkboard")
    return "bg-[#9b6a43] text-zinc-950 [background-image:radial-gradient(rgba(55,34,20,.18)_1px,transparent_1px)] [background-size:8px_8px]";
  if (theme === "clean_studio") return "bg-[#f7f7f4] text-zinc-900";
  return "bg-[#090914] text-zinc-100 [background-image:linear-gradient(rgba(120,70,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(120,70,255,.08)_1px,transparent_1px)] [background-size:28px_28px]";
}

function cardSurface(theme: InspirationWallTheme, type: InspirationWallCardType) {
  if (theme === "whiteboard") return type === "note" ? "bg-[#fff2a8]" : "bg-white/95";
  if (theme === "corkboard") return type === "note" ? "bg-[#ffe993]" : "bg-[#fffaf0]";
  if (theme === "clean_studio") return "bg-white text-zinc-900";
  return "border-white/10 bg-[#12121d]/95 text-zinc-100 backdrop-blur";
}
