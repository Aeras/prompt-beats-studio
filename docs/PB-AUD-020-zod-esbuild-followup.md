# PB-AUD-020 — remaining Zod and esbuild findings

## Verified baseline and scope

Implementation base: `main` at `f9e0dcec535213a1cc0b1e083732827896f17b1f`,
24 October 2026. This follows PR #403 and the historical
`docs/PB-AUD-020-dependency-hardening.md`; that document describes its earlier
13/15 partial remediation and is not rewritten as if it covered this follow-up.
Fresh baseline `bun audit --json` reproduced exactly the two outstanding advisories.
The original local checkout and user files were preserved in a separate worktree.

No prompts, models, Quality Check scoring, subscriptions, prices, authentication,
database migrations or production services have been changed. No provider calls.

## Dependency and reachability decisions

| Dependency              | Before                           | After                                 | Security outcome               |
| ----------------------- | -------------------------------- | ------------------------------------- | ------------------------------ |
| Direct Zod              | 3.25.76                          | 4.6.7, exact                          | GHSA-mrhx-c7xc-m3w5 removed    |
| Drizzle Kit (dev)       | 0.31.10                          | Removed, with explicit owner approval | Unused scaffold retired        |
| Drizzle ORM (dev)       | 0.45.2                           | Removed, with explicit owner approval | No application imports existed |
| @esbuild-kit/esm-loader | 2.6.5                            | Removed transitively                  | Vulnerable path eliminated     |
| @esbuild-kit/core-utils | 3.3.2                            | Removed transitively                  | Vulnerable path eliminated     |
| esbuild                 | 0.18.20 (plus safe 0.25.12 copy) | No installed lockfile copies          | GHSA-67mh-4wv8-2f99 removed    |

Sources checked: [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[esbuild advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99),
[Zod migration guide](https://zod.dev/v4/changelog), and live npm metadata.
No advisory suppression or new override was added.

### Zod

The advisory covers versions below 4.6.6: bounded collection validation could
allocate/parse oversized input before applying the maximum. Zod is used at
untrusted server-function, JSON import and AI-output boundaries, making this a
real runtime hardening concern. Existing request/admission and field bounds
mitigate some exposure; upstream High severity alone does not demonstrate a
High production exploit.

The latest published stable 3.x inspected was 3.25.76, with no supported patched
3.x release. Therefore a major migration was assessed before editing. Existing
TanStack tooling already used 4.6.7 and the installed Hook Form resolvers support
both Zod 3 and 4; there are no application zodResolver call sites.

Only root `zod` imports are used, never the bundled legacy `zod/v3` subpath.
All locked copies resolve to 4.6.7. The new regression checks prove that an
oversized bounded array/set is rejected before any element transformation.
They use two items, not an exhaustion payload.

### esbuild

The exact affected chain was the development dependency
`drizzle-kit@0.31.10 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20`.
The advisory concerns esbuild's development HTTP `serve` API/CORS; it does not
show a production application vulnerability. The inspected core-utils bundle
calls transform/transformSync, not serve. No repository entry point invoked that
loader or serve. No hosted attack was attempted.

Stable drizzle-kit 0.31.11 still depends on the same deprecated loader; latest
core-utils 3.3.2 still requires `esbuild ~0.18.20`. A forced override to 0.25+
would violate that range. The Drizzle 1.0 RC alternative would introduce an
unnecessary prerelease major migration and ORM peer change.

Repository search found no Drizzle application, script, CI or Vite config use.
Only `drizzle.config.ts`, an intentionally empty `drizzle/schema.ts`, an empty
`drizzle/migrations/meta/_journal.json`, and the obsolete instruction reference
existed. Supabase migrations and replay are authoritative. The installed Lovable
Vite configuration contains no Drizzle or LOVABLE_DB_MIGRATION_URL references.
The owner explicitly approved removal after this finding. Those three unused
scaffold files and two devDependencies were removed; no SQL history was removed.
The production build succeeds without them. Optional peer declarations in other
packages are not installed vulnerable dependency copies.

## Compatibility adaptations

All existing `.uuid()` validations use `.guid()` after migration. Zod 3 validated
the 8-4-4-4-12 hexadecimal shape, whereas Zod 4 `.uuid()` additionally enforces
RFC version/variant bits. `.guid()` preserves the exact earlier accepted shape,
including deterministic/legacy identifiers. It does not weaken the old rule.
Source-contract tests were updated to expect this equivalent spelling.

`validation-datetime.ts` preserves the earlier datetime calendar/time grammar:
optional seconds, UTC-only versus offset acceptance, and colonless offsets where
previously permitted. It uses the attributed Zod 3 regex, not its vulnerable
collection parser. Persisted values are not rewritten. Invalid dates, leap days,
times and absent zones remain rejected. All former `.datetime()` call sites use
the matching pattern; no new timestamp formats are admitted.

Three recursive Song Universe JSON records now explicitly specify string keys,
as required by Zod 4. The Story Bible omitted input uses `.prefault({})` instead
of `.default({})`, preserving parsing of nested defaults. Two analyzer generic
annotations use the Zod 4 `ZodType<T>` signature without unsafe casts.

Existing strict objects, enums, limits, refinements and nullish transforms remain.
The new tests exercise actual Generator job, Quality Check, Song Universe,
profile and billing validators without loading their server handlers. Existing
import/Blueprint/revision/analyzer suites remain part of the full regression run.
Authentication still uses Supabase middleware; billing accepts only its approved
plan and rejects client-supplied price fields. No error handler used the removed
ZodError.errors alias; `.issues`, paths and `instanceof ZodError` are exercised.

Zod 4 error text and internal issue codes can differ; they are not a stable public
API contract here. Zod 4 rejects non-finite numbers and unsafe `.int()` values;
normal bounded JSON/business values are unchanged. Its URL parser also strips
ASCII tabs/newlines and surrounding whitespace to align the returned URL with
the parsed host. This security normalization is retained. No legacy unsafe URL
compatibility shim was added. A production-scale allocation attack was not run.

## Verification

Using Bun 1.4.2 and the installed pinned toolchain:

- Frozen-lockfile installation: PASS.
- Fresh `bun audit --json`: PASS, `{}` and exit 0, no remaining advisories reported.
- Targeted Zod/validation/security tests: PASS, 17 tests across two files.
- Full Bun discovery: PASS, 1,025 tests across 155 files, 7,066 assertions, zero failures.
- Strict `tsc --noEmit`: PASS.
- Changed-source ESLint: PASS, zero errors; four unchanged exhaustive-deps
  warnings in `generate.tsx` (its hook logic was not edited).
- Prettier for all changed supported files: PASS.
- Production build: PASS (client, SSR and Nitro output), no deploy.
- Final diff/lock integrity and mandatory CI: recorded against final SHA in PR.

The full local suite used an external preload blocking network/provider requests
and child-process execution. Initial sandboxed execution had two EPERM temporary
ledger rename failures; repeating outside filesystem virtualization with the same
offline guard passed. No tests were weakened. The existing generated migration
test fixture is not part of this change. Existing lint debt outside changed source
remains outside scope, matching the canonical Regression workflow.

## Review, rollout and rollback

Keep the PR Draft for human review even when mandatory gates pass. No merge or
deployment is authorized. This major Zod change deserves explicit review of the
compatibility edits and usual staging smoke tests before a later release.
There is no database deployment or data migration dependency.

Rollback the dependency and compatibility commit together: reverting only the
package version leaves `.guid()`/`.prefault()` incompatible with Zod 3. Restore
the paired package.json/bun.lock and prior validators in one reviewed revert;
that restores the two known security findings and should not be a permanent fix.
The removed unused Drizzle scaffold remains recoverable from Git history.

An empty fresh audit means no advisories known to that registry at check time,
not proof that the whole application is secure. Future optional tooling must not
reintroduce the deprecated esbuild-kit dependency path.

## Complete application Zod import inventory

All 88 source/test files importing Zod were included in the static compatibility inventory.
A file listed here does not imply it needed an edit. Server-function schemas,
shared schemas and boundary error handlers retain their original responsibilities.

- `src/lib/admin.functions.ts`
- `src/lib/advanced-generator-prompt-v4-beta.ts`
- `src/lib/advanced-generator-setup.ts`
- `src/lib/advanced-generator-v3-review.test.ts`
- `src/lib/ai-analytics.functions.ts`
- `src/lib/ai-auxiliary-idempotency.server.ts`
- `src/lib/ai-model-admin.functions.ts`
- `src/lib/ai-model-refresh.functions.ts`
- `src/lib/ai.functions.ts`
- `src/lib/audio-model-lab.functions.ts`
- `src/lib/audio-outcome.shared.ts`
- `src/lib/audio-revision-feedback.functions.ts`
- `src/lib/audio-revision-feedback.shared.ts`
- `src/lib/audio-revision-intent.shared.ts`
- `src/lib/contact.functions.ts`
- `src/lib/content-reports.functions.ts`
- `src/lib/donation.functions.ts`
- `src/lib/export-center.functions.ts`
- `src/lib/feature-access.functions.ts`
- `src/lib/follow-notifications.functions.ts`
- `src/lib/generation-jobs.functions.ts`
- `src/lib/generator-revision.shared.ts`
- `src/lib/inspiration-wall-ai.functions.ts`
- `src/lib/inspiration-wall-song-setup.shared.ts`
- `src/lib/inspiration-wall.functions.ts`
- `src/lib/inspiration-wall.shared.ts`
- `src/lib/library-folders.functions.ts`
- `src/lib/lyrics-review-handoff.shared.ts`
- `src/lib/lyrics-review.functions.ts`
- `src/lib/lyrics-workspace.functions.ts`
- `src/lib/lyrics-workspace.shared.ts`
- `src/lib/moderation-cases.functions.ts`
- `src/lib/moderation.functions.ts`
- `src/lib/music-analyzer-admin.functions.ts`
- `src/lib/personal-library-search.functions.ts`
- `src/lib/playlists.functions.ts`
- `src/lib/private-review.functions.ts`
- `src/lib/private-review.shared.ts`
- `src/lib/profile.functions.ts`
- `src/lib/project-bulk-delete.functions.ts`
- `src/lib/project-version-history.shared.ts`
- `src/lib/project-version-tracks.functions.ts`
- `src/lib/public-content.functions.ts`
- `src/lib/qdrant-music-memory.functions.ts`
- `src/lib/quality-check-job-schema.ts`
- `src/lib/quality-check-jobs.functions.ts`
- `src/lib/similar-songs.functions.ts`
- `src/lib/song-analyzer-dsp.shared.ts`
- `src/lib/song-analyzer-enhanced-cancel.functions.ts`
- `src/lib/song-analyzer-enhanced-job.functions.ts`
- `src/lib/song-analyzer-enhanced.functions.ts`
- `src/lib/song-analyzer-enhanced.shared.ts`
- `src/lib/song-analyzer-final.functions.ts`
- `src/lib/song-analyzer-handoff.shared.ts`
- `src/lib/song-analyzer-stage-a-guard.functions.ts`
- `src/lib/song-analyzer-v2-transport.test.ts`
- `src/lib/song-analyzer-v2.functions.ts`
- `src/lib/song-analyzer-v2.server.ts`
- `src/lib/song-analyzer-v2.shared.ts`
- `src/lib/song-analyzer-v2.test.ts`
- `src/lib/song-analyzer.functions.ts`
- `src/lib/song-blueprint.shared.ts`
- `src/lib/song-setup-assistant.functions.ts`
- `src/lib/song-universe-ai.functions.ts`
- `src/lib/song-universe-inspiration.functions.ts`
- `src/lib/song-universe-membership.functions.ts`
- `src/lib/song-universe-planner.functions.ts`
- `src/lib/song-universe-planner.shared.ts`
- `src/lib/song-universe.functions.ts`
- `src/lib/song-universe.shared.ts`
- `src/lib/story-map-ai.functions.ts`
- `src/lib/story-map-workspace.functions.ts`
- `src/lib/story-map.functions.ts`
- `src/lib/story-map.shared.ts`
- `src/lib/stripe.functions.ts`
- `src/lib/track-download.functions.ts`
- `src/lib/track-duplicate.functions.ts`
- `src/lib/track-moderation.functions.ts`
- `src/lib/track-playback.functions.ts`
- `src/lib/track-sharing.functions.ts`
- `src/lib/tracks.functions.ts`
- `src/lib/upload-receipts.server.ts`
- `src/lib/zod4-compatibility.test.ts`
- `src/routes/api/avatar.ts`
- `src/routes/api/track-download.ts`
- `src/routes/audio-revision.tsx`
- `src/routes/generate.tsx`
- `src/routes/lyrics-review.tsx`
