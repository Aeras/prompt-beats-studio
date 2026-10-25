#!/usr/bin/env bash
# Disposable local Docker DB only. Never accepts a production connection URL.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
query() { docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
output=$(mktemp -d)
owner='e4000000-0000-4000-8000-000000000021'
track='e5000000-0000-4000-8000-000000000021'
session='e6000000-0000-4000-8000-000000000021'
token=$(printf 'e%.0s' {1..64})
cleanup() {
  query <<SQL >/dev/null
DELETE FROM public.contact_admission_receipts
WHERE nonce_hash IN (SELECT encode(extensions.digest('pb021-race-'||i,'sha256'),'hex') FROM generate_series(1,160) i);
DELETE FROM public.private_review_sessions WHERE id='$session';
DELETE FROM public.tracks WHERE id='$track';
DELETE FROM auth.users WHERE id='$owner';
SQL
  rm -f "$output"/contact-* "$output"/pin-* "$output"/email-* "$output"/replay-*
  rmdir "$output"
}
trap cleanup EXIT
query <<SQL
DO \$\$
BEGIN
 IF EXISTS(SELECT 1 FROM public.contact_admission_receipts) THEN
  RAISE EXCEPTION 'race fixture requires a fresh isolated admission table';
 END IF;
 FOR i IN 1..119 LOOP
  IF NOT public.admit_contact_request_v2(encode(extensions.digest('pb021-email-'||i,'sha256'),'hex'),
     encode(extensions.digest('pb021-race-'||i,'sha256'),'hex'),NULL) THEN RAISE EXCEPTION 'seed admission failed'; END IF;
 END LOOP;
END;
\$\$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('$owner','pb021-races@example.invalid',now());
UPDATE public.profile_private SET is_banned=false WHERE user_id='$owner';
INSERT INTO public.tracks(id,user_id,title,audio_url,audio_type,source_type,source_id,source_url)
VALUES('$track','$owner','Offline race','https://suno.com/song/pb021race','link','suno','pb021race','https://suno.com/song/pb021race');
INSERT INTO public.private_review_sessions(id,owner_id,source_type,source_track_id,project_name,token_hash,snapshot,comment_visibility,pin_hash,expires_at)
VALUES('$session','$owner','track','$track','Offline race',encode(extensions.digest('$token','sha256'),'hex'),'{}','shared',extensions.crypt('1234',extensions.gen_salt('bf',4)),now()+interval '1 day');
INSERT INTO public.private_review_join_admissions(session_id,network_hash,bucket_start,attempt_count,pin_failure_count)
VALUES('$session',repeat('a',64),date_trunc('hour',now()),79,79);
SQL
pids=()
for i in {120..139}; do
  query -c "SELECT public.admit_contact_request_v2(encode(extensions.digest('pb021-email-$i','sha256'),'hex'),encode(extensions.digest('pb021-race-$i','sha256'),'hex'),NULL);" >"$output/contact-$i" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(cat "$output"/contact-* | grep -c '^t$') -eq 1 ]]
[[ $(cat "$output"/contact-* | grep -c '^f$') -eq 19 ]]
pids=()
for i in {1..12}; do
  query -c "SELECT public.join_private_review_session('$token','Concurrent guest $i','9999')->>'state';" >"$output/pin-$i" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(cat "$output"/pin-* | grep -c '^invalid_pin$') -eq 1 ]]
[[ $(cat "$output"/pin-* | grep -c '^rate_limited$') -eq 11 ]]
query <<SQL
DO \$\$
BEGIN
 IF (SELECT count(*) FROM public.contact_admission_receipts) <> 120 THEN RAISE EXCEPTION 'concurrent contact budget exceeded'; END IF;
 IF (SELECT COALESCE(sum(pin_failure_count),0) FROM public.private_review_session_admissions WHERE session_id='$session') <> 1 THEN RAISE EXCEPTION 'PIN failure race bypass'; END IF;
 IF EXISTS(SELECT 1 FROM public.private_review_reviewers WHERE session_id='$session') THEN RAISE EXCEPTION 'wrong PIN created reviewer'; END IF;
END;
\$\$;
SQL
query -c "DELETE FROM public.contact_admission_receipts WHERE nonce_hash IN (SELECT encode(extensions.digest('pb021-race-'||i,'sha256'),'hex') FROM generate_series(1,139) i);" >/dev/null
pids=()
for i in {140..147}; do
  actor=NULL
  if (( i % 2 == 0 )); then actor="'$owner'::uuid"; fi
  query -c "SELECT public.admit_contact_request_v2(repeat('1',64),encode(extensions.digest('pb021-race-$i','sha256'),'hex'),$actor);" >"$output/email-$i" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(cat "$output"/email-* | grep -c '^t$') -eq 3 ]]
[[ $(cat "$output"/email-* | grep -c '^f$') -eq 5 ]]
pids=()
for i in {1..4}; do
  actor=NULL
  if (( i % 2 == 0 )); then actor="'$owner'::uuid"; fi
  query -c "SELECT public.admit_contact_request_v2(encode(extensions.digest('replay-email-$i','sha256'),'hex'),encode(extensions.digest('pb021-race-150','sha256'),'hex'),$actor);" >"$output/replay-$i" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(cat "$output"/replay-* | grep -c '^t$') -eq 1 ]]
[[ $(cat "$output"/replay-* | grep -c '^f$') -eq 3 ]]
echo 'PASS: independent connections enforce guest capacity, cross-pool email quota, one-time receipt and remaining PIN failure allowance'
