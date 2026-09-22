# Build failure diagnosis and minimal fix plan

## Summary

The type check currently reports **149 errors across 46 files**. Exactly **one** is a real
code defect that genuinely breaks the build; the remaining 148 are long-standing strict
type-checking complaints that existed before the Supabase reconnect. **No error is caused
by the reconnect, and no database change or migration is needed to make the build pass.**

## 1. The real blocker

`src/lib/ai.functions.ts` line 1664 — `Cannot find name 'tagsLabel'` (TS2304).

A singability line was added to the quality-check prompt text inside `buildQualityPrompt`,
but the `tagsLabel` variable it uses only exists in `src/lib/quality-check-core.server.ts`
(line 576). In this file the value is not defined, so the code cannot compile and would also
throw at runtime whenever a quality check runs.

Minimal fix: inside `buildQualityPrompt`, define the same label before the template string
(`const tagsLabel = d.targetPlatform === "udio" ? "Udio Prompt" : "Suno Style Prompt";`)
and change nothing else. Wording of the prompt stays exactly as written.

## 2. Everything else (pre-existing, not from the reconnect)

Grouped by cause, with the minimal fix for each group:

- **Test files (28 errors)** — `bun:test` / `Bun` unknown: the test runner's types are not in
  `tsconfig.json`. Minimal fix: add `"bun"` (with `@types/bun`) to `types`, or exclude
  `*.test.ts` from the type-check project. No source change.
- **Moderation case thread (48 errors in `ModerationCaseThread.tsx`, root cause 1 error in
  `src/lib/moderation-cases.functions.ts` line 169)** — the server function returns
  `payload: Record<string, unknown>`, which TanStack rejects as non-serialisable, so the
  component receives `{}` and every property access fails. Minimal fix: type `payload` as
  `Json`/`Record<string, Json>` in `ModerationCaseEvent`; the 48 component errors disappear
  with it. (The four `['reason']` index-signature errors in that file are separate and
  fixed by bracket access.)
- **Generator job payload shape (`generation-jobs.functions.ts`, `LyricsWorkspace.tsx`,
  `ai.functions.ts` 2183)** — the `lyrics_section_edit` job variant is missing from the
  union that describes job input. Minimal fix: include the section-edit variant in that
  union type.
- **`exactOptionalPropertyTypes` mismatches (`admin.functions.ts`, `ai-provider.server.ts`,
  `ai.functions.ts` 937, `TrackCard.tsx`, `stripe.server.ts`, upload/webhook routes)** —
  `undefined`/`null` passed where the target property is optional-but-not-undefined.
  Minimal fix: add `| undefined` to the target property types, or omit the key when absent.
- **Index-signature access (`quality-check-core.server.ts`, `ai-provider-registry.server.ts`,
  `song-analyzer.functions.ts`, `ModerationCaseThread.tsx`)** — use `obj['key']` instead of
  `obj.key`.
- **Possibly-undefined array/object access (`song-analyzer-dsp.ts`, `AiModelsPanel.tsx`,
  `TrackContentOverlay.tsx`, `song-analyzer-essentia.ts`)** — add a guard or non-null access
  after a length check.
- **`essentia.js` untyped module (7 errors)** — add a one-line `declare module` shim.
- **Smaller one-offs** — `ExternalTrackEmbed.tsx` effect returning a boolean (wrap the
  cleanup in braces), `audio-duration.ts` `string | File`, `content-reports.browser.ts`
  `unknown` response typing, `export-center` document union, `readonly` enum tuples in
  `ai.functions.ts` 38 and `song-setup-assistant.functions.ts` 20.

## 3. Reconnect impact

The reconnect commit touched only three files: `src/integrations/supabase/client.ts`,
`src/integrations/supabase/types.ts` (one new table plus one new column) and
`supabase/config.toml`. None of them produce a type error.

One thing worth flagging, separate from the build: the regenerated `client.ts` replaced the
previous env-based client and dropped the preview auth storage helper, hardcoding the
project URL and the publishable key (public values, safe to ship). If preview sign-in
behaves differently from before, that file is the reason — not a build problem.

## 4. Database

No migration is required for the build. The only outstanding database item is the
previously prepared download-permission function update, which is unrelated to these errors.

## Proposed scope

Recommended first step: fix only item 1 (`tagsLabel`), which restores a compiling build.
Items in section 2 can be cleaned up afterwards in one pass if you want a fully green
type check.
