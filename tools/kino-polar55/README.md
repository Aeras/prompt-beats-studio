# Polar55 / KINO Lab — additive package

**Not deployed. Defaults OFF. No source collection is authorized by installation.**

Only `kino-api/lab-v1.php` belongs in the existing document root. Every other PHP
file belongs in its sibling `/home/promptbe/kino-private/`. Do not upload this
README, tests, configuration or private files into the public tree. Preserve the
existing `.htaccess`, health/index endpoints, config, writer scripts and cron.
Examples are not active configuration. No secret is supplied or generated here.

Requirements: 64-bit PHP 8.3+, PDO MySQL/MariaDB, cURL for separately approved
backfill, local InnoDB tables and a private writable `.lab-runtime` directory
(0700; snapshot files 0600). Check deployed schema/engines/indexes and EXPLAIN
before activation. Source ZIP does not certify the actual live DDL or versions.
The SQL column contract comes from the provided normalization/store code. Run
read-only SHOW CREATE TABLE and SHOW GRANTS locally on Polar55; never share
credential values. Verify the deployed writer hashes against the supplied archive.

## Read plane

Create/configure a **new SELECT-only** database account for `kino_draws` and
`kino_draw_revisions`, a new read token and private `lab-config.php` manually
through the owner's safe hosting mechanism. Do not reuse the writer account or
health token. No account/grant creation is executed by this package. Confirm
INSERT/UPDATE/DELETE fail for that account. Set `schema_verified` and `enabled`
only after that check. Configure the matching server-only
`KINO_POLAR55_READ_TOKEN` and `KINO_POLAR55_ENABLED=true` in PromptBeats only after
separate approval; never `VITE_*`. Publication is a separately approved step.

POST `lab-v1.php` accepts only `status`, or `analysis` with canonical N,
P00/F00/P01, k=5/8/10 and an ASCII seed. Exact Host/direct TLS, no Origin,
constant-time token check, no CORS, no redirects, bounded body and a cross-process
nonblocking lock guard admission. `X-Kino-Owner` is a server-generated pseudonym,
not browser authentication. The shared token grants only this read capability;
Supabase active-account + Super Admin authorization remains at the proxy before
and after the read. Do not trust spoofable IP headers for authorization/rates.

A single read-only repeatable-read consistent transaction freezes the selected
window. Pending revisions are excluded; canonical hashes and number constraints
are verified. Latest N means latest valid stored observations ordered by
`draw_time_ms,draw_id`, not N assumed contiguous IDs. Up to 200,000 candidates may
be scanned to fill a 100,000 valid window; hitting that bound fails, never silently
claims a full dataset. Temporary private disk spools reverse the descending
selection; O(80+100+500) aggregation state plus <=100k seek offsets. Temp files
are removed in finally. Snapshot digest covers normalized descending lines; the
response records cutoff, requested/loaded/stored/rejected counts, first/last,
observed-check timestamp and unverified completeness. `lastObserved` is NOT proof
of cron uptime. A repeat read takes a new snapshot and cannot incur AI charges.

SQL statement budget 12s, whole-operation checks 18s, proxy abort 25s. No async
analysis job is needed by the measured isolated 100k fixture, but live-host timing,
private disk capacity and concurrency must pass before activation. If the hosting
budget cannot pass, remain OFF and design durable processing rather than raising
timeouts or claiming completion. No 100k raw JSON goes to the browser; summary is
capped at 300,000 bytes. Statistics cover all N; retrospective backtest only the
first up-to-500 eligible targets of that selected window, exactly like offline
mode. Proposal uses the full final window / last 100 for P01, not just targets.
Equal-time draws never train on each other. No inference/prediction certification.

## Backfill control plane — independent and disabled

`php lab-backfill.php inspect` is offline and does not read DB/contact OPAP.
Do not schedule or invoke commit commands without source-use/rate/retention,
schema/recovery and operational approval. Missing `backfill-config.php` fails
closed. Existing manager/config/cron is never overwritten or called as a cron.

After those **separate** approvals, operator commands are `start`, `step`,
`pause`, `resume`, each requiring `--approved-commit`. `start` freezes a completed
source anchor. Every `step` makes at most ONE fixed-host two-record range page,
under the existing writer's nonblocking lock, yielding near its five-minute slot.
The range is at most 1,000 IDs, expanded backwards until 100k unique valid
observations or the operator-verified source floor. IDs do not certify scheduled
completeness. The two-record endpoint's range support and limits must be checked
in a separately approved tiny live probe before collecting; local tests are not
official source permission. Newer source observations are excluded by cutoff.

State uses private atomic checkpoints. A crash after DB commit replays the same
page through the existing idempotent `kinoStore`; conflicting revisions halt for
review and are never overwritten. Known temporary read errors get bounded
backoff/jitter and Retry-After (at most three failures before review). Source
denial, invalid data and unknown write failure halt. No busy-loop/background tab
queue, artificial progress or automatic checkpoint deletion. A separately approved
independent scheduler must invoke bounded steps; the current cron remains intact.
At only two observations per page this may be slow: do not promise fast 100k import
or silently increase source page sizes. Source mutation during a run and unknown
scheduled gaps remain explicit limitations; completeness is always unverified.

## Package and recovery

Build once with `python tools/kino-polar55/build-package.py OUTSIDE_REPO.zip`.
The deterministic manifest lists every shipped hash. Compare the package before
upload; do not replace an unrelated file. Preserve existing source history,
revision/run tables and backups. Rollback disables the new read plane and future
backfill steps; preserve checkpoints and never undo committed historical rows
with deletion. No Supabase migration, new public raw-history route or AI service.
