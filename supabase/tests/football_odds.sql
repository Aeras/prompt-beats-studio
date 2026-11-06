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

-- Read-only preview, abandoned reservation and lost acknowledgement recovery.
TRUNCATE public.private_football_odds_feed,public.private_football_odds_budget,public.private_football_odds_attempts;
DO $$ DECLARE r jsonb; t uuid; captured text; before_count integer; BEGIN
 PERFORM pg_temp.odds_assert(public.read_private_football_odds_feed('site_pregame_stoiximan_soccer_leagues.json')->>'status'='unavailable','Empty preview is read-only');
 PERFORM pg_temp.odds_assert((SELECT count(*)=0 FROM public.private_football_odds_budget),'Preview cannot create quota');
 r:=public.claim_private_football_odds_feed(); t:=(r->>'token')::uuid;
 PERFORM pg_temp.odds_assert(public.read_private_football_odds_feed('site_pregame_stoiximan_soccer_leagues.json')->>'status'='busy','Active worker is visible');
 UPDATE public.private_football_odds_attempts SET created_at=now()-interval '40 seconds' WHERE token=t;
 PERFORM pg_temp.odds_assert(public.read_private_football_odds_feed('site_pregame_stoiximan_soccer_leagues.json')->>'status'='recovery_pending','Abandoned attempt is not reported as missing');
 PERFORM pg_temp.odds_assert(public.claim_private_football_odds_feed()->>'status'='busy','Unknown dispatch must retain 15-minute no-retry floor');
 PERFORM public.finish_private_football_odds_feed(t,'{"offline":true}'::jsonb,'ok',0);
 r:=public.read_private_football_odds_feed('site_pregame_stoiximan_soccer_leagues.json');
 captured:=r->>'retrievedAtUtc';
 PERFORM pg_temp.odds_assert(r->>'status'='cached' AND captured ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$','Read-only ack recovery returns strict UTC receipt');
 PERFORM pg_temp.odds_assert(public.claim_private_football_odds_feed()->>'retrievedAtUtc'=captured,'Claim and read UTC format are identical');
 PERFORM pg_temp.odds_assert((SELECT requests=1 FROM public.private_football_odds_budget),'Repeated reads/claims of fresh data spend exactly once');
 UPDATE public.private_football_odds_feed SET retrieved_at=now()-interval '16 minutes';
 r:=public.read_private_football_odds_feed('site_pregame_stoiximan_soccer_leagues.json');
 PERFORM pg_temp.odds_assert(r->>'status'='stale' AND NOT r ? 'payload','Stale preview must not leak old payload');
 r:=public.claim_private_football_odds_feed();t:=(r->>'token')::uuid;
 UPDATE public.private_football_odds_feed SET lease_until=now()-interval '1 second';
 BEGIN PERFORM public.finish_private_football_odds_feed(t,'{}'::jsonb,'ok',0);RAISE EXCEPTION 'expired receipt accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='expired receipt accepted' THEN RAISE;END IF;END;
 r:=public.claim_private_football_odds_feed();
 PERFORM pg_temp.odds_assert(r->>'status'='claimed' AND r->>'token'<>t::text,'Expired attempt recovers normally with a new counted reservation');
 PERFORM pg_temp.odds_assert((SELECT requests=3 FROM public.private_football_odds_budget),'Unknown attempts never refunded');
 PERFORM pg_temp.odds_assert(NOT has_function_privilege('anon','public.read_private_football_odds_feed(text)','EXECUTE') AND NOT has_function_privilege('authenticated','public.read_private_football_odds_feed(text)','EXECUTE'),'Recovery remains service-only');
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.read_private_football_odds_feed('site_pregame_stoiximan_soccer.json');RAISE EXCEPTION 'authenticated read allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.claim_private_football_odds_feed();RAISE EXCEPTION 'authenticated call allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM public.private_football_odds_feed;RAISE EXCEPTION 'raw feed readable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
