# Plan: Clear the 14 remaining type errors (publish blocker)

## Context

With the three extra-strict flags relaxed (`noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — kept ON in tsconfig, relaxed only for measurement), the typecheck drops from 101 to 14 errors. The other 87 errors are all fixable inside the code without changing tsconfig. This plan fixes the 14 true errors that remain even with those flags relaxed, so a full strict typecheck can then pass once the remaining 87 are addressed in the same pass.

## Scope

Type-only fixes. No behavior, runtime, provider, AI-call, database, migration, or styling changes.

## Errors to fix (14)

1. **src/lib/song-analyzer-final.functions.ts (286–289, 4× TS18047)** — `stage0Evidence.tempo` possibly null: add a null guard/narrowing before the four accesses.
2. **src/lib/song-analyzer-stage-a-guard.functions.ts (491 TS2531, 500 TS18047)** — guard the possibly-null object/`inner` before property access.
3. **src/lib/song-analyzer.functions.ts (1124, TS2345)** — `songSections[].startSeconds/endSeconds` typed `unknown` vs `number | null`: type the mapped section objects explicitly as `number | null` (parse/validate the unknown values, defaulting to null) so the argument matches the parameter type.
4. **src/lib/qdrant-music-memory.functions.ts (250, TS2345)** — server-fn return not serializable: `MusicMemoryMatch.payload` is `Record<string, unknown>`; narrow the payload type to a JSON-serializable shape (or sanitize before returning) so `ValidateSerializableMapped` accepts it.
5. **src/lib/song-analyzer-enhanced.functions.ts (369, TS2345)** — same serializability class: `canonicalEvidence.tempo.sources` is a Zod passthrough object with `unknown` index values; strip/narrow passthrough extras to known JSON fields before returning.
6. **src/lib/song-universe.functions.ts (265, 354, 2× TS2345)** — `project.contextSnapshot` not serializable per `ValidateSerializableMapped`: make the snapshot type fully JSON-typed (replace `unknown`/loose fields with concrete JSON types).
7. **src/lib/song-universe-memory.server.ts (401, TS7006)** — implicit `any` on `summary` parameter: add an explicit type.
8. **src/lib/ai-model-refresh.test.ts (1) and src/lib/song-analyzer-resilience.test.ts (1) (TS2307 vitest)** — these tests import `vitest` but the repo test runner is `bun:test` (see `src/types/bun-test.d.ts`): switch the imports to `bun:test` to match the existing test pattern.

## Verification

- `bunx tsgo --noEmit -p tsconfig.json` — confirm these 14 are gone and no new errors appear (remaining count should drop to the 87 flag-related errors, which are fixed by the same pass only if in scope; otherwise reported separately).
- `bunx tsgo --noEmit -p tsconfig.json --noPropertyAccessFromIndexSignature false --noUncheckedIndexedAccess false --exactOptionalPropertyTypes false` — must reach 0 errors.
- Run the two converted test files with `bun test` to confirm they still pass.

## Out of scope

- The 87 errors that disappear when the three strict flags are relaxed (TS4111/TS18048/etc.) — separate decision: either fix them in code or relax the flags in tsconfig. Awaiting user direction.
- No tsconfig changes, no migrations, no publish.
