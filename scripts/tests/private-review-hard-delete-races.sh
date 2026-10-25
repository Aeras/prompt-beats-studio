#!/usr/bin/env bash
# Disposable Supabase CI Docker database only. Never pass a production connection string.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query() { docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
owner='e0000000-0000-4000-8000-000000000042'
track='e1000000-0000-4000-8000-000000000042'
closed='e2000000-0000-4000-8000-000000000042'
active='e2000000-0000-4000-8000-000000000043'
cleanup() { query -c "DELETE FROM auth.users WHERE id='$owner';" >/dev/null; }
trap cleanup EXIT
query <<SQL
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES('$owner','pb-review-delete-races@example.invalid',now());
INSERT INTO public.tracks(id,user_id,title,audio_url,audio_type,source_type,source_id,source_url)
VALUES('$track','$owner','Offline race track','https://suno.com/song/reviewraces','link','suno','reviewraces','https://suno.com/song/reviewraces');
INSERT INTO public.private_review_sessions(
 id,owner_id,source_type,source_track_id,project_name,token_hash,
 snapshot,comment_visibility,expires_at,closed_at
) VALUES
 ('$closed','$owner','track','$track','Closed',repeat('4',64),'{"title":"Closed"}','shared',now()+interval '1 day',now()),
 ('$active','$owner','track','$track','Active',repeat('5',64),'{"title":"Active"}','shared',now()+interval '1 day',NULL);
SQL
# Bulk deletion must never partially erase a mixed active/finished group.
if query <<SQL >/dev/null 2>&1
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.delete_finished_private_review_track('$track');
COMMIT;
SQL
then echo 'FAIL: bulk deletion accepted active review' >&2; exit 1; fi
[[ "$(query -c "SELECT count(*) FROM public.private_review_sessions WHERE source_track_id='$track';")" == '2' ]]
query -c "UPDATE public.private_review_sessions SET closed_at=now() WHERE id='$active';" >/dev/null
delete_one() {
 query <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.delete_finished_private_review_session('$closed');
SELECT pg_sleep(0.35);
COMMIT;
SQL
}
delete_one >/dev/null 2>&1 & a=$!
delete_one >/dev/null 2>&1 & b=$!
successes=0
if wait "$a"; then successes=$((successes+1)); fi
if wait "$b"; then successes=$((successes+1)); fi
[[ "$successes" -eq 1 ]]
[[ "$(query -c "SELECT count(*) FROM public.private_review_sessions WHERE id='$closed';")" == '0' ]]
query <<SQL >/dev/null
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.delete_finished_private_review_track('$track');
COMMIT;
SQL
[[ "$(query -c "SELECT count(*) FROM public.private_review_sessions WHERE source_track_id='$track';")" == '0' ]]
[[ "$(query -c "SELECT count(*) FROM public.tracks WHERE id='$track';")" == '1' ]]
echo 'PASS: active review blocks bulk cleanup, concurrent single deletion serializes, song retained'
