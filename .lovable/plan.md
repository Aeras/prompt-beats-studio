# EN/EL generator localization cleanup

## Scope

- Add stable English and Greek translation keys for the confirmed Generator, Quality Check, Lyrics Workspace, Song Analyzer handoff, Story-driven lyrics, Song Setup Assistant, and Story Map save messages.
- Replace only the identified hardcoded user-visible strings in `src/routes/generate.tsx`; leave unrelated inline EN/EL conditionals unchanged.
- Add a small client-side error-message mapper in `generate.tsx` for known generation and Quality Check failures. Known messages resolve through translation keys; unknown messages use the existing localized generic failure message rather than exposing raw errors.
- Update focused regression tests, including the Lyrics Workspace feature-access assertion, to require translation-key usage and prevent the listed English literals from returning to the route.

## Validation

- Run the focused localization/feature tests and formatting checks for touched files.
- Review the harness typecheck/build results, distinguishing any pre-existing project errors from this patch.

## Boundaries

- No AI prompts, provider behavior, model routing, credits, feature-access rules, database schema, migrations, Supabase settings, or layout changes.
