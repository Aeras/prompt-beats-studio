# Roadmap

## Open

- [ ] READ-ONLY diagnosis of live promptbeats.app: slow "Checking account status...", app shows signed out, and /auth email+password sign-in fails with the generic "Sign-in is unavailable right now" error. Determine served build/commit, inspect live console/network and production logs, verify published client Supabase config matches the current Lovable Cloud project, test auth reachability without real credentials, identify exact underlying error. No fixes, no config changes, no publishing.

## Done

- [x] Answered read-only question on the transactional/custom email API in `@lovable.dev/email-js@0.1.0` (imports, signature, env vars, server-side example, Reply-To support).

## Blocked

- Download-permission migration `supabase/migrations/20260917211800_edit_track_allow_download.sql` not applied — waiting on user approval to run it against Lovable Cloud.
