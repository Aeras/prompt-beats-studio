#!/usr/bin/env bash
# Disposable local Docker database only. Never accepts a remote connection URL.
set -euo pipefail
project_id="${1:?local Supabase project ID required}"
[[ "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]
db="supabase_db_$project_id"
owner='6a000000-0000-4000-8000-000000000018'
first='6b000000-0000-4000-8000-000000000018'
second='6c000000-0000-4000-8000-000000000018'
query() { docker exec -i "$db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }
output=$(mktemp -d)
trap 'rm -f "$output/first" "$output/second"; rmdir "$output"' EXIT
query <<SQL >"$output/first" &
BEGIN;
SELECT public.reserve_stripe_checkout_attempt('$owner','$first');
SELECT pg_sleep(0.5);
COMMIT;
SQL
pid_first=$!
sleep 0.15
query -c "SELECT public.reserve_stripe_checkout_attempt('$owner','$second');" >"$output/second" &
pid_second=$!
wait "$pid_first"; wait "$pid_second"
grep -qx 't' "$output/first"
grep -qx 'f' "$output/second"
query <<SQL
DO \$\$
BEGIN
 IF NOT public.reserve_stripe_checkout_attempt('$owner','$first') THEN
  RAISE EXCEPTION 'same-attempt retry lost reservation';
 END IF;
 UPDATE public.stripe_checkout_reservations SET expires_at=now()-interval '1 second' WHERE user_id='$owner';
 IF NOT public.reserve_stripe_checkout_attempt('$owner','$second') THEN
  RAISE EXCEPTION 'expired reservation could not recover';
 END IF;
END;
\$\$;
DELETE FROM public.stripe_checkout_reservations WHERE user_id='$owner';
SQL
echo 'PASS: independent connections serialize distinct Checkout attempts and recover expired reservations'
