# Football Research Studio — staged pre-match evidence and experimental analyst

## User contract
- Super Admin only, no public exposure. Existing verified-fixture gating and 1–5 sequential analyses stay unchanged.
- Primary search: match facts (standings/points gaps, form, home-away, injuries, likely lineups, xG if sourced, European fixtures and likely rotation), then independently sourced forecasts; saved sources are **unverified article excerpts**, not verified match facts.
- Existing percentage market catalogue preserved, deterministic consistency guard rejects contradictory numbers. One match history record each.
- Optional **Έμπειρος Αναλυτής · Πειραματικό** uses the saved evidence and source-bound extracted claims without new Tavily queries. Requires new confirmation and creates a separate OpenRouter call, separate immutable outcome, unique by base analysis; abstention allowed.
- "Επανέλεγχος υποψήφιων" uses bounded HTTP-only corroboration and existing service-role upsert RPC. Never upgrades candidates without 2 independent domain confirmations of exact UTC minute; never triggers a paid AI discovery request.

## What is NOT claimed
- Publication or statistical accuracy of third-party sources; automatic provider API for xG / odds / confirmed lineups; model probability calibration; betting outcome guarantee; full fixture verification coverage. If a source contains no data, the context stays missing.
- GitHub Actions do not certify third-party live data; the private production page requires owner authenticated smoke tests after release.

## Data and security
- The optional migration adds `public.private_football_expert_reviews`, unique `run_id`, service-role grants and disabled end-user SQL access (RLS enabled, no authenticated privileges). A pre-match completed owned research run with stored evidence is required for paid expert entry.
- Base completed research rows remain immutable. No old record backfill; historical rows lacking source extracts do not enable expert review. Duplicate expert dispatch is blocked by the unique index.
- No destructive SQL, no anonymous access, no automatic retries after ambiguous provider dispatch. Token expense remains behind the pre-existing global dispatch admission plus explicit UI confirmation.

## Review and tests to run
1. Reverify every changed TS/TSX with exact project strict TypeScript and Prettier (not merely a GitHub diff).
2. Run focused football unit tests for schema, market complements, source lists, candidate source recheck; cover the new nullable expert history view and CSS mobile state.
3. Replay migrations from empty DB and previous baseline; test Super Admin access, RLS, unique run_id races, terminal immutability, kickoff safety and service-only persistence.
4. Confirm no duplicate paid requests on refresh, cancellation, tab close, and repeated expert clicks.
5. Run entire test suite, lint, build, and exact-HEAD Regression, Browser Quality, Database Replay before merge.
6. Apply migration only with separate approved release boundary, publish via Lovable then authenticated private-page smoke test and fix observed defects in same work.

**Operational status:** IN_PROGRESS until verified, merged and published.
