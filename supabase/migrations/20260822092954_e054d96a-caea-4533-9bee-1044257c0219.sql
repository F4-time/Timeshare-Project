-- ============ STAGE 08: BOOKING ENGINE ============

INSERT INTO public.permissions (key, label, perm_group) VALUES
  ('bookings.write','Create and manage bookings for others','bookings')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('ADMIN_STAFF','bookings.write'),
  ('SUPER_ADMIN','bookings.write')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO public.system_settings (key, value, description) VALUES
  ('booking_min_nights','2','Minimum nights per reservation'),
  ('booking_max_nights','21','Maximum nights per reservation')
ON CONFLICT (key) DO NOTHING;

-- reservation reference sequence
CREATE SEQUENCE IF NOT EXISTS public.reservation_reference_seq;

CREATE OR REPLACE FUNCTION public.next_reservation_reference()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'FT-R-' || to_char(current_date,'YY') || '-' || lpad(nextval('public.reservation_reference_seq')::text, 5, '0')
$$;
REVOKE ALL ON FUNCTION public.next_reservation_reference() FROM PUBLIC, anon;

-- ---------------------------------------------------------------- search
CREATE OR REPLACE FUNCTION public.search_availability(
  _check_in date,
  _check_out date,
  _resort_id uuid DEFAULT NULL,
  _adults int DEFAULT 2,
  _children int DEFAULT 0
)
RETURNS TABLE (
  resort_unit_id uuid,
  unit_number text,
  resort_id uuid,
  resort_name text,
  resort_slug text,
  room_type_id uuid,
  room_type_name text,
  max_adults int,
  max_children int,
  nights int,
  points_required numeric,
  fee_estimate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH nights AS (
    SELECT generate_series(_check_in, _check_out - 1, interval '1 day')::date AS d
  ),
  n AS (SELECT count(*)::int AS cnt FROM nights)
  SELECT u.id,
         u.unit_number,
         r.id,
         r.name,
         r.slug,
         rt.id,
         rt.name,
         rt.max_adults,
         rt.max_children,
         (SELECT cnt FROM n),
         (SELECT coalesce(sum(rt.base_points_per_night * coalesce(
                    (SELECT s.points_multiplier FROM public.seasons s
                      WHERE s.resort_id = r.id AND nights.d BETWEEN s.start_date AND s.end_date
                      ORDER BY s.points_multiplier DESC LIMIT 1), 1)), 0)
            FROM nights),
         rt.base_nightly_fee * (SELECT cnt FROM n)
  FROM public.resort_units u
  JOIN public.resorts r ON r.id = u.resort_id
  JOIN public.room_types rt ON rt.id = u.room_type_id
  WHERE auth.uid() IS NOT NULL
    AND _check_out > _check_in
    AND u.status = 'active'
    AND r.status = 'published'
    AND (_resort_id IS NULL OR r.id = _resort_id)
    AND rt.max_adults >= _adults
    AND rt.max_children >= _children
    AND NOT EXISTS (
      SELECT 1 FROM nights
      WHERE NOT EXISTS (
        SELECT 1 FROM public.availability a
        WHERE a.resort_unit_id = u.id AND a.stay_date = nights.d AND a.status = 'available'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blackouts b
      WHERE (b.resort_id IS NULL OR b.resort_id = r.id)
        AND (b.room_type_id IS NULL OR b.room_type_id = rt.id)
        AND daterange(b.start_date, b.end_date, '[]') && daterange(_check_in, _check_out, '[)')
    )
  ORDER BY r.name, u.unit_number
$$;
REVOKE ALL ON FUNCTION public.search_availability(date,date,uuid,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_availability(date,date,uuid,int,int) TO authenticated, service_role;

-- ------------------------------------------------------------- quote
CREATE OR REPLACE FUNCTION public.booking_quote(
  _resort_unit_id uuid,
  _check_in date,
  _check_out date,
  _adults int DEFAULT 2,
  _children int DEFAULT 0,
  _for_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target uuid := coalesce(_for_user_id, auth.uid());
  v_unit record;
  v_member_id uuid;
  v_owner_id uuid;
  v_ent record;
  v_nights int;
  v_points numeric := 0;
  v_fee numeric := 0;
  v_cost numeric := 0;
  v_balance numeric := 0;
  v_window int := 365;
  v_min int;
  v_max int;
  v_issues text[] := '{}';
  d date;
  v_mult numeric;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_target <> v_actor AND NOT public.has_permission(v_actor,'bookings.write') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'Check-out must be after check-in'; END IF;

  SELECT u.id, u.resort_id, rt.id AS room_type_id, rt.name AS room_type_name, rt.max_adults, rt.max_children,
         rt.base_points_per_night, rt.base_nightly_fee, r.name AS resort_name
    INTO v_unit
  FROM public.resort_units u
  JOIN public.room_types rt ON rt.id = u.room_type_id
  JOIN public.resorts r ON r.id = u.resort_id
  WHERE u.id = _resort_unit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unit not found'; END IF;

  v_nights := _check_out - _check_in;
  SELECT (value#>>'{}')::int INTO v_min FROM public.system_settings WHERE key = 'booking_min_nights';
  SELECT (value#>>'{}')::int INTO v_max FROM public.system_settings WHERE key = 'booking_max_nights';
  IF v_nights < coalesce(v_min,1) THEN v_issues := v_issues || format('Minimum stay is %s nights', coalesce(v_min,1)); END IF;
  IF v_nights > coalesce(v_max,30) THEN v_issues := v_issues || format('Maximum stay is %s nights', coalesce(v_max,30)); END IF;
  IF _adults > v_unit.max_adults OR _children > v_unit.max_children THEN
    v_issues := v_issues || 'Guest count exceeds unit capacity';
  END IF;

  -- pricing
  d := _check_in;
  WHILE d < _check_out LOOP
    SELECT s.points_multiplier INTO v_mult FROM public.seasons s
      WHERE s.resort_id = v_unit.resort_id AND d BETWEEN s.start_date AND s.end_date
      ORDER BY s.points_multiplier DESC LIMIT 1;
    v_points := v_points + v_unit.base_points_per_night * coalesce(v_mult, 1);
    d := d + 1;
  END LOOP;
  v_fee := v_unit.base_nightly_fee * v_nights;

  SELECT id INTO v_member_id FROM public.members WHERE user_id = v_target;
  SELECT id INTO v_owner_id FROM public.owners WHERE user_id = v_target;
  IF v_member_id IS NULL AND v_owner_id IS NULL THEN
    v_issues := v_issues || 'No active membership or ownership on this account';
  END IF;

  -- account status
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_target AND p.status <> 'active') THEN
    v_issues := v_issues || 'Account is not active';
  END IF;

  -- entitlement
  SELECT e.*, public.entitlement_balance(e.id) AS balance INTO v_ent
  FROM public.entitlements e
  WHERE ((v_member_id IS NOT NULL AND e.member_id = v_member_id)
      OR (v_owner_id IS NOT NULL AND e.owner_id = v_owner_id))
    AND e.status = 'available'
    AND e.valid_from <= _check_in
    AND (e.valid_to IS NULL OR e.valid_to >= _check_out)
  ORDER BY public.entitlement_balance(e.id) DESC
  LIMIT 1;

  IF v_ent.id IS NULL THEN
    v_issues := v_issues || 'No valid entitlement covering these dates';
  ELSE
    v_balance := v_ent.balance;
    IF v_ent.kind = 'POINTS' THEN v_cost := v_points; ELSE v_cost := v_nights; END IF;
    IF v_balance < v_cost THEN
      v_issues := v_issues || format('Insufficient balance: %s required, %s available', v_cost, v_balance);
    END IF;
    -- booking window from plan
    SELECT p.booking_window_days INTO v_window
    FROM public.membership_contracts mc
    JOIN public.membership_plans p ON p.id = mc.plan_id
    WHERE mc.id = v_ent.membership_contract_id;
    IF v_window IS NOT NULL AND _check_in > current_date + (v_window || ' days')::interval THEN
      v_issues := v_issues || format('Outside the %s day booking window', v_window);
    END IF;
  END IF;

  IF _check_in < current_date THEN v_issues := v_issues || 'Check-in date is in the past'; END IF;

  -- maintenance fees blocking
  IF EXISTS (
    SELECT 1 FROM public.maintenance_fees f
    WHERE ((v_member_id IS NOT NULL AND f.member_id = v_member_id)
        OR (v_owner_id IS NOT NULL AND f.owner_id = v_owner_id))
      AND f.blocks_booking
      AND f.status IN ('pending','partial','overdue')
      AND f.due_date < current_date
  ) THEN
    v_issues := v_issues || 'An overdue maintenance fee is blocking new bookings';
  END IF;

  -- inventory
  IF EXISTS (
    SELECT 1 FROM generate_series(_check_in, _check_out - 1, interval '1 day') g(d)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.availability a
      WHERE a.resort_unit_id = _resort_unit_id AND a.stay_date = g.d::date AND a.status = 'available')
  ) THEN
    v_issues := v_issues || 'Selected dates are no longer available';
  END IF;

  -- blackouts
  IF EXISTS (
    SELECT 1 FROM public.blackouts b
    WHERE (b.resort_id IS NULL OR b.resort_id = v_unit.resort_id)
      AND (b.room_type_id IS NULL OR b.room_type_id = v_unit.room_type_id)
      AND daterange(b.start_date, b.end_date, '[]') && daterange(_check_in, _check_out, '[)')
  ) THEN
    v_issues := v_issues || 'A blackout period applies to these dates';
  END IF;

  RETURN jsonb_build_object(
    'resort_unit_id', _resort_unit_id,
    'resort_name', v_unit.resort_name,
    'room_type_name', v_unit.room_type_name,
    'check_in', _check_in,
    'check_out', _check_out,
    'nights', v_nights,
    'points_required', v_points,
    'fee_estimate', v_fee,
    'entitlement_id', v_ent.id,
    'entitlement_kind', v_ent.kind,
    'cost_units', v_cost,
    'balance', v_balance,
    'issues', to_jsonb(v_issues),
    'bookable', (array_length(v_issues,1) IS NULL)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.booking_quote(uuid,date,date,int,int,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_quote(uuid,date,date,int,int,uuid) TO authenticated, service_role;

-- ------------------------------------------------------------ book
CREATE OR REPLACE FUNCTION public.book_reservation(
  _resort_unit_id uuid,
  _check_in date,
  _check_out date,
  _adults int DEFAULT 2,
  _children int DEFAULT 0,
  _guests jsonb DEFAULT '[]'::jsonb,
  _for_user_id uuid DEFAULT NULL,
  _override boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target uuid := coalesce(_for_user_id, auth.uid());
  v_quote jsonb;
  v_issues jsonb;
  v_unit record;
  v_member_id uuid;
  v_owner_id uuid;
  v_res_id uuid;
  v_ent_id uuid;
  v_cost numeric;
  v_locked int;
  v_nights int := _check_out - _check_in;
  v_guest jsonb;
  v_source text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF (v_target <> v_actor OR _override) AND NOT public.has_permission(v_actor,'bookings.write') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _override AND NOT public.has_permission(v_actor,'bookings.override') THEN
    RAISE EXCEPTION 'Override not permitted';
  END IF;

  v_quote := public.booking_quote(_resort_unit_id, _check_in, _check_out, _adults, _children, v_target);
  v_issues := v_quote->'issues';

  IF NOT _override AND (v_quote->>'bookable')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Booking rejected: %', coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_issues)), '; '), 'unknown reason');
  END IF;

  SELECT u.id, u.resort_id, u.room_type_id INTO v_unit FROM public.resort_units u WHERE u.id = _resort_unit_id;

  SELECT id INTO v_member_id FROM public.members WHERE user_id = v_target;
  SELECT id INTO v_owner_id FROM public.owners WHERE user_id = v_target;
  v_ent_id := nullif(v_quote->>'entitlement_id','')::uuid;
  v_cost := coalesce((v_quote->>'cost_units')::numeric, 0);
  v_source := CASE WHEN v_target <> v_actor THEN 'admin'
                   WHEN v_owner_id IS NOT NULL AND v_member_id IS NULL THEN 'owner'
                   ELSE 'member' END;

  -- lock inventory
  PERFORM 1 FROM public.availability a
   WHERE a.resort_unit_id = _resort_unit_id
     AND a.stay_date >= _check_in AND a.stay_date < _check_out
   FOR UPDATE;

  SELECT count(*) INTO v_locked FROM public.availability a
   WHERE a.resort_unit_id = _resort_unit_id
     AND a.stay_date >= _check_in AND a.stay_date < _check_out
     AND a.status = 'available';
  IF v_locked <> v_nights THEN
    RAISE EXCEPTION 'Selected dates are no longer available';
  END IF;

  INSERT INTO public.reservations (
    reference, booked_by, member_id, owner_id, resort_id, status,
    check_in, check_out, nights, adults, children,
    points_used, nights_used, total_fees, entitlement_id, source)
  VALUES (
    public.next_reservation_reference(), v_actor, v_member_id, v_owner_id, v_unit.resort_id, 'confirmed',
    _check_in, _check_out, v_nights, _adults, _children,
    coalesce((v_quote->>'points_required')::numeric,0),
    CASE WHEN (v_quote->>'entitlement_kind') = 'POINTS' THEN 0 ELSE v_nights END,
    coalesce((v_quote->>'fee_estimate')::numeric,0), v_ent_id, v_source)
  RETURNING id INTO v_res_id;

  INSERT INTO public.reservation_items (reservation_id, resort_unit_id, room_type_id, stay_range, points, fee)
  VALUES (v_res_id, _resort_unit_id, v_unit.room_type_id, daterange(_check_in, _check_out, '[)'),
          coalesce((v_quote->>'points_required')::numeric,0), coalesce((v_quote->>'fee_estimate')::numeric,0));

  UPDATE public.availability a
     SET status = 'booked', reservation_id = v_res_id, updated_at = now()
   WHERE a.resort_unit_id = _resort_unit_id
     AND a.stay_date >= _check_in AND a.stay_date < _check_out;

  FOR v_guest IN SELECT * FROM jsonb_array_elements(coalesce(_guests,'[]'::jsonb)) LOOP
    INSERT INTO public.reservation_guests (reservation_id, full_name, relation, is_primary)
    VALUES (v_res_id, v_guest->>'full_name', v_guest->>'relation', coalesce((v_guest->>'is_primary')::boolean,false));
  END LOOP;

  IF v_ent_id IS NOT NULL AND v_cost > 0 THEN
    INSERT INTO public.entitlement_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
    VALUES (v_ent_id, -v_cost, 'consume', v_res_id, v_actor, 'Reservation confirmed');
  END IF;

  INSERT INTO public.notifications (user_id, channel, title, body, entity_type, entity_id)
  VALUES (v_target, 'in_app', 'Booking confirmed',
          format('Your stay from %s to %s is confirmed.', _check_in, _check_out),
          'reservation', v_res_id);

  RETURN v_res_id;
END;
$$;
REVOKE ALL ON FUNCTION public.book_reservation(uuid,date,date,int,int,jsonb,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_reservation(uuid,date,date,int,int,jsonb,uuid,boolean) TO authenticated, service_role;

-- ------------------------------------------------------------ cancel
CREATE OR REPLACE FUNCTION public.cancel_reservation(_reservation_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_res record;
  v_policy jsonb;
  v_tier jsonb;
  v_days int;
  v_restore_pct numeric := 0;
  v_refund_pct numeric := 0;
  v_cost numeric := 0;
  v_restored numeric := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_res FROM public.reservations WHERE id = _reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF NOT (v_res.booked_by = v_actor
       OR v_res.member_id = public.current_member_id()
       OR v_res.owner_id = public.current_owner_id()
       OR public.has_permission(v_actor,'bookings.write')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF v_res.status IN ('cancelled','completed','checked_in','no_show') THEN
    RAISE EXCEPTION 'This reservation can no longer be cancelled';
  END IF;

  SELECT value INTO v_policy FROM public.system_settings WHERE key = 'cancellation_policy';
  v_days := v_res.check_in - current_date;
  SELECT t INTO v_tier FROM jsonb_array_elements(coalesce(v_policy,'[]'::jsonb)) t
   WHERE (t->>'min_days')::int <= v_days
   ORDER BY (t->>'min_days')::int DESC LIMIT 1;
  v_restore_pct := coalesce((v_tier->>'entitlement_restored_pct')::numeric, 0);
  v_refund_pct := coalesce((v_tier->>'refund_pct')::numeric, 0);

  SELECT coalesce(sum(-delta),0) INTO v_cost FROM public.entitlement_ledger
   WHERE reservation_id = _reservation_id AND reason = 'consume';
  v_restored := round(v_cost * v_restore_pct / 100.0, 2);

  UPDATE public.reservations SET status = 'cancelled', updated_at = now() WHERE id = _reservation_id;

  UPDATE public.reservation_items SET is_active = false WHERE reservation_id = _reservation_id;

  UPDATE public.availability
     SET status = 'available', reservation_id = NULL, updated_at = now()
   WHERE reservation_id = _reservation_id;

  IF v_restored > 0 AND v_res.entitlement_id IS NOT NULL THEN
    INSERT INTO public.entitlement_ledger (entitlement_id, delta, reason, reservation_id, actor_id, notes)
    VALUES (v_res.entitlement_id, v_restored, 'release', _reservation_id, v_actor, 'Cancellation restore');
  END IF;

  INSERT INTO public.cancellations (reservation_id, requested_by, reason, policy_applied, refund_amount, entitlement_restored, status)
  VALUES (_reservation_id, v_actor, _reason, coalesce(v_tier,'{}'::jsonb),
          round(v_res.total_fees * v_refund_pct / 100.0, 2), v_restored, 'processed');

  INSERT INTO public.notifications (user_id, channel, title, body, entity_type, entity_id)
  SELECT p.id, 'in_app', 'Booking cancelled',
         format('Reservation %s has been cancelled.', v_res.reference), 'reservation', _reservation_id
  FROM public.profiles p
  WHERE p.id = coalesce((SELECT user_id FROM public.members WHERE id = v_res.member_id),
                        (SELECT user_id FROM public.owners WHERE id = v_res.owner_id),
                        v_res.booked_by);

  RETURN jsonb_build_object('entitlement_restored', v_restored,
                            'refund_amount', round(v_res.total_fees * v_refund_pct / 100.0, 2),
                            'policy', coalesce(v_tier,'{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_reservation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------- cancellation preview
CREATE OR REPLACE FUNCTION public.cancellation_preview(_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res record;
  v_policy jsonb;
  v_tier jsonb;
  v_days int;
  v_cost numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_see_reservation(_reservation_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO v_res FROM public.reservations WHERE id = _reservation_id;
  SELECT value INTO v_policy FROM public.system_settings WHERE key = 'cancellation_policy';
  v_days := v_res.check_in - current_date;
  SELECT t INTO v_tier FROM jsonb_array_elements(coalesce(v_policy,'[]'::jsonb)) t
   WHERE (t->>'min_days')::int <= v_days ORDER BY (t->>'min_days')::int DESC LIMIT 1;
  SELECT coalesce(sum(-delta),0) INTO v_cost FROM public.entitlement_ledger
   WHERE reservation_id = _reservation_id AND reason = 'consume';
  RETURN jsonb_build_object(
    'days_before', v_days,
    'entitlement_restored', round(v_cost * coalesce((v_tier->>'entitlement_restored_pct')::numeric,0) / 100.0, 2),
    'refund_amount', round(v_res.total_fees * coalesce((v_tier->>'refund_pct')::numeric,0) / 100.0, 2),
    'policy', coalesce(v_tier,'{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.cancellation_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancellation_preview(uuid) TO authenticated, service_role;

-- ---------------------------------------------------- status changes
CREATE OR REPLACE FUNCTION public.admin_set_reservation_status(_reservation_id uuid, _status public.reservation_status)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(),'bookings.write') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _status = 'cancelled' THEN
    PERFORM public.cancel_reservation(_reservation_id, 'Cancelled by staff');
    RETURN;
  END IF;
  UPDATE public.reservations SET status = _status, updated_at = now() WHERE id = _reservation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_reservation_status(uuid, public.reservation_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_reservation_status(uuid, public.reservation_status) TO authenticated, service_role;

-- audit triggers for cancellations
DROP TRIGGER IF EXISTS cancellations_audit ON public.cancellations;
CREATE TRIGGER cancellations_audit AFTER INSERT OR UPDATE ON public.cancellations
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();