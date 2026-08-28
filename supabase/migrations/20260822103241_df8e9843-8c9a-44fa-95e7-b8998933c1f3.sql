-- 1. Dispatcher -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid,
  _title text,
  _body text DEFAULT NULL,
  _link text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (user_id, channel, title, body, link, sent_at)
  VALUES (_user_id, 'in_app', _title, _body, _link, now())
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.member_user_id(_member_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.members WHERE id = _member_id
$$;
REVOKE EXECUTE ON FUNCTION public.member_user_id(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_user_id(_owner_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.owners WHERE id = _owner_id
$$;
REVOKE EXECUTE ON FUNCTION public.owner_user_id(uuid) FROM PUBLIC, anon, authenticated;

-- 2. Event triggers ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_reservation_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  _uid := COALESCE(
    public.member_user_id(NEW.member_id),
    public.owner_user_id(NEW.owner_id),
    NEW.booked_by
  );
  IF _uid IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(
      _uid,
      'Reservation ' || NEW.reference || ' created',
      'Your stay from ' || NEW.check_in || ' to ' || NEW.check_out || ' is ' || NEW.status || '.',
      '/member/bookings');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_user(
      _uid,
      CASE NEW.status
        WHEN 'confirmed' THEN 'Booking confirmed — ' || NEW.reference
        WHEN 'cancelled' THEN 'Booking cancelled — ' || NEW.reference
        WHEN 'checked_in' THEN 'Welcome — checked in for ' || NEW.reference
        WHEN 'completed' THEN 'Stay completed — ' || NEW.reference
        ELSE 'Booking updated — ' || NEW.reference
      END,
      'Status is now ' || NEW.status || ' for ' || NEW.check_in || ' to ' || NEW.check_out || '.',
      '/member/bookings');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reservation ON public.reservations;
CREATE TRIGGER trg_notify_reservation
AFTER INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.notify_reservation_event();

CREATE OR REPLACE FUNCTION public.notify_maintenance_fee_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  _uid := COALESCE(public.member_user_id(NEW.member_id), public.owner_user_id(NEW.owner_id));
  IF _uid IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(_uid,
      'Maintenance fee for ' || NEW.year,
      'An amount of ' || NEW.amount || ' is due by ' || NEW.due_date || '.',
      '/member/payments');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_user(_uid,
      'Maintenance fee ' || NEW.status,
      'Your ' || NEW.year || ' maintenance fee is now marked ' || NEW.status || '.',
      '/member/payments');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_maintenance_fee ON public.maintenance_fees;
CREATE TRIGGER trg_notify_maintenance_fee
AFTER INSERT OR UPDATE ON public.maintenance_fees
FOR EACH ROW EXECUTE FUNCTION public.notify_maintenance_fee_event();

CREATE OR REPLACE FUNCTION public.notify_membership_contract_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN RETURN NEW; END IF;
  _uid := public.member_user_id(NEW.member_id);
  PERFORM public.notify_user(_uid,
    'Membership activated',
    'Contract ' || NEW.contract_number || ' is active from ' || NEW.start_date || '.',
    '/member/membership');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_membership_contract ON public.membership_contracts;
CREATE TRIGGER trg_notify_membership_contract
AFTER INSERT OR UPDATE ON public.membership_contracts
FOR EACH ROW EXECUTE FUNCTION public.notify_membership_contract_event();

CREATE OR REPLACE FUNCTION public.notify_ownership_contract_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN RETURN NEW; END IF;
  _uid := public.owner_user_id(NEW.owner_id);
  PERFORM public.notify_user(_uid,
    'Ownership contract activated',
    'Contract ' || NEW.contract_number || ' is active from ' || NEW.start_date || '.',
    '/owner/ownership');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ownership_contract ON public.ownership_contracts;
CREATE TRIGGER trg_notify_ownership_contract
AFTER INSERT OR UPDATE ON public.ownership_contracts
FOR EACH ROW EXECUTE FUNCTION public.notify_ownership_contract_event();

CREATE OR REPLACE FUNCTION public.notify_ticket_message_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ticket public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO _ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.author_id IS DISTINCT FROM _ticket.user_id THEN
    PERFORM public.notify_user(_ticket.user_id,
      'Reply on: ' || _ticket.subject,
      left(NEW.body, 180),
      '/member/support');
  ELSIF _ticket.assigned_to IS NOT NULL THEN
    PERFORM public.notify_user(_ticket.assigned_to,
      'New message on: ' || _ticket.subject,
      left(NEW.body, 180),
      '/admin/tickets');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_message ON public.ticket_messages;
CREATE TRIGGER trg_notify_ticket_message
AFTER INSERT ON public.ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_message_event();

CREATE OR REPLACE FUNCTION public.notify_exchange_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  _uid := COALESCE(public.member_user_id(NEW.member_id), public.owner_user_id(NEW.owner_id));
  PERFORM public.notify_user(_uid,
    'Exchange request ' || NEW.status,
    'Your exchange request is now ' || NEW.status || '.',
    '/owner/exchange');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_exchange ON public.exchange_requests;
CREATE TRIGGER trg_notify_exchange
AFTER INSERT OR UPDATE ON public.exchange_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_exchange_event();

CREATE OR REPLACE FUNCTION public.notify_payout_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;
  _uid := public.owner_user_id(NEW.owner_id);
  PERFORM public.notify_user(_uid,
    'Rental payout sent',
    'A payout of ' || NEW.amount || ' has been released' ||
      COALESCE(' (UTR ' || NEW.utr || ')', '') || '.',
    '/owner/earnings');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payout ON public.rental_payouts;
CREATE TRIGGER trg_notify_payout
AFTER INSERT OR UPDATE ON public.rental_payouts
FOR EACH ROW EXECUTE FUNCTION public.notify_payout_event();

-- 3. Admin broadcast ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  _title text,
  _body text DEFAULT NULL,
  _link text DEFAULT NULL,
  _role app_role DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer := 0;
BEGIN
  PERFORM public.admin_guard('settings.write');
  IF coalesce(trim(_title), '') = '' THEN
    RAISE EXCEPTION 'A title is required';
  END IF;

  WITH targets AS (
    SELECT DISTINCT p.id
    FROM public.profiles p
    WHERE _role IS NULL
       OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = _role)
  ), ins AS (
    INSERT INTO public.notifications (user_id, channel, title, body, link, sent_at)
    SELECT id, 'in_app', _title, _body, _link, now() FROM targets
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM ins;

  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, app_role) TO authenticated;

-- 4. Document filing ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_file_document(
  _owner_user_id uuid,
  _kind document_kind,
  _title text,
  _storage_path text,
  _related_table text DEFAULT NULL,
  _related_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM public.admin_guard('documents.read');
  IF coalesce(trim(_title), '') = '' OR coalesce(trim(_storage_path), '') = '' THEN
    RAISE EXCEPTION 'A title and a stored file are required';
  END IF;

  INSERT INTO public.documents (owner_user_id, kind, title, storage_path, related_table, related_id)
  VALUES (_owner_user_id, _kind, _title, _storage_path, _related_table, _related_id)
  RETURNING id INTO _id;

  PERFORM public.notify_user(_owner_user_id,
    'New document available',
    _title || ' has been filed to your account.',
    '/member/documents');

  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_file_document(uuid, document_kind, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_file_document(uuid, document_kind, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_document(_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard('documents.read');
  DELETE FROM public.documents WHERE id = _document_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_document(uuid) TO authenticated;

-- 5. Directory of people documents can be filed against -----------------------

CREATE OR REPLACE FUNCTION public.admin_list_people(_term text DEFAULT NULL)
RETURNS TABLE (user_id uuid, full_name text, email text, code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         p.full_name,
         p.email,
         COALESCE(m.member_code, o.owner_code)
  FROM public.profiles p
  LEFT JOIN public.members m ON m.user_id = p.id
  LEFT JOIN public.owners o ON o.user_id = p.id
  WHERE public.admin_guard('documents.read') IS NULL
    AND (_term IS NULL OR _term = ''
         OR p.full_name ILIKE '%' || _term || '%'
         OR p.email ILIKE '%' || _term || '%'
         OR m.member_code ILIKE '%' || _term || '%'
         OR o.owner_code ILIKE '%' || _term || '%')
  ORDER BY p.full_name NULLS LAST
  LIMIT 50
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_people(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_people(text) TO authenticated;