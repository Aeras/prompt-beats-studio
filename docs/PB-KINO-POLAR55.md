# KINO Lab / Polar55 integration

## Investigation baseline (2026-11-04)

Main `857ace06cd5a64e2151da328ddbff98f8d36b7fc`; merged KINO #505.
No overlapping open KINO PR was found. Existing local Lab branch and owner
attachments are preserved. Implementation branch:
`feature/kino-polar55-lab-20261104`. No remote update is authorized yet.

Owner source ZIP SHA-256:
`9b947e9a24829a98fdb9d6883427c132ead5cdc4c40fe46b96ff53888f48debb`.
All 25 manifest entries match their lengths and SHA-256. This is an archive of
installation packages, **not a live deployment snapshot**. Source references:
`current-manager/private/kino-sync-lib.php` defines normalization and insert
columns; `kino-engine.php` defines the manager lock and bounded history fetch;
`public-api/public/health.php` authenticates health only. Historical pilot scripts
are not deployment candidates. Config examples contain placeholders only.

The source does not contain CREATE TABLE definitions, engines, indexes, grants,
actual live hashes, current storage capacity or current PHP/MariaDB versions.
Those remain release evidence requirements, not facts inferred from a README.
The existing cron uses the writer account; analytics must use a separate SELECT-only
account and a new read secret, never the health token.

## Acceptance and safety boundary before edits

- Preserve Live KINO source, manager, ingestion lock semantics, cron and existing
  config. No production operation, OPAP call, secret creation or DB mutation.
- Fixed server-to-server HTTPS endpoint, fresh active/not-banned Super Admin
  checks on each operation; no browser DB connection or shared secret.
- Explicit read schema and response validation. Default off. Missing schema,
  credentials, ambiguous revisions or resource capacity fails closed.
- Consistent immutable window, latest N **valid stored** draws, honest partial
  count and unverified scheduled completeness. No ID-adjacency completeness claim.
- Bounded pages and full-window streaming statistics. At most 500 retrospective
  targets, with unchanged P00/F00/P01 definitions and equal-time exclusion.
- Snapshot state is owner-bound, expiring and resumable without a paid call.
  Read retries cannot create backfill or change source records.
- Backfill is a separate, disabled control plane, not a new browser endpoint or
  a replacement cron. Real collection requires source-use and operational approval.
- Local synthetic contract/security/parity/performance/browser tests, full Bun,
  strict TypeScript, scoped lint/format/build before a consolidated push request.
  Three exact-head CI gates follow owner approval, never claimed from local runs.

## Recovery and release

Code readiness does not authorize deployment. Compare deployed PHP hashes and
read-only SHOW CREATE TABLE/SHOW GRANTS output against the source assumptions;
share no credential values. Establish backup/recovery and available private
snapshot space. Install the additive package outside the existing manager paths,
configure fresh SELECT-only DB access and a new server-only read secret, verify
unauthorized/authorized access and bounded snapshot timings, then separately
approve compatible Lovable publication. Remain default off until verified.

Recovery disables only the new analytics path and expires its private temporary
snapshots. Do not delete source history, revisions, sync logs, existing configs or
cron state. No migration-history repair, Supabase RLS change or new AI service is
part of this integration. Backfill activation has a separate release boundary.

## Implemented shape and measured evidence

The additive package lives at `tools/kino-polar55/`; it never deploys the archived
manager. Its exact source copies exist only under `tests/legacy`, pinned by the
owner archive's hashes and Git `-text`. The package builder allowlists files:
actual configs, old writers, tests and credentials cannot enter a release ZIP.

The read plane computes the complete selected window synchronously on Polar55
under ONE read-only consistent InnoDB transaction. It filters pending revisions
and invalid canonical hashes before selecting the latest N valid rows; no
across-request cursor can accidentally mix snapshots. Private temporary spooling
is bounded, permissioned and removed on normal/exception/shutdown completion.
Source order is descending `(draw_time_ms,draw_id)`; aggregation reverses only
this selected window and uses bounded rolling state. No 100k raw client payload,
Supabase analytics migration, browser worker or new service is necessary for the
measured fixture. Read time/memory/space on the actual host remain release gates.
Hard failures/timeouts are not silently partial success. Explicit available-short
windows report `partial`; scheduled coverage is always unverified.

At most one authorized read executes at once on the host, with a minimum
two-second admission interval. This is operational protection, not a guessed
official OPAP rate. No IP headers participate. Success audit retains at most 100
private pseudonymous events; failures are generic, without tokens, raw results,
SQL errors or IPs. Cancel aborts browser waiting and prevents late state updates;
an already running bounded read may still finish on the server. No write or paid
call is involved. Export rechecks current account/role without rerunning analysis.

Backfill is CLI-only and default-off, with four explicit approval/verification
flags plus a verified source floor/rate reference. There is no browser start
endpoint. It freezes an anchor, fetches at most one two-record fixed-host range
page per approved invocation, enforces descending ID/nonincreasing time, reuses
the hash-verified existing idempotent writer, keeps atomic checkpoints and honors
the shared manager lock. Bounded backoff/Retry-After, manual-review stops,
pause/resume and explicit incomplete exhaustion are implemented. The existing
cron/config are never modified. A separately approved independent scheduler is
still required for unattended backfill; none was configured or run here.

## Local acceptance results

- Frozen install: 522 existing installs checked, no package/lock changes.
- Strict TypeScript, changed TS/TSX/e2e ESLint/Prettier and production build PASS.
- Complete offline Bun, isolated LF-equivalent checkout preserving byte-exact
  source assets: **1,640 PASS, 0 FAIL, 23,965 assertions, 218 files**. The explicit
  Docker parity case ran in this full execution, not merely as a skipped test.
- Canonical windows 1k/5k/20k/50k/100k × P00/F00/P01 match the frozen TypeScript
  engine's frequency counts, rolling gaps, proposals and eligible 500-target
  backtests (independent chunked canonical comparisons above its legacy 5k cap).
- Disposable network-isolated MariaDB 11.4/PHP 8.3: 100,000 valid rows selected
  despite pending revision/corrupt hash; a separately inserted newer draw is
  excluded from the established snapshot; SELECT-only writer denial PASS.
  Measured full SQL/spool/aggregate **1.18–1.59 seconds**, PHP peak **4,198,400
  bytes**, bounded response **99,095 bytes**. These are synthetic local numbers,
  not production-host performance or an OPAP benchmark.
- Archived real writer insert/replay/revision deduplication/no-overwrite PASS on
  the synthetic schema. Real archived manager lock excludes a concurrent worker.
  Checkpoint/crash replay, backoff/pause, immutable anchor and honest exhaustion
  PASS. No production DDL compatibility is inferred from the fixture.
- HTTP no/wrong secret, browser Origin, method/body/operation validation,
  default-off configuration and cross-request rate limiting PASS, with no live
  external request. PHP syntax and bounded 100k core memory checks PASS.
- **24 browser PASS** across desktop/tablet/mobile, including 375 px offline
  regression, all window options, explicit default-off, honest partial counts,
  revoked access, cancellation/late response, keyboard and axe/overflow checks.
  Mobile and desktop screenshots inspected. Initial new-button contrast failure
  was fixed locally using the existing outline variant; assertions retained.
- Final source scope review: Live KINO adapter/panel, Football workflows,
  Generator/Projects/Songs/Auth/Payments, existing pure 5k engine, dependencies
  and all Supabase migrations unchanged. Two byte-exact legacy fixture attributes
  and an isolated PHP/MariaDB acceptance step in Database Replay are intentional.

## Remaining approvals and exact release gates

Owner approved the initial consolidated push and Draft #506 creation. All three
gates passed on `8fd4bda9af896f3a4d1d3d53cabda474823c2a18`. The subsequent
adversarial review found confirmed defects and corrected them locally; see the
[final review](PB-KINO-POLAR55-FINAL-REVIEW-20261104.md). Those fixes require a
new explicitly approved same-PR update and exact-head CI. Earlier #505 or #506
checks do not substitute. Never label CLOSED based on local success.

Production requires read-only comparison of actual deployed PHP hashes, DDL,
engines/indexes/grants, private space and restore capability; a new safe read
secret/SELECT-only account; authorized additive package deployment and runtime
checks; then separately approved compatible Lovable publish. Read only from the
existing history first and verify known partial count. No production change,
source request, schema/grant change, secret generation, scheduler change or
historical import was performed. Source-use/rate/retention approval and a separate
backfill/scheduler activation remain BLOCKED operational gates. No claim of 100k
collected data, live uptime or predictive advantage is made.

Original pre-review ZIP (superseded; do not deploy), SHA-256:
`94b59ed4a24ea62f862e7d8de996d6c21ca6727d9f87bdd173dafbd2ee7fa944`.
Rebuild with the supplied deterministic builder; no actual configuration,
credentials or old writer is shipped. This fingerprint is not deployment evidence.

Reviewed local additive package (10 allowlisted files), SHA-256:
`bcedf4c1632d6c8e3db5eacb471918040bb2ef2ecef49c0117252c5e59bb94ba`.
Still default-off and not deployed. Actual configs/credentials and legacy writers
are excluded. Use the reviewed package, not the original delivery above.
