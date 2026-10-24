# PromptBeats — Πραγματική διακοπή AI κλήσεων (ξεχωριστό feature)

**Status:** Technical specification / feasibility study only. Not part of the security audit. No code changes authorized in this document.

## Product behavior

When an AI action is in progress (AI Generator, Music Analyzer, Quality Check, and other AI tools), replace the disabled spinner-only action with a usable **«Διακοπή»** control. On click show a confirmation dialog with **«Άκυρο»** (continue the same job, do not cancel it) and **«Επιβεβαίωση διακοπής»** (request authoritative server-side cancellation). Prevent double-click or overlapping cancellation requests. Explain that provider usage already incurred may be charged.

**Core requirement:** Cancellation MUST target the *actual active provider invocation*. Merely hiding UI, discarding the Promise, returning early from frontend, changing a database status while remote inference keeps running, or closing the browser connection is NOT sufficient evidence of true upstream cancellation.

## Technical discovery needed before implementation

Inspect PromptBeats real execution modes and provider adapter paths, particularly:
- `src/lib/ai-provider.server.ts` (OpenAI Responses, Gemini SDK and SSE, Anthropic stream, xAI Responses, Mistral, Groq and OpenAI-compatible providers)
- `src/lib/ai-provider-registry.server.ts`
- `src/lib/generation-jobs.functions.ts`, `src/lib/generation-jobs.server.ts`, `src/lib/quality-check-jobs.server.ts`, job DB/RPC definitions
- Music Analyzer audio upload/provider pipeline; distinguish upload/preprocessing from ongoing inference.

For every feature + provider + API mode, record: request style, server execution lifetime, actual upstream cancel method, shared AbortSignal availability, streaming availability, whether remote abort is documented/verified, final usage retrieval, and estimated change to latency/cost. Do not assume all API-compatible services have equivalent cancellation behavior.

## Provider cancellation models

- **OpenAI Responses background mode:** Official endpoint `POST /v1/responses/{response_id}/cancel` applies to responses created with `background:true`, with stored response ID. Reference: https://developers.openai.com/api/docs/guides/background and https://developers.openai.com/api/reference/resources/responses/methods/cancel . Assess background-mode compatibility, price, retention and latency tradeoffs before migrating any existing workflow.
- **OpenAI synchronous Responses:** Official docs describe terminating the connection; this is different from the background cancellation API. Document whether upstream computation truly stops for the actual transport/runtime and what usage can be recovered. No blanket billing guarantees.
- **Gemini/Anthropic/xAI/Mistral/Groq/other models:** Verify their current official API/SDK documentation and behavior per transport (streaming / non-streaming / asynchronous). Prefer an explicitly supported cancellation endpoint, otherwise use end-to-end server-side AbortController where upstream stopping is documented/tested. If actual upstream termination cannot be established, mark `not-confirmed`, do not market as guaranteed cancellation or cost saving.

## Architecture

1. Persist job and attempt IDs, owner ID, selected provider/model, current state, cancel-request timestamp, provider request/response identifier where available, and cancellation outcome.
2. Use a server-owned cancellation request endpoint/RPC with authentication, ownership and job-state checks. Request cancellation atomically; avoid race with success, failure, retry, and recovery sweeps.
3. If job is queued: prevent provider start and terminate as `cancelled_before_start`.
4. If running: signal the exact running execution (across worker/process boundaries) and invoke provider-supported cancellation. In-process AbortController maps are insufficient on their own for multi-instance/durable workers. Use DB-coordinated cancellation and polling or a worker-safe signaling mechanism, accounting for restarts.
5. Do not report `cancelled_upstream` until acknowledged or verified. Distinguish `cancellation_requested`, `cancelled_upstream`, `already_completed`, `cancel_unconfirmed`, `cancel_failed`.
6. Recovery must never automatically re-run a cancelled attempt; late provider output must be handled safely and must not become a normal completed result or override a cancelled state.
7. Record known usage/cost despite user cancellation. If provider usage cannot be retrieved, mark `usage_unknown` rather than zero; reconcile later if provider supports it. Do not refund credits speculatively or count provider spend as zero.
8. Preserve existing idempotency, anti-abuse limits, feature authorization and admin policies. Cancellation does not free an already-incurred AI quota unless explicitly supported by the existing accounting contract.

## Acceptance / regression tests

- Cancel BEFORE provider start => no provider invocation.
- Cancel DURING streaming => upstream cancellation or validated connection termination, stop further generation, no ordinary completion.
- Click «Άκυρο» in confirmation => original job continues without restart.
- Cancel after completion => returns `already_completed`, preserves valid result and true spend.
- Repeat cancel request => idempotent outcome.
- Concurrent cancel/complete/retry/reaper => one consistent terminal state, no duplicated provider calls.
- Unauthorized user cannot cancel another user's job.
- Browser refresh/disconnect does not undo authoritative cancellation; durable worker state recovers consistently.
- Accurate charge display: partial verified usage, provider full billed amount, or unknown usage; never promise proportional or zero charge.
- Provider without verified cancel capability: honest UI/status and no misleading promise of stopping computation.

## Implementation process

Treat as **separate feature** and separate branch/PR from audit fixes. First produce provider-by-provider feasibility matrix, then select a pilot (prefer a well-supported, low-risk provider/path), test with mocks/fake providers and authorized minimal real API calls only after explicit approval and capped budget. Roll out incrementally behind a feature flag, respecting all current durable-job invariants.
