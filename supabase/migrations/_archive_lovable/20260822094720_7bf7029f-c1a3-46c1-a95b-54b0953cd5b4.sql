
-- Stage 09: payments + maintenance fees

INSERT INTO public.permissions (key, label, perm_group) VALUES
  ('finance.refund', 'Issue refunds', 'finance')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'SUPER_ADMIN'::app_role, 'finance.refund'
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions WHERE role_key = 'SUPER_ADMIN' AND permission_key = 'finance.refund'
);

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;

INSERT INTO public.system_settings (key, value, description) VALUES
  ('payment_provider', '{"provider":"razorpay","currency":"INR","enabled":true}'::jsonb, 'Payment provider configuration')
ON CONFLICT (key) DO NOTHING;

-- 1. Generate the annual maintenance fee run -------------------------------
CREATE OR REPLACE FUNCTION public.admin_generate_maintenance_fees(_year integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _created integer := 0;
  _defaults jsonb;
  _grace integer;
  _late numeric;
  _due date;
  r record;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'finance.write') THEN
    RAISE EXCEPTION 'Not authorised to generate maintenance fees';
  END IF;

  SELECT value INTO _defaults FROM public.system_settings WHERE key = 'maintenance_defaults';
  _grace := COALESCE((_defaults->>'grace_days')::int, 30);
  _late  := COALESCE((_defaults->>'late_fee')::numeric, 0);
  _due   := make_date(_year, 4, 30);

  FOR r IN
    SELECT mc.id AS contract_id, mc.member_id, p.maintenance_base_fee AS amount
    FROM public.membership_contracts mc
    JOIN public.membership_plans p ON p.id = mc.plan_id
    WHERE mc.status = 'active'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.maintenance_fees
      WHERE membership_contract_id = r.contract_id AND year = _year
    ) THEN
      INSERT INTO public.maintenance_fees
        (member_id, membership_contract_id, year, amount, due_date, grace_days, late_fee, status, blocks_booking)
      VALUES (r.member_id, r.contract_id, _year, r.amount, _due, _grace, _late, 'pending', true);
      _created := _created + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT oc.id AS contract_id, oc.owner_id, oc.maintenance_base_fee AS amount
    FROM public.ownership_contracts oc
    WHERE oc.status = 'active'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.maintenance_fees
      WHERE ownership_contract_id = r.contract_id AND year = _year
    ) THEN
      INSERT INTO public.maintenance_fees
        (owner_id, ownership_contract_id, year, amount, due_date, grace_days, late_fee, status, blocks_booking)
      VALUES (r.owner_id, r.contract_id, _year, r.amount, _due, _grace, _late, 'pending', true);
      _created := _created + 1;
    END IF;
  END LOOP;

  RETURN _created;
END;
$$;

-- 2. Start a payment: amount is always recomputed server-side --------------
CREATE OR REPLACE FUNCTION public.payment_start(_purpose payment_purpose, _reference_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _amount numeric(12,2);
  _paid numeric(12,2);
  _payment_id uuid;
  _label text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _purpose = 'maintenance' THEN
    SELECT (mf.amount + mf.late_fee - mf.amount_paid),
           'Maintenance fee ' || mf.year
      INTO _amount, _label
      FROM public.maintenance_fees mf
     WHERE mf.id = _reference_id
       AND (mf.member_id = public.current_member_id() OR mf.owner_id = public.current_owner_id())
       AND mf.status <> 'paid' AND mf.status <> 'waived';
  ELSIF _purpose = 'booking' THEN
    SELECT r.total_fees, 'Booking ' || r.reference
      INTO _amount, _label
      FROM public.reservations r
     WHERE r.id = _reference_id
       AND (r.booked_by = _uid OR r.member_id = public.current_member_id() OR r.owner_id = public.current_owner_id())
       AND r.status IN ('pending', 'confirmed');
    IF _amount IS NOT NULL THEN
      SELECT COALESCE(SUM(p.amount), 0) INTO _paid
        FROM public.payments p
       WHERE p.purpose = 'booking' AND p.reference_id = _reference_id AND p.status = 'captured';
      _amount := _amount - _paid;
    END IF;
  ELSIF _purpose = 'membership' THEN
    SELECT mc.price_paid, 'Membership ' || mc.contract_number
      INTO _amount, _label
      FROM public.membership_contracts mc
      JOIN public.members m ON m.id = mc.member_id
     WHERE mc.id = _reference_id AND m.user_id = _uid;
    IF _amount IS NOT NULL THEN
      SELECT COALESCE(SUM(p.amount), 0) INTO _paid
        FROM public.payments p
       WHERE p.purpose = 'membership' AND p.reference_id = _reference_id AND p.status = 'captured';
      _amount := _amount - _paid;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported payment purpose';
  END IF;

  IF _amount IS NULL THEN
    RAISE EXCEPTION 'Nothing payable for this record';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'This item is already settled';
  END IF;

  INSERT INTO public.payments (payer_id, purpose, reference_id, amount, currency, status, provider)
  VALUES (_uid, _purpose, _reference_id, _amount, 'INR', 'created', 'razorpay')
  RETURNING id INTO _payment_id;

  RETURN jsonb_build_object(
    'payment_id', _payment_id,
    'amount', _amount,
    'currency', 'INR',
    'label', _label
  );
END;
$$;

-- 3. Attach the provider order id (server only) ----------------------------
CREATE OR REPLACE FUNCTION public.payment_attach_order(_payment_id uuid, _provider_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payments
     SET provider_order_id = _provider_order_id, updated_at = now()
   WHERE id = _payment_id;
END;
$$;

-- 4. Record a provider event and advance dependent records (server only) ---
CREATE OR REPLACE FUNCTION public.payment_apply_event(
  _payment_id uuid,
  _provider_payment_id text,
  _event text,
  _amount numeric,
  _payload jsonb,
  _signature_verified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.payments%ROWTYPE;
  _new public.payment_status;
  _fee public.maintenance_fees%ROWTYPE;
  _invoice_id uuid;
BEGIN
  SELECT * INTO _p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown payment';
  END IF;

  IF _provider_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_transactions
     WHERE provider_payment_id = _provider_payment_id AND event = _event
  ) THEN
    RETURN jsonb_build_object('status', _p.status, 'duplicate', true);
  END IF;

  INSERT INTO public.payment_transactions
    (payment_id, provider_payment_id, event, amount, raw_payload, signature_verified)
  VALUES (_payment_id, _provider_payment_id, _event, _amount, COALESCE(_payload, '{}'::jsonb), COALESCE(_signature_verified, false));

  _new := CASE
    WHEN _event IN ('payment.captured', 'captured') THEN 'captured'
    WHEN _event IN ('payment.authorized', 'authorized') THEN 'authorized'
    WHEN _event IN ('payment.failed', 'failed') THEN 'failed'
    ELSE _p.status
  END::public.payment_status;

  UPDATE public.payments SET status = _new, updated_at = now() WHERE id = _payment_id;

  IF _new = 'captured' AND _p.status <> 'captured' THEN
    IF _p.purpose = 'maintenance' THEN
      SELECT * INTO _fee FROM public.maintenance_fees WHERE id = _p.reference_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.maintenance_fees
           SET amount_paid = _fee.amount_paid + _p.amount,
               status = CASE
                 WHEN _fee.amount_paid + _p.amount >= _fee.amount + _fee.late_fee THEN 'paid'::fee_status
                 ELSE 'partial'::fee_status
               END,
               blocks_booking = CASE
                 WHEN _fee.amount_paid + _p.amount >= _fee.amount + _fee.late_fee THEN false
                 ELSE _fee.blocks_booking
               END,
               updated_at = now()
         WHERE id = _fee.id;
      END IF;
    ELSIF _p.purpose = 'booking' THEN
      UPDATE public.reservations
         SET status = 'confirmed', updated_at = now()
       WHERE id = _p.reference_id AND status = 'pending';
    ELSIF _p.purpose = 'membership' THEN
      UPDATE public.membership_contracts
         SET status = 'active', updated_at = now()
       WHERE id = _p.reference_id AND status = 'draft';
    END IF;

    INSERT INTO public.invoices (number, payer_id, payment_id, line_items, subtotal, tax, total)
    VALUES (
      'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
      _p.payer_id,
      _p.id,
      jsonb_build_array(jsonb_build_object('description', _p.purpose::text, 'reference', _p.reference_id, 'amount', _p.amount)),
      _p.amount, 0, _p.amount
    )
    RETURNING id INTO _invoice_id;

    IF _p.payer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, channel, title, body, sent_at)
      VALUES (_p.payer_id, 'in_app', 'Payment received',
              'We have received your payment of INR ' || _p.amount::text || '.', now());
    END IF;
  END IF;

  RETURN jsonb_build_object('status', _new, 'duplicate', false, 'invoice_id', _invoice_id);
END;
$$;

-- 5. Refunds ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_refund(_payment_id uuid, _amount numeric, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.payments%ROWTYPE;
  _already numeric;
  _refund_id uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'finance.refund') THEN
    RAISE EXCEPTION 'Not authorised to issue refunds';
  END IF;

  SELECT * INTO _p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR _p.status NOT IN ('captured', 'partially_refunded') THEN
    RAISE EXCEPTION 'Only captured payments can be refunded';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _already
    FROM public.refunds WHERE payment_id = _payment_id AND status <> 'failed';

  IF _amount <= 0 OR _already + _amount > _p.amount THEN
    RAISE EXCEPTION 'Refund amount exceeds the captured amount';
  END IF;

  INSERT INTO public.refunds (payment_id, amount, reason, status)
  VALUES (_payment_id, _amount, _reason, 'pending')
  RETURNING id INTO _refund_id;

  RETURN _refund_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_mark_processed(_refund_id uuid, _provider_refund_id text, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.refunds%ROWTYPE;
  _total numeric;
  _payment public.payments%ROWTYPE;
BEGIN
  UPDATE public.refunds
     SET provider_refund_id = COALESCE(_provider_refund_id, provider_refund_id),
         status = _status,
         processed_at = CASE WHEN _status = 'processed' THEN now() ELSE processed_at END
   WHERE id = _refund_id
  RETURNING * INTO _r;

  IF NOT FOUND OR _status <> 'processed' THEN
    RETURN;
  END IF;

  SELECT * INTO _payment FROM public.payments WHERE id = _r.payment_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO _total
    FROM public.refunds WHERE payment_id = _r.payment_id AND status = 'processed';

  UPDATE public.payments
     SET status = CASE WHEN _total >= _payment.amount THEN 'refunded'::payment_status
                       ELSE 'partially_refunded'::payment_status END,
         updated_at = now()
   WHERE id = _r.payment_id;
END;
$$;

-- Execute grants: caller-facing vs server-only
REVOKE ALL ON FUNCTION public.admin_generate_maintenance_fees(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_start(payment_purpose, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_attach_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_apply_event(uuid, text, text, numeric, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_refund(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refund_mark_processed(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_generate_maintenance_fees(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_start(payment_purpose, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_refund(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_attach_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_apply_event(uuid, text, text, numeric, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_mark_processed(uuid, text, text) TO service_role;
