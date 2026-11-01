# Private AI Football Research Studio — implementation contract

Status: IN_PROGRESS. Scope is **football only**; KINO is a separate later phase. Branch `feature/private-ai-football-research-studio` based on `main` `65293ea751a7e6252b44d6e3855bc295f425bd54`.

## User-facing acceptance
- An unlisted, noindex, Super-Admin-only route, with server-side authorization on *every* data/AI operation, not just hidden navigation; ordinary users/guests must not receive research data. Keep music product behavior unchanged.
- Six leagues: GR Super League, EN Premier League, ES La Liga, IT Serie A, DE Bundesliga, FR Ligue 1. Fixtures shown by requested week using explicit Europe/Athens display dates and time zones; refresh and provider staleness indicators, including postponed/cancelled states; no invented match schedule.
- Select one/multiple/all fixtures and an **installed, enabled OpenRouter model** from the existing registry (not an arbitrary model-id text field). Show provider/model and pricing/cost if obtainable, charge approval before invoking any paid AI. Deny disabled or unapproved models server-side; never expose keys. Strict bounded fan-out and cancellation.
- Optional Tavily retrieval from the existing server-side adapter/pattern with bounded multi-language query set, evidence URL hygiene, deduplication, publication times and provenance; if no Tavily key, show explicit unavailability, never imply browsing happened. Treat retrieved text as untrusted, not model instructions. Search results must not be accepted as odds or verified statistics.
- Analysis for 1X2, double chance, both teams to score, totals 1.5/2.5/3.5; corners/cards only when trusted match-specific structured historical data covers them. Distinguish descriptive analysis from actual probabilistic model and published opinion; null/abstain if evidence inadequate, no fictitious confidence. Do not label any selection guaranteed or safe.
- Persist immutable pre-kickoff model output and evidence snapshots, versions, timestamps, provider usage/cost, with Super-Admin-only DB policies and explicit retention. Dedicated evaluation on finalized results with Brier/calibration and sample counts; no look-ahead. Do not auto-place bets or link to deposit flows.
- Accessible responsive mobile/desktop EL/EN layout, consistent with PromptBeats styles, no public nav, no accidental indexing. Visible partial/error/empty and source outage states.

## Verified existing architecture
- TanStack Start file-routes: `src/routes/README.md`. `src/routes/audio-model-lab.tsx` is the closest isolated noindex page precedent.
- Auth middleware: `src/integrations/supabase/auth-middleware.ts`; Super-Admin needs tighter authority than `current_user_is_admin_level` (which includes admins). Discover and use existing exact Super-Admin authority with DB revalidation on server.
- Installed model registry: `src/lib/ai-model-registry.server.ts` provides `getInstalledRegistryModels()` and `getRegistryModel()`; provider `openrouter` and enabled status must be verified on each operation. `src/lib/ai-provider.server.ts` contains existing OpenRouter transport using `OPENROUTER_API_KEY`; integrate through guarded admission/usage, do not call arbitrary external model names.
- Tavily support already exists in `src/lib/music-inspiration-research.server.ts` and `TAVILY_API_KEY`. Reuse or safely extract bounded transport, not Music Inspiration artist-specific prompts/limits. Never double-charge / silently retry.
- An initial provider-independent contract and scoring tests now exist in `src/lib/football-research.shared.ts` and `src/lib/football-research.shared.test.ts`. These do **not** yet provide a functional UI, live fixtures, provider integration, or secure persistence.

## Data and research guardrails
- Verify fixture/league provider, exact six-league coverage, historical corners/cards capabilities, contractual access, API quotas and update timing before selecting a service. Source coverage may vary; don't fabricate missing games.
- Distinct adapters: authoritative fixture/results feed vs optional Tavily web research vs OpenRouter evaluation. Never scrape operator UI as a surrogate for a permitted API. Cache with bounded TTL, request deduplication/rate limits, idempotent prediction snapshot.
- Snapshot has source fixture ID, league mapping, home/away, kickoff UTC, source timestamp, generated timestamp, model registry ID, prompt version, actual availability, citations, per-market probability **or null**, abstention reason.
- If prediction starts at/after kickoff, permit research but do not count as a pre-match prediction. Reconciliation must tolerate status corrections and delayed results. Independent calibration only with eligible finalized pre-match records; backtesting should be chronological and blinded.
- Avoid mixing football tools with existing generator billing/entitlements. Use current global AI admission, account allow/deny and usage tracking, with separately scoped feature access if required. No unapproved paid calls.

## Required verification and release
- Run format/lint, TS, unit/full regression, build, disposable DB migrations/RLS races for stale Super-Admin, and Browser Quality at mobile/tablet/desktop. Three GitHub CI gates green on the exact final HEAD; fix failures within this PR.
- Review concurrency/rate limits, exact auth boundaries, secret exposure, provider timeout/abort behavior, Tavily failure mode, source injection, fixture timezone/week rollover and result replay.
- Add evidence and status in `docs/WORK-STATUS.md` within this PR. Do not merge/deploy, apply production SQL, or make paid API calls without approval. `CODE_COMPLETE_RELEASE_PENDING` only after all code and CI checks; `CLOSED` only after the agreed production verification.

## AI Αναζήτηση BETA (third fixture source)
- Paid refresh = one OpenRouter `google/gemini-3.8-flash` call with the `web` plugin (Exa, 8 results), structured JSON output, no retry/fallback, consent with server-rechecked max cost, quota 3/hour + 10/day in SQL.
- Model output and citations are untrusted. A fixture becomes `verified` only when the server fetches ≥2 distinct registrable domains from the allowlist that state the exact UTC kickoff minute and none contradicts. Verified rows are immutable and cannot be downgraded.
- Only verified AI fixtures can be analyzed (`claim_private_football_ai_research_run`); fixture identity comes from the DB row, not the client.
