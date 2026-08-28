-- ====================================================================================================
-- Admin support: role management and automatic availability for new units.
-- ====================================================================================================

-- ============ ROLE MANAGEMENT ============
-- Only a super admin (or the service role) may change roles. Granting SUPER_ADMIN
-- from the UI is deliberately possible, but the FIRST super admin must be created
-- with the SQL snippet in the comment below, because nobody can grant it yet.
--
--   insert into public.user_roles (user_id, role)
--   select id, 'SUPER_ADMIN' from auth.users where email = 'you@example.com'
--   on conflict do nothing;

CREATE OR REPLACE FUNCTION public.admin_set_role(
  _user_id uuid,
  _role public.app_role,
  _grant boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_roles text[];
BEGIN
  IF v_actor IS NOT NULL AND NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Only a super admin can change roles' USING ERRCODE = '42501';
  END IF;

  -- Refuse to remove the last super admin, which would lock everyone out.
  IF NOT _grant AND _role = 'SUPER_ADMIN' THEN
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'SUPER_ADMIN') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the only super admin' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = _role;
  END IF;

  SELECT array_agg(ur.role::text ORDER BY ur.role::text) INTO v_roles
  FROM public.user_roles ur WHERE ur.user_id = _user_id;

  RETURN jsonb_build_object('userId', _user_id, 'roles', COALESCE(v_roles, ARRAY[]::text[]));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated, service_role;

-- ============ AVAILABILITY FOR NEW UNITS ============
-- A unit with no availability rows can never be booked, and the reason is not
-- obvious from the admin screen. Generating the calendar on insert removes that
-- whole class of "why is this villa never bookable" problem.

CREATE OR REPLACE FUNCTION public.seed_unit_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.availability (resort_unit_id, stay_date, status)
  SELECT NEW.id, d::date, 'available'
  FROM generate_series(current_date, current_date + interval '12 months', interval '1 day') AS d
  ON CONFLICT (resort_unit_id, stay_date) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resort_units_seed_availability ON public.resort_units;
CREATE TRIGGER resort_units_seed_availability
  AFTER INSERT ON public.resort_units
  FOR EACH ROW EXECUTE FUNCTION public.seed_unit_availability();

-- Extends the calendar further out; the trigger only covers 12 months.
CREATE OR REPLACE FUNCTION public.extend_availability(_resort_id uuid, _through date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_added int;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_permission(v_actor, 'inventory.write') THEN
    RAISE EXCEPTION 'Not allowed to manage inventory' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.availability (resort_unit_id, stay_date, status)
  SELECT u.id, d::date, 'available'
  FROM public.resort_units u
  CROSS JOIN generate_series(current_date, _through, interval '1 day') AS d
  WHERE u.resort_id = _resort_id AND u.status = 'active'
  ON CONFLICT (resort_unit_id, stay_date) DO NOTHING;

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN jsonb_build_object('nightsAdded', v_added, 'through', _through);
END;
$$;

REVOKE ALL ON FUNCTION public.extend_availability(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_availability(uuid, date) TO authenticated, service_role;

-- ============ ADMIN READ ACCESS TO PROFILES / ROLES ============
-- The members screen needs to list people, which the baseline policies restrict
-- to "your own row or super admin". Staff with members.read should see them too.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'members.read')
  );

DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'members.read')
  );

DROP POLICY IF EXISTS "members_select_own" ON public.members;
CREATE POLICY "members_select_own" ON public.members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'members.read')
  );
