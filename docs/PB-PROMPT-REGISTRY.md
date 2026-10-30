# Secure Generator Prompt Registry

## Investigation and acceptance

Baseline: `4c8cfd2792b341a3906f84cb2645906fa86b59ed` (merged #474).
Read root AGENTS and WORK-STATUS; no overlapping open prompt implementation found.
Existing jobs carry a legacy promptVersion, admission consumes one credit atomically,
and the worker independently authorizes experimental versions. Revision/section-edit
prompts are separate contracts and must remain separate.

The implementation must preserve V1–V5 BETA 1 builders, all existing recovery,
provider admission, cancellation and usage contracts. New-song jobs bind an immutable
catalog reference and digest inside database admission. One database lock serializes
default changes, import/archive/delete and admission. Existing jobs remain untouched.
Only never-used non-default versions may be deleted; used versions archive instead.
Content never appears in ordinary-user job responses. Registry reads fail closed;
the explicitly seeded V1 default is the compatibility policy, not an error fallback.

Scope includes only the three specified entitlement/Feature Access dropdowns.
No entitlement semantics, QC routing, model, pricing or production setting changes.

## Release and recovery boundary

One additive migration must precede compatible application publishing. Drain old
new-song workers before switching the default; old workers do not implement registry
binding. Keep V1 selected until the new server and browser code are verified.
Existing historical jobs retain legacy routing. No production action is authorized.
Rollback default through the audited registry operation; app rollback requires
keeping admissions paused until compatible workers are restored. Preserve catalog,
references, songs, jobs, financial journals and audit history. Do not drop the schema
or restore an old database as an application rollback.

## Verification

Local frozen install, strict TypeScript, changed-source ESLint/Prettier, production
build, full Bun **1,399 PASS / 0 FAIL** and fresh isolated Supabase migration replay
passed. Registry SQL/RLS and actual independent-connection admission/default/delete
races passed. **24 focused browser cases** passed across desktop/tablet/mobile,
covering EL/EN imports/preview/default confirmation, three dark selectors, retained
legacy choices, archival and ordinary-user exclusion. The existing admin suite's
remaining unchanged scenarios also passed locally. The final exact-HEAD Regression,
Database Replay and Browser Quality results are recorded together in the cohesive
Draft PR's Checks and description; earlier runs never substitute for final HEAD.
No production closure or paid musical-quality certification is claimed.

## Contracts and access

- `master_v1` is the nine-placeholder, four-string JSON contract for uploaded
  Generator templates. The supplied V5 BETA 2 is seeded experimental with exact
  original bytes and SHA-256. Imports use bounded base64 bytes, a strict fatal
  UTF-8 decoder on the server, allowlisted filename extensions and the same
  placeholder/output-example validation in the UI and database. No normalization,
  execution, HTML rendering, dynamic provider configuration or paid probe occurs.
  The unchanged system instruction and final generation schema remain authoritative.
  Syntactic acceptance cannot certify prose quality, musical superiority or model
  compliance; review a candidate before explicitly choosing it as default.
- `legacy` is deliberately a different family. V1–V5 BETA 1 retain their fixed
  code-based builders and separate historical contracts at baseline `4c8cfd27`.
  Their digest identifies that versioned routing reference, **not** an invented
  common template body. The management view explains this; downloads apply to
  uploaded master templates. Do not rewrite a legacy builder to update a prompt:
  import a new immutable catalog version instead. Original historical jobs without
  bindings continue decoding with their original legacy version, defaulting to V1.
- Only authenticated, currently eligible Super Admins can list/read/import/mutate
  catalog entries. The database revalidates authority under the established user
  security lock. No `anon`, `authenticated` or `service_role` direct catalog-table
  privileges exist. A service-only bounded RPC loads a job's bound template by
  job ID **and owner**. The worker rechecks the binding before provider marking;
  runtime resolution verifies the stored content hash before the existing one-call
  provider path. Prompt bodies are absent from client jobs, ordinary pages, public
  assets and benchmark exports. The registry never changes system/model settings.
- New ordinary-user songs always resolve the global pointer at DB admission,
  independently of plan. A forged V1 request cannot choose an inferior prompt when
  another default is active. An explicit experimental ID requires current Super
  Admin + Advanced new-song context. Revision and section editing keep their
  original dedicated routing. Experimental authority is rechecked by the internal
  worker RPC; a published default does not require users to be Super Admin.
- A transaction-wide catalog lock serializes import, default/archive/delete and
  admission. The original per-user job idempotency/credit transaction is unchanged.
  Binding ID/hash/label are trigger-owned and immutable; a restrictive FK prevents
  deleting referenced versions and `ever_used` never resets. Archiving does not
  prevent recovery of a pinned job. Database-owner maintenance can create legacy
  fixtures without pinning; this path is unavailable to PostgREST roles and cannot
  forge a registry binding. No backfill, song deletion or financial repair occurs.
- A missing/invalid registry fails closed; there is no experimental error fallback.
  A missing default raises inside admission and rolls back the original credit
  transaction. The initial explicit V1 pointer is the compatibility default. Missing
  deployment prerequisites are a release failure, not an invitation to bypass DB.

## Coordinated release checklist (requires separate approval)

1. Verify final reviewed PR HEAD and three green CI gates, production project,
   prerequisite PB-015 schema and migration history, recovery capability and absence
   of another release. This implementation does not certify production PB-015.
2. Apply **only** `20261030195702_secure_generator_prompt_registry.sql` through the
   history-aware deployment mechanism. Confirm its six initial rows, exact V5 BETA 2
   digest, V1 pointer, RLS/ACL and unchanged legacy Feature Access policies.
3. Publish the matching code. Migration-first is backward compatible while the
   default remains V1: old workers keep V1 routing and existing jobs are untouched.
   Verify the actual published runtime, not only the Lovable editor SHA.
4. Verify administrative catalog/import/download/permissions and the three dropdowns.
   Do not switch to a template default while an old worker can still execute jobs.
   Confirm hosting version/worker quiescence before switching; absence of visible
   job rows alone does not prove old workers have stopped.
5. A paid quality/compatibility pilot and any production default switch need separate
   approval. Selecting, previewing, importing or archiving never calls a provider.
6. If needed, restore a previous valid default through the audited CAS RPC. For an
   app rollback, retain the compatible worker for pinned template jobs; coordinate
   existing admission controls and finish/recover them safely before old-code
   rollback. Keep all registry/history/accounting evidence. Never delete a used
   version, drop the migration or speculate about old financial records.

## Scoped UI compatibility

Only Feature Access mode and manual entitlement plan/duration changed from native
selectors to the existing Radix Select. The six modes and eight expiry presets
(7 days, 1/2/3/6/12 months, Never, custom local date/time), Plus/Pro, reasons,
confirmations and DST/calendar helpers are preserved. No tier, price, Stripe,
feature entitlement or existing user permission changed.
