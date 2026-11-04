# PR #506 — adversarial final review, 2026-11-04

## Verdict and evidence boundary

**NOT MERGE-READY at the reviewed remote HEAD.** Remote Draft #506 is
`8fd4bda9af896f3a4d1d3d53cabda474823c2a18`; main remains
`857ace06cd5a64e2151da328ddbff98f8d36b7fc`. Both were reverified live.
All three CI gates passed on that old HEAD:
[Regression](https://github.com/Aeras/prompt-beats-studio/actions/runs/41871320455),
[Database Replay](https://github.com/Aeras/prompt-beats-studio/actions/runs/41871320547),
[Browser Quality](https://github.com/Aeras/prompt-beats-studio/actions/runs/41871320925).
Browser CI had 375 passes / 3 pre-existing skips. Green CI did not cover the
negative cases below; it is not proof that these findings are absent.

This review re-traced the entire local diff, original Polar55 archive, current
manager/store, server auth/proxy, schemas, analysis algorithms, UI/export,
checkpoint/transport/CLI, package and release workflow. It is an adversarial
code/test review, **not an independent live Polar55 deployment certification**.
No credentials were retrieved, production SQL/source fetch executed, or remote
branch/PR/deployment updated. Existing Live KINO, cron and ingestion are intact.

## Confirmed findings and local correction

| Finding                                                       | Reproduction / impact                                                                                                                                                                                                                 | Correction                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1: contradictory source pagination could skip history        | A page with `last=true` but ten elements/five total pages advanced to the next ID range, permanently skipping available records in the current range. An empty `last=false` page also advanced. Both failed the new pre-fix PHP test. | Validate total elements/pages, size, first/last, page length and record count together. Pin total count within a range; reject drift. Prevalidate the entire page before any store.                                                        |
| P1: manual-review stop could be bypassed                      | Actual CLI `pause` then `resume` changed `REVIEW_REQUIRED` into runnable `PAUSED`, without resolving an unknown write/revision/source problem. Reproduced in a network-disabled disposable copy with only its clock frozen.           | Explicit allowed state transitions. COMPLETE/INCOMPLETE/REVIEW_REQUIRED cannot be paused/resumed into runnable work. Pausing WAITING retains its cooldown.                                                                                 |
| P2: schema validator accepted lexical draw IDs                | In the disposable MariaDB fixture, changing the PK to VARCHAR still passed the old validator. MAX/order comparisons could then be lexical. The new expected-rejection test failed before correction.                                  | Require numeric identity/time types, temporal observation type, required columns, unique draw identity and InnoDB. Check the actual reader's grants; overprivileged principals/roles/grant option fail closed.                             |
| P2: inconsistent analysis response accepted                   | The actual proxy returned OK for a different requested window and impossible count/proposal/time metadata. New Bun negative test failed before correction.                                                                            | Validate request binding, loaded/stored counts, counts/parity/gaps, interval identity, proposal size, eligible targets, backtest aggregates and paired variance. Valid empty/partial/full responses still pass, including real PHP output. |
| P2: cleanup could hold a failed proxy open                    | Awaiting an underlying cancellation promise could delay completion even after an oversized body was rejected.                                                                                                                         | Nonblocking cleanup, with a fixed 300,000-byte buffer instead of retaining arbitrary many response chunks. Dedicated stalled-cancel regression passes.                                                                                     |
| P2: pacing could round below its documented interval          | Integer-second stamps could admit a two-second read after roughly one second; rounding a backfill completion down could also violate configured source spacing.                                                                       | Subsecond read admission and upward-rounded next-source deadlines. Boundary tests use explicit fractional timestamps; Retry-After overflow/invalid values require review rather than premature retries.                                    |
| P3: cancelled export discarded an already authorized snapshot | Export's catch cleared the result on cancellation and unnecessarily queried the remote DB solely to re-prove permission.                                                                                                              | Fresh existing account/role-only authorization. Cancellation retains the snapshot; successful export never reruns analysis. Revoked access still clears it and prevents download.                                                          |

The first four groups have recorded failing-before/passing-after reproductions.
Additional transport, timing, checkpoint-corruption and export cases strengthen
the regression boundary. This does not imply exploitation occurred in production.

## Security and compatibility review

- Browser callers never receive/read the Polar55 token or DB credentials. Fresh
  active/not-banned account and Super Admin RPC checks run before and after reads;
  export uses the existing identical private access boundary. No service-role
  bypass, new Supabase object or RLS/grant change.
- Endpoint is fixed HTTPS/Host, server-to-server, no user URL, redirects, cookies,
  public CORS or arbitrary SQL. Auth/body/request allowlists and no-store remain.
  No confirmed SSRF, SQL injection or secret logging was found in these paths.
- Reader accepts direct USAGE plus SELECT scoped to the history DB/two source
  tables, not writable/global/role/grant-option principals. SHOW GRANTS values
  are never logged. A separate limited account must still be provisioned safely.
- One read-only consistent InnoDB transaction, unique numeric IDs/times, canonical
  hashes and pending-revision exclusion freeze actual valid latest N. Statistics
  cover N; at most 500 retrospective targets. Same-time leakage exclusion and
  P00/F00/P01 definitions are unchanged and cross-language parity remains green.
- Backfill checkpoint shape, identity/counts, cursor, range total and terminal
  transitions are checked before fetch/write. Old ambiguous/malformed checkpoints
  fail closed and are preserved. No automatic counter reset or deletion. Normal
  pause/resume does not approve recovery from REVIEW_REQUIRED; operator review
  and a separately approved recovery procedure remain mandatory.
- Existing original manager's exact lock and idempotent store are exercised.
  New control-plane defaults remain off. The cron slot guard is scheduling
  protection, not proof of actual shared-host latency or uninterrupted collection;
  measured batch headroom and coexistence remain production gates.
- The response's `backfill=DISABLED` describes absence of a backfill operation in
  this read API, not an observed claim about an independently configured CLI job.
  Only CLI inspection/operational evidence establishes that job's actual state.
- Package allowlist excludes actual configs and old writer files; LF/CRLF
  canonical packaging preserves reproducibility. Archive originals/legacy
  fingerprints remain unchanged. Prior delivery must not be deployed in place
  of the reviewed package.

## Verification of corrected local sources

- Full Bun: **1,642 PASS / 0 FAIL / 23,998 assertions / 219 files**, complete
  LF-equivalent source snapshot with original byte-pinned assets retained.
  The explicit Docker parity test executes, not merely skips: all five windows
  and all three methods, including the strengthened response contract.
- **27 browser PASS** desktop/tablet/mobile, including 375 px, keyboard/axe,
  default-off, honest partial history, role revocation, cancellation/late response
  and authorized/cancelled export without a new source read. Fixtures now use a
  complete mathematically consistent response rather than a partial fake DTO.
- Strict TypeScript, scoped ESLint/Prettier, frozen dependencies and production
  build PASS. No application/dependency/immutable legacy-source changes outside
  this feature. No public-bundle read-token configuration.
- Isolated PHP 8.3/MariaDB 11.4 tests PASS: actual `labReadDb` configuration path
  and Unix socket with a restricted fixture account; native query/session settings;
  root rejection, wrong numeric schema rejection, 100k consistent snapshot under
  concurrent insert/update, hash/revision quarantine, idempotent original writer,
  lock interoperation, full pagination/terminal/checkpoint/timing regressions,
  HTTP no/wrong auth, origin/body/rate/default-off and bounded audit.
- The synthetic 100k snapshot retains approximately 4.2 MB PHP peak / 99 KB
  response. It is not a benchmark of the actual Polar55 host or live source.

## Exact remaining actions

1. Owner approval for **one consolidated update of this same PR**, then Regression,
   Browser Quality and Database Replay on the resulting exact new HEAD. No old
   CI substitution. No push, merge or deployment occurred during this review.
2. For production only: obtain safe live deployed PHP hashes, actual DDL/types,
   grants, PHP/MariaDB/socket/runtime versions, indexes/EXPLAIN, private storage,
   recovery evidence and read-only smoke results. The sanitized archive is not
   that evidence; live compatibility therefore remains **PARTIAL / UNVERIFIED**.
3. Separately approve additive Polar55 deployment, fresh limited read configuration
   and compatible Lovable publication. No Supabase migration is introduced.
4. Source-use/rate/retention verification and independently approved backfill
   scheduler/activation remain blocked. Do not launch historical collection as
   a merge or publish side effect. No predictive/coverage claim is approved.
