# PromptBeats — Work Status (authoritative workflow ledger)

## 2026-10-29 — PB-014 Adaptive Multilingual Music Research — CODE_COMPLETE_RELEASE_PENDING

- **Verified baseline / ownership:** existing Draft [PR #465](https://github.com/Aeras/prompt-beats-studio/pull/465), branch `feature/pb-014-adaptive-multilingual-research`, initial HEAD `b53ba7b2018ac2ebe2f72abb424f0ae8309ab99b`, current main / merged #464 `81ad262b3c545925880a03553c51cf03dec8f0dc`. Read root contract, specification and full research/admission/jobs/accounting/registry/RLS/Generator paths. Atlas #450 remains separate and paused.
- **Planner identity evidence:** read-only production registry confirms enabled installed `openrouter` / `openai/gpt-6-luna`, registry ID `282c9ca4-26e8-4bf3-9e1e-441554f680d1`, Generator-compatible/enabled, existing `selected_users` policy. Exact server identity and existing account permission required, no fallback/UI planner selection/permission expansion. Provider adapter routing is explicitly OpenRouter; no paid compatibility claim.
- **Implemented:** strict request-bound entity/reference/intent/alias/source-language/ambiguity plan; exactly 2 Standard or 5 Extended unique bounded native-language Tavily basic queries, three results each, collectively covering eight music/source topics. One bounded planner call followed by creator-selected synthesis, unchanged final schema/canonical provenance and PB-013 Apply. Safe unavailable-planner message preserves owned saved-profile reuse; EL/EN stage diagnostics and independently displayed planner usage/cost. Planner-only opt-in JSON-object output uses the verified structured-output capability; actual-adapter tests preserve other callers.
- **Durable safety / migration:** new `20261029084909_pb_014_adaptive_multilingual_research.sql` adds versioned job identity, separate planner execution/pricing/raw receipt, immutable plan, service-only admission/claim/checkpoint RPCs and unique stage reservation. Old worker cannot claim version-2 jobs; old jobs retain original protocol/queries and are not backfilled. Usage/raw evidence survives cancellation, record/settlement/checkpoint acknowledgement loss and recovery. Unknown outcomes never cause automatic redispatch; expired windows reconcile saved evidence but prohibit new paid work. Global AI switch, owner/RLS/model grants, CAS and original financial history are preserved. No monetary cap, price-age requirement or tariff change is introduced.
- **Actual local evidence:** 71 focused planner/worker/admission/accounting/legacy tests PASS; transactional new SQL/RLS and existing Inspiration/observed-usage SQL PASS in a dedicated network-isolated Supabase PostgreSQL 17.11 container. Real independent-connection duplicate admission/claim/reservation, uninstall fence, cancellation/receipt both orders and capped-recovery races PASS. **45 offline Playwright PASS** across desktop/tablet/mobile includes PB-013 compatibility, Greek accounting, no planner picker and unavailable-planner saved-profile reuse. Final full Bun **1,356 PASS / 0 FAIL / 13,465 assertions / 183 files**, frozen install, strict types, scoped lint/format, production build and 12 native offline workerd cases PASS; exact-final-HEAD Regression / Browser Quality / Database Replay evidence is consolidated in PR #465 before technical readiness; earlier-head results never substitute.
- **Release / limits:** not CLOSED and no merge/production migration/publish/paid request. Requires independently reviewed migration-first then compatible Lovable publish, actual production preflight/recovery and separately approved tiny quality/cost pilot. Existing selected-users planner grants must be checked for intended Beta testers; no access was broadened. Metadata coverage/mocked multilingual plans do not certify live linguistic/musicological quality. Unknown provider bills remain unknown, and call/token/time bounds are not a verified monetary invoice. [Architecture, evidence and exact release/rollback plan](PB-014-ADAPTIVE-MULTILINGUAL-RESEARCH.md).


## 2026-10-29 — PB-013 Music Inspiration inline workspace and Smart Apply — CODE_COMPLETE_RELEASE_PENDING

- **Scope / verified baseline:** existing Draft [PR #464](https://github.com/Aeras/prompt-beats-studio/pull/464), branch `feature/pb-013-inline-music-inspiration-smart-apply`, main `c09e9779ce7b72e9d567d381197b70b81b686b9c`. Read Product/UX/Engineering/Red Team/Executive handoffs and traced Generator, shared contracts, authenticated jobs/profiles, SQL/RLS, owner/CAS, provenance/accounting/recovery and tests. Final owner contract governs: primary Fill-empty; preview defaults Keep with explicit Add/Replace. Preserve #463 solved entitlement/layout protections and Atlas #450 pause.
- **Implemented:** single inline/collapsible PromptBeats-styled workspace; setup, status, result, preview and evidence share page flow; collapsed status/recovery/Undo remain accessible. One authoritative seven-group planner controls current/proposed/next values, Fill/Add/Replace, exact no-op/destructive counts, blocked length/opposition, atomic Arrangement/Blueprint/Energy and selective receipts. No Add for BPM/Arrangement, silent truncation, semantic rewriting, automatic apply or generation. Live oversized drafts remain editable without crashing preview. Scoped token scrollbars, custom dropdowns, EL/EN, focus/contrast/accessibility.
- **Safety:** trusted source server re-read followed by latest Generator frame, exact comparison and synchronous guarded mutation without an await gap. Synchronous group edit epochs catch batched ABA and preserve manual edits on Undo. Only actually changed groups receive setters. Separate active job/display source/selected revision fixes hidden Job B → Profile A update; Save/Update bind displayed completed job, Rename stays metadata-only. Existing server owner/entitlement/RLS/profile CAS, dispatch idempotency, accounting and unknown recovery unchanged. No migration, provider/pricing edits or production mutations.
- **Local evidence:** frozen Bun install, strict TypeScript, scoped ESLint (zero errors; four pre-existing freshSession hook warnings), production build and 12 native offline workerd cases PASS. Planner/Undo **25 PASS / 106 assertions**. Full Bun **1,318 PASS / 0 FAIL / 13,129 assertions / 180 files** in isolated LF-equivalent source, matching CI; no unrelated CRLF assertions weakened. **27 PASS** focused desktop/tablet/mobile browser checks include delayed confirmation, hidden job/profile, Add/no-op/Undo, source revocation, account switch, inert prompt-like text, atomic groups, long multilingual content and live draft limits. Final-source mobile rerun **17 PASS** includes all six viewport sizes, keyboard, selective/ABA Undo and all eight PB-013 adversarial cases. All three exact-final-HEAD gates are recorded in PR #464 before readiness; do not infer success from earlier SHA.
- **Review / release:** #464 subsequently merged by owner authorization at `81ad262b3c545925880a03553c51cf03dec8f0dc`; earlier Draft/no-merge notes describe the implementation checkpoint. Exact implementation SHA and green gate links are in #464. Production publish/runtime acceptance remain unverified; code-only Lovable release and authorized production acceptance remain before CLOSED. Semantic conflict/deduplication is conservative, not exhaustive musicological equivalence. Playwright emulates touch/keyboard geometry, not physical Android hardware. [Architecture, tests, limits and release/recovery](PB-013-MUSIC-INSPIRATION-WORKSPACE.md).


## 2026-10-28 — Music Inspiration entitlement invisibility + actual Generator stacking — IN_PROGRESS

- **New evidence:** Desktop screenshots show Music Inspiration as an oversized left column and the Generator squeezed right, even for a denied ordinary account. Current main `src/routes/generate.tsx` already has a centered `flex-col max-w-3xl`; the screenshot does not match those source classes, suggesting a deployed bundle/style mismatch which has not yet been independently measured live. Do not claim source-only changes prove deployed resolution.
- **Confirmed code bug:** `MusicInspirationPanel.tsx` rendered the explicit denied/loading text as a component when feature entitlement was false. Change this to render nothing, preserving backend access checks and without invoking research/config/profile calls for denied accounts.
- **Layout hardening/acceptance:** Give Generator workspace a stable test marker and explicit full-width/min-width children. Add browser checks verifying true bounding rectangles: inspiration above Generator, aligned horizontal edges, centered maximum 768px workspace, no horizontal overflow on desktop/tablet/mobile. Denied user must have no Music Inspiration text, control or panel while Generator remains.
- **Release:** Require exact HEAD Regression, Browser Quality, Database Replay PASS and focused browser test; merge only after verified gates. Lovable publish and live screenshot acceptance remain separate. No migrations, provider calls, or live data mutation.
- **Reproduced defect:** GitHub Playwright report on head c85ecab7 contains actual screenshots of side-by-side Inspiration and Generator on desktop/tablet/mobile; DOM geometry assertion failed (Inspiration bottom 240px vs Generator top 86px), despite CSS `flex-col`. This disproves the earlier theory of a deployed-version-only mismatch. Enforce explicit inline `display:flex; flex-direction:column` on the shared wrapper and keep quantitative browser assertions unchanged. No merge until this evidence passes.


## 2026-10-28 — Music Inspiration proposal consistency and trusted source metadata — CODE_COMPLETE_RELEASE_PENDING

- **Baseline / confirmed evidence:** main 077a03f0ff556fc86361ae608407c831e726b7d9, #461 merged. Read-only production inspection of the reported failed job and full offline replay prove decorated section labels disagree with bare Blueprint labels. The same stored response also changes retriever-owned titles/locators and one timestamp; source IDs, URLs, hashes, receipt identity and exact quotes match. No provider/model outage is inferred. Atlas #450 remains paused/untouched.
- **Implementation / acceptance:** branch codex/inspiration-blueprint-consistency. Explicit relational prompt instructions; conservative exact annotated-label reconciliation preserving complete labels/instructions/energy/order and raw receipt; unchanged strict schema rejects genuine conflicts. Canonical source metadata hydration only after complete matching identity proof; strict provenance, inaccessible/unknown source and quotation guards remain. Safe allowlisted nested diagnostics. No fresh provider call, tariff edit, production record mutation, migration or new automatic retry.
- **Verified results:** full actual saved response passes the synthesis/provenance path offline with zero external calls. Focused tests 60 PASS / 0 FAIL; full Bun **1305 PASS / 0 FAIL / 13083 assertions / 180 files** in an isolated LF-equivalent snapshot. Frozen install, strict TypeScript, scoped ESLint/Prettier, production build and 12 native Cloudflare runtime cases PASS. Exact-final-HEAD Regression / Browser Quality / Database Replay evidence are maintained in the associated PR before readiness.
- **CI fixture correction:** initial CI exposed a new recovery fixture selecting the first of two same-ID retrievals with different timestamps. A forced-timestamp local reproduction failed before correction; selecting the same last canonical retrieval as production passes with all original assertions. No product/security behavior changed. Final-head gates supersede the earlier failed run.
- **Cost / release / remaining:** observed cache-write tokens with a null administrator cache-write tariff correctly leave the independent total estimate unavailable; provider-reported amount is separate. No invented rate or zero-cost assumption. Separately authorized merge/publish and production acceptance remain; no migration required. The historical job is not rewritten: controlled no-dispatch recovery of its verified saved result requires explicit production authorization. [Root causes, invariants, offline evidence and release plan](PB-MUSIC-INSPIRATION-RESULT-CONSISTENCY.md).

## 2026-10-28 — Music Inspiration Tavily Cloudflare redirect compatibility — CODE_COMPLETE_RELEASE_PENDING

- **Baseline / confirmed cause:** main c2be8626c11fc611953c9303065e7805544d9480, #460 merged and owner-published. Its production diagnostic identifies search_request/network before AI dispatch. Native Cloudflare workerd independently reproduces the precise TypeError: redirect:error is unsupported before Request dispatch. Earlier mocked Bun fetch tests accepted that option. No evidence of invalid credentials or a model-parser failure is inferred.
- **Scoped implementation / acceptance:** branch codex/tavily-cloudflare-redirect-fix. Use redirect:manual with existing non-2xx response rejection/body cancellation; never follow redirects or forward the key. Five redirect-status regressions and an actual-adapter native-workerd suite with in-process fixtures and external network denied. Regression CI invokes the pinned runtime without changing application dependencies. No production SQL, secrets, settings, paid calls or Atlas #450 work.
- **Verification:** unchanged adapter FAIL reproduced under workerd 2026-10-12; corrected adapter **12 runtime cases PASS**. Focused Bun **43 PASS / 0 FAIL / 212 assertions**; full Bun **1,296 PASS / 0 FAIL / 12,928 assertions / 180 files** in an isolated LF-equivalent source snapshot. Frozen install, strict TypeScript, scoped ESLint/Prettier and production Cloudflare build PASS. Exact-head mandatory gates and links are recorded in the associated PR before readiness; do not substitute earlier-head results.
- **Release:** CODE_COMPLETE_RELEASE_PENDING; final review/CI are required before readiness, then separately authorized merge and compatible Lovable publish. No migration required. Live end-to-end success and any downstream provider behavior remain unverified until an authorized pilot. Existing unknown jobs/financial evidence are not rewritten or automatically retried. [Cause, offline procedure, release and recovery](PB-MUSIC-INSPIRATION-CLOUDFLARE-REDIRECT.md).

## 2026-10-28 — Music Inspiration stage-specific failure diagnosis — IN_PROGRESS

- **Baseline / evidence:** main 698d208784ef5fa6eb978afc73585edcd87c7f81, #458/#459 merged. After the authorized production migration, the actual research job reached one search reservation, then unknown with no stored search documents and no AI execution. The old catch collapsed HTTP/transport/parse/persistence exceptions into provider_outcome_unknown. Exact original Tavily cause is unproven; no speculative credential repair or paid request. Atlas #450 remains paused/untouched.
- **Implementation / acceptance:** branch codex/inspiration-stage-diagnostics, one focused PR. Bounded versioned diagnostics in existing error_code plus safe server logs and failed-search receipt; distinct Tavily request/HTTP/JSON/schema/persistence, AI dispatch/JSON/schema/evidence, usage/result persistence, admission/claim and recovery stages. HTTP and SQLSTATE/PostgREST codes preserved, raw bodies/messages/prompts/credentials/identity excluded. EL/EN UI exposes stage and job reference. Database-poll failures no longer masquerade as user cancellation; primary/secondary failures survive in safe logs. Existing owner cancellation of unknown jobs is exposed with billing/history warning, never automatic paid retry. No new SQL migration, financial cap, model/prompt change or security bypass.
- **Verification:** focused Bun **89 PASS / 0 FAIL / 847 assertions**; **15 PASS / 0 FAIL** focused Playwright diagnostics/recovery cases across desktop/tablet/mobile and EL/EN. Full Bun **1,291 PASS / 0 FAIL / 12,898 assertions / 180 files** in an isolated LF-equivalent source snapshot (unchanged Windows CRLF source assertions require LF, as in CI); frozen install, strict TypeScript, changed-source ESLint/Prettier, production build and diff integrity PASS. Exact-final-HEAD Regression / Browser Quality / Database Replay links and conclusions are maintained in this PR; earlier-head results do not substitute. Sensitive-marker, accounting, unknown/no-retry and database failure regressions included.
- **Release / remaining:** IN_PROGRESS for review and final CI, then separately approved compatible Lovable publish and real runtime evidence. No production publish/migration/record changes, secrets changes or paid APIs in this work. Original unknown job is not rewritten. [Acceptance, evidence limits, release and rollback](PB-AI-MUSIC-INSPIRATION-DIAGNOSTICS.md).

## 2026-10-28 — Generator desktop Inspiration vertical placement — IN_PROGRESS

- CI note: The PR description now contains the required sections. Rechecking with a new commit avoids using the previous event snapshot.

- **Reported UI defect:** Desktop screenshot displays Music Inspiration occupying a large left column and Advanced Generator cramped in a right column. User requires Inspiration above the Generator, with original centered Generator width intact.
- **Verified source and change:** In `src/routes/generate.tsx`, both sections were already siblings inside `mx-auto max-w-3xl` in current main, so screenshot layout may reflect a previously published version or an unverified styling/runtime difference. Make layout explicit with `flex w-full max-w-3xl min-w-0 flex-col gap-4` at the common wrapper. Retain Inspiration condition, apply callback, Generator contents, responsive dialogs and unchanged `max-w-3xl` width. No backend, DB or pricing changes.
- **Acceptance / release:** Verify stacked order and equal horizontal bounds at desktop/tablet/mobile in browser and absence of horizontal overflow. Require final-head Regression, Browser Quality and Database Replay PASS before merge. Lovable publish and verification against the screenshot's exact deployed URL remain separate; do not infer deployment from merge.

## 2026-10-28 — Music Inspiration owner-controlled tariffs and observed usage — IN_PROGRESS

- **Baseline / acceptance:** main 393a86537ccf3e2e580815340177266e5179d72c; merged #456/#457 UI preserved. Owner explicitly removes Inspiration monetary caps, daily spend/four-starts-per-hour admission and price-age/verification gates. Missing prices must not block research; actual usage and honest partial estimates are required. Atlas #450 remains untouched and paused.
- **Implementation:** Branch codex/inspiration-usage-without-spend-caps; [Draft PR #458](https://github.com/Aeras/prompt-beats-studio/pull/458), implementation commit 5bc7160739cb31581c904f3ffc470a1abc76bc3b (final documentation HEAD is reported in that PR). Forward migration 20261028152431_music_inspiration_observed_usage.sql; administrator tariff snapshot, service-only owner-scoped usage report, no financial admission/reservation cap, durable abandonment fence serializing against delayed starts. Editing a pending artist/model cannot silently reuse the previous form; a known admitted job is recovered without another paid call. Final review reproduced an already-completed lost-ack job losing its applicable result in both discard/edit recovery branches: both now restore the trusted result origin. Two new mobile tests failed before correction; all 15 related desktop/tablet/mobile tests pass after it. The initial targeted run also exposed a test timing race (asserting before asynchronous reconciliation finished); the same two-start/model assertions now await actual completion. A fresh epoch check prevents a delayed reconciliation from dispatching after account/feature/unmount changes. Terminal UI shows input/output/cache/reasoning, observed search credits and indicative total, with unknown components explicit and provider-reported amount separate.
- **Compatibility / safety:** Authentication, Beta/model authorization, global AI OFF, cancellation, durable leases, exactly-once accounting constraints, no-blind-provider-retry and research-shape/transport bounds retained. No prompts, models, subscription policies or other feature quotas changed. Historical evidence preserved; legacy budget_usd=1 is only an old-reader compatibility field, not a cap or displayed charge.
- **Evidence:** Focused Bun **71 PASS / 0 FAIL / 745 assertions**; full Bun **1,273 PASS / 0 FAIL / 12,796 assertions / 179 files** in an isolated Git source export with Linux-equivalent LF text endings (seven unchanged Windows source-string assertions depend on LF). Frozen installation, strict TypeScript, changed-source ESLint/Prettier, production build and diff integrity PASS. Fresh disposable migration replay, transactional SQL/RLS and independent-connection races PASS. Full Inspiration Playwright **105 PASS / 0 FAIL** across desktop/tablet/mobile, including six viewport sizes and visual keyboard geometry; subsequently **15 PASS / 0 FAIL** targeted recovery/usage cases cover the completed-result correction. Final CI runs the expanded complete browser suite. Exact-final-HEAD Regression / Browser Quality / Database Replay run links and conclusions are maintained in PR #458; earlier-head success does not substitute for final-head checks. No paid calls, production SQL, secret changes, merge or publish.
- **Release / remaining:** IN_PROGRESS until final verification. Migration then compatible Lovable publish and separately approved real pilot are required before production closure. Scheduler/backstop runtime inventory remains an explicit operator release check, not assumed from trigger success. See [release, compatibility and recovery procedure](PB-AI-MUSIC-INSPIRATION-OBSERVED-USAGE.md).

## 2026-10-28 — Music Inspiration remove redundant pending-start explanation — IN_PROGRESS

- **Scope:** The live Android screenshot shows a long `pendingAttempt` paragraph below the Music Inspiration research button, taking up the compact Generator screen. In the merged #456 main implementation it is rendered only for a locally unacknowledged start. Remove that _panel-only_ paragraph; preserve the retry/discard controls within the modal, idempotent request ID, local recovery and all existing backend safeguards. No migrations, AI requests or production mutations.
- **Implementation:** One scoped change in `src/components/promptbeats/MusicInspirationPanel.tsx`, branch `fix/music-inspiration-hide-pending-explanation`. The existing `pendingAttempt` translation is deliberately retained for future contextual help or diagnostics, but not shown on the main panel.
- **Acceptance / release:** Confirm the verbose paragraph is absent for pending-unacknowledged state while retry/discard remain available and no new paid research automatically starts. Verify Regression, Browser Quality, Database Replay at exact HEAD, review/merge, then separate Lovable publish and production verification. Until then status remains IN_PROGRESS, and no production change is claimed.

## 2026-10-28 — PR #456 responsive verification and keyboard viewport correction — IN_PROGRESS

- **Baseline / scope:** main `ea5fde05d21c96308d8dbc371eb774dd2c0233e8`; existing Draft [PR #456](https://github.com/Aeras/prompt-beats-studio/pull/456), reviewed HEAD `d706d9bdbda757bdcfce345a4d39d916360901e0`. #455 remains overlapping: its native mode/depth/model selectors and concise pending-action labels are already included and preserved; do not merge it independently without reconciliation. No backend, admission, pricing, database or Atlas change.
- **Confirmed failures:** Initial exact-head Browser Quality returned 201 PASS / 3 FAIL: the same obsolete non-admin assertion expected no native selects, although the mode selector is deliberately present. The test now positively asserts that mode remains available while both privileged selectors remain absent. A new deterministic keyboard regression also reproduced clipping when Android-style keyboard opening changes only visualViewport height/offset, leaving layout/dvh unchanged.
- **Correction:** Both Inspiration dialogs subscribe to visualViewport resize/scroll only while open, center within its visible bounds and constrain width/height, with listener cleanup and existing CSS fallback. Confirmation actions wrap and retain touch height. No changes to #455 selector behavior or request/idempotency semantics.
- **Local evidence:** Frozen Bun installation, strict TypeScript, changed-source ESLint, Prettier and production build PASS. Full offline Bun: **1,266 PASS / 0 FAIL / 12,817 assertions / 178 files** in a separate source snapshot with Linux-equivalent LF line endings. The untouched Windows CRLF checkout produced seven source-string assertion failures; no source assertion or unrelated repository file was changed to hide them. Targeted browser checks reproduced the keyboard failure before the fix and passed after it. Added all-control and replacement/deletion confirmation tests at **320x640, 360x740, 390x844, 768x1024, 1280x800 and 667x375**, plus visual-only keyboard resize/pan, confirmation and keyboard-close recovery. Every service is mocked; no real AI, deletion or production request is used. Headless Playwright emulates keyboard geometry; it cannot display an actual Android OS keyboard.
- **Final verification evidence:** Full related desktop/tablet/mobile Playwright results and all three exact-final-HEAD Regression / Browser Quality / Database Replay run links are recorded together in PR #456 after completion. Earlier-head checks do not substitute for final-head checks. Original Browser Quality failure: https://github.com/Aeras/prompt-beats-studio/actions/runs/40700420270 .
- **Release / rollback:** Implementation remains in the same Draft PR for review; merge and Lovable publish are separate and not performed. No migration is needed. Revert the scoped UI commit for rollback; do not remove unrelated failure-recovery or selector changes. No production release or real-device acceptance is claimed.

## 2026-10-28 — Music Inspiration responsive modal follow-up — IN_PROGRESS

- **Scope:** Extend existing PR #456 (not a new PR) for narrow mobile, tablet and desktop containment, including both research dialog and confirmation dialog. Current branch head updated with commit `53ed16765fa974ebb20ae7d35e288f97c49d251d`.
- **Implementation:** Limit both dialogs by dynamic viewport; inner vertical scrolling; constrain width and horizontal overflow; wrap long localized messages, protect field minimum widths and prevent the parent panel from overflowing. No AI/server/database/cost behavior changed.
- **Verification pending:** final-head Regression, Browser Quality and Database Replay; interactive viewport checks at 320/360/390px, tablet, desktop, landscape and on-screen keyboard; examine PR #455 overlap before integration. No merge, publish or production verification claimed.

## 2026-10-28 — Music Inspiration smartphone dialog fit — IN_PROGRESS

- Post-merge #454 feedback: research dialog overflows mobile viewport and controls are visually oversized. Scoped CSS correction constrains width and dynamic viewport height, makes content internally scrollable, reduces mobile spacing and allows long pending-request action to wrap. No server/Tavily or paid AI changes. Verify Browser Quality at final PR HEAD; production publish is separate.

## 2026-10-28 — Music Inspiration failure diagnosis and control recovery — IN_PROGRESS

- **Verified baseline:** main `7ae95e2cfc34275b965293b5157fef818a0c0d98`, merged #451/#452/#453; separate branch `fix/music-inspiration-failure-stage` for this work. Production failure screenshot has generic alert; prior Supabase read showed no Inspiration jobs, which does not prove whether backend request reached hosting.
- **Scope / remedy:** Safe stage-specific UI diagnostics without leaking server error details; verified Super Admin receives all installed enabled Generator-compatible registry models, while ordinary users keep effective model access and server-side spend guard; explicit local abandonment of unacknowledged request allowing new artist/model, preserving original request-id retry as separate option. Abandoning local state does not cancel any unknown backend work; UI warns about possible completion. No paid requests, scheduler changes, secrets or production DDL.
- **Verification / release:** Offline Browser test added for different request ID after explicit discard; full CI and review outstanding. Codex independent root-cause audit remains read-only and must not edit this branch. Tavily runtime configuration and real request handling remain unverified; this UI/model change is not proof of production repair.

## 2026-10-28 — Music Inspiration compact dialog and model clarity — IN_PROGRESS

- **Cause confirmed in current main `9de7c2aa4351232d2a8653278d8693c5cd9eedab`:** dialog renders verbose description, financial limits/reservation note, an unconditional default-model label and a redundant standard-depth label. This is independent of runner recovery Draft PR #452.
- **Correction:** remove explanatory introductory text and redundant default-model/depth display from the dialog, retain server-side budget, auth and pricing enforcement and failure-state messages. Super Admin keeps its explicit model selector; the selected override is already passed to the server and validated there, while ordinary users continue to use the effective Generator default model. No model-policy change, pricing relaxation, database migration or secret changes.
- **Verification:** the initial Regression guard read the old PR event before mandatory PR-body headings were populated. The PR body now includes all four required sections; re-running the original job reused its original event payload. A new documentation commit triggers fresh CI with the current PR metadata. Browser Quality returned 192 PASS / 6 FAIL (two obsolete text assertions repeated across desktop/tablet/mobile). Updated only these two assertions in e2e/music-inspiration.pw.ts to verify the removed labels stay absent. Focused UI regression, formatting and final CI must now pass on the updated exact HEAD. No publish, merge or paid calls. Atlas #450 and runner PR #452 remain untouched.

## 2026-10-28 — AI Music Inspiration runner release blocker — IN_PROGRESS

- **Baseline / investigation:** Live main `9de7c2aa4351232d2a8653278d8693c5cd9eedab`; #451 merged at head `079ffc59231929d034f9120c0a8e5b28a6c04220`. New focused branch `codex/inspiration-runner-recovery`; separate PR because #451 is already merged. #450 remains paused and untouched. Owner reports runner settings present but cron.job empty; repository/managed-project metadata do not establish an external scheduler. The old Lovable plan describes a minute sweep but does not prove installation. No production SQL changes, secret changes, publish or provider calls in this task.
- **Verified cause:** Empty runner messages awaited accounting, Generator, QC and Inspiration sequentially; several jobs could exceed the shared 170,000ms pg_net HTTP timeout or starve the last lane. 170s is a configured transport deadline, not proof of the hosting platform's actual lifetime. Trigger enqueue failures are intentionally swallowed, requiring a real scheduler backstop.
- **Fix / acceptance:** Short authenticated fanout sweeps with at most two targets per lane plus one maintenance request (11 total); independent 170s requests; global/per-target cooldowns filtered before batch limits to avoid queue starvation; exact-ID, leased provider receipt recovery; existing provider dispatch/idempotency/spend guards retained. No cron or secrets installed by migration. Queued Inspiration starts its persisted research clock on first claim, expires after 30 minutes unstarted, and extended work reserves transport/accounting headroom (120s research). Unknown provider outcomes are not blind retries.
- **Verification:** Local full Bun 1,266 PASS / 0 FAIL / 12,817 assertions / 178 files; frozen installation, strict TypeScript, changed-source lint/format and build PASS. Offline handler/auth/worker integration, local transactional SQL/ACL with mocked pg_net, independent-connection scheduler races and existing Inspiration spend/lease races; full tests, TypeScript, lint/format/build and exact-HEAD CI results are recorded in this follow-up PR when verified. No gate success inferred from #451. The first CI replay exposed a test-only owner mismatch: postgres-owned dispatch could not insert into the supabase_admin-owned temporary HTTP capture table. Reproduced with CI-equivalent local ownership and fixed by granting INSERT/SELECT only on that transaction-local mock sink; real ACL assertions remain unchanged. Release remains pending independent review and operator verification.
- **Release / rollback:** See [runner release runbook](PB-AI-MUSIC-INSPIRATION-RUNNER-RECOVERY.md). Apply only the forward migration with separate approval, publish compatible code, verify real hosting runtime and scheduler inventory, then separately authorize one named minute cron. No secret embedded in cron command. Unschedule only that job on rollback; retain journals, dispatch reservations and existing data. Do not claim production recovery active before runtime evidence.

## 2026-10-28 — AI Music Inspiration Beta — CODE_COMPLETE_RELEASE_PENDING

- **Status: CODE_COMPLETE_RELEASE_PENDING — #451 merged; production activation is not established.** Branch `feature/ai-music-inspiration-beta`, baseline main `fdf34b2e601dc90d4fbdaf1a3192ff948f09f698`. Atlas V4 #450 remains paused and independent; its data/code are not consumed.
- **Implemented:** real fixed-origin Tavily search/retrieval adapter, accessible-extract receipts and exact quoted-passage checks, evidence/uncertainty/creative separation; fresh server and database Beta/model authorization; durable owner-isolated jobs, idempotent dispatch reservations, observed-usage journal and bounded recovery without blind paid retries; private profile CAS CRUD; Advanced Generator modal/dropdown, EL/EN, selective fill/replace, protected Theme/Language, Blueprint/Energy and manual-edit-safe Undo. Missing external configuration fails closed; no synthetic research in production.
- **Database:** additive `20261028060004_music_inspiration_private_jobs_profiles.sql`; service-only worker/admission RPCs, owner RLS, atomic quotas/reservations, cancellation/lease fencing, model-uninstall protection. Verified in disposable Docker PostgreSQL: fresh migration, SQL/RLS and independent-connection races PASS; all 19 legacy Feature Access policies unchanged. Cross-layer verification corrected the first saved profile revision to 1 (matching server Zod), with CAS 1→2→3 assertions; Beta/Stable/Archived/promoted access follows the existing lifecycle rather than permanently requiring Beta Tester entitlement. Successful stored-response recovery clears prior error and records current completion time. Recovery is capped at three attempts; queued work cannot be starved by stale unknown jobs.
- **Verification:** 78/78 integration Playwright cases PASS: 69 Inspiration plus 9 existing Atlas/Generator regression cases (desktop/tablet/mobile). 59 focused tests and full Bun 1,248 PASS / 0 FAIL / 12,758 assertions / 177 files; strict TypeScript, changed-source ESLint/Prettier and production build PASS (four pre-existing hook warnings in generate.tsx). Final GitHub gates are recorded in the PR verification section as they complete; do not infer final CI success from an earlier SHA. Malformed ancillary config/profile responses are validated inside the query, so they cannot crash Generator/Atlas rendering; browser regression coverage includes these failures. The bounded Browser Quality job budget is 20 minutes for the expanded suite; per-test deadlines, assertions and retries are unchanged. The initial Prettier failure and a fresh-replay fixture isolation failure were corrected without relaxed tests or lint rules: historical runner settings are removed only from the disposable CI database before SQL/race tests, preserving the harness refusal to run with external runner configuration.
- **Independent pre-release review (2026-10-28):** Reviewed previous exact HEAD `6e6063a87f6cede290dd013fadc7e45a4d5aea27` and confirmed all three CI gates PASS there. Published Tavily Basic Search uses 1 credit and public Pay As You Go lists USD 0.008/credit; account-specific rate/spend limits remain unverified. Product-quality risk: current standard (2) and extended (5) searches both use basic depth with truncated source context; specialized music research coverage must be assessed in a separately approved, bounded pilot, never presumed. Detailed read-only review: [PB-AI-MUSIC-INSPIRATION-INDEPENDENT-REVIEW.md](PB-AI-MUSIC-INSPIRATION-INDEPENDENT-REVIEW.md). New documentation commits require exact-new-HEAD CI re-verification.\n- **Release dependencies:** configure server-only Tavily key and independently verified USD/credit rate/date, existing selected-provider credentials and fresh verified model prices; confirm provider account spending limits and runner/hosting runtime. These are not configured or exercised here. Independently review migration, approve migration then compatible publish, and separately authorize a tiny live pilot before Beta exposure. No production credentials, paid requests, production migration, publish or merge were used. See [implementation/release evidence](PB-AI-MUSIC-INSPIRATION-BETA-RELEASE.md).
- **Financial and evidence limits:** application reservations are conservative estimates, not verified invoices or a provider-enforced billing guarantee; timeout/cancel does not prove zero cost or upstream termination. Exact quotes prove retrieved provenance, not semantic truth or editorial certification. Mainline Atlas has no approved executable facts for this path, so Atlas-first currently contributes none; excluded techniques remain excluded.

Read root `AGENTS.md` first. This ledger is **not** an audit report: it records independently verified current work, deployment status and evidence. Do not infer that a merged PR means release complete.

## Status vocabulary

- `OPEN`: verified remaining work not started.
- `IN_PROGRESS`: end-to-end work in active branch/PR.
- `BLOCKED`: cannot safely finish, with explicit owner/handoff and reason.
- `CODE_COMPLETE_RELEASE_PENDING`: complete merged code, but required deployment, migration or live verification is outstanding.
- `CLOSED`: all agreed acceptance and release checks verified, including deployment only if required.

## Reconciliation baseline — 2026-10-25

20 GitHub PRs **#403–#422** were verified merged during the audit conversation. Their merges are historical evidence of implementation, **not proof that every audit finding is CLOSED** or that code/migrations reached production. This ledger must be reconciled finding-by-finding against the live repository and release evidence; **do not repeat the original B-Findings register as an active backlog**.

| Scope                                                               | Current documented status              | Evidence                                                                                                           | Next verification / blocker                                                                   |
| ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Repository workflow policy                                          | CLOSED                                 | Merged #423: `8554aefd0c3a8bbb4b57fd5540c2380266579f03`; root contract, ledger, PR template and guard present      | ChatGPT Project Instructions remain external account configuration, not an audit code finding |
| Audit findings PB-AUD-001…026                                       | Individually reconciled below          | Original Reports B/C/D/E/F, merged #403–#423, current code, local SQL/mock tests and read-only production evidence | See each final finding entry; no automatic closure from merge alone                           |
| New RLS scanner observations (profiles, likes, public_staff_badges) | DEFERRED BY OWNER (not in original 26) | User decision                                                                                                      | No blanket RLS changes until explicitly resumed                                               |

## Required entry for every new task/finding

Copy the entry below **before the feature PR is merged**, replacing each placeholder with factual evidence. A new entry can remain IN_PROGRESS or BLOCKED when the scope cannot safely be closed.

### TASK-ID — title

- **Status:** OPEN | IN_PROGRESS | BLOCKED | CODE_COMPLETE_RELEASE_PENDING | CLOSED
- **Scope / acceptance:** …
- **Investigation:** current main SHA; reproduction; affected client/server/DB/integration paths; prior PR and impact review
- **Execution owner:** ChatGPT; or ChatGPT + Codex; Lovable only for proven tool limitation
- **PR and exact HEAD:** …
- **Verification:** focused tests; Regression; Browser Quality; Database Replay; other relevant evidence
- **Release:** migration/deploy/live checks necessary? applied? rollback plan?
- **Remaining work / owner:** precise next action or “none”
- **Closure evidence:** date and links; do not state CLOSED until complete

## AUDIT-CLOSURE-20261025 — consolidated verification and release boundaries

- **Status:** CLOSED (verification/reconciliation task completed; 20 findings CLOSED and six independent findings remain explicitly OPEN, not a blanket security certification).
- **Scope / acceptance:** Reconcile #403–#423 and all 26 original findings, execute safe failure/race tests, fix verified residual gaps in one PR, and preserve truthful release states.
- **Investigation:** Initial main `8554aefd0c3a8bbb4b57fd5540c2380266579f03`; original Reports B/C/D/E/F, #424 verification and #425 remediation. Initial Published #419 evidence was superseded by the recorded #424 and #425 releases below.
- **Execution owner:** Codex; owner explicitly approved the coordinated PB-AUD-021 migration/publish, bounded functional tests and registry-only commit/push on 2026-10-25. Trusted ingress evidence is no longer a prerequisite for these admission controls.
- **PR and exact HEAD:** Unified final-verification PR/HEAD and final three gate links are recorded together in its PR and the closure report.
- **Verification:** See the dossier and final exact-HEAD CI evidence. Five real local SQL suites, four independent-connection scripts, offline tests, TypeScript, affected-source lint/format and production build. No production writes or paid calls.
- **Release / remaining work:** #425 application `6867d8c18c704e4675cc9329f0de8c324c86729a` published and its specific migration/functional checks verified below. AUD-004/005/007/015/024/025 remain independent OPEN work; none is relabeled as solved by this release.
- **Closure evidence:** 2026-10-25; consolidated verification and all approved implementation release dependencies completed with the explicit evidence below. No remaining BLOCKED or publish-only finding in the reconciled 26; six independent OPEN findings remain.

## Final finding-by-finding reconciliation — 2026-10-25

Common investigation baseline: `8554aefd0c3a8bbb4b57fd5540c2380266579f03`.
Execution owner: **Codex**. One verification/remediation branch: `codex/audit-final-verification`, [PR #424](https://github.com/Aeras/prompt-beats-studio/pull/424). Implementation commit: `aef4e01a91031b230a26dff51b8a472719d88382`; subsequent evidence-only commits and exact final check SHA are recorded in that PR.
Detailed evidence, release boundaries and reproducible commands: [final verification dossier](PB-AUD-final-verification-20261025.md).
Final verification PR/checks and its exact HEAD are recorded together in the PR and closure report; no editor HEAD is used as production proof.

Production read-only evidence: 19 exact SQL function-body matches, required RPC privileges/RLS/indexes/triggers, and existing applied migration history. Initial inspection identified Published #419; the subsequent release check below supersedes that publication state. No reliable runtime-SHA endpoint exists. No production mutation was performed.

`CLOSED` below refers only to each finding's original acceptance contract, not a blanket security certification. The six former release-pending findings were closed after the publication check below; original unimplemented policy/architecture findings are not misreported as solved by partial PRs. Final local/CI result evidence belongs to the unified verification PR.

### Publication verification — 2026-10-25, observed 02:40 UTC

- Lovable History places **Published** on `Merge PR #424: final audit verification and security gap closure`, mapped through GitHub to `609678f779268016c2864baf8ca4c89140407522`.
- The publication popover says **Your website was updated**, with domain `promptbeats.app`. The API editor SHA also matches, but is only corroborating editor evidence, not the publication proof.
- Ordinary anonymous GET `/`, `/auth` and `/discover`: **HTTP 200**, HTML, no observed catastrophic SSR error page. No authenticated write, AI call, payment, migration or new deployment was executed.
- Existing final-main Regression, Browser Quality and Database Replay are PASS: [Regression](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770454), [Browser](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770440), [Database](https://github.com/Aeras/prompt-beats-studio/actions/runs/40154770475). Detailed behavioral verification remains the prior offline/isolated SQL evidence; the page checks are not live provider or payment tests.
- **PB-AUD-011/016/017/018/019/026: CLOSED**. Totals: **19 CLOSED, 6 OPEN, 1 BLOCKED**, no publish-only finding pending. Runtime binary/SHA attestation remains unavailable; closure uses explicit hosting publication evidence plus the already verified compatible schema and tests.
- The historical #419 marker is preserved as earlier evidence, not represented as the current published snapshot. This documentation-only follow-up does not require republishing application code.

### PB-AUD-001 — Multipart byte integrity

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-001; reconciled against #405, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** upload-integrity.test.ts: exact bytes/SHA-256, framing CRLF, genuine trailing CRLF, chunking/boundaries and 50 MiB limits; published #419 includes #405.
- **Release / remaining work / owner:** No new production upload was needed; original R2 HEAD compatibility evidence retained.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-002 — Canonical verified audio MIME

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-002; reconciled against #405, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual upload/R2 fixtures enforce audio/mpeg or audio/wav from verified format, reject conflicts and preserve bytes; published #419.
- **Release / remaining work / owner:** No active-content/XSS exploit is asserted.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-003 — Collision-resistant R2 keys

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-003; reconciled against #405, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Fixed-clock parallel key tests and actual receipt-key uniqueness; crypto.randomUUID owner namespace; historical keys unchanged; published #419.
- **Release / remaining work / owner:** No production objects renamed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-004 — Signed URL revocation SLA

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-004; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current r2.server.ts still defaults to six-hour signed capabilities; no reviewed revocation-SLA change exists.
- **Release / remaining work / owner:** Owner must choose revocation SLA before changing TTL/proxy behavior; long-audio/PiP compatibility required.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-005 — Personal-track pagination

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-005; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current tracks.functions.ts listMyTracks still has no range/cursor contract.
- **Release / remaining work / owner:** Implement pagination and consumer behavior in its separately approved scope; no claim that previous upload fixes addressed it.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-006 — Immutable GitHub Actions refs

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-006; reconciled against #406, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #406 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #406; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** All action uses in current workflows are full commit SHAs; final three mandatory gates verify execution.
- **Release / remaining work / owner:** No production deploy required for CI configuration.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-007 — Full-tree lint debt

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-007; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** #423/current Regression intentionally gates changed source; full-tree ESLint still has pre-existing errors outside this task.
- **Release / remaining work / owner:** Separate baseline cleanup remains; changed-source PASS is not full-tree PASS.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-008 — Success-only upload quota

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-008; reconciled against #418, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #418 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #418; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production quota trigger/admission bodies exactly match migration; local SQL proves 20 successes/hour, failed/unfinalized attempts do not consume success quota, separate 100/hour abuse allowance.
- **Release / remaining work / owner:** No admission setting or quota policy changed in this task.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-009 — Finalized upload receipt

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-009; reconciled against #405 + receipt grant fix, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #405 + receipt grant fix is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #405 + receipt grant fix; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production receipt trigger/helper ACL verified; rollback SQL tests ownership, expiry, one-time consumption, canonical URL, cleanup, missing evidence, legacy/external compatibility; independent receipt race PASS; published #419.
- **Release / remaining work / owner:** Storage/SQL are not a distributed transaction; out-of-band R2 credential misuse remains outside this contract.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-010 — Hydration authorization preconditions

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-010; reconciled against Original informational finding, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original informational finding is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original informational finding; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Original audit did not reproduce a bypass. Existing sharing/private-review caller authorization and terminal-state tests pass; signing preconditions remain server-owned.
- **Release / remaining work / owner:** Closed as reviewed non-finding, not as a newly fixed vulnerability. Capability revocation remains AUD-004.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-011 — Observed usage survives cancellation/failure

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-011; reconciled against #404 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Tracked caller/QC cancellation and lost-ACK tests PASS. New correction preserves settlement when provider-error usage journal write fails.
- **Release / remaining work / owner:** Application correction published in #424; no migration needed or remaining publish action.
- **Closure evidence:** 2026-10-25 publication verification above plus tracked-caller/QC/offline usage evidence in the [dossier](PB-AUD-final-verification-20261025.md).

### PB-AUD-012 — Background reconciliation and no blind replay

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-012; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production begin/remote/checkpoint/recovery/reaper bodies match; local leases/races and actual mocked background create/remote-callback/poll/deadline/restart/GET recovery PASS; published #419.
- **Release / remaining work / owner:** Provider create-before-ID crash remains honestly unknown, not automatically retried; no exactly-once upstream execution or provider retention guarantee is claimed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-013 — Bounded cancellation transport

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-013; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Non-cooperative fetch/body deadline tests and cancellation-classification regressions PASS; bound source is in published #419.
- **Release / remaining work / owner:** Timeout is unconfirmed cancellation, never proof of zero provider cost.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-014 — Atomic revision finalization

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-014; reconciled against #412, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #412 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #412; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual production service-only function body/signature/ACL match; project version-history rollback tests and three standalone lock-order cases on independent connections PASS; published #419.
- **Release / remaining work / owner:** No production revision/test song created; no migration replayed there.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-015 — Global monetary exposure controls

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-015; reconciled against #413 partial mitigation, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #413 partial mitigation is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #413 partial mitigation; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Central emergency dispatch switch exists. It is not the original global monetary-reservation/cap control.
- **Release / remaining work / owner:** Owner/product approval is required for monetary/credit policy; no new policy implemented here.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-016 — Moderation-aware playlists/favorites

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-016; reconciled against #408 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #408 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #408 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual handler fixtures cover third-party locked/unpublished/missing items, owner-private content, counts/durations/covers, redaction, favorite IDs and add/remove behavior.
- **Release / remaining work / owner:** Complete projection correction published in #424; no RLS/schema change or remaining publish action.
- **Closure evidence:** 2026-10-25 publication verification above plus actual-handler moderation fixtures in the [dossier](PB-AUD-final-verification-20261025.md).

### PB-AUD-017 — Honest Stop outcome messages

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-017; reconciled against #420, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #420 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #420; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current EL/EN UI distinguishes before-start, upstream-confirmed and unconfirmed/possibly charged outcomes; full source/browser checks cover current code.
- **Release / remaining work / owner:** Published #424 includes merged #420; no provider/billing logic change or remaining publish action.
- **Closure evidence:** 2026-10-25 publication verification above plus existing Stop-message/source/browser evidence in the [dossier](PB-AUD-final-verification-20261025.md).

### PB-AUD-018 — Checkout idempotency and recovery

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-018; reconciled against #414–#417 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #414–#417 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #414–#417 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production reservation function/ACL match; real SQL lease and independent-connection reservation races PASS; actual handler Stripe mocks cover active/trialing, retries, open sessions, failures, delayed webhook and later repurchase.
- **Release / remaining work / owner:** Customer-bound subscription preflight published in #424; compatible reservation schema already verified. No payment or DB migration required.
- **Closure evidence:** 2026-10-25 publication verification above plus Stripe mocks and SQL reservation races in the [dossier](PB-AUD-final-verification-20261025.md); no live transaction claimed.

### PB-AUD-019 — Sensitive diagnostic logging

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-019; reconciled against #407/#410/#421/#422 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #407/#410/#421/#422 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #407/#410/#421/#422 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Synthetic marker captures exercise actual discovery/Anthropic/RunPod/QC/reporter/SSR paths; allowlisted labels and schema paths; central message/stack/cause expansion removed.
- **Release / remaining work / owner:** Complete logging correction published in #424; no prompts, scoring or provider calls changed.
- **Closure evidence:** 2026-10-25 publication verification above plus synthetic-marker/central-capture tests in the [dossier](PB-AUD-final-verification-20261025.md).

### PB-AUD-020 — Dependency advisories

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-020; reconciled against #403/#419, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #403/#419 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #403/#419; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Published history explicitly marks #419; Zod 4.6.7 compatibility/security tests and frozen install pass, deprecated Drizzle/esbuild path absent, fresh audit clean.
- **Release / remaining work / owner:** An empty dependency audit is not a whole-application security guarantee.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-021 — IP-independent Contact / Private Review admission

- **Status:** CLOSED — approved production migration, publish and bounded functional verification completed 2026-10-25.
- **Scope / acceptance:** Remove dependence on all unverified IP headers for Contact and Private Review, preserve normalized email/session limits and privacy, enforce atomic concurrency and server-only RPCs; no common fingerprint that locks out all users.
- **Investigation:** Main `3aa23fa0b2e9bc72206061c5f7f9a2e83215a21d`; owner confirms DNS-only records and no final-ingress guarantees. Full Contact/SMTP, anonymous reviewer join/PIN, owner/auth, legacy admission RPC and existing bearer authorization paths traced. Historical migrations are unchanged; no anonymous direct-RPC bypass is claimed after existing #step8 grants.
- **Execution owner:** Codex. [PR #425](https://github.com/Aeras/prompt-beats-studio/pull/425) merged as `6867d8c18c704e4675cc9329f0de8c324c86729a`; verified final PR HEAD `2abc08ffc4bddb68db0b5bcdbe2c84e49fc6bc5c`. Owner gave one explicit approval for the specific coordinated release, one Contact email, one controlled private review and registry-only commit/push.
- **Implementation:** Message/identity-bound signed single-use work proof; atomic Contact email 3/30m, verified account 10/30m independently and guest ceiling 120/30m. No shared authenticated cap. Private Review admission/PIN failure/reviewer creation in one session-row-locked RPC, with per-session short/hour windows and legacy failure carry-over. No network header read or raw IP storage.
- **Verification:** 1,073 offline Bun tests / 7,266 assertions, strict TypeScript, changed-source lint/format, build, six local SQL suites and five race scripts PASS. All three gates PASS on merged application SHA: [Regression](https://github.com/Aeras/prompt-beats-studio/actions/runs/40169518380), [Browser Quality](https://github.com/Aeras/prompt-beats-studio/actions/runs/40169518399), [Database Replay](https://github.com/Aeras/prompt-beats-studio/actions/runs/40169518452). Browser gate has the documented existing PB-012 retry; new proof tests pass in all three viewports. No production stress or paid call.
- **Release / remaining work / owner:** No release action remains for PB-AUD-021. Production project `qwlksrcsovbncmretjdt` verified ACTIVE_HEALTHY, PostgreSQL 17.6.1.166. Applied only canonical `20261025030941_pb_aud_021_ip_independent_admission.sql` (SHA-256 `97046a0e44997cfa7a0b80b76062b7d09021b2e71ab726ab2dfb8282ab463091`) through the established Supabase migration API. Its actual management-generated history version is **20261025065526**, name `pb_aud_021_ip_independent_admission`; history grew by exactly this one record, with none removed. Four unrelated historical ledger differences were identified as non-prerequisites and left untouched.
- **Preflight / recovery:** Existing backup `PromptBeats-DB-Backup-20261024-164640` rechecked: all three DPAPI exports readable in memory with matching bytes/SHA-256; prior real restore evidence is 101/101 tables, 170 FKs and 87 policies PASS. Owner acknowledged the backup's 2026-10-24 13:47 UTC recovery point and newer-data limitation. No new backup or restore was run. No concurrent active schema change, waiting review lock or Lovable agent release was observed; owner agreed not to start a parallel release. Recovery plan never restored spoofable legacy admission.
- **Production schema/security evidence:** All five deployed function bodies exactly match the canonical migration; their signatures/results are compatible, search_path is empty, anon/authenticated EXECUTE is false and service_role EXECUTE true. Both new tables have RLS enabled and no anon/authenticated DML/read grants; required service grants and all indexes verified. No other migration or hosting setting changed.
- **Published application evidence:** Immediately requested Lovable deploy after successful migration; deployment ID `af1b13fc-e22a-48ee-be71-5e8aa6270869`. Fresh Lovable History shows **Published on #425**, mapped to `6867d8c18c704e4675cc9329f0de8c324c86729a`; editor SHA independently matches. Publication and actual new production behavior, not editor synchronization alone, establish this release. No independent runtime binary-SHA endpoint is claimed. This subsequent registry-only commit needs no application republish.
- **Production Contact evidence:** Submitted exactly one owner-approved controlled message to `support@promptbeats.app` through the freshly loaded production Contact page. The form cleared after the server completed successfully; one new v2 receipt belongs to the authorized test account. This confirms proof/admission and the awaited SMTP send path, not independent inbox-delivery attestation. No resends or unrelated receipts were modified.
- **Production Private Review / compatibility evidence:** There were zero review sessions before testing. Created one private PIN-protected, no-audio test link through the old published application before migration, without editing Project/track content. After publish, one wrong PIN displayed `Invalid PIN.` and durably recorded 1 attempt/1 failure/0 reviewers; one correct PIN opened that same legacy link. Final counts: **2 attempts, 1 PIN failure, 1 reviewer**. Token hash and snapshot checksum are unchanged across cutover. Closed only that controlled review afterward; owner UI confirms `closed`, and reviewer reload shows the closed message with no Lyrics/content. No existing customer link was fabricated or claimed tested when none existed.
- **Limits / rollback:** Guest-cap exhaustion and targeted session lockout are explicit bounded availability trade-offs, not claimed eliminated; independent accounts/sessions and existing reviewers remain isolated. No destructive down migration or blind rollback to spoofable admission. See full release/compatibility/rollback procedure in the handoff.
- **Closure evidence:** 2026-10-25, final checks at 07:10 UTC. Migration, permissions/RLS, Published snapshot, Contact, invalid/valid PIN, pre-migration link compatibility and final controlled-session closure all PASS. Test PIN, bearer link, reviewer key, credentials and personal content are not included in this ledger.

### PB-AUD-022 — Reasoning/cache/receipt attribution

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-022; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual provider normalization regressions and SQL estimates/receipt tests PASS; production ledger/pricing functions and columns/RLS verified; published #419.
- **Release / remaining work / owner:** Reasoning is counted once; cache subsets not priced as uncached; provider-reported USD is not an independently verified invoice. Unknown historical values were not backfilled.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-023 — Idempotent usage delivery

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-023; reconciled against #404, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #404 is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #404; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Production usage primary key and settlement/outbox bodies verified; lost-ACK replay and independent concurrent settlement tests PASS; published #419.
- **Release / remaining work / owner:** A genuinely new dispatch has a new identity; unidentified historical rows cannot safely be deduplicated by guesswork.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Acceptance verified within the explicit evidence boundary above.

### PB-AUD-024 — Production CSP/frame policy

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-024; reconciled against Original audit + current HTTP evidence, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit + current HTTP evidence is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit + current HTTP evidence; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Ordinary production GET confirms HSTS/nosniff/referrer policy, but no CSP/CSP-Report-Only/X-Frame-Options/Permissions-Policy on that response.
- **Release / remaining work / owner:** Approve and validate hosting CSP/frame policy in staging for OAuth/media/Lovable preview/PiP/PWA before enforcement. No production exploit or blanket header absence is asserted.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-025 — Cross-service account deletion

- **Status:** OPEN
- **Scope / acceptance:** Original PB-AUD-025; reconciled against Original audit, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; Original audit is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation Original audit; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Current admin deletion still spans object cleanup and Auth deletion without a distributed transaction; a verified backup does not make it atomic.
- **Release / remaining work / owner:** Resumable deletion/retention policy is independent approved work; no real account deletion performed.
- **Closure evidence:** 2026-10-25; [dossier](PB-AUD-final-verification-20261025.md). Not CLOSED; the precise outstanding action is retained above.

### PB-AUD-026 — Generator hard input budgets

- **Status:** CLOSED
- **Scope / acceptance:** Original PB-AUD-026; reconciled against #409 + final verification, current source and the dossier's failure matrix.
- **Investigation:** Baseline above; #409 + final verification is historical implementation evidence, not independent release proof.
- **Execution owner:** Codex.
- **PR and exact HEAD:** Prior implementation #409 + final verification; unified final verification branch above, with exact final HEAD/check links in its PR.
- **Verification:** Actual live schema per-field/nested bounds, Unicode/escaping/encoded byte ceiling and no-provider-on-oversize tests PASS; raw-RPC worker and shared generator now enforce the same aggregate budget.
- **Release / remaining work / owner:** Pre-dispatch checks published in #424; existing admin/normal-user limits and saved historical content remain unchanged.
- **Closure evidence:** 2026-10-25 publication verification above plus actual-schema/encoded-budget/no-dispatch tests in the [dossier](PB-AUD-final-verification-20261025.md).

## PB-UX-20261025-01 — Live Liked Tracks synchronization

- **Status:** IN_PROGRESS
- **Scope / acceptance:** Like and Unlike must reflect in Library → Liked Tracks without page reload; unlike removes a visible row immediately, failed mutation restores it; newly liked tracks refetch through the existing authorized server projection.
- **Investigation:** Existing useLikes in `src/lib/likes.ts` only updates/invalidate per-track `["likes", trackId, userId]`; Library reads `["library", "liked", userId]` via `listLikedTracks`. Independent keys caused stale listing.
- **Execution owner:** ChatGPT.
- **PR and exact HEAD:** Branch `fix/pb-liked-library-live-sync-20261025`; record final PR HEAD after CI.
- **Verification:** Contract test added. Browser Quality and Database Replay PASS at initial HEAD; Regression first failed on stale PR event body format and requires a fresh PR check run. Full runtime/UI verification remains outstanding.
- **Release:** No schema change. Merge is not publish; confirm Lovable publication and UI after approval.
- **Remaining work / owner:** Finish tests, CI and PR review, then approved publish and runtime verification.

## PB-LIBRARY-20261025 — Favorites and playlist mutation permissions

- **Status:** IN_PROGRESS — implementation verified locally; PR review and production release remain separate.
- **Scope / acceptance:** Fix track-menu favorite add/remove, create-playlist-with-track and existing-playlist add in one PR; preserve visibility, removal, authentication, ownership, feature access and moderation.
- **Investigation:** Main `615eeaacda25d9e613220de8872285fc6c697597`, merged #426 verified, 17 open PRs checked. Production read-only column ACL and isolated SQL reproduction show that existing column INSERT grants work; the actual 42501 is missing SELECT on tracks.moderation_status, not missing table-level INSERT. [Full evidence, tests and release plan](Favorites-Playlists-permissions-20261025.md).
- **Execution owner:** Codex. One branch `codex/favorites-playlists-permissions`; final PR HEAD and mandatory gate links are recorded together in its PR.
- **PR and exact HEAD:** [PR #427](https://github.com/Aeras/prompt-beats-studio/pull/427). Implementation `c3afa918f37ba11a22be91f45fde031501a15671` passed Regression, Browser Quality and Database Replay; the final documentation-inclusive HEAD and its own checks are recorded in the PR. No merge or production release performed.
- **Implementation:** One-column SELECT grant with unchanged RLS, invoker-rights atomic playlist RPCs, authenticated client reuse, safe EL/EN action errors and account-scoped cache refresh. No broad SELECT or service-role mutation bypass.
- **Verification:** Full offline Bun 1,083 PASS / 7,328 assertions; strict TypeScript, affected-source ESLint/Prettier, production build and 33 browser tests PASS. Fresh local migration replay, seven SQL/RLS suites and six independent-connection scripts PASS. Exact final three-gate evidence belongs to the PR. Existing #426 Like-sync behavior retained.
- **Release / remaining work:** Verify final CI/review before merge. Owner approval required for the single new migration and Lovable publish; neither performed. Verify actual Published snapshot and authorized favorites/playlist flows before CLOSED. Additive migration remains compatible with the previous application.
- **Closure evidence:** Not CLOSED; no production functionality claim from local tests or editor synchronization.

## PB-UX-20261025-04 — Similar Songs dialog lifecycle

- **Status:** IN_PROGRESS
- **Scope / acceptance:** Clicking Similar Songs from compact/standard track card menu opens a persistent dialog showing loading, authorized matches, informative empty state or error; closes correctly. No similarity-scoring changes.
- **Investigation:** Current main after #427; dropdown menu previously rendered SimilarSongsDialog inside SimilarSongsMenuItem. Radix dismisses/unmounts menu subtree when item is selected, immediately discarding dialog state. Existing listSimilarSongs, visibility filters and empty-state presentation remain unchanged.
- **Execution owner:** ChatGPT.
- **PR and exact HEAD:** Branch `fix/pb-similar-songs-modal-lifecycle-20261025`; final PR/CI evidence pending.
- **Verification:** Add regression guard to existing similar songs tests; exact-HEAD Regression / Browser Quality / Database Replay outstanding.
- **Release:** No SQL migration. Publish and runtime UI verification required separately; no deployment performed.
- **Remaining work / owner:** Validate all gates, merge approved verified code, publish/retest before CLOSED.

## PB-UX-20261025-05 — Compact share hub

- **Status:** IN_PROGRESS
- **Scope / acceptance:** Compact card Share opens the same full hub as standard/detail card with copy, destination shortcuts, native share, owner Prompt/Lyrics toggles; no silent-only link creation. Owner share tokens remain durable unless revoked, moderated, private or deleted; per-request signed audio URLs may expire independently.
- **Investigation:** ShareTrackButton menuItem owns its open state and portal while nested inside auto-dismissing Radix dropdown, causing immediate unmount. TrackCard now keeps the hub persistent and uses a menu selection callback to activate its hidden trigger. Public track share RPC uses revocable token, no fixed expiration in share-management contract; no migration required.
- **Execution owner:** ChatGPT.
- **PR and exact HEAD:** Branch `fix/pb-compact-share-modal-lifecycle-20261025`; CI/PR pending.
- **Verification:** Static regression check added; mandatory Regression / Browser Quality / Database Replay pending; production verification pending.
- **Release:** No SQL or production changes. Publish separately, verify both mobile and desktop compact card.
- **Remaining work / owner:** Finish CI, merge on green, approved publish and live validation before CLOSED.

## PB-UX-20261025-06 — Private Reviews library and track detail icons

- **Status:** IN_PROGRESS
- **Scope / acceptance:** Consolidated Library → Private Reviews track list grouped by owned song with session count and comments; owner may open individual historic active/expired/closed review sessions. Review creation remains only in song/project workflows, not card menus. Track detail icons order: Like, Favorite, Playlist, Download, Edit, Delete; no overflow circles or labels. Edit/Delete remain owner/moderation-controlled.
- **Investigation:** Main after #429. Existing authenticated listMyPrivateReviewSessions returns owner-only track/project sessions and getMyPrivateReviewSession supplies detailed comments; original PrivateReviewManager already supports track filtering and feedback, so avoid duplicate backend and migrations. Existing track detail actions rendered circular download + menu and owner edit/delete, requiring dedicated icon-only rendering.
- **Execution owner:** ChatGPT.
- **PR and exact HEAD:** Branch `feature/pb-private-reviews-library-track-actions-20261025`, PR and CI pending.
- **Verification:** Scoped UI contract tests added; require strict TypeScript, full regression, lint/format, build and exact-head three CI gates before merge.
- **Release:** No migration. No publish or production action from this PR; approved publication and manual mobile/desktop verification required before CLOSED.
- **Remaining work / owner:** Complete CI and UX review; correct failures in same PR, then merge and release separately.

## PB-UX-20261025-06B — Inline Private Review history follow-up

- **Status:** IN_PROGRESS
- **Scope / acceptance:** Clicking a review song row expands the full review session history directly under the row, shifting other rows down. No constrained overlay or inner scrolling; collapse/switch between songs. Preserve reviewer comments, owner replies, sessions, auth and existing creation entry.
- **Investigation:** User screenshot after merged #430 confirms historyOnly still renders a fixed, height-constrained PrivateReviewManager modal; parent library list renders selected manager outside mapped rows.
- **Execution owner:** ChatGPT.
- **PR / HEAD:** Follow-up branch `fix/pb-private-review-inline-expansion-20261025`, CI pending; this is a post-release UX clarification to already merged PR #430, not unrelated work.
- **Verification:** Inline UI contract regression; full CI gates required.
- **Release / remaining:** No SQL changes; approved publication and real mobile review needed before CLOSED.

## PB-UX-20261025-06C — Permanent deletion of finished Private Reviews

- **Status:** IN_PROGRESS
- **Scope / acceptance:** Small discreet trash icon for each closed/expired review session, and for the song row only when every remaining review session is closed/expired. Owner confirmation before irrevocable deletion. Hard-delete all relevant DB rows transactionally and revoke the private token. Active reviews must never be deletable, even through forged RPC requests or concurrent expiry/close changes. Delete one session or all sessions for a track; never delete the track.
- **Presentation:** Preserve the merged #431 design exactly (one consistent song row and inline expansion regardless of one or multiple sessions). Recompute list immediately after deletion; remove the song row only after the last session is deleted. Never switch into alternate folder/single-item designs.
- **Investigation:** Read current AGENTS.md, latest main and open PR list. private_review_sessions owns private_review_reviewers, private_review_comments, private_review_join_admissions and private_review_session_admissions via ON DELETE CASCADE; verify all later migrations, functions, triggers, views, grants and races before implementation. Existing RPC list/get/close are in src/lib/private-review.functions.ts; list UI in PrivateReviewsLibraryPanel and PrivateReviewManager.
- **Execution owner:** ChatGPT implemented UI, authenticated server handlers, transactional forward migration, SQL/RLS fixture and independent-connection concurrency script in this branch; all gates at final HEAD still required.
- **PR and exact HEAD:** [PR #432](https://github.com/Aeras/prompt-beats-studio/pull/432), branch `feature/pb-private-review-hard-delete-20261025`; final HEAD determined after CI.
- **Verification:** SQL suite `supabase/tests/private_review_finished_hard_delete.sql` and two-connection race script `scripts/tests/private-review-hard-delete-races.sh` wired into Database Replay; Regression, Browser Quality and Database Replay all required at final HEAD.
- **Release:** Additive forward migration only, separately approved production SQL and Lovable publish; do not execute either without explicit approval. User-facing data deletion requires confirmation in application.
- **Remaining work:** Correct any CI failures within #432 and review exact HEAD; merge only on full green. Production migration needs separate approval, followed by a coordinated Lovable publish and owner verification before CLOSED.

## PB-BETA-20261025 — Beta Features lifecycle and managed promotion (#433)

- **Status:** CODE_COMPLETE_RELEASE_PENDING.
- **Approved scope / baseline:** Main `7aa9a7041468415f1727888b6e8509101d5b6a78`; existing Draft PR [#433](https://github.com/Aeras/prompt-beats-studio/pull/433), branch `feature/beta-lifecycle-20261025`. Product contract is `docs/PB-BETA-20261025-spec.md`. The final PR tip and exact-head CI checks are the authoritative implementation revision; no second branch/PR or production action.
- **Full-scope investigation:** Traced management navigation/user details, authenticated server middleware, Feature Access types/cache/RPCs, latest account/role/security-lock helpers, original Phase B grants/policies, audit constraints, migration replay and open PRs. The 19 original keys/policies are not registered in Beta and their policy algorithm, legacy mutation branches and ACLs are preserved. Existing moderator eligibility is handled explicitly rather than misusing the admin-only helper.
- **Implementation / owner:** Codex. Separate Super Admin Beta tab, searchable Beta/Stable/Archive, accessible keyboard tabs, independent Beta Test checkbox, English/Greek copy, confirmation-based archive and separate promotion. Forward migration `20261025132859_beta_feature_lifecycle.sql` adds lifecycle/tester/event tables with RLS and revoked direct privileges; authenticated, fresh-Super-Admin-checked RPCs fence actor/target changes, row-lock transitions and record before/after audit. Stable archive retains access; restore preserves identifiers/data; confirmed promotion atomically initializes Everyone and leaves Beta management. Idempotent retries do not reset later policy edits. Only newly registered promoted keys use the target-aware Feature Access mutation path; original features remain on their original branches. Bans, Auth bans/deletion, missing profiles and staff suspension deny managed access.
- **Registration and limits:** `beta-feature-registry.ts` is intentionally empty: no new product feature was specified and no dummy/legacy feature is seeded. New features require matching migration registration and declared client/server/SQL gates; CI verifies literal AST gates, unknown keys and actual replayed SQL registrations. The checker cannot prove undeclared semantic entrypoints or control-flow dominance; manual review remains required. Managed client caches are account-scoped, revalidate on focus/15 seconds foreground and fail closed on errors/sign-out; server/SQL admission remains authoritative. Audit UI reads latest 100 events; older events remain stored.
- **Local verification:** Frozen Bun 1.4.2 install; 1,107 Bun tests (16 Beta tests), strict TypeScript, changed-source ESLint/Prettier, production build and registration checks passed. Full browser suite: 51 tests across desktop/tablet/mobile, including 18 Beta cases, scoped serious/critical axe checks, keyboard navigation, overflow, entitlement toggle, safe errors and explicit promotion. Full fresh local Supabase replay passed; 9 SQL suites and 8 independent-connection race scripts passed. Beta SQL covers role/account matrix, RLS/RPC ACLs, lifecycle/conflicts/retries, audit, promotion/selected-user access and 608 legacy key/mode/account comparisons. Race coverage includes competing lifecycle transitions, duplicate promotion, concurrent entitlement grants, revocation and a stale administrator waiting behind an account-state lock. Providers/Auth/services are mocked in browser/unit tests; no paid calls or production mutations.
- **CI / review:** Regression, Browser Quality and Database Replay are required on the same final PR HEAD. Their exact SHA/results are recorded on PR #433 and in the final delivery after checking live GitHub evidence. PR remains Draft for the requested independent final review; no merge approval is implied.
- **Release dependency / rollback:** See `docs/PB-BETA-development-and-release.md`. Separately authorized production preflight and recovery verification, additive migration first, then compatible Lovable publish and actual production checks are required before CLOSED. No migration/publish occurred in this task. Preserve additive schema, audit history and gates during application recovery; never down-migrate/delete state or automatically reset promoted policies. Future features must preserve authoritative gates through rollback.

## PB-DB-20261025 — Library integrity production drift (dependency of #433)

- **Status:** CODE_COMPLETE_RELEASE_PENDING; production application is not authorized by this task.
- **Scope / baseline:** Main `b96065768d6e26b67f3a3f3c2f6a316c8737dc03`, merged #433. Independently authorized one new PR on `codex/library-folder-drift-reconciliation`. This is a separate release dependency, not repeated Beta implementation. Latest release preflight confirms #433 is merged but Beta is not yet activated; its earlier Draft wording above is historical evidence only.
- **Full-scope investigation:** Read current AGENTS, ledger, historical hardening and all later definitions/callers/triggers/columns/RLS/grants. Read-only production catalog confirms old node-only folder depth and single-pass Project duplication, with authenticated/service-role invoker RPC and no anon grant. Historical hardening is absent from migration history and actual definitions; precise cause of the skipped deployment is not established. Open #194 (standalone assignment) and #160 (version history UI) do not replace these functions. Existing source-only tests could verify repository intent but not production deployment.
- **Implementation / owner:** Codex. New forward `20261025155332_reconcile_library_folder_integrity.sql`, no edits to old migrations or history repair. Bounded ancestor/subtree validation and a BEFORE STATEMENT transaction fence prevent cycles/depth write skew; folder identity/ownership cannot be changed. Two-pass Project copying uses one typed MVCC snapshot, maps only internal parent/preferred IDs, preserves later branch metadata and existing linkage triggers, and rolls back on invalid source graph. RPC signature/results, invoker security, existing RLS/table grants and data remain unchanged.
- **Compatibility / limits:** The folder fence serializes all folder writes, not reads or Project content writes; long transactions can delay other folder writes. Application/PostgREST READ COMMITTED behavior is supported. Higher-isolation direct folder writes fail closed with SQLSTATE 40001 rather than trusting an old snapshot after lock wait. Project snapshots use memory proportional to version-set size. No new UI, AI calls, billing policy, data cleanup or external infrastructure.
- **Reproducible evidence:** `scripts/tests/library-drift-reproduction.ts` proves both old production-state defects and correction by the exact forward migration in a rollback transaction. `supabase/tests/library_folder_reconciliation.sql` covers RLS/roles, limits/cycles/root moves, ownership, metadata/preferred mapping and failed-copy atomicity. `scripts/tests/library-folder-races.sh` uses independent connections and observed barriers for opposite moves, move/insert depth races and source edits between copy passes. All wired into Database Replay. Local focused tests: 35 PASS; full Bun suite: 1,111 PASS / 0 FAIL (7,437 assertions); strict TypeScript and changed-source lint pass. Fresh isolated replay, 10 SQL suites and 9 race scripts pass; final build and exact-head Regression/Browser Quality/Database Replay evidence are recorded in the dedicated PR and final delivery after live verification.
- **Read-only data preflight:** Production has 2 folders, 0 invalid hierarchies, 0 cross-owner parent edges and 0 external Project-version parents at inspection time. No production records were edited. Existing verified backup/restore evidence is reused; backup integrity tests were not repeated.
- **PR / implementation revision:** [PR #434](https://github.com/Aeras/prompt-beats-studio/pull/434), implementation `9909642634a446e31bcf0690a784ef98cdd2d903`. The final tip (including documentation) and all three exact-head CI runs are recorded together in the PR description/final report. No merge or publish approval is implied by passing CI.
- **Release / recovery:** See `docs/PB-library-folder-drift-reconciliation.md`. Independent review, separately approved exact migration, recovery/history/data/ACL preflight and a short Library-write quiet window precede production application. Apply only the new file with a genuine new history record; do not fabricate the missing old migration's execution or broadly push other migrations. The new verified definitions supersede its effects; other historical naming discrepancies need independent classification. On failure, transactional rollback/forward correction; do not restore unsafe functions or disable RLS. No code publish is required for this SQL-compatible correction. Beta migration/publish remains its separately authorized next release after verification. Neither this task nor Beta is CLOSED.

## 2026-10-25 — AI Models inline administration / PR #435

- **Status:** `CODE_COMPLETE_RELEASE_PENDING` — existing Draft PR #435 remains Draft for independent review; no merge, production migration or publish performed.
- **Baseline / scope:** Continued `feature/ai-models-admin-table-20261025` from `38a2924cb464bd1b71c558c719142b18f42a6708`, based on main `5bdae5a6fff5bf9ea52aed771498344e78891b47`. Read the full approved three-change spec, traced management/auth/admin handlers, all four defaults (including the legacy fallback), model grants, provider discovery/health, live/recoverable jobs, usage evidence and database references. Existing advanced features and access semantics remain intact.
- **Implementation:** Compact round purple inline switches and custom dark menus; queued partial CAS writes with safe failure rollback; atomic audited bulk registry-only uninstall with active-default/dependency guards; inline burgundy confirmation above rows; focus restoration; sticky column header under the observed AppShell header and synchronized horizontal body scroll, with no nested vertical viewport. Selected-users opens the existing entitlement workflow without granting access. The legacy shared fallback has a replacement path that does not rewrite the three operation defaults.
- **Database / security:** Additive `20261025173752_ai_models_inline_admin_uninstall.sql`; caller-bound admin RPCs, revision checking, fresh dependency reads, shared/exclusive transaction fences, RLS/private tombstones, no changes to public/authenticated table access. No historical content, results or financial evidence deleted. Existing explicit user grants must be reassigned; unresolved auxiliary work blocks conservatively. Late usage evidence remains recordable. See [release/rollback and limitations](PB-AI-MODELS-INLINE-ADMIN-release.md).
- **Evidence:** 1,124 Bun tests / 0 failures (7,482 assertions), strict TypeScript, changed-source ESLint/Prettier, frozen installation and production build. Fresh isolated Docker migration replay; 11 SQL/RLS suites, 10 independent-connection race scripts and historical Library drift reproduction. Mocked Chromium desktop/tablet/mobile coverage and screenshots in the PR's Browser Quality artifacts; full exact-head Regression, Browser Quality and Database Replay results are attached to [PR #435](https://github.com/Aeras/prompt-beats-studio/pull/435). The final commit SHA and live check run links are recorded in its description to avoid a self-referential documentation commit.
- **Release dependency:** Independent review, separate approval for the exact migration and compatible Lovable publish, database preflight and an admin-model-write quiet window; reload old admin tabs after cutover. Do not call this task CLOSED before production verification. No paid AI calls or production changes occurred during verification.

## 2026-10-25 — PR #436 compact/sticky model table quick verification

- **Status:** IN_PROGRESS — focused verification and fixes complete; PR review/release remain separate.
- **Scope / baseline:** Existing `fix/ai-model-admin-compact-sticky-toolbar-20261025`, initial `f71cacb606c225d290929732755c46e1009ce946`. Verified removal of the per-row Selected-users shortcut, unchanged access-policy save, compact menus, sticky toolbar/columns and single vertical/horizontal scrolling.
- **Confirmed corrections:** Coarse-pointer global CSS kept selectors at 44px; an explicit 40px minimum is now confined to these controls. After end-of-list scrolling, mobile confirmation started 48px behind the sticky toolbar; opening now aligns it below the measured headers and focuses Cancel without an additional browser scroll. No backend, authorization or database changes.
- **Evidence:** Strict TypeScript, targeted ESLint/Prettier and 8 existing focused Playwright cases across desktop/mobile PASS. Updated stale assertions to the approved no-shortcut/two-sticky-row behavior; extended the same cases to cover compact height, unclipped menus and end-of-list confirmation. Requests/deletion are mocked. No full Bun suite, Docker/SQL/concurrency tests, production build, migration, publish or production deletion executed in this quick review.

- **PR #436 CI evidence correction (2026-10-25):** Focused TypeScript/lint/8 browser tests and Database Replay/Browser Quality passed at `a0faea8b`. Regression's initial/retried agent-contract check read an outdated immutable workflow event snapshot containing the original PR description, despite the live PR body having the four mandatory evidence headings. The live description is corrected; this documentation-only follow-up commit triggers a fresh PR event so all three mandatory gates can be verified on its exact new HEAD before merge. No new product or database changes.

### AI model uninstall dependency precision — IN_PROGRESS (PR pending; 2026-10-25)

- User requirement: uninstall any non-active-default installed AI model; preserve historical songs, QC outputs, billing and audit; don't block unrelated auxiliary jobs or historical user permissions; concise confirmation text. Active in-flight model use still needs a safe admission/settlement boundary, never a blanket bypass.
- Verified current SQL: `ai_model_uninstall_reasons` blocks any pending/processing `ai_auxiliary_requests` irrespective of selected model, plus `user_model_access` and legacy `ai_model` fallback. Production read-only check showed 7 auxiliary requests and 45 installed models; no production writes/deletions for this task.
- ChatGPT completed frontend wording simplification in this branch. Remaining: design migration with per-model auxiliary admission identity and concurrency fences, atomic entitlement cleanup/default fallback reconciliation, migration tests, client blocker UX and end-to-end gates; Codex specialized local work in same PR. No production migration/publish without separate release approval.

## 2026-10-25 — PR #437 precise model uninstall dependencies

- **Status:** IN_PROGRESS — implementation/verification in the existing Draft PR, pending independent review and separately authorized release; not CLOSED.
- **Baseline / investigation:** `fe05cd41ec058444da9aff635cf7846139404da5`, main `4a717bc94019c3afcc6699c7d5fc7f4690648b6d`. Traced all durable auxiliary call families, secondary Analyzer/provider models, finalization/accounting/outbox, defaults, access resolver and both database/client uninstall guards. Preserved the already simplified confirmation. Verified `inherit` grants only global operation defaults, so empty custom-list cleanup does not widen access.
- **Implementation:** Forward `20261025200633_precise_ai_model_uninstall_dependencies.sql`; private per-dispatch auxiliary/model/receipt identity, pre-dispatch server binding, async-context propagation, precise active/unknown-use blockers and existing global execution/outbox protection. Usage persists independently before association; queued/unknown or unacknowledged evidence remains model-specific and conservative. Grant arrays clean atomically; three active defaults remain unchanged/protected; legacy fallback is removed or safely redirected. CAS, audit (including pricing/fallback/cleanup metadata), tombstones, historical results and financial evidence are retained.
- **Verification:** Local frozen installation, 1,132 offline Bun tests / 0 failures (7,508 assertions), 66 mocked browser cases across desktop/tablet/mobile, strict TypeScript, changed-source ESLint/Prettier and production build PASS. Fresh isolated replay, 12 SQL/RLS suites and 11 independent-connection race scripts PASS, including exact-model admission/delete, settlement/delete, grant cleanup and legacy/default/history compatibility. Exact final full counts, HEAD and mandatory Regression/Browser Quality/Database Replay links are recorded together in PR #437 after live verification, avoiding a self-referential commit. No paid calls, production deletion, migration, merge or publish.
- **Release / limitations:** [Precise uninstall design and release plan](PB-AI-MODEL-PRECISE-UNINSTALL.md). Requires verified old-worker drainage and model-admin quiet window, then separately approved migration before compatible publish. Identity-free old dispatch fails closed; unidentified historical rows are retained, never guessed/backfilled. Unknown or unassociated usage requires trustworthy reconciliation for that specific model. No production closure is claimed.

### PB-GLOBAL-AI-USAGE — IN_PROGRESS (2026-10-25)

- User-approved Admin → Μοντέλα AI switch «Χρήση AI στην εφαρμογή»: ON permits all AI operations, OFF denies all new provider dispatches globally (including direct SDK/fetch, auxiliary/retries/analyzers/secondary judge). Requirement and concurrency/release safety in [spec](PB-GLOBAL-AI-USAGE-SWITCH-20261025.md).
- Initial ChatGPT investigation confirmed a central `modelCaller` and direct provider code routes, so a cosmetic client toggle or single-function gate is insufficient. One PR for complete server policy, atomic authorization and concurrency, UI, tests. No production change or assertion that old workers are drained.

## 2026-10-25 — PR #438 global AI usage switch

- **Status:** `CODE_COMPLETE_RELEASE_PENDING` — same existing Draft PR #438; independent review and separately approved migration/publish remain. No production SQL, deploy or paid provider calls.
- **Baseline / investigation:** Continued initial `d5f96072419b8ab2fbdded427f27c7eb18819f92`, main `48baa14a9e339f287218198acf95f49385cda941`. Full [dispatch inventory, authorization/concurrency contract and release/rollback](PB-GLOBAL-AI-USAGE-release.md) covers modelCaller, direct SDK/REST, Analyzer/RunPod, probes, retries, secondary requests and existing-operation exceptions.
- **Implementation:** Forward `20261025212141_global_ai_usage_policy.sql`, private RLS singleton ON default, fresh server-only admission and caller-bound admin CAS/audit. Row locks order OFF against admissions. Single-use permits precede journaling; every new transport/retry re-admits. Job admission/claim gating is atomic with quota; completion/cancellation/usage/cached recovery remain possible. Prominent localized AI Models switch saves confirmed server state, handles loading/stale/failure and explains in-flight behavior.
- **Verification:** Frozen installation; 1,142 offline Bun tests / 0 failures / 9,108 assertions; strict TypeScript, changed-source ESLint/Prettier and production build PASS. Fresh isolated Docker migration replay; 13 SQL/RLS suites, 12 independent-connection race scripts plus historical drift reproduction PASS. 69 mocked browser cases PASS across desktop/tablet/mobile with screenshots. Final exact HEAD and the three mandatory CI outcomes are recorded in existing PR #438 after live verification; no self-referential commit hash.
- **SLA / release boundary:** OFF denies requests not already admitted when OFF commits; already admitted requests may physically send/finish and settle after OFF. No claim of worker drainage or cancellation. #437 old-binary/drain prerequisite is separate; this switch cannot protect an old deployed binary. Policy read failure/missing migration fails closed. Keep Draft for independent review; not CLOSED until separately authorized compatible release and runtime verification.

## 2026-10-26 — Admin AI default selectors show installed registry

- **Status:** IN_PROGRESS — UI-only implementation in branch `fix/ai-default-model-list-visibility-20261026`; requires automated verification, three mandatory CI gates, review and release verification before closure.
- **Baseline:** main `b2e286017cc9a18602f4288808e0ae53f14640fb`. Previous selectors in `src/components/promptbeats/AiModelsPanel.tsx` filtered to `status=enabled` and operation-compatible models, hiding installed `testing` models entirely.
- **Change:** All three admin default-model selectors enumerate all installed registry rows, sort eligible choices before ineligible ones, and label/disable testing, inactive or operation-incompatible models. Save is additionally guarded against submitting an ineligible selection; server-side default-setting rules remain unchanged.
- **Acceptance / release:** Verify generator, AI Tools and Quality Check show all installed models and distinguish inactive/testing/incompatible without enabling selection; eligible defaults still save, invalid defaults are rejected server-side, no changes to user-facing model availability. Run focused tests, TypeScript, lint/format, build, Regression, Browser Quality and Database Replay. No production SQL, model activation, merge or publish performed.

- **CI retry note (2026-10-26):** Initial Regression gate was blocked by missing required PR-description headings; the four required headings were added. GitHub's failed-job rerun reused its original immutable pull_request event payload and failed identically; a fresh push is needed to generate a new event. Browser Quality and Database Replay passed on previous head; all three gates must pass on final head.

## 2026-10-26 — Failed Generator identity / safe terminal reconciliation

- **Status:** `CODE_COMPLETE_RELEASE_PENDING` — one dedicated PR from main `b2e286017cc9a18602f4288808e0ae53f14640fb`; no production mutation, reconciliation, merge or publish.
- **Verified root cause:** queued model resolution was discarded, and job.model/provider were filled only on success. Raw provider output remained a recovery candidate after deterministic application rejection; prior guard exhaustion was not trustworthy finality. Existing open HTTP-reporting PR #373 is independent.
- **Implementation:** pin the authorized selected model in all queued Generator payloads; capture initial and actual execution identity. Add forward `20261026053341_failed_generation_terminal_reconciliation.sql`, exact-response server validator attestation, final-receipt/outbox/owner/status checks and fenced idempotent terminal rejection. Retain raw results, financial identity and recovery counters. Bounded no-provider validation also covers settled failures after retry exhaustion. Unknown outcomes/usage, active/cancelled work and genuinely valid recoverable results stay guarded. Admin distinguishes active work, recovery and accounting; defaults/tombstones/RLS remain intact. [Full technical and separate release plan](PB-FAILED-GENERATION-RECONCILIATION.md).
- **Local evidence:** 1,150 offline Bun tests / 0 failures / 9,132 assertions; frozen installation, strict TypeScript, changed-source ESLint/Prettier and production build PASS. 72 mocked browser tests across desktop/tablet/mobile PASS. Fresh isolated migration replay; 14 SQL/RLS suites and 13 independent-connection race scripts plus historical drift reproduction PASS. Targeted tests include failed NULL model/response_observed/counter zero, active/cancelled denial, exact snapshot, final usage and cost precision, duplicate lost-ACK outbox delivery, exhaustion and concurrent resolver/uninstall. The historical admin fixture now supplies the final receipt its successful uninstall requires; no assertion was weakened.
- **CI / review:** final exact HEAD and Regression/Browser Quality/Database Replay outcomes recorded together on the single PR after live checks; no self-referential commit. Keep unmerged for human review.
- **Release dependencies:** separately approved exact migration and compatible publish, prerequisite #437/#438 schema and hosting/old-worker coordination, plus explicit approval before historical production reconciliation. Existing authenticated sweep must actually be invoked/scheduled; no production cron is created here. No invoice verification, fabricated zero usage, forced recovery-counter update, historical backfill, result deletion or paid call. Valid exhausted work remains protected, pending a separately reviewed recovery action.

## 2026-10-26 — Mobile Admin AI models viewport and Nemotron guard

- **Status:** IN_PROGRESS — PR pending exact-head CI and mobile browser verification; no publish or production data mutations.
- **Confirmed issue:** Admin models view on smartphone expands/clips horizontally. The wide installed-model grid is intended to scroll inside its own container, not enlarge the management page.
- **Change:** Explicit `min-w-0`/`w-full` on management content and AI models panel; model table constrained to viewport with internal horizontal scroll retained, sticky headings and uninstall selection preserved.
- **Read-only Nemotron evidence:** Exact installed model has one failed, stored `response_observed` execution with final durable usage but no `application_resolution`; `job.model` remains NULL. Both `unresolved_execution` and `recovery_pending` guards are currently correct. Do not delete, fabricate usage or mark resolved without authorized deterministic stored-response validation. Existing #440 migration is installed but not a scheduled or executed historical reconciliation.
- **Acceptance:** Real mobile-width Browser Quality checks for no document overflow at model table and confirmation, scroll internal table horizontally, keyboard and uninstall blocker remain safe; Regression and Database Replay PASS on exact PR head. Follow approved separate release verification; not CLOSED without publish/production confirmation.

## 2026-10-26 — Admin AI model responsive mobile cards follow-up

- **Status:** IN_PROGRESS — corrective PR after #441 passed CI but failed real-device acceptance; no production claim or schema modification.
- **Root gap:** The installed-model grid retained desktop 1090px columns and internal horizontal scroll on smartphone. Fixed viewport bounds did not deliver legible mobile controls, as demonstrated by user Android screenshots after publish.
- **Change:** At phone widths render each model as a two-column labeled card with all status/generator/QC/access/pricing/edit/health controls; retain existing shared ModelRow mutations, default protection and uninstall blockers; on desktop retain original scroll table, sticky header and exact column behavior. Add mobile/desktop regression assertions.
- **Definition of done:** Three exact-head CI gates green; phone viewport fits without document horizontal overflow; model cards and uninstall confirmation usable; desktop unchanged, no live deletion, and post-publish physical device verification still required. No historical Nemotron reconciliation is authorized by this UI scope.

## 2026-10-26 — Revert failed mobile Admin UI experiments (#441, #442)

- **Status:** CODE_COMPLETE_RELEASE_PENDING — restore exact four code/test files to verified pre-#441 commit `f45a53ada0fcf8d3a4bd00c81e8923f398a354bb` without touching #439/#440 server logic, migrations, model records, or database.
- **Reason:** Actual Android owner verification established that both attempted UI fixes, especially mobile cards in #442, materially degraded the management UI despite green mocked CI. User explicitly requested complete removal.
- **Release:** Merge only after all three exact-head gates succeed; Lovable publish and device confirmation are distinct requirements. The original mobile overflow issue is not claimed solved. Never rewrite pushed Git history or down-migrate.

## 2026-10-26 — Admin AI models responsive page repair

- **Status:** IN_PROGRESS — correct the confirmed portrait document overflow in the three default model controls, preserving the installed-model table and its internal horizontal scrolling.
- **Evidence:** Production Chromium measurements in user Report.md: document 653 CSS px for portrait viewports 360/390/412, default cards ~637 px, native selects ~426 px. Installed table container ~341 px at 390 and scrolling works independently. Additional whole-tab checks remain mandatory.
- **Scope:** intrinsic-size containment and responsive select/save layout, full page viewport regression checks, no card redesign or model changes.
- **Release:** Require focused/full tests and all three exact-HEAD CI checks; verify published Android manually after deliberate Lovable publish. No merge/deploy until green and reviewed.

## 2026-10-26 — Hide inactive AI models from default dropdowns

- **Status:** CODE_COMPLETE_RELEASE_PENDING — default selectors now automatically show only installed records with status enabled. Inactive/testing entries remain installed in the management table but no longer appear in the three default selectors.
- **Scope:** No manual model list, no changes to compatibility/save guard, model status, database or installed-model table. Re-activation makes entries appear again on refreshed registry.
- **Verification/release:** Require three exact-HEAD CI gates and review; merge and publish are separate steps, with actual mobile dropdown checks after publish.

## 2026-10-26 — Generator setup Import/Export outside-tap dismissal

- **Status:** IN_PROGRESS — dismiss Advanced Generator Import/Export JSON/MD dropdowns on outside pointer/tap and Escape, preserving menu item actions, keyboard operation and same-button toggle.
- **Implementation:** Document listeners only while a setup menu is open, scoped to the active trigger/dropdown wrapper. No backend/database/AI changes.
- **Release:** Require three exact-HEAD CI gates; deliberate merge and Lovable publish are separate, and actual smartphone validation remains necessary.

## 2026-10-27 — Cultural Song Atlas Beta

- **Status:** `CODE_COMPLETE_RELEASE_PENDING` — one Draft PR from main `adef34e31803a5e41736144066fe5c90db2f0184`; no merge, production migration, publish, general enablement or paid AI calls. All RC1 creative options remain unapproved.
- **Investigation / ownership:** Codex read live repository contract, ledger, Beta spec/release guide and owner-approved handoff; verified main/open PRs, exact RC1 SHA and production prerequisites read-only. Existing Beta schema is present, Atlas is not registered in production, 19 legacy policies remain. Traced routes/navigation, strict Advanced Setup v1, Generator admission/worker/provider path, fresh auth/Beta SQL, i18n and tests.
- **Implementation:** 58-card internal research preview, 14 candidates excluded, provenance and context-only distinction; account-scoped independent selections/conflicts, no inferred musical/narrative directives. Immutable server-only canonical source retains 65 techniques/97 sources and exact SHA. Strict independent versioned handoff, selected-only compiler, unchanged v1 importer, explicit Generator bridge; unapproved options blocked in UI/server/raw SQL/worker. Additive `20261027011834_register_cultural_song_atlas.sql` registers only this Beta key; fresh internal-preview/worker admission, no legacy policy changes.
- **Evidence:** 13 focused source/compiler/auth tests; full offline Bun 1,163 PASS / 0 failures / 9,425 assertions; strict TypeScript, changed-source ESLint (0 errors; four pre-existing Generator hook warnings), Prettier, frozen install and production build PASS. New desktop/tablet/mobile browser and isolated SQL/RLS plus independent-connection revocation tests PASS. Full legacy local SQL runner encountered a pre-existing duplicate synthetic fixture in the shared disposable DB; no shared records were deleted to hide it. Fresh CI Database Replay verifies the complete isolated history and suites. Exact final counts, SHA and all three mandatory CI links are recorded together in the Draft PR after verification. Windows-only CRLF source-test differences normalized locally to match CI, without Git content changes to historical files. Existing validator extraction fixtures now bind the actual optional Atlas schema; no validation assertions were weakened.
- **Release / remaining:** [Design, limits, individual editorial promotion and safe migration/publish/rollback](PB-CULTURAL-SONG-ATLAS-BETA.md). RC1 is not public-browse/Generator approved; this restriction is deliberate. Independent review plus separately approved exact migration, recovery/prerequisite/legacy-policy checks and compatible Lovable publish required before CLOSED. Beta access never substitutes for individual content approval. Already delivered bytes cannot be revoked retrospectively; fresh server/SQL requests remain authoritative.

- **Exact implementation evidence / PR:** [Draft PR #448](https://github.com/Aeras/prompt-beats-studio/pull/448), implementation `f3c83672d534078cd3613f3cb0e26abbd460c79f`: [Regression PASS](https://github.com/Aeras/prompt-beats-studio/actions/runs/40434094982/job/121958517240), [Browser Quality PASS — 90 tests](https://github.com/Aeras/prompt-beats-studio/actions/runs/40434094904/job/121958517231), [Database Replay PASS](https://github.com/Aeras/prompt-beats-studio/actions/runs/40434094922/job/121959126040). The first replay attempt failed before migrations because host port 54322 was occupied; retry on the same SHA passed fresh replay and every SQL/race suite. Local Atlas browser coverage: 15/15 PASS, including failed-handoff preservation of existing Generator instructions. Final documentation-inclusive HEAD and its three gates are recorded in PR #448 after verification; PR stays Draft. No production release or content approval is claimed.

- **Final review correction:** Repeated handoff application also preserves later manual edits without duplicating an already-present selected directive; covered by the same deterministic merge regression. Final PR tip re-runs all three gates after this narrow correction; no live transfer is enabled.

## 2026-10-27 — PR #448 Atlas instruction provenance correction

- **Status:** `CODE_COMPLETE_RELEASE_PENDING` — same Draft PR #448, reviewed baseline `fc56960978ec88cae7137012403a5229c77b21ce`; no new branch/PR, production operation, content activation or paid AI call.
- **Root cause / full lifecycle:** Atlas previously merged into the editable manual string using substring matching and a whole-string callback; removal detached metadata but left merged text. Audited apply, async edits, replace/remove, draft refresh, setup export/import and generation submission. Old v1/plain text lacks trustworthy ownership and cannot be automatically subtracted.
- **Correction:** Separate strict versioned Atlas-owned read-only layer and editable manual instructions. Apply/reapply/replace/remove update only the layer; functional updates never replace manual state. Compose only on submission with an explicit combined limit. Persist manual snapshot/layer separately, preserve ambiguous recovered text for explicit review, and use a distinct Atlas-bearing setup envelope while ordinary Advanced Setup v1 remains unchanged. Edited provenance is rejected without touching current fields. In-flight removal invalidates pending validation. Existing Beta/server/SQL/worker RC1 blocks unchanged.
- **Verification:** 25 focused ownership/source/compiler/auth tests PASS; full offline Bun 1,175 PASS / 0 failures / 9,457 assertions. All 21 relevant mocked browser cases PASS across desktop/tablet/mobile, including apply/remove, manual edits during validation, refresh, replacement and in-flight removal. Frozen installation, Beta checker, strict TypeScript, changed-source ESLint (0 errors; four pre-existing Generator hook warnings), Prettier and production build PASS. All final exact-head Regression/Browser Quality/Database Replay links and outcomes are recorded in [Draft PR #448](https://github.com/Aeras/prompt-beats-studio/pull/448) after live verification. No SQL or worker admission changes in this correction. No assertion is weakened and no live option is approved. See [updated provenance, ambiguity and release notes](PB-CULTURAL-SONG-ATLAS-BETA.md).

## 2026-10-27 — Cultural Song Atlas cascading navigation

- **Status:** CODE_COMPLETE_RELEASE_PENDING — implemented and locally verified; one Draft PR for independent review, no production action.
- **Scope / investigation:** Baseline main dd403170460af9dbfcc033f1be3179cf347dc1f3, merged #448. Codex re-read AGENTS/ledger and live GitHub; traced source/projection/shared contracts, i18n, UI primitives, strict handoff/Generator and Beta/server/SQL/worker gates. No overlapping navigation PR. Native classification picker and raw metadata labels replaced only within Atlas browsing.
- **Implementation / ownership:** Explicit immutable 58-profile navigation sidecar; collection-scope geography clearly distinguished from historical origin, source family vs entity type preserved. Cascading five-stage browsing, dependent-only resets, independent research selections, shared controlled 42px Radix/Command dropdown, bounded search/scroll and keyboard/outside/toggle/Escape. EL/EN resources follow existing useI18n. Original Russian plus fixed Latin names; actual claim language retained; honest untranslated content notices.
- **Content evidence / gaps:** No unsupported country-origin mapping or invented subgenre. All 58 lack approved localized names; Greek-only descriptions and English-only technique wording remain explicitly marked. Full source-based mapping, convention and limitations in [navigation design](PB-ATLAS-NAVIGATION-20261027.md). Source hash, 58/14/65/97 counts, disabled techniques and all existing authorization/Generator gates unchanged.
- **Verification / PR:** Frozen installation, 33 focused tests, full offline Bun 1,183 PASS / 0 FAIL / 11,330 assertions, strict TypeScript, changed-source ESLint, Prettier, Beta registration check and production build PASS. All 36 unique Atlas browser cases passed across desktop/tablet/mobile (33-case run plus three added keyboard-only cases; nine affected cases rechecked), including source fallback, cascading/reset, touch/outside/toggle/Escape, internal/page scroll, axe and Generator provenance preservation. Initial local failures exposed cmdk accessible-name defaults and exit-animation overlap; both corrected, not suppressed. Existing Windows CRLF contract differences and sandbox temporary-file restrictions were handled only in the test environment, without changing historical code/tests. Final exact HEAD and three mandatory CI links/outcomes are recorded in the single Draft PR after live verification; no obsolete HEAD substitutes for final CI.
- **Release / remaining:** No new SQL migration; no production migration, merge, publish, paid AI or general enablement authorized. Prior approved Atlas registration was applied in the preceding task; no application publication is inferred. Independent review, explicit merge/release authorization and actual device acceptance remain before CLOSED. Rollback retains additive SQL and every RC1 deny guard.

## 2026-10-27 — PR #449 independent-review musical taxonomy correction

- **Status:** CODE_COMPLETE_RELEASE_PENDING — corrected and locally verified in the same Draft [PR #449](https://github.com/Aeras/prompt-beats-studio/pull/449); second review and release remain separate, no new branch/PR or production action.
- **Investigation / root cause:** Re-read current AGENTS/WORK-STATUS and the complete 12-file PR diff; verified live PR HEAD f32b83750378cb2ae12325bcd553231682afba47 and main dd403170460af9dbfcc033f1be3179cf347dc1f3. The previous fourth level copied entity_type and did not deliver musical subcategory navigation; its initial tests proved source equivalence, not the actual product acceptance. This correction supersedes that claim.
- **Correction / owner:** Codex. All 58 sidecar entries now separate named subgenres, forms/performance formats, historical scenes, cultural/thematic contexts, uncertain style references and general/unspecified entries. Stable IDs and EL/EN labels are independent of entity_type. Exact original name_ru evidence is retained per profile. Named overlapping styles have multiple paths to the same unique card. Where no finer subgenre is documented, clearly typed named fallback paths avoid inventing one. Source family membership is preserved; no musical/acoustic or geographic inference.
- **Verification:** 39 focused tests PASS, including actual Rock/Pop/Rap/Folk choices, no-subgenre/overlap paths and conservative treatment of ambiguous entries. Full offline Bun **1,189 PASS / 0 FAIL / 12,007 assertions / 171 files**. All **54** Atlas browser cases PASS on the final dataset across desktop/tablet/mobile, including six new taxonomy/typed-fallback/Greek-label scenarios per viewport and every previous compact dropdown, scroll, keyboard, axe, localization and Generator provenance case. Frozen install, strict TypeScript, changed-source ESLint, Prettier, Beta registration (19 legacy keys unchanged), production build and diff checks PASS. The new final HEAD and three mandatory CI links/outcomes are recorded together in the same PR after live verification; the old f32b8375 results do not substitute for new-head CI.
- **Release / boundaries:** Original RC1 SHA, 58 profiles / 14 candidates / 65 unapproved techniques / 97 sources, compact dropdown/mobile/accessibility behavior, locale framework, Generator provenance/handoff and every Beta/server/SQL/worker guard retained. No migration, merge, publish, paid AI or technique activation. Updated [full 58-profile mapping and limits](PB-ATLAS-NAVIGATION-20261027.md). Independent second review and separate release authorization remain required; not CLOSED.
- **Visual accessibility follow-through:** Reviewing the new Rock popup screenshot exposed secondary-label selected-state contrast of 1.24:1; a focused open-popup axe assertion reproduced the serious WCAG failure. The same existing CompactDropdown now uses the existing accent-foreground token for selected secondary text (two class changes only). All 12 affected Rock/Greek/dropdown cases passed across the three viewports after correction, including the new axe assertion; full Bun remained 1,189 PASS. The complete 54-case browser run predates this final color correction, so the final exact-head Browser Quality run is the full-suite authority for it. No contrast assertion was suppressed.
