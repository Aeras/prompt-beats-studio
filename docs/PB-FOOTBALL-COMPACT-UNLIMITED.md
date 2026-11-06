# Football — compact analysis controls, uncapped serial research and football-data dates

## Baseline and acceptance

Main `62e94b9b1e5412888c38b1924eb6bd43963b6f28`, merged #513. Root AGENTS/WORK-STATUS, owner instructions and four screenshots reviewed. No overlapping Football PR at preflight. Isolated branch `codex/football-compact-unlimited-20261106`. Existing team registry, all configured source collection, auth, consent, financial receipts, historical snapshots, KINO and music are preserved.

Acceptance: remove only the setup/configuration card «Πηγές ανάλυσης»; show «Λίστα αγώνων» and «Επιλέξτε αγώνες για ανάλυση» directly before the list; an edge-to-edge straight top toolbar «Ανάλυση», with «Όλων» and «Επιλεγμένων» on one row, must stay visible during the single page scroll. Remove the five-per-hour analysis policy in client and all three admission RPC paths; keep explicit per-batch consent, sequential execution, duplicate-key idempotency and active-run serialization. Investigate the Fiorentina–Juventus football-data failure without paid calls or production writes.

## Implementation

- Removed the configuration summary card, its explanatory paragraph, the hourly-limit paragraph and the more-than-five warning. Actual per-fixture source preview, historical source evidence and background source collection remain.
- Toolbar is a root-level sticky element before the page header, full width, top zero, with opaque dark/glass styling, straight outer edges and two 44px minimum-height controls. It is not inside an independently scrolling list. It hides with the Football predictions tab and does not overlay KINO controls. Button state still requires selected model, enabled analysis and available future fixtures.
- Removed client five-game refusal, All/Selected disablement above five, and the AI-discovered-fixture selection cap. No automatic research or retry was introduced. Existing native paid confirmation, per-match request keys and sequential awaiting remain.
- Forward-only `20261106075211_football_research_remove_hourly_cap.sql` replaces the legacy, provider-specific and AI-verified research claim bodies. Only hourly counting/rejection is removed. Existing role, verified fixture, future kickoff, request-payload binding, advisory locks and 15-minute active-run exclusion remain. CREATE OR REPLACE retains service-only ACLs. No table/policy, historical migration, data or billing change. This is uncapped serial analysis, not parallel paid dispatch.

## football-data.org diagnosis

The screenshot records a successfully received resource and a not-found matching result. That alone is not proof that the provider lacks the fixture.

The actual enrichment code used `dateFrom=2026-11-08&dateTo=2026-11-08` for this fixture. Official [v4 overview](https://docs.football-data.org/general/v4/index.html) and [Match filters](https://docs.football-data.org/general/v4/match.html#_available_filters_for_the_list_resource) document an exclusive dateTo. Equal endpoints describe an empty interval. The weekly adapter also sent Sunday as the exclusive end, omitting Sunday fixtures.

The shared UTC helper now advances the end by one calendar day. Single-day enrichment uses November 8 through exclusive November 9; the Monday–Sunday week ends at exclusive next Monday. Leap days, month/year boundaries and DST are covered. Existing exact competition, directed team, kickoff, source-separated data and safe transport checks remain. A malformed response without a matches array is now invalid_response, never falsely not_found.

Offline fixtures reproduce the Fiorentina–Juventus date-filter failure with official response shape and exact target time, and verify the corrected URL and identity. They are explicitly synthetic; no current football-data raw response, current coverage, fixture ID or credential validity is invented. No new authenticated/paid source request was made. Live provider coverage and any additional unregistered team-name variant still require controlled post-release verification; finding this structural bug does not prove every provider field will become available. HTTP 401/403/429/500 remain distinct and do not trigger automatic retries.

## Verification evidence

- Focused football-data/evidence tests: 39 PASS, zero failures, including safe malformed-body distinction.
- Complete Bun suite: 1,713 PASS / 0 FAIL / one existing unrelated PHP parity skip / 27,713 assertions / 226 files, in LF-equivalent copy with immutable assets preserved.
- Browser suite: 45/45 PASS across desktop/tablet/touch-mobile, including source-card absence, toolbar top/one-row/touch geometry, no overflow, existing auth/history/locale/keyboard/axe scenarios and ten mocked sequential analyses with one confirmation. Three final screenshot cases rerun separately. Browser emulation is not physical Android attestation.
- Isolated PostgreSQL 17.6: actual prior cap reproduced after five synthetic historical attempts; new forward migration applied locally. Extended existing research and AI-search SQL suites PASS: sixteen legacy/provider serial admissions and eight verified AI-fixture admissions, without loss of concurrency guards. Eight independent duplicate-key sessions claim exactly once; eight distinct keys admit only one active run. Three RPC permission checks PASS.
- Local DB uses only a new synthetic database `football_compact_20261106` in existing network-none/mount-free `pb-football-v2-final`. Minimal auth/user-role fixture plus actual internal-role helper and relevant historical Football migrations are used; this focused rehearsal is not a full managed Supabase bootstrap or full historical replay. Full clean Database Replay remains required in approved CI, with the new race harness wired into its existing Football acceptance section.
- Strict TypeScript, changed-source ESLint, formatting, build and diff checks are required before push; final exact results are in WORK-STATUS. No remote CI or successful final-HEAD claim before approval.

## Release and recovery

1. Owner approves one consolidated push and one Draft PR. Require Regression and Database Replay success; if only Browser Quality remains, stop and let the owner request its later check. All three exact-HEAD gates and independent review must pass before separately approved merge.
2. Unlike #513, this change requires a production migration to remove the real database cap. Before a separately approved release, verify current main, exact RPC definitions/permissions, migration history, backup/recovery and absence of conflicting release. Apply only `20261106075211_football_research_remove_hourly_cap.sql` through a history-aware mechanism. Do not silently deploy UI-only removal over the capped database.
3. Publish compatible Lovable code only with release authorization. Verify removed card/text, fixed toolbar, more-than-five serial availability and unchanged historical access. A real paid batch is not part of implementation testing. A separately consented source-only football-data preview should confirm returned interval/fixture and permissions without AI dispatch; do not label current provider coverage verified before this happens.
4. Keep uncapped admission and immutable receipts during forward recovery. Do not reset counters/history, replay uncertain calls, delete jobs or bypass provider access/quotas. Roll back only the defective UI/collector portion while retaining the owner's uncapped policy; reintroducing a count cap requires an explicit new product decision. No destructive down migration is needed.

No production migration, publish, paid AI/source call, secret change or unrelated deployment is authorized or performed by this local implementation.
