# Favorites / Playlists — permission and mutation repair

## Verified baseline and root cause

Main `615eeaacda25d9e613220de8872285fc6c697597`, merged PR #426. Its Like/Liked Tracks synchronization is retained; Favorites is a separate feature and cache. The 17 open PRs were inspected; no overlapping favorites/playlist repair was found. Unrelated checkout/PB-AUD-004 work was left untouched.

Read-only production metadata on `qwlksrcsovbncmretjdt` confirmed RLS is enabled on all four tables. `authenticated` has no table-level INSERT on favorites/playlists/playlist_tracks, **but has the required column INSERT grants**. It has selected-column SELECT on tracks, excluding `moderation_status`, prompt, lyrics, audio_key and moderation details.

The actual failure is the explicit `moderation_status` selection/filter in `assertPlaylistEligibleTrack`, `toggleFavorite` and `listPlaylists`. With the production ACL reproduced on disposable Postgres, that projection fails with SQLSTATE 42501. The same JWT context can directly insert a favorite, create a playlist with RETURNING and insert its first track using the existing column grants. Missing table-level grants therefore were not, by themselves, the INSERT defect. A fresh Supabase database's broader default table grants would mask this bug; the SQL regression suite explicitly models the production column ACL and reproduces the old failure before testing the fix.

## Implementation and security boundaries

- New forward migration `20261025093803_favorites_playlists_permissions_atomic_create.sql`: SELECT **only moderation_status** for authenticated. No table SELECT, prompt/lyrics/audio_key/notes grant, INSERT expansion, anon permission, RLS weakening or service-role mutation bypass.
- Existing track SELECT RLS still restricts all reads to active public tracks or the owner's active tracks. Existing library INSERT/DELETE RLS retains ownership, feature access and banned-account checks.
- `create_playlist_with_track(text,uuid,text)` creates the playlist and initial item in one transaction. Invalid track, database or item-write failure rolls back the playlist; existing empty-playlist creation remains supported.
- `add_playlist_track_atomic(uuid,uuid)` locks the owned playlist row, rechecks eligibility and serializes append positions. Duplicate track insertion returns `exists`; the primary key remains a backstop.
- Both RPCs are SECURITY INVOKER with empty search_path and no PUBLIC/anon EXECUTE. They derive ownership from auth.uid(), use the existing authenticated client/JWT and retain RLS on every query/write. No caller-supplied owner parameter.
- The narrow `library-rpc.server.ts` type bridge names only these migration signatures, preserves the original client's binding and validates outputs at the calling server function. It avoids unrelated reformatting/regeneration of the managed Supabase type snapshot. No new credentials or client are created.
- Native favorites toggle behavior, authorized list projections, removal, playlist update/delete/reorder, covers and external-track eligibility remain intact. Existing cover-upload callers retain their cleanup behavior on failed creation.
- Track menu uses safe EL/EN allowlisted errors, account-scoped bookmark/Favorites refresh, immediate removal after confirmed success, authorized refetch for additions, and refresh of both playlist summary/detail. A synchronous pending guard prevents duplicate in-flight clicks/Enter submissions. Failed playlist loading shows retry instead of pretending the list is empty. Untrusted database messages never render in these error toasts.

## Reproducible verification

Use only a disposable local Docker Supabase database. The existing Database Replay workflow creates the historical bootstrap fixture and runs all immutable migrations before suites. Never run these fixture scripts against production.

```sh
bun install --frozen-lockfile
bun test
bunx tsc --noEmit --pretty false
bunx eslint src/lib/playlists.functions.ts src/lib/library-action-errors.ts src/lib/library-actions.test.ts src/lib/library-cache.ts src/lib/library-mutations.test.ts src/lib/library-rpc.server.ts src/components/promptbeats/TrackLibraryActions.tsx e2e/library-actions.pw.ts
bun run build
bunx playwright test
docker exec -i "supabase_db_$PROJECT_ID" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/favorites_playlists.sql
bash scripts/tests/favorites-playlists-races.sh "$PROJECT_ID"
```

Local Bun tests were additionally run with a network-blocking preload: no paid provider or production request. Frozen installation checked 522 installs/579 packages without lockfile changes. Full Bun: **1,083 PASS / 0 FAIL / 7,328 assertions**. Focused actual-handler, cache, existing moderation/projection and Like-sync regressions pass. Strict TypeScript, changed-source lint/Prettier and production build are required; exact final CI evidence is recorded in the PR.

Fresh local migration replay succeeds. Seven rollback SQL suites cover AI accounting, upload integrity, atomic revisions, checkout, upload quotas, IP-independent admission and the new library ACL/RLS suite. Six independent-connection scripts include concurrent appends with distinct positions, duplicate playlist adds and favorite uniqueness. SQL covers private/locked tracks, cross-user rows, banned users, disabled features, anonymous RPC denial, invalid creation rollback, empty-playlist compatibility and removal after moderation. Existing actual-handler tests additionally cover redacted content, counts, artwork and unavailable third-party records.

The new real-component browser scenario uses mocked Auth/server endpoints in all three viewports: favorite add/remove menu state, create-and-add, refreshed new playlist, existing-playlist add and safely reported failed creation with preserved input. No production upload, email, AI generation or payment is involved.

## Release, verification and rollback

This PR is **not a production release**. Merge, the single forward migration and Lovable publish remain separate owner-approved actions. Do not label the production bug CLOSED from green CI alone.

1. After approval, verify the production project and pending history; apply **only** this migration. Do not bulk-apply unrelated historical ledger differences. Existing application code remains compatible with the additive grant/functions.
2. Verify authenticated SELECT on moderation_status, absence of new prompt/lyrics/audio_key/table SELECT grants, PUBLIC/anon RPC denial, invoker rights/empty search_path and unchanged RLS. Compare grants before/after rather than assuming fresh-local default ACL equals production.
3. Publish the merged compatible application in Lovable and confirm its actual Published snapshot, not just editor SHA.
4. With an authorized test account, verify favorites add/remove and both playlist paths, refresh without page reload, and unchanged existing playlist viewing/removal. Do not modify existing customer content for verification. No need for real paid AI calls.
5. Only then record production closure evidence in WORK-STATUS.

If application rollback is necessary, the previous published application remains compatible with this additive migration. Keep the narrow moderation grant and RLS rather than restoring the known permission failure. Do not drop the RPCs until no deployed code uses them; any SQL rollback needs separate review/approval. No destructive data migration, historical record rewrite or new subscription policy is part of this repair.
