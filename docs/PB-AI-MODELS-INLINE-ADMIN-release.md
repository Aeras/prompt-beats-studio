# AI Models inline administration — PR #435

## Scope and compatibility

Implements the three approved changes in `PB-AI-MODELS-INLINE-ADMIN-20261025.md` on the existing branch. No AI prompts, model selections, generation stages, Quality Check scoring, pricing policies, subscriptions or production data are changed. Existing advanced pricing/reasoning editor, discovery, explicit compatibility probes and health actions remain available. Tests use synthetic models and intercepted requests; no provider probes were executed.

`InstalledAiModelsTable.tsx` owns compact circular switches, dark Radix menus, per-model queued partial mutations, inline burgundy uninstall confirmation, focus restoration and the single-page-scroll sticky header. A `ResizeObserver` follows the real AppShell header. Only the body scrolls horizontally; its offset is mirrored into the separate sticky column header. No fixed-height vertical table viewport is added. Existing English/Greek model labels are preserved. Selected-users links to the existing management Users panel; selecting that policy never invents a user entitlement.

## Authoritative writes and uninstall

Migration `20261025173752_ai_models_inline_admin_uninstall.sql` adds a safe-integer revision, inaccessible registry tombstones, transaction fencing and four caller-JWT RPCs. They enforce fresh admin/account eligibility, strict field/count/type validation, compare-and-set, compatibility/default checks and transactional audit. Advanced edits now require the same revision. Concurrent stale requests fail rather than overwrite another administrator. Audit failure rolls back the entire mutation.

The registry/default fence is exclusive for short configuration transactions; related job/execution/access/outbox writes use a shared fence. Statement triggers acquire it before tuple mutation. Repeatable-read/serializable mutations fail with `40001` rather than use a stale dependency snapshot. Dependency reads are **volatile**, including after waiting on the fence. No provider/network request runs inside these transactions. Ordinary job writes remain concurrent with each other. Existing database/race suites exercise compatibility with the accounting, upload, checkout, Beta and Library paths.

Hard uninstall deletes **only selected `ai_models` rows**, atomically, with names/IDs/provider identifiers recorded in the existing audit log. It blocks all four real default settings, explicit user-model grants, pending/processing generation/QC jobs, unknown/accepted provider executions, recoverable unconsumed results, pending usage outbox receipts and unresolved auxiliary requests. Auxiliary requests have no durable selected-model column, so their unresolved state conservatively blocks uninstall for all models; age alone is not evidence of a running worker or permission to erase a job. Use the existing completion/recovery workflow, not speculative deletion.

There were no foreign keys referencing the registry at investigation. An unknown future FK makes uninstall fail closed; no cascade into history is permitted. Completed jobs, songs, prompts, Quality Checks, provider evidence and usage/financial records are retained. A late observed usage receipt remains recordable after uninstall. Removed identities reject new job/dispatch/grant admissions until explicit fresh add/discovery reinstalls the model. Existing installed health/compatibility probes are not durable application jobs; an already-started probe can finish after removal, but its metadata update cannot recreate the deleted row. The current UI prevents confirmation while its admin mutations are pending. No claim of cancelling already-dispatched external work is made.

The legacy `ai_model` setting is a real fallback used by the resolver. Blocking it without a replacement would strand uninstall. The confirmation therefore exposes an eligible replacement **only when that legacy fallback is selected**; this atomic action changes its own setting only, not Generator/QC/AI Tools defaults. Restricted-access defaults remain supported under existing global-default semantics. User grants are never silently widened to `inherit`; reassign them through the existing Users workflow first.

## Verification

- `src/lib/ai-model-inline-admin.test.ts`: real validation/handler boundaries, partial RPC payload/CAS, confirmation/count/UUID/duplicates, authenticated client, safe errors and legacy-only replacement.
- `supabase/tests/ai_models_inline_admin.sql`: permissions/RLS, ordinary-user and banned-admin denial, CAS, independent fields, health revision stability, advanced settings, every default, dependencies, missing/fractional/stale/uppercase UUID revisions, true bulk deletion, history/late usage preservation, audit-failure rollback, reinstall and unknown-FK protection. All fixtures roll back.
- `scripts/tests/ai-model-admin-races.sh`: independent connections with observed lock-holder barriers; stale CAS, independent subsequent field update, default/delete in both orders, grant/delete and dispatch/delete. Wired into Database Replay with the SQL suite.
- `e2e/ai-models-inline-admin.pw.ts`: mocked network, desktop/tablet/mobile, round switches, serialized revisions, custom dark menus, failed-save rollback/redaction, inline confirmation position and cancel semantics, atomic failure, focus, sticky bounds, horizontal alignment, no second vertical scrollbar/page overflow, keyboard/user-access navigation and axe checks. Screenshot artifacts include table, sideways-scroll, menu and confirmation views.
- Existing five source-location tests now check the authoritative SQL write boundary or extracted localized component, rather than the removed non-atomic TypeScript checks. Their security requirements are preserved and supplemented by executable SQL and races.

Full local and exact-head GitHub gate evidence is recorded in PR #435. Passing mocked Chromium viewport tests is not a claim of testing a physical Android device or a production provider.

## Separately approved production release

1. Independently review this Draft PR and all three exact-head checks. Do not merge/publish as part of this task.
2. Verify current production schema/history/backup and only this migration's prerequisites. Keep an admin-model-write quiet window; stop model editing/probes and close old admin tabs while cutting over. Other product features need no new infrastructure or policy changes.
3. After separate approval, apply **only** the new migration via the established migration-history mechanism. Verify revision column, RLS/revoked internal/tombstone grants, four authenticated-only RPC ACLs and trigger definitions. Read defaults/catalog/history counts before/after; do not uninstall a production model as a test.
4. Publish the compatible merged application, verify the actual published snapshot and reload admin tabs. New RPC code must not precede its migration. Older full-edit requests will fail validation after the new server is deployed; no silent fallback to non-CAS writes exists.
5. Smoke-test one reversible non-default field update and restore it only with explicit production authorization. Verify normal model listing, user-access navigation and existing generation selectors without billable generations. Confirm the original defaults and historical financial/content records are unchanged.

## Recovery and limits

A failed migration is transactional; stop and inspect the failure, never disable RLS/default guards. After successful migration, prefer a forward correction. An older application can read the additive schema, but do not treat reverting code as restoring CAS guarantees; keep model-admin writes quiet until a compatible version is restored. Do not drop the audit, tombstones or execution evidence. A successful hard uninstall is intentional and irreversible as a registry action: re-add only through normal fresh discovery/compatibility checks, then explicitly review defaults, access, pricing and reasoning. It does not undo or alter historical songs/charges.

Registry transactions may wait behind concurrent work; lock failures reject safely and require refresh/retry. RPC limits are 100 unique models per confirmation. External providers do not support retroactive cancellation guarantees; this change does not claim exactly-once external execution or change accounting semantics. Migration and publish remain pending separate authorization; this work is not CLOSED.
