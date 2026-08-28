-- ====================================================================================================
-- FOREVER TIMESHARE - DATABASE MIGRATION (CLEAN START)
-- Complete setup for login tracking, user management, and timeshare operations
-- ====================================================================================================
-- Generated: 2026-08-27
-- This version drops all existing tables and starts fresh
-- ====================================================================================================

-- ============ DROP ALL EXISTING TABLES (if they exist) ============
DROP TABLE IF EXISTS public.login_sessions CASCADE;
DROP TABLE IF EXISTS public.entitlement_ledger CASCADE;
DROP TABLE IF EXISTS public.points_ledger CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.membership_plans CASCADE;
DROP TABLE IF EXISTS public.resorts CASCADE;
DROP TABLE IF EXISTS public.owners CASCADE;
DROP TABLE IF EXISTS public.members CASCADE;
DROP TABLE IF EXISTS public.staff_resorts CASCADE;
DROP TABLE IF EXISTS public.staff CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.permissions CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.entitlements CASCADE;

-- ============ DROP EXISTING TYPES (if they exist) ============
DROP TYPE IF EXISTS public.ticket_status CASCADE;
DROP TYPE IF EXISTS public.document_kind CASCADE;
DROP TYPE IF EXISTS public.exchange_status CASCADE;
DROP TYPE IF EXISTS public.listing_status CASCADE;
DROP TYPE IF EXISTS public.payment_purpose CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.fee_status CASCADE;
DROP TYPE IF EXISTS public.inventory_status CASCADE;
DROP TYPE IF EXISTS public.reservation_status CASCADE;
DROP TYPE IF EXISTS public.entitlement_status CASCADE;
DROP TYPE IF EXISTS public.entitlement_kind CASCADE;
DROP TYPE IF EXISTS public.contract_status CASCADE;
DROP TYPE IF EXISTS public.account_status CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- ============ DROP EXISTING FUNCTIONS (if they exist) ============
DROP FUNCTION IF EXISTS public.update_profile_last_login() CASCADE;
DROP FUNCTION IF EXISTS public.update_session_duration() CASCADE;
DROP FUNCTION IF EXISTS public.admin_login_stats_by_date(date, date) CASCADE;
DROP FUNCTION IF EXISTS public.admin_user_login_analytics(date, date) CASCADE;
DROP FUNCTION IF EXISTS public.admin_list_login_sessions(uuid, int, int) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.staff_can_access_resort(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

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
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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

-- ============ OWNERS ============
CREATE TABLE public.owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_code text NOT NULL UNIQUE,
  status public.account_status NOT NULL DEFAULT 'pending',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owners TO authenticated;
GRANT ALL ON public.owners TO service_role;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

-- ============ RESORTS ============
CREATE TABLE public.resorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  description text,
  location text,
  country text,
  coordinates jsonb DEFAULT '{"lat": 0, "lng": 0}'::jsonb,
  image_url text,
  website_url text,
  amenities jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resorts_slug ON public.resorts(slug);
GRANT SELECT ON public.resorts TO anon, authenticated;
GRANT ALL ON public.resorts TO service_role;
ALTER TABLE public.resorts ENABLE ROW LEVEL SECURITY;

-- ============ MEMBERSHIP PLANS ============
CREATE TABLE public.membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  duration_years int NOT NULL DEFAULT 1,
  annual_points numeric(12, 2),
  annual_nights numeric(12, 2),
  maintenance_fee numeric(12, 2),
  benefits jsonb DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.membership_plans TO anon, authenticated;
GRANT ALL ON public.membership_plans TO service_role;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_table, entity_id);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============ ENTITLEMENTS ============
CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.owners(id) ON DELETE CASCADE,
  kind public.entitlement_kind NOT NULL,
  year int NOT NULL,
  total_units numeric(12,2) NOT NULL DEFAULT 0,
  status public.entitlement_status NOT NULL DEFAULT 'available',
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- ============ ENTITLEMENT LEDGERS ============
CREATE TABLE public.entitlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.entitlements(id) ON DELETE CASCADE,
  delta numeric(12,2) NOT NULL,
  reason text NOT NULL,
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
  actor_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

-- ============ LOGIN SESSIONS (Login Tracking) ============
CREATE TABLE public.login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  ip_address text,
  user_agent text,
  session_duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_sessions_user ON public.login_sessions(user_id);
CREATE INDEX idx_login_sessions_login_at ON public.login_sessions(login_at);

GRANT SELECT ON public.login_sessions TO authenticated;
GRANT ALL ON public.login_sessions TO service_role;
ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

-- ============ LOGIN SESSIONS RLS POLICIES ============
CREATE POLICY "login_sessions_super_admin" ON public.login_sessions FOR SELECT
  TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE POLICY "login_sessions_own" ON public.login_sessions FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- ============ LOGIN TRACKING FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.admin_list_login_sessions(
  _user_id uuid DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  login_at timestamptz,
  logout_at timestamptz,
  ip_address text,
  user_agent text,
  session_duration_seconds integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ls.id,
    ls.user_id,
    p.email,
    p.full_name,
    ls.login_at,
    ls.logout_at,
    ls.ip_address,
    ls.user_agent,
    ls.session_duration_seconds
  FROM public.login_sessions ls
  JOIN public.profiles p ON p.id = ls.user_id
  WHERE public.is_super_admin(auth.uid())
    AND (_user_id IS NULL OR ls.user_id = _user_id)
  ORDER BY ls.login_at DESC
  LIMIT _limit
  OFFSET _offset;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_login_analytics(
  _from_date date DEFAULT CURRENT_DATE - 30,
  _to_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  login_count bigint,
  avg_session_duration_seconds numeric,
  first_login timestamptz,
  last_login timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.email,
    p.full_name,
    COUNT(*)::bigint as login_count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(ls.logout_at, NOW()) - ls.login_at)))::numeric as avg_session_duration_seconds,
    MIN(ls.login_at)::timestamptz as first_login,
    MAX(ls.login_at)::timestamptz as last_login
  FROM public.profiles p
  LEFT JOIN public.login_sessions ls ON ls.user_id = p.id
    AND DATE(ls.login_at) BETWEEN _from_date AND _to_date
  WHERE public.is_super_admin(auth.uid())
  GROUP BY p.id, p.email, p.full_name
  ORDER BY login_count DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_login_stats_by_date(
  _from_date date DEFAULT CURRENT_DATE - 30,
  _to_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  date date,
  total_logins bigint,
  unique_users bigint,
  avg_session_duration_seconds numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    DATE(ls.login_at)::date as date,
    COUNT(*)::bigint as total_logins,
    COUNT(DISTINCT ls.user_id)::bigint as unique_users,
    AVG(EXTRACT(EPOCH FROM (COALESCE(ls.logout_at, NOW()) - ls.login_at)))::numeric as avg_session_duration_seconds
  FROM public.login_sessions ls
  WHERE public.is_super_admin(auth.uid())
    AND DATE(ls.login_at) BETWEEN _from_date AND _to_date
  GROUP BY DATE(ls.login_at)
  ORDER BY DATE(ls.login_at) DESC;
$$;

-- ============ TRIGGER: Update session duration on logout ============
CREATE OR REPLACE FUNCTION public.update_session_duration()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.logout_at IS NOT NULL AND OLD.logout_at IS NULL THEN
    NEW.session_duration_seconds := EXTRACT(EPOCH FROM (NEW.logout_at - NEW.login_at))::integer;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER login_sessions_update_duration
  BEFORE UPDATE ON public.login_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_session_duration();

-- ============ TRIGGER: Update last_login_at in profiles ============
CREATE OR REPLACE FUNCTION public.update_profile_last_login()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = NEW.login_at
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER login_sessions_update_last_login
  AFTER INSERT ON public.login_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_last_login();

-- ============ POLICIES ============
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid()));

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
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "staff_resorts_select" ON public.staff_resorts FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "members_select_own" ON public.members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "owners_select_own" ON public.owners FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- ============ TRIGGERS ============
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER members_set_updated_at BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER owners_set_updated_at BEFORE UPDATE ON public.owners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER resorts_set_updated_at BEFORE UPDATE ON public.resorts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER membership_plans_set_updated_at BEFORE UPDATE ON public.membership_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER entitlements_set_updated_at BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'MEMBER') ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SEED CATALOGUES ============
INSERT INTO public.roles (key, label, description) VALUES
  ('MEMBER','Member','Holds a membership and books holidays'),
  ('OWNER','Owner','Owns timeshare inventory, weeks, units or points'),
  ('RESORT_STAFF','Resort Staff','Operates one or more assigned resorts'),
  ('ADMIN_STAFF','Admin Staff','Platform staff scoped by permissions'),
  ('SUPER_ADMIN','Super Admin','Full platform control')
ON CONFLICT DO NOTHING;

INSERT INTO public.permissions (key, label, perm_group) VALUES
  ('members.read','View members','members'),
  ('members.write','Manage members','members'),
  ('owners.read','View owners','owners'),
  ('owners.write','Manage owners','owners'),
  ('staff.read','View staff','staff'),
  ('staff.write','Manage staff','staff'),
  ('admin.login_tracking','View login analytics','admin'),
  ('inventory.read','View inventory','inventory'),
  ('inventory.write','Manage inventory','inventory'),
  ('bookings.read','View bookings','bookings'),
  ('bookings.write','Manage bookings','bookings'),
  ('payments.read','View payments','payments'),
  ('payments.write','Process payments','payments'),
  ('reports.read','View reports','reports'),
  ('audit.read','View audit logs','audit')
ON CONFLICT DO NOTHING;

-- Assign permissions to roles
INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'SUPER_ADMIN'::public.app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('ADMIN_STAFF'::public.app_role, 'members.read'),
  ('ADMIN_STAFF'::public.app_role, 'members.write'),
  ('ADMIN_STAFF'::public.app_role, 'owners.read'),
  ('ADMIN_STAFF'::public.app_role, 'owners.write'),
  ('ADMIN_STAFF'::public.app_role, 'staff.read'),
  ('ADMIN_STAFF'::public.app_role, 'inventory.read'),
  ('ADMIN_STAFF'::public.app_role, 'bookings.read'),
  ('ADMIN_STAFF'::public.app_role, 'payments.read'),
  ('ADMIN_STAFF'::public.app_role, 'reports.read'),
  ('ADMIN_STAFF'::public.app_role, 'admin.login_tracking'),
  ('RESORT_STAFF'::public.app_role, 'bookings.read'),
  ('RESORT_STAFF'::public.app_role, 'inventory.read'),
  ('MEMBER'::public.app_role, 'bookings.read'),
  ('OWNER'::public.app_role, 'inventory.read')
ON CONFLICT DO NOTHING;

-- ============ MIGRATION COMPLETE ============
