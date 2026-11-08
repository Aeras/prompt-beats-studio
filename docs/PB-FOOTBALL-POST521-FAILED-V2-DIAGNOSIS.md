# Football Research — post-#521 failed V2 analysis

**Status:** local correction in progress; release and production verification pending.
**Baseline:** `main` after #521, `fb2ca7dfeaf5f583a3b0a6418bae478debfac315`.
**Local branch:** `codex/football-ai-failure-diagnosis-20261107`.

## What the saved runs prove

The two latest read-only receipts for Fiorentina–Juventus ended with `incomplete_coverage` and `fullEvidenceV2.reason=invalid_judgment`. Both identify `searchProfileVersion=v2_experimental`, `mode=single_full_text`, one model call, 20 discovered results and 16 readable unique texts. Thus these failures occurred after V2 retrieval and model execution; they were not V1 fallback or the V2 query-length rejection.

The receipts report zero independently eligible publishers. They retain candidate counts and validation-reason totals, but not the model's final response or the exact failed validation predicate. The specific trigger in those two runs therefore cannot be established from the saved evidence. No new paid or production call was made.

## Confirmed code defects

1. `createRestorationPolicy().judge()` treated any source-grounded editorial candidate as proof that the statement “no published predictions” was false. It did not distinguish “no predictions were found” from the materially different “no independently verified predictions could be counted.” A real quoted pick from an unreviewed publisher can be visible while correctly remaining ineligible for consensus. This heuristic could reject a valid provider-only assessment in that state. The receipts do not preserve enough model text to prove it caused either specific incident.
2. Failed history rows have `analysis=null`, while the run's selected V2 profile is retained in `usage.research.searchProfileVersion`. The history badge read only the analysis object and consequently mislabeled these V2 runs as old records with no profile.
3. All exceptions thrown during restoration judgment were collapsed to the same `invalid_judgment` state. The saved incident therefore cannot say whether the model response shape, market, source reference, combination, or published-prediction consistency check failed.

## Local correction

- Qualified statements that specifically say no **independently verified/countable** picks were available are accepted only when there is no eligible consensus pick. An unqualified denial remains rejected when a source-grounded pick exists, and any denial remains rejected when an eligible pick exists.
- Judgment validation now emits a bounded enum of failure details. The details are stored separately in the existing JSON usage receipt, returned only after schema validation, and translated into short Greek/English UI messages. Raw model output is not persisted or displayed.
- Failed history reads the validated profile from the existing usage receipt, so V2 failures are labeled as V2.
- Existing V1 behavior, fixture/source verification, consent, idempotency, one-call limit, history schema and strict full-evidence sidecars remain unchanged. No SQL migration is required.

## Verification and limits

- TypeScript `--noEmit`: PASS.
- ESLint on changed source/test files: PASS.
- Prettier check on changed files: PASS.
- Production Vite/Nitro build: PASS (existing repository-wide deprecation and route-discovery warnings remain).
- Full Evidence V2 browser matrix: 18/18 PASS across desktop, tablet and mobile, Greek and English, complete/incomplete/invalid-judgment states. Tests use mocked providers and report zero paid calls.
- Direct deterministic checks of the actual helpers: five English/Greek/Russian denial cases plus V2 history-profile reading: PASS.
- The two focused test files: native Bun completed 86/86 PASS (4,195 expectations). The five direct helper vectors also passed.
- Full Bun regression: one full run completed with 2,070 PASS, 1 skip and 8 failures across non-Football areas. The failures included tests in V4 prompt, Inspiration Wall, PB-005, project bulk delete/version history, prompt registry, Supabase cutover and root i18n. A follow-up reproduction found this worktree's `node_modules` is a junction into the primary checkout, outside the authorized writable test root. Bun 1.4.2 could not resolve packages through it (`zod`, `typescript`, React/TanStack packages): 67 import-resolution errors and only 910 tests loaded. Node can resolve the same installed packages. An offline Bun install was rejected with `EPERM` before changing files; the junction and primary checkout were left untouched. Four directly inspected unrelated source-contract assertions also compare LF literals against CRLF checkout text. The full suite is therefore not a green or stable verification result; it must be rerun in a correctly resolving environment. No dependency install or unrelated test changes were made.
- No production write, migration, paid call, merge or publish was performed for this correction. One consolidated push created Draft PR [#522](https://github.com/Aeras/prompt-beats-studio/pull/522) at `c6bd5433db3d2d9aaaf44000e2eb74fbe0a0fa97`. On that exact HEAD, Database Replay and Browser Quality passed. Regression stopped at the agent-contract gate because the PR description omitted its required headings; test jobs were skipped. A corrected description and updated ledger are prepared locally, pending the required approval before another CI-triggering update.

## Acceptance boundary

This change improves one confirmed false-rejection rule and makes future V2 failure reasons diagnosable. It does **not** prove the exact hidden trigger for the two already-saved runs, nor guarantee that a new analysis will complete. Those old runs remain immutable and are not retried. The focused Football tests and browser matrix pass, but the full repository regression is currently unreliable due to Bun dependency resolution plus unrelated line-ending-sensitive assertions. Draft PR #522 remains unmerged; its initial Regression check needs the required PR-body headings before a new exact-head gate run. A new paid analysis and publish/runtime verification require their own approval.
