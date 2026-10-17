import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Settings, X } from "lucide-react";

import { getSongLanguageOptions } from "@/catalog/song-languages";
import { LanguageSelector } from "@/components/promptbeats/LanguageSelector";
import { useExplicitContentPreference } from "@/components/promptbeats/TrackSourceFilter";
import { useExternalMediaConsent } from "@/lib/external-media-consent";
import { useAccountPreferences, type AccountPreferences } from "@/lib/account-preferences";
import { clearAllDraftAutosaves } from "@/lib/draft-autosave";
import { LIBRARY_TABS } from "@/lib/library-tabs";
import { START_SCREEN_VALUES, type StartScreenPreference } from "@/lib/pb012-starting-screen.shared";
import { useI18n } from "@/i18n";

const EXPORT_FORMATS = [
  { value: "txt", label: "TXT" },
  { value: "md", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "json", label: "JSON" },
] as const;

type InfoKey =
  | "generatorLanguage"
  | "generatorMode"
  | "appLanguage"
  | "startingPage"
  | "libraryTab"
  | "trackPublished"
  | "promptPublic"
  | "lyricsPublic"
  | "allowDownload"
  | "exportFormat"
  | "autoSaveDrafts"
  | "externalMedia"
  | "explicit";

function InfoButton({
  infoKey,
  active,
  onToggle,
  label,
}: {
  infoKey: InfoKey;
  active: boolean;
  onToggle: (key: InfoKey) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      data-settings-info="true"
      aria-label={label}
      aria-expanded={active}
      onClick={() => onToggle(infoKey)}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-accent/45 hover:text-accent"
    >
      <CircleAlert className="h-4 w-4" />
    </button>
  );
}

function InfoPopover({ children }: { children: ReactNode }) {
  return (
    <div
      data-settings-info="true"
      className="absolute right-0 top-9 z-30 w-[min(19rem,calc(100vw-3.5rem))] rounded-xl border border-accent/25 bg-[#101016] p-3 text-xs leading-relaxed text-muted-foreground shadow-2xl"
    >
      {children}
    </div>
  );
}

function Segmented<T extends string | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mt-2 flex flex-nowrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all " +
              (active
                ? "border-accent/60 bg-accent/15 text-accent shadow-[0_0_18px_color-mix(in_oklab,var(--neon)_18%,transparent)]"
                : "border-white/10 text-muted-foreground hover:border-accent/35 hover:text-foreground")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language } = useI18n();
  const external = useExternalMediaConsent();
  const explicit = useExplicitContentPreference();
  const { preferences, setPreference, signedIn, userId } = useAccountPreferences();
  const [info, setInfo] = useState<InfoKey | null>(null);
  const [saveError, setSaveError] = useState("");
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const el = language === "el";
  const songLanguages = useMemo(() => getSongLanguageOptions(language), [language]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setInfo(null);
      setSaveError("");
    }
  }, [open]);

  const save = <K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) => {
    setSaveError("");
    void setPreference(key, value).catch((error) => {
      setSaveError(
        error instanceof Error ? error.message : el ? "Η αποθήκευση απέτυχε." : "Saving failed.",
      );
    });
  };

  const saveAutoSaveDrafts = (value: boolean) => {
    setSaveError("");
    void setPreference("autoSaveDrafts", value)
      .then(() => {
        if (!value) clearAllDraftAutosaves(userId);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : el ? "Η αποθήκευση απέτυχε." : "Saving failed.",
        );
      });
  };

  const toggleInfo = (key: InfoKey) => setInfo((current) => (current === key ? null : key));

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target as Element).closest("[data-settings-info]")) setInfo(null);
    if (event.pointerType === "mouse") return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || !swipeStart.current) return;
    const dx = event.clientX - swipeStart.current.x;
    const dy = event.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) >= 90 && Math.abs(dx) > Math.abs(dy) * 1.35) onClose();
  };

  if (!open || typeof document === "undefined") return null;

  const infoLabel = el ? "Πληροφορίες για τη ρύθμιση" : "Setting information";
  const selectClass =
    "mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-foreground outline-none transition-colors focus:border-accent/60";
  const publicPrivate = [
    { value: true, label: "Public" },
    { value: false, label: "Private" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={el ? "Ρυθμίσεις" : "Settings"}
      onClick={onClose}
    >
      <div
        className="glass-strong max-h-[86dvh] w-full max-w-lg touch-pan-y overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b0f] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b0b0f]/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            <div>
              <h2 className="font-display text-lg font-bold">{el ? "Ρυθμίσεις" : "Settings"}</h2>
              <p className="text-[11px] text-muted-foreground">
                {el ? "Προτιμήσεις εφαρμογής και λογαριασμού" : "App and account preferences"}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={el ? "Κλείσιμο" : "Close"}
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-muted-foreground hover:border-accent/40 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-white/10 px-4 pb-5">
          <section className="relative py-3.5">
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

          {signedIn && (
            <section className="relative py-3.5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{el ? "Αρχική σελίδα" : "Starting page"}</h3>
                <InfoButton infoKey="startingPage" active={info === "startingPage"} onToggle={toggleInfo} label={infoLabel} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {el ? "Επίλεξε τι θα ανοίγει πρώτο όταν μπαίνεις στο PromptBeats." : "Choose what opens first when you enter PromptBeats."}
              </p>
              <select
                value={preferences.defaultStartScreen}
                onChange={(event) => save("defaultStartScreen", event.target.value as StartScreenPreference)}
                className={selectClass}
                aria-label={el ? "Αρχική σελίδα" : "Starting page"}
              >
                {START_SCREEN_VALUES.map((value) => (
                  <option key={value} value={value}>{({
                    home: el ? "Αρχική" : "Home",
                    last_work: el ? "Τελευταία εργασία" : "Last Work",
                    projects: "Projects",
                    my_songs: el ? "Τα τραγούδια μου" : "My Songs",
                    playlists: "Playlists",
                    generator: "Generator",
                    song_universe: "Song Universe",
                    inspiration_wall: "Inspiration Wall",
                    story_map: "Story Map",
                    discover: el ? "Ανακάλυψη" : "Discover",
                    create: el ? "Δημιουργία" : "Create",
                  } satisfies Record<StartScreenPreference, string>)[value]}</option>
                ))}
              </select>
              {info === "startingPage" && (
                <InfoPopover>
                  {el ? "Η Τελευταία εργασία επιστρέφει στο τελευταίο υποστηριζόμενο σημείο εργασίας σου." : "Last Work returns to your last supported work destination."}
                </InfoPopover>
              )}
            </section>
          )}

          {signedIn && (
            <>
              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένη γλώσσα Generator" : "Default Generator language"}
                  </h3>
                  <InfoButton
                    infoKey="generatorLanguage"
                    active={info === "generatorLanguage"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <select
                  value={preferences.generatorLanguage}
                  onChange={(event) => save("generatorLanguage", event.target.value)}
                  className={selectClass}
                >
                  <option value="">{el ? "Χωρίς προεπιλογή" : "No default"}</option>
                  {songLanguages.map((item) => (
                    <option key={item.code} value={item.value} className="bg-[#0b0b0f]">
                      {item.label}
                    </option>
                  ))}
                </select>
                {info === "generatorLanguage" && (
                  <InfoPopover>
                    {el
                      ? "Η γλώσσα που θα είναι ήδη επιλεγμένη όταν ανοίγεις έναν νέο Generator. Χρησιμοποιεί την ίδια λίστα γλωσσών με τον Generator."
                      : "The language preselected when you open a new Generator. It uses the same language catalog as the Generator."}
                  </InfoPopover>
                )}
              </section>

              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένο Generator mode" : "Default Generator mode"}
                  </h3>
                  <InfoButton
                    infoKey="generatorMode"
                    active={info === "generatorMode"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <Segmented
                  value={preferences.generatorMode}
                  options={[
                    { value: "basic", label: el ? "Βασικό" : "Basic" },
                    { value: "advanced", label: el ? "Προηγμένο" : "Advanced" },
                  ]}
                  onChange={(value) => save("generatorMode", value)}
                />
                {info === "generatorMode" && (
                  <InfoPopover>
                    {el
                      ? "Ορίζει αν ένας νέος Generator θα ανοίγει αρχικά σε Βασικό ή Προηγμένο mode. Δεν αλλάζει υπάρχον Project ή Revision."
                      : "Chooses whether a fresh Generator opens in Basic or Advanced mode. Existing Projects and Revisions are not changed."}
                  </InfoPopover>
                )}
              </section>
            </>
          )}

          {signedIn && (
            <>
              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Αυτόματη αποθήκευση drafts" : "Auto-save drafts"}
                  </h3>
                  <InfoButton
                    infoKey="autoSaveDrafts"
                    active={info === "autoSaveDrafts"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <Segmented
                  value={preferences.autoSaveDrafts}
                  options={[
                    { value: true, label: el ? "Ενεργό" : "On" },
                    { value: false, label: el ? "Ανενεργό" : "Off" },
                  ]}
                  onChange={saveAutoSaveDrafts}
                />
                {info === "autoSaveDrafts" && (
                  <InfoPopover>
                    {el
                      ? "Κρατά τοπικά στον browser τις μη ολοκληρωμένες αλλαγές στα δημιουργικά editors και τις επαναφέρει μετά από refresh, κλείσιμο ή επιστροφή. Οι κανονικές αποθηκεύσεις και τα Project versions παραμένουν η επίσημη πηγή αλήθειας. Αν το απενεργοποιήσεις, διαγράφονται τα τοπικά drafts αυτής της συσκευής."
                      : "Keeps unfinished changes locally in this browser across creative editors and restores them after refresh, closing, or returning. Explicit saves and Project versions remain the canonical source of truth. Turning this off clears local drafts on this device."}
                  </InfoPopover>
                )}
              </section>

              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένη καρτέλα Βιβλιοθήκης" : "Default Library tab"}
                  </h3>
                  <InfoButton
                    infoKey="libraryTab"
                    active={info === "libraryTab"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <select
                  value={preferences.libraryTab}
                  onChange={(event) =>
                    save("libraryTab", event.target.value as AccountPreferences["libraryTab"])
                  }
                  className={selectClass}
                >
                  {LIBRARY_TABS.map((tab) => (
                    <option key={tab.id} value={tab.id} className="bg-[#0b0b0f]">
                      {tab.label[language]}
                    </option>
                  ))}
                </select>
                {info === "libraryTab" && (
                  <InfoPopover>
                    {el
                      ? "Η καρτέλα που θα ανοίγει από προεπιλογή όταν μπαίνεις στη Βιβλιοθήκη. Η λίστα προέρχεται από τις πραγματικές καρτέλες της Βιβλιοθήκης."
                      : "The tab opened by default when you enter the Library. The list comes from the Library's canonical tab registry."}
                  </InfoPopover>
                )}
              </section>

              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el
                      ? "Προεπιλεγμένη ορατότητα νέου τραγουδιού"
                      : "Default new-track visibility"}
                  </h3>
                  <InfoButton
                    infoKey="trackPublished"
                    active={info === "trackPublished"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <Segmented
                  value={preferences.trackPublished}
                  options={publicPrivate}
                  onChange={(value) => save("trackPublished", value)}
                />
                {info === "trackPublished" && (
                  <InfoPopover>
                    {el
                      ? "Καθορίζει αν ένα νέο τραγούδι στην Υποβολή τραγουδιού ξεκινά ως Public ή Private. Μπορείς πάντα να το αλλάξεις πριν την υποβολή."
                      : "Sets whether a new track in Submit Track starts as Public or Private. You can still change it before publishing."}
                  </InfoPopover>
                )}
              </section>

              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένη ορατότητα Prompt" : "Default Prompt visibility"}
                  </h3>
                  <InfoButton
                    infoKey="promptPublic"
                    active={info === "promptPublic"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <Segmented
                  value={preferences.promptPublic}
                  options={publicPrivate}
                  onChange={(value) => save("promptPublic", value)}
                />
                {info === "promptPublic" && (
                  <InfoPopover>
                    {el
                      ? "Καθορίζει την αρχική ορατότητα του Prompt σε κάθε νέο τραγούδι που υποβάλλεις."
                      : "Sets the initial Prompt visibility for each new track you submit."}
                  </InfoPopover>
                )}
              </section>

              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένη ορατότητα Lyrics" : "Default Lyrics visibility"}
                  </h3>
                  <InfoButton
                    infoKey="lyricsPublic"
                    active={info === "lyricsPublic"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <Segmented
                  value={preferences.lyricsPublic}
                  options={publicPrivate}
                  onChange={(value) => save("lyricsPublic", value)}
                />
                {info === "lyricsPublic" && (
                  <InfoPopover>
                    {el
                      ? "Καθορίζει την αρχική ορατότητα των Lyrics σε κάθε νέο τραγούδι που υποβάλλεις."
                      : "Sets the initial Lyrics visibility for each new track you submit."}
                  </InfoPopover>
                )}
              </section>

              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένη δυνατότητα Download" : "Default download permission"}
                  </h3>
                  <InfoButton
                    infoKey="allowDownload"
                    active={info === "allowDownload"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <Segmented
                  value={preferences.allowDownload}
                  options={[
                    { value: true, label: el ? "Επιτρέπεται" : "Allowed" },
                    { value: false, label: el ? "Δεν επιτρέπεται" : "Not allowed" },
                  ]}
                  onChange={(value) => save("allowDownload", value)}
                />
                {info === "allowDownload" && (
                  <InfoPopover>
                    {el
                      ? "Καθορίζει αν τα νέα uploaded τραγούδια επιτρέπουν λήψη από άλλους εγγεγραμμένους χρήστες."
                      : "Sets whether newly uploaded tracks allow downloads by other signed-in users."}
                  </InfoPopover>
                )}
              </section>

              <section className="relative py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {el ? "Προεπιλεγμένη μορφή Export" : "Default Export format"}
                  </h3>
                  <InfoButton
                    infoKey="exportFormat"
                    active={info === "exportFormat"}
                    onToggle={toggleInfo}
                    label={infoLabel}
                  />
                </div>
                <select
                  value={preferences.exportFormat}
                  onChange={(event) =>
                    save("exportFormat", event.target.value as AccountPreferences["exportFormat"])
                  }
                  className={selectClass}
                >
                  {EXPORT_FORMATS.map((format) => (
                    <option key={format.value} value={format.value} className="bg-[#0b0b0f]">
                      {format.label}
                    </option>
                  ))}
                </select>
                {info === "exportFormat" && (
                  <InfoPopover>
                    {el
                      ? "Η μορφή που θα είναι ήδη επιλεγμένη όταν ανοίγεις το Export Center."
                      : "The format preselected when you open the Export Center."}
                  </InfoPopover>
                )}
              </section>
            </>
          )}

          <section className="relative py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {el ? "Εξωτερικά μέσα" : "External media"}
                </h3>
                <p
                  className={
                    "mt-1 text-xs font-semibold " +
                    (external.enabled ? "text-accent" : "text-muted-foreground")
                  }
                >
                  {external.enabled
                    ? el
                      ? "Επιτρέπονται"
                      : "Allowed"
                    : el
                      ? "Μπλοκαρισμένα"
                      : "Blocked"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <InfoButton
                  infoKey="externalMedia"
                  active={info === "externalMedia"}
                  onToggle={toggleInfo}
                  label={infoLabel}
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={external.enabled}
                  onClick={() => external.setEnabled(!external.enabled)}
                  className={
                    "relative h-7 w-12 shrink-0 rounded-full border transition-colors " +
                    (external.enabled
                      ? "border-accent/60 bg-accent/35"
                      : "border-white/15 bg-white/5")
                  }
                >
                  <span
                    className={
                      "absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-transform " +
                      (external.enabled ? "translate-x-5" : "translate-x-0")
                    }
                  />
                </button>
              </div>
            </div>
            {info === "externalMedia" && (
              <InfoPopover>
                {el
                  ? "Επιτρέπει τη φόρτωση embedded players από υπηρεσίες τρίτων, όπως Suno και Udio. Η άδεια ισχύει μόνο σε αυτόν τον browser/συσκευή."
                  : "Allows embedded players from third-party services such as Suno and Udio. This permission applies only to this browser/device."}
              </InfoPopover>
            )}
          </section>

          <section className="relative py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {el ? "Απόκρυψη explicit τραγουδιών" : "Hide explicit tracks"}
                </h3>
                <p
                  className={
                    "mt-1 text-xs font-semibold " +
                    (explicit.hideExplicit ? "text-accent" : "text-muted-foreground")
                  }
                >
                  {explicit.hideExplicit
                    ? el
                      ? "Explicit τραγούδια: αποκρύπτονται"
                      : "Explicit tracks: hidden"
                    : el
                      ? "Explicit τραγούδια: εμφανίζονται"
                      : "Explicit tracks: visible"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <InfoButton
                  infoKey="explicit"
                  active={info === "explicit"}
                  onToggle={toggleInfo}
                  label={infoLabel}
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={explicit.hideExplicit}
                  aria-label={el ? "Απόκρυψη explicit τραγουδιών" : "Hide explicit tracks"}
                  onClick={() => void explicit.setHideExplicit(!explicit.hideExplicit)}
                  className={
                    "relative h-7 w-12 shrink-0 rounded-full border transition-colors " +
                    (explicit.hideExplicit
                      ? "border-accent/60 bg-accent/35"
                      : "border-white/15 bg-white/5")
                  }
                >
                  <span
                    className={
                      "absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-transform " +
                      (explicit.hideExplicit ? "translate-x-5" : "translate-x-0")
                    }
                  />
                </button>
              </div>
            </div>
            {info === "explicit" && (
              <InfoPopover>
                {el
                  ? "Όταν είναι ενεργό, τραγούδια που έχουν σημανθεί ως Explicit κρύβονται από λίστες, προφίλ δημιουργών και σελίδες τραγουδιών. Η επιλογή αποθηκεύεται στον λογαριασμό σου."
                  : "When enabled, tracks marked Explicit are hidden from lists, creator profiles, and track pages. This choice is saved to your account."}
              </InfoPopover>
            )}
          </section>

          {!signedIn && (
            <p className="py-3 text-xs text-muted-foreground">
              {el
                ? "Συνδέσου για να αποθηκεύσεις μόνιμες προεπιλογές Generator, Βιβλιοθήκης, Υποβολής και Export."
                : "Sign in to save permanent Generator, Library, Submit Track, and Export defaults."}
            </p>
          )}
          {saveError && <p className="pt-3 text-xs text-red-400">{saveError}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
