# PromptBeats — Music Analyzer Version 2
## Authoritative Codex implementation handoff · 22 October 2026

**Repository:** `Aeras/prompt-beats-studio`  
**Task:** Implement and verify an experimentally isolated Version 2 of the existing admin-only AI Song Analyzer.  
**Execution expectation:** Do the engineering work, write tests, run verification and open a **Draft PR**. Do not merely offer a plan. Do not merge or deploy.

---

## 0. Exact user intent — non-negotiable

The existing Song Analyzer is already **Admin-only**. Keep that same permission scheme and existing visual style. Add a Version selector at the **top** of the Song Analyzer:

- **Version 1:** Preserve current production behavior exactly, including Essentia/legacy diagnostics, selected audio-analysis model, intermediate synthesis, Stage A guards and chosen Final Judge, wherever currently applicable. This is the control/comparison arm.
- **Version 2:** Analyze the uploaded song via **Essentia** (deterministic DSP) and **exactly ONE invocation of the user-selected audio-capable AI model**, which must both listen to the actual audio and receive Essentia's evidence. That **same single model invocation** must generate the **complete final Song Analyzer result**, compatible with the existing results UI and `Send to AI Generator` workflow. **NO hidden Gemini 3.8 Flash intermediate synthesis; NO Gemini Stage A verifier; NO independent Final Judge; NO AI research or reconciliation; NO additional AI calls; NO fallback to another AI model.** If the selected audio model happens to be Gemini, that is permissible as the *single selected model*.
- Version 2 keeps **all existing user-visible final result fields** where supported by available evidence, with appropriate uncertainty; do not pretend missing evidence was heard. Do not merely dump Stage A debug evidence as the final product.
- `Send to AI Generator` must populate the supported generator fields from V2 results while **NOT overwriting Theme/Core Idea or the generator's existing selected Language**. Do not infer language from the original audio for handoff. Preserve user choice.
- No extra admin gate is needed because the entire Analyzer is already admin-only, but retain and test existing server-side authorization on *each* path, including a new server endpoint.

The goal is an **honest experimental comparison**, not necessarily an assertion that Version 2 is better. Same actual MP3, same chosen audio model, same result shape, visibly labeled version and provenance.

## 1. First inspect reality before editing

Check current `main`/HEAD and existing branches/PRs; do not rely on stale snippets or silently overwrite concurrent work. Read all implicated files and their imports/types/tests, especially:

- `src/routes/song-analyzer.tsx`
- `src/lib/song-analyzer-background.ts`
- `src/lib/song-analyzer.functions.ts`
- `src/lib/song-analyzer-enhanced.functions.ts`, `src/lib/song-analyzer-enhanced-job.functions.ts`
- `src/lib/song-analyzer-essentia*` and `src/lib/song-analyzer-dsp*` (discover actual paths)
- `src/lib/song-analyzer-stage-a-guard.functions.ts`
- `src/lib/song-analyzer-final.functions.ts`
- `src/lib/ai-auxiliary-idempotency.server.ts`
- `src/lib/auxiliary-request-key.ts`
- `src/lib/ai-usage.server.ts`, `src/lib/ai-admission.server.ts`, `src/lib/ai-finalization.server.ts`
- `src/i18n/locales/en-song-analyzer.ts`, `src/i18n/locales/el-song-analyzer.ts`
- Source of `ANALYZER_HANDOFF_KEY` and its consumer in Advanced AI Generator
- Shared `songAnalysisResultSchema`, `StageAEvidence`, `Stage0DspEvidence`, supported audio model catalog/capabilities and API adapters.

**Previously inspected code behavior (verify against current HEAD):**

1. `song-analyzer-background.ts` currently computes legacy DSP, then Essentia, calls `analyzeSong()` with a durable auxiliary request key, then `guardSongAnalyzerStageA()`, then `finalizeSongAnalysis()`.
2. `song-analyzer.functions.ts` invokes `generateAudioEvidence()` at `evidence_extraction`, then performs an extra `generateFinalFromEvidence()` using `gemini-3.8-flash` when selected audio provider is not Gemini; even if selected provider *is* Gemini, an extra synthesis call to that model is made. Optional external validation may also occur.
3. `song-analyzer-stage-a-guard.functions.ts` may invoke an independent Gemini audio verifier.
4. `song-analyzer-final.functions.ts` invokes another chosen final model and may invoke regional research when title + artist are supplied.
5. The UI's `sendToGenerator` writes `result.generatorReady` to `sessionStorage` under `ANALYZER_HANDOFF_KEY`.
6. `parseStructured` uses `JSON.parse` and can throw `Analyzer evidence_extraction returned invalid JSON`; durable claim can throw `This AI request is already processing...`.

These are inspection leads, not permission to bypass accounting, safety, or existing behavior.

## 2. Recommended design: explicit server-authoritative version routing

Make `version` a validated explicit discriminant (`'v1' | 'v2'`) in the UI/background and server request contract. Default to **v1** to preserve production. Version selection is not merely client-side hiding of dropdowns.

For **v1**, retain the original execution pipeline and its semantics, response, model selection, access gates, usage records, reporting and handoff.

For **v2**, branch **before** the existing multi-AI `analyzeSong()` pipeline or inside a deliberately separated server handler so that no legacy hidden AI step can be reached. Do not call `analyzeSong()` as-is and then skip the Final Judge: it already calls intermediate Gemini. Design a dedicated V2 endpoint / branch that does exactly:

```
Uploaded MP3/WAV → existing validated file constraints
                  → deterministic Essentia Stage 0
                  → one selected audio AI request
                       inputs = actual audio + bounded, relevant Essentia evidence
                       output = complete validated SongAnalysisResult JSON
                  → safe deterministic validation / presentation
                  → same final result UI & Send to Generator handoff
```

Legacy DSP comparison may remain in **diagnostic display only** if already run locally; it must NOT silently replace Essentia as authoritative V2 input. Prefer only Essentia measurements in V2 AI request. No AI verification, research, classification reconciliation or rewriting afterward. Deterministic schema validation and transparent non-generative field mapping are permitted.

The selected audio AI must generate `generatorReady` and the full detailed result expected by existing `songAnalysisResultSchema`. Identify actual types and nested constraints before composing a model-specific structured prompt. The model must see real audio plus bounded Essentia: primary BPM, alternatives/ambiguity/confidence, key/scale/confidence, rhythm, energy/sections and uncertainty. Avoid shipping huge beat timestamp arrays or redundant debug evidence that will inflate cost/context. If the result mentions a particular source, instrument, subgenre, BPM or production effect, it must be grounded in audible evidence or qualified as uncertain. Do not treat original Suno input style as evidence.

**Critical contract:** One AI provider dispatch attempt per V2 analysis. If the provider's response is truncated/invalid, do not silently call a repair model, retry the same model, or use Gemini. Clear actionable error + safe accounting. A user-initiated new request is a distinct operation governed by normal admission limits.

## 3. Structured JSON & model compatibility

- Check the **real, current** provider catalog and endpoint behavior for each currently selectable audio-capable model (OpenAI/Gemini/OpenRouter/NVIDIA via OpenRouter as applicable). Do not assume all models accept `response_format: json_schema` or the same content-part format. Preserve true audio modality (do not send only transcripts). Do not add fake support for providers that cannot meet the one-call full-result contract.
- Support native structured JSON schema if actually available; otherwise use a strict contract, validate response locally, and classify failures. If a provider cannot consistently return valid full output within a bounded response, flag as **Version 2 incompatible** with an informative message or disabled option rather than silently routing to Gemini.
- Distinguish empty, invalid JSON, schema-invalid, incomplete/truncated (`finish_reason`), transport/timeout, provider rejection, unsupported audio format, auth/credit and token/output limit failures. Never mislabel one as another.
- Enforce output budget suitable for the full final report; do not let a too-low cap generate false failures. Adjust per provider documented constraints without inventing max token values.
- No synthetic facts, invented instrument identities, or overconfident tempo. Preserve half-/double-time ambiguity when supported by Essentia and audible evidence.
- Avoid logging full user audio/base64, full provider responses, auth headers, keys, or private user content. Limited sanitized diagnostic metadata only.
- Version 2 output should include provenance metadata (`version`, selected provider/model, Essentia engine and stage completion, usage when available); keep legacy persisted formats compatible. If persistence changes, use a backward-compatible migration and explain why.

## 4. Idempotency, usage, timeout, cancellation and costs

- Ensure durable AI admission and idempotency for the V2 logical request; mark provider started at the correct point, record exactly one provider usage outcome, finalize success/failure atomically where feasible, and prevent double charging on repeat clicks/poll/reload.
- Investigate exact reuse/reset semantics of `getAuxiliaryRequestKey('song_analyzer')` and `completeAuxiliaryRequest(...)`; **do not** blindly delete DB records or reclaim claims after the provider might have started.
- Respect current maximum upload size/type constraints; use streaming/storage where current architecture requires. Don't move keys to client code.
- No retries that could cause a second billable call; no external web research. No extra AI verifier even on failure.
- Existing V1 must remain behaviorally and financially unaffected.
- If V2 needs larger output and costs more than one ordinary Stage A call, surface that honestly in reporting and keep usage tracking correct.

## 5. UX, translations and exact handoff semantics

At top of existing admin-only Analyzer:

- Two-state segmented control: **Version 1** / **Version 2**, consistent with existing dark/neon look, mobile responsiveness and accessible keyboard/focus behavior. Keep current layout/labels/results cards and utilities.
- When V1 chosen: current Audio Analysis Model + Final Analysis Model dropdowns stay as before.
- When V2 chosen: show Audio Analysis Model dropdown; hide Final Analysis Model dropdown; show short text: "Essentia + selected Audio AI · one AI call · no final judge" (localized Greek/English).
- Changing versions should not unintentionally reuse an unrelated completed result, request key, or selected provider. Handle background task in progress safely: disable version switch while running or offer an explicit, safe cancellation interaction (never falsely claim cancellation of an in-flight provider request).
- Result title and provenance must correctly identify V2 and the selected audio model, not claim that GPT/Gemini Final Judge authored it. Keep Stage 0 and any honest raw evidence diagnostics visible where useful; label data origin accurately.
- Preserve Save/Library flow, copying, export, result details, and existing friendly error handling. Version metadata for saved analyses should remain distinguishable when possible without breaking old records.
- `Send to AI Generator` uses the existing handoff contract rather than a novel bypass. Fill all supported downstream musical fields (genre/style, mood, tempo, structure, instrument/production details, additional instructions and any supported Blueprint inputs). Do **not** overwrite Theme/Core Idea. Do **not** overwrite generator Language (user-selected or default). Prevent propagation of empty/unverified values; preserve all other intended user selections where practical. Test both fresh and already-filled Generator states, plus existing V1 handoff.

## 6. Required verification — must be actual tests, not screenshots only

Write targeted automated tests for:

1. V1 exact routing and no change in its existing multi-stage path.
2. V2 uses Essentia evidence + actual audio and sends only **one** provider call.
3. V2 with Gemini selected still sends **one** Gemini call, not two.
4. V2 with a non-Gemini model NEVER invokes Gemini (synthesis, guards, research, or Final Judge).
5. V2 returns the exact complete existing output schema, including `generatorReady`, with correct provenance.
6. Bad/empty/truncated/schema-invalid response does not trigger retries/fallback, correctly records usage and leaves UI in recoverable state.
7. Replay / duplicate request does not produce a second billable call; requestKey lifecycle and provider-start boundary are correct.
8. Mode switch while active is safe; old result and new result cannot be conflated.
9. V1 and V2 use existing server-side admin feature access; no unauthorized access to new V2 endpoint.
10. `Send to AI Generator` transfers eligible musical fields, preserving **Theme and Language exactly**.
11. Multiple file MIME types & upload-size caps handled consistently with model-specific audio acceptance.
12. JSON reliability and provider contracts using **offline mocked** OpenAI/Gemini/OpenRouter responses; no live paid tests are required for CI.

Perform full existing tests, TypeScript, lint, build and mandatory CI. Fix failures with minimal scoped changes. Review for dead paths, hidden AI dispatches and secret leaks. Use test doubles to count provider calls; assertions must fail if any additional call is made.

## 7. GitHub / delivery instructions

- Work on a **new branch from the current correct base**; inspect latest HEAD. Avoid touching V3 song-generation PRs #374–#377 or unrelated features.
- Make minimal, well-scoped changes; maintain backwards compatibility. Prefer a Draft PR with clear summary, changed-file list, migration notes, tests, CI evidence and known provider limitations.
- Do **not** merge, publish, deploy, modify production secrets, perform paid API calls, or run risky production database writes without explicit authorization. Read-only inspection of project configuration is allowed; ask if a true external blocker remains.
- If any selected model cannot satisfy the strict single-call full-report contract, explain exact reasons and safe UX compatibility handling. Do not silently weaken the requirement.
- Finish the implementation to a technical merge-ready state where possible; report concrete blockers and evidence, not speculative status.

## 8. Acceptance criteria

A successful delivery lets an Admin open the Analyzer, choose **Version 2**, select an audio-capable model, upload the *same* MP3 as V1, and obtain a comprehensive familiar Analyzer report built from **Essentia + exactly one chosen audio model call only**, with truthful provenance, no hidden Gemini, and a functional **Send to AI Generator** that leaves **Theme and Language unchanged**. Version 1 remains fully operational. All guards, accounting, compatibility, UI and tests are preserved.

**Do not stop after drafting architecture. Implement, verify, fix and deliver the Draft PR.**
