# Plan: Fix the 3 remaining Library type errors (optional)

## Context

Fresh diagnostic at synced HEAD `c00d5c4` (matches GitHub main): track.$id.tsx and management.tsx are error-free; total is 73 errors, mostly pre-existing backlog in server/lib files. The only errors tied to recent work are 3 in `src/routes/library.tsx` (lines 227, 245 twice): the track-source filter helper returns `unknown[]`, which cannot be assigned to `Track[]`.

## Steps

1. In `src/lib/track-sources.ts` (or wherever `filterByTrackSource` lives), restore a generic signature: `<T extends Track>(tracks: T[], source): T[]` so callers keep their `Track[]` type, without breaking the exactOptionalPropertyTypes fix that landed in `3c79e2c`.
2. Verify the 3 errors in `src/routes/library.tsx` clear and no new errors appear.

## Verification

Run `bunx tsgo --noEmit -p tsconfig.json` and confirm `src/routes/library.tsx` reports zero errors and the total drops from 73 to 70.

## Out of scope

- The remaining ~70 pre-existing errors (admin.functions.ts, song-analyzer, ai.functions.ts, etc.) — can be a separate cleanup pass on request.
- No database, migration, config, or publish changes.
