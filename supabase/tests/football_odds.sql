-- Disposable local database only. Synthetic feed and journal changes roll back.
BEGIN;
CREATE FUNCTION pg_temp.odds_assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',msg; END IF; END $$;
SELECT pg_temp.odds_assert(NOT has_function_privilege('anon','public.claim_private_football_odds_feed(text)','EXECUTE') AND NOT has_function_privilege('authenticated','public.finish_private_football_odds_feed(uuid,jsonb,text,bigint)','EXECUTE'),'Browser cannot reserve/write odds');
SELECT pg_temp.odds_assert(has_function_privilege('service_role','public.claim_private_football_odds_feed(text)','EXECUTE') AND NOT has_table_privilege('service_role','public.private_football_odds_feed','SELECT'),'Service-only RPC, no direct raw table access');
SELECT pg_temp.odds_assert((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.private_football_odds_feed'::regclass,'public.private_football_odds_budget'::regclass,'public.private_football_odds_attempts'::regclass)),'RLS required');
TRUNCATE public.private_football_odds_feed,public.private_football_odds_budget,public.private_football_odds_attempts;
DO $$ DECLARE r jsonb; t uuid; n integer; BEGIN
 r:=public.claim_private_football_odds_feed();PERFORM pg_temp.odds_assert(r->>'status'='claimed','Initial reservation');t:=(r->>'token')::uuid;
 PERFORM pg_temp.odds_assert(public.claim_private_football_odds_feed()->>'status'='busy','Duplicate reservation excluded');
 PERFORM public.finish_private_football_odds_feed(t,'{"offline":true}'::jsonb,'ok',0);
 PERFORM pg_temp.odds_assert(public.claim_private_football_odds_feed()->>'status'='cached','Receipt/cache survives lost caller acknowledgement');
 SELECT requests INTO n FROM public.private_football_odds_budget;PERFORM pg_temp.odds_assert(n=1,'Cache/retry never spends another reservation');
 BEGIN PERFORM public.finish_private_football_odds_feed(t,'{}'::jsonb,'ok',0);RAISE EXCEPTION 'stale receipt accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale receipt accepted' THEN RAISE;END IF;END;
 r:=public.claim_private_football_odds_feed('site_pregame_stoiximan_soccer.json');t:=(r->>'token')::uuid;
 PERFORM public.finish_private_football_odds_feed(t,NULL,'rate_limited',3600000);
 PERFORM pg_temp.odds_assert(public.claim_private_football_odds_feed('site_pregame_stoiximan_soccer.json')->>'status'='rate_limited','Retry-After is shared across users');
 UPDATE public.private_football_odds_feed SET blocked_until=NULL,lease_until=now()-interval '1 second',retrieved_at=NULL,payload=NULL;
 r:=public.claim_private_football_odds_feed();t:=(r->>'token')::uuid;
 PERFORM public.finish_private_football_odds_feed(t,NULL,'rate_limited',3024000000);
 PERFORM pg_temp.odds_assert((SELECT blocked_until='infinity'::timestamptz FROM public.private_football_odds_feed WHERE file='site_pregame_stoiximan_soccer_leagues.json'),'Long Retry-After never shortened');
 UPDATE public.private_football_odds_feed SET blocked_until=now()-interval '1 second',lease_until=now()-interval '1 second',retrieved_at=NULL,payload=NULL;
 UPDATE public.private_football_odds_budget SET requests=200;
 PERFORM pg_temp.odds_assert(public.claim_private_football_odds_feed()->>'status'='quota_exhausted','Monthly cap atomic');
 UPDATE public.private_football_odds_budget SET requests=0;
 INSERT INTO public.private_football_odds_attempts(token,created_at) SELECT gen_random_uuid(),now()-interval '5 days' FROM generate_series(1,200);
 PERFORM pg_temp.odds_assert(public.claim_private_football_odds_feed()->>'status'='quota_exhausted','Rolling 31-day cap survives month rollover');
 BEGIN PERFORM public.claim_private_football_odds_feed('../../other');RAISE EXCEPTION 'unsafe file accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='unsafe file accepted' THEN RAISE;END IF;END;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.claim_private_football_odds_feed();RAISE EXCEPTION 'authenticated call allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM public.private_football_odds_feed;RAISE EXCEPTION 'raw feed readable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
