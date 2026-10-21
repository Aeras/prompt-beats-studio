# V3 rhyme benchmark — controlled, no-charge-first implementation contract

**Status:** implementation handoff. This file is a specification, not a claim that paid generations have started.

## Inputs and source of truth

- Parent branch: `experiment/v3-natural-rhyme-candidates-20261021` (PR #374); keep it draft.
- Use the **real** `buildPrompt` from `src/lib/ai.functions.ts`, `buildAdvancedGeneratorPromptV2`, `withV3MusicalPlanning`, original `SYSTEM_PROMPT` and existing song JSON schema/validation. Do not invent or shorten a proxy prompt.
- Compare `current` (= current MAIN V3 block, before PR #374), `a`, and `a+b`. Critically, current cannot mean the PR branch's default A+B.
- Model: app label `gpt-5.6-luna`. Resolve the **actual provider model ID, schema, reasoning effort, max token behavior and pricing** from the effective installed registry/real provider adapter, not by assuming that the UI label is an API model ID. If actual model identity/pricing cannot be validated, block paid execution.
- OpenAI only, no Gemini/xAI calls.
- 3 immutable Russian briefs × 3 prompt arms × 2 runs = **18 total completed generations**; ensure one distinct call per unit (no automatic paid retry). Start with one pilot call counted within 18.
- Designed briefs: (i) melodic pop with natural audible chorus end rhyme but no fixed scheme, (ii) melodic ballad with explicit ABAB and required natural Russian stress, (iii) Russian pop with conversational verses and hook, no required story arc. Keep precisely identical brief and provider settings for arms, no model-driven inputs.
- Blind analysis IDs; store rendered lyrics, structured JSON, full hashes of prompts rather than credentials, token usage, per-request estimated dollars, duration, finish status, model/provider, generation timestamp, brief/candidate/run.
- Avoid placing generated copyrighted/sensitive lyrics or secrets in commits/CI artifacts by default. Save locally to ignored output location; anonymize where possible.

## Cost policy — user authorization is budget intent, not permission for unconstrained requests

- Account balance user-reported `$4.11`, total experimental spend budget `$3.00` **maximum target**, retain `$1.11`; do not claim provider-enforced hard ceiling.
- Paid mode must require explicit `--live`, plus `--confirm-spend-usd 3.00`; dry-run default and never needs an API key. Refuse CI live mode.
- Preflight confirm API key available in execution environment (never print/store it); verify actual model registry and reliable price rates (including reasoning/output tokens and caching), provider output cap and server schema support.
- Reserve pessimistic per-call estimated upper exposure **before** every call; if cost unknown or theoretical charge can exceed remaining allowance, STOP. Track actual usage including reasoning tokens, conservatively estimate cached/uncached categories and unknown usage; if usage absent STOP.
- No unbounded automatic retries, no parallel paid calls, no QC/secondary reviewer calls. Abort on parse/schema/stop-reason failure and report rather than silently reissue.
- Document caveat that late metering and billing variations mean local budget guards cannot guarantee financial cap.

## Implementation requirements

1. Isolated developer-only script/CLI + fixtures/tests in this branch; never add buttons, app routes, DB tables, migrations, secrets or production deployment. No production data mutations.
2. Build genuine V2/V3 prompt assembly preserving blueprints and section instructions; baseline uses the exact original main-branch V3 prompt, not V2 and not current PR variant. Assert V2 prefix identity for all arms.
3. Use existing OpenAI-compatible app provider contract where practical, same effective schema (title/tags/lyrics/note), actual model ID and reasoning effort as normal Generator. If extracting pure builders, use real code and tested pure-function strategy from `advanced-generator-v3-review.test.ts`; do not import privileged server runtime into CLI just for convenience.
4. Demonstrate **offline dry-run** that builds/validates all 18 combinations, hashes prompts, reports estimated upper bound and never makes network requests, with direct unit test proving zero provider calls.
5. Test controlled simulated API replies, over-budget stop, unknown-price stop, missing-usage stop, invalid schema, invalid JSON, timeout/error, resume idempotency (if supported), duplicate prevention, and secrets not leaking to output. Maintain deterministic fixtures.
6. Run relevant bun tests, lint, typecheck, build; publish execution instructions and output format. Update PR description with what was actually checked.
7. In live mode, stop after FIRST paid pilot and return actual recorded tokens/estimated spend for owner assessment **before** executing the remaining 17; do not auto-run all 18 until user explicitly authorizes continuation after actual pilot verification. Provide dry-run first. Existing user budget consent does not override the pilot gate.

## Done criteria

- Reviewable draft PR based on #374 branch only, no merge/deploy.
- Dry-run and tests confirmed, costs remain $0 during implementation.
- Accurate command(s) for secure execution in environment already holding OPENAI_API_KEY, without requiring key to be shared in chat.
- Real provider call not run until executable environment, model/pricing proof, dry-run evidence, and user authorization for live pilot are present.
