#!/usr/bin/env bash
# Disposable Docker database only; no network/production connection URL accepted.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query() { docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
owner='a7000000-0000-4000-8000-000000000009'
playlist='a9000000-0000-4000-8000-000000000009'
first='a8000000-0000-4000-8000-000000000009'
second='a8000000-0000-4000-8000-000000000010'
third='a8000000-0000-4000-8000-000000000011'
cleanup() { query -c "DELETE FROM auth.users WHERE id='$owner';" >/dev/null; }
trap cleanup EXIT
query <<SQL
INSERT INTO auth.users(id,email) VALUES('$owner','library-races@example.invalid');
INSERT INTO public.playlists(id,user_id,name) VALUES('$playlist','$owner','Race fixture');
DO \$\$
DECLARE id uuid; v_key text; i integer:=0;
BEGIN
 FOREACH id IN ARRAY ARRAY['$first'::uuid,'$second'::uuid,'$third'::uuid] LOOP
  i:=i+1;
  v_key:='tracks/$owner/'||id||'.mp3';
  INSERT INTO public.audio_upload_receipts(key,owner_id,size,mime,sha256,canonical_url)
    VALUES(v_key,'$owner',4,'audio/mpeg',repeat(i::text,64),'https://example.invalid/'||v_key);
  UPDATE public.audio_upload_receipts SET status='finalized',finalized_at=now(),etag='offline'
    WHERE key=v_key;
  INSERT INTO public.tracks(id,user_id,title,audio_url,audio_key,audio_type,source_type)
    VALUES(id,'$owner','Race fixture','https://example.invalid/audio',v_key,'upload','upload');
 END LOOP;
END \$\$;
SQL
append() {
 local track="$1" hold="${2:-0}"
 query <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
SELECT public.add_playlist_track_atomic('$playlist','$track');
SELECT pg_sleep($hold);
COMMIT;
SQL
}
# Independent transactions: the second append must wait for the playlist lock.
append "$first" 0.4 >/dev/null & a=$!
append "$second" 0.4 >/dev/null & b=$!
wait "$a"; wait "$b"
[[ "$(query -c "SELECT count(*)=2 AND count(DISTINCT position)=2 AND min(position)=0 AND max(position)=1 FROM public.playlist_tracks WHERE playlist_id='$playlist';")" == 't' ]]
# A duplicate concurrent append is harmless and consumes only one position.
append "$third" 0.3 >/dev/null & a=$!
append "$third" 0.3 >/dev/null & b=$!
wait "$a"; wait "$b"
[[ "$(query -c "SELECT count(*)=3 AND count(DISTINCT position)=3 FROM public.playlist_tracks WHERE playlist_id='$playlist';")" == 't' ]]
favorite() {
 query <<SQL
BEGIN;
SELECT set_config('request.jwt.claim.sub','$owner',true);
SET LOCAL ROLE authenticated;
DO \$\$
BEGIN
 INSERT INTO public.favorites(user_id,track_id) VALUES('$owner','$first');
 EXCEPTION WHEN unique_violation THEN NULL;
END \$\$;
SELECT pg_sleep(0.3);
COMMIT;
SQL
}
favorite >/dev/null & a=$!
favorite >/dev/null & b=$!
wait "$a"; wait "$b"
[[ "$(query -c "SELECT count(*) FROM public.favorites WHERE user_id='$owner';")" == '1' ]]
echo 'PASS: concurrent append order, duplicate appends and favorite uniqueness'
