# PB-014 — Adaptive Multilingual Music Research (implementation contract)

Status: IN_PROGRESS — architecture agreed; runtime changes NOT yet implemented.

## Goal
Replace the current five hard-coded English/Russian Tavily topics with a two-stage AI workflow:
**GPT-6 Luna via OpenRouter (fixed internal planner) → bounded Tavily search → creator-selected synthesis model**.
No user or Super Admin planner-model picker in V1; centralize server configuration for later changes. The planner and final synthesis are distinct billable executions with real, independently recorded usage.

## Inputs / behavior
Support artist, artist+song, and arbitrary free-form descriptions including mixed artist influences, e.g. a new rock ballad with fingerstyle guitar inspired by Scorpions and Metallica. Distinguish reference artists from the intended original song and avoid treating style references as factual claims about individual recordings. Determine likely languages of authoritative sources from the specific subject and context, never hard-code Russian or assert language solely from script/nationality. Always include English where substantively useful, but do not mandate a pointless second language. Preserve original names/script and useful aliases. If no identity can be resolved, qualify rather than fabricate.

## Coverage contract
The planner must cover eight topics across the total search plan, not necessarily one query per topic: (1) genres/influences/era; (2) instruments/performance techniques; (3) tempo/meter/groove; (4) harmony/melody; (5) vocal approach; (6) song structure/arrangement; (7) production/mix/effects; (8) source provenance/credits/interviews. Mark topics as unverified where evidence is absent. Search queries are concise, language-native and targeted, not full instructional prompts; preserve the intent and priorities of the user. Planner returns strictly validated structured JSON: request identity, referenced entities, selected source languages, bounded queries with topic tags and reasons, ambiguity markers.

## Budget and safeguards
Keep **Standard 2 Tavily basic searches** and **Extended 5 Tavily basic searches**, max three results each, unless separately justified. A Tavily search is not automatically a credit; measure provider-reported usage. Never equate topic count with search-call count. Planner invokes one small bounded GPT-6 Luna OpenRouter call per eligible job; model/provider ID MUST be verified against live installed model registry and actual provider routing before implementation; fail safely if unavailable instead of silently substituting another paid model. Execute no extra AI search/refinement calls or automatic retries on unknown outcomes. Final synthesis remains selected user model and original source/provenance checks. Keep no-sources failure and no invented facts.

## Durable execution requirements
The existing job runner currently reserves/settles one synthesis dispatch. Introducing the planner requires independent durable stages, idempotency keys, per-stage checkpoints, reservation/settlement, recorded observed/unknown provider usage and safe recovery on crash/timeout, preserving one logical user job. Never replay a possibly billed but unacknowledged dispatch. Validate owner, feature entitlement, generator model and planner availability before charges. Cost estimate must account for planner + actual Tavily usage + synthesis, with bounded budget; no double billing. No auth/RLS weakening, no unsafe dynamic URLs or source-injection execution. Any necessary SQL migration must be reviewed/replay-tested and require production approval separately. No live paid calls during automated tests.

## Acceptance
Representative Greek/Russian/Albanian/Turkish/French, English, German and mixed-language/mixed-artist scenarios; free descriptions and ambiguous homonyms; locale-specific and English queries where useful; exact coverage across 2/5 calls; invalid planner JSON; unsupported installed planner model; revoked entitlement; unknown/duplicate planner dispatch, search checkpoint and synthesis recovery; cost attribution and quotas; bounded quote provenance and safe citations; stable existing Generator UI and PB-013 apply. Focused unit + integration + browser checks, full Bun, typecheck, lint, build, exact-HEAD Regression/Browser Quality/Database Replay green. Same PR for all changes; do not merge or publish without authorized release and production verification.

## Verified baseline
29 Oct 2026: PB-013 #464 is GitHub MERGED (merge commit 81ad262b3c545925880a03553c51cf03dec8f0dc); this does not verify Lovable publish. `src/lib/music-inspiration-research.server.ts` still builds fixed 2/5 English/Russian queries. `src/lib/music-inspiration-jobs.server.ts` has a single synthesis model caller and dispatch usage record; adding another paid model execution is not a prompt-only modification. GPT-6 Luna OpenRouter installed provider ID remains to verify live before use.
