# Roadmap

## Open

- [ ] Lovable Cloud backend for Live instance `mncrtljdwofnkvhmctax` is reported paused — database and auth calls fail, so the live site cannot sign users in or read tracks. Needs the backend resumed/activated (Cloud → Resume in project settings) plus a re-check of the service-role credential binding (`db_health` currently reports the key as not found). Not performed: no resume, restart, rebind, config change or publish without the user's go-ahead.

## Done

- [x] Read-only diagnosis of live promptbeats.app (slow "Checking account status…", app shows signed out, /auth email+password fails with the generic "Sign-in is unavailable" message): served build is current and its client config matches the Cloud project; root cause is the paused/unreachable Lovable Cloud backend plus an unresolvable service-role credential binding. No changes made.
- [x] Answered read-only question on the transactional/custom email API in `@lovable.dev/email-js@0.1.0` (imports, signature, env vars, server-side example, Reply-To support).

## Blocked

- Download-permission migration `supabase/migrations/20260917211800_edit_track_allow_download.sql` not applied — waiting on user approval, and the backend must be active for it to run.
