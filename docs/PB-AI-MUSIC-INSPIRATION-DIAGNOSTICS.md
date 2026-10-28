# Music Inspiration — stage-specific, privacy-safe failure diagnostics

## Verified incident and acceptance

Baseline main 698d208784ef5fa6eb978afc73585edcd87c7f81, #458/#459 merged. After the approved #458 production migration, a real request at 2026-10-28 17:17 UTC reached its worker and one search reservation. That search ended unknown; no AI dispatch or AI execution journal existed. The prior generic error_code discarded the originating exception, so neither HTTP rejection, network failure, malformed Tavily response nor persistence failure can be proven retrospectively. No credentials or paid requests were used to invent a diagnosis.

Acceptance: every newly observed failure identifies its stage and safe category; preserve available HTTP/SQL/PostgREST codes, distinguish Tavily JSON/schema from AI JSON/schema/evidence, preserve the primary failure if diagnostic persistence also fails, show the owner a useful localized reference, never log prompts/lyrics/query strings/provider bodies/credentials/identity. No money caps or pricing-age checks reintroduced.

## Design and guarantees

- Existing error_code (160 characters) carries a bounded versioned mi1 diagnostic. Controlled stage/category enums, optional integer HTTP status, strict SQLSTATE/PostgREST code and allowlisted schema root field only. No new table, RPC, schema change or migration.
- Stages include admission, worker claim, authorization, source preparation, Tavily request/HTTP/JSON/schema/receipt storage, AI request/JSON/schema/evidence, usage persistence, result persistence, recovery and job state persistence.
- Server logs emit the same safe fields plus validated request/job UUID. SQLSTATE 42501 and PGRST202 remain identifiable without SQL messages/details. HTTP 401/429/432/433/5xx remain distinguishable without reading/logging their response bodies. Non-OK response streams are cancelled; whitespace around a configured key is normalized before its authorization header, without changing any stored secret.
- Unknown consumption remains unknown. No automatic provider retry, no invented zero-cost receipt, no monetary or subscription change. Existing execution journal and usage deduplication remain authoritative. A cancelled application does not prove upstream termination or zero billing.
- A failed job-status database poll is diagnosed as database failure rather than masquerading as user cancellation. When both the primary operation and checkpoint fail, safe server logs retain both stages; durable diagnostics cannot be guaranteed during a database outage.
- English/Greek owner UI displays stage/category, available HTTP/database code, allowlisted field and job reference. Legacy generic codes still render safely; no retrospective error reconstruction is fabricated.
- Existing server RPC already supports owner cancellation of unknown jobs. UI now exposes that action with explicit billing/history wording. It preserves the unknown provider/accounting evidence, marks the application job cancelled and never starts another research automatically. A subsequent new research is a separate explicit user action and may incur new cost. No direct production job edits or blind recovery were performed.

## Offline verification

Fixtures cover missing worker search configuration, transport/timeout, HTTP 400/401/422/429/432/433/434/500, HTTP-200 malformed JSON/schema, empty/oversized responses, AI HTTP/incomplete/JSON/schema/evidence, receipt persistence failure, missing RPC, polling failure, checkpoint failure and preserved accounting after invalid AI results. Synthetic sensitive markers assert messages/bodies/stack/cause/values never enter stored or logged diagnostics. Browser fixtures cover EL/EN on desktop/tablet/mobile, no overflow, no duplicate paid request and explicit unknown-job closure. Final counts and exact-HEAD CI links are recorded in the PR and WORK-STATUS. All external requests are mocks.

## Release and recovery — publish requires separate approval

1. Review/merge only with final-head Regression, Browser Quality and Database Replay PASS. This change is application-only: do not reapply #458 or any other migration.
2. With owner approval, publish the exact compatible Lovable snapshot and verify the published artifact, not editor synchronization alone.
3. Owner can close the old unknown application job using the new explicit action. Its failure cannot be diagnosed retroactively beyond persisted evidence. Preserve its financial/execution records.
4. A separately approved new research records its safe diagnosis in the owner UI, job error_code, failed-search receipt and hosting logs. Correlate by job UUID. Use observed status/stage to decide whether a credential, Tavily account, network, response schema, AI response or database repair is actually required. Do not rotate secrets or relax validation speculatively.
5. No paid pilot, production publish, migration or production record mutation is authorized/performed by this implementation. The exact original Tavily failure remains unknown until new runtime evidence exists.

Rollback: revert the application commit and publish the previously approved snapshot with owner approval. Existing diagnostic strings are compatible with the old bounded string schema and fall back to generic status; they remain preserved. No destructive database rollback or accounting backfill is needed.
