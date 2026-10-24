#!/usr/bin/env bash
# Disposable CI Supabase container only. No remote URL or real storage access.
set -euo pipefail
project_id="${1:?local project id required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
query() { docker exec -i "supabase_db_$project_id" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
query <<'SQL'
INSERT INTO auth.users(id,email) VALUES ('17171717-1717-4717-8717-171717171717','upload-race@example.invalid');
INSERT INTO public.audio_upload_receipts(key,owner_id,size,mime,sha256,canonical_url,status,finalized_at,etag)
VALUES('tracks/17171717-1717-4717-8717-171717171717/race.mp3','17171717-1717-4717-8717-171717171717',15,'audio/mpeg',repeat('c',64),'https://storage.invalid/race.mp3','finalized',now(),'fixture');
SQL
consume() {
 query <<'SQL'
DO $$ BEGIN
 BEGIN
 INSERT INTO public.tracks(user_id,title,genre,audio_url,audio_key,audio_type,source_type)
 VALUES('17171717-1717-4717-8717-171717171717','race','Pop','https://untrusted.invalid','tracks/17171717-1717-4717-8717-171717171717/race.mp3','upload','upload');
 PERFORM pg_sleep(0.2);
 EXCEPTION WHEN OTHERS THEN
 IF SQLERRM <> 'finalized upload receipt unavailable' THEN RAISE; END IF;
 END;
END $$;
SQL
}
consume >/dev/null & first=$!
consume >/dev/null & second=$!
wait "$first"
wait "$second"
query <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.tracks WHERE user_id='17171717-1717-4717-8717-171717171717')<>1
 THEN RAISE EXCEPTION 'concurrent receipt consumption was not one-time'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.audio_upload_receipts r JOIN public.tracks t ON t.id=r.consumed_track_id
   WHERE r.key='tracks/17171717-1717-4717-8717-171717171717/race.mp3' AND r.consumed_at IS NOT NULL AND t.audio_url=r.canonical_url)
 THEN RAISE EXCEPTION 'receipt winner is inconsistent'; END IF;
END $$;
DELETE FROM public.tracks WHERE user_id='17171717-1717-4717-8717-171717171717';
DELETE FROM auth.users WHERE id='17171717-1717-4717-8717-171717171717';
SQL
echo 'PASS: independent PostgreSQL connections consume a finalized upload receipt once'
