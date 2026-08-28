
-- ============ MEMBERS ============
CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  member_code text NOT NULL UNIQUE,
  status public.account_status NOT NULL DEFAULT 'pending',
  joined_at date NOT NULL DEFAULT current_date,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  kyc_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_member_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated, service_role;

CREATE TABLE public.member_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relation text,
  dob date,
  is_nominee boolean NOT NULL DEFAULT false,
  id_proof_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_family TO authenticated;
GRANT ALL ON public.member_family TO service_role;
ALTER TABLE public.member_family ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.member_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind public.document_kind NOT NULL DEFAULT 'other',
  title text NOT NULL,
  storage_path text NOT NULL,
  issued_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_documents TO authenticated;
GRANT ALL ON public.member_documents TO service_role;
ALTER TABLE public.member_documents ENABLE ROW LEVEL SECURITY;

-- ============ OWNERS ============
CREATE TABLE public.owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_code text NOT NULL UNIQUE,
  status public.account_status NOT NULL DEFAULT 'pending',
  payout_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owners TO authenticated;
GRANT ALL ON public.owners TO service_role;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.owners WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_owner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_owner_id() TO authenticated, service_role;

-- ============ RESORTS / INVENTORY ============
CREATE TABLE public.resorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  city text,
  state text,
  country text NOT NULL DEFAULT 'India',
  description text,
  hero_image_url text,
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  lat numeric(9,6),
  lng numeric(9,6),
  status text NOT NULL DEFAULT 'draft',
  check_in_time time NOT NULL DEFAULT '14:00',
  check_out_time time NOT NULL DEFAULT '11:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.resorts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resorts TO authenticated;
GRANT ALL ON public.resorts TO service_role;
ALTER TABLE public.resorts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_resorts
  ADD CONSTRAINT staff_resorts_resort_fk FOREIGN KEY (resort_id) REFERENCES public.resorts(id) ON DELETE CASCADE;

CREATE TABLE public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  name text NOT NULL,
  floors int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.buildings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buildings TO authenticated;
GRANT ALL ON public.buildings TO service_role;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.room_types (
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
GRANT SELECT ON public.room_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_types TO authenticated;
GRANT ALL ON public.room_types TO service_role;
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.resort_units (
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

CREATE TABLE public.resort_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  label text NOT NULL,
  icon text
);
GRANT SELECT ON public.resort_amenities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_amenities TO authenticated;
GRANT ALL ON public.resort_amenities TO service_role;
ALTER TABLE public.resort_amenities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  points_multiplier numeric(6,3) NOT NULL DEFAULT 1.0
);
GRANT SELECT ON public.seasons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.blackouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id uuid REFERENCES public.resorts(id) ON DELETE CASCADE,
  room_type_id uuid REFERENCES public.room_types(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  applies_to text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blackouts TO authenticated;
GRANT ALL ON public.blackouts TO service_role;
ALTER TABLE public.blackouts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_unit_id uuid NOT NULL REFERENCES public.resort_units(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  status public.inventory_status NOT NULL DEFAULT 'available',
  reservation_id uuid,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resort_unit_id, stay_date)
);
CREATE INDEX availability_date_idx ON public.availability (stay_date, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- ============ OWNERSHIP ============
CREATE TABLE public.ownership_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  contract_number text NOT NULL UNIQUE,
  resort_id uuid REFERENCES public.resorts(id) ON DELETE SET NULL,
  status public.contract_status NOT NULL DEFAULT 'draft',
  start_date date NOT NULL DEFAULT current_date,
  end_date date,
  purchase_price numeric(12,2) NOT NULL DEFAULT 0,
  maintenance_base_fee numeric(12,2) NOT NULL DEFAULT 0,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_contracts TO authenticated;
GRANT ALL ON public.ownership_contracts TO service_role;
ALTER TABLE public.ownership_contracts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ownership_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.ownership_contracts(id) ON DELETE CASCADE,
  resort_unit_id uuid NOT NULL REFERENCES public.resort_units(id) ON DELETE RESTRICT,
  share_fraction numeric(6,4) NOT NULL DEFAULT 1.0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_units TO authenticated;
GRANT ALL ON public.ownership_units TO service_role;
ALTER TABLE public.ownership_units ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ownership_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.ownership_contracts(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  season text,
  nights int NOT NULL DEFAULT 7,
  is_floating boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_weeks TO authenticated;
GRANT ALL ON public.ownership_weeks TO service_role;
ALTER TABLE public.ownership_weeks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ownership_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.ownership_contracts(id) ON DELETE CASCADE,
  points_per_year int NOT NULL DEFAULT 0,
  anniversary_month int NOT NULL DEFAULT 1 CHECK (anniversary_month BETWEEN 1 AND 12)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_points TO authenticated;
GRANT ALL ON public.ownership_points TO service_role;
ALTER TABLE public.ownership_points ENABLE ROW LEVEL SECURITY;

-- ============ MEMBERSHIP PLANS ============
CREATE TABLE public.membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  tier text,
  entitlement_kind public.entitlement_kind NOT NULL DEFAULT 'NIGHTS',
  nights_per_year int,
  points_per_year int,
  booking_window_days int NOT NULL DEFAULT 90,
  term_years int,
  resort_scope jsonb NOT NULL DEFAULT '{"all": true}'::jsonb,
  price numeric(12,2) NOT NULL DEFAULT 0,
  maintenance_base_fee numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.membership_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_plans TO authenticated;
GRANT ALL ON public.membership_plans TO service_role;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.membership_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.membership_plans(id) ON DELETE CASCADE,
  label text NOT NULL,
  detail text,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.membership_benefits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_benefits TO authenticated;
GRANT ALL ON public.membership_benefits TO service_role;
ALTER TABLE public.membership_benefits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.membership_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.membership_plans(id) ON DELETE RESTRICT,
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

-- ============ POLICIES ============
-- public catalogue reads
CREATE POLICY "resorts_public_read" ON public.resorts FOR SELECT USING (status = 'published');
CREATE POLICY "resorts_staff_read" ON public.resorts FOR SELECT TO authenticated
  USING (public.staff_can_access_resort(auth.uid(), id));
CREATE POLICY "resorts_admin_write" ON public.resorts FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

CREATE POLICY "buildings_public_read" ON public.buildings FOR SELECT USING (true);
CREATE POLICY "buildings_admin_write" ON public.buildings FOR ALL TO authenticated
  USING (public.staff_can_access_resort(auth.uid(), resort_id))
  WITH CHECK (public.staff_can_access_resort(auth.uid(), resort_id));

CREATE POLICY "room_types_public_read" ON public.room_types FOR SELECT USING (true);
CREATE POLICY "room_types_admin_write" ON public.room_types FOR ALL TO authenticated
  USING (public.staff_can_access_resort(auth.uid(), resort_id))
  WITH CHECK (public.staff_can_access_resort(auth.uid(), resort_id));

CREATE POLICY "amenities_public_read" ON public.resort_amenities FOR SELECT USING (true);
CREATE POLICY "amenities_admin_write" ON public.resort_amenities FOR ALL TO authenticated
  USING (public.staff_can_access_resort(auth.uid(), resort_id))
  WITH CHECK (public.staff_can_access_resort(auth.uid(), resort_id));

CREATE POLICY "seasons_public_read" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "seasons_admin_write" ON public.seasons FOR ALL TO authenticated
  USING (public.staff_can_access_resort(auth.uid(), resort_id))
  WITH CHECK (public.staff_can_access_resort(auth.uid(), resort_id));

CREATE POLICY "units_staff_all" ON public.resort_units FOR ALL TO authenticated
  USING (public.staff_can_access_resort(auth.uid(), resort_id))
  WITH CHECK (public.staff_can_access_resort(auth.uid(), resort_id));
CREATE POLICY "units_member_read" ON public.resort_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "blackouts_read" ON public.blackouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "blackouts_staff_write" ON public.blackouts FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

CREATE POLICY "availability_read" ON public.availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "availability_staff_write" ON public.availability FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

-- members
CREATE POLICY "members_self_read" ON public.members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'members.read'));
CREATE POLICY "members_self_update" ON public.members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'members.write'))
  WITH CHECK (user_id = auth.uid() OR public.has_permission(auth.uid(), 'members.write'));
CREATE POLICY "members_admin_insert" ON public.members FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'members.write'));
CREATE POLICY "members_admin_delete" ON public.members FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'members.write'));

CREATE POLICY "member_family_own" ON public.member_family FOR ALL TO authenticated
  USING (member_id = public.current_member_id() OR public.has_permission(auth.uid(), 'members.write'))
  WITH CHECK (member_id = public.current_member_id() OR public.has_permission(auth.uid(), 'members.write'));

CREATE POLICY "member_documents_read" ON public.member_documents FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR public.has_permission(auth.uid(), 'members.read'));
CREATE POLICY "member_documents_write" ON public.member_documents FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'members.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'members.write'));

-- owners
CREATE POLICY "owners_self_read" ON public.owners FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'owners.read'));
CREATE POLICY "owners_self_update" ON public.owners FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'owners.write'))
  WITH CHECK (user_id = auth.uid() OR public.has_permission(auth.uid(), 'owners.write'));
CREATE POLICY "owners_admin_insert" ON public.owners FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'owners.write'));
CREATE POLICY "owners_admin_delete" ON public.owners FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'owners.write'));

CREATE POLICY "ownership_contracts_read" ON public.ownership_contracts FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id() OR public.has_permission(auth.uid(), 'owners.read'));
CREATE POLICY "ownership_contracts_write" ON public.ownership_contracts FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'owners.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'owners.write'));

CREATE POLICY "ownership_units_read" ON public.ownership_units FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ownership_contracts c WHERE c.id = contract_id
         AND (c.owner_id = public.current_owner_id() OR public.has_permission(auth.uid(), 'owners.read'))));
CREATE POLICY "ownership_units_write" ON public.ownership_units FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'owners.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'owners.write'));

CREATE POLICY "ownership_weeks_read" ON public.ownership_weeks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ownership_contracts c WHERE c.id = contract_id
         AND (c.owner_id = public.current_owner_id() OR public.has_permission(auth.uid(), 'owners.read'))));
CREATE POLICY "ownership_weeks_write" ON public.ownership_weeks FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'owners.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'owners.write'));

CREATE POLICY "ownership_points_read" ON public.ownership_points FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ownership_contracts c WHERE c.id = contract_id
         AND (c.owner_id = public.current_owner_id() OR public.has_permission(auth.uid(), 'owners.read'))));
CREATE POLICY "ownership_points_write" ON public.ownership_points FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'owners.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'owners.write'));

-- plans
CREATE POLICY "plans_public_read" ON public.membership_plans FOR SELECT USING (active = true);
CREATE POLICY "plans_admin_write" ON public.membership_plans FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'plans.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'plans.write'));

CREATE POLICY "benefits_public_read" ON public.membership_benefits FOR SELECT USING (true);
CREATE POLICY "benefits_admin_write" ON public.membership_benefits FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'plans.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'plans.write'));

CREATE POLICY "membership_contracts_read" ON public.membership_contracts FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR public.has_permission(auth.uid(), 'members.read'));
CREATE POLICY "membership_contracts_write" ON public.membership_contracts FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'members.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'members.write'));

-- ============ TRIGGERS ============
CREATE TRIGGER members_updated BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER member_family_updated BEFORE UPDATE ON public.member_family FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER owners_updated BEFORE UPDATE ON public.owners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER resorts_updated BEFORE UPDATE ON public.resorts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER resort_units_updated BEFORE UPDATE ON public.resort_units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER availability_updated BEFORE UPDATE ON public.availability FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ownership_contracts_updated BEFORE UPDATE ON public.ownership_contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER membership_plans_updated BEFORE UPDATE ON public.membership_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER membership_contracts_updated BEFORE UPDATE ON public.membership_contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
