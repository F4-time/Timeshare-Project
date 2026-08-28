-- ====================================================================================================
-- Booking and inventory schema.
--
-- Restores the per-unit inventory model the build spec depends on, which the
-- clean-start migration dropped. Inventory is tracked per physical unit per night
-- so that double-booking is prevented by the database rather than by application
-- code, and so owner-allocated units remain expressible.
--
-- Every table here enables RLS *and* defines its policies. A table with RLS on and
-- no policy denies all access, including to its owner - that gap is what broke the
-- catalogue in the previous migration.
-- ====================================================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============ IDENTITY HELPERS ============
-- The clean baseline omitted these; RLS policies below resolve ownership through them.

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_member_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.owners WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_owner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_owner_id() TO authenticated, service_role;

-- ============ MEMBERSHIP PLANS: booking rules as real columns ============
-- benefits jsonb stays for presentation; the booking engine needs queryable columns.

ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS entitlement_kind public.entitlement_kind,
  ADD COLUMN IF NOT EXISTS booking_window_days int,
  ADD COLUMN IF NOT EXISTS resort_scope jsonb NOT NULL DEFAULT '{"scope":"all"}'::jsonb,
  ADD COLUMN IF NOT EXISTS min_stay_nights int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_stay_nights int NOT NULL DEFAULT 21;

UPDATE public.membership_plans
SET entitlement_kind = CASE WHEN annual_points IS NOT NULL THEN 'POINTS'::public.entitlement_kind
                            ELSE 'NIGHTS'::public.entitlement_kind END
WHERE entitlement_kind IS NULL;

UPDATE public.membership_plans
SET booking_window_days = COALESCE((benefits ->> 'booking_window_days')::int, 90)
WHERE booking_window_days IS NULL;

ALTER TABLE public.membership_plans
  ALTER COLUMN entitlement_kind SET NOT NULL,
  ALTER COLUMN entitlement_kind SET DEFAULT 'NIGHTS',
  ALTER COLUMN booking_window_days SET NOT NULL,
  ALTER COLUMN booking_window_days SET DEFAULT 90;

-- ============ MEMBERSHIP CONTRACTS ============
CREATE TABLE IF NOT EXISTS public.membership_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  contract_number text NOT NULL UNIQUE,
  status public.contract_status NOT NULL DEFAULT 'draft',
  start_date date NOT NULL DEFAULT current_date,
  end_date date,
  price_paid numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_contracts TO authenticated;
GRANT ALL ON public.membership_contracts TO service_role;
ALTER TABLE public.membership_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membership_contracts_select_own" ON public.membership_contracts FOR SELECT
  TO authenticated USING (
    member_id = public.current_member_id() OR public.has_permission(auth.uid(), 'members.read')
  );
CREATE POLICY "membership_contracts_write_admin" ON public.membership_contracts FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'members.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'members.write'));

-- Link entitlements to the contract that produced them.
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS membership_contract_id uuid REFERENCES public.membership_contracts(id) ON DELETE SET NULL;

-- ============ INVENTORY ============
CREATE TABLE IF NOT EXISTS public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  name text NOT NULL,
  floors int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.buildings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.buildings TO authenticated;
GRANT ALL ON public.buildings TO service_role;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  max_adults int NOT NULL DEFAULT 2,
  max_children int NOT NULL DEFAULT 2,
  base_points_per_night numeric(10,2) NOT NULL DEFAULT 0,
  base_nightly_fee numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resort_id, code)
);
GRANT SELECT ON public.room_types TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.room_types TO authenticated;
GRANT ALL ON public.room_types TO service_role;
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.resort_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE RESTRICT,
  unit_number text NOT NULL,
  floor int,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resort_id, unit_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_units TO authenticated;
GRANT ALL ON public.resort_units TO service_role;
ALTER TABLE public.resort_units ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  points_multiplier numeric(6,3) NOT NULL DEFAULT 1.0,
  CONSTRAINT seasons_dates_chk CHECK (end_date >= start_date)
);
GRANT SELECT ON public.seasons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.blackouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid REFERENCES public.resorts(id) ON DELETE CASCADE,
  room_type_id uuid REFERENCES public.room_types(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  applies_to text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blackouts_dates_chk CHECK (end_date >= start_date)
);
GRANT SELECT ON public.blackouts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blackouts TO authenticated;
GRANT ALL ON public.blackouts TO service_role;
ALTER TABLE public.blackouts ENABLE ROW LEVEL SECURITY;

-- ============ RESERVATIONS ============
CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE
    DEFAULT ('FT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
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
CREATE INDEX IF NOT EXISTS reservations_member_idx ON public.reservations (member_id, check_in);
CREATE INDEX IF NOT EXISTS reservations_resort_idx ON public.reservations (resort_id, check_in);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- ============ AVAILABILITY (one row per unit per night) ============
CREATE TABLE IF NOT EXISTS public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_unit_id uuid NOT NULL REFERENCES public.resort_units(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  status public.inventory_status NOT NULL DEFAULT 'available',
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resort_unit_id, stay_date)
);
CREATE INDEX IF NOT EXISTS availability_date_idx ON public.availability (stay_date, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- ============ RESERVATION ITEMS ============
-- The exclusion constraint is the real double-booking guard: two active items can
-- never overlap on the same unit, regardless of what the application does.
CREATE TABLE IF NOT EXISTS public.reservation_items (
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

CREATE TABLE IF NOT EXISTS public.reservation_guests (
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

CREATE TABLE IF NOT EXISTS public.cancellations (
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
GRANT SELECT, INSERT ON public.cancellations TO authenticated;
GRANT ALL ON public.cancellations TO service_role;
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;

-- ============ MAINTENANCE FEES ============
CREATE TABLE IF NOT EXISTS public.maintenance_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.owners(id) ON DELETE CASCADE,
  membership_contract_id uuid REFERENCES public.membership_contracts(id) ON DELETE SET NULL,
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

-- ============ VISIBILITY HELPER ============
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

CREATE OR REPLACE FUNCTION public.entitlement_balance(_entitlement_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT SUM(delta) FROM public.entitlement_ledger WHERE entitlement_id = _entitlement_id), 0)
       + COALESCE((SELECT SUM(delta) FROM public.points_ledger      WHERE entitlement_id = _entitlement_id), 0);
$$;
REVOKE ALL ON FUNCTION public.entitlement_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entitlement_balance(uuid) TO authenticated, service_role;

-- ============ POLICIES: PUBLIC CATALOGUE ============
CREATE POLICY "buildings_read_all"  ON public.buildings  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "room_types_read_all" ON public.room_types FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "seasons_read_all"    ON public.seasons    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "buildings_write_admin" ON public.buildings FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));
CREATE POLICY "room_types_write_admin" ON public.room_types FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));
CREATE POLICY "seasons_write_admin" ON public.seasons FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

-- ============ POLICIES: OPERATIONAL INVENTORY ============
-- Units, availability and blackouts are staff-facing; guests never read them directly,
-- they see computed availability through the booking API.
CREATE POLICY "resort_units_read_staff" ON public.resort_units FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.read')
      OR public.staff_can_access_resort(auth.uid(), resort_id));
CREATE POLICY "resort_units_write_admin" ON public.resort_units FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

CREATE POLICY "availability_read_staff" ON public.availability FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.read')
      OR EXISTS (SELECT 1 FROM public.resort_units u
                 WHERE u.id = resort_unit_id
                   AND public.staff_can_access_resort(auth.uid(), u.resort_id)));
CREATE POLICY "availability_write_admin" ON public.availability FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

CREATE POLICY "blackouts_read_staff" ON public.blackouts FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.read'));
CREATE POLICY "blackouts_write_admin" ON public.blackouts FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

-- ============ POLICIES: RESERVATIONS ============
CREATE POLICY "reservations_select_own" ON public.reservations FOR SELECT TO authenticated
  USING (booked_by = auth.uid()
      OR member_id = public.current_member_id()
      OR owner_id = public.current_owner_id()
      OR public.staff_can_access_resort(auth.uid(), resort_id)
      OR public.has_permission(auth.uid(), 'bookings.read'));

-- Reservations are created by the server after validation, never written directly
-- by a member, so there is deliberately no INSERT policy for end users.
CREATE POLICY "reservations_write_staff" ON public.reservations FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'bookings.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'bookings.write'));

CREATE POLICY "reservation_items_select" ON public.reservation_items FOR SELECT TO authenticated
  USING (public.can_see_reservation(reservation_id));
CREATE POLICY "reservation_items_write_staff" ON public.reservation_items FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'bookings.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'bookings.write'));

CREATE POLICY "reservation_guests_select" ON public.reservation_guests FOR SELECT TO authenticated
  USING (public.can_see_reservation(reservation_id));
CREATE POLICY "reservation_guests_write" ON public.reservation_guests FOR ALL TO authenticated
  USING (public.can_see_reservation(reservation_id))
  WITH CHECK (public.can_see_reservation(reservation_id));

CREATE POLICY "cancellations_select" ON public.cancellations FOR SELECT TO authenticated
  USING (public.can_see_reservation(reservation_id));
CREATE POLICY "cancellations_insert" ON public.cancellations FOR INSERT TO authenticated
  WITH CHECK (public.can_see_reservation(reservation_id));

-- ============ POLICIES: MAINTENANCE FEES ============
CREATE POLICY "maintenance_fees_select_own" ON public.maintenance_fees FOR SELECT TO authenticated
  USING (member_id = public.current_member_id()
      OR owner_id = public.current_owner_id()
      OR public.has_permission(auth.uid(), 'finance.read'));
CREATE POLICY "maintenance_fees_write_admin" ON public.maintenance_fees FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.read'))
  WITH CHECK (public.has_permission(auth.uid(), 'finance.read'));

-- ============ TRIGGERS ============
CREATE TRIGGER membership_contracts_set_updated_at BEFORE UPDATE ON public.membership_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER resort_units_set_updated_at BEFORE UPDATE ON public.resort_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER reservations_set_updated_at BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER maintenance_fees_set_updated_at BEFORE UPDATE ON public.maintenance_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
