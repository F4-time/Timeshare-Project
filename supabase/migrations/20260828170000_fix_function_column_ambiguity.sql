-- ====================================================================================================
-- Fix: "column reference is ambiguous" in book_stay and admin_onboard_member.
--
-- RETURNS TABLE (member_id uuid, ...) declares output variables whose names are
-- identical to real table columns. Inside the body, `WHERE member_id = v_member`
-- and `RETURNING id, reference` then match both, and Postgres refuses (42702).
--
-- Returning jsonb removes the output names entirely, so no collision is possible
-- here or in any future edit to these functions.
-- ====================================================================================================

DROP FUNCTION IF EXISTS public.admin_onboard_member(uuid, uuid, date);
DROP FUNCTION IF EXISTS public.book_stay(uuid, uuid, date, date, int, int, text);

-- ============ ONBOARDING ============
CREATE FUNCTION public.admin_onboard_member(
  _user_id uuid,
  _plan_id uuid,
  _start_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_plan     record;
  v_member   uuid;
  v_code     text;
  v_contract uuid;
  v_ent      uuid;
  v_units    numeric;
  v_year     int := EXTRACT(YEAR FROM _start_date)::int;
BEGIN
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
  RETURNING public.members.id INTO v_member;

  INSERT INTO public.membership_contracts
    (member_id, plan_id, contract_number, status, start_date, end_date, price_paid)
  VALUES
    (v_member, _plan_id,
     'FTC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
     'active', _start_date,
     CASE WHEN v_plan.duration_years >= 99 THEN NULL
          ELSE (_start_date + (v_plan.duration_years || ' years')::interval)::date END,
     v_plan.price)
  RETURNING public.membership_contracts.id INTO v_contract;

  SELECT e.id INTO v_ent
  FROM public.entitlements e
  WHERE e.member_id = v_member
    AND e.year = v_year
    AND e.kind = v_plan.entitlement_kind
  LIMIT 1;

  IF v_ent IS NULL THEN
    INSERT INTO public.entitlements
      (member_id, membership_contract_id, kind, year, total_units, status, valid_from, valid_to)
    VALUES
      (v_member, v_contract, v_plan.entitlement_kind, v_year, v_units, 'available',
       _start_date, (date_trunc('year', _start_date) + interval '1 year - 1 day')::date)
    RETURNING public.entitlements.id INTO v_ent;

    -- Opening credit. Balances are summed from the ledger, so without this the
    -- member has an allowance of zero.
    IF v_plan.entitlement_kind = 'POINTS' THEN
      INSERT INTO public.points_ledger (entitlement_id, delta, reason, actor_id, notes)
      VALUES (v_ent, v_units, 'grant', v_actor, 'Opening balance for ' || v_year);
    ELSE
      INSERT INTO public.entitlement_ledger (entitlement_id, delta, reason, actor_id, notes)
      VALUES (v_ent, v_units, 'grant', v_actor, 'Opening balance for ' || v_year);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'memberId', v_member,
    'contractId', v_contract,
    'entitlementId', v_ent,
    'openingBalance', public.entitlement_balance(v_ent)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_onboard_member(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_onboard_member(uuid, uuid, date) TO authenticated, service_role;

-- ============ BOOKING COMMIT ============
CREATE FUNCTION public.book_stay(
  _resort_id uuid,
  _room_type_id uuid,
  _check_in date,
  _check_out date,
  _adults int DEFAULT 1,
  _children int DEFAULT 0,
  _guest_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_member   public.members%ROWTYPE;
  v_contract record;
  v_rt       record;
  v_nights   int;
  v_unit     uuid;
  v_points   numeric := 0;
  v_fee      numeric := 0;
  v_cost     numeric;
  v_ent      record;
  v_balance  numeric;
  v_updated  int;
  v_res_id   uuid;
  v_ref      text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  v_nights := _check_out - _check_in;
  IF v_nights <= 0 THEN
    RAISE EXCEPTION 'Check-out must be after check-in' USING ERRCODE = '22007';
  END IF;
  IF _check_in < current_date THEN
    RAISE EXCEPTION 'Check-in cannot be in the past' USING ERRCODE = '22007';
  END IF;

  SELECT * INTO v_member FROM public.members m WHERE m.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No membership is linked to this account' USING ERRCODE = 'P0002';
  END IF;
  IF v_member.status <> 'active' THEN
    RAISE EXCEPTION 'Membership is %, not active', v_member.status USING ERRCODE = 'P0001';
  END IF;

  SELECT c.*, p.entitlement_kind, p.booking_window_days, p.min_stay_nights, p.max_stay_nights
    INTO v_contract
  FROM public.membership_contracts c
  JOIN public.membership_plans p ON p.id = c.plan_id
  WHERE c.member_id = v_member.id
    AND c.status = 'active'
    AND c.start_date <= _check_in
    AND (c.end_date IS NULL OR c.end_date >= _check_out)
  ORDER BY c.start_date DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active contract covers these dates' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maintenance_fees f
    WHERE f.member_id = v_member.id
      AND f.blocks_booking
      AND f.status IN ('pending', 'partial', 'overdue')
      AND f.due_date + f.grace_days < current_date
  ) THEN
    RAISE EXCEPTION 'Overdue maintenance fees are blocking new bookings' USING ERRCODE = 'P0001';
  END IF;

  IF _check_in > current_date + v_contract.booking_window_days THEN
    RAISE EXCEPTION 'Your plan allows booking up to % days ahead', v_contract.booking_window_days
      USING ERRCODE = 'P0001';
  END IF;

  IF v_nights < v_contract.min_stay_nights OR v_nights > v_contract.max_stay_nights THEN
    RAISE EXCEPTION 'Stay must be between % and % nights', v_contract.min_stay_nights, v_contract.max_stay_nights
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_rt FROM public.room_types rt
  WHERE rt.id = _room_type_id AND rt.resort_id = _resort_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room type not found at this resort' USING ERRCODE = 'P0002';
  END IF;
  IF _adults > v_rt.max_adults OR _children > v_rt.max_children THEN
    RAISE EXCEPTION 'This room type sleeps % adults and % children', v_rt.max_adults, v_rt.max_children
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blackouts b
    WHERE (b.resort_id = _resort_id OR b.room_type_id = _room_type_id)
      AND b.start_date < _check_out
      AND b.end_date >= _check_in
  ) THEN
    RAISE EXCEPTION 'These dates fall in a blackout period' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.resort_unit_id INTO v_unit
  FROM public.availability a
  JOIN public.resort_units u ON u.id = a.resort_unit_id
  WHERE u.room_type_id = _room_type_id
    AND u.resort_id = _resort_id
    AND u.status = 'active'
    AND a.stay_date >= _check_in
    AND a.stay_date < _check_out
    AND a.status = 'available'
  GROUP BY a.resort_unit_id
  HAVING count(*) = v_nights
  ORDER BY a.resort_unit_id
  LIMIT 1;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'No unit is available for the whole stay' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(v_rt.base_points_per_night * COALESCE(s.points_multiplier, 1)), 0)
    INTO v_points
  FROM generate_series(_check_in, _check_out - 1, interval '1 day') AS d(day)
  LEFT JOIN public.seasons s
    ON s.resort_id = _resort_id
   AND d.day::date BETWEEN s.start_date AND s.end_date;

  v_fee := v_rt.base_nightly_fee * v_nights;
  v_cost := CASE WHEN v_contract.entitlement_kind = 'POINTS' THEN v_points ELSE v_nights END;

  SELECT e.* INTO v_ent
  FROM public.entitlements e
  WHERE e.member_id = v_member.id
    AND e.kind = v_contract.entitlement_kind
    AND e.year = EXTRACT(YEAR FROM _check_in)::int
  ORDER BY e.created_at
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No % entitlement exists for %', v_contract.entitlement_kind, EXTRACT(YEAR FROM _check_in)::int
      USING ERRCODE = 'P0002';
  END IF;

  v_balance := public.entitlement_balance(v_ent.id);
  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'Not enough entitlement: need %, have %', v_cost, v_balance USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reservations
    (booked_by, member_id, resort_id, status, check_in, check_out, nights,
     adults, children, points_used, nights_used, total_fees, entitlement_id, source)
  VALUES
    (v_user, v_member.id, _resort_id, 'pending', _check_in, _check_out, v_nights,
     _adults, _children,
     CASE WHEN v_contract.entitlement_kind = 'POINTS' THEN v_points ELSE 0 END,
     CASE WHEN v_contract.entitlement_kind = 'POINTS' THEN 0 ELSE v_nights END,
     v_fee, v_ent.id, 'member')
  RETURNING public.reservations.id, public.reservations.reference INTO v_res_id, v_ref;

  -- The exclusion constraint here is the real double-booking guard.
  INSERT INTO public.reservation_items
    (reservation_id, resort_unit_id, room_type_id, stay_range, points, fee)
  VALUES
    (v_res_id, v_unit, _room_type_id, daterange(_check_in, _check_out, '[)'), v_points, v_fee);

  UPDATE public.availability a
  SET status = 'booked', reservation_id = v_res_id, updated_at = now()
  WHERE a.resort_unit_id = v_unit
    AND a.stay_date >= _check_in
    AND a.stay_date < _check_out
    AND a.status = 'available';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_nights THEN
    RAISE EXCEPTION 'Availability changed while booking; please try again' USING ERRCODE = '40001';
  END IF;

  IF v_contract.entitlement_kind = 'POINTS' THEN
    INSERT INTO public.points_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
    VALUES (v_ent.id, -v_points, 'hold', v_res_id, v_user, 'Reservation ' || v_ref);
  ELSE
    INSERT INTO public.entitlement_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
    VALUES (v_ent.id, -v_nights, 'hold', v_res_id, v_user, 'Reservation ' || v_ref);
  END IF;

  IF _guest_name IS NOT NULL AND length(trim(_guest_name)) > 0 THEN
    INSERT INTO public.reservation_guests (reservation_id, full_name, is_primary)
    VALUES (v_res_id, trim(_guest_name), true);
  END IF;

  RETURN jsonb_build_object(
    'reservationId', v_res_id,
    'reference', v_ref,
    'pointsUsed', v_points,
    'totalFees', v_fee,
    'nights', v_nights,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.book_stay(uuid, uuid, date, date, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_stay(uuid, uuid, date, date, int, int, text) TO authenticated, service_role;
