# Global AI usage switch — implementation and release evidence

## Scope / baseline

PR #438, existing branch `feature/admin-global-ai-usage-switch-20261025`, initial `d5f96072419b8ab2fbdded427f27c7eb18819f92`, based on main `48baa14a9e339f287218198acf95f49385cda941`. Keep Draft for independent review. No production operations or paid calls.

## Provider dispatch inventory

| Actual dispatch boundary                                                                 | Coverage                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/ai-provider.server.ts`                                                          | Anthropic messages; Gemini SDK, streaming and Interactions creation; Mistral; DeepSeek; OpenRouter; xAI; OpenAI Responses. All creation fetches use `aiProviderFetch`, Google SDK uses `generateAiContent`. Each retry/fallback/secondary request re-admits. |
| `src/lib/ai-provider-registry.server.ts`                                                 | Discovery, compatibility probes, reasoning/health checks including Gemini, Anthropic, OpenAI-compatible and OpenRouter. Even catalog/provider connectivity reads are gated conservatively.                                                                   |
| `src/lib/audio-model-lab.functions.ts`                                                   | Direct Gemini REST and SDK audio analysis.                                                                                                                                                                                                                   |
| `src/lib/inspiration-wall-ai.functions.ts`                                               | Direct Gemini multimodal creative direction.                                                                                                                                                                                                                 |
| `src/lib/song-analyzer.functions.ts`                                                     | Direct OpenAI/OpenRouter/Gemini extraction, judge and SDK routes.                                                                                                                                                                                            |
| `src/lib/song-analyzer-final.functions.ts`                                               | Final SDK analysis.                                                                                                                                                                                                                                          |
| `src/lib/song-analyzer-stage-a-guard.functions.ts`                                       | Direct Gemini stage-A.                                                                                                                                                                                                                                       |
| `src/lib/song-analyzer-v2.server.ts`                                                     | Gemini/OpenAI/OpenRouter V2 dispatch. Trusted `fetcher` injection is used only in offline tests; production caller does not supply it.                                                                                                                       |
| `src/lib/song-analyzer-enhanced.functions.ts`, `song-analyzer-enhanced-job.functions.ts` | RunPod `/run` and `/runsync` creation guarded; `/status/<id>` and `/cancel/<id>` remain existing-operation management.                                                                                                                                       |
| `src/lib/ai-execution.server.ts`                                                         | Generator, QC, revision, AI Tools and all shared modelCaller consumers: admit before creating a new execution journal; cached recovery returns without new provider dispatch.                                                                                |
| `src/lib/ai-auxiliary-idempotency.server.ts`                                             | Auxiliary operations including Story Map, Song Universe, assistant, Analyzer and secondary models share single-use admission context. Individual physical transports still enforce admission.                                                                |

Existing-operation exceptions: OpenAI Responses/Gemini Interactions polling in `ai-provider.server.ts`; OpenRouter usage lookup; `ai-execution-retrieval.server.ts` GET-only recovery; `ai-cancellation-upstream.server.ts` and `song-analyzer-enhanced-cancel.functions.ts` existing-operation cancellation. These do not initiate a generation and remain available OFF. Continuation wrapper uses fixed HTTPS host/path/method allowlist and rejects creation URLs.

Non-AI exclusions: R2/audio downloads/uploads, Supabase, Stripe, Qdrant vector storage/search, pricing-document fetch in `ai-model-refresh.functions.ts`, normal page/assets. Offline benchmark/cancellation CLI tools are not application runtime and retain their own explicit approval/budget controls; this switch does not claim to stop independent operator CLI tools. No provider Edge Function dispatch exists in this repository.

## Concurrency / financial contract

`admit_global_ai_dispatch_internal()` takes a shared row lock in a fresh READ COMMITTED transaction. Audited admin CAS update takes an exclusive lock. Thus OFF orders against concurrent admissions, across instances. The permit is single-use, in AsyncLocalStorage, not a process/TTL cache. Nested auxiliary/journal wrappers reuse only an unused permit; concurrent second requests and retries must get a fresh permit. SDK hidden retries are disabled; explicit configured retries re-admit individually.

**SLA:** after OFF commits, no request not already admitted may dispatch. An already admitted request may physically send or finish after OFF. This is not proof of worker drainage or retroactive cancellation. In-flight polling, result recovery, cancellation, usage/outbox persistence and terminal writes remain possible. Policy missing, RPC unavailable, timeout, malformed response or database failure fail closed before a new dispatch; credentials/database errors are not exposed. Environment emergency stop remains supported.

New job insertion/claim transitions also check policy transactionally, rolling back quota admission on OFF. Positively cached result recovery is exempt from claim gating, but any subsequent new provider call still needs transport admission. Existing pricing, accounting, prompts, model choices and JSON outputs are unchanged.

## Database / authorization

Forward-only `20261025212141_global_ai_usage_policy.sql`: private RLS singleton, default ON; service-role-only admission RPC; caller-bound authenticated admin read/write using existing fresh `assert_ai_model_admin()`. Direct browser table access revoked. CAS revision prevents lost admin updates; audit uses existing `UPDATE_AI_MODEL` action plus explicit `operation=global_ai_usage` details. Same-value save is idempotent. No new grants to anon or ordinary users. Missing policy is not interpreted as ON.

## Verification

Deterministic VM tests exercise actual dispatch module with mocked DB/transport; first admission, OFF, DB error redaction, parallel/nested permits, retry and continuation paths, explicit SDK retry control. Existing accounting/recovery tests inject an admission dependency only to isolate their pre-existing journal mocks. SQL suite covers ON default, RLS/grants, ordinary/banned admin denial, CAS/audit, denied new work and successful terminal completion OFF. Independent-connection race script covers admission-first and OFF-first locking. Browser fixture uses mocked server operations and checks ON/OFF save/failure recovery at desktop/tablet/mobile. No real provider calls or real model deletion.

Exact final HEAD and complete local/CI results are recorded in PR #438 to avoid self-referential commit hashes. Local logs/screenshots are outside the Git worktree; GitHub Browser Quality artifacts retain browser evidence.

## Coordinated release and rollback

1. Independent review, exact-head Regression/Browser Quality/Database Replay green; separate production migration/publish approval.
2. Verify production prerequisites/history, recovery capability and no other release. Keep default ON while deploying. Apply only approved additive migration before compatible application publish.
3. Respect #437 old-worker-drain/legacy-model-identity release prerequisite separately. This new switch cannot stop old deployed binaries or certify their drainage. Verify actual deployed version, not just editor sync.
4. Read policy as authorized admin; test OFF with mocked/staging providers and deny ordinary-user mutation. Confirm already-running completion/accounting and non-AI site work; restore intended setting. Do not run paid production probes without authorization.
5. Rollback application only to a version compatible with preceding #437 release. Keep additive DB objects and financial evidence. A pre-switch binary has no global OFF guarantee; maintenance requires verified hosting-side stop/drain before such rollback. Never remove RLS or fabricate settled usage. No automatic production rollback in this PR.

Until separately deployed and runtime-verified, state is CODE_COMPLETE_RELEASE_PENDING, never CLOSED.
