# Failed Generator identity and safe terminal reconciliation

## Baseline / investigation

Main `b2e286017cc9a18602f4288808e0ae53f14640fb`, after #437/#438. Single cohesive PR; no production changes. Investigated model selection (`generation-jobs.functions.ts`, `getModelForUser`), job admission, `begin_ai_execution_internal`, `trackedCaller` checkpoints/usage, Generator parser/validation, failed-job writes, recovery leases/counters, idempotent accounting/outbox and admin uninstall. Existing open HTTP-failure PR #373 is independent; no provider/request/prompt changes here.

Two distinct root causes: admission validated but discarded the resolved model and only successful completion populated `job.model`; persisted raw provider output was treated as recoverable without a durable distinction between application-invalid output and valid work whose persistence failed. Old recovery-attempt exhaustion could also remove the uninstall blocker without final application proof. The new path never uses counter exhaustion as proof.

## Model identity

The authenticated API pins its server-resolved model into the queued payload (normal, revision and section edit). A forward insert trigger records model/provider before execution, including the configured default for legacy RPC payloads. The existing registry transaction fence protects admission against concurrent uninstall. Actual execution insertion writes its server-resolved identity onto the owned processing job before dispatch. Successful or failed status updates do not erase it. For historical NULL jobs, reconciliation uses only the linked execution's identity, never a guessed default or arbitrary historical backfill.

## Deterministic decision and trust boundary

`generation-result.shared.ts` contains the **unchanged** existing song schema and legacy JSON/text-section parser, now reused for stored-response classification. No prompt, limits, output schema or QC scoring changes.

- Valid song output stays recoverable, even if accompanied by max_tokens.
- Invalid song output with known end_turn can be terminally rejected as invalid_response.
- Invalid truncated output with max_tokens can be rejected as incomplete_response.
- Ambiguous stop reasons, unknown envelope shapes, other operations, cancellation and valid content never receive a rejection attestation.

`reconcileFailedGeneration` is an internal server helper, not a browser endpoint. It reads the exact saved response and attests to its deterministic classification. SQL trusts this restricted service-role validator attestation; SQL does **not** independently reimplement Zod. The SQL transaction verifies ownership, linked execution, failed/completed job status, no cancellation, supported operation, response_observed state, exact unchanged response snapshot, compatible stop reason and final durable usage. Ordinary users/anon cannot invoke it. Raw output is never logged or returned to the Admin.

## Financial and concurrency invariants

Forward migration `20261026053341_failed_generation_terminal_reconciliation.sql` adds nullable application resolution/time, with a paired consistency constraint. No existing row is reconciled by the migration.

Finality requires the same execution ID/user/provider/model/operation in ai_usage_logs, provider_usage_state=final, normalized token fields matching the observed receipt, compatible provider-reported cost (same database numeric precision), and no pending outbox entry for that identity. Empty/unknown/partial usage is not declared final. Estimated cost and provider invoice amounts remain separate; pending pricing alone does not fabricate unknown consumption or block trustworthy final token evidence. Existing pricing snapshots/audit preserve historical estimation inputs.

The resolver takes the shared registry fence before NOWAIT execution/job row locks. Busy claim/cancel/recovery rows fail closed for later retry instead of introducing a lock-order deadlock. Uninstall takes the existing exclusive fence and re-reads the final guards. Resolution is idempotent; it writes no usage entries, changes no recovery counter, deletes no result, and leaves failure status/history intact. Existing receipt/outbox delivery remains keyed by execution ID, including lost-ACK replay.

Fresh worker failures attempt reconciliation after writing failure. The normal bounded recovery sweep records/replays provider usage first, then attempts the same deterministic reconciliation without another generation. A separate service-only validation queue claims at most 20 stored/finally-accounted failed jobs per sweep, with a 15-minute recheck interval and SKIP LOCKED, independently of exhausted recovery counters. It only requests the shared deterministic classifier, never a provider call or a counter reset. Interrupted validation becomes eligible again after the interval. Positively resolved invalid outputs are excluded from application/receipt recovery claims. Genuine valid results still use the existing recovery flow, and remain blockers even after the bounded automatic retry budget is exhausted. No forced retry or new paid call is introduced.

## Admin blockers

Existing active/default/registry/auxiliary guards stay intact. New recovery_pending and accounting_pending messages distinguish stored-result recovery from final usage reconciliation; active_jobs explicitly identifies active/queued work. The legacy unresolved_execution reason is retained for compatibility and unknown provider outcomes. Defaults still require explicit replacement. No UI action overrides guards.

## Verification

Offline classifier/helper tests: JSON/legacy text, Russian Unicode, unchanged limits, valid content at token limit, invalid/truncated/ambiguous envelopes, exact snapshot/owner identity, unavailable DB and no provider call. SQL tests reproduce failed NULL-model response_observed with recovery counter zero, missing/final/outbox receipts, duplicate delivery, active/cancelled denial, stale snapshot, ownership, RLS/RPC ACLs, terminal idempotency and retained result/counter/history. Independent-connection races cover blocked uninstall before proof, reconciliation/uninstall ordering and concurrent resolver retry. Browser fixtures check the three blocker categories and disabled Delete without real deletion. All existing SQL/RLS/race and full unit/browser gates must also pass. The historical admin fixture now supplies its final synthetic receipt rather than asserting that financially unknown completed work is uninstallable.

Exact final HEAD, counts and Regression/Browser Quality/Database Replay links are recorded in the PR description after verification. No billable AI calls.

## Separate safe release plan

1. Independent review and exact-head mandatory gates green. Confirm main, production target, prerequisite #437/#438 migrations by actual definitions/history (not guessed timestamps), deployed worker versions and verified recovery capability.
2. Separate owner approval is required for this migration, compatible publish **and allowing the new normal recovery worker to reconcile existing historical failures**. No production reconciliation is authorized or executed by this implementation task.
3. Respect the existing #437 old-worker/admission quiet-window boundary. Do not assume stale rows prove active workers or drainage. Do not use OFF as proof that old binaries stopped. Resolve hosting coordination before any incompatible cutover.
4. Apply only this additive forward migration after prerequisites; verify private RPC/grants/trigger/guards and that no historical results/receipts were changed by DDL. Publish compatible code only with authorization. Earlier compatible code can run with the additive columns, but cannot produce final attestations; no guard is weakened to compensate.
5. Once explicitly authorized, let bounded normal recovery process eligible evidence; the existing authenticated runner sweep must actually be scheduled/invoked by the operator (this PR does not create production cron). inspect aggregate resolution, row/receipt counts and absence of new provider dispatch. Preserve unknown usage, valid recoverable work and blocked rows. Never manually edit counters, delete results, settle fictional zero cost or run a billable smoke generation to unblock a model.
6. Recovery: prefer a reviewed forward correction. An app rollback leaves additive schema and raw/financial evidence intact; old workers do not understand resolution and must not be allowed to redispatch or race old registry logic. Keep AI/model-admin activity quiet under the verified hosting procedure if deployment fails. Never down-migrate/delete evidence.

Residual limitations: unknown provider consumption and exhausted recovery of genuinely valid results remain blocked pending trustworthy reconciliation or separately reviewed recovery. This implementation does not recover missing historical model identity without a linked execution, does not claim provider exactly-once, and does not verify an invoice. State stays CODE_COMPLETE_RELEASE_PENDING until separately approved release/runtime verification.
