-- ====================================================================================================
-- Member onboarding.
--
-- Creating a member is not one insert: it is a member record, a contract against a
-- plan, an entitlement for the year, and an opening ledger line that gives the
-- entitlement its starting balance. Miss the ledger line and the member appears to
-- have an allowance of zero, because balances are summed from the ledger, never
-- stored.
--
-- This is what the admin "onboard member" screen will call. Until that screen
-- exists it is also how test members are provisioned.
-- ====================================================================================================

CREATE OR REPLACE FUNCTION public.admin_onboard_member(
  _user_id uuid,
  _plan_id uuid,
  _start_date date DEFAULT current_date
)
RETURNS TABLE (member_id uuid, contract_id uuid, entitlement_id uuid, opening_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_plan    record;
  v_member  uuid;
  v_code    text;
  v_contract uuid;
  v_ent     uuid;
  v_units   numeric;
  v_year    int := EXTRACT(YEAR FROM _start_date)::int;
BEGIN
  -- auth.uid() is NULL when called with the service role, which is already trusted.
  IF v_actor IS NOT NULL AND NOT public.has_permission(v_actor, 'members.write') THEN
    RAISE EXCEPTION 'Not allowed to onboard members' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan FROM public.membership_plans WHERE id = _plan_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  v_units := CASE WHEN v_plan.entitlement_kind = 'POINTS'
                  THEN COALESCE(v_plan.annual_points, 0)
                  ELSE COALESCE(v_plan.annual_nights, 0) END;
  IF v_units <= 0 THEN
    RAISE EXCEPTION 'Plan % has no annual allowance configured', v_plan.name USING ERRCODE = 'P0001';
  END IF;

  v_code := 'FTM-' || upper(substr(replace(_user_id::text, '-', ''), 1, 8));

  INSERT INTO public.members (user_id, member_code, status, joined_at)
  VALUES (_user_id, v_code, 'active', _start_date)
  ON CONFLICT (user_id) DO UPDATE SET status = 'active'
  RETURNING id INTO v_member;

  INSERT INTO public.membership_contracts
    (member_id, plan_id, contract_number, status, start_date, end_date, price_paid)
  VALUES
    (v_member, _plan_id,
     'FTC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
     'active', _start_date,
     CASE WHEN v_plan.duration_years >= 99 THEN NULL
          ELSE (_start_date + (v_plan.duration_years || ' years')::interval)::date END,
     v_plan.price)
  RETURNING id INTO v_contract;

  -- One entitlement per year; re-running tops up nothing, it just returns the existing one.
  SELECT id INTO v_ent
  FROM public.entitlements
  WHERE member_id = v_member AND year = v_year AND kind = v_plan.entitlement_kind
  LIMIT 1;

  IF v_ent IS NULL THEN
    INSERT INTO public.entitlements
      (member_id, membership_contract_id, kind, year, total_units, status, valid_from, valid_to)
    VALUES
      (v_member, v_contract, v_plan.entitlement_kind, v_year, v_units, 'available',
       _start_date, (date_trunc('year', _start_date) + interval '1 year - 1 day')::date)
    RETURNING id INTO v_ent;

    -- Opening credit. Without this the balance is zero.
    IF v_plan.entitlement_kind = 'POINTS' THEN
      INSERT INTO public.points_ledger (entitlement_id, delta, reason, actor_id, notes)
      VALUES (v_ent, v_units, 'grant', v_actor, 'Opening balance for ' || v_year);
    ELSE
      INSERT INTO public.entitlement_ledger (entitlement_id, delta, reason, actor_id, notes)
      VALUES (v_ent, v_units, 'grant', v_actor, 'Opening balance for ' || v_year);
    END IF;
  END IF;

  RETURN QUERY SELECT v_member, v_contract, v_ent, public.entitlement_balance(v_ent);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_onboard_member(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_onboard_member(uuid, uuid, date) TO authenticated, service_role;
