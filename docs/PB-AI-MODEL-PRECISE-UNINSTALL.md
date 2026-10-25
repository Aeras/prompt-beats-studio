# PR #437 — precise AI model uninstall dependencies

## Contract and verified baseline

Continues `fix/ai-model-uninstall-precise-dependencies-20261025` from `fe05cd41ec058444da9aff635cf7846139404da5`, based on main `4a717bc94019c3afcc6699c7d5fc7f4690648b6d`. Preserve ChatGPT's concise confirmation. No new PR, prompts, models, charges, subscription rules or production changes.

The prior migration treated every unresolved auxiliary request and every explicit user grant as a blocker. The actual `inherit` resolver returns only the operation's global default; it does not expose the entire catalog. Therefore removing the final custom grant can safely return that row to empty `inherit`, without adding an entitlement.

## Implementation

Forward migration: `20261025200633_precise_ai_model_uninstall_dependencies.sql`. Historical migrations remain immutable.

- The three authoritative Generator / AI Tools / Quality Check defaults remain protected under the existing transaction fence. Admin eligibility, CAS, all-or-nothing deletion, audit and tombstones remain enforced.
- `ai_auxiliary_model_uses` stores one server-authoritative dispatch admission, its actual model, owning durable request/account and optional durable usage receipt identity. It has RLS, revoked direct table grants, indexed references and service-role-only start/receipt RPCs. It contains no prompt, provider key or request execution token.
- Durable auxiliary execution uses `AsyncLocalStorage` to propagate the authenticated action context. The server-resolved model is persisted before dispatch. This includes Setup Assistant, audio revision intent, Inspiration Wall, Story Map, Song Universe/planner and Analyzer V1/V2. Raw multi-stage Analyzer calls explicitly mark each model; tracked `modelCaller` covers secondary/final-judge models. Replay of a completed action never creates a new dispatch.
- Admission and uninstall share the existing short database fence: admission winning blocks its model; uninstall winning leaves a tombstone that rejects dispatch. No lock is held across an external provider call. Requests and accounting are never inferred to be finished from age alone.
- Usage is persisted through the existing idempotent receipt/outbox first. Association is separate and cannot discard consumption evidence or change receipt IDs, token normalization, estimates or provider-reported charges. A queued receipt continues to block until flushed. A missing/unknown receipt or failed association keeps a conservative blocker **only for that model**. Reconciliation can use the existing server-only association RPC once trustworthy same-user/model evidence exists; do not invent financial data or delete evidence to unblock.
- A terminal auxiliary request with final durable usage is historical and does not block uninstall. A currently processing request, uncertain provider execution, recoverable result or pending receipt/outbox remains protected. Unidentified legacy auxiliary rows no longer block unrelated models; this requires the release boundary below, not an assumption that old workers are drained.
- Explicit user grants are removed in the same transaction as deletion, retaining other grants and their order. Empty lists become global-default-only `inherit`. New grants for removed identities are still rejected by tombstones. Admin/user access caches are invalidated after success.
- An unused legacy `ai_model` reference is removed when all three operation defaults are independently valid. If an operation setting is missing, it is redirected to another compatible remaining model. The three authoritative settings are never changed. Only the genuinely unsafe case of missing operation defaults plus no compatible remaining fallback is rejected; configure the missing operation defaults first.
- Audit retains names/IDs/provider identifiers, pricing metadata, affected grant-row count and before/after legacy fallback. Historical songs, results, requests, receipts and financial records are not deleted. Unknown future registry FKs still fail closed rather than cascade into history.

The application removes obsolete grant/legacy reassign controls from the concise confirmation, displays model-specific work/accounting blockers and preserves the approved dark/compact/sticky design. No new workflow or pricing policy is introduced.

## Evidence and reproducible verification

- `ai-auxiliary-model-context.test.ts`: actual context code with isolated RPC doubles; account isolation, primary/secondary models, no dispatch after admission failure, concurrent same-model receipts, deduplication and association failure retention.
- Existing Analyzer V2 endpoint/durable replay fixtures continue proving one provider call/usage row on replay; assertions now inspect the model-aware server boundary.
- `supabase/tests/ai_model_precise_dependencies.sql`: role/RLS ACLs, unrelated and unidentified legacy work, specific active work, outbox/final/unknown usage, no fabricated zero cost, cross-user receipt rejection, banned account, atomic grant cleanup, three defaults, legacy removal/replacement/unsafe last fallback, audit and historical retention. All fixtures roll back.
- `scripts/tests/ai-model-precise-dependency-races.sh`: independent connections and observed barriers for auxiliary start/delete in both orders, unrelated removal and accounting settlement/delete. The existing grant/uninstall race now verifies atomic cleanup rather than an obsolete grant blocker. Both suites are wired into Database Replay.
- Existing table tests plus a new default/nondefault concise-confirmation case cover desktop/tablet/mobile with network mocks. No actual model is deleted by browser tests.
- Full Bun regression, strict TypeScript, changed-source ESLint/Prettier, production build, fresh isolated replay and all three exact-head CI gates are required. Final counts, SHA and live run links are recorded in PR #437 and the final report.

## Production boundary, recovery and limitations

No production migration or publish is authorized by this task.

1. Independently review the exact final PR HEAD and green gates. Verify production schema/history, backup/recovery and only the named migration's prerequisites; never run a blanket migration push.
2. Coordinate an auxiliary-AI and model-admin quiet window and **verify old workers/dispatches are drained**. Existing unidentified rows cannot prove their model or worker activity. Do not guess a model, rewrite historical requests or treat their age as drainage evidence. If hosting cannot prove drainage, obtain a verified operator-controlled quiet/stop procedure before mutation.
3. Apply this additive migration, verify private-table/RPC ACLs, three unchanged operation defaults, the new fence and actual model-use functions. The old identity-free provider-start RPC deliberately fails closed after migration, preventing an old server from starting unlabelled work. This creates a short expected availability boundary until the compatible server is published.
4. Publish the compatible merged application only with separate approval. Confirm the actual published server snapshot, not just the Lovable editor. Reload old admin tabs. Restore admissions only after the compatible path is verified. No billable smoke call or real uninstall is implied by this procedure.

A failed migration rolls back transactionally. After success, retain schema, audit, tombstones and receipts; prefer a forward correction. Reverting to identity-free dispatch or the blanket blocker is not an acceptable safety workaround. An older application cannot safely perform auxiliary work after the boundary; keep auxiliary dispatch quiet if publishing fails. Do not down-migrate/delete data or fabricate provider settlement. Unknown receipts or metadata-ack failures can require evidence-based reconciliation and remain visible as precise blockers. Historical already-recorded unknown/pending-pricing entries are retained honestly; no backfill or invoice claim is fabricated, and pricing metadata is retained in uninstall audit for review.

This change does not promise retroactive cancellation of provider work, exactly-once external execution, or recovery of model identity that old code never stored. It does not change the previous treatment of already-started untracked admin health/compatibility probes; they may finish but cannot recreate a deleted registry row. This task remains release-pending until the separately approved migration, compatible publish and runtime verification occur.
