
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('MEMBER','OWNER','RESORT_STAFF','ADMIN_STAFF','SUPER_ADMIN');
CREATE TYPE public.account_status AS ENUM ('pending','active','suspended','closed');
CREATE TYPE public.contract_status AS ENUM ('draft','active','expired','terminated','transferred');
CREATE TYPE public.entitlement_kind AS ENUM ('NIGHTS','WEEK','POINTS');
CREATE TYPE public.entitlement_status AS ENUM ('available','held','consumed','expired','deposited');
CREATE TYPE public.reservation_status AS ENUM ('pending','confirmed','checked_in','completed','cancelled','no_show');
CREATE TYPE public.inventory_status AS ENUM ('available','held','booked','owner_allocated','blocked','maintenance');
CREATE TYPE public.fee_status AS ENUM ('pending','partial','paid','overdue','waived');
CREATE TYPE public.payment_status AS ENUM ('created','authorized','captured','failed','refunded','partially_refunded');
CREATE TYPE public.payment_purpose AS ENUM ('membership','maintenance','booking','rental','exchange','other');
CREATE TYPE public.listing_status AS ENUM ('draft','listed','reserved','completed','withdrawn');
CREATE TYPE public.exchange_status AS ENUM ('requested','approved','matched','fulfilled','rejected','cancelled');
CREATE TYPE public.document_kind AS ENUM ('agreement','invoice','confirmation','statement','kyc','other');
CREATE TYPE public.ticket_status AS ENUM ('open','in_progress','waiting','resolved','closed');

-- ============ SHARED TRIGGER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  status public.account_status NOT NULL DEFAULT 'active',
  locale text NOT NULL DEFAULT 'en-IN',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ ROLES / PERMISSIONS ============
CREATE TABLE public.roles (
  key public.app_role PRIMARY KEY,
  label text NOT NULL,
  description text
);
GRANT SELECT ON public.roles TO anon, authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.permissions (
  key text PRIMARY KEY,
  label text NOT NULL,
  perm_group text NOT NULL
);
GRANT SELECT ON public.permissions TO anon, authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key public.app_role NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  UNIQUE (role_key, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'SUPER_ADMIN');
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'SUPER_ADMIN') OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_key = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _permission
  );
$$;

-- ============ STAFF ============
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code text UNIQUE,
  department text,
  title text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_resorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  resort_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, resort_id)
);
GRANT SELECT ON public.staff_resorts TO authenticated;
GRANT ALL ON public.staff_resorts TO service_role;
ALTER TABLE public.staff_resorts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.staff_can_access_resort(_user_id uuid, _resort_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'SUPER_ADMIN')
      OR public.has_role(_user_id, 'ADMIN_STAFF')
      OR EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_resorts sr ON sr.staff_id = s.id
        WHERE s.user_id = _user_id AND s.active AND sr.resort_id = _resort_id
      );
$$;

-- ============ POLICIES ============
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'members.read'));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "roles_read_all" ON public.roles FOR SELECT USING (true);
CREATE POLICY "permissions_read_all" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "role_permissions_read" ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "staff_select" ON public.staff FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'staff.read'));
CREATE POLICY "staff_resorts_select" ON public.staff_resorts FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid()
  ));

-- ============ TRIGGERS ============
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id,
          NEW.raw_user_meta_data ->> 'full_name',
          NEW.email,
          NEW.raw_user_meta_data ->> 'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'MEMBER') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SEED CATALOGUES ============
INSERT INTO public.roles (key, label, description) VALUES
  ('MEMBER','Member','Holds a membership and books holidays'),
  ('OWNER','Owner','Owns timeshare inventory, weeks, units or points'),
  ('RESORT_STAFF','Resort Staff','Operates one or more assigned resorts'),
  ('ADMIN_STAFF','Admin Staff','Platform staff scoped by permissions'),
  ('SUPER_ADMIN','Super Admin','Full platform control');

INSERT INTO public.permissions (key, label, perm_group) VALUES
  ('members.read','View members','members'),
  ('members.write','Manage members','members'),
  ('owners.read','View owners','owners'),
  ('owners.write','Manage owners','owners'),
  ('plans.write','Manage membership plans','plans'),
  ('inventory.read','View inventory','inventory'),
  ('inventory.write','Manage inventory','inventory'),
  ('bookings.read','View bookings','bookings'),
  ('bookings.override','Override booking rules','bookings'),
  ('finance.read','View financial data','finance'),
  ('finance.refund','Issue refunds','finance'),
  ('staff.read','View staff','staff'),
  ('settings.write','Manage settings','settings'),
  ('audit.read','Read audit logs','audit');
