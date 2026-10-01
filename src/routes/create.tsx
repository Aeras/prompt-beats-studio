import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  FilePenLine,
  FolderOpen,
  ScanSearch,
  Sparkles,
} from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create — PromptBeats" },
      {
        name: "description",
        content: "Start a new song or continue an existing PromptBeats project.",
      },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const { language } = useI18n();
  const el = language === "el";
  const generatorAccess = useFeatureAccess("ai_generator");
  const lyricsReviewAccess = useFeatureAccess("lyrics_review");
  const analyzerAccess = useFeatureAccess("song_analyzer");

  const actions = [
    generatorAccess.allowed
      ? {
          key: "new-song",
          icon: Sparkles,
          title: el ? "Ξεκίνα νέο τραγούδι" : "Start a new song",
          body: el
            ? "Πήγαινε στον Generator με καθαρό context. Μπορείς να δουλέψεις standalone και να αποθηκεύσεις σε Project όταν το θελήσεις."
            : "Open the Generator with a clean context. You can work standalone and save to a Project when you choose.",
          handoff: el
            ? "Μεταφορά: νέο song setup → Generator"
            : "Handoff: new song setup → Generator",
          to: "/generate" as const,
          search: {},
        }
      : null,
    {
      key: "continue-project",
      icon: FolderOpen,
      title: el ? "Συνέχισε ένα Project" : "Continue a Project",
      body: el
        ? "Άνοιξε τα αποθηκευμένα Projects και συνέχισε από το υπάρχον Project Version, χωρίς να δημιουργείται δεύτερο σύστημα εκδόσεων."
        : "Open your saved Projects and continue from the existing Project Version without creating a second version system.",
      handoff: el
        ? "Μεταφορά: Project context → Βιβλιοθήκη / Projects"
        : "Handoff: Project context → Library / Projects",
      to: "/library" as const,
      search: { tab: "prompts" as const },
    },
    lyricsReviewAccess.allowed
      ? {
          key: "review-lyrics",
          icon: FilePenLine,
          title: el ? "Δούλεψε τους στίχους" : "Refine lyrics",
          body: el
            ? "Άνοιξε το Lyrics Review. Όταν ξεκινάς από Project, το Project/Version context παραμένει ο canonical σύνδεσμος."
            : "Open Lyrics Review. When entering from a Project, Project/Version context remains the canonical link.",
          handoff: el
            ? "Μεταφορά: στίχοι / Project context → Lyrics Review"
            : "Handoff: lyrics / Project context → Lyrics Review",
          to: "/lyrics-review" as const,
          search: {},
        }
      : null,
    analyzerAccess.allowed
      ? {
          key: "analyze-audio",
          icon: ScanSearch,
          title: el ? "Ανάλυσε audio" : "Analyze audio",
          body: el
            ? "Πήγαινε στον Song Analyzer για audio που θέλεις να εξετάσεις και, όπου χρειάζεται, σύνδεσέ το με το σωστό Project."
            : "Open Song Analyzer for audio you want to inspect and, when needed, connect it to the correct Project.",
          handoff: el
            ? "Μεταφορά: audio → Song Analyzer"
            : "Handoff: audio → Song Analyzer",
          to: "/song-analyzer" as const,
          search: {},
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: typeof Sparkles;
    title: string;
    body: string;
    handoff: string;
    to: "/generate" | "/library" | "/lyrics-review" | "/song-analyzer";
    search: Record<string, string>;
  }>;

  return (
    <AppShell
      header={
        <div>
          <h1 className="font-display text-xl font-bold">
            {el ? "Δημιουργία" : "Create"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {el
              ? "Ξεκίνα κάτι νέο ή συνέχισε εκεί που σταμάτησες."
              : "Start something new or continue where you left off."}
          </p>
        </div>
      }
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="glass-strong rounded-3xl p-6 sm:p-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Song journey
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {el ? "Τι θέλεις να κάνεις τώρα;" : "What do you want to do now?"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {el
                ? "Το Project είναι το ισχυρότερο context για ένα τραγούδι που εξελίσσεται, αλλά δεν είναι υποχρεωτικό. Μπορείς πάντα να ξεκινήσεις standalone και να οργανώσεις τη δουλειά σου αργότερα."
                : "A Project is the strongest context for a song that keeps evolving, but it is not mandatory. You can always start standalone and organize the work later."}
            </p>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.key}
                to={action.to}
                search={action.search}
                className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition-colors hover:border-accent/35 hover:bg-accent/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/[0.07] text-accent">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-semibold">{action.title}</h3>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {action.body}
                    </p>
                    <p className="mt-3 text-xs font-medium text-accent/90">
                      {action.handoff}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
