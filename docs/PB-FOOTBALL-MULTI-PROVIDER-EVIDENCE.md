# Football — ESPN default and multi-provider research evidence

## Scope and acceptance

Baseline main: `dcc00f5a43e2232e1c5d7256b546935482168716`. One isolated
`codex/football-multi-source-evidence-20261105` branch. No overlapping football PR
was open at preflight. Existing music, KINO, billing, SQL, fixture discovery and
paid admission contracts remain unchanged.

- ESPN is selected automatically on page load and is labelled the default.
- Fix actual ESPN score-object parsing and consume `lastFiveGames`, merging by
  provider event ID and sorting before the cutoff. Never fabricate missing scores.
- Pre-match boxscore season/preview aggregates are separate from statistics of a
  match that has not happened. Headers cannot silently hide those preview data.
- Each configured structured source participates regardless of the fixture
  picker: ESPN, API-Football, football-data.org and PitchAPI. Tavily and AI Search
  retain their existing, separately consented paid behavior.
- Manual free-data preview, actual AI input, immutable saved analysis and expert
  handoff use the same versioned evidence contract. History expansion is read-only.

## Confirmed incident

Read-only ESPN responses for AZ–Juventus, event `401915529`, were captured on
2026-11-05. Each team's Europa schedule returned three past results, but the old
parser rejected every `score: {value, displayValue, ...}` object. The same summary
also supplied five recent matches per team which were ignored. The new parser
accepts validated scalar/object scores; empty/null/invalid values stay absent.
Original responses, SHA evidence and replay are retained outside Git, without keys.

The old `summaryTeams` chose header competitors whenever present, even when all
their statistics were absent. The new code binds team identity and separates the
pre-match boxscore preview from actual match statistics. Injuries endpoints returned
empty objects; no claim that no injuries existed. No structured xG was found in
those inspected ESPN responses, not a universal assertion about all ESPN data.

## Source contracts and limitations

| Source            | Requested evidence                                                                                                                               | Boundary                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| ESPN              | Day scoreboard identity, summary, standings, schedules, last-five, squads, injuries and team statistics                                          | Undocumented feed; coverage varies. Completed historical results only, before collection and kickoff.                            |
| API-Football      | Date fixture identity, recent FT results, competition-season team totals, fixture injuries and lineups                                           | `API_FOOTBALL_KEY`; plan/season access and quotas may deny requests. Lineups are provider-reported, not independently confirmed. |
| football-data.org | Competition/day fixture identity, team results and TOTAL standings                                                                               | `FOOTBALL_DATA_API_KEY`; explicit supported competition codes and current key entitlement. No invented xG or injury coverage.    |
| PitchAPI          | League catalogue, date fixture identity, current-season league history, up to five prior results per team with per-match xG/xGA, fixture lineups | `PITCHAPI_API_KEY`; observed same-competition sample, not all-competition completeness. Predicted lineups labelled explicitly.   |

Provider IDs never cross provider boundaries. Identity requires the same competition,
directed home/away teams and exact UTC kickoff, with a small explicit alias map.
No fuzzy name matching, date-only verification, inferred provider IDs, women/U21
qualifier stripping or choosing the first ambiguous fixture. Unknown aliases fail
visibly rather than attach another team's statistics. Unsupported competitions and
unconfigured keys are visible states, not hidden fallbacks or zero values.

xGA is the opponent's recorded xG in the **same** historical match and source.
Missing xG stays omitted. Different providers' xG models are never averaged together.
Each historical match and sample size remains visible. Conflicting dated score
claims remain separate, with a visible conflict notice. None of these data proves
prediction accuracy, independent corroboration or a betting advantage.

## Transport, authorization and cost

Server-only keys in headers, fixed HTTPS hosts, no redirects or arbitrary URLs,
no raw upstream errors in logs/client results. UTF-8 JSON is streamed with a 1.2 MB
decoded-byte bound, per-request 6-second timeouts and a 16-second collection signal.
Pitch historical-stat calls run at most three concurrently. No automatic retry.
HTTP 401/403, 429, timeout, malformed data, oversized responses, absent matches,
ambiguous identity and conflicts remain distinct. API-Football HTTP-200 plan errors
are not successful empty evidence. HTTP Retry-After is respected by a per-provider
cooldown (at least ten minutes), without sleeping/retrying in the request.

Bounded resource cache (32 entries / 4 MB encoded JSON budget) and bundle cache (16 entries), ten-minute TTL,
single-flight requests and cloned return values prevent redundant preview/analysis
reads and caller mutation. Keys are never cache keys, serialized or returned. Key
rotation invalidates caches; an old in-flight result cannot seed the new cache.
Resource retrieval timestamps survive cache reuse.

The new preview function re-proves Super Admin before reads and after collection.
The browser sends only provider/fixture identifiers; canonical teams and kickoff
are reloaded server-side. Existing paid analysis still revalidates fixture/admission,
owns its immutable request, requires explicit consent and uses global AI dispatch
admission. All available structured sources are collected after that admission;
the same snapshot is server-attached to analysis JSON and passed unchanged to the
expert. Provider-supplied text is untrusted data, never instructions. Failed or
unmatched sources cannot supply accepted claim URLs. Existing Tavily remains three
searches, with the chosen Basic/Advanced depth and no extra paid calls. Its individual
timeout is 15 seconds, keeping structured reads + searches + existing 90-second AI
timeout within about 151 seconds before database/framework overhead; this is a
request budget, **not** a measured production hosting SLA.

Structured providers consume their own quotas; free-plan availability is not
guaranteed. More evidence can increase the existing AI call's input tokens, stated
in paid consent. No new subscription, automatic paid request or price was added.

## Verification and release

Offline tests exercise actual adapters, source-specific keys, spoofed/swapped/time-
mismatched fixtures, absent xG, predicted lineups, future-result exclusion, conflicting
scores, HTTP failures, plan errors, bounded transport, concurrency/cache cloning,
authorization denial/revocation and expert snapshot compatibility. Browser scenarios
mock all server/Supabase calls: default listing, all-source preview from different
pickers, saved history with no new request, denial, keyboard, touch, responsive
geometry and axe. Final observed counts belong in WORK-STATUS; no pending check is
represented as passing.

1. Approve one consolidated push/Draft PR under root AGENTS §7; all three gates
   must pass on the same final HEAD before reviewed merge.
2. **No database migration.** New metadata is optional versioned JSON inside the
   existing owner-bound history; existing RLS, RPCs and financial records are unchanged.
3. Independently review provider reuse permissions and current plan coverage. The
   PitchAPI documentation advertises free access, but local offline fixtures are not
   evidence that the owner's real key or publication rights were validated.
4. Verify the owner-added `PITCHAPI_API_KEY` in Lovable server secrets by a separately
   approved compatible publish and one read-only authenticated preview. Never reveal
   its value. Confirm ESPN default, score history, each provider's status and actual
   Pitch xG sample. Do not run paid AI as a smoke test without separate spend consent.
5. Keep new-format readers during rollback: reverting to an older **strict** analysis
   schema would reject newer `providerEvidence`/ESPN metadata. Prefer a forward fix
   or rollback the collector/UI while retaining these optional reader fields. Do not
   delete or rewrite historical analyses, usage, source receipts or financial records.

Primary API references: [PitchAPI](https://pitchapi.dev/),
[API-Football](https://www.api-football.com/documentation-v3),
[football-data.org teams](https://docs.football-data.org/general/v4/team.html).
The ESPN endpoints are unofficial; no production completeness or uptime guarantee.
