# Roadmap

## Open

- [ ] Decide which database the app should run on. Enabling Cloud created a new, empty backend and made it the project's active one (0 tables, 0 accounts, 0 storage), so the app's real data is not reachable from it. Two ways forward: build on the new Cloud backend (apply the project's migrations there, then bring accounts/tracks/uploads across), or point the app back at the existing PromptBeats database (one settings action by the user, since no tool can re-bind the project's built-in backend). Not started: no schema created in the new backend, no data copied, nothing published.

## Done

- [x] Cloud enabled for this project and connected; the hosted backend responds normally on all planes (auth, database, auth to database) and the preview serves pages with no backend-configuration errors in the server log.
- [x] Repaired the collateral damage from enabling Cloud: the generated database type definitions had been overwritten with an empty schema (2591 lines to 155), which made every database call fail to compile; restored them byte-for-byte from the previous version, with no runtime, data or schema change.
- [x] Read-only diagnosis of live promptbeats.app (slow "Checking account status…", app shows signed out, /auth email+password fails with the generic "Sign-in is unavailable" message): served build is current; the published bundle talks to the external PromptBeats project while the server side was bound elsewhere. No changes made at the time.
- [x] Answered read-only question on the transactional/custom email API in `@lovable.dev/email-js@0.1.0` (imports, signature, env vars, server-side example, Reply-To support).

## Blocked

- Download-permission migration `supabase/migrations/20260917211800_edit_track_allow_download.sql` not applied — waiting on user approval, and it must run against whichever database the app ends up using.
- Pre-existing type errors unrelated to this work (missing `bun:test` types for two test files, index-signature property access in `ModerationCaseThread.tsx`, exact-optional prop typing in `TrackCard.tsx`, discriminated-union narrowing in `LyricsWorkspace.tsx`) — offered as a separate cleanup, awaiting the user's word.
- [ ] Fresh strict TS diagnostic at GitHub main e70354d (read-only, report only)
