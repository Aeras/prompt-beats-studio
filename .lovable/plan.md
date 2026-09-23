# Build diagnosis — after the Linked Audio Results work

## Status change since the last check

The earlier publish blocker in `src/routes/library.tsx` (the unclosed `? :` at line 976) is
**gone** — the source has since synced and that branch is now well-formed, with the analyses
list rendering in its own branch at line 981. The bundler's "Crawling result not available"
was only fallout from that parse error and no longer applies.

The build now fails on type errors instead: **318 errors**, none of them fatal parse errors.

## Errors in the files you named

### src/components/promptbeats/ProjectVersionLinkedTracks.tsx — 2 errors (new, from this work)

1. **Line 46** — `TS2375`: the object returned by `toPlayerTrack` is not assignable to `Track`
   under `exactOptionalPropertyTypes`. Cause: `audioUrl: track.audio_url ?? undefined`
   produces `string | undefined`, while `Track.audioUrl` is declared `audioUrl?: string`
   (optional, but not allowed to be explicitly `undefined`).
   *Minimal fix:* omit the key instead of setting it to `undefined` —
   `...(track.audio_url ? { audioUrl: track.audio_url } : {})`.

2. **Line 172** — `TS7006`: `Parameter 'track' implicitly has an 'any' type` in
   `rows.map((track) => ...)`. Cause: `rows` comes from `listLinkableProjectTracks`, whose
   handler in `src/lib/project-version-tracks.functions.ts` (lines 121–141) queries through
   `(supabaseAdmin.from("tracks") as any)` and maps with `(track: any)`, so the whole returned
   `tracks` array degrades to `any`.
   *Minimal fix:* give the mapped result an explicit element type in the server function —
   declare a small `LinkableTrack` type and annotate the mapped array — which types `rows`
   and removes the implicit `any` at the call site.

### ProjectVersionHistory.tsx, ProjectVersionCompare.tsx, src/lib/player.tsx

**No errors.** These three are clean.

### src/lib/project-version-tracks.functions.ts

No errors reported directly, but its `as any` query/mapping is the root cause of the
implicit-any above.

### src/routes/library.tsx — 9 errors (pre-existing, unrelated to linked audio)

- Lines 162, 227, 238 (x2), 245 (x2): `Track[]` vs
  `{ sourceType?: string | null; source_type?: string | null }[]` round-tripping through
  `filterByTrackSource` — the helper's parameter type loses the `Track` shape, so the filtered
  result can't go back into `Section`. *Minimal fix:* make `filterByTrackSource` generic
  (`<T extends { sourceType?: ...; source_type?: ... }>(items: T[]): T[]`).
- Lines 503, 506: `TS4111` — `target.dataset.libraryFolderDropId` /
  `...DropPath` must use bracket access: `target.dataset["libraryFolderDropId"]`.
- Line 1033: `TS2375` — props passed to the action menu include explicitly `undefined`
  handlers under `exactOptionalPropertyTypes`. *Minimal fix:* widen those prop types with
  `| undefined`, or omit the keys when unset.

## The rest of the 318

Pre-existing strict-mode debt, unchanged by this feature. Largest clusters:

- `ModerationCaseThread.tsx` — 49 (all downstream of one server function returning an untyped
  `payload`; typing that return collapses nearly all of them)
- `PlaylistLibraryPanel.tsx` — 19
- `src/routes/index.tsx` — 11
- `admin.functions.ts` — 8, `song-analyzer-essentia.worker.ts` — 7, `ai.functions.ts` — 6
- Test files (`*.test.ts`) — `Cannot find module 'bun:test'`; the test runner types are not in
  the tsconfig `types` list

## Database

No migration or schema change is required for any of these errors.

## Scope

Diagnosis only — no files, commits, configuration, secrets, database, or deployments changed.
