-- Private, shared ArbPlay quota and cache. No production activation by migration.
BEGIN;
CREATE TABLE public.private_football_odds_feed (
 file text PRIMARY KEY CHECK (file IN ('site_pregame_stoiximan_soccer_leagues.json','site_pregame_stoiximan_soccer.json')),
 payload jsonb, retrieved_at timestamptz, token uuid, blocked_until timestamptz,
 lease_until timestamptz, status text NOT NULL DEFAULT 'empty'
);
CREATE TABLE public.private_football_odds_budget (
 month date PRIMARY KEY, requests integer NOT NULL CHECK(requests BETWEEN 0 AND 200)
);
CREATE TABLE public.private_football_odds_attempts (token uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX private_football_odds_attempts_time ON public.private_football_odds_attempts(created_at);
ALTER TABLE public.private_football_odds_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_football_odds_attempts FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.private_football_odds_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_football_odds_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_football_odds_feed,public.private_football_odds_budget FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.claim_private_football_odds_feed(_file text DEFAULT 'site_pregame_stoiximan_soccer_leagues.json')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.private_football_odds_feed; n integer; t uuid; m date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF _file NOT IN ('site_pregame_stoiximan_soccer_leagues.json','site_pregame_stoiximan_soccer.json') OR _file IS NULL THEN RAISE EXCEPTION 'invalid feed'; END IF;
 -- One shared budget across files, users, isolates and failed requests. Serialize both resources.
 PERFORM pg_advisory_xact_lock(1963105,200);
 INSERT INTO public.private_football_odds_feed(file) VALUES(_file) ON CONFLICT DO NOTHING;
 SELECT * INTO f FROM public.private_football_odds_feed WHERE file=_file FOR UPDATE;
 IF f.blocked_until>now() THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
 IF f.payload IS NOT NULL AND f.retrieved_at>now()-interval '15 minutes' THEN
  RETURN jsonb_build_object('status','cached','payload',f.payload,'retrievedAtUtc',to_char(f.retrieved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 END IF;
 IF f.lease_until>now() THEN RETURN jsonb_build_object('status','busy'); END IF;
 INSERT INTO public.private_football_odds_budget(month,requests) VALUES(m,0) ON CONFLICT DO NOTHING;
 SELECT requests INTO n FROM public.private_football_odds_budget WHERE month=m FOR UPDATE;
 IF n>=200 OR (SELECT count(*) FROM public.private_football_odds_attempts WHERE created_at>now()-interval '31 days')>=200 THEN RETURN jsonb_build_object('status','quota_exhausted'); END IF;
 UPDATE public.private_football_odds_budget SET requests=requests+1 WHERE month=m;
 t:=gen_random_uuid();
 INSERT INTO public.private_football_odds_attempts(token) VALUES(t);
 -- A lost response consumes the reservation. No immediate retry/reclaim; at most one attempt/file/15m.
 UPDATE public.private_football_odds_feed SET token=t,lease_until=now()+interval '15 minutes',status='reserved' WHERE file=_file;
 RETURN jsonb_build_object('status','claimed','token',t);
END $$;
CREATE FUNCTION public.finish_private_football_odds_feed(_token uuid,_payload jsonb,_status text,_retry_after_ms bigint DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF _status NOT IN ('ok','invalid_response','access_denied','rate_limited','timeout','unavailable','too_large','not_found') OR _status IS NULL THEN RAISE EXCEPTION 'invalid status'; END IF;
 IF _payload IS NOT NULL AND (pg_column_size(_payload)>5000000 OR jsonb_typeof(_payload)<>'object') THEN RAISE EXCEPTION 'invalid payload'; END IF;
 IF (_status='ok') IS DISTINCT FROM (_payload IS NOT NULL) THEN RAISE EXCEPTION 'invalid receipt'; END IF;
 UPDATE public.private_football_odds_feed SET payload=_payload,
 retrieved_at=CASE WHEN _status='ok' THEN now() ELSE NULL END,
 status=_status,token=NULL,
 blocked_until=CASE WHEN _status<>'ok' AND _retry_after_ms>2678400000 THEN 'infinity'::timestamptz WHEN _status<>'ok' THEN now()+make_interval(secs=>greatest(900,least(2678400,coalesce(_retry_after_ms,0)/1000))::integer) ELSE NULL END,
 lease_until=CASE WHEN _status='ok' THEN NULL ELSE lease_until END
 WHERE token=_token AND lease_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'stale receipt'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_private_football_odds_feed(text),public.finish_private_football_odds_feed(uuid,jsonb,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_football_odds_feed(text),public.finish_private_football_odds_feed(uuid,jsonb,text,bigint) TO service_role;
COMMIT;
