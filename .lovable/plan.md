# Build failure diagnosis — current state

## What the build reports right now

Both the type check and the actual bundler fail on one and the same thing:

```text
typecheck: src/routes/library.tsx(976,15): error TS1005: ':' expected.
build:    Error transforming route file /dev-server/src/routes/library.tsx:
          SyntaxError: Unexpected token, expected ":" (976:14)
          -> [plugin tanstack-start:route-tree-client-plugin] Crawling result not available
```

The second bundler message ("Crawling result not available") is a follow-on effect: the route
tree cannot be crawled because one route file failed to parse. There is exactly **one** real
error.

## Exact cause

`src/routes/library.tsx` line 933 opens a conditional expression that is never closed:

```tsx
{openProject ? (() => {
   ...
})()}        // <- line 976: the "? ... :" has no ":" branch
```

The parser reaches the end of the immediately-invoked function on line 976, expects `:` and
the alternative branch, finds `}` instead, and aborts. This is the block that renders an
opened Project; the recent Library folders work rewrote the surrounding markup (the folder
breadcrumb/grid branch starting at line 740) and the alternative branch of this inner ternary
was lost.

## Minimal fix

One line, `src/routes/library.tsx` line 976 — close the ternary:

```tsx
          })() : null}
```

No database change, no migration, and no change to `LibraryFolderPicker.tsx`,
`library-folders.functions.ts`, `library-folders.test.ts`, or
`20260922210500_library_folder_integrity_hardening.sql` is implicated — the compiler never
reaches those files.

## About the Linked Audio Results work

The files named in the latest request are **not present in this sandbox**:

- `src/components/promptbeats/ProjectVersionLinkedTracks.tsx` — does not exist
- `src/lib/project-version-tracks.functions.ts` — does not exist

`ProjectVersionHistory.tsx`, `ProjectVersionCompare.tsx` and `player.tsx` are present and
contain no linked-track code. So the sandbox source is not at commit `69f4243…`; the working
source still corresponds to the Library folders state. Nothing about the linked-audio feature
can be checked until that code is actually in the sandbox, and no linked-audio file appears in
any build error.

## Follow-up the fix will expose

Once `library.tsx` parses, the type checker continues into the rest of the project, where a
large set of pre-existing strict-mode errors (test-runner types, optional/undefined
mismatches, index-signature access) will reappear. Those are unrelated to the Library folders
work and separate from this publish blocker.

## One behavioural observation (not a build error)

The analyses list (`filteredAnalyses.map(...)`, line 928) sits inside the branch guarded by
`view === "all" || (view === "projects" && !openProject)`. In the Analyses view with no
project open, the alternative branch renders nothing. Closing the ternary with `null` keeps
that as-is; if the Analyses tab should show the list, that branch needs the list rather than
`null`. Worth confirming before the fix is applied.

## Scope

Diagnosis only — no files, commits, configuration, secrets, database, or deployments changed.
