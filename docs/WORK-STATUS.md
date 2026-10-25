# PromptBeats — Work Status (authoritative workflow ledger)

Read root `AGENTS.md` first. This ledger is **not** an audit report: it records independently verified current work, deployment status and evidence. Do not infer that a merged PR means release complete.

## Status vocabulary

- `OPEN`: verified remaining work not started.
- `IN_PROGRESS`: end-to-end work in active branch/PR.
- `BLOCKED`: cannot safely finish, with explicit owner/handoff and reason.
- `CODE_COMPLETE_RELEASE_PENDING`: complete merged code, but required deployment, migration or live verification is outstanding.
- `CLOSED`: all agreed acceptance and release checks verified, including deployment only if required.

## Reconciliation baseline — 2026-10-25

20 GitHub PRs **#403–#422** were verified merged during the audit conversation. Their merges are historical evidence of implementation, **not proof that every audit finding is CLOSED** or that code/migrations reached production. This ledger must be reconciled finding-by-finding against the live repository and release evidence; **do not repeat the original B-Findings register as an active backlog**.

| Scope                                                               | Current documented status              | Evidence                                                                                                           | Next verification / blocker                                                                   |
| ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Repository workflow policy                                          | CLOSED                                 | Merged #423: `8554aefd0c3a8bbb4b57fd5540c2380266579f03`; root contract, ledger, PR template and guard present      | ChatGPT Project Instructions remain external account configuration, not an audit code finding |
| Audit findings PB-AUD-001…026                                       | Individually reconciled below          | Original Reports B/C/D/E/F, merged #403–#423, current code, local SQL/mock tests and read-only production evidence | See each final finding entry; no automatic closure from merge alone                           |
| New RLS scanner observations (profiles, likes, public_staff_badges) | DEFERRED BY OWNER (not in original 26) | User decision                                                                                                      | No blanket RLS changes until explicitly resumed                                               |

## Required entry for every new task/finding

Copy the entry below **before the feature PR is merged**, replacing each placeholder with factual evidence. A new entry can remain IN_PROGRESS or BLOCKED when the scope cannot safely be closed.

### TASK-ID — title

- **Status:** OPEN | IN_PROGRESS | BLOCKED | CODE_COMPLETE_RELEASE_PENDING | CLOSED
- **Scope / acceptance:** …
- **Investigation:** current main SHA; reproduction; affected client/server/DB/integration paths; prior PR and impact review
- **Execution owner:** ChatGPT; or ChatGPT + Codex; Lovable only for proven tool limitation
- **PR and exact HEAD:** …
- **Verification:** focused tests; Regression; Browser Quality; Database Replay; other relevant evidence
- **Release:** migration/deploy/live checks necessary? applied? rollback plan?
- **Remaining work / owner:** precise next action or “none”
- **Closure evidence:** date and links; do not state CLOSED until complete

## AUDIT-CLOSURE-20261025 — consolidated verification and release boundaries

- **Status:** BLOCKED (only the explicitly unavailable hosting evidence and release authority; implementation/verification is complete in this branch).
- **Scope / acceptance:** Reconcile #403–#423 and all 26 original findings, execute safe failure/race tests, fix verified residual gaps in one PR, and preserve truthful release states.
- **Investigation:** Main `8554aefd0c3a8bbb4b57fd5540c2380266579f03`; original Reports B/C/D/E/F; actual current source and read-only production metadata; Published History #419, later changes unpublished.
- **Execution owner:** Codex; hosting operator for the remaining unavailable ingress configuration and separately authorized publish.
- **PR and exact HEAD:** Unified final-verification PR/HEAD and final three gate links are recorded together in its PR and the closure report.
- **Verification:** See the dossier and final exact-HEAD CI evidence. Five real local SQL suites, four independent-connection scripts, offline tests, TypeScript, affected-source lint/format and production build. No production writes or paid calls.
- **Release / remaining work:** No migration needed. Publish the final merged application only after separate authorization, then record the published snapshot. For AUD-021 provide trusted-IP overwrite/direct-origin configuration or an approved staging ingress; for AUD-024 approve/test a compatible CSP/frame policy. Independent OPEN policy/architecture findings are explicitly retained below.
- **Closure evidence:** Not CLOSED. Completed code work is not reopened; release/hosting blockers are not presented as missing code or hidden by green CI.

## Final finding-by-finding reconciliation — 2026-10-25

Common investigation baseline: `8554aefd0c3a8bbb4b57fd5540c2380266579f03`.
Execution owner: **Codex**. One verification/remediation branch: `codex/audit-final-verification`, [PR #424](https://github.com/Aeras/prompt-beats-studio/pull/424). Implementation commit: `aef4e01a91031b230a26dff51b8a472719d88382`; subsequent evidence-only commits and exact final check SHA are recorded in that PR.
Detailed evidence, release boundaries and reproducible commands: [final verification dossier](PB-AUD-final-verification-20261025.md).
Final verification PR/checks and its exact HEAD are recorded together in the PR and closure report; no editor HEAD is used as production proof.

Production read-only evidence: 19 exact SQL function-body matches, required RPC privileges/RLS/indexes/triggers, and existing applied migration history. Lovable History independently identifies **Published #419** (expected GitHub merge `ca215c53a1e8e30cdf24c85c47ca51a0f67232b9`); no reliable runtime-SHA endpoint exists. Later editor changes are explicitly unpublished. No production mutation was performed.

`CLOSED` below refers only to each finding's original acceptance contract, not a blanket security certification. New changes and #420 remain release-pending; original unimplemented policy/architecture findings are not misreported as solved by partial PRs. Final local/CI result evidence belongs to this single verification PR.

### PB-AUD-001 — Multipart byte integrity

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-001; reconciled against #405, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** upload-integrity.test.ts: exact bytes/SHA-256, framing CRLF, genuine trailing CRLF, chunking/boundaries and 50 MiB limits; published #419 includes #405.
- **Release / remaining work / owner:** No new production upload was needed; original R2 HEAD compatibility evidence retained.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-002 — Canonical verified audio MIME

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-002; reconciled against #405, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual upload/R2 fixtures enforce audio/mpeg or audio/wav from verified format, reject conflicts and preserve bytes; published #419.
- **Release / remaining work / owner:** No active-content/XSS exploit is asserted.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-003 — Collision-resistant R2 keys

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-003; reconciled against #405, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Fixed-clock parallel key tests and actual receipt-key uniqueness; crypto.randomUUID owner namespace; historical keys unchanged; published #419.
- **Release / remaining work / owner:** No production objects renamed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-004 — Signed URL revocation SLA

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-004; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current r2.server.ts still defaults to six-hour signed capabilities; no reviewed revocation-SLA change exists.
- **Release / remaining work / owner:** Owner must choose revocation SLA before changing TTL/proxy behavior; long-audio/PiP compatibility required.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-005 — Personal-track pagination

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-005; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current tracks.functions.ts listMyTracks still has no range/cursor contract.
- **Release / remaining work / owner:** Implement pagination and consumer behavior in its separately approved scope; no claim that previous upload fixes addressed it.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-006 — Immutable GitHub Actions refs

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-006; reconciled against #406, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #406 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #406; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** All action uses in current workflows are full commit SHAs; final three mandatory gates verify execution.
- **Release / remaining work / owner:** No production deploy required for CI configuration.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-007 — Full-tree lint debt

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-007; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** #423/current Regression intentionally gates changed source; full-tree ESLint still has pre-existing errors outside this task.
- **Release / remaining work / owner:** Separate baseline cleanup remains; changed-source PASS is not full-tree PASS.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-008 — Success-only upload quota

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-008; reconciled against #418, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #418 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #418; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production quota trigger/admission bodies exactly match migration; local SQL proves 20 successes/hour, failed/unfinalized attempts do not consume success quota, separate 100/hour abuse allowance.
- **Release / remaining work / owner:** No admission setting or quota policy changed in this task.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-009 — Finalized upload receipt

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-009; reconciled against #405 + receipt grant fix, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 + receipt grant fix is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405 + receipt grant fix; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production receipt trigger/helper ACL verified; rollback SQL tests ownership, expiry, one-time consumption, canonical URL, cleanup, missing evidence, legacy/external compatibility; independent receipt race PASS; published #419.
- **Release / remaining work / owner:** Storage/SQL are not a distributed transaction; out-of-band R2 credential misuse remains outside this contract.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-010 — Hydration authorization preconditions

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-010; reconciled against Original informational finding, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original informational finding is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original informational finding; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Original audit did not reproduce a bypass. Existing sharing/private-review caller authorization and terminal-state tests pass; signing preconditions remain server-owned.
- **Release / remaining work / owner:** Closed as reviewed non-finding, not as a newly fixed vulnerability. Capability revocation remains AUD-004.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-011 — Observed usage survives cancellation/failure

- **Status:** CODE_COMPLETE_RELEASE_PENDING
- **Scope / acceptance:** Original PB-AUD-011; reconciled against #404 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Tracked caller/QC cancellation and lost-ACK tests PASS. New correction preserves settlement when provider-error usage journal write fails.
- **Release / remaining work / owner:** Publish this PR's application correction after authorized merge; no migration needed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-012 — Background reconciliation and no blind replay

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-012; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production begin/remote/checkpoint/recovery/reaper bodies match; local leases/races and actual mocked background create/remote-callback/poll/deadline/restart/GET recovery PASS; published #419.
- **Release / remaining work / owner:** Provider create-before-ID crash remains honestly unknown, not automatically retried; no exactly-once upstream execution or provider retention guarantee is claimed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-013 — Bounded cancellation transport

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-013; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Non-cooperative fetch/body deadline tests and cancellation-classification regressions PASS; bound source is in published #419.
- **Release / remaining work / owner:** Timeout is unconfirmed cancellation, never proof of zero provider cost.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-014 — Atomic revision finalization

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-014; reconciled against #412, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #412 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #412; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual production service-only function body/signature/ACL match; project version-history rollback tests and three standalone lock-order cases on independent connections PASS; published #419.
- **Release / remaining work / owner:** No production revision/test song created; no migration replayed there.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-015 — Global monetary exposure controls

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-015; reconciled against #413 partial mitigation, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #413 partial mitigation is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #413 partial mitigation; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Central emergency dispatch switch exists. It is not the original global monetary-reservation/cap control.
- **Release / remaining work / owner:** Owner/product approval is required for monetary/credit policy; no new policy implemented here.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-016 — Moderation-aware playlists/favorites

- **Status:** CODE_COMPLETE_RELEASE_PENDING
- **Scope / acceptance:** Original PB-AUD-016; reconciled against #408 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #408 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #408 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual handler fixtures cover third-party locked/unpublished/missing items, owner-private content, counts/durations/covers, redaction, favorite IDs and add/remove behavior.
- **Release / remaining work / owner:** Publish the complete projection correction in this PR; no RLS/schema change.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-017 — Honest Stop outcome messages

- **Status:** CODE_COMPLETE_RELEASE_PENDING
- **Scope / acceptance:** Original PB-AUD-017; reconciled against #420, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #420 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #420; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current EL/EN UI distinguishes before-start, upstream-confirmed and unconfirmed/possibly charged outcomes; full source/browser checks cover current code.
- **Release / remaining work / owner:** Lovable Published marker is #419, so #420 must still be published; no provider/billing logic change needed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-018 — Checkout idempotency and recovery

- **Status:** CODE_COMPLETE_RELEASE_PENDING
- **Scope / acceptance:** Original PB-AUD-018; reconciled against #414–#417 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #414–#417 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #414–#417 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production reservation function/ACL match; real SQL lease and independent-connection reservation races PASS; actual handler Stripe mocks cover active/trialing, retries, open sessions, failures, delayed webhook and later repurchase.
- **Release / remaining work / owner:** Publish new customer-bound live subscription preflight to cover delayed/missing webhook projection; no payment or DB migration required.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-019 — Sensitive diagnostic logging

- **Status:** CODE_COMPLETE_RELEASE_PENDING
- **Scope / acceptance:** Original PB-AUD-019; reconciled against #407/#410/#421/#422 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #407/#410/#421/#422 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #407/#410/#421/#422 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Synthetic marker captures exercise actual discovery/Anthropic/RunPod/QC/reporter/SSR paths; allowlisted labels and schema paths; central message/stack/cause expansion removed.
- **Release / remaining work / owner:** Publish the complete logging correction; no prompts, scoring or provider calls changed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-020 — Dependency advisories

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-020; reconciled against #403/#419, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #403/#419 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #403/#419; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Published history explicitly marks #419; Zod 4.6.7 compatibility/security tests and frozen install pass, deprecated Drizzle/esbuild path absent, fresh audit clean.
- **Release / remaining work / owner:** An empty dependency audit is not a whole-application security guarantee.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-021 — Trusted ingress IP evidence

- **Status:** BLOCKED
- **Scope / acceptance:** Original PB-AUD-021; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Source selects CF/real/forwarded headers; production is behind Cloudflare, but no available API/UI exposes final trusted-hop overwrite or origin-bypass controls. No spoofing exploit claimed.
- **Release / remaining work / owner:** Hosting operator: provide a read-only canonical-client-IP overwrite/direct-origin-block configuration export, or an approved staging ingress for controlled spoof-resistance verification.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-022 — Reasoning/cache/receipt attribution

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-022; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual provider normalization regressions and SQL estimates/receipt tests PASS; production ledger/pricing functions and columns/RLS verified; published #419.
- **Release / remaining work / owner:** Reasoning is counted once; cache subsets not priced as uncached; provider-reported USD is not an independently verified invoice. Unknown historical values were not backfilled.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-023 — Idempotent usage delivery

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-023; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production usage primary key and settlement/outbox bodies verified; lost-ACK replay and independent concurrent settlement tests PASS; published #419.
- **Release / remaining work / owner:** A genuinely new dispatch has a new identity; unidentified historical rows cannot safely be deduplicated by guesswork.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-024 — Production CSP/frame policy

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-024; reconciled against Original audit + current HTTP evidence, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit + current HTTP evidence is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit + current HTTP evidence; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Ordinary production GET confirms HSTS/nosniff/referrer policy, but no CSP/CSP-Report-Only/X-Frame-Options/Permissions-Policy on that response.
- **Release / remaining work / owner:** Approve and validate hosting CSP/frame policy in staging for OAuth/media/Lovable preview/PiP/PWA before enforcement. No production exploit or blanket header absence is asserted.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-025 — Cross-service account deletion

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-025; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current admin deletion still spans object cleanup and Auth deletion without a distributed transaction; a verified backup does not make it atomic.
- **Release / remaining work / owner:** Resumable deletion/retention policy is independent approved work; no real account deletion performed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-026 — Generator hard input budgets

- **Status:** CODE_COMPLETE_RELEASE_PENDING
- **Scope / acceptance:** Original PB-AUD-026; reconciled against #409 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #409 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #409 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual live schema per-field/nested bounds, Unicode/escaping/encoded byte ceiling and no-provider-on-oversize tests PASS; raw-RPC worker and shared generator now enforce the same aggregate budget.
- **Release / remaining work / owner:** Publish this PR's pre-dispatch checks; existing admin/normal-user limits and saved historical content remain unchanged.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.
