# KINO Analysis Lab — integrated local research release

## Scope decision and source provenance

The owner's 4 November 2026 instruction supersedes every standalone-repository,
new-domain, new-database and separate-auth requirement in the supplied documents.
Implement inside PromptBeats → existing private Football/KINO → Εργαστήριο.
One branch/PR; no Generator, Projects, Songs, Payments, global styling or auth
implementation changes. Existing private Super Admin access is reused, not
broadened to all users. This is an initial restricted research release.

Inputs read: owner handoff, all starter source/tests, README, CODEX_HANDOFF and
V3.1 errata. Starter ZIP SHA-256:
`98b8175df716b4168a9bcfda46e564bcf267ac159fbb5a9ffdbd84c88d6dc09f`.
Original starter is preserved outside Git in the owner's local artifact folder,
`kino-lab-20261104/starter-original`; its seven original tests pass. No second
package manager, standalone server, stylesheet or npm project is installed.
The referenced full V3 specification and two independent reviews were not present
in the two supplied attachments or the relevant downloads. This is not evidence
that their unspecified 22 scenarios have been verified.

## R0A — source contract: BLOCKED for new live ingestion

On 4 November 2026, a read-only request to
[the official KINO page](https://www.opap.gr/kino) redirected to
[OPAP's geographic notice](https://media.opap.gr/geo-informative-opap/informativepage-opap.html),
which limits website access to Greece. The official terms URL
`https://www.opap.gr/terms-and-conditions` could not be retrieved. No bypass,
API harvesting, bulk download or new live endpoint probe was attempted.
This does not prove that the API itself has the same geographic policy; it
means automation/reuse/retention/rate rights and permitted hosting region are
not verified here. Public reachability would not establish those rights either.

The repository's existing OPAP last/active adapter, cache, animation and
Super Admin server function are unchanged. The Lab does not extend that adapter
into history collection. No new polling, server cache, scheduler or paid API.
Historical JSON imports and the existing sanitized OPAP fixture are input-shape
evidence only, never proof of official schedule/completeness or old availability.

To pass G0A, obtain authoritative permitted-use/rate/retention and hosting terms,
an allowed observation mechanism, expected scheduled slots and evidence for
latency, freshness, deadline margins and clock policy. Only then review a bounded
history/paging/era fixture plan. No assumption of 288 draws/day or contiguous IDs.

## R0B — study decision: exploratory GO, confirmatory NO-GO

Available methods: versioned deterministic P00, F00 and P01. F00 uses all strictly
earlier observations, prior strength 8 with symmetric prior inclusion 0.25 and
ascending-number tie break. P01 uses the latest 100 strictly earlier observations
with the same smoothing/tie break. P00 uses the starter's FNV/xorshift/Fisher-Yates
reproducibility generator, not cryptographic or betting randomness. Proposal
seeds come from browser random UUIDs and are exported. No LLM is involved.

Provisional primary k is 8 and candidate is P01; F00 is the paired comparator.
The local retrospective tool permits k=5/8/10 and all three methods; changing
these is exploratory tuning, not a registered confirmatory study. Each run
records exact configuration, seed, version, selected/baseline sets, identical
target IDs, cutoff and training count. Fixed default warmup 30; at most the first
500 eligible observed targets after warmup in the selected sample. The result
is always `RETROSPECTIVE_POINT_IN_TIME_APPROXIMATE` and `EXPLORATORY`, or
`INSUFFICIENT_DATA` when there are no scored targets.

U = mean candidate hits − k/4. T = paired mean(candidate hits − F00 hits).
Neither is displayed as a significance, confidence, efficacy or replicated claim.
Under the uniform 20-subset null:

```text
Var(H) = k * .25 * .75 * (80-k) / 79
Var(H_A-H_B | A,B) = 2 * (k-m) * .25 * .75 * 80 / 79
```

Here m is overlap of the two k-sets; memberships within one draw are dependent.
Analytic variance, seeded iid sanity and injected-positive sentinels test the
engine; they do not constitute a power analysis or proof of predictive lift.
P11 is a descriptive squared-deviation index only, without a naive chi-square
p-value. P03 is unavailable: ID adjacency is not verified scheduled continuity.

G0B requires a frozen primary U/T objective, minimum meaningful effect, alpha,
multiplicity/research-program policy, paired inference/power simulation budget,
fixed horizon/stop rule, eligible/scheduled population and missingness thresholds.
These product/study choices are not invented by the implementation. No held-out
confirmation or prospective replication claim is enabled. Absence of demonstrated
signal remains a valid outcome. No live proposal is assigned a target/deadline.

## Data and security

Only completed game-1100-compatible 20/80 shapes enter the core. Active/partial
draws, invalid times, wrong game, repeated/out-of-range numbers and malformed
optional Bonus/Second Chance arrays quarantine. Bonus/green never add to the
20-number score. Missing optional historical fields are not era certification.
Input is bounded at 4 MiB/5,000 records; unknown fields are not retained as private
payload or echoed in errors. Exact duplicate IDs deduplicate. Conflicting content
or time permanently blocks that ID for the import, including A→B→A; all valid
import-order observations are retained. Import order is not a server-observed
source chronology and is never backdated to prediction time.

Latest N, complete Europe/Athens days and explicit UTC half-open intervals are
supported. IANA date boundaries handle 23/25-hour DST days. Equal-time results
never enter each other's training. Missing scheduled draws cannot be counted:
`COMPLETENESS_UNVERIFIED`, unknown scheduled denominator. Gaps are left-censored
until first observed occurrence; neighbor overlaps are not claimed scheduled lags.

Existing page setup blocks anonymous/non-Super-Admin access. Each Lab import,
proposal, retrospective run and export also calls a new tiny authenticated
server permission function using the existing `get_my_account_status` (active,
explicitly not banned) and `current_user_is_super_admin` RPCs in the caller
context. Missing/deleted/blocked accounts and read errors fail closed; no service role, user metadata,
new SDK/key, ACL/RLS or database object is introduced. Exports are local JSON,
not CSV/HTML executable content. Original file-byte SHA-256 is exported.

Data remain in component memory only, never sent to the permission endpoint or
stored in localStorage/DB. Changing identity/view/unmount drops the component;
pending permission/import results cannot resurrect old state. Failed access
clears local results. Changing controls invalidates proposals/backtests. Fresh
permission and bounded work precede mutation/export; duplicate clicks share a
local in-flight guard. The local report is not a live immutable server receipt.

## R0 operations and release gates

Reuse the existing React/Vite/TanStack/Supabase authentication and deployment
path. No new repo, application, region purchase, paid service or infrastructure.
No new persistence or background worker: database backup/restore changes are
not applicable to this local-only release. Existing production backup mechanisms
were not re-audited. Closing a page discards data; local JSON export is a report,
not a database backup or restore certification.

Prospective `StudyTargetSlot`, `ForecastIntent`, immutable `ForecastCommit`,
outcomes/evaluation/exposure/evidence registries, cross-worker result-seen barrier,
durable-write-time deadline/clock checks, idempotent DB writes, sealed holdout
exports, real operational coverage and restore tests are **DEFERRED until G0A/G0B
and explicit scheduled-operation approval**. They are not replaced with mutable
localStorage or misleading synthetic server commitments. No migration is needed
for the present scope. No live forecasting switch is exposed.

G1/G2: bounded local ingestion, deterministic research and retrospective-only QA
are implemented. Full official ingestion/era/coverage and confirmatory inference
are not complete. G3/G4/G5 confirmatory/prospective gates remain blocked/deferred.
Do not call the full prediction programme CLOSED because the local Lab works.

Local acceptance includes original and new core tests, actual permission-handler
tests, mocked authenticated UI at mobile/tablet/desktop and 375 px, keyboard/axe,
revocation/import/error/export/state invalidation, frozen install, full regression,
TypeScript, changed-source lint/format and production build. Exact-final-HEAD
Regression, Browser Quality and Database Replay must pass after the owner's
explicit CI-triggering push/PR approval under AGENTS §7. No merge or publish here.

Independent review must verify the diff remains limited to the Football/KINO
module plus tests and this ledger/docs. A future code-only publication may use
the existing Lovable workflow after separate approval; it does not approve new
OPAP collection or scientific claims. Recovery is an ordinary forward code
revert of the wrapper/Lab import, leaving the original live panel and all user,
song, project, billing and database records untouched.
