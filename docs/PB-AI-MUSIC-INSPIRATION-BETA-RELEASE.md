# AI Music Inspiration Beta — implementation evidence and release plan

PR: [#451](https://github.com/Aeras/prompt-beats-studio/pull/451). Existing branch `feature/ai-music-inspiration-beta`; baseline main `fdf34b2e601dc90d4fbdaf1a3192ff948f09f698`. This supplements the original implementation contract; it does not authorize release. Atlas V4 #450 remains paused, separate and unchanged.

## Implemented boundaries

- `music-inspiration.functions.ts`: authenticated, no-store server actions; fresh Beta/feature and installed-model checks. Non-Super-Admins use the live Generator default; only Super Admin may choose another permitted enabled model or extended research. Client role/model/price assertions are never authority.
- `music-inspiration-research.server.ts`: checks approved mainline Atlas evidence first. Current RC1 is research-only, so no facts or techniques are promoted. Then deterministic targeted queries use **real Tavily search/retrieval**, basic depth, raw text enabled. Only fixed `https://api.tavily.com/search` is fetched; redirects rejected, responses bounded. The application never follows arbitrary source URLs or downloads audio. Public HTTPS bibliography URLs are sanitized; source links are rendered as text/anchors, never HTML.
- Snippets without accessible extracts are rejected. Exact extract hashes, timestamps and source metadata are retained. Supported/bounded claims must cite exact retrieved passages. This establishes provenance, not independent semantic truth: a real passage can still be misinterpreted or a source unreliable. Source category defaults to `other`, not invented primary-source authority. Uncertainty, contradiction and creative proposals remain distinct. No runtime translation, score scraping, copyrighted lyric/melody replication or audio analysis.
- `music-inspiration-jobs.server.ts`: one synthesis provider execution per job, existing execution journal/usage accounting, durable search receipts and cost reservations. A duplicate request UUID resolves to the same job. Browser refresh polls existing work; lost start acknowledgements reuse the UUID. Unknown dispatches are never automatically repeated. Observed stored provider responses can be revalidated without a new call, including after the original research deadline. Recovery is bounded at three claims with queued-first scheduling. Conclusively invalid output is retained with observed accounting rather than fabricated zero cost. Cancellation/feature/global-AI changes stop new dispatches, while already observed consumption remains recorded. A network abort is not proof of provider cancellation.
- Migration `20261028060004_music_inspiration_private_jobs_profiles.sql`: owner-isolated jobs/profiles, service-only internal admission/claim/checkpoint/reservation/settlement/recovery RPCs; authenticated profile operations resolve only completed own jobs and use revision/CAS. Database serialization protects quotas, one AI reservation, cancellation/completion and model uninstall. No direct client writes or arbitrary client cost authority. Existing 19 Feature Access policies remain unchanged.
- `MusicInspirationPanel.tsx` and `music-inspiration-apply.shared.ts`: artist-only, artist+song, free description, standard/extended, Apply/Preview, exact field selection and explicit replacement, private profile save/select/rename/update/delete. Only editable music fields are projected. Theme, language, platform, preset and identity are protected. Structure/Blueprint/Energy form an atomic group; section IDs survive repeated application. Undo preserves subsequent manual edits, including observed edit/revert cycles. Unknown catalog labels use custom fields without silently dropping text. EL/EN, keyboard, focus and responsive layouts are covered.

## Limits and configuration — not yet configured or exercised live

Set only in the trusted server runtime, never `VITE_*` or browser storage:

1. `TAVILY_API_KEY` through the existing secure hosting secret mechanism.
2. `MUSIC_INSPIRATION_SEARCH_CREDIT_USD`: positive **upper-bound USD price per basic search credit**, verified from the actual account contract. No assumed free tier or invented default price.
3. `MUSIC_INSPIRATION_SEARCH_CREDIT_VERIFIED_AT`: ISO date, not in the future and at most 30 days old. Expiry fails closed.
4. Existing selected-provider secret plus verified USD model input/output/cache prices and pricing timestamp at most 30 days old. A missing/unaffordable default blocks ordinary users; Super Admin may select a separately valid affordable model. No permission bypass.

| Depth    | Access                 | Queries/results                 | Worker deadline | Per-job reservation ceiling |
| -------- | ---------------------- | ------------------------------- | --------------- | --------------------------- |
| Standard | authorized Beta users  | 2 queries, up to 3 results each | 90 seconds      | USD 0.25                    |
| Extended | authorized Super Admin | 5 queries, up to 3 results each | 120 seconds     | USD 1.00                    |

Admission additionally limits 4 jobs/hour and USD 2 reserved/user/24 hours. Conservative AI reservation includes 80,000 input tokens at the highest applicable input/cache rate and 65,536 output tokens to cover provider adapter/reasoning expansion; synthesis requests 6,000 output tokens. Reservations remain held for uncertain outcomes; the UI calls search credits **reserved**, not measured actual usage. Exact search-credit receipts are private accounting evidence. Existing provider journal retains actual reported tokens/reasoning/cache/cost metadata, while monetary rates remain estimates unless provider-reported.

These application guards do **not** prove an external provider will bill within the estimate. Before any live pilot independently verify provider account/project spend caps, current prices/cache semantics and the actual model's maximum token behavior. No new financial charging policy or invoice claim is introduced. Missing configuration returns an explicit unavailable state, never fake research.

## Verification

- Frozen Bun installation with committed lockfile and Zod 4.6.7: PASS; no package/lock changes.
- Focused Bun: **59 PASS**. Full Bun: **1,248 PASS / 0 FAIL / 12,758 assertions / 177 files**. Strict TypeScript, changed-source lint/format and production build PASS; lint retains four pre-existing hook warnings in generate.tsx. No paid provider calls.
- Focused Playwright: **78/78 PASS**, 69 Inspiration cases (23 per viewport) plus 9 unchanged Atlas/Generator regression cases on desktop/tablet/mobile; synthetic fixtures only. Includes Мираж, Ласковый май and Кино archetypes, with explicit synthetic provenance, not fabricated artist research.
- Fresh disposable Docker PostgreSQL migration, SQL/RLS assertions and independent-connection races: PASS. Coverage includes unauthorized roles, cross-user access, feature/global-AI changes, duplicate admission/reservations, quotas, lease fencing, cancel/completion races, stored-response recovery/error clearing, recovery cap/queue fairness, profile CAS starting at revision 1, Beta/Stable/Archived/promoted access transitions and model uninstall. No production database touched.
- Migration SHA256: `e88ef139355bb62405a827aedb8ffe72b2e351850a77ff49875a9abf8258ad07`.
- GitHub Regression, Browser Quality and Database Replay must pass on the final PR HEAD. Final run links/results belong in the PR so the ledger does not create a self-referential commit hash.

## Controlled Beta release and recovery

1. Independent review of this Draft PR and exact green HEAD. Do not merge or publish under this task's authority.
2. Securely configure and verify the above services, spend caps and credentials. Verify actual hosting lifetime independently of the 170-second pg_net timeout, secure runner configuration, and the scheduler backstop in [the release-blocking runner follow-up](PB-AI-MUSIC-INSPIRATION-RUNNER-RECOVERY.md). No active periodic scheduler is assumed. No new cron or production configuration was installed by this PR.
3. With separate approval and verified backup/recovery, apply **only** the additive migration using history-aware Supabase tooling. Verify ACL/RLS, functions, registry state and unchanged 19 legacy policies. The new feature starts Beta and does not become available to everyone.
4. Publish the corresponding compatible application under separate approval; GitHub/Lovable editor sync alone is not publication evidence. Confirm server-only secrets are absent from browser bundles.
5. Separately approve a tiny bounded live pilot using the intended Generator default, inspect actual provider/search receipts, latency and semantic source quality. No such pilot has been executed. Then selectively enable Beta testers; no V4 techniques or Atlas guards are opened.
6. On failure, archive/disable only this Beta feature through existing controls and stop new work. Allow accounting of already dispatched work and bounded stored-result recovery. Retain jobs, receipts, profiles and execution evidence. Do not drop tables, erase results, reset unknown cost to zero or blindly retry provider requests. The additive schema can remain while rolling application code back to its prior release; old code ignores it. Re-enable only after verified correction and approval.

## Remaining evidence gaps

Live Tavily account configuration, provider spend enforcement, deployed runtime/runner scheduling, real source relevance/interpretation and production end-to-end behavior are intentionally unverified. Passing offline tests is not a claim of editorial truth, live-provider compatibility, production activation or zero residual financial risk.

## Merged #451 follow-up

The existing feature is not reimplemented. `20261028075346_ai_runner_recovery_fanout.sql` adds delivery throttling, bounded independent fanout and exact-ID recovery. Empty authenticated runner messages no longer await sequential AI jobs. Standard research remains 90s; extended is 120s to leave 50s transport/accounting headroom. Queue wait is separate from persisted active research time; unstarted work expires after 30 minutes. Actual hosting runtime, periodic scheduler activation and live operational verification remain explicit release prerequisites. See the linked runbook.
