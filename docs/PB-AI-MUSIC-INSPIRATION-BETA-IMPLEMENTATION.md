# AI Music Inspiration Beta — Implementation contract and Codex remainder

Branch: `feature/ai-music-inspiration-beta`. Draft PR #451.
Baseline main at creation: `fdf34b2e601dc90d4fbdaf1a3192ff948f09f698`.
Atlas #450 paused at `5f4be56794f38b318109ee7623ce5c055acc69cd`, **do not depend on its unmerged data/code**.
Always read current AGENTS.md, docs/WORK-STATUS.md, inspect open PRs and current HEAD before changes.

## Decisions confirmed with owner

- Surface "Μουσική Έμπνευση / AI Music Inspiration" in Advanced AI Generator. Mode A: artist/group (required) and song (optional); mode B: free text description. Submit "Έρευνα".
- Atlas FIRST, only actually approved and executable existing mainline facts, then web evidence discovery. Do not mistake V4 research-only, source-link presence or auto hypotheses for editorial certification. Treat untrusted source text as data.
- Deep, precise targeted searches, source-by-source accessible passage/score/credit checks, provenance, contradictory claims and confidence; never invent equipment/tempo/tonality/score, never equate search snippet with evidence.
- Depth standard/extended; extended initially Super Admin only. Use actual web search provider/retrieval pipeline, independent of text model provider; bounded queries/results/credits and hard cost budgets.
- Research model is *server-resolved live Generator default* for non-admins, not hard-coded `DEFAULT_AI_MODEL`; Super Admin may select from *currently installed, enabled, permitted* models, server-authorized. Confirm current registry/admission semantics. Admin selection does not override quota or model entitlements.
- After success show "Έρευνα ολοκληρώθηκε" with **Εφαρμογή** and **Προεπισκόπηση**. Direct apply acts without mandatory preview; preview shows evidence sources, supported/bounded/uncertain tags, creative decisions, field selection, source links, consequences.
- Apply only editable music-related fields (styles, moods, instruments, BPM, production, structure, Blueprint with section energy, additional instructions); never theme, song language/variant/custom language, target platform, preset IDs, or user identity. Default fill blanks; explicit selection/confirm to overwrite conflicts. Preserve manual work and support reversal of a previously applied layer without deleting subsequent manual edits.
- Saved profiles are private, account-global persistent with top-of-Generator dropdown. Save, select, rename, update, delete, reuse without fresh paid research. Store research evidence and creative proposal separately, prompt/schema version, sources, timestamps, creation model, revision. No automatic promotion to Atlas.
- Whole feature Beta, default admins/beta users via existing feature-access policy, later owner may choose everyone/selected/admin only on Stable. **Never publish/activate without explicit approval.** No audio file analysis or external audio downloads.
- UI responsive and accessible EL/EN, clear cost/failed/partial/cancel states, sources not pasted as HTML, avoid copying specific copyrighted melodies/lyrics. The product generates new original songs, not replicas.

## Completed by ChatGPT in this PR

- `src/lib/music-inspiration.shared.ts` — strict Zod schemas for request, evidence/source, Generator proposal with Blueprint/Energy identity validation, versioned non-executable backend research prompt.
- `src/lib/music-inspiration.shared.test.ts` — basic unit/negative tests for source references, supporting evidence, section identity, protected fields.
- `docs/WORK-STATUS.md` ledger entry.
These components are foundational only; **no live functionality** and no local execution claimed.

## Codex remainder: one cohesive PR, investigate before changing

1. Audit full existing Generator state composition and ownership; model registry/auth/feature-access; live Atlas RC1 reader/handoff; latest app database migrations/RLS; server/provider billing/error and async jobs; saved-project APIs. Identify exact extension points rather than guessing.
2. Reconcile research contracts with production limits and serializable job payloads. Harden source validation against duplicate IDs, unsupported URLs/unsafe redirects/SSRF, evidence/source scope and referenced claims, source-trust boundaries. Validate evidence assertions against retrieved bytes wherever feasible. Add deterministic versioned result and full negative fixtures.
3. Add dedicated Beta feature registry and additive registration migration, feature-permission checks in every server action and relevant SQL worker admission. Follow existing SQL/RLS conventions; stage migration as code only pending explicit production approval.
4. Implement server-side search/retrieval integration in phases: approved Atlas evidence lookup -> query planner -> bounded web source retrieval -> source review/de-duplication -> structured report -> proposal synthesis -> consistency pass. Web tool MUST exist and be configured; model text alone cannot browse. Scope permissions, token/query budgets, retries, cancellation, rate limits, idempotency, dedupe, provider failure and provenance.
5. Resolve live default AI Generator model server-side; Super Admin-only installed/entitled model override. Never trust client role or chosen model. Avoid exposing keys/prompts in browser.
6. Implement per-user private durable profiles and research jobs in Supabase with verified ownership/RLS, unique constraints, CRUD, concurrency revision/CAS, quota and lifecycle. User must be able to reuse profiles across devices. Safe backend limits on research credit/spend.
7. Implement Advanced UI research modal, mode switch, default model text/admin selector, standard/extended policy, active/complete/partial/error states, two result buttons, evidence preview with field selection and safe source link handling. Profile dropdown at top of Advanced, save/rename/delete and apply. All actions accessible with narrow mobile screens.
8. Apply projection via existing `advancedSetupSchema` and `songBlueprintSectionSchema`: preserve theme/language/target/etc, avoid silently clobbering manual data, respect limits, use server-vetted result provenance and privilege. Provide undo without reverting new edits, deterministic import/export interactions, preserve generated section IDs/occurrence and Energy 1-5; don't trigger generation merely on apply.
9. Add tests for denied features, role/model spoof, expired/foreign jobs, unsafe URLs, malicious retrieved instructions, empty evidence, unsupported claims, free-description ambiguity, all 3 test archetypes Mirage/Ласковый май/Кино using offline fixtures only, reruns, dedupe, save/edit/delete across accounts, clashes with manual fields, Blueprint/energy repeat, failures, budget/cancellation/retries.
10. Run focused + full tests, TS, lint/format/build and three mandated CI gates on exact final HEAD, fix within #451. Update ledger and document operational migration/deploy/rollback and provider key setup, no production deployment without owner's approval.

## Completion gate

Feature remains Draft / IN_PROGRESS until full verified end-to-end Beta feature is code complete, release boundaries met, and owner approves appropriate rollout. Mainline Atlas V4 remains untouched. Do not close PR or claim deployment on merge alone.
