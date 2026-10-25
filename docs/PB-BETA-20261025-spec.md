# PB-BETA-20261025 — Beta Features lifecycle and managed promotion

Status: CODE_COMPLETE_RELEASE_PENDING (implementation in Draft PR #433; verification evidence in WORK-STATUS; no production release).
Baseline main: `7aa9a7041468415f1727888b6e8509101d5b6a78` (2026-10-25).
Read root `AGENTS.md` and `docs/WORK-STATUS.md` before any continuation; reconcile latest main and open PRs.

## Product contract

- Existing Feature Access policies and the existing 19 features remain unchanged. Do not backfill them into the Beta list.
- New explicitly registered feature entries start in `beta`, available to eligible, active moderators/senior moderators/admins/super admins plus individually authorized ordinary users with independent `beta_tester` entitlement. Entitlement never grants administrative/moderation privileges. Banned/suspended accounts must not bypass protections.
- Super Admin has a separate Beta Features management tab: searchable Beta and Stable listings, an Archive listing, a Beta/Stable selector, explicit Archive action and explicit **Move to Feature Access** action.
- Beta -> Stable exposes to all otherwise eligible users. Stable -> Archived removes from active management list only, retaining public availability and audit/history. Restore archived entry without data loss.
- Stable -> Feature Access transfers governance to the existing Feature Access policy system; preserve `everyone` as its initial policy to prevent surprising access loss. Subsequent availability is edited through existing Feature Access UI; migrated row must not appear twice. Require explicit confirmation and log actor/time/previous/new state.
- Only Super Admin may change feature lifecycle or grant/revoke Beta Test entitlement. Consider whether existing admin role is permitted to grant entitlement only after explicit security analysis; default Super Admin only.
- Feature registration is **explicit in code/migration**, automatically surfaced in the Beta list by a CI-verifiable convention. Arbitrary code changes cannot reliably be auto-detected as features. Prevent unregistered gated releases.
- No claim that a client-only flag secures sensitive routes: enforce server admission and relevant SQL/RLS. Frontend follows effective access and handles stale cached flags, deep links, revoked grants, concurrent transitions.
- Feature management states and entitlement must not modify existing Feature Access schema semantics, AI cost admissions, upload/privacy revocation, or existing policies accidentally.
- Design future subscription tiers as a future extension; do not implement payment logic now.

## Existing architecture confirmed on baseline

- `src/lib/feature-access.functions.ts` enumerates 19 static FEATURE_KEYS and exposes authenticated server RPC wrappers.
- `src/hooks/useFeatureAccess.ts` caches effective access with React Query.
- `src/routes/management.tsx`: Super Admin FeatureAccessPanel, user details and moderation navigation.
- `src/lib/admin.functions.ts`: user role detail and role mutation.
- `supabase/migrations/20260921070000_feature_access_phase_b.sql`: `feature_access_policies`, `feature_access_users`, `can_use_feature`, admin audit and Super Admin policy RPCs.
- `supabase/migrations/20260921060100_super_admin_core.sql`: role ranking; `_is_admin_level_internal` includes admin/super_admin **not moderators**; new beta access must explicitly handle eligible moderation roles.
- `supabase/migrations/20260921060200_super_admin_admin_paths.sql`: admin user listing/detail; protect restricted user data.
- Feature Access V2 migrations and `src/lib/feature-access-v2.test.ts` have SQL admission and regression contracts; do not rewrite historical migrations or loosen protected paths.

## Implementation boundary and risks

1. Inspect latest subsequent SQL definitions/overrides of `can_use_feature`, user/account-state predicates, grants and audit CHECK constraint before forward-only migration.
2. Model managed new-feature lifecycle separately from existing canonical Feature Access entries, preserving one stable feature identifier and auditable promotion. Choose safe default closed when metadata missing; `archived` is a management status not access revocation.
3. Atomic server-owned transitions and permissions; ensure no momentary exposure from concurrent grants, archive and promotion.
4. Apply Beta entitlement in the existing user details interface separately from role, without leaking new admin powers.
5. Avoid giving old features any new lifecycle state or default access behavior. Ensure new generated feature code is gated at each entrypoint; hard failure or CI lint for missing registration.
6. Handle role changes, suspension, ban, deletion, sign-out, disabled accounts, revalidation and stale clients; repeat permissions on server/SQL.
7. Archive visibility/history and future flag cleanup must not remove active production gates before replacement; do not run destructive cleanup.

## Acceptance / testing / release

- Independent fixtures: ordinary user (entitled/not), moderators (active/suspended), admin, super admin, banned/deleted; beta vs stable vs archive vs managed Feature Access.
- Verify malicious RPC, direct URL, direct table access, stale cached UI, revoke entitlement mid-session, concurrent stage changes, idempotent operations and audit log.
- Registration convention and same-PR CI coverage; do not retroactively force historical 19 entries into beta.
- Focused unit/integration and SQL tests, full tests, typecheck, lint/format, build; final exact-head Regression, Browser Quality, Database Replay green.
- Coordinate additive forward migration plus app deployment; authorize and verify production migration/publish separately. No live production SQL or deployment without approval. Preserve published Git history.
- Keep this one PR and update `docs/WORK-STATUS.md` with evidence before merge; do not mark CLOSED until operational proof.

## Implementation companion

See [PB-BETA-development-and-release.md](PB-BETA-development-and-release.md) for
the explicit registration convention, security boundaries, automated checks,
legacy compatibility and the separately authorized release/recovery procedure.
The approved decisions above are unchanged. The initial registry is empty:
this infrastructure release does not invent new product features or backfill
the existing 19 entries.
