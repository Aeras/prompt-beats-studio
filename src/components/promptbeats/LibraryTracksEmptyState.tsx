import { Link } from "@tanstack/react-router";
import { ArrowRight, Music2, Plus, Sparkles } from "lucide-react";

export function LibraryTracksEmptyState({ language }: { language: string }) {
  const greek = language === "el";

  return (
    <div className="mt-6 space-y-4">
      <section className="relative overflow-hidden rounded-[28px] border border-accent/25 bg-gradient-to-b from-accent/[0.08] via-card/80 to-card/60 px-5 py-8 text-center shadow-[0_24px_70px_-45px_color-mix(in_oklab,var(--neon)_45%,transparent)] sm:px-8 sm:py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1/4 top-0 h-36 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative mx-auto grid h-28 w-28 place-items-center sm:h-32 sm:w-32">
          <div className="absolute h-20 w-20 rotate-6 rounded-3xl border border-cyan-400/35 bg-cyan-400/10 shadow-[0_0_34px_rgba(34,211,238,0.16)] sm:h-24 sm:w-24" />
          <div className="absolute h-20 w-20 -rotate-6 rounded-3xl border border-fuchsia-400/40 bg-fuchsia-500/10 shadow-[0_0_34px_rgba(217,70,239,0.18)] sm:h-24 sm:w-24" />
          <div className="relative grid h-20 w-20 place-items-center rounded-3xl border border-white/15 bg-black/35 backdrop-blur-xl sm:h-24 sm:w-24">
            <Music2 className="h-10 w-10 text-accent sm:h-12 sm:w-12" />
          </div>
          <Sparkles className="absolute -right-1 top-3 h-5 w-5 text-cyan-300" />
          <Sparkles className="absolute bottom-2 left-0 h-4 w-4 text-fuchsia-300" />
        </div>

        <h2 className="relative mt-4 font-display text-xl font-bold text-foreground sm:text-2xl">
          {greek ? "Δεν έχεις ανεβάσει ακόμη κανένα τραγούδι." : "You haven't added any songs yet."}
        </h2>
        <p className="relative mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {greek
            ? "Δημιούργησε το πρώτο σου τραγούδι με AI ή ξεκίνα από έτοιμες ιδέες."
            : "Create your first song with AI or start from ready-made ideas."}
        </p>

        <Link
          to="/generate"
          search={{}}
          className="relative mx-auto mt-6 inline-flex min-h-12 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-gradient-neon px-5 py-3 text-sm font-bold text-primary-foreground shadow-[0_0_28px_color-mix(in_oklab,var(--neon)_25%,transparent)] transition-transform active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          {greek ? "Δημιούργησε το πρώτο σου τραγούδι" : "Create your first song"}
        </Link>
      </section>

      <Link
        to="/generate"
        search={{ presets: "open" }}
        className="group flex min-h-24 items-center gap-4 rounded-2xl border border-white/10 bg-card/70 p-4 transition-colors hover:border-accent/35 hover:bg-accent/[0.05]"
      >
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-gradient-to-br from-fuchsia-500/15 to-cyan-400/15">
          <Sparkles className="h-7 w-7 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-foreground">
            {greek ? "Χρειάζεσαι έμπνευση;" : "Need inspiration?"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
            {greek
              ? "Ξεκίνα εύκολα με τα Smart Presets και βρες ιδέες για το επόμενο τραγούδι σου."
              : "Start with Smart Presets and discover ideas for your next song."}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
      </Link>
    </div>
  );
}
