import { useI18n } from "@/i18n";
import { footballTeamDisplayName } from "@/lib/football-ai-team-names.shared";
import type { FootballEspnContext } from "@/lib/football-espn-context.shared";

type Team = FootballEspnContext["home"];
type Metric = Team["teamStatistics"][number];
type Person = Team["roster"][number];

function Metrics({ title, items }: { title: string; items: Metric[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold text-cyan-200">
        {title} ({items.length})
      </summary>
      {items.length ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {items.map((item, index) => (
            <div key={item.name + index}>
              <dt className="text-slate-400">{item.name}</dt>
              <dd className="font-semibold text-white">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-amber-200">Δεν επιστράφηκαν στοιχεία</p>
      )}
    </details>
  );
}

function People({ title, items, empty }: { title: string; items: Person[]; empty: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold text-cyan-200">
        {title} ({items.length})
      </summary>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-200">
          {items.map((item) => (
            <li key={item.name}>
              {item.name}
              {item.detail ? " · " + item.detail : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-amber-200">{empty}</p>
      )}
    </details>
  );
}

export function FootballTeamData({ side }: { side: Team }) {
  const { language } = useI18n();
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-[#111c2c] p-3">
      <h4 className="text-base font-bold text-white">
        {footballTeamDisplayName(side.name, language)}
      </h4>
      <p className="mt-1 text-xs text-slate-300">
        Βαθμολογική θέση: {side.standing?.rank ?? "Μη διαθέσιμη"}
      </p>
      <Metrics title="Στατιστικά βαθμολογίας" items={side.standing?.metrics ?? []} />
      <Metrics title="Αναλυτικά στατιστικά ομάδας" items={side.teamStatistics} />
      <details className="mt-3" open>
        <summary className="cursor-pointer text-sm font-semibold text-cyan-200">
          Τελευταία αποτελέσματα ({side.recentResults.length})
        </summary>
        {side.recentResults.length ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-200">
            {side.recentResults.map((game) => (
              <li key={game.id + game.kickoffUtc}>
                {game.kickoffUtc.slice(0, 10)} · {game.homeAway === "home" ? "Εντός" : "Εκτός"}
                {" · "}
                {footballTeamDisplayName(game.opponent, language)} · {game.goalsFor}–
                {game.goalsAgainst}
                {game.xg !== undefined && game.xga !== undefined
                  ? ` · xG ${game.xg} / xGA ${game.xga}`
                  : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-amber-200">Δεν επιστράφηκαν στοιχεία</p>
        )}
      </details>
      <People title="Ρόστερ / ενδεκάδα" items={side.roster} empty="Δεν επιστράφηκαν στοιχεία" />
      <People
        title="Αναφορές απουσιών"
        items={side.injuries}
        empty="Δεν επιστράφηκαν αναφορές. Αυτό δεν αποδεικνύει ότι δεν υπάρχουν απουσίες."
      />
      <Metrics title="Στοιχεία συγκεκριμένου αγώνα" items={side.matchStatistics} />
      {!!side.previewStatistics?.length && (
        <Metrics title="Στοιχεία προεπισκόπησης / σεζόν" items={side.previewStatistics} />
      )}
    </div>
  );
}

/** Bounded provider data, without treating missing fields as zero. */
export function EspnDataPanel({ data }: { data: FootballEspnContext }) {
  return (
    <section
      aria-label="Στοιχεία ESPN ομάδων"
      className="space-y-3 rounded-2xl border border-cyan-400/25 bg-[#101b30] p-4"
    >
      <div>
        <h3 className="font-bold text-cyan-200">Στοιχεία ομάδων · ESPN</h3>
        <p className="text-xs text-slate-400">
          Ανάκτηση: {new Date(data.fetchedAtUtc).toLocaleString("el-GR")} · Στοιχεία παρόχου, όχι
          εγγύηση πληρότητας ή ακρίβειας. Δεν εκτελείται AI.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FootballTeamData side={data.home} />
        <FootballTeamData side={data.away} />
      </div>
      <div className="text-xs text-slate-300">
        <p className="font-semibold text-amber-200">Κενά δεδομένων</p>
        {data.missing.length ? (
          <ul className="mt-1 list-inside list-disc space-y-1">
            {data.missing.map((missing) => (
              <li key={missing}>{missing}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">Όλες οι ελεγχόμενες κατηγορίες επέστρεψαν κάποια στοιχεία.</p>
        )}
        <p className="mt-2">
          Όσα λείπουν θα αποτελέσουν στόχο συμπληρωματικής αναζήτησης κατά την επί πληρωμή ανάλυση.
          Η διαθεσιμότητα διαφέρει ανά διοργάνωση και ημερομηνία.
        </p>
      </div>
    </section>
  );
}
