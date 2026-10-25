# PB-BETA — development, authorization and release

Approved product contract: [PB-BETA-20261025-spec.md](PB-BETA-20261025-spec.md).
Implementation belongs only to PR #433; no production migration or publish is authorized here.

## Registration (required in the same feature PR)

The initial `BETA_FEATURES` registry is deliberately empty. Beta administration is
infrastructure, not a newly restricted product feature. No placeholder feature is
seeded, and none of the existing 19 Feature Access keys enters Beta.

For each genuinely new feature:

1. Choose a permanent, unique lowercase snake-case key (1–64 characters). Keep it
   after archive or promotion. Never reuse a legacy Feature Access key.
2. Use `supabase migration new register_<key>` to create a forward migration.
   Register with literal SQL, for example:

   ```sql
   SELECT public.register_beta_feature('new_studio', 'New studio', 'Description');
   ```

3. Add the matching definition to `src/lib/beta-feature-registry.ts`, including
   `key`, `name`, `description`, `registrationMigration`, and **all** client,
   server and SQL `entrypoints` (`{path,kind}`). The example key above is not an
   actual registered product feature. Registration metadata must match exactly.
4. Gate every client entry with `BetaFeatureGate featureKey="new_studio"` or
   `useFeatureAccess("new_studio")`. Do not show sensitive content before allow.
5. Before protected work, `await requireFeatureAccess(context.supabase,
"new_studio")` in every authenticated server entry. Declare and enforce SQL
   admission on the same key where users can call SQL directly. Missing metadata
   fails closed. A client check alone is never authorization.
6. Where a permission change must serialize with a write, take the existing
   user-security lock and perform the SQL access check and write in one
   transaction, following existing admission/RPC conventions. A prior server
   query cannot serialize an independent later write. For background work,
   authorize admission and document completion/revocation semantics explicitly.
7. Run `bun scripts/check-beta-features.ts`, relevant tests and Database Replay.
   Review every entrypoint, deep link, background job and direct SQL path.

CI checks the registry, exact migration registration, declared AST gates and
unknown literal server/client gates. Database Replay also checks **actual SQL
rows** against registry metadata. This detects missing/mismatched registrations
and commented/unawaited declared guards; it cannot prove that all semantically
related entrypoints were declared, that a guard dominates every branch, or that
all future code changes represent a new feature. Those remain mandatory review
questions. Aliased/indirect gates require an explicitly reviewed checker update;
do not bypass checks with casts, comments or dummy calls.

## Lifecycle and permissions

`beta_features` retains the key and monotonic revision throughout Beta → Stable
→ Archive/Restore → Feature Access. Archive is only management hiding and retains
Stable availability. Beta must become Stable before archive or promotion. Move
to Feature Access requires a separate confirmation, inserts `everyone` and updates
state/audit in one transaction. A lost-ack retry never resets a later policy edit.
An archived feature must be restored before further changes. No data is deleted.

Beta Test is independent of `user_roles`; active Moderator, Senior Moderator,
Admin and Super Admin already qualify automatically. Fresh database account
state overrides entitlement: missing canonical profile, ban, Auth ban/deletion or
staff suspension denies. Only an eligible Super Admin can inspect/manage tester
entitlements and lifecycle. Authentication JWT context is retained throughout;
there is no service-role fallback or user-metadata privilege claim.

New tables have RLS and no browser/service-role table privileges. Authenticated
RPC EXECUTE does not grant administrative power: every management RPC checks
fresh Super Admin status and takes existing user security locks. Migration-only
registration and internal predicates are not callable by browser/service roles.
Lifecycle changes lock the feature row and use revision compare-and-swap;
entitlement edits lock actor/target deterministically. Events record actor,
timestamp, target/key and before/after state; list returns the latest 100, while
older events remain stored. No raw IP, email, credential or prompt is logged.

The old `can_use_feature` policy algorithm remains unchanged for legacy keys.
Only explicitly registered keys use the new lifecycle. Three existing policy
mutation RPCs dispatch **only new registered keys** to fresh-account/target-aware
checks; their legacy branches and ACLs remain unchanged. This is needed because
the historical selected-user helper is caller-bound and cannot validate another
user for a newly promoted feature. No general service-role bypass is introduced.

Managed feature client flags revalidate on focus and every 15 seconds while
foregrounded, and fail closed on refetch error. Query caches include account ID.
This is presentation, not a revocation SLA: suspended background timers or an
in-flight client result cannot substitute for fresh server/SQL admission. The
existing 19 features retain their 30-second cache behavior.

## Verification

```sh
bun install --frozen-lockfile
bun scripts/check-beta-features.ts
bun test src/lib/beta-features.test.ts
bun test
bunx tsc --noEmit
# Changed-source ESLint and Prettier, as in Regression
bun run build
node node_modules/playwright/cli.js test
# Disposable local Supabase DB with the repository CI bootstrap fixture only:
supabase db start
bun scripts/check-beta-features.ts --sql | docker exec -i supabase_db_<local-id> psql -U postgres -d postgres -v ON_ERROR_STOP=1
docker exec -i supabase_db_<local-id> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/beta_feature_lifecycle.sql
bash scripts/tests/beta-lifecycle-races.sh <local-id>
```

Never run replay/race fixtures on a linked or production database. SQL tests roll
back. The race script creates and removes only its synthetic local fixtures.
Regression, Browser Quality and Database Replay must pass on the final PR HEAD.

## Release and recovery (separate owner authorization required)

1. Confirm final approved commit, three gates, correct production project,
   current migration history and verified recovery capability. Ensure no
   concurrent release. Compare the 19 existing policy rows before/after.
2. Apply **only** `20261025132859_beta_feature_lifecycle.sql` via the established
   migration workflow before publishing application code. It creates empty new
   tables/functions; no historical policy or user entitlement is backfilled.
3. Verify RLS, table/RPC ACLs, original policy rows and fresh eligible Super Admin
   read access. Registration function remains migration-only. No real product
   feature is registered by this infrastructure release.
4. Publish the approved compatible app through Lovable; editor sync is not proof
   of publish. Verify actual published snapshot, empty Beta tab, unchanged legacy
   access and independent Beta Test user control with approved test accounts.
5. Record actual evidence in WORK-STATUS. Until then status is
   `CODE_COMPLETE_RELEASE_PENDING`, not CLOSED.

On application failure, retain the additive schema/audit and restore the prior
compatible application snapshot using the established owner-approved process.
The legacy 19 still follow their original algorithm. Do not drop tables, delete
history, reset policy state, remove gates or improvise a down migration. After
future product features adopt Beta, any rollback must retain their authoritative
gates and database metadata; an older application must not expose them through
unguarded routes. A reviewed forward fix is preferred for database defects.

## Known limits / follow-up

- No realtime multi-device push: client flags refresh; server/SQL is authoritative.
- Audit UI shows latest 100 events, not a new export/search product.
- No subscription tiers, billing changes or automatic discovery of arbitrary code.
- Existing legacy-only policy quirks are intentionally not refactored here.
- Additional feature registration is its own approved product work, following the
  convention above; this PR does not invent a new user-facing Beta feature.
