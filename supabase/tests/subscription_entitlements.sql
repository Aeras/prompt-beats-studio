-- PB-015 entitlement and plan-aware Feature Access acceptance.
-- Disposable replay database only; all fixtures and policy mutations roll back.
BEGIN;

CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF;
END $$;

CREATE FUNCTION pg_temp.denied(sql text, expected text DEFAULT 'P0001') RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Expected %, received % for %', expected, actual, sql;
  END IF;
END $$;

-- Migration is inert until an administrator explicitly chooses a new paid mode.
SELECT pg_temp.assert(
  NOT EXISTS (
    SELECT 1 FROM public.feature_access_policies
    WHERE access_mode IN ('plus_or_pro','pro_only')
  ),
  'PB-015 migration must not activate paid Feature Access modes'
);

SELECT pg_temp.assert(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.subscription_manual_grants'::regclass),
  'Manual grants require RLS'
);
SELECT pg_temp.assert(
  NOT has_table_privilege('authenticated','public.subscription_manual_grants','SELECT,INSERT,UPDATE,DELETE'),
  'Authenticated users must not access manual grants directly'
);
SELECT pg_temp.assert(
  NOT has_table_privilege('anon','public.subscription_manual_grants','SELECT,INSERT,UPDATE,DELETE'),
  'Anonymous users must not access manual grants directly'
);
SELECT pg_temp.assert(
  NOT has_function_privilege('authenticated','public.effective_subscription_plan(uuid)','EXECUTE'),
  'Arbitrary-user effective plan helper must remain private'
);
SELECT pg_temp.assert(
  NOT has_function_privilege('authenticated','public.admit_feature_ai_dispatch_internal(uuid,text[])','EXECUTE'),
  'Feature-aware provider admission must be service-only'
);
SELECT pg_temp.assert(
  has_function_privilege('service_role','public.admit_feature_ai_dispatch_internal(uuid,text[])','EXECUTE'),
  'Feature-aware provider admission must be available to service role'
);

INSERT INTO auth.users(id,email) VALUES
  ('bd150000-0000-4000-8000-000000000001','pb015-user@example.invalid'),
  ('bd150000-0000-4000-8000-000000000002','pb015-selected@example.invalid'),
  ('bd150000-0000-4000-8000-000000000003','pb015-admin@example.invalid'),
  ('bd150000-0000-4000-8000-000000000004','pb015-super@example.invalid'),
  ('bd150000-0000-4000-8000-000000000005','pb015-stripe@example.invalid'),
  ('bd150000-0000-4000-8000-000000000006','pb015-moderator@example.invalid');

INSERT INTO public.user_roles(user_id,role,moderation_status) VALUES
  ('bd150000-0000-4000-8000-000000000001','user','active'),
  ('bd150000-0000-4000-8000-000000000002','user','active'),
  ('bd150000-0000-4000-8000-000000000003','admin','active'),
  ('bd150000-0000-4000-8000-000000000004','super_admin','active'),
  ('bd150000-0000-4000-8000-000000000005','user','active'),
  ('bd150000-0000-4000-8000-000000000006','moderator','active')
ON CONFLICT(user_id) DO UPDATE
SET role=EXCLUDED.role, moderation_status=EXCLUDED.moderation_status;

SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000001')='free',
  'No entitlement source must resolve Free'
);

-- Manual Plus, future start, exact/past expiry, revoked and Never semantics.
INSERT INTO public.subscription_manual_grants(user_id,plan,starts_at,expires_at,reason) VALUES
  ('bd150000-0000-4000-8000-000000000001','plus',statement_timestamp()-interval '1 hour',statement_timestamp()+interval '7 days','active plus fixture'),
  ('bd150000-0000-4000-8000-000000000002','pro',statement_timestamp()+interval '1 hour',statement_timestamp()+interval '2 hours','future pro fixture'),
  ('bd150000-0000-4000-8000-000000000002','pro',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour','expired pro fixture'),
  ('bd150000-0000-4000-8000-000000000002','plus',statement_timestamp()-interval '2 hours',NULL,'revoked plus fixture'),
  ('bd150000-0000-4000-8000-000000000005','plus',statement_timestamp()-interval '1 hour',NULL,'never plus fixture');

UPDATE public.subscription_manual_grants
SET revoked_at=statement_timestamp(), revoke_reason='fixture revoke'
WHERE reason='revoked plus fixture';

SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000001')='plus',
  'Active manual Plus must resolve Plus'
);
SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000002')='free',
  'Future, expired and revoked grants must be inactive'
);
SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000005')='plus',
  'Never grant must remain active'
);

-- Stripe Plus is not commercially activated in PB-015. An unexpected/future
-- Plus projection must not grant paid access until the approved Stripe mapping
-- is extended in a separate scope.
INSERT INTO public.subscriptions(user_id,plan,status,current_period_end) VALUES
  ('bd150000-0000-4000-8000-000000000002','plus','active',statement_timestamp()+interval '30 days')
ON CONFLICT(user_id) DO UPDATE
SET plan=EXCLUDED.plan,status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end;
SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000002')='free',
  'Stripe Plus must remain inactive until separately approved'
);

-- Stripe remains an independent source and approved Pro wins by rank.
INSERT INTO public.subscriptions(user_id,plan,status,current_period_end) VALUES
  ('bd150000-0000-4000-8000-000000000005','pro','active',statement_timestamp()+interval '30 days')
ON CONFLICT(user_id) DO UPDATE
SET plan=EXCLUDED.plan,status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end;
SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000005')='pro',
  'Stripe Pro must outrank manual Plus'
);

INSERT INTO public.subscriptions(user_id,plan,status,current_period_end) VALUES
  ('bd150000-0000-4000-8000-000000000001','plus','active',statement_timestamp()+interval '30 days')
ON CONFLICT(user_id) DO UPDATE
SET plan=EXCLUDED.plan,status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end;

INSERT INTO public.subscription_manual_grants(user_id,plan,starts_at,expires_at,reason) VALUES
  ('bd150000-0000-4000-8000-000000000001','pro',statement_timestamp()-interval '1 minute',statement_timestamp()+interval '1 day','overlap pro one'),
  ('bd150000-0000-4000-8000-000000000001','pro',statement_timestamp()-interval '1 minute',statement_timestamp()+interval '2 days','overlap pro two');
SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000001')='pro',
  'Stripe Plus fixture plus manual Pro must resolve Pro'
);
SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000001')='pro',
  'Overlapping grants must choose highest plan'
);

-- Super Admin-only mutation; Admin and ordinary user must fail before any grant lookup/mutation.
SELECT set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.subscription_manual_grant_create(
  'bd150000-0000-4000-8000-000000000001','pro',statement_timestamp()+interval '7 days','ordinary self grant'
)$q$);
SELECT pg_temp.denied($q$SELECT public.subscription_manual_grant_revoke(
  '00000000-0000-4000-8000-000000000999','probe grant'
)$q$);
SELECT pg_temp.denied($q$SELECT public.subscription_entitlement_detail(
  'bd150000-0000-4000-8000-000000000004'
)$q$);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.subscription_manual_grant_create(
  'bd150000-0000-4000-8000-000000000003','pro',statement_timestamp()+interval '7 days','admin self grant'
)$q$);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.subscription_manual_grant_create(
  'bd150000-0000-4000-8000-000000000006','pro',statement_timestamp()+interval '7 days','moderator self grant'
)$q$);
RESET ROLE;

-- Super Admin uses the same audited path even for self-grant.
SELECT set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE created_grant AS
SELECT public.subscription_manual_grant_create(
  'bd150000-0000-4000-8000-000000000004','pro',statement_timestamp()+interval '7 days','explicit self grant'
) AS result;
SELECT pg_temp.assert(
  (public.current_user_effective_plan()->>'effectivePlan')='pro',
  'Caller-bound effective plan must include manual grant'
);
SELECT pg_temp.assert(
  (public.subscription_entitlement_detail('bd150000-0000-4000-8000-000000000004')->>'effectivePlan')='pro',
  'Super Admin entitlement detail must show effective plan'
);
SELECT pg_temp.assert(
  jsonb_path_exists(
    public.subscription_entitlement_detail('bd150000-0000-4000-8000-000000000004'),
    '$.audit[*] ? (@.action == "CREATE_SUBSCRIPTION_MANUAL_GRANT")'
  ),
  'Super Admin entitlement detail must include relevant bounded audit'
);
RESET ROLE;

SELECT pg_temp.assert(
  (SELECT count(*)=1 FROM public.admin_audit_log
    WHERE admin_user_id='bd150000-0000-4000-8000-000000000004'
      AND target_user_id='bd150000-0000-4000-8000-000000000004'
      AND action='CREATE_SUBSCRIPTION_MANUAL_GRANT'),
  'Self-grant must be audited once'
);

-- Revoking one Pro cannot remove another active Pro.
-- Resolve the fixture ID while still privileged; authenticated callers have no
-- direct table SELECT by design, so the mutation itself must be the only
-- commercial-history access exercised under the authenticated role.
SELECT id AS overlap_grant_id
FROM public.subscription_manual_grants
WHERE user_id='bd150000-0000-4000-8000-000000000001'
  AND reason='overlap pro one'
\gset
SELECT set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT public.subscription_manual_grant_revoke(
  :'overlap_grant_id'::uuid,
  'revoke first overlap'
);
SELECT pg_temp.assert(
  public.current_user_is_super_admin(),
  'Fixture actor must remain Super Admin'
);
RESET ROLE;
SELECT pg_temp.assert(
  public.effective_subscription_plan('bd150000-0000-4000-8000-000000000001')='pro',
  'Revoking one Pro must leave another active Pro effective'
);

-- Six-mode Feature Access: old four remain independent from plan, new two use only plan.
INSERT INTO public.feature_access_policies(feature_key,display_name,description,access_mode)
VALUES('pb015_feature_fixture','PB-015 fixture','Disposable entitlement feature','everyone');
INSERT INTO public.feature_access_users(feature_key,user_id,created_by)
VALUES('pb015_feature_fixture','bd150000-0000-4000-8000-000000000002','bd150000-0000-4000-8000-000000000004');
INSERT INTO public.beta_testers(user_id,granted_by)
VALUES('bd150000-0000-4000-8000-000000000002','bd150000-0000-4000-8000-000000000004');

UPDATE public.feature_access_policies SET access_mode='disabled' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.assert(
  NOT public.can_use_feature('bd150000-0000-4000-8000-000000000001','pb015_feature_fixture'),
  'disabled must deny paid user'
);
UPDATE public.feature_access_policies SET access_mode='everyone' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.assert(
  public.can_use_feature('bd150000-0000-4000-8000-000000000002','pb015_feature_fixture'),
  'everyone must allow otherwise-valid Free user'
);
UPDATE public.feature_access_policies SET access_mode='admins_only' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.assert(
  public.can_use_feature('bd150000-0000-4000-8000-000000000003','pb015_feature_fixture'),
  'admins_only must allow Admin'
);
SELECT pg_temp.assert(
  NOT public.can_use_feature('bd150000-0000-4000-8000-000000000005','pb015_feature_fixture'),
  'Pro normal user must not bypass admins_only'
);
UPDATE public.feature_access_policies SET access_mode='selected_users' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.assert(
  public.can_use_feature('bd150000-0000-4000-8000-000000000002','pb015_feature_fixture'),
  'selected_users must allow exact allowlist user'
);
SELECT pg_temp.assert(
  NOT public.can_use_feature('bd150000-0000-4000-8000-000000000001','pb015_feature_fixture'),
  'Pro non-selected user must not bypass selected_users'
);

UPDATE public.feature_access_policies SET access_mode='plus_or_pro' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.assert(
  NOT public.can_use_feature('bd150000-0000-4000-8000-000000000002','pb015_feature_fixture'),
  'plus_or_pro must deny Free'
);
SELECT pg_temp.assert(
  public.can_use_feature('bd150000-0000-4000-8000-000000000005','pb015_feature_fixture'),
  'plus_or_pro must allow Pro'
);
UPDATE public.feature_access_policies SET access_mode='pro_only' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.assert(
  NOT public.can_use_feature('bd150000-0000-4000-8000-000000000004','pb015_feature_fixture'),
  'Free Super Admin must not bypass pro_only'
);
SELECT pg_temp.assert(
  NOT public.can_use_feature('bd150000-0000-4000-8000-000000000002','pb015_feature_fixture'),
  'Free Beta tester must not bypass pro_only'
);
SELECT pg_temp.assert(
  public.can_use_feature('bd150000-0000-4000-8000-000000000005','pb015_feature_fixture'),
  'pro_only must allow Pro'
);

-- Feature-aware provider admission is service-only and composes Feature Access + Global AI.
UPDATE public.feature_access_policies SET access_mode='everyone' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.assert(
  public.admit_feature_ai_dispatch_internal(
    'bd150000-0000-4000-8000-000000000002',
    ARRAY['pb015_feature_fixture']
  ),
  'Feature-aware dispatch admission should allow valid everyone feature'
);
UPDATE public.feature_access_policies SET access_mode='pro_only' WHERE feature_key='pb015_feature_fixture';
SELECT pg_temp.denied($q$SELECT public.admit_feature_ai_dispatch_internal(
  'bd150000-0000-4000-8000-000000000002',
  ARRAY['pb015_feature_fixture']
)$q$);
SELECT pg_temp.assert(
  public.admit_feature_ai_dispatch_internal(
    'bd150000-0000-4000-8000-000000000005',
    ARRAY['pb015_feature_fixture']
  ),
  'Feature-aware dispatch admission should allow qualified Pro'
);

UPDATE public.global_ai_usage_policy SET enabled=false;
SELECT pg_temp.denied($q$SELECT public.admit_feature_ai_dispatch_internal(
  'bd150000-0000-4000-8000-000000000005',
  ARRAY['pb015_feature_fixture']
)$q$,'PT423');

ROLLBACK;
