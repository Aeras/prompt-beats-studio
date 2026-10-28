# AI Music Inspiration — runner recovery release blocker

Baseline main `9de7c2aa4351232d2a8653278d8693c5cd9eedab`, merged #451 head `079ffc59231929d034f9120c0a8e5b28a6c04220`. This is one focused follow-up; Atlas #450 remains paused and unchanged.

## Investigation and evidence boundaries

The repository contains no external scheduler manifest, GitHub scheduled workflow, vercel/netlify deployment configuration or installed cron.schedule statement. `.lovable/plan/durable-song-generation-corrected-execution-architecture-2026-09-09.md` describes a minute scheduler as intended architecture, not evidence it exists. Managed Lovable project metadata confirms the synchronized main commit but does not expose a scheduler inventory or enforceable request lifetime. The owner has verified existing protected runner settings and an empty production cron.job. An out-of-repository scheduler is **unverified**, not proven absent. Operator inventory of Lovable and any external scheduler remains required; no production cron or secrets were changed here.

`170000` is the explicit pg_net request timeout in the Generation, QC and Inspiration kick functions. It does not establish a Lovable 170s hosting limit. Existing sequential HTTP sweeps could await multiple provider jobs after accounting recovery; an early slow lane could prevent Inspiration from ever being reached. Best-effort database kicks swallow enqueue failures by design, so they cannot replace periodic recovery. pg_net queues are unlogged and not crash-durable: durable application rows and a verified periodic rediscovery are the backstop.

## Minimal compatible change

- Existing POST `/api/public/jobs/run`, protected runner token and current/previous Lovable cron bearer remain supported. Authentication precedes parsing, imports and work; failures are no-store, fail-closed and sanitized. Bound input to 4KiB, validate UUIDs, reject ambiguous worker messages. Empty and extension-only legacy bodies still mean sweep. Existing direct worker responses retain `ok`/`ran` shape.
- Empty sweeps call service-only `dispatch_ai_runner_sweep_internal()` and return after enqueueing. No sequential provider workers run in that HTTP request.
- At most 2 Generation, 2 QC, 2 Inspiration, 2 exact execution-recovery, 2 final-validation and 1 maintenance request are enqueued per sweep. Each has a separate 170s pg_net timeout. Maintenance reaps only existing safe stale states and flushes bounded usage outbox records, not provider calls.
- Advisory serialization plus 45s tick and 90s target cooldown prevent overlapping schedulers from creating HTTP floods. Receipt timestamps mean **queued delivery**, not successful work or billed usage. Known enqueue failure rolls back its receipt; an unknown HTTP outcome is rediscovered after cooldown, with existing worker/database claims preventing paid re-execution.
- Exact-ID execution recovery uses the existing receipt logic, native status retrieval (no provider create), durable lease and eight-attempt cap. It does not drain the legacy five-row/20-validation batch in the same request. Existing no-argument reconciliation remains compatible. Final validation is separately dispatched using persisted job ownership; no client cost or owner assertions are accepted.
- Inspiration retains atomic reservations, one AI execution identity, source receipts, lease fencing, three application recovery attempts and unknown-outcome guards. First claim persists `research_started_at`; queue waiting does not consume research time. Work queued over 30 minutes fails without provider dispatch. Standard stays 90s; extended becomes 120s, leaving 50s under the known transport deadline for persistence. This is headroom, **not proof** all hosting/database failures can complete within a wall-clock bound.
- Existing Generation/QC transports may exceed 170s on some providers. Their existing journals/recovery and fail-closed unknown handling remain; this patch does not claim to make every synchronous provider fit an unverified hosting limit, nor exactly-once external execution. Hosting/model runtime acceptance is still a release condition. No prompts, model selections, subscription charging or Atlas guards change.

## Verification and configuration

Use mocked providers and transactional mocked pg_net only. `supabase/tests/runner_recovery.sql` checks lost kick, safe enqueue retry, cooldown, per-request deadlines, ACL, exact-ID lease/cap and unchanged research reservations. `scripts/tests/runner-recovery-races.sh` uses independent local connections and observes the real advisory-lock barrier. Existing Inspiration SQL/RLS/spend/concurrency suites remain mandatory. Bun integration tests cover actual runner/cron auth, failed authentication reads, input limits, independent lanes, delayed queue, cancellation/unknown recovery and no duplicate paid call. Exact final tests/CI links are in the follow-up PR and WORK-STATUS references that evidence.

Official references: [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [scheduling functions](https://supabase.com/docs/guides/functions/schedule-functions). The changelog Markdown endpoint could not be fetched by the documentation browser; the current scheduling/pg_net references were checked directly. No SDK or dependency versions are changed.

## Production sequence — requires separate approval; NOT executed

1. Independently review final PR/HEAD and all three gates. Verify backup/recovery, correct `qwlksrcsovbncmretjdt` project and exact production migration history. Inventory existing Supabase and **external** schedulers before adding another. Do not infer an external scheduler is absent from source alone.
2. Verify real deployed hosting/request lifetime and the current trusted runner URL ends at the correct deployment's `/api/public/jobs/run`. Verify only secret **presence**, permissions and authentication behavior, never print values. Confirm the model/provider behavior and account-level spend caps separately. Do not activate with an incompatible hosting runtime.
3. With separate authorization, apply only `20261028075346_ai_runner_recovery_fanout.sql`, after the #451 migration prerequisite. It installs no cron, changes no secret, and is additive/backward compatible with old direct worker calls. Verify new service-only RPCs, RLS/table ACL, column and retained legacy feature policies.
4. Separately approve and publish compatible application code; verify published server version, not editor sync alone. Pause an existing external sweep during coordination if one is discovered; do not terminate already committed provider work or clear journals.
5. Approve scheduler activation explicitly, including potential execution of already queued user-admitted work. For initial no-paid verification, confirm no dispatchable new jobs and use the existing global AI control only with owner approval. Do not manipulate job rows or financial records. Recovery of stored work must remain allowed.
6. Use a **single named minute cron**. Keep credentials out of its command; it executes the service-owned database function, which reads already protected configuration at runtime. Operator SQL after prerequisites/approval (not an automatic migration):

```sql
-- Verify no conflicting external scheduler first. Run as authorized database owner.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261028075346') THEN
  RAISE EXCEPTION 'Required runner migration missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key='runner_url' AND value#>>'{}' ~ '^https://[A-Za-z0-9.-]+/api/public/jobs/run$')
 OR NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key='runner_token' AND length(value#>>'{}')>=16) THEN
  RAISE EXCEPTION 'Protected runner configuration unavailable';
 END IF;
 IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='promptbeats-ai-runner-recovery') THEN
  RAISE EXCEPTION 'Named scheduler exists: inspect its schedule/active flag without exposing secrets';
 END IF;
 PERFORM cron.schedule('promptbeats-ai-runner-recovery','* * * * *',
  'SELECT public.dispatch_ai_runner_sweep_internal();');
END $$;
```

7. Verify named job ID/schedule/active flag and cron run success, delivery counters and sanitized HTTP status/timed_out metadata. A successful cron transaction or pg_net enqueue is **not** completion evidence. Verify existing unknown jobs do not produce new provider creates; run a separately approved bounded live pilot before Beta use. Never publish provider headers, tokens, raw response bodies or user content while inspecting telemetry.
8. On failure, separately authorize `cron.unschedule('promptbeats-ai-runner-recovery')` for this job only and disable only the affected Beta/admission if needed. Keep additive objects, all results, reservations and accounting. Existing initial kicks still operate. Do not drop tables, erase unknown outcomes, change secrets, re-enable the old sequential sweep as a supposed fix, or perform speculative historical reconciliation. Forward-fix and reverify.

## Remaining release evidence

Actual external scheduler inventory, deployed runtime/lifetime, applied production migration, scheduler activation, publication and end-to-end telemetry are unverified. No production writes, activation, secret changes, publish, merge or paid API calls are part of this implementation task. The parent feature remains release pending until those are independently verified.

## Local verification before PR

Frozen Bun installation PASS. Full offline Bun: **1,266 PASS / 0 FAIL / 12,817 assertions / 178 files**. Strict TypeScript, changed-source ESLint/Prettier, production build and diff checks PASS. Transactional SQL/ACL with mocked pg_net, independent scheduler race and existing Inspiration admission/claim/dispatch/recovery/spend/profile races PASS in disposable `runner_recovery_20261028`. No production mutation or provider request. Final exact-HEAD Regression / Browser Quality / Database Replay evidence belongs in the PR; earlier #451 checks are not reused as current-HEAD CI.

Migration SHA256: `94d5e172b5ca0aede8ec878cfa703cc223b6e82482c3366e1c72335bd01b39e2`.
