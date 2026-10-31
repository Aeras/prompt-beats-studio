# Music Inspiration — Cloudflare Tavily transport correction

## Confirmed cause and scope

Baseline main c2be8626c11fc611953c9303065e7805544d9480 (merged #460). Production diagnostics at 2026-10-28 18:15:20 UTC identify search_request/network, no AI dispatch or result. The actual Tavily adapter sets redirect:"error". The Cloudflare production target rejects this option before dispatch; the safe catch classifies its TypeError as network. This is a local Request-construction failure, not proof of invalid Tavily credentials, insufficient credits, a model fault or an AI response-parser failure.

Reproduction with official workerd 2026-10-12, nodejs_compat and compatibility date 2026-10-01: native Request throws TypeError; the unchanged adapter fails before reaching the local fixture. Changing only redirect to manual makes the same adapter execute successfully. The runtime test is an isolated compatible-runtime reproduction, not a claim to run the exact proprietary production build. [Cloudflare Request documentation](https://developers.cloudflare.com/workers/runtime-apis/request/) confirms that error is unsupported and recommends manual plus status validation.

## Change and acceptance

Use manual; retain boundedJson's rejection/cancellation of every non-2xx response. Never follow Location or forward Authorization to a redirect destination. No automatic retry. Fixed Tavily origin, body bounds, evidence validation, cancellation, observed usage, durable receipts and unknown-outcome safeguards remain unchanged. No schema, pricing, prompts, model, configuration or production-record changes.

The five redirect statuses 301/302/303/307/308 must fail safely after one dispatch, cancel the rejected body and expose only the HTTP diagnostic. The actual adapter must also run under native workerd fetch with local service bindings, no network access, correct evidence hashes, known/unknown usage, authentication/rate-limit/server HTTP failures and invalid JSON/schema. Node/Bun fetch mocks alone accept the unsupported option and did not catch this runtime incompatibility.

## Reproducible offline verification

- bun test src/lib/music-inspiration-research.test.ts src/lib/music-inspiration-diagnostics.shared.test.ts src/lib/music-inspiration-jobs.test.ts
- bun scripts/tests/tavily-workerd.ts

The latter bundles the real adapter, runs the pinned official workerd@1.20261012.1 and directs all outbound fetches to an in-process fixture. The network allowlist is empty. npx may download the pinned test executable; no Tavily/AI requests are made. For an already-cached, fully offline runtime, set PB_WORKERD_BINARY to the matching workerd binary. Only dummy credentials and static source text are used. Temporary test output is removed afterward. The Regression workflow runs this regression on every PR/main push; no application dependency or lockfile change is needed.

## Release and recovery

Application-only change: no migration, scheduler, secret update or historical accounting repair. Require Regression, Browser Quality and Database Replay PASS at the exact final head before merge. Merge and separately authorized Lovable publish are distinct. After publish, verify the published snapshot and, only with owner authorization for real search/AI usage, one new research request through source retrieval, synthesis and result persistence. Until then the live end-to-end feature remains release-pending; fixing this verified transport blocker does not prove there are no later-stage failures.

Do not automatically retry/reclassify previous unknown jobs or zero their costs: local reproduction is not individual provider billing evidence. Use the existing explicit owner close/reconciliation behavior. If rollout fails, stop new research and retain receipts/diagnostics. Reverting to the old redirect option reintroduces this proven failure; prefer a scoped forward correction. Atlas #450 remains paused and untouched.
