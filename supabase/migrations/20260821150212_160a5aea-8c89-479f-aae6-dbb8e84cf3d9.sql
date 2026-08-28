
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============ ENTITLEMENTS ============
CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.owners(id) ON DELETE CASCADE,
  membership_contract_id uuid REFERENCES public.membership_contracts(id) ON DELETE SET NULL,
  ownership_contract_id uuid REFERENCES public.ownership_contracts(id) ON DELETE SET NULL,
  kind public.entitlement_kind NOT NULL,
  year int NOT NULL,
  total_units numeric(12,2) NOT NULL DEFAULT 0,
  status public.entitlement_status NOT NULL DEFAULT 'available',
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_party_chk CHECK (num_nonnulls(member_id, owner_id) = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.entitlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.entitlements(id) ON DELETE CASCADE,
  delta numeric(12,2) NOT NULL,
  reason text NOT NULL,
  reservation_id uuid,
  actor_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.entitlement_ledger TO authenticated;
GRANT ALL ON public.entitlement_ledger TO service_role;
ALTER TABLE public.entitlement_ledger ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.entitlements(id) ON DELETE CASCADE,
  delta numeric(12,2) NOT NULL,
  reason text NOT NULL,
  reservation_id uuid,
  actor_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_entitlement(_entitlement_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.id = _entitlement_id
      AND (e.member_id = public.current_member_id() OR e.owner_id = public.current_owner_id())
  );
$$;
REVOKE ALL ON FUNCTION public.owns_entitlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_entitlement(uuid) TO authenticated, service_role;

-- ============ RESERVATIONS ============
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  booked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.owners(id) ON DELETE SET NULL,
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE RESTRICT,
  status public.reservation_status NOT NULL DEFAULT 'pending',
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights int NOT NULL,
  adults int NOT NULL DEFAULT 1,
  children int NOT NULL DEFAULT 0,
  points_used numeric(12,2) NOT NULL DEFAULT 0,
  nights_used numeric(12,2) NOT NULL DEFAULT 0,
  total_fees numeric(12,2) NOT NULL DEFAULT 0,
  entitlement_id uuid REFERENCES public.entitlements(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_dates_chk CHECK (check_out > check_in)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.availability
  ADD CONSTRAINT availability_reservation_fk FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE SET NULL;
ALTER TABLE public.entitlement_ledger
  ADD CONSTRAINT entitlement_ledger_reservation_fk FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE SET NULL;
ALTER TABLE public.points_ledger
  ADD CONSTRAINT points_ledger_reservation_fk FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE SET NULL;

CREATE TABLE public.reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  resort_unit_id uuid NOT NULL REFERENCES public.resort_units(id) ON DELETE RESTRICT,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE RESTRICT,
  stay_range daterange NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  points numeric(12,2) NOT NULL DEFAULT 0,
  fee numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_items_no_overlap
    EXCLUDE USING gist (resort_unit_id WITH =, stay_range WITH &&) WHERE (is_active)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_items TO authenticated;
GRANT ALL ON public.reservation_items TO service_role;
ALTER TABLE public.reservation_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reservation_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relation text,
  is_primary boolean NOT NULL DEFAULT false,
  id_proof_url text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_guests TO authenticated;
GRANT ALL ON public.reservation_guests TO service_role;
ALTER TABLE public.reservation_guests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  policy_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  refund_amount numeric(12,2) NOT NULL DEFAULT 0,
  entitlement_restored numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cancellations TO authenticated;
GRANT ALL ON public.cancellations TO service_role;
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_see_reservation(_reservation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = _reservation_id
      AND (r.booked_by = auth.uid()
        OR r.member_id = public.current_member_id()
        OR r.owner_id = public.current_owner_id()
        OR public.staff_can_access_resort(auth.uid(), r.resort_id)
        OR public.has_permission(auth.uid(), 'bookings.read'))
  );
$$;
REVOKE ALL ON FUNCTION public.can_see_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_reservation(uuid) TO authenticated, service_role;

-- ============ MONEY ============
CREATE TABLE public.maintenance_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.owners(id) ON DELETE CASCADE,
  membership_contract_id uuid REFERENCES public.membership_contracts(id) ON DELETE SET NULL,
  ownership_contract_id uuid REFERENCES public.ownership_contracts(id) ON DELETE SET NULL,
  year int NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  grace_days int NOT NULL DEFAULT 30,
  late_fee numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  status public.fee_status NOT NULL DEFAULT 'pending',
  blocks_booking boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_party_chk CHECK (num_nonnulls(member_id, owner_id) = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_fees TO authenticated;
GRANT ALL ON public.maintenance_fees TO service_role;
ALTER TABLE public.maintenance_fees ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose public.payment_purpose NOT NULL,
  reference_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status public.payment_status NOT NULL DEFAULT 'created',
  provider text NOT NULL DEFAULT 'razorpay',
  provider_order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  provider_payment_id text,
  event text NOT NULL,
  amount numeric(12,2),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_payment_id, event)
);
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  payer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  issued_at timestamptz NOT NULL DEFAULT now(),
  pdf_path text
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  reason text,
  provider_refund_id text,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- ============ MARKETPLACE ============
CREATE TABLE public.rental_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.ownership_contracts(id) ON DELETE SET NULL,
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE RESTRICT,
  resort_unit_id uuid REFERENCES public.resort_units(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  asking_price numeric(12,2) NOT NULL,
  commission_pct numeric(5,2) NOT NULL DEFAULT 20,
  status public.listing_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_listings TO authenticated;
GRANT ALL ON public.rental_listings TO service_role;
ALTER TABLE public.rental_listings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rental_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.rental_listings(id) ON DELETE CASCADE,
  renter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  owner_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_bookings TO authenticated;
GRANT ALL ON public.rental_bookings TO service_role;
ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rental_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  rental_booking_id uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  utr text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rental_payouts TO authenticated;
GRANT ALL ON public.rental_payouts TO service_role;
ALTER TABLE public.rental_payouts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exchange_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.owners(id) ON DELETE CASCADE,
  entitlement_id uuid REFERENCES public.entitlements(id) ON DELETE SET NULL,
  requested_resort_id uuid REFERENCES public.resorts(id) ON DELETE SET NULL,
  window_start date,
  window_end date,
  status public.exchange_status NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_party_chk CHECK (num_nonnulls(member_id, owner_id) = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_requests TO authenticated;
GRANT ALL ON public.exchange_requests TO service_role;
ALTER TABLE public.exchange_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exchange_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.entitlements(id) ON DELETE CASCADE,
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  credits numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exchange_inventory TO authenticated;
GRANT ALL ON public.exchange_inventory TO service_role;
ALTER TABLE public.exchange_inventory ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exchange_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delta numeric(12,2) NOT NULL,
  reason text NOT NULL,
  request_id uuid REFERENCES public.exchange_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exchange_transactions TO authenticated;
GRANT ALL ON public.exchange_transactions TO service_role;
ALTER TABLE public.exchange_transactions ENABLE ROW LEVEL SECURITY;

-- ============ PLATFORM ============
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.document_kind NOT NULL DEFAULT 'other',
  title text NOT NULL,
  storage_path text NOT NULL,
  related_table text,
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'in_app',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text,
  status public.ticket_status NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resort_id uuid REFERENCES public.resorts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY "entitlements_read" ON public.entitlements FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR owner_id = public.current_owner_id()
      OR public.has_permission(auth.uid(), 'bookings.read'));
CREATE POLICY "entitlements_admin_write" ON public.entitlements FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'bookings.override'))
  WITH CHECK (public.has_permission(auth.uid(), 'bookings.override'));

CREATE POLICY "entitlement_ledger_read" ON public.entitlement_ledger FOR SELECT TO authenticated
  USING (public.owns_entitlement(entitlement_id) OR public.has_permission(auth.uid(), 'bookings.read'));
CREATE POLICY "points_ledger_read" ON public.points_ledger FOR SELECT TO authenticated
  USING (public.owns_entitlement(entitlement_id) OR public.has_permission(auth.uid(), 'bookings.read'));

CREATE POLICY "reservations_read" ON public.reservations FOR SELECT TO authenticated
  USING (booked_by = auth.uid() OR member_id = public.current_member_id()
      OR owner_id = public.current_owner_id()
      OR public.staff_can_access_resort(auth.uid(), resort_id)
      OR public.has_permission(auth.uid(), 'bookings.read'));
CREATE POLICY "reservations_admin_write" ON public.reservations FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'bookings.override'))
  WITH CHECK (public.has_permission(auth.uid(), 'bookings.override'));

CREATE POLICY "reservation_items_read" ON public.reservation_items FOR SELECT TO authenticated
  USING (public.can_see_reservation(reservation_id));
CREATE POLICY "reservation_guests_all" ON public.reservation_guests FOR ALL TO authenticated
  USING (public.can_see_reservation(reservation_id))
  WITH CHECK (public.can_see_reservation(reservation_id));
CREATE POLICY "cancellations_read" ON public.cancellations FOR SELECT TO authenticated
  USING (public.can_see_reservation(reservation_id));

CREATE POLICY "maintenance_fees_read" ON public.maintenance_fees FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR owner_id = public.current_owner_id()
      OR public.has_permission(auth.uid(), 'finance.read'));
CREATE POLICY "maintenance_fees_write" ON public.maintenance_fees FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.read'))
  WITH CHECK (public.has_permission(auth.uid(), 'finance.read'));

CREATE POLICY "payments_read" ON public.payments FOR SELECT TO authenticated
  USING (payer_id = auth.uid() OR public.has_permission(auth.uid(), 'finance.read'));
CREATE POLICY "payment_transactions_read" ON public.payment_transactions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.read'));
CREATE POLICY "invoices_read" ON public.invoices FOR SELECT TO authenticated
  USING (payer_id = auth.uid() OR public.has_permission(auth.uid(), 'finance.read'));
CREATE POLICY "refunds_read" ON public.refunds FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.read'));

CREATE POLICY "rental_listings_read" ON public.rental_listings FOR SELECT TO authenticated
  USING (status = 'listed' OR owner_id = public.current_owner_id()
      OR public.has_permission(auth.uid(), 'owners.read'));
CREATE POLICY "rental_listings_owner_write" ON public.rental_listings FOR ALL TO authenticated
  USING (owner_id = public.current_owner_id() OR public.has_permission(auth.uid(), 'owners.write'))
  WITH CHECK (owner_id = public.current_owner_id() OR public.has_permission(auth.uid(), 'owners.write'));

CREATE POLICY "rental_bookings_read" ON public.rental_bookings FOR SELECT TO authenticated
  USING (renter_id = auth.uid() OR public.has_permission(auth.uid(), 'owners.read')
      OR EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.owner_id = public.current_owner_id()));
CREATE POLICY "rental_payouts_read" ON public.rental_payouts FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id() OR public.has_permission(auth.uid(), 'finance.read'));

CREATE POLICY "exchange_requests_own" ON public.exchange_requests FOR ALL TO authenticated
  USING (member_id = public.current_member_id() OR owner_id = public.current_owner_id()
      OR public.has_permission(auth.uid(), 'bookings.read'))
  WITH CHECK (member_id = public.current_member_id() OR owner_id = public.current_owner_id()
      OR public.has_permission(auth.uid(), 'bookings.override'));
CREATE POLICY "exchange_inventory_read" ON public.exchange_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "exchange_transactions_read" ON public.exchange_transactions FOR SELECT TO authenticated
  USING (party_user_id = auth.uid() OR public.has_permission(auth.uid(), 'finance.read'));

CREATE POLICY "documents_read" ON public.documents FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "tickets_own" ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR assigned_to = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "tickets_insert_own" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "tickets_update" ON public.support_tickets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR assigned_to = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR assigned_to = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "ticket_messages_read" ON public.ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
        AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid() OR public.is_super_admin(auth.uid()))));
CREATE POLICY "ticket_messages_insert" ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
        AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid() OR public.is_super_admin(auth.uid()))));

CREATE POLICY "audit_logs_read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.read'));
CREATE POLICY "system_settings_read" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_settings_write" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.write'));

-- ============ TRIGGERS ============
CREATE TRIGGER entitlements_updated BEFORE UPDATE ON public.entitlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER reservations_updated BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER maintenance_fees_updated BEFORE UPDATE ON public.maintenance_fees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER rental_listings_updated BEFORE UPDATE ON public.rental_listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER exchange_requests_updated BEFORE UPDATE ON public.exchange_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER support_tickets_updated BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER system_settings_updated BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ DEFAULT SETTINGS ============
INSERT INTO public.system_settings (key, value, description) VALUES
  ('cancellation_policy','[{"min_days":60,"entitlement_restored_pct":100,"refund_pct":100},{"min_days":30,"entitlement_restored_pct":50,"refund_pct":50},{"min_days":0,"entitlement_restored_pct":0,"refund_pct":0}]','Tiered cancellation policy by days before check-in'),
  ('maintenance_defaults','{"grace_days":30,"late_fee_pct":2,"blocks_booking":true}','Default maintenance fee behaviour'),
  ('rental_commission_pct','20','Default platform commission on rentals'),
  ('booking_hold_minutes','15','Minutes an unpaid reservation holds inventory');
