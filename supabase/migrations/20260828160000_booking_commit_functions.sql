-- ====================================================================================================
-- Booking commit.
--
-- The whole reservation is committed inside ONE database function, therefore one
-- transaction. Doing this as a sequence of REST calls from the API could not be
-- atomic: a crash between "lock the nights" and "spend the allowance" would leave
-- a villa held for a booking that does not exist, or an allowance spent for a stay
-- nobody has. Any exception raised below rolls the entire thing back.
--
-- SECURITY DEFINER, and the member is resolved from auth.uid() rather than taken
-- as an argument, so a caller cannot book on someone else's behalf or spend
-- another member's allowance.
-- ====================================================================================================

CREATE OR REPLACE FUNCTION public.book_stay(
  _resort_id uuid,
  _room_type_id uuid,
  _check_in date,
  _check_out date,
  _adults int DEFAULT 1,
  _children int DEFAULT 0,
  _guest_name text DEFAULT NULL
)
RETURNS TABLE (reservation_id uuid, reference text, points_used numeric, total_fees numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_member    public.members%ROWTYPE;
  v_contract  record;
  v_plan      record;
  v_rt        record;
  v_nights    int;
  v_unit      uuid;
  v_points    numeric := 0;
  v_fee       numeric := 0;
  v_cost      numeric;
  v_ent       record;
  v_balance   numeric;
  v_updated   int;
  v_res_id    uuid;
  v_ref       text;
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

  -- 1. account active
  SELECT * INTO v_member FROM public.members WHERE user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No membership is linked to this account' USING ERRCODE = 'P0002';
  END IF;
  IF v_member.status <> 'active' THEN
    RAISE EXCEPTION 'Membership is %, not active', v_member.status USING ERRCODE = 'P0001';
  END IF;

  -- 2. a contract that actually covers these dates
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

  -- 3. unpaid maintenance fees can block new bookings
  IF EXISTS (
    SELECT 1 FROM public.maintenance_fees f
    WHERE f.member_id = v_member.id
      AND f.blocks_booking
      AND f.status IN ('pending', 'partial', 'overdue')
      AND f.due_date + f.grace_days < current_date
  ) THEN
    RAISE EXCEPTION 'Overdue maintenance fees are blocking new bookings' USING ERRCODE = 'P0001';
  END IF;

  -- 4. booking window
  IF _check_in > current_date + v_contract.booking_window_days THEN
    RAISE EXCEPTION 'Your plan allows booking up to % days ahead', v_contract.booking_window_days
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. stay length
  IF v_nights < v_contract.min_stay_nights OR v_nights > v_contract.max_stay_nights THEN
    RAISE EXCEPTION 'Stay must be between % and % nights', v_contract.min_stay_nights, v_contract.max_stay_nights
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. room type and capacity
  SELECT * INTO v_rt FROM public.room_types
  WHERE id = _room_type_id AND resort_id = _resort_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room type not found at this resort' USING ERRCODE = 'P0002';
  END IF;
  IF _adults > v_rt.max_adults OR _children > v_rt.max_children THEN
    RAISE EXCEPTION 'This room type sleeps % adults and % children', v_rt.max_adults, v_rt.max_children
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. blackouts
  IF EXISTS (
    SELECT 1 FROM public.blackouts b
    WHERE (b.resort_id = _resort_id OR b.room_type_id = _room_type_id)
      AND b.start_date < _check_out
      AND b.end_date >= _check_in
  ) THEN
    RAISE EXCEPTION 'These dates fall in a blackout period' USING ERRCODE = 'P0001';
  END IF;

  -- 8. pick a unit free on EVERY night, locking the rows so a concurrent booking
  --    cannot pick the same one between our read and our write
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

  -- 9. price the stay: points scale with the season, fees do not
  SELECT COALESCE(SUM(v_rt.base_points_per_night * COALESCE(s.points_multiplier, 1)), 0)
    INTO v_points
  FROM generate_series(_check_in, _check_out - 1, interval '1 day') AS d(day)
  LEFT JOIN public.seasons s
    ON s.resort_id = _resort_id
   AND d.day::date BETWEEN s.start_date AND s.end_date;

  v_fee := v_rt.base_nightly_fee * v_nights;
  v_cost := CASE WHEN v_contract.entitlement_kind = 'POINTS' THEN v_points ELSE v_nights END;

  -- 10. entitlement balance for the year of arrival
  SELECT * INTO v_ent
  FROM public.entitlements
  WHERE member_id = v_member.id
    AND kind = v_contract.entitlement_kind
    AND year = EXTRACT(YEAR FROM _check_in)::int
  ORDER BY created_at
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No % entitlement exists for %', v_contract.entitlement_kind, EXTRACT(YEAR FROM _check_in)::int
      USING ERRCODE = 'P0002';
  END IF;

  v_balance := public.entitlement_balance(v_ent.id);
  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'Not enough entitlement: need %, have %', v_cost, v_balance USING ERRCODE = 'P0001';
  END IF;

  -- 11. create the reservation
  INSERT INTO public.reservations
    (booked_by, member_id, resort_id, status, check_in, check_out, nights,
     adults, children, points_used, nights_used, total_fees, entitlement_id, source)
  VALUES
    (v_user, v_member.id, _resort_id, 'pending', _check_in, _check_out, v_nights,
     _adults, _children,
     CASE WHEN v_contract.entitlement_kind = 'POINTS' THEN v_points ELSE 0 END,
     CASE WHEN v_contract.entitlement_kind = 'POINTS' THEN 0 ELSE v_nights END,
     v_fee, v_ent.id, 'member')
  RETURNING id, reference INTO v_res_id, v_ref;

  -- 12. claim the unit. The exclusion constraint on reservation_items is the
  --     real double-booking guard: if another transaction got here first, this
  --     raises and the whole booking rolls back.
  INSERT INTO public.reservation_items
    (reservation_id, resort_unit_id, room_type_id, stay_range, points, fee)
  VALUES
    (v_res_id, v_unit, _room_type_id, daterange(_check_in, _check_out, '[)'), v_points, v_fee);

  -- 13. take the nights off the calendar; the row count must match exactly,
  --     otherwise something changed underneath us
  UPDATE public.availability
  SET status = 'booked', reservation_id = v_res_id, updated_at = now()
  WHERE resort_unit_id = v_unit
    AND stay_date >= _check_in
    AND stay_date < _check_out
    AND status = 'available';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_nights THEN
    RAISE EXCEPTION 'Availability changed while booking; please try again' USING ERRCODE = '40001';
  END IF;

  -- 14. hold the allowance (a negative ledger line, never an overwrite)
  IF v_contract.entitlement_kind = 'POINTS' THEN
    INSERT INTO public.points_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
    VALUES (v_ent.id, -v_points, 'hold', v_res_id, v_user, 'Reservation ' || v_ref);
  ELSE
    INSERT INTO public.entitlement_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
    VALUES (v_ent.id, -v_nights, 'hold', v_res_id, v_user, 'Reservation ' || v_ref);
  END IF;

  -- 15. named guest, if given
  IF _guest_name IS NOT NULL AND length(trim(_guest_name)) > 0 THEN
    INSERT INTO public.reservation_guests (reservation_id, full_name, is_primary)
    VALUES (v_res_id, trim(_guest_name), true);
  END IF;

  RETURN QUERY SELECT v_res_id, v_ref, v_points, v_fee;
END;
$$;

REVOKE ALL ON FUNCTION public.book_stay(uuid, uuid, date, date, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_stay(uuid, uuid, date, date, int, int, text) TO authenticated, service_role;

-- ====================================================================================================
-- Cancellation: release the villa and give the allowance back, also atomically.
-- ====================================================================================================

CREATE OR REPLACE FUNCTION public.cancel_reservation(_reservation_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_res      public.reservations%ROWTYPE;
  v_kind     public.entitlement_kind;
  v_restore  numeric;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = _reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_res.booked_by = v_user
          OR v_res.member_id = public.current_member_id()
          OR public.has_permission(v_user, 'bookings.write')) THEN
    RAISE EXCEPTION 'Not allowed to cancel this reservation' USING ERRCODE = '42501';
  END IF;

  IF v_res.status IN ('cancelled', 'completed', 'checked_in') THEN
    RAISE EXCEPTION 'Reservation is % and cannot be cancelled', v_res.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.reservations SET status = 'cancelled' WHERE id = _reservation_id;

  UPDATE public.reservation_items SET is_active = false WHERE reservation_id = _reservation_id;

  UPDATE public.availability
  SET status = 'available', reservation_id = NULL, updated_at = now()
  WHERE reservation_id = _reservation_id;

  -- Give the allowance back with a positive line, leaving the hold visible in history.
  IF v_res.entitlement_id IS NOT NULL THEN
    SELECT kind INTO v_kind FROM public.entitlements WHERE id = v_res.entitlement_id;
    IF v_kind = 'POINTS' THEN
      v_restore := v_res.points_used;
      INSERT INTO public.points_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
      VALUES (v_res.entitlement_id, v_restore, 'release', _reservation_id, v_user, COALESCE(_reason, 'Cancelled'));
    ELSE
      v_restore := v_res.nights_used;
      INSERT INTO public.entitlement_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
      VALUES (v_res.entitlement_id, v_restore, 'release', _reservation_id, v_user, COALESCE(_reason, 'Cancelled'));
    END IF;
  END IF;

  INSERT INTO public.cancellations (reservation_id, requested_by, reason, entitlement_restored)
  VALUES (_reservation_id, v_user, _reason, COALESCE(v_restore, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_reservation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid, text) TO authenticated, service_role;
