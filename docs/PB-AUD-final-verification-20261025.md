# PromptBeats Audit — Final verification, 25 October 2026

## Provenance and release boundary

- Reviewed baseline: `main` **8554aefd0c3a8bbb4b57fd5540c2380266579f03**.
- Original audit: **ef7b77656b1c6de7b85f113467d006f5d227f5f3**, Reports B/C/D/E/F, read from the existing local audit artifacts.
- All PRs **#403–#423** were inspected through live GitHub metadata/descriptions and their merged source. No historical partial fix was treated as complete merely because it merged.
- One branch/PR for all work here: `codex/audit-final-verification`. The original checkout and other worktrees were not modified.
- Production Supabase target independently resolved as **qwlksrcsovbncmretjdt**, project PromptBeats. Production access was metadata SELECT only. No migration, application setting, row, object, payment or provider execution was changed.

### Initial publication evidence (superseded by the release check below)

The connected Lovable project API reports editor HEAD **8554aefd…**. A fresh browser inspection of **History** shows the **Published** marker on `security: resolve remaining Zod and esbuild advisories (#419)`, dated October 24, 11:51 PM in the UI. GitHub maps that merged change to **ca215c53a1e8e30cdf24c85c47ca51a0f67232b9**. The UI explicitly reports **unpublished changes available** for later editor commits.

This is hosting UI evidence of the published **#419 snapshot**, not a runtime Git-SHA endpoint or cryptographic binary attestation. The available API does not expose a reliable deployed-server SHA. We do **not** equate the latest editor commit with production. PR #420's Stop messages, #421/#422 and the new corrections in this PR are not declared production-active. No publish/revert control was activated; the preview was returned to the latest history entry.

Closure below is scoped to the original finding and uses the published snapshot, production schema evidence and reproducible offline verification. It is not a live penetration test or a guarantee of every provider's billing/cancellation behavior.

### Subsequent publication verification — observed 2026-10-25 02:40 UTC

Lovable History now places **Published** on `Merge PR #424: final audit verification and security gap closure`, corresponding to GitHub main **609678f779268016c2864baf8ca4c89140407522**. The publication popover says **Your website was updated** for `promptbeats.app`. The API editor SHA matches independently; the Published marker/popover, not that editor value or generic `is_published`, supplies the hosting release evidence. No new publish was executed during this verification.

Ordinary production GET `/`, `/auth`, `/discover` each returned **200**, HTML, without an observed catastrophic SSR error page. Existing final-main [Regression](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770454), [Browser Quality](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770440) and [Database Replay](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770475) are PASS. Prior isolated behavioral/SQL verification and compatible production-schema evidence remain valid; no paid provider, authenticated write or live payment was used to simulate a new runtime test.

The publish-only dependency is satisfied for **AUD-011/016/017/018/019/026**, now **CLOSED** in WORK-STATUS. Final totals: **19 CLOSED, 6 OPEN, 1 BLOCKED**. Runtime binary/SHA attestation remains unavailable; hosting UI publication evidence is explicitly distinguished from it. The initial #419 observation above is retained as historical evidence, not the current release state.

## Verified production database evidence

Actual migration history uses these management-API timestamps; the names/bodies match the repository migrations. They were **not reapplied**:

| Scope                   | Production recorded version | Canonical repository migration                             |
| ----------------------- | --------------------------- | ---------------------------------------------------------- |
| AI usage/recovery       | 20261024105832              | 20261024060858_pb_aud_ai_usage_recovery.sql                |
| Upload receipts         | 20261024140957              | 20261024111133_pb_aud_upload_integrity.sql                 |
| Receipt helper grant    | 20261024144343              | 20261024143931_pb405_upload_receipt_service_role_grant.sql |
| Atomic revision         | 20261024185227              | 20261024173000_pb_aud_014_atomic_revision_finalize.sql     |
| Checkout reservation    | 20261024193651              | 20261024203000_pb_aud_018_checkout_reservation.sql         |
| Successful upload quota | 20261024202054              | 20261024220000_pb_aud_008_success_only_upload_quota.sql    |

**19 function bodies matched exactly** after line-ending/outer-whitespace normalization: 16 initial functions plus `claim_ai_recovered_job_internal`, `reap_unjournaled_ai_jobs_internal`, and `enforce_finalized_audio_receipt`. These include begin/read/observe/checkpoint/remote identity/recovery claim/release/cancel checks, usage settlement/outbox flush, upload admission/success counter, safe storage path, atomic revision finalizer and Checkout reservation.

Service-only RPCs are executable by `service_role`, not `anon`/`authenticated`. The receipt enforcement and quota trigger functions are deliberately not directly executable by API roles, including service_role. `admit_track_upload()` remains the authenticated admission API. `is_safe_track_storage_path(text,text)` has the previously corrected service grant and no anon/authenticated EXECUTE.

RLS is enabled on execution journal, usage/outbox, upload receipts, Checkout reservations and success quota. Clients cannot SELECT/INSERT the internal ledgers. `ai_usage_logs` retains its intentional authenticated **admin-only SELECT policy**, not owner-wide access; no client INSERT. The usage row's primary key is the immutable execution identity; job/action and remote-identity unique indexes fence duplicate executions. Upload receipt and finalized-success triggers are installed. Existing history/financial rows were not read, fabricated, deleted or backfilled.

## New confirmed gaps corrected in this PR

1. **AUD-011:** when a provider error contains valid usage and its observation journal write fails, that secondary error previously skipped independent settlement/outbox delivery. Settlement now still receives the observed receipt and original execution ID. The original error is preserved. This does not promise recovery when every durable write fails.
2. **AUD-016:** playlist metadata counted stored unavailable items; favorite IDs did not use the hydrated eligibility filter; service-role hydration relied on historical pruning for publication changes. Counts/durations/automatic covers now derive from the same visible subset, owner-private access is preserved, third-party unpublished and moderated tracks are excluded, and new moderated favorites are rejected. Removing an existing unavailable favorite remains possible.
3. **AUD-018:** the local subscription projection can lag a successful Checkout when webhook processing fails. Before creating a session, the handler now checks the authenticated customer's Stripe subscriptions, rejects active/trialing subscriptions and fails closed on incomplete enumeration. Existing reservation, open-session checks and attempt-bound idempotency remain. No new price, payment or subscription policy.
4. **AUD-019:** remaining raw logs existed in QC, JSON parse failures, model discovery, Analyzer/Qdrant/RunPod cleanup/cancel/verification and shared SSR capture. Some short provider-controlled names were still accepted as diagnostic labels. Fixed allowlists now protect category/status/stop labels; raw bodies/messages/stacks/causes and arbitrary JSON field names are not logged. Central `error-capture`, `server-error` and SSR handling no longer reconstruct sensitive payloads. Correlation IDs/status/category and generic public error behavior remain. No scoring or prompt change.
5. **AUD-026:** raw-RPC admitted jobs could bypass the frontend aggregate JSON budget before worker dispatch. The same 512 KiB UTF-8 JSON budget is now enforced before parsing a durable payload and at the shared song-generation entry, including admin/revision paths. Existing generous schema limits and narrower normal-user rules remain unchanged; historical saved-content schemas are untouched.

No migration, dependency, model, prompt, QC scoring, quota policy, price or production configuration was added/changed. Prettier reformatted touched files; two existing prefer-const errors in the touched Analyzer guard were corrected without changing values or mutations. Whitespace-sensitive tests now preserve their assertions across formatting; V3 fixtures inject the real budget helper and still verify one provider call.

Stripe's [subscription-list contract](https://docs.stripe.com/api/subscriptions/list) supports customer scoping, all statuses and bounded pagination. Its [idempotency contract](https://docs.stripe.com/api/idempotent_requests) also caches v1 HTTP 500 responses after execution starts. Tests distinguish recoverable pre-execution transport failure from a cached provider failure: the latter remains a failure with the same identity, not a fabricated successful retry. No automatic key rotation/customer recreation is introduced; ambiguous cached failures may require provider-side reconciliation/expiry. No live Stripe request was made.

## Reproducible verification matrix

| Area                     | Real code / deterministic verification                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI cancellation/usage    | `ai-usage-recovery.test.ts`, `ai-cancellation-upstream.server.test.ts`, `quality-check-worker-access.test.ts`: pre-dispatch cancellation, cancellation during/after usage, persisted output, lost ACK, failed settlement/outbox, provider error receipts, distinct execution IDs, bounded cancel/body deadlines and terminal job handling                                                         |
| Background recovery      | `audit-final-verification.test.ts`: actual OpenAI background adapter with remote-ID callback failure, failed polling and deadline; one create only, no blind restart. Actual OpenAI/Gemini retrieval functions recover completed content/usage using GET only. Existing recovery journal/lease tests cover checkpoint replay and retries                                                          |
| Provider accounting      | Actual Anthropic SSE completion/interruption; Gemini GenerateContent thoughts included once; OpenAI/OpenRouter output not inflated with reasoning; cache-read/write subsets, cost-only receipts, unknown counts and provider-reported USD remain distinct from estimates                                                                                                                          |
| SQL accounting/isolation | `supabase/tests/ai_usage_recovery.sql` and `scripts/tests/ai-usage-db-races.sh`: immutable usage identity, enrichment, wrong-owner rejection, durable outbox, lease ownership, bounded exhaustion, independent concurrent settlements and recovery claim exclusion                                                                                                                                |
| Upload integrity         | Existing `upload-integrity.test.ts`: exact bytes/checksums, true trailing CRLF, boundary-like content, malformed/chunked input, real 50 MiB boundaries, canonical MIME, UUID keys, registration/PUT/HEAD/finalization failures, receipt expiry/replay/ownership and cleanup. No production R2 operation                                                                                           |
| SQL upload policy        | `upload_integrity.sql`, `upload-receipt-races.sh`: actual trigger/permissions, one-time consumption, rollback of failed attachment, external audio, legacy edits, replacement and cleanup. Expanded `upload_success_quota.sql`: 100 unfinalized admissions consume no success quota, 101st abuse attempt denied, exactly 20 finalized successes allowed and 21st rejected                         |
| Atomic revisions         | `atomic_revision_finalize.sql`: service-only RPC, real project revision/new version/source-job identity, unchanged parent content/custom name and cancelled project rejection. `atomic-revision-db-races.sh`: independent connections, finalization owns lock first, pre-existing cancel and cancel holding lock while finalization competes; cancelled standalone writes never overwrite content |
| Checkout                 | Actual handler with mocked Stripe: active/trialing DB projection, same-attempt retry, distinct concurrent attempts, existing open session, customer/session failure/retry, delayed webhook and incomplete enumeration, legitimate later repurchase/new key. Real rollback SQL and new `checkout-reservation-races.sh` cover lease expiry and account serialization                                |
| Moderation               | Actual playlist/favorite handlers/helpers: available/private-owner/public/locked/deleted-or-missing projections, counters, durations, covers, text redaction, stable order and third-party ownership denial                                                                                                                                                                                       |
| Privacy                  | Synthetic marker log capture for actual discovery, Anthropic HTTP, RunPod cancel, QC worker, shared reporter and central SSR capture. Allowlisted names/codes/stop reasons and schema paths exclude marker injection                                                                                                                                                                              |
| Generator budgets        | Actual generation schema per-field boundaries, Blueprint/snapshot nested bounds, Greek/Russian/UTF-8/JSON escaping, exact aggregate ceiling and rejection before provider selection; worker raw-payload budget precedes parse                                                                                                                                                                     |

All SQL tests run against a newly created **disposable local Supabase Docker database**, using the canonical immutable migrations and existing CI bootstrap fixture. No production backup was restored or modified. Independent-connection scripts use `docker exec psql` against the named local container only. New race coverage is wired into the existing Database Replay workflow.

Commands: Bun 1.4.2 `install --frozen-lockfile`; focused/full `bun test` with a network/provider/child-process blocking preload; `tsc --noEmit`; ESLint/Prettier on affected files; `bun run build`; CLI 2.118.0 `db start` in a separate staging directory; five rollback-only SQL suites and four independent-connection scripts; `git diff --check`. Final exact-HEAD counts and CI links are recorded in the PR and final report.

Local final code verification: **1,059 Bun tests PASS**, 0 failures, 7,182 assertions across 156 files; frozen installation, strict TypeScript, affected-source ESLint, formatting and production build PASS. All five SQL suites and all four concurrency scripts PASS. Fresh dependency audit returns `{}`.

Local browser verification uses the unchanged CI configuration: 26 tests passed directly and one PB-012 desktop redirect test passed on its configured retry (a 7.5-second first-load timeout). The original trace was retained outside Git; no PB-012 product code or timeout assertion was changed. This is not described as a clean no-retry browser run. Final hosted Browser Quality evidence is recorded independently against the PR HEAD.

The full-tree lint debt is measured separately: **3,884 errors / 5 warnings**, with **zero errors/warnings in affected source**. It is **not** represented as a full-tree PASS. The mandatory workflow intentionally checks changed source. No unrelated formatting cleanup, weakened rule or test suppression was used.

## Hosting findings and precise remaining controls

One ordinary anonymous GET of `https://promptbeats.app/` returned HTTP 200 behind Cloudflare with:

- HSTS `max-age=31536000; includeSubDomains`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- No CSP, CSP-Report-Only, X-Frame-Options or Permissions-Policy on that response.

**AUD-024 remains OPEN** as a verified defense-in-depth gap on the observed response, not a demonstrated XSS/clickjacking exploit. A host-approved CSP/frame policy needs compatibility validation for Lovable preview, OAuth, external media, PiP and PWA before enforcement. No speculative production header change was made.

**AUD-021 is BLOCKED on hosting evidence**, not a proven spoofing exploit. The contact and private-review fingerprint functions still select CF/real/forwarded headers. Available Lovable metadata/UI do not expose the final ingress header overwrite rules, trusted-hop configuration or direct-origin bypass controls. Required operator action: provide a read-only ingress configuration export showing the canonical overwritten client-IP header and blocked direct origin, or an approved staging ingress for controlled spoof-resistance verification. No spoofed production request was sent and no rate limiter was weakened.

## Remaining independent findings, not reopened solved work

- AUD-004: six-hour signed capability TTL still exists; revocation SLA needs product approval, not an unapproved blanket TTL change.
- AUD-005: `listMyTracks` still has no application pagination; no consumer redesign was included.
- AUD-007: known full-tree lint debt remains; changed-source checks are enforced.
- AUD-015: #413's emergency switch is present, but does not implement the original global monetary-reservation/cap objective. No new money/credit policy was authorized or invented.
- AUD-025: deletion still spans storage cleanup and Auth deletion non-atomically. The verified backup is not a transactional cross-service deletion saga.

These were never marked CLOSED in the authoritative ledger. Their precise current evidence is recorded without reclassifying old resolved code as a new defect. New unrelated RLS scanner observations remain deferred by the owner.

## Release and rollback

The initial publish requirement has been satisfied by the subsequently verified existing publish of #424, including #420. **No database migration is required**; the verified additive schema is already compatible. The six former `CODE_COMPLETE_RELEASE_PENDING` findings are CLOSED with the explicit release evidence above. Hosting evidence/policy and independent OPEN work remain separate. This documentation-only update requires no new application publish, paid AI or payment trial.

Rollback is a normal reviewed Git revert of the new application/test commit, with no database DROP, data rewrite, object deletion or force push. That would restore the specifically documented privacy/availability/accounting gaps, so should not be treated as remediation. Do not revert #404/#405/#412 database enforcement or publish older incompatible upload writers.
