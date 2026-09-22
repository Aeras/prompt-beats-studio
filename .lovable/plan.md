# Build failure diagnosis — Library folders changes

## Result of running the current build check

The type/build check stops immediately with a single error:

```text
src/routes/library.tsx(976,15): error TS1005: ':' expected.
```

This is a syntax (parse) error, not a type error. Because the file cannot be parsed, the
compiler aborts there — no other file is reported, and any further errors in this file are
hidden until this one is fixed.

## Exact cause

`src/routes/library.tsx` line 933 opens a conditional expression:

```tsx
{openProject ? (() => {
   ...
})()}        // <- line 976: the ternary has no ":" branch
```

The `? ... :` expression started on line 933 is never completed. The parser reaches the end
of the immediately-invoked function on line 976 and expects `:` followed by the alternative
branch, finds `}` instead, and fails.

This is the branch that renders an opened Project (the `view === "analyses"` / non-list case).
The recent Library folders work rewrote the surrounding block (the folder breadcrumb + folder
grid branch that starts at line 740) and the alternative branch of this inner ternary was lost.

## Minimal fix

One line, in `src/routes/library.tsx` line 976 — close the ternary with an explicit empty
branch:

```tsx
          })() : null}
```

Nothing else is required to make the build parse. No database change, no migration, and no
change to `LibraryFolderPicker.tsx`, `library-folders.functions.ts`,
`library-folders.test.ts`, or `20260922210500_library_folder_integrity_hardening.sql` is
implicated by this error — those files are never reached by the compiler.

## Follow-up that the fix will expose

Once the file parses, the type checker will continue through the rest of the project. The
project already carried a large set of pre-existing strict-mode errors (test-runner types,
optional/undefined mismatches, index-signature access), so expect those to reappear in the
report. They are unrelated to the Library folders work, and they are separate from the
publish blocker above.

## One behavioural observation (not a build error)

The analyses list (`filteredAnalyses.map(...)`, line 928) lives inside the branch guarded by
`view === "all" || (view === "projects" && !openProject)`. In the `analyses` view with no
project open, the alternative branch currently renders nothing. Closing the ternary with
`null` keeps that as-is; if the Analyses tab is expected to show the analyses list, that
branch needs the list rather than `null`. Worth confirming before the fix is applied.

## Scope of this task

Diagnosis only — no files, commits, configuration, secrets, database, or deployments were
changed.
