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

- **Status:** CLOSED (verification/reconciliation task completed; 20 findings CLOSED and six independent findings remain explicitly OPEN, not a blanket security certification).
- **Scope / acceptance:** Reconcile #403–#423 and all 26 original findings, execute safe failure/race tests, fix verified residual gaps in one PR, and preserve truthful release states.
- **Investigation:** Initial main `8554aefd0c3a8bbb4b57fd5540c2380266579f03`; original Reports B/C/D/E/F, #424 verification and #425 remediation. Initial Published #419 evidence was superseded by the recorded #424 and #425 releases below.
- **Execution owner:** Codex; owner explicitly approved the coordinated PB-AUD-021 migration/publish, bounded functional tests and registry-only commit/push on 2026-10-25. Trusted ingress evidence is no longer a prerequisite for these admission controls.
- **PR and exact HEAD:** Unified final-verification PR/HEAD and final three gate links are recorded together in its PR and the closure report.
- **Verification:** See the dossier and final exact-HEAD CI evidence. Five real local SQL suites, four independent-connection scripts, offline tests, TypeScript, affected-source lint/format and production build. No production writes or paid calls.
- **Release / remaining work:** #425 application `6867d8c18c704e4675cc9329f0de8c324c86729a` published and its specific migration/functional checks verified below. AUD-004/005/007/015/024/025 remain independent OPEN work; none is relabeled as solved by this release.
- **Closure evidence:** 2026-10-25; consolidated verification and all approved implementation release dependencies completed with the explicit evidence below. No remaining BLOCKED or publish-only finding in the reconciled 26; six independent OPEN findings remain.

## Final finding-by-finding reconciliation — 2026-10-25

Common investigation baseline: `8554aefd0c3a8bbb4b57fd5540c2380266579f03`.
Execution owner: **Codex**. One verification/remediation branch: `codex/audit-final-verification`, [PR #424](https://github.com/Aeras/prompt-beats-studio/pull/424). Implementation commit: `aef4e01a91031b230a26dff51b8a472719d88382`; subsequent evidence-only commits and exact final check SHA are recorded in that PR.
Detailed evidence, release boundaries and reproducible commands: [final verification dossier](PB-AUD-final-verification-20261025.md).
Final verification PR/checks and its exact HEAD are recorded together in the PR and closure report; no editor HEAD is used as production proof.

Production read-only evidence: 19 exact SQL function-body matches, required RPC privileges/RLS/indexes/triggers, and existing applied migration history. Initial inspection identified Published #419; the subsequent release check below supersedes that publication state. No reliable runtime-SHA endpoint exists. No production mutation was performed.

`CLOSED` below refers only to each finding's original acceptance contract, not a blanket security certification. The six former release-pending findings were closed after the publication check below; original unimplemented policy/architecture findings are not misreported as solved by partial PRs. Final local/CI result evidence belongs to the unified verification PR.

### Publication verification — 2026-10-25, observed 02:40 UTC

- Lovable History places **Published** on `Merge PR #424: final audit verification and security gap closure`, mapped through GitHub to `609678f779268016c2864baf8ca4c89140407522`.
- The publication popover says **Your website was updated**, with domain `promptbeats.app`. The API editor SHA also matches, but is only corroborating editor evidence, not the publication proof.
- Ordinary anonymous GET `/`, `/auth` and `/discover`: **HTTP 200**, HTML, no observed catastrophic SSR error page. No authenticated write, AI call, payment, migration or new deployment was executed.
- Existing final-main Regression, Browser Quality and Database Replay are PASS: [Regression](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770454), [Browser](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770440), [Database](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770475). Detailed behavioral verification remains the prior offline/isolated SQL evidence; the page checks are not live provider or payment tests.
- **PB-AUD-011/016/017/018/019/026: CLOSED**. Totals: **19 CLOSED, 6 OPEN, 1 BLOCKED**, no publish-only finding pending. Runtime binary/SHA attestation remains unavailable; closure uses explicit hosting publication evidence plus the already verified compatible schema and tests.
- The historical #419 marker is preserved as earlier evidence, not represented as the current published snapshot. This documentation-only follow-up does not require republishing application code.

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

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-011; reconciled against #404 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Tracked caller/QC cancellation and lost-ACK tests PASS. New correction preserves settlement when provider-error usage journal write fails.
- **Release / remaining work / owner:** Application correction published in #424; no migration needed or remaining publish action.
- **Closure evidence:** 2026-10-25 publication verification above plus tracked-caller/QC/offline usage evidence in the [dossier](PB-AUD-final-verification-20261025.md).

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

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-016; reconciled against #408 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #408 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #408 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual handler fixtures cover third-party locked/unpublished/missing items, owner-private content, counts/durations/covers, redaction, favorite IDs and add/remove behavior.
- **Release / remaining work / owner:** Complete projection correction published in #424; no RLS/schema change or remaining publish action.
- **Closure evidence:** 2026-10-25 publication verification above plus actual-handler moderation fixtures in the [dossier](PB-AUD-final-verification-20261025.md).

### PB-AUD-017 — Honest Stop outcome messages

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-017; reconciled against #420, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #420 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #420; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current EL/EN UI distinguishes before-start, upstream-confirmed and unconfirmed/possibly charged outcomes; full source/browser checks cover current code.
- **Release / remaining work / owner:** Published #424 includes merged #420; no provider/billing logic change or remaining publish action.
- **Closure evidence:** 2026-10-25 publication verification above plus existing Stop-message/source/browser evidence in the [dossier](PB-AUD-final-verification-20261025.md).

### PB-AUD-018 — Checkout idempotency and recovery

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-018; reconciled against #414–#417 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #414–#417 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #414–#417 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production reservation function/ACL match; real SQL lease and independent-connection reservation races PASS; actual handler Stripe mocks cover active/trialing, retries, open sessions, failures, delayed webhook and later repurchase.
- **Release / remaining work / owner:** Customer-bound subscription preflight published in #424; compatible reservation schema already verified. No payment or DB migration required.
- **Closure evidence:** 2026-10-25 publication verification above plus Stripe mocks and SQL reservation races in the [dossier](PB-AUD-final-verification-20261025.md); no live transaction claimed.

### PB-AUD-019 — Sensitive diagnostic logging

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-019; reconciled against #407/#410/#421/#422 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #407/#410/#421/#422 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #407/#410/#421/#422 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Synthetic marker captures exercise actual discovery/Anthropic/RunPod/QC/reporter/SSR paths; allowlisted labels and schema paths; central message/stack/cause expansion removed.
- **Release / remaining work / owner:** Complete logging correction published in #424; no prompts, scoring or provider calls changed.
- **Closure evidence:** 2026-10-25 publication verification above plus synthetic-marker/central-capture tests in the [dossier](PB-AUD-final-verification-20261025.md).

### PB-AUD-020 — Dependency advisories

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-020; reconciled against #403/#419, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #403/#419 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #403/#419; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Published history explicitly marks #419; Zod 4.6.7 compatibility/security tests and frozen install pass, deprecated Drizzle/esbuild path absent, fresh audit clean.
- **Release / remaining work / owner:** An empty dependency audit is not a whole-application security guarantee.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-021 — IP-independent Contact / Private Review admission

- **Status:** CLOSED — approved production migration, publish and bounded functional verification completed 2026-10-25.
- **Scope / acceptance:** Remove dependence on all unverified IP headers for Contact and Private Review, preserve normalized email/session limits and privacy, enforce atomic concurrency and server-only RPCs; no common fingerprint that locks out all users.
- **Investigation:** Main `3aa23fa0b2e9bc72206061c5f7f9a2e83215a21d`; owner confirms DNS-only records and no final-ingress guarantees. Full Contact/SMTP, anonymous reviewer join/PIN, owner/auth, legacy admission RPC and existing bearer authorization paths traced. Historical migrations are unchanged; no anonymous direct-RPC bypass is claimed after existing #step8 grants.
- **Execution owner:** Codex. [PR #425](https://github.com/Aeras/prompt-beats-studio/pull/425) merged as `6867d8c18c704e4675cc9329f0de8c324c86729a`; verified final PR HEAD `2abc08ffc4bddb68db0b5bcdbe2c84e49fc6bc5c`. Owner gave one explicit approval for the specific coordinated release, one Contact email, one controlled private review and registry-only commit/push.
- **Implementation:** Message/identity-bound signed single-use work proof; atomic Contact email 3/30m, verified account 10/30m independently and guest ceiling 120/30m. No shared authenticated cap. Private Review admission/PIN failure/reviewer creation in one session-row-locked RPC, with per-session short/hour windows and legacy failure carry-over. No network header read or raw IP storage.
- **Verification:** 1,073 offline Bun tests / 7,266 assertions, strict TypeScript, changed-source lint/format, build, six local SQL suites and five race scripts PASS. All three gates PASS on merged application SHA: [Regression](https://github.com/Aeras/prompt-beats-studio/actions/runs/40169518380), [Browser Quality](https://github.com/Aeras/prompt-beats-studio/actions/runs/40169518399), [Database Replay](https://github.com/Aeras/prompt-beats-studio/actions/runs/40169518452). Browser gate has the documented existing PB-012 retry; new proof tests pass in all three viewports. No production stress or paid call.
- **Release / remaining work / owner:** No release action remains for PB-AUD-021. Production project `qwlksrcsovbncmretjdt` verified ACTIVE_HEALTHY, PostgreSQL 17.6.1.166. Applied only canonical `20261025030941_pb_aud_021_ip_independent_admission.sql` (SHA-256 `97046a0e44997cfa7a0b80b76062b7d09021b2e71ab726ab2dfb8282ab463091`) through the established Supabase migration API. Its actual management-generated history version is **20261025065526**, name `pb_aud_021_ip_independent_admission`; history grew by exactly this one record, with none removed. Four unrelated historical ledger differences were identified as non-prerequisites and left untouched.
- **Preflight / recovery:** Existing backup `PromptBeats-DB-Backup-20261024-164640` rechecked: all three DPAPI exports readable in memory with matching bytes/SHA-256; prior real restore evidence is 101/101 tables, 170 FKs and 87 policies PASS. Owner acknowledged the backup's 2026-10-24 13:47 UTC recovery point and newer-data limitation. No new backup or restore was run. No concurrent active schema change, waiting review lock or Lovable agent release was observed; owner agreed not to start a parallel release. Recovery plan never restored spoofable legacy admission.
- **Production schema/security evidence:** All five deployed function bodies exactly match the canonical migration; their signatures/results are compatible, search_path is empty, anon/authenticated EXECUTE is false and service_role EXECUTE true. Both new tables have RLS enabled and no anon/authenticated DML/read grants; required service grants and all indexes verified. No other migration or hosting setting changed.
- **Published application evidence:** Immediately requested Lovable deploy after successful migration; deployment ID `af1b13fc-e22a-48ee-be71-5e8aa6270869`. Fresh Lovable History shows **Published on #425**, mapped to `6867d8c18c704e4675cc9329f0de8c324c86729a`; editor SHA independently matches. Publication and actual new production behavior, not editor synchronization alone, establish this release. No independent runtime binary-SHA endpoint is claimed. This subsequent registry-only commit needs no application republish.
- **Production Contact evidence:** Submitted exactly one owner-approved controlled message to `support@promptbeats.app` through the freshly loaded production Contact page. The form cleared after the server completed successfully; one new v2 receipt belongs to the authorized test account. This confirms proof/admission and the awaited SMTP send path, not independent inbox-delivery attestation. No resends or unrelated receipts were modified.
- **Production Private Review / compatibility evidence:** There were zero review sessions before testing. Created one private PIN-protected, no-audio test link through the old published application before migration, without editing Project/track content. After publish, one wrong PIN displayed `Invalid PIN.` and durably recorded 1 attempt/1 failure/0 reviewers; one correct PIN opened that same legacy link. Final counts: **2 attempts, 1 PIN failure, 1 reviewer**. Token hash and snapshot checksum are unchanged across cutover. Closed only that controlled review afterward; owner UI confirms `closed`, and reviewer reload shows the closed message with no Lyrics/content. No existing customer link was fabricated or claimed tested when none existed.
- **Limits / rollback:** Guest-cap exhaustion and targeted session lockout are explicit bounded availability trade-offs, not claimed eliminated; independent accounts/sessions and existing reviewers remain isolated. No destructive down migration or blind rollback to spoofable admission. See full release/compatibility/rollback procedure in the handoff.
- **Closure evidence:** 2026-10-25, final checks at 07:10 UTC. Migration, permissions/RLS, Published snapshot, Contact, invalid/valid PIN, pre-migration link compatibility and final controlled-session closure all PASS. Test PIN, bearer link, reviewer key, credentials and personal content are not included in this ledger.

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

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-026; reconciled against #409 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #409 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #409 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual live schema per-field/nested bounds, Unicode/escaping/encoded byte ceiling and no-provider-on-oversize tests PASS; raw-RPC worker and shared generator now enforce the same aggregate budget.
- **Release / remaining work / owner:** Pre-dispatch checks published in #424; existing admin/normal-user limits and saved historical content remain unchanged.
- **Closure evidence:** 2026-10-25 publication verification above plus actual-schema/encoded-budget/no-dispatch tests in the [dossier](PB-AUD-final-verification-20261025.md).

## PB-UX-20261025-01 — Live Liked Tracks synchronization

- **Status:** IN_PROGRESS
- **Scope / acceptance:** Like and Unlike must reflect in Library → Liked Tracks without page reload; unlike removes a visible row immediately, failed mutation restores it; newly liked tracks refetch through the existing authorized server projection.
- **Investigation:** Existing useLikes in `src/lib/likes.ts` only updates/invalidate per-track `["likes", trackId, userId]`; Library reads `["library", "liked", userId]` via `listLikedTracks`. Independent keys caused stale listing.
- **Execution owner:** ChatGPT.
- **PR and exact HEAD:** Branch `fix/pb-liked-library-live-sync-20261025`; record final PR HEAD after CI.
- **Verification:** Contract test added. Browser Quality and Database Replay PASS at initial HEAD; Regression first failed on stale PR event body format and requires a fresh PR check run. Full runtime/UI verification remains outstanding.
- **Release:** No schema change. Merge is not publish; confirm Lovable publication and UI after approval.
- **Remaining work / owner:** Finish tests, CI and PR review, then approved publish and runtime verification.
