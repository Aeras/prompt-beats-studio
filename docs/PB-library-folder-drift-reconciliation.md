# Library integrity — forward reconciliation of production drift

Baseline main: `b96065768d6e26b67f3a3f3c2f6a316c8737dc03` (merged #433).
This is an independent database release dependency of Beta, not another Beta
implementation. No production SQL, migration-history repair, merge or publish is
authorized by this implementation task.

## Evidence and scope

Read-only production inspection on 2026-10-25 verified the three-argument
`duplicate_prompt_project_to_folder(uuid,uuid,text)` and the trigger function
`validate_library_folder_hierarchy()`. Production retains the original single-pass
copy and node-only depth check; neither was replaced by historical repository
migration `20260922210500_library_folder_integrity_hardening.sql`.

The catalog function definitions match the older foundation/transactional-copy
algorithms. The hardening migration's version/name and subtree-height statements
are absent from production history. This proves code/deployment drift; available
evidence does not establish who skipped the deployment or why. Existing Bun
source-contract tests only read repository SQL and could not attest deployment.

Only these affected paths were changed. Open #194 concerns standalone assignment;
#160 concerns version-history UI; their implementations are not adopted here.
Later lineage, immutable snapshot/metadata, preferred ownership, linked-track
duplication and detach/rehome triggers remain untouched. The later `branch_label`
column is now preserved when duplicating a Project (it did not exist when the
historical hardening was written). No historical user content is rewritten.

Production read-only data preflight found 2 folders, 0 invalid/deep/cyclic
hierarchies, 0 cross-owner parent edges and 0 external Project-version parents.
These are observations, not an enduring guarantee; repeat aggregate checks before
an independently authorized production application.

## Selected correction

`20261025155332_reconcile_library_folder_integrity.sql` is a new forward migration.
It does not edit old migrations or claim that the old file ran. Its recorded
execution and verified definitions supersede the missing historical effects.

- Folder validation checks ancestors **and** moved-subtree height, including moves
  to root. Traversal stops after enough levels to reject invalid data, and visited
  paths detect cycles. Foreign-owner/missing ancestry fails closed. Key/ownership
  mutation is prohibited; existing create/rename/move/delete callers are unchanged.
- A BEFORE STATEMENT trigger acquires one transaction advisory fence for folder
  INSERT/UPDATE/DELETE **before tuple locks**. This avoids row-trigger write skew
  for opposite moves or move-versus-child-insert. The two data-validation functions
  remain SECURITY INVOKER and existing RLS/table grants are not changed.
- The fence serializes folder writes across accounts; reads and Project/Prompt
  writes do not take it. This deliberately trades a small folder-write queue for
  correctness across authenticated and maintenance writers, without new state
  tables or owner-discovery/security-definer machinery. A long transaction holding
  the fence delays other folder writes: keep operations short, use normal request
  timeouts and monitor contention after release. No new quota/billing policy.
- Current application/PostgREST uses READ COMMITTED. Folder writes in REPEATABLE
  READ/SERIALIZABLE fail closed with SQLSTATE 40001; waiting for an advisory lock
  alone cannot refresh their old snapshots. Direct SQL tools must use a fresh
  READ COMMITTED transaction. This explicit compatibility boundary is tested.
- Project + preferred ID + typed version rows are captured in one MVCC statement.
  Two passes use that same snapshot: insert all versions with null parents, then
  assign parents through the new-ID map. Irregular ordering no longer drops links;
  concurrent source edits cannot mix the parent graph between passes. External/
  missing parent or preferred mappings abort the entire duplicate. Existing
  linked-track triggers and fresh execution-ID behavior remain in force. The
  snapshot materializes the version set in memory, proportional to Project size;
  no additional provider/network call occurs.

No RPC parameter/return shape changes, new UI or app deployment is required to
consume the corrected SQL. Empty Projects, notes, version numbers/labels, branch
labels, immutable snapshots and user notes retain their contracts. Existing source
deletion during copying may cause a normal FK failure and rollback rather than a
partial copy; no automatic retry or data repair is introduced.

## Reproducible isolated checks

Use **only a disposable local** Supabase database with the CI bootstrap fixture:

```sh
supabase db start
bun scripts/tests/library-drift-reproduction.ts <local-project-id>
docker exec -i supabase_db_<local-project-id> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/library_folder_reconciliation.sql
bash scripts/tests/library-folder-races.sh <local-project-id>
```

The reproduction installs the catalog-verified historical algorithms inside a
rollback transaction, proves both defects, applies the **exact** new forward SQL
and proves their correction; it also checks higher-isolation rejection. It never
repairs migration history. SQL/RLS fixtures cover five-level/subtree/root limits,
cycles, identities, sibling uniqueness, ownership, banned/anonymous access, empty
and irregular Projects, metadata/preference mapping and atomic failure. Independent
connections use observed PgSleep barriers to test cycle/depth races and a source
edit between duplicate passes. The gate includes all three tests.

## Independently authorized production procedure

1. Verify approved merge SHA, exact SQL/hash, healthy correct production project,
   recovery evidence (existing backup report and Auth-trigger companion), current
   function definitions/ACLs/triggers and aggregate data preflight. Do not repeat
   the completed backup integrity/restore tests without a new reason. If existing
   invalid data is discovered, stop for a separate data-repair decision.
2. Coordinate a short Library-write quiet window; a statement fence added now
   cannot retroactively serialize transactions already in progress. Use bounded
   lock timeout and stop/retry safely if existing writes/DDL prevent the migration.
3. Apply **only** this new file through the approved migration mechanism with a
   real new history entry. Never use broad `db push`, backdate/fabricate the old
   migration row, or also apply Beta/other pending files. If this reconciliation
   is already recorded and definitions match, do not reapply it.
4. Verify new history name/version, both definitions, statement/row triggers,
   invoker status, authenticated/service-role RPC execution, no anon execution,
   unchanged table/RLS grants, original data/policies and normal read availability.
   Do not run synthetic SQL/race fixtures against production.
5. Record the new migration as superseding the historical missing effects without
   asserting the old file executed. Classify other historical naming discrepancies
   independently; this fix does not attest every migration in the repository.
6. Resume the separately authorized Beta migration/publish procedure only after
   that release's prerequisites pass. This task does not activate Beta or publish.

Recovery: migration DDL is transactional and changes no stored content. On failure,
leave the transaction rolled back and investigate, rather than disabling RLS or
restoring the unsafe functions. After successful application, prefer a reviewed
forward correction; an application rollback remains compatible with the unchanged
RPC signature. Do not destructively restore the whole production backup merely
to revert these function definitions. Release state remains
`CODE_COMPLETE_RELEASE_PENDING` until production verification is independently
authorized and completed.
