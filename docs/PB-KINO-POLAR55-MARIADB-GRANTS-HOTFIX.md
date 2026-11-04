# Polar55 MariaDB read-grants hotfix — 2026-11-04

## Scope, evidence and acceptance

Base main `458bf08868ca50079e653eebebabf235d3582c13`, merged PR #506 with
head `f749780240582969b9f8c0546463f8a3a5c0c3f3`. No overlapping open Polar55
PR was found. Branch `fix/polar55-mariadb-read-grants-20261104` is local only.
Owner reports MariaDB 11.4.13 rejects the SELECT-only reader because SHOW GRANTS
escapes underscores; the temporary host-side replacement passes syntax, schema,
grants and read-only connection with 68 stored draws. These are **owner-reported**
live observations, not a new production connection or full deployment certification.

The merged parser expects literal `promptbe_kino_history` and therefore rejects
its correctly escaped representation. New offline fixtures reproduce this on the
actual `labAssertReadPrivileges(PDO)` entry point before the correction. Existing
DB tests used per-table literal grants, so missed the database-wide representation.

Acceptance: escaped database-wide and existing literal table grants work; both
required tables are covered; malformed, overprivileged and unrelated scopes reject;
the genuine labReadDb Unix-socket path works without writes; all prior offline
PHP/MariaDB, bounded 100k snapshot and engine-parity cases remain green.

## Fix and security boundary

Only labAssertReadPrivileges changes in runtime code. Parse complete bounded
USAGE/SELECT statements, then decode `\_` **only in the database identifier**.
Do not replace escapes in principal/authentication text or relax permissions.
No raw SHOW GRANTS, authentication hash, database credential or SQL exception is
logged or sent to the browser; failures retain the existing generic codes.

Database-level GRANT names are LIKE patterns: an unescaped underscore can match
another database. Therefore database-wide SELECT requires the exact fully escaped
`promptbe\_kino\_history` scope, not an unescaped/partially escaped wildcard.
Literal per-table scopes remain compatible. Unknown authentication/clause syntax
fails closed; the tested USAGE forms are bare accounts and the MariaDB native
password-hash suffix. This is intentionally a small parser, not arbitrary SQL.

Primary references:

- [MariaDB SHOW GRANTS](https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/show/show-grants)
- [MariaDB GRANT](https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/grant)
- [MySQL GRANT wildcard semantics](https://dev.mysql.com/doc/refman/8.4/en/grant.html)

## Verification

- Before-fix PDO fixtures: correctly escaped valid grants rejected; unescaped
  database wildcard accepted. Regression fixtures preserved, no assertions weakened.
- After fix: 35 isolated parser cases (5 allowed, 30 rejected) PASS, including
  escaped database/table names, per-table coverage, excessive/global privileges,
  roles/PROXY/GRANT OPTION, unknown escapes, wrong database/table, malformed
  quoting, extra SQL/clauses, control bytes, nonstrings and oversized statements.
- Complete network-isolated PHP/MariaDB acceptance PASS: syntax, HTTP/default-off,
  backfill/checkpoint contracts, actual SELECT-only Unix socket connections,
  genuine escaped database-wide SHOW GRANTS, read success, INSERT/UPDATE/DELETE
  denied, newly granted UPDATE rejected, and unchanged 100k snapshot/legacy writer
  idempotency. Synthetic 100k aggregation 1.21 s, 4,198,400 B peak, 99,095 B output;
  not a production-host benchmark. Disposable grants/data exist only in tmpfs.
- Full Bun regression: **1,642 PASS / 0 FAIL / 23,998 assertions / 219 files**,
  explicit Docker parity enabled. The isolated snapshot was normalized to LF,
  preserving byte-pinned assets, to match CI: unnormalized Windows CRLF text
  initially failed eight existing multiline source assertions. No assertion or
  application change was needed; missing local dependency junction was also fixed
  only in the disposable test environment before the final run.
- Strict TypeScript and production build PASS. PHP syntax for all package/test
  files, Python AST syntax, scoped Markdown Prettier and git diff --check PASS.
  No PHP style linter is configured; PHP is checked with the runtime's syntax
  validation and executable regressions, not a claimed ESLint PHP check.
- Browser/SQL Supabase suites were not rerun locally: no UI, Supabase SQL, RLS,
  authentication or application source changes. Three remote gates still pending
  owner approval; no CI success claimed for this local hotfix.

## Release and recovery

1. Obtain explicit approval for one consolidated push and focused Draft PR; await
   Regression, Browser Quality and Database Replay on its exact HEAD. The existing
   Database Replay invokes run-offline.py and now automatically includes these cases.
2. Independently review and merge; do not rewrite published history. Build the
   additive package from merged main with the unchanged allowlisted builder,
   verifying manifest, checksum and absence of actual configs/secrets.
3. Separately approve the host change. Preserve/hash the currently deployed new
   lab-service.php (including the temporary workaround), install only its reviewed
   replacement, run PHP syntax and read-only schema/grants/connection/status checks.
   Do not modify production grants/data or rerun setup SQL from test fixtures.
4. Preserve current API/backfill disabled state and existing cron/writer/configs.
   This fix needs no Supabase migration or application publish. Enabling the
   integration remains a separate operational release with its original checks.
5. On failure keep the new read plane disabled; preserve diagnostics/checkpoints.
   A separately approved file recovery can restore the saved effective temporary
   host fix. Do not restore the known-broken base parser, broaden privileges,
   modify original writers/cron, or delete history to make the check pass.

No deployment, production SQL, grants/data change, source request, secret change,
API/backfill activation, push, remote branch update or PR creation was performed.
