# Music Inspiration — observed usage, administrator tariffs and safe request replacement

## Owner decision and scope

Baseline main: 393a86537ccf3e2e580815340177266e5179d72c (merged #456 and #457). This explicitly supersedes the financial-admission and price-freshness requirements in earlier Inspiration documents. No per-research dollar ceiling, daily dollar ceiling or four-starts/hour quota remains. Old/unverified administrator tariffs do not prevent research. Missing tariffs produce an incomplete estimate, not blocked research or invented free usage. Other operations' policies are unchanged.

The fixed Standard/Extended research plans still use at most 2/5 searches, bounded source context, output size and technical deadlines. These are execution-shape and transport protections, not monetary budgets. Authentication, Beta/Generator entitlement, enabled installed model, global AI OFF, cancellation, leases, source validation and non-duplicating recovery remain mandatory. The search credential is genuinely required; its price and verification date are not admission requirements.

## Implementation and compatibility

- Service-only start_music_inspiration_job_v2 stores administrator-entered input/output/cache/cache-write USD tariffs and configured Tavily USD/credit as an immutable per-job snapshot. Unknown or unsupported-currency prices stay null. Model and provider select the exact pricing row. No price-age/status check.
- Forward migration 20261028152431_music_inspiration_observed_usage.sql removes only Inspiration financial constraints/admission checks, preserves existing usage and receipts, and adds the pricing snapshot and owner-keyed abandoned-request fence. Existing RPC signatures remain. The historical budget_usd field is retained with value 1 for old-reader compatibility ONLY; no reservation or admission compares against it. It is not displayed as a budget. Historical values are not rewritten.
- Every query/AI dispatch retains its durable unique reservation, but new workers reserve zero dollars. Technical query-count reservations are distinct from observed Tavily credit consumption. A provider reporting more credits is recorded without rejecting an already-consumed response.
- Terminal job responses include a derived usageReport, without returning raw provider text or secret-bearing metadata. It reads persisted execution/result usage and observed search receipts; no provider call is made to calculate it. Actual input/output are shown, reasoning is already included in normalized output, and cache/write input subsets use their own saved tariffs. Provider-reported monetary amounts are shown separately and never added to the tariff estimate.
- Total is available only when final AI usage, required tariffs and search receipts are known. Unknown/failed/timed-out dispatches never imply zero consumption. Historical jobs lacking a snapshot remain explicitly incomplete. Invoice accuracy and retrospective tariff reconstruction are not claimed.
- Editing an unacknowledged form submits its current artist/model only after server reconciliation of the old identity. If the old job exists, recover it without a second dispatch. If absent, serialize abandonment against start and retain a tombstone so a delayed POST cannot create paid work. Database/network failure preserves the original request identity. Existing jobs are not deleted/cancelled by local discard.

## Acceptance and evidence

Offline coverage includes high/old/unverified/missing tariffs, real usage beyond former caps, cache/reasoning accounting, unknown search usage, separate provider amounts, owner isolation, service-only ACL/RLS, cancellation and stored receipt recovery. Independent PostgreSQL connections cover both abandonment-first and start-first interleavings. Browser fixtures cover edited pending model/artist, lost start acknowledgement, terminal cost display and existing mobile/keyboard containment. All provider/search calls are mocks. Final exact-HEAD GitHub checks and local counts are recorded in the PR and WORK-STATUS; earlier-head results are not substituted.

## Release procedure — separate approval required

1. Verify approved main/PR SHA, production project qwlksrcsovbncmretjdt, migration history, prerequisites, recovery capability and absence of another release. No production mutation was performed during implementation.
2. Apply ONLY 20261028152431_music_inspiration_observed_usage.sql using the established history-aware migration procedure. Verify its recorded version, new service-only functions, owner isolation and unchanged historical records/19 legacy Feature Access policies. Never bulk-push unrelated pending migrations.
3. Publish the compatible approved application snapshot in Lovable. Migration-first remains compatible with old signatures/readers; old deployed code can still enforce its former financial gate until the new publish, so do not claim policy activation before verified publish.
4. Verify the actual deployed snapshot, search/provider credential availability through safe configuration checks, eligible model selection and a separately approved live pilot. Do not expose credentials or infer runtime success from editor sync. No paid pilot is authorized by implementation.
5. Inventory the real scheduler/backstop. Trigger kick and bounded leased recovery already exist; an empty cron inventory does not prove an external scheduler exists. If no scheduler is verified, separately authorize the documented runner scheduler configuration. Do not install cron or change secrets as part of this code change.

## Rollback and residual limits

Retain additive DDL, snapshots, execution journals and tombstones. Revert application code only with awareness that old code reinstates former policy; the legacy budget sentinel supports old readers for newly created jobs. Do not reverse migration history, delete receipts or replay unknown provider executions. If deployment fails, leave the additive schema in place and restore the last approved compatible application snapshot with operator approval. No destructive schema rollback is required.

The application cannot stop provider billing already underway, prove zero cost for an unknown outcome or turn an estimate into an invoice. Research source quality and completeness still depend on accessible evidence. The owner deliberately accepts uncapped monetary use; no hidden substitute monetary limiter is introduced.
