import { useI18n } from "@/i18n";
import { footballTeamDisplayName } from "@/lib/football-ai-team-names.shared";
import { FOOTBALL_AI_DISCOVERY_LEAGUES } from "@/lib/football-research.shared";
import {
  FOOTBALL_EVIDENCE_LABELS,
  EVIDENCE_STATUS_LABELS,
  type FootballProviderEvidence,
} from "@/lib/football-provider-evidence.shared";
import { FootballTeamData } from "./EspnDataPanel";

/** Exact persisted server snapshot; never triggers a new provider or AI request. */
export function ProviderEvidencePanel({ data }: { data: FootballProviderEvidence }) {
  const { language } = useI18n();
  return (
    <section
      aria-label="Στοιχεία όλων των παρόχων"
      className="min-w-0 space-y-3 rounded-2xl border border-cyan-400/25 bg-[#101b30] p-4"
    >
      <h3 className="font-bold text-cyan-200">Στοιχεία όλων των παρόχων</h3>
      <p className="text-xs text-slate-300">
        {footballTeamDisplayName(data.fixture.homeTeam, language)} –{" "}
        {footballTeamDisplayName(data.fixture.awayTeam, language)} ·{" "}
        {FOOTBALL_AI_DISCOVERY_LEAGUES.find((l) => l.id === data.fixture.leagueId)?.label ??
          data.fixture.leagueId}
      </p>
      <p className="text-xs text-slate-400">
        Συλλογή: {new Date(data.collectedAtUtc).toLocaleString("el-GR")} · Κάθε πηγή διατηρεί τις
        δικές της τιμές. Δεν εκτελείται AI.
      </p>
      {data.conflicts.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-400/40 p-3 text-sm text-amber-200"
        >
          {data.conflicts.map((c, i) => (
            <p key={i}>{c}</p>
          ))}
        </div>
      )}
      {data.providers.map((source) => (
        <details key={source.provider} className="min-w-0 rounded-xl border border-white/15 p-3">
          <summary className="cursor-pointer break-words text-sm font-semibold text-cyan-100">
            {FOOTBALL_EVIDENCE_LABELS[source.provider]} · {EVIDENCE_STATUS_LABELS[source.status]}
          </summary>
          <div className="mt-3 space-y-3">
            {(source.home || source.away) && (
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                {source.home && <FootballTeamData side={source.home} />}
                {source.away && <FootballTeamData side={source.away} />}
              </div>
            )}
            {source.notes.map((note, i) => (
              <p className="break-words text-xs text-slate-300" key={i}>
                {note}
              </p>
            ))}
            {source.resources.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-slate-300">
                  Προέλευση και κατάσταση ανάκτησης ({source.resources.length})
                </summary>
                <ul className="mt-2 space-y-2 text-xs">
                  {source.resources.map((resource, i) => (
                    <li key={i} className="break-all">
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-200 underline"
                      >
                        {new URL(resource.url).hostname + new URL(resource.url).pathname}
                      </a>
                      <span className="block text-slate-300">
                        {EVIDENCE_STATUS_LABELS[resource.status]} ·{" "}
                        {new Date(resource.fetchedAtUtc).toLocaleString("el-GR")}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </details>
      ))}
      <p className="text-xs leading-relaxed text-slate-400">
        Οι απουσίες δεδομένων δεν είναι μηδενικές τιμές. Τα xG διαφορετικών παρόχων δεν
        συγχωνεύονται. Τα στατιστικά πριν από τη σέντρα αφορούν προηγούμενους αγώνες ή τη σεζόν.
      </p>
    </section>
  );
}
